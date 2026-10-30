import type { PrismaClient } from "@prisma/client";
import { appendEvent } from "./events";
import { resolveJobActor } from "./actor";
import type { Generate } from "../planner/plan";
import { advanceJob } from "./job-service";

const OWNER_ROLE = "APP_OWNER";

export const SWEEP_LIMIT = 24;
export const PER_SCHOOL = 2;

/**
 * Background pass (outbox worker, every 5 s). Advances class-A and hand-off steps for jobs whose user
 * closed the tab. Never confirms or runs a class-B step (control P5). Bounded per sweep and per school.
 * RT9: APP_OWNER jobs are never claimed here. Platform work leaves the tenant guard, so it advances only
 * inside the owner's own request, after requirePlatformOwner (session, MFA and support-grant fence).
 */
export async function sweepWorkflowJobs(db: PrismaClient, now = new Date(), generate?: Generate) {
  // Wake jobs paused by a provider outage once their backoff has passed: they plan again from PLANNING.
  const woke = await db.aiWorkflowJob.updateMany({ where: { status: "PAUSED", errorCode: "PROVIDER_UNAVAILABLE", actorRole: { not: OWNER_ROLE }, nextWakeAt: { lte: now } }, data: { status: "PLANNING", nextWakeAt: null, version: { increment: 1 } } });
  // Hand-offs nobody took within 14 days expire; the step says so instead of waiting forever.
  const expired = await expireHandoffs(db, now);
  const rows = await db.$queryRaw<Array<{ id: string; schoolId: string; actorId: string; actorRole: string; accessVersion: number }>>`
    SELECT id, school_id AS "schoolId", actor_id AS "actorId", actor_role AS "actorRole", access_version AS "accessVersion"
    FROM (
      SELECT *, row_number() OVER (PARTITION BY school_id ORDER BY updated_at, id) AS n
      FROM ai_workflow_jobs
      WHERE status IN ('RUNNING', 'PLANNING') AND actor_role <> ${OWNER_ROLE} AND (lease_expires_at IS NULL OR lease_expires_at <= ${now}) AND (next_wake_at IS NULL OR next_wake_at <= ${now})
    ) ranked
    WHERE n <= ${PER_SCHOOL}
    ORDER BY updated_at, id
    LIMIT ${SWEEP_LIMIT}`;
  let advanced = 0;
  for (const row of rows) {
    if (row.actorRole === OWNER_ROLE) continue; // defence in depth: never resolve, lease or block an owner job
    const actor = await resolveJobActor(row);
    if (!actor) {
      // Access changed since the job started: stop it without calling any service or model.
      await db.$transaction(async tx => {
        const blocked = await tx.aiWorkflowJob.updateMany({ where: { id: row.id, schoolId: row.schoolId, status: "RUNNING" }, data: { status: "BLOCKED", errorCode: "ACCESS_CHANGED", version: { increment: 1 } } });
        if (blocked.count) await appendEvent(tx as never, row, "JOB_BLOCKED", null, { code: "ACCESS_CHANGED" });
      }).catch(() => undefined);
      continue;
    }
    try { await advanceJob(actor, row.id, "worker", generate); advanced++; }
    catch { /* Another worker or the browser holds the lease, or the step recorded its own failure. */ }
  }
  return { considered: rows.length, advanced, woke: woke.count, expired };
}

async function expireHandoffs(db: PrismaClient, now: Date) {
  const stale = await db.aiWorkflowHandoff.findMany({ where: { status: { in: ["OPEN", "CLAIMED"] }, expiresAt: { lte: now } }, select: { id: true, schoolId: true, stepId: true, jobId: true, status: true }, take: 200 });
  let count = 0;
  for (const handoff of stale) {
    await db.$transaction(async tx => {
      const updated = await tx.aiWorkflowHandoff.updateMany({ where: { id: handoff.id, status: handoff.status }, data: { status: "EXPIRED" } });
      if (!updated.count) return;
      await tx.aiWorkflowStep.updateMany({ where: { id: handoff.stepId, schoolId: handoff.schoolId, status: "WAITING_HANDOFF" }, data: { status: "FAILED", errorCode: "EXPIRED", finishedAt: now, version: { increment: 1 } } });
      count++;
    }).catch(() => undefined);
  }
  return count;
}
