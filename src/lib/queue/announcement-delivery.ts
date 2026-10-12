import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { moduleFlags } from "@/lib/permissions";
import { sendEmailMessage } from "@/lib/email";
import { announcementEmailReady } from "@/lib/school-ai/announcements-service";
import { announcementLanguageSchema, announcementProposalSchema, type AnnouncementLanguage } from "@/lib/school-ai/announcements";
import { WorkflowStopped, type Sql, type WorkflowContext } from "./outbox";

const metadataSchema = z.strictObject({ recordId: z.string(), recordVersion: z.number().int().positive(), previewHash: z.string(), language: announcementLanguageSchema, proofs: z.array(z.strictObject({ relationshipId: z.string(), accessVersionId: z.string(), studentId: z.string(), classId: z.string(), relationshipUpdatedAt: z.string() })).min(1).max(1000) });
export type AnnouncementEmailAdapter = (message: { recipient: string; subject: string; body: string; language: AnnouncementLanguage }) => Promise<{ success: boolean; messageId?: string; error?: string }>;

/** Frozen plain text is delivered only after live actor, approval and guardian checks. */
export async function announcementDeliveryWorkflow(ctx: WorkflowContext, adapter?: AnnouncementEmailAdapter) {
  if (ctx.kind !== "SCHOOL_AI_ANNOUNCEMENT") throw new WorkflowStopped("UNKNOWN_EVENT_KIND");
  const communication = await prisma.parentCommunication.findFirst({ where: { id: ctx.referenceId, schoolId: ctx.schoolId, createdById: ctx.actorId, relatedType: "SCHOOL_AI_ANNOUNCEMENT", channel: "EMAIL" } });
  if (!communication) throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
  const parsed = metadataSchema.safeParse(communication.metadata);
  if (!parsed.success) throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
  const metadata = parsed.data;
  const authorize = async (db: Sql) => {
    const denied = () => { throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED"); };
    const actors = await db.$queryRaw<Array<{ role: string; campusId: string | null; active: boolean; status: string; lifecycle: string; graceEndsAt: Date | null }>>`SELECT u.role::text,u.campus_id AS "campusId",u.is_active AS active,s.status,s.subscription_lifecycle_state AS lifecycle,s.grace_ends_at AS "graceEndsAt" FROM users u JOIN schools s ON s.id=u.school_id WHERE u.id=${ctx.actorId} AND u.school_id=${ctx.schoolId}`;
    const actor = actors[0];
    if (!actor || !actor.active || !["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(actor.role) || actor.role !== "SUPER_ADMIN" && actor.campusId !== communication.campusId || !["ACTIVE", "TRIAL"].includes(actor.status) || actor.lifecycle === "PAST_DUE_GRACE" && actor.graceEndsAt && actor.graceEndsAt <= new Date()) denied();
    const grants = await db.$queryRaw<Array<{ module: string; canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean }>>`SELECT module,can_view AS "canView",can_add AS "canAdd",can_edit AS "canEdit",can_delete AS "canDelete" FROM role_permissions WHERE school_id=${ctx.schoolId} AND role::text=${actor.role}`;
    if (!moduleFlags(grants, actor.role, "ai").canEdit || !moduleFlags(grants, actor.role, "students").canView || !moduleFlags(grants, actor.role, "students").canEdit) denied();
    const records = await db.$queryRaw<Array<{ data: unknown }>>`SELECT r.data FROM school_ai_records r JOIN campuses c ON c.id=r.campus_id AND c.school_id=r.school_id WHERE r.id=${metadata.recordId} AND r.school_id=${ctx.schoolId} AND r.campus_id=${communication.campusId} AND r.kind='WORKFLOW' AND r.status='APPROVED' AND r.version=${metadata.recordVersion} AND r.approved_by_id IS NOT NULL AND c.archived_at IS NULL`;
    const proposal = announcementProposalSchema.safeParse((records[0]?.data as { proposal?: unknown } | undefined)?.proposal);
    if (!proposal.success) denied();
    if (!proposal.success) return;
    const message = proposal.data.messages[metadata.language];
    if (!message || message.subject !== communication.subject || message.body !== communication.body || communication.relatedId !== metadata.recordId || !communication.approvedData) denied();
    const proofs = await db.$queryRaw<Array<{ id: string; studentId: string; classId: string; email: string; preferredLanguage: string | null; permissions: unknown }>>(Prisma.sql`
      SELECT r.id,r.student_id AS "studentId",s.class_id AS "classId",r.email,g.preferred_language AS "preferredLanguage",v.permissions
      FROM guardian_relationships r JOIN users g ON g.id=r.guardian_user_id AND g.school_id=r.school_id
      JOIN students s ON s.id=r.student_id AND s.school_id=r.school_id AND s.campus_id=r.campus_id
      JOIN classes c ON c.id=s.class_id AND c.school_id=s.school_id AND c.campus_id=s.campus_id
      JOIN LATERAL (SELECT av.permissions FROM guardian_access_versions av WHERE av.relationship_id=r.id AND av.school_id=r.school_id AND av.effective_from<=(statement_timestamp() AT TIME ZONE 'UTC') AND (av.effective_until IS NULL OR av.effective_until>(statement_timestamp() AT TIME ZONE 'UTC')) ORDER BY av.effective_from DESC,av.created_at DESC,av.id DESC LIMIT 1) v ON true
      WHERE r.school_id=${ctx.schoolId} AND r.campus_id=${communication.campusId} AND r.guardian_user_id=${communication.parentUserId}
        AND r.id IN (${Prisma.join(metadata.proofs.map(proof => proof.relationshipId))}) AND r.status='ACTIVE' AND r.verified_at IS NOT NULL
        AND r.valid_from<=(statement_timestamp() AT TIME ZONE 'UTC') AND (r.valid_until IS NULL OR r.valid_until>(statement_timestamp() AT TIME ZONE 'UTC')) AND g.is_active=true AND g.role='PARENT'
        AND s.archived_at IS NULL AND lower(s.status)='active' AND c.archived_at IS NULL AND c.status='ACTIVE'`);
    const allowed = proofs.some(proof => {
      const snapshot = metadata.proofs.find(item => item.relationshipId === proof.id && item.studentId === proof.studentId && item.classId === proof.classId);
      if (!snapshot || !proposal.data.classIds.includes(proof.classId) || (proof.permissions as { communication?: unknown })?.communication !== true || proof.email.trim().toLocaleLowerCase("en-US") !== communication.recipient) return false;
      const preferred = announcementLanguageSchema.safeParse(proof.preferredLanguage);
      const language = preferred.success && proposal.data.messages[preferred.data] ? preferred.data : proposal.data.fallbackLanguage;
      return language === metadata.language;
    });
    if (!allowed) denied();
  };
  let externalStarted = false;
  try {
    await authorize(prisma);
    if (communication.status === "SENT") return;
    if (!adapter && !announcementEmailReady()) throw new WorkflowStopped("PROVIDER_UNAVAILABLE");
    await ctx.external(`announcement:${communication.id}`, authorize, async () => {
      externalStarted = true;
      const message = { recipient: communication.recipient, subject: communication.subject!, body: communication.body, language: metadata.language };
      const result = adapter ? await adapter(message) : await sendEmailMessage({ to: message.recipient, subject: message.subject, text: message.body, language: message.language });
      // A timeout or a success without a provider identity cannot prove whether
      // email was accepted. The outbox keeps this effect uncertain, never retries.
      if (!result.success || !result.messageId) throw new Error("ANNOUNCEMENT_PROVIDER_OUTCOME_UNCERTAIN");
      await prisma.parentCommunication.update({ where: { id: communication.id, schoolId: ctx.schoolId }, data: { status: "SENT", providerMessageId: result.messageId, sentAt: new Date(), failedReason: null } });
    });
  } catch (error) {
    const reason = externalStarted ? "EXTERNAL_OUTCOME_UNCERTAIN" : error instanceof WorkflowStopped ? error.reason : "WORKER_FAILURE";
    await prisma.parentCommunication.updateMany({ where: { id: communication.id, schoolId: ctx.schoolId, status: { not: "SENT" } }, data: { status: externalStarted ? "UNCERTAIN" : error instanceof WorkflowStopped ? "BLOCKED" : "PENDING", failedReason: reason } });
    throw error;
  }
}
