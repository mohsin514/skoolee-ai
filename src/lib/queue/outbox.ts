import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { runWithTenantContext } from "../db/tenant-context";

export type Sql = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export type Database = Sql & { $transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> };
export type Reference = { eventId: string; schoolId: string };
export type Event = Reference & { kind: string; version: number; referenceId: string; actorId: string };
type Claim = Event & { token: string; attempts: number; checkpoint: number };
const LEASE_SECONDS = 60;
export class WorkflowStopped extends Error {}

/** Call ONLY inside the domain transaction. No queue/network I/O belongs here. */
export async function appendEvent(tx: Sql, input: Omit<Event, "eventId"> & { identity: string }) {
  if (!input.schoolId || !input.actorId || !input.referenceId || input.version !== 1) throw new Error("INVALID_EVENT_REFERENCE");
  const id = randomUUID();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO workflow_events (id, school_id, kind, version, reference_id, actor_id, identity)
    VALUES (${id}, ${input.schoolId}, ${input.kind}, ${input.version}, ${input.referenceId}, ${input.actorId}, ${input.identity})
    ON CONFLICT (school_id, identity) DO UPDATE SET identity = EXCLUDED.identity
    WHERE workflow_events.kind=EXCLUDED.kind AND workflow_events.version=EXCLUDED.version
      AND workflow_events.reference_id=EXCLUDED.reference_id AND workflow_events.actor_id=EXCLUDED.actor_id
    RETURNING id`;
  if (!rows.length) throw new Error("EVENT_IDENTITY_CONFLICT");
  await tx.$executeRaw`INSERT INTO workflow_jobs (id, school_id) VALUES (${rows[0].id}, ${input.schoolId}) ON CONFLICT (id) DO NOTHING`;
  return rows[0].id;
}

/** Dispatcher is a privileged process; cross-school selection returns references only. */
export async function dispatch(db: Database, publish: (ref: Reference, deliveryId: string) => Promise<unknown>, limit = 50) {
  const token = randomUUID();
  const events = await db.$queryRaw<(Reference & { dispatchCount: number })[]>`
    WITH candidates AS (
      SELECT e.id FROM workflow_events e JOIN workflow_jobs j ON j.id=e.id AND j.school_id=e.school_id
      WHERE j.state IN ('queued','retrying','running') AND e.available_at <= now()
        AND (e.lease_until IS NULL OR e.lease_until < now())
        AND (j.lease_until IS NULL OR j.lease_until < now())
      ORDER BY e.available_at LIMIT ${Math.min(Math.max(limit, 1), 500)} FOR UPDATE OF e SKIP LOCKED
    ) UPDATE workflow_events e SET lease_token=${token}, lease_until=now()+ interval '60 seconds', dispatch_count=dispatch_count+1
      FROM candidates c WHERE e.id=c.id
      RETURNING e.id AS "eventId", e.school_id AS "schoolId", e.dispatch_count AS "dispatchCount"`;
  for (const event of events) {
    try {
      // A fresh delivery identity permits recovery after Redis loss/removal. Consumer fences duplicates.
      await publish({ eventId: event.eventId, schoolId: event.schoolId }, `${event.eventId}-${event.dispatchCount}`);
      await db.$executeRaw`UPDATE workflow_events SET dispatched_at=now(), available_at=now()+interval '60 seconds', lease_token=NULL, lease_until=NULL
        WHERE id=${event.eventId} AND school_id=${event.schoolId} AND lease_token=${token}`;
    } catch {
      await db.$executeRaw`UPDATE workflow_events SET available_at=now()+interval '5 seconds', lease_token=NULL, lease_until=NULL
        WHERE id=${event.eventId} AND school_id=${event.schoolId} AND lease_token=${token}`;
    }
  }
  return events.length;
}

async function claim(db: Database, ref: Reference): Promise<Claim | null> {
  const token = randomUUID();
  return db.$transaction(async tx => {
    // A crashed final attempt must reach dead letter instead of being reclaimed forever.
    await tx.$executeRaw`UPDATE workflow_jobs SET state='failed', reason='ATTEMPTS_EXHAUSTED', finished_at=now(), updated_at=now(), lease_token=NULL, lease_until=NULL
      WHERE id=${ref.eventId} AND school_id=${ref.schoolId} AND state IN ('queued','retrying','running') AND attempts >= max_attempts
        AND (lease_until IS NULL OR lease_until < now())`;
    const rows = await tx.$queryRaw<(Event & { attempts: number; checkpoint: number })[]>`
      WITH claimed AS (
        UPDATE workflow_jobs SET state='running', attempts=attempts+1, started_at=COALESCE(started_at,now()), updated_at=now(),
          lease_token=${token}, lease_until=now()+make_interval(secs => ${LEASE_SECONDS})
        WHERE id=${ref.eventId} AND school_id=${ref.schoolId} AND state IN ('queued','retrying','running')
          AND attempts < max_attempts AND (lease_until IS NULL OR lease_until < now())
          AND next_attempt_at <= now()
        RETURNING *
      ) SELECT e.id AS "eventId",e.school_id AS "schoolId",e.kind,e.version,e.reference_id AS "referenceId", e.actor_id AS "actorId",j.attempts,j.checkpoint
        FROM claimed j JOIN workflow_events e ON e.id=j.id AND e.school_id=j.school_id`;
    return rows[0] ? { ...rows[0], token } : null;
  });
}

export type WorkflowContext = Event & {
  checkpoint: number;
  /** Every committed domain effect and its receipt share this transaction. */
  effect(identity: string, apply: (tx: Sql) => Promise<void>): Promise<boolean>;
  /** No automatic replay after a crash around an external call; reconcile first. */
  external(identity: string, authorize: (tx: Sql) => Promise<void>, send: () => Promise<void>): Promise<void>;
};

export async function consume(db: Database, ref: Reference, handler: (ctx: WorkflowContext) => Promise<void>) {
  if (!ref.schoolId || !ref.eventId) throw new Error("MISSING_TENANT_REFERENCE");
  const job = await claim(db, ref);
  if (!job) return;
  let stopped = false;
  const locked = async <T>(fn: (tx: Sql) => Promise<T>): Promise<T> => db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ cancel: Date | null }[]>`SELECT cancel_requested_at AS cancel FROM workflow_jobs
      WHERE id=${ref.eventId} AND school_id=${ref.schoolId} AND lease_token=${job.token} AND state='running' AND lease_until > now() FOR UPDATE`;
    if (!rows[0]) throw new WorkflowStopped("LEASE_LOST");
    if (rows[0].cancel) throw new WorkflowStopped("CANCEL_REQUESTED");
    await tx.$executeRaw`SELECT set_config('app.current_school_id', ${ref.schoolId}, true)`;
    return fn(tx);
  });
  // Heartbeats never extend someone else's claim. Per-effect transactions also fence stale workers.
  const heartbeat = setInterval(() => {
    void db.$executeRaw`UPDATE workflow_jobs SET lease_until=now()+interval '60 seconds', updated_at=now()
      WHERE id=${ref.eventId} AND school_id=${ref.schoolId} AND lease_token=${job.token} AND state='running' AND lease_until > now()`
      .catch(() => { stopped = true; });
  }, 15_000);
  heartbeat.unref();
  const effect: WorkflowContext["effect"] = (identity, apply) => locked(async tx => {
    if (stopped) throw new WorkflowStopped("LEASE_LOST");
    const prior = await tx.$queryRaw<{ state: string }[]>`SELECT state FROM workflow_effects WHERE job_id=${ref.eventId} AND school_id=${ref.schoolId} AND identity=${identity}`;
    if (prior[0]?.state === "committed") return false;
    if (prior.length) throw new WorkflowStopped("EXTERNAL_OUTCOME_UNCERTAIN");
    await apply(tx);
    await tx.$executeRaw`INSERT INTO workflow_effects (id,school_id,job_id,identity,state,completed_at)
      VALUES (${randomUUID()},${ref.schoolId},${ref.eventId},${identity},'committed',now())`;
    await tx.$executeRaw`UPDATE workflow_jobs SET checkpoint=checkpoint+1, updated_at=now() WHERE id=${ref.eventId} AND school_id=${ref.schoolId}`;
    return true;
  });
  try {
    await runWithTenantContext({ schoolId: job.schoolId, userId: job.actorId }, async () => {
      if (job.version !== 1) throw new WorkflowStopped("UNSUPPORTED_VERSION");
      await handler({ ...job, effect, external: async (identity, authorize, send) => {
        const shouldSend = await locked(async tx => {
          const existing = await tx.$queryRaw<{ state: string }[]>`SELECT state FROM workflow_effects WHERE job_id=${ref.eventId} AND school_id=${ref.schoolId} AND identity=${identity}`;
          if (existing[0]?.state === "committed") return false;
          if (existing.length) throw new WorkflowStopped("EXTERNAL_OUTCOME_UNCERTAIN");
          await authorize(tx);
          await tx.$executeRaw`INSERT INTO workflow_effects (id,school_id,job_id,identity,state) VALUES (${randomUUID()},${ref.schoolId},${ref.eventId},${identity},'uncertain')`;
          return true;
        });
        if (!shouldSend) return;
        // From here cancellation cannot undo the provider call. Receipt survives cancel/fencing.
        await send();
        await db.$transaction(async tx => {
          const changed = await tx.$executeRaw`UPDATE workflow_effects SET state='committed', completed_at=now() WHERE job_id=${ref.eventId} AND school_id=${ref.schoolId} AND identity=${identity} AND state='uncertain'`;
          if (changed) await tx.$executeRaw`UPDATE workflow_jobs SET checkpoint=checkpoint+1, updated_at=now() WHERE id=${ref.eventId} AND school_id=${ref.schoolId}`;
        });
      } });
    });
    await locked(async tx => {
      const uncertain = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM workflow_effects WHERE job_id=${ref.eventId} AND school_id=${ref.schoolId} AND state='uncertain' LIMIT 1`;
      if (uncertain.length) throw new WorkflowStopped("EXTERNAL_OUTCOME_UNCERTAIN");
      await tx.$executeRaw`UPDATE workflow_jobs SET state='completed',finished_at=now(),updated_at=now(),lease_token=NULL,lease_until=NULL,reason=NULL WHERE id=${ref.eventId} AND school_id=${ref.schoolId}`;
    });
  } catch (error) {
    const uncertain = await db.$queryRaw<{ id: string }[]>`SELECT id FROM workflow_effects WHERE job_id=${ref.eventId} AND school_id=${ref.schoolId} AND state='uncertain' LIMIT 1`;
    const permanent = error instanceof WorkflowStopped || uncertain.length > 0;
    const reason = uncertain.length ? "EXTERNAL_OUTCOME_UNCERTAIN" : error instanceof WorkflowStopped ? error.message : "WORKER_FAILURE";
    await db.$executeRaw`UPDATE workflow_jobs SET
      state=CASE WHEN cancel_requested_at IS NOT NULL THEN 'cancelled' WHEN ${permanent} OR attempts>=max_attempts THEN 'failed' ELSE 'retrying' END,
      reason=${reason}, updated_at=now(), finished_at=CASE WHEN cancel_requested_at IS NOT NULL OR ${permanent} OR attempts>=max_attempts THEN now() ELSE NULL END,
      next_attempt_at=now()+make_interval(secs => ${Math.min(300, 2 ** job.attempts)}),
      lease_token=NULL,lease_until=NULL WHERE id=${ref.eventId} AND school_id=${ref.schoolId} AND lease_token=${job.token}`;
    await db.$executeRaw`UPDATE workflow_events SET available_at=now()+make_interval(secs => ${Math.min(300, 2 ** job.attempts)}) WHERE id=${ref.eventId} AND school_id=${ref.schoolId}`;
  } finally {
    clearInterval(heartbeat);
  }
}

/** Only call after live operator authorization; scope is never inferred from a previous job. */
export async function cancel(db: Sql, ref: Reference) {
  return db.$executeRaw`UPDATE workflow_jobs SET cancel_requested_at=now(),updated_at=now(),
    state=CASE WHEN state IN ('queued','retrying','failed') THEN 'cancelled' ELSE state END,
    finished_at=CASE WHEN state IN ('queued','retrying','failed') THEN now() ELSE finished_at END
    WHERE id=${ref.eventId} AND school_id=${ref.schoolId} AND state NOT IN ('completed','cancelled')`;
}

export async function reconcile(db: Sql, schoolId: string) {
  return db.$queryRaw`SELECT e.id,e.kind,e.version,e.created_at,e.dispatched_at,e.dispatch_count,j.state,j.attempts,j.checkpoint,j.reason,j.started_at,j.finished_at,j.cancel_requested_at,
    (SELECT count(*)::int FROM workflow_effects f WHERE f.job_id=e.id AND f.school_id=e.school_id AND f.state='uncertain') AS uncertain_effects,
    CASE WHEN j.id IS NULL THEN 'orphaned' WHEN j.state='failed' THEN 'dead-letter'
      WHEN j.state='running' AND j.lease_until < now() THEN 'stuck'
      WHEN j.state IN ('queued','retrying') AND e.available_at < now()-interval '5 minutes' THEN 'overdue'
      ELSE 'tracked' END AS reconciliation
    FROM workflow_events e LEFT JOIN workflow_jobs j ON j.id=e.id AND j.school_id=e.school_id
    WHERE e.school_id=${schoolId} ORDER BY e.created_at LIMIT 500`;
}
