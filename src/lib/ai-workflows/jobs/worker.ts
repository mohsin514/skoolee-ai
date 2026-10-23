import type { PrismaClient } from "@prisma/client";
import { appendEvent } from "./events";
import { resolveJobActor } from "./actor";
import { advanceJob } from "./job-service";

/**
 * Background pass (outbox worker, every 5 s). Advances class-A and hand-off steps for jobs whose user
 * closed the tab. Never confirms or runs a class-B step (control P5). Bounded per sweep and per school.
 */
export const SWEEP_LIMIT = 24;
export const PER_SCHOOL = 2;

export async function sweepWorkflowJobs(db: PrismaClient, now = new Date()) {
  const rows = await db.$queryRaw<Array<{ id: string; schoolId: string; actorId: string; actorRole: string; accessVersion: number }>>`
    SELECT id, school_id AS "schoolId", actor_id AS "actorId", actor_role AS "actorRole", access_version AS "accessVersion"
    FROM (
      SELECT *, row_number() OVER (PARTITION BY school_id ORDER BY updated_at, id) AS n
      FROM ai_workflow_jobs
      WHERE status = 'RUNNING' AND (lease_expires_at IS NULL OR lease_expires_at <= ${now}) AND (next_wake_at IS NULL OR next_wake_at <= ${now})
    ) ranked
    WHERE n <= ${PER_SCHOOL}
    ORDER BY updated_at, id
    LIMIT ${SWEEP_LIMIT}`;
  let advanced = 0;
  for (const row of rows) {
    const actor = await resolveJobActor(row);
    if (!actor) {
      // Access changed since the job started: stop it without calling any service or model.
      await db.$transaction(async tx => {
        const blocked = await tx.aiWorkflowJob.updateMany({ where: { id: row.id, schoolId: row.schoolId, status: "RUNNING" }, data: { status: "BLOCKED", errorCode: "ACCESS_CHANGED", version: { increment: 1 } } });
        if (blocked.count) await appendEvent(tx as never, row, "JOB_BLOCKED", null, { code: "ACCESS_CHANGED" });
      }).catch(() => undefined);
      continue;
    }
    try { await advanceJob(actor, row.id, "worker"); advanced++; }
    catch { /* Another worker or the browser holds the lease, or the step recorded its own failure. */ }
  }
  return { considered: rows.length, advanced };
}
