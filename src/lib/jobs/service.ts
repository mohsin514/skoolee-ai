import { dashboardPathForRole } from "@/lib/roles";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { createHash, randomUUID } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { prisma, tenantTransaction, type TxClient } from "@/lib/db/prisma";
import { assertPermission, loadPermissionMap } from "@/lib/permissions";
import { ApiError } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { appendEvent, cancel, type Sql } from "@/lib/queue/outbox";
import { getPublishedVersion } from "@/lib/academic/report-versions";
import { reconcileCounts, failureCategory } from "./contract";

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
export async function authorizeJob(user: AuthUser, job: Job, edit = false) {
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
  );
  if (user.role === "TEACHER") {
    const assigned =
      job.class_id &&
      (await prisma.class.findFirst({
        where: {
          id: job.class_id,
          OR: [
            { classTeacherId: user.userId },
            { subjects: { some: { teacherId: user.userId } } },
          ],
        },
        select: { id: true },
      }));
    if (!assigned) throw new ApiError("Job not found", 404);
  }
  if (edit) await assertSchoolOperational(user.schoolId);
}
export async function itemsFor(job: Job, db: Sql = prisma) {
  const rows = await db.$queryRaw<
    Item[]
  >`SELECT i.id,i.reference_id,i.label,i.version_id,i.workflow_id,i.communication_id,
    CASE WHEN c.status='SENT' THEN 'completed' WHEN w.state='completed' THEN 'completed'
      WHEN w.state='cancelled' OR i.state='cancelled' THEN 'cancelled'
      WHEN w.state IN ('queued','retrying') THEN 'queued' WHEN w.state='running' THEN 'running'
      WHEN w.state='failed' OR c.status IN ('NO_RECIPIENT','BLOCKED','FAILED') THEN 'failed' ELSE i.state END AS state,
    COALESCE(w.reason,CASE WHEN c.status='NO_RECIPIENT' THEN 'MISSING_CONTACT' WHEN c.status='BLOCKED' THEN 'AUTHORIZATION_BLOCKED' ELSE i.reason END) AS reason,
    c.channel,c.recipient,CASE WHEN c.provider_message_id IS NOT NULL THEN c.sent_at ELSE NULL END AS accepted_at,i.result,
    (SELECT min(r.occurred_at) FROM delivery_receipts r WHERE r.communication_id=c.id AND r.school_id=i.school_id AND r.state='delivered') AS delivered_at,
    (SELECT min(r.occurred_at) FROM delivery_receipts r WHERE r.communication_id=c.id AND r.school_id=i.school_id AND r.state='read') AS read_at,
    (SELECT min(r.occurred_at) FROM delivery_receipts r WHERE r.communication_id=c.id AND r.school_id=i.school_id AND r.state='failed') AS delivery_failed_at,
    GREATEST(i.updated_at,w.updated_at,c.updated_at) AS updated_at,
    EXISTS(SELECT 1 FROM workflow_effects f WHERE f.school_id=i.school_id AND f.job_id=w.id AND f.state='uncertain') AS uncertain
    FROM activity_items i LEFT JOIN workflow_jobs w ON w.id=i.workflow_id AND w.school_id=i.school_id
    LEFT JOIN parent_communications c ON c.id=i.communication_id AND c.school_id=i.school_id
    WHERE i.job_id=${job.id} AND i.school_id=${job.school_id} ORDER BY i.label,i.id`;
  return rows;
}
export async function readJob(user: AuthUser, id: string) {
  const [job] = await jobTransaction(
    user,
    (tx) =>
      tx.$queryRaw<
        Job[]
      >`SELECT * FROM activity_jobs WHERE id=${id} AND school_id=${user.schoolId}`,
  );
  if (!job) throw new ApiError("Job not found", 404);
  await authorizeJob(user, job);
  const items = await jobTransaction(user, (tx) => itemsFor(job, tx));
  const flags = (await loadPermissionMap(user.schoolId, user.role)).get(
    job.kind === "IMPORT" ? "fees" : "reports",
  );
  return {
    ...job,
    sourceHref: `${dashboardPathForRole(user.role)}${user.role === "TEACHER" ? "/reports" : ""}?${job.kind === "IMPORT" ? "tab=fees" : `examId=${encodeURIComponent(job.source_id)}`}`,
    items: items.map((i) => ({
      ...i,
      category: failureCategory(i.reason),
      canRetry:
        i.state === "failed" && !i.uncertain && !job.cancel_requested_at,
    })),
    counts: reconcileCounts(items),
    canEdit: !!flags?.canEdit,
    updatedAt: new Date().toISOString(),
  };
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
      visible.push({
        ...job,
        counts: reconcileCounts(
          await jobTransaction(user, (tx) => itemsFor(job, tx)),
        ),
      });
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
      communications
        .map((c) => c.id)
        .sort()
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
) {
  const data = await readJob(user, id);
  await authorizeJob(user, data, true);
  if (
    action === "retry" &&
    (!selected.length ||
      selected.length > 500 ||
      new Set(selected).size !== selected.length)
  )
    throw new ApiError("Select failed items", 400);
  return jobTransaction(user, async (tx) => {
    const [job] = await tx.$queryRaw<
      Job[]
    >`SELECT * FROM activity_jobs WHERE id=${id} AND school_id=${user.schoolId} FOR UPDATE`;
    const items = await itemsFor(job, tx);
    const chosen =
      action === "cancel"
        ? items
        : items.filter((i) => selected.includes(i.id));
    if (
      action === "retry" &&
      (job.cancel_requested_at ||
        chosen.length !== selected.length ||
        chosen.some((i) => i.state !== "failed" || i.uncertain))
    )
      throw new ApiError(
        "Only confirmed failed items can be retried. Reconcile uncertain provider outcomes first.",
        409,
      );
    if (action === "cancel")
      await tx.$executeRaw`UPDATE activity_jobs SET cancel_requested_at=COALESCE(cancel_requested_at,now()) WHERE id=${id} AND school_id=${user.schoolId}`;
    for (const item of chosen) {
      if (action === "cancel") {
        if (["completed", "cancelled"].includes(item.state)) continue;
        if (item.workflow_id)
          await cancel(tx, {
            eventId: item.workflow_id,
            schoolId: user.schoolId,
          });
        else
          await tx.$executeRaw`UPDATE activity_items SET state='cancelled',updated_at=now() WHERE id=${item.id} AND school_id=${user.schoolId}`;
        continue;
      }
      if (item.communication_id) {
        const c = await tx.parentCommunication.findUniqueOrThrow({
          where: { id: item.communication_id },
        });
        const version = await getPublishedVersion(
          c.relatedId || "",
          undefined,
          tx,
        );
        if (version.id !== item.version_id)
          throw new ApiError(
            "The approved version was superseded. Start delivery of the newly published version.",
            409,
          );
        if (c.status === "BLOCKED")
          throw new ApiError(
            "Resolve the approval or subscription restriction before retry.",
            409,
          );
        if (c.status === "NO_RECIPIENT") {
          const student = await tx.student.findUniqueOrThrow({
            where: { id: c.studentId! },
            include: { parent: true },
          });
          const recipient =
            c.channel === "EMAIL"
              ? student.guardianEmail ||
                (student.parent?.isActive ? student.parent.email : null)
              : student.guardianWhatsapp ||
                student.guardianPhone ||
                (student.parent?.isActive ? student.parent.phone : null);
          if (!recipient)
            throw new ApiError(
              "Correct the guardian contact in the pupil record first.",
              409,
            );
          await tx.parentCommunication.update({
            where: { id: c.id },
            data: {
              recipient,
              parentUserId: student.parentUserId,
              status: "PENDING",
              failedReason: null,
            },
          });
        }
        if (!item.workflow_id) {
          const workflowId = await appendEvent(tx, {
            schoolId: user.schoolId,
            actorId: user.userId,
            referenceId: c.id,
            kind: "REPORT_DELIVERY",
            version: 1,
            identity: `report-delivery:${c.idempotencyKey}`,
          });
          await tx.$executeRaw`UPDATE activity_items SET workflow_id=${workflowId},state='queued',updated_at=now() WHERE id=${item.id} AND school_id=${user.schoolId}`;
        }
      }
      if (item.workflow_id) {
        const changed =
          await tx.$executeRaw`UPDATE workflow_jobs SET state='queued',max_attempts=attempts+5,reason=NULL,finished_at=NULL,next_attempt_at=now(),updated_at=now()
          WHERE id=${item.workflow_id} AND school_id=${user.schoolId} AND state='failed' AND cancel_requested_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM workflow_effects WHERE job_id=${item.workflow_id} AND school_id=${user.schoolId} AND state='uncertain')`;
        if (!changed)
          throw new ApiError("The item changed. Refresh before retrying.", 409);
        await tx.$executeRaw`UPDATE workflow_events SET actor_id=${user.userId},available_at=now(),lease_token=NULL,lease_until=NULL WHERE id=${item.workflow_id} AND school_id=${user.schoolId}`;
      }
    }
    await tx.auditLog.create({
      data: {
        schoolId: user.schoolId,
        tableName: "activity_jobs",
        recordId: id,
        userId: user.userId,
        newValue: {
          action,
          items: chosen.map((i) => i.id),
          counts: reconcileCounts(items),
        },
      },
    });
    return { jobId: id };
  });
}
