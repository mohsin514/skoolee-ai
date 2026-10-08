import { randomUUID } from "node:crypto";
import { WorkflowStopped, type WorkflowContext } from "./outbox";
import { moduleFlags } from "../permissions";

/** Resolve current content and recipients in the fenced effect transaction, never from Redis. */
export async function reportWorkflow(ctx: WorkflowContext, announce?: (notices: Array<{ userId: string } & Record<string, unknown>>) => Promise<void>) {
  if (ctx.kind !== "REPORT_PUBLISHED") throw new WorkflowStopped("UNKNOWN_EVENT_KIND");
  const notices: Array<{ userId: string } & Record<string, unknown>> = [];
  const committed = await ctx.effect("published-in-app-notifications", async tx => {
    const exams = await tx.$queryRaw<{ title: string; campus_id: string; class_id: string; full_name: string; role: string }[]>`
      SELECT e.title,e.campus_id,e.class_id,u.full_name,u.role::text AS role FROM exams e
      JOIN users u ON u.id=${ctx.actorId} AND u.school_id=e.school_id
      JOIN schools s ON s.id=e.school_id
      WHERE e.id=${ctx.referenceId} AND e.school_id=${ctx.schoolId} AND e.status='PUBLISHED'
        AND u.is_active=true AND u.role IN ('SUPER_ADMIN','ADMIN','CAMPUS_ADMIN','PRINCIPAL')
        AND (u.role='SUPER_ADMIN' OR u.campus_id=e.campus_id)
        AND s.status NOT IN ('SUSPENDED','DELETED') AND s.deleted_at IS NULL
      FOR SHARE OF e,u,s`;
    const exam = exams[0];
    if (!exam) throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
    const overrides = await tx.$queryRaw<{ module: string; canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean }[]>`
      SELECT module,can_view AS "canView",can_add AS "canAdd",can_edit AS "canEdit",can_delete AS "canDelete"
      FROM role_permissions WHERE school_id=${ctx.schoolId} AND role::text=${exam.role} AND module='reports' FOR SHARE`;
    if (!moduleFlags(overrides, exam.role, "reports").canEdit) throw new WorkflowStopped("AUTHORIZATION_OR_PUBLICATION_REVOKED");
    const recipients = await tx.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT u.id FROM users u WHERE u.school_id=${ctx.schoolId} AND u.is_active=true AND u.id <> ${ctx.actorId}
        AND (u.role='SUPER_ADMIN' OR (u.campus_id=${exam.campus_id} AND u.role IN ('ADMIN','CAMPUS_ADMIN','PRINCIPAL'))
        OR EXISTS (SELECT 1 FROM classes c WHERE c.id=${exam.class_id} AND c.school_id=${ctx.schoolId} AND c.class_teacher_id=u.id)
        OR EXISTS (SELECT 1 FROM subjects s WHERE s.class_id=${exam.class_id} AND s.school_id=${ctx.schoolId} AND s.teacher_id=u.id))`;
    for (const recipient of recipients) {
      const created = await tx.$queryRaw<Array<{ userId: string } & Record<string, unknown>>>`INSERT INTO notifications (id,school_id,campus_id,user_id,type,title,message,icon,link,actor_id,actor_name)
        VALUES (${randomUUID()},${ctx.schoolId},${exam.campus_id},${recipient.id},'REPORT_CARDS_PUBLISHED','Report cards published',
          ${`Report cards for "${exam.title}" have been published`},'Award','/admin',${ctx.actorId},${exam.full_name})
        RETURNING id,user_id AS "userId",type,title,message,icon,link,actor_id AS "actorId",actor_name AS "actorName",is_read AS "isRead",created_at AS "createdAt"`;
      notices.push(...created);
    }
  });
  // Live hints are best effort; persisted inbox rows remain the source of truth.
  if (committed && announce) await announce(notices).catch(() => {});
}
