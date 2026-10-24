import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { runWithTenantContext } from "../db/tenant-context";

export type Sql = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export type Database = Sql & { $transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> };
export type Reference = { eventId: string; schoolId: string };
export type Event = Reference & { kind: string; version: number; referenceId: string; actorId: string };
type Claim = Event & { token: string; attempts: number; checkpoint: number };
const LEASE_SECONDS = 60;
type StopReason = "INVALID_FILE" | "PROVIDER_UNAVAILABLE" | "LEASE_LOST" | "CANCEL_REQUESTED" | "EXTERNAL_OUTCOME_UNCERTAIN" | "UNSUPPORTED_VERSION" | "UNKNOWN_EVENT_KIND" | "AUTHORIZATION_OR_PUBLICATION_REVOKED";
export class WorkflowStopped extends Error {
  constructor(readonly reason: StopReason) { super(reason); }
}

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
// SKO-451: dispatch is fair across schools. Each pass takes at most a few events per school (oldest first,
// critical kinds first), interleaved so one school's backlog cannot hold the batch, and a school's background
// events wait while its in-flight jobs (running, or dispatched in the last minute and not yet claimed) reach its
// BACKGROUND_JOBS policy limit. Critical kinds (exam and payment confirmation) are never held back by that limit.
export const DEFAULT_BACKGROUND_JOBS = 3;
const CRITICAL_SQL = Prisma.sql`(e.kind = 'PAYMENT_CONFIRMATION' OR left(e.kind, 5) = 'EXAM_')`;
export async function dispatch(db: Database, publish: (ref: Reference, deliveryId: string, meta: { kind: string; priority: number }) => Promise<unknown>, limit = 50, perSchool = 10) {
  const token = randomUUID();
  const events = await db.$queryRaw<(Reference & { dispatchCount: number; kind: string; critical: boolean; availableAt: Date })[]>`
    WITH ready AS (
      SELECT e.id, e.school_id, e.available_at, e.kind, ${CRITICAL_SQL} AS critical
      FROM workflow_events e JOIN workflow_jobs j ON j.id=e.id AND j.school_id=e.school_id
      WHERE j.state IN ('queued','retrying','running') AND e.available_at <= now()
        AND (e.lease_until IS NULL OR e.lease_until < now())
        AND (j.lease_until IS NULL OR j.lease_until < now())
    ), schools AS (SELECT DISTINCT school_id FROM ready),
    -- resource_policies is written by Prisma in UTC; compare its expiry in UTC whatever the session time zone.
    policy AS (
      SELECT DISTINCT ON (target_school_id) target_school_id, limit_value FROM resource_policies
      WHERE scope='BACKGROUND_JOBS' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > (now() AT TIME ZONE 'UTC'))
      ORDER BY target_school_id, created_at DESC
    ), inflight AS (
      SELECT j.school_id, count(*)::int AS n FROM workflow_jobs j JOIN workflow_events e ON e.id=j.id AND e.school_id=j.school_id
      WHERE NOT ${CRITICAL_SQL} AND ((j.state='running' AND j.lease_until > now())
        OR (j.state IN ('queued','retrying') AND e.dispatched_at > now() - interval '60 seconds' AND e.available_at > now()))
      GROUP BY j.school_id
    ), picked AS (
      SELECT p.id, p.critical, p.rn, p.available_at FROM schools s
      LEFT JOIN inflight f ON f.school_id = s.school_id
      LEFT JOIN policy pt ON pt.target_school_id = s.school_id
      LEFT JOIN policy pd ON pd.target_school_id IS NULL
      CROSS JOIN LATERAL (
        SELECT r.id, r.critical, r.available_at,
          row_number() OVER (ORDER BY r.critical DESC, r.available_at) AS rn,
          CASE WHEN r.critical THEN 0 ELSE row_number() OVER (PARTITION BY r.critical ORDER BY r.available_at) END AS bn
        FROM (SELECT * FROM ready r WHERE r.school_id = s.school_id ORDER BY r.critical DESC, r.available_at LIMIT ${Math.min(Math.max(perSchool, 1), 100)}) r
      ) p
      WHERE p.critical OR p.bn <= GREATEST(0, COALESCE(pt.limit_value, pd.limit_value, ${DEFAULT_BACKGROUND_JOBS}) - COALESCE(f.n, 0))
      ORDER BY p.critical DESC, p.rn, p.available_at
      LIMIT ${Math.min(Math.max(limit, 1), 500)}
    ) UPDATE workflow_events e SET lease_token=${token}, lease_until=now()+ interval '60 seconds', dispatch_count=dispatch_count+1
      FROM picked c WHERE e.id=c.id AND (e.lease_until IS NULL OR e.lease_until < now())
      RETURNING e.id AS "eventId", e.school_id AS "schoolId", e.dispatch_count AS "dispatchCount", e.kind, ${CRITICAL_SQL} AS critical, e.available_at AS "availableAt"`;
  // Publish in the fair order: critical first, then one event per school per round.
  events.sort((a, b) => Number(b.critical) - Number(a.critical) || a.availableAt.getTime() - b.availableAt.getTime());
  const rounds = new Map<string, number>();
  const ranked = events.map(e => { const r = rounds.get(e.schoolId) ?? 0; rounds.set(e.schoolId, r + 1); return { e, r }; });
  ranked.sort((a, b) => Number(b.e.critical) - Number(a.e.critical) || a.r - b.r);
  events.splice(0, events.length, ...ranked.map(x => x.e));
  for (const event of events) {
    try {
      // A fresh delivery identity permits recovery after Redis loss/removal. Consumer fences duplicates.
      await publish({ eventId: event.eventId, schoolId: event.schoolId }, `${event.eventId}-${event.dispatchCount}`, { kind: event.kind, priority: event.critical ? 1 : event.kind === "REPORT_DELIVERY" || event.kind === "SCHOOL_AI_ANNOUNCEMENT" ? 5 : 10 });
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
    const reason = uncertain.length ? "EXTERNAL_OUTCOME_UNCERTAIN" : error instanceof WorkflowStopped ? error.reason : "WORKER_FAILURE";
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

export async function reconcile(db: Sql, schoolId: string, eventId?: string) {
  return db.$queryRaw`SELECT e.id,e.kind,e.version,e.created_at,e.dispatched_at,e.dispatch_count,j.state,j.attempts,j.max_attempts,j.checkpoint,j.reason,j.started_at,j.finished_at,j.cancel_requested_at,j.updated_at,j.next_attempt_at,j.lease_until,
    GREATEST(0,EXTRACT(EPOCH FROM (now()-e.created_at)))::int AS event_age_seconds,
    CASE WHEN j.state IN ('queued','retrying') THEN GREATEST(0,EXTRACT(EPOCH FROM (now()-e.available_at)))::int ELSE 0 END AS pending_age_seconds,
    (SELECT count(*)::int FROM workflow_effects f WHERE f.job_id=e.id AND f.school_id=e.school_id AND f.state='committed') AS confirmed_effects,
    (SELECT count(*)::int FROM workflow_effects f WHERE f.job_id=e.id AND f.school_id=e.school_id AND f.state='uncertain') AS uncertain_effects,
    CASE WHEN j.id IS NULL THEN 'orphaned' WHEN j.state='failed' THEN 'dead-letter'
      WHEN j.state='running' AND (j.lease_until IS NULL OR j.lease_until < now()) THEN 'stuck'
      WHEN j.state IN ('queued','retrying') AND e.available_at < now()-interval '5 minutes' THEN 'overdue'
      ELSE 'tracked' END AS reconciliation
    FROM workflow_events e LEFT JOIN workflow_jobs j ON j.id=e.id AND j.school_id=e.school_id
    WHERE e.school_id=${schoolId} AND (${eventId ?? null}::text IS NULL OR e.id=${eventId ?? null})
    ORDER BY CASE WHEN j.id IS NULL OR j.state='failed' THEN 0 WHEN j.state IN ('completed','cancelled') THEN 2 ELSE 1 END,e.created_at LIMIT 500`;
}
