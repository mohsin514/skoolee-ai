// SKAI-1840 — a cheap "this student may be in an exam" signal for the proxy.
//
// The candidate exam boundary in src/proxy.ts reads authoritative database
// state on every student request (revocation, principal, pupil row, attempt).
// That stays the source of truth. This marker only lets the proxy skip that
// work for students who cannot have an active attempt.
//
// It is fail-closed by construction:
//   - the marker is written before the transaction that starts (or resumes, or
//     extends) an attempt commits, and a failed write aborts that transaction
//     while the gate is on, so a committed IN_PROGRESS attempt implies a marker
//     that lives at least until its deadline;
//   - absence is trusted only when Redis answered; Redis off, slow or erroring
//     means "run the full database check";
//   - nothing negative is cached: no key means "check nothing" only while Redis
//     says so, and the next start writes the key before it commits.
// The marker is never deleted early: an over-long marker only costs the full check.
//
// The read side is behind EXAM_BOUNDARY_REDIS_GATE=1 so markers can be written
// for a full exam window before the proxy starts trusting their absence.
import { createHash } from "node:crypto";
import { isRealtimeEnabled } from "@/lib/queue/redis-config";

type Env = Record<string, string | undefined>;
export interface ExamMarkerClient {
  /** ioredis connection state; reads are skipped unless "ready" so an outage never grows the offline queue. */
  status?: string;
  get(key: string): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  /** ioredis pipeline: many marker writes in one round trip (SKAI-1982). Optional so plain stubs still work. */
  pipeline?(): { eval(script: string, numKeys: number, ...args: (string | number)[]): unknown; exec(): Promise<Array<[Error | null, unknown]> | null> };
}
type Options = { env?: Env; client?: ExamMarkerClient; now?: Date; timeoutMs?: number };

/** Kept past the deadline so clock skew or a late extension never shortens confinement. */
export const EXAM_MARKER_GRACE_MS = 15 * 60_000;
const READ_TIMEOUT_MS = 150;
const WRITE_TIMEOUT_MS = 1_000;

// Extend-only: a write never shortens an existing marker's lifetime.
const EXTEND_SCRIPT = `
local t = redis.call('PTTL', KEYS[1])
if t < tonumber(ARGV[1]) then redis.call('SET', KEYS[1], '1', 'PX', ARGV[1]) end
return 1`;

export function examMarkerKey(userId: string) {
  return `exam-active:${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

export function examMarkerWritesEnabled(env: Env = process.env) {
  return isRealtimeEnabled(env);
}

export function examMarkerGateEnabled(env: Env = process.env) {
  return examMarkerWritesEnabled(env) && env.EXAM_BOUNDARY_REDIS_GATE === "1";
}

async function defaultClient(): Promise<ExamMarkerClient> {
  const { redis } = await import("@/lib/queue/connection");
  return redis;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("exam marker: Redis timed out")), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// A client in one of these states has lost its connection: a command sent now would only wait in the
// offline queue until the timeout. The first connect ("wait"/"connecting"/"connect") is still tried.
const DISCONNECTED = new Set(["reconnecting", "close", "end"]);

export type ExamMarkerEntry = { userId: string; deadlineAt: Date };

/**
 * Records that `userId` may be confined until `deadlineAt` (plus grace). Call it inside the
 * transaction that starts, resumes or extends an IN_PROGRESS attempt, before it commits.
 * While the gate is on a failed write throws, rolling that transaction back.
 */
export async function markCandidateExamActive(userId: string, deadlineAt: Date, options: Options = {}): Promise<void> {
  return markCandidatesExamActive([{ userId, deadlineAt }], options);
}

/**
 * SKAI-1982: the bulk form for a room-wide extend or resume. One pipelined round trip (one extend-only
 * EVAL per key, so keys in different cluster slots still work) under one timeout, using the latest
 * deadline per account. A disconnected client fails at once instead of queueing. Failure semantics
 * match the single write: logged with the gate off; with the gate on any failed key throws.
 */
export async function markCandidatesExamActive(entries: ExamMarkerEntry[], options: Options = {}): Promise<void> {
  const env = options.env ?? process.env;
  if (!entries.length || !examMarkerWritesEnabled(env)) return;
  const nowMs = (options.now ?? new Date()).getTime();
  const latest = new Map<string, number>();
  for (const { userId, deadlineAt } of entries) latest.set(userId, Math.max(latest.get(userId) ?? -Infinity, deadlineAt.getTime()));
  const writes = [...latest].map(([userId, at]) => [examMarkerKey(userId), Math.max(0, at - nowMs) + EXAM_MARKER_GRACE_MS] as const);
  try {
    const client = options.client ?? await defaultClient();
    if (client.status !== undefined && DISCONNECTED.has(client.status)) throw new Error(`exam marker: Redis ${client.status}`);
    const sent: Promise<unknown> = client.pipeline
      ? (() => {
        const batch = client.pipeline!();
        for (const [key, ttlMs] of writes) batch.eval(EXTEND_SCRIPT, 1, key, ttlMs);
        return batch.exec().then(results => {
          if (!results || results.length !== writes.length) throw new Error("exam marker: pipeline aborted");
          const failed = results.find(([error]) => error);
          if (failed) throw failed[0];
        });
      })()
      : Promise.all(writes.map(([key, ttlMs]) => client.eval(EXTEND_SCRIPT, 1, key, ttlMs)));
    await withTimeout(sent, options.timeoutMs ?? WRITE_TIMEOUT_MS);
  } catch (error) {
    console.error("[exam-marker] could not record an active exam", error instanceof Error ? error.message : error);
    if (!examMarkerGateEnabled(env)) return;
    // Loaded lazily: the proxy imports this module and must not pull in route helpers.
    const { ApiError } = await import("@/lib/api/scope");
    throw new ApiError("Exam session status is unavailable. Retry to continue safely.", 503, "EXAM_SESSION_UNAVAILABLE");
  }
}

/**
 * false only when the gate is on and Redis positively answered "no marker". Every
 * other outcome (gate off, Redis disabled, error, timeout) means "run the full check".
 */
export async function candidateMayBeInExam(userId: string, options: Options = {}): Promise<boolean> {
  if (!examMarkerGateEnabled(options.env ?? process.env)) return true;
  try {
    const client = options.client ?? await defaultClient();
    if (client.status !== undefined && client.status !== "ready") return true;
    return (await withTimeout(client.get(examMarkerKey(userId)), options.timeoutMs ?? READ_TIMEOUT_MS)) !== null;
  } catch {
    return true;
  }
}
