import { dashboardPathForRole } from "@/lib/roles";
import { getTenantContext, runWithTenantContext } from "@/lib/db/tenant-context";
import { createHash, randomUUID } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { prisma, tenantTransaction, type TxClient } from "@/lib/db/prisma";
import { assertPermission } from "@/lib/permissions";
import { ApiError } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { appendEvent, cancel, type Sql } from "@/lib/queue/outbox";
import { getPublishedVersion } from "@/lib/academic/report-versions";
import { reconcileCounts, attentionCount, publicFailureReason, publicJobResult, failureCategory, retryBlockReason, jobOperationSchema, type JobOperation } from "./contract";
import { authorizedGuardianCommunicationTargets } from "@/lib/auth/communication-policy";

export function jobTransaction<T>(
  user: AuthUser,
  fn: (tx: TxClient) => Promise<T>,
) {
  return runWithTenantContext(user, () => tenantTransaction(fn));
}
type Job = {
  campus_label?: string;
  id: string;
  school_id: string;
  campus_id: string;
  class_id: string | null;
  kind: string;
  source_id: string;
  source_label: string;
  created_at: Date;
  cancel_requested_at: Date | null;
};
export type Item = {
  id: string;
  reference_id: string;
  label: string;
  version_id: string | null;
  workflow_id: string | null;
  workflow_state: string | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: Date | null;
  communication_id: string | null;
  state: string;
  reason: string | null;
  channel: string | null;
  recipient: string | null;
  accepted_at: Date | null;
  delivered_at: Date | null;
  read_at: Date | null;
  delivery_failed_at: Date | null;
  updated_at: Date;
  uncertain: boolean;
  result: unknown;
};
export async function authorizeJob(user: AuthUser, job: Job, edit = false, db: TxClient = prisma) {
  const account = await db.user.findFirst({
    where: { id: user.userId, schoolId: user.schoolId, isActive: true },
    select: { role: true, campusId: true, accessVersion: true, school: { select: { status: true } } },
  });
  if (!account || account.role !== user.role || account.campusId !== user.campusId || account.accessVersion !== (user.accessVersion ?? 0) || account.school.status === "DELETED")
    throw new ApiError("Current job access is unavailable", 403);
  if (
    ["PARENT", "STUDENT", "APP_OWNER"].includes(user.role) ||
    job.school_id !== user.schoolId ||
    (user.role !== "SUPER_ADMIN" && job.campus_id !== user.campusId)
  )
    throw new ApiError("Job not found", 404);
  await assertPermission(
    user,
    job.kind === "IMPORT" ? "fees" : "reports",
    edit ? "edit" : "view",
    db,
  );
  if (user.role === "TEACHER") {
    const assigned =
      job.class_id &&
      (await db.class.findFirst({
        where: {
          id: job.class_id,
          schoolId: job.school_id,
          campusId: job.campus_id,
          OR: [
            { classTeacherId: user.userId },
            { subjects: { some: { teacherId: user.userId } } },
          ],
        },
        select: { id: true },
      }));
    if (!assigned) throw new ApiError("Job not found", 404);
  }
  if (edit) await assertSchoolOperational(user.schoolId, db);
}
export async function itemsFor(job: Job, db: Sql = prisma) {
  const rows = await db.$queryRaw<
    Item[]
  >`SELECT i.id,i.reference_id,i.label,i.version_id,i.workflow_id,i.communication_id,
    w.state AS workflow_state,COALESCE(w.attempts,0) AS attempts,COALESCE(w.max_attempts,0) AS max_attempts,w.next_attempt_at,
    CASE WHEN c.status='SENT' THEN 'completed' WHEN w.state='completed' THEN 'completed'
      WHEN w.state='cancelled' OR i.state='cancelled' THEN 'cancelled'
      WHEN w.state IN ('queued','retrying') THEN 'queued' WHEN w.state='running' THEN 'running'
      WHEN w.state='failed' OR c.status IN ('NO_RECIPIENT','BLOCKED','FAILED') THEN 'failed' ELSE i.state END AS state,
    COALESCE(w.reason,CASE WHEN c.status='NO_RECIPIENT' THEN 'MISSING_CONTACT' WHEN c.status='BLOCKED' THEN 'AUTHORIZATION_BLOCKED' ELSE i.reason END) AS reason,
    c.channel,c.recipient,CASE WHEN c.provider_message_id IS NOT NULL THEN c.sent_at ELSE NULL END AS accepted_at,i.result,
    (SELECT min(r.occurred_at) FROM delivery_receipts r WHERE c.channel='WHATSAPP' AND c.sent_at IS NOT NULL AND r.provider_message_id=c.provider_message_id AND r.communication_id=c.id AND r.school_id=i.school_id AND r.state='delivered') AS delivered_at,
    (SELECT min(r.occurred_at) FROM delivery_receipts r WHERE c.channel='WHATSAPP' AND c.sent_at IS NOT NULL AND r.provider_message_id=c.provider_message_id AND r.communication_id=c.id AND r.school_id=i.school_id AND r.state='read') AS read_at,
    (SELECT min(r.occurred_at) FROM delivery_receipts r WHERE c.channel='WHATSAPP' AND c.sent_at IS NOT NULL AND r.provider_message_id=c.provider_message_id AND r.communication_id=c.id AND r.school_id=i.school_id AND r.state='failed') AS delivery_failed_at,
    GREATEST(i.updated_at,w.updated_at,c.updated_at) AS updated_at,
    EXISTS(SELECT 1 FROM workflow_effects f WHERE f.school_id=i.school_id AND f.job_id=w.id AND f.state='uncertain') AS uncertain
    FROM activity_items i LEFT JOIN workflow_jobs w ON w.id=i.workflow_id AND w.school_id=i.school_id
    LEFT JOIN parent_communications c ON c.id=i.communication_id AND c.school_id=i.school_id
    WHERE i.job_id=${job.id} AND i.school_id=${job.school_id} ORDER BY i.label,i.id`;
  return rows;
}
/**
 * Where a job's "Open source" goes (G49): always the reader's own console view for that work, never another
 * console. Bank-statement imports open the accountant's Collect › Bank import tab (a campus operator's Fees);
 * report PDF and delivery jobs open Report cards for that exam. Anything else falls back to the reader's home.
 */
export function jobSourceHref(user: Pick<AuthUser, "role">, job: Pick<Job, "kind" | "source_id">) {
  const base = dashboardPathForRole(user.role);
  const at = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params).toString()}`;
  if (job.kind === "IMPORT") {
    if (user.role === "ACCOUNTANT") return at("/accountant", { view: "payments", tab: "bank-import" });
    if (user.role === "CAMPUS_ADMIN" || user.role === "ADMIN") return at("/admin", { view: "fees", tab: "payments" });
    if (user.role === "SUPER_ADMIN") return at("/super", { view: "campuses" });
    return base;
  }
  if (user.role === "TEACHER") return at("/teacher/reports", { exam: job.source_id });
  if (user.role === "PRINCIPAL") return at("/principal", { view: "report-cards", exam: job.source_id });
  if (user.role === "CAMPUS_ADMIN" || user.role === "ADMIN") return at("/admin", { view: "report-cards", exam: job.source_id });
  if (user.role === "SUPER_ADMIN") return at("/super", { view: "campuses" });
  return base;
}

async function deliveryRetryTarget(job: Job, item: Item, db: TxClient) {
  const communication = await db.parentCommunication.findFirst({ where: { id: item.communication_id!, schoolId: job.school_id, campusId: job.campus_id } });
  if (!communication || !communication.studentId || !communication.parentUserId || !communication.relatedId)
    return { reason: "RECIPIENT_AUTHORIZATION_REQUIRED" } as const;
  if (!["EMAIL", "WHATSAPP"].includes(communication.channel)) return { reason: "UNSUPPORTED_CHANNEL" } as const;
  const report = await db.reportCard.findFirst({ where: { id: communication.relatedId, schoolId: job.school_id, campusId: job.campus_id, examId: job.source_id, studentId: communication.studentId }, select: { id: true } });
  if (!report) return { reason: "ORIGINAL_VERSION_UNAVAILABLE" } as const;
  try {
    const version = await getPublishedVersion(report.id, undefined, db);
    if (!item.version_id || version.id !== item.version_id || (communication.metadata as { reportVersionId?: string } | null)?.reportVersionId !== item.version_id)
      return { reason: "ORIGINAL_VERSION_UNAVAILABLE" } as const;
  } catch (error) {
    if ((error as { status?: number }).status === 409 || (error as { code?: string }).code === "P2025") return { reason: "ORIGINAL_VERSION_UNAVAILABLE" } as const;
    throw error;
  }
  // Only the original, still-authorized guardian may receive the frozen report. Legacy pupil contact fields confer no authority.
  // This shared resolver owns its Prisma reads. They must establish their own RLS session,
  // rather than inheriting the flag for the separate activity-job transaction connection.
  const targets = await runWithTenantContext({ ...getTenantContext(), schoolId: job.school_id, unscoped: false, rlsSession: false }, () =>
    authorizedGuardianCommunicationTargets({ schoolId: job.school_id, campusId: job.campus_id, studentId: communication.studentId, parentUserId: communication.parentUserId }, communication.channel, "learningRecords"));
  const recipients = [...new Set(targets.map(target => target.recipient))];
  if (recipients.length !== 1) return { reason: "RECIPIENT_AUTHORIZATION_REQUIRED" } as const;
  return { reason: null, communication, recipient: recipients[0] } as const;
}

async function itemRetryReason(job: Job, item: Item, db: TxClient, user: AuthUser) {
  const blocked = retryBlockReason(item, !!job.cancel_requested_at);
  if (blocked) return blocked;
  if (job.kind === "IMPORT") {
    try { await assertPermission(user, "fees", "add", db); }
    catch (error) { if ((error as { status?: number }).status === 403) return "AUTHORIZATION_REQUIRED"; throw error; }
  }
  if (item.communication_id) return (await deliveryRetryTarget(job, item, db)).reason;
  if (job.kind === "PDF") {
    const version = item.version_id && await db.reportVersion.findFirst({ where: { id: item.version_id, reportCardId: item.reference_id, approvedAt: { not: null }, documentBytes: { not: null }, reportCard: { examId: job.source_id, campusId: job.campus_id } }, select: { id: true } });
    if (!version) return "ORIGINAL_VERSION_UNAVAILABLE";
  }
  return null;
}

export async function readJob(user: AuthUser, id: string) {
  return jobTransaction(user, async tx => {
    const [job] = await tx.$queryRaw<Job[]>`SELECT * FROM activity_jobs WHERE id=${id} AND school_id=${user.schoolId}`;
    if (!job) throw new ApiError("Job not found", 404);
    await authorizeJob(user, job, false, tx);
    const items = await itemsFor(job, tx);
    let canEdit = true;
    try { await authorizeJob(user, job, true, tx); }
    catch (error) { if (![402, 403, 404].includes((error as { status?: number }).status || 0)) throw error; canEdit = false; }
    const enriched = [];
    for (const item of items) {
      const retryBlockedReason = canEdit ? await itemRetryReason(job, item, tx, user) : "AUTHORIZATION_REQUIRED";
      enriched.push({ ...item, reason: publicFailureReason(item.reason), result: publicJobResult(job.kind, item), category: failureCategory(item.uncertain ? "EXTERNAL_OUTCOME_UNCERTAIN" : item.reason), canRetry: !retryBlockedReason, retryBlockedReason });
    }
    return { ...job, sourceHref: jobSourceHref(user, job), items: enriched, counts: reconcileCounts(items), attentionCount: attentionCount(items), canEdit, updatedAt: new Date().toISOString() };
  });
}
export async function listJobs(user: AuthUser) {
  const jobs = await jobTransaction(
    user,
    (tx) =>
      tx.$queryRaw<
        Job[]
      >`SELECT j.*,c.name AS campus_label FROM activity_jobs j JOIN campuses c ON c.id=j.campus_id AND c.school_id=j.school_id WHERE j.school_id=${user.schoolId} AND (${user.role === "SUPER_ADMIN"} OR j.campus_id=${user.campusId}) ORDER BY j.created_at DESC LIMIT 100`,
  );
  const visible = [];
  for (const job of jobs) {
    try {
      await authorizeJob(user, job);
      const items = await jobTransaction(user, (tx) => itemsFor(job, tx));
      visible.push({ ...job, counts: reconcileCounts(items), attentionCount: attentionCount(items) });
    } catch (error) {
      if (![403, 404].includes((error as { status?: number }).status || 0))
        throw error;
    }
  }
  return visible;
}
export async function createJob(
  tx: Sql,
  input: {
    schoolId: string;
    campusId: string;
    classId?: string | null;
    actorId: string;
    kind: string;
    sourceId: string;
    label: string;
    identity: string;
  },
) {
  const [row] = await tx.$queryRaw<
    { id: string }[]
  >`INSERT INTO activity_jobs(id,school_id,campus_id,class_id,actor_id,kind,source_id,source_label,identity)
  VALUES (${randomUUID()},${input.schoolId},${input.campusId},${input.classId || null},${input.actorId},${input.kind},${input.sourceId},${input.label},${input.identity})
  ON CONFLICT(school_id,identity) DO UPDATE SET identity=EXCLUDED.identity RETURNING id`;
  return row.id;
}
export async function trackDeliveries(
  user: AuthUser,
  exam: { id: string; campusId: string; classId: string; title: string },
  communications: Array<{
    id: string;
    relatedId: string | null;
    metadata: unknown;
    recipientName: string | null;
  }>,
) {
  const identity = createHash("sha256")
    .update(
      [exam.id, ...communications
        .map((c) => c.id)
        .sort()]
        .join(":"),
    )
    .digest("hex");
  return jobTransaction(user, async (tx) => {
    const jobId = await createJob(tx, {
      schoolId: user.schoolId,
      campusId: exam.campusId,
      classId: exam.classId,
      actorId: user.userId,
      kind: "REPORT_DELIVERY",
      sourceId: exam.id,
      label: exam.title,
      identity: `delivery:${identity}`,
    });
    for (const c of communications) {
      const [event] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM workflow_events WHERE school_id=${user.schoolId} AND kind='REPORT_DELIVERY' AND reference_id=${c.id}`;
      await tx.$executeRaw`INSERT INTO activity_items(id,school_id,job_id,reference_id,label,version_id,workflow_id,communication_id)
       VALUES(${randomUUID()},${user.schoolId},${jobId},${c.id},${c.recipientName || "—"},${(c.metadata as { reportVersionId?: string })?.reportVersionId || null},${event?.id || null},${c.id}) ON CONFLICT(job_id,reference_id) DO NOTHING`;
    }
    return jobId;
  });
}
export async function operateJob(
  user: AuthUser,
  id: string,
  action: "retry" | "cancel",
  selected: string[],
  reason: JobOperation["reason"],
) {
  const parsed = jobOperationSchema.safeParse({ action, items: selected, reason });
  if (!parsed.success) throw new ApiError("Choose a valid action, selection and reason", 400);
  return jobTransaction(user, async (tx) => {
    const [job] = await tx.$queryRaw<Job[]>`SELECT * FROM activity_jobs WHERE id=${id} AND school_id=${user.schoolId} FOR UPDATE`;
    if (!job) throw new ApiError("Job not found", 404);
    // The current account, role, campus, class assignment and module grant are checked after acquiring the operation lock.
    await authorizeJob(user, job, true, tx);
    const items = await itemsFor(job, tx);
    const before = reconcileCounts(items);
    const chosen = action === "cancel" ? items : items.filter(i => selected.includes(i.id));
    if (action === "retry" && chosen.length !== selected.length) throw new ApiError("The selection changed. Refresh before retrying.", 409);
    if (action === "cancel") await tx.$executeRaw`UPDATE activity_jobs SET cancel_requested_at=COALESCE(cancel_requested_at,now()) WHERE id=${id} AND school_id=${user.schoolId}`;
    for (const item of chosen) {
      if (action === "cancel") {
        if (["completed", "cancelled"].includes(item.state)) continue;
        if (item.workflow_id) await cancel(tx, { eventId: item.workflow_id, schoolId: user.schoolId });
        else await tx.$executeRaw`UPDATE activity_items SET state='cancelled',updated_at=now() WHERE id=${item.id} AND school_id=${user.schoolId}`;
        continue;
      }
      const blocked = await itemRetryReason(job, item, tx, user);
      if (blocked) throw new ApiError(`Retry unavailable: ${blocked}. Refresh and resolve the cause before retrying.`, 409);
      if (item.communication_id) {
        const target = await deliveryRetryTarget(job, item, tx);
        if (target.reason !== null) throw new ApiError(`Retry unavailable: ${target.reason}`, 409);
        const c = target.communication;
        // Conditional state prevents accepted work from being reset by a competing provider completion.
        const changed = await tx.parentCommunication.updateMany({
          where: { id: c.id, status: c.status, providerMessageId: null },
          data: { recipient: target.recipient, status: "PENDING", failedReason: null },
        });
        if (!changed.count) throw new ApiError("The delivery changed. Refresh before retrying.", 409);
        if (!item.workflow_id) {
          const workflowId = await appendEvent(tx, { schoolId: user.schoolId, actorId: user.userId, referenceId: c.id, kind: "REPORT_DELIVERY", version: 1, identity: `report-delivery:${c.idempotencyKey}` });
          await tx.$executeRaw`UPDATE activity_items SET workflow_id=${workflowId},state='queued',updated_at=now() WHERE id=${item.id} AND school_id=${user.schoolId}`;
        }
      }
      if (item.workflow_id) {
        const changed = await tx.$executeRaw`UPDATE workflow_jobs SET state='queued',max_attempts=attempts+5,reason=NULL,finished_at=NULL,next_attempt_at=now(),updated_at=now()
          WHERE id=${item.workflow_id} AND school_id=${user.schoolId} AND state='failed' AND cancel_requested_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM workflow_effects WHERE job_id=${item.workflow_id} AND school_id=${user.schoolId} AND state='uncertain')`;
        if (!changed) throw new ApiError("The item changed. Refresh before retrying.", 409);
        await tx.$executeRaw`UPDATE workflow_events SET actor_id=${user.userId},available_at=now(),lease_token=NULL,lease_until=NULL WHERE id=${item.workflow_id} AND school_id=${user.schoolId}`;
      }
    }
    const counts = reconcileCounts(await itemsFor(job, tx));
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: job.campus_id, tableName: "activity_jobs", recordId: id, userId: user.userId, newValue: { action, reason, items: chosen.map(i => i.id), before, counts } } });
    return { jobId: id, action, reason, counts };
  });
}
