import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { ApiError } from "@/lib/api/scope";
import { activePolicies, DEFAULTS, effective, GLOBAL_BACKGROUND_REQUESTS, invalidatePolicies, OBJECTIVES, type Scope } from "./policy";
import { snapshot } from "./telemetry";
import { inflightBackground } from "./admission";
import { evaluate, type RunReport } from "./objectives";

/**
 * SKO-451 operator view of capacity: measured telemetry kept apart from estimates, queue pressure per school,
 * resource policy with audited, scoped, expiring and reversible changes, and recorded performance runs. A policy
 * change is not a fix until a later run measures its effect, so the report asks for one.
 */

const json = (v: unknown) => v as Prisma.InputJsonValue;
function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiError(r.error.issues[0]?.message ?? "Invalid request", 400);
  return r.data;
}
const unscoped = <T>(why: string, fn: () => Promise<T>) => runUnscoped(`capacity: ${why}`, fn);

type Pressure = { available: true; measuredAt: Date; probeMs: number; connections: number; active: number; idleInTransaction: number; waitingOnLocks: number; maxConnections: number } | { available: false; measuredAt: Date; reason: string };
/** Database pool pressure from the server's own view. A failure is reported as unavailable, never as healthy. */
export async function databasePressure(db: { $queryRaw: typeof prisma.$queryRaw } = prisma): Promise<Pressure> {
  const t0 = performance.now();
  try {
    const rows = await db.$queryRaw<{ connections: number; active: number; idle_tx: number; waiting: number; max: number }[]>`
      SELECT count(*)::int AS connections, count(*) FILTER (WHERE state='active')::int AS active,
        count(*) FILTER (WHERE state LIKE 'idle in transaction%')::int AS idle_tx,
        count(*) FILTER (WHERE wait_event_type='Lock')::int AS waiting,
        current_setting('max_connections')::int AS max
      FROM pg_stat_activity WHERE datname = current_database()`;
    const r = rows[0];
    return { available: true, measuredAt: new Date(), probeMs: Math.round(performance.now() - t0), connections: r.connections, active: r.active, idleInTransaction: r.idle_tx, waitingOnLocks: r.waiting, maxConnections: r.max };
  } catch { return { available: false, measuredAt: new Date(), reason: "Telemetry is unavailable; do not infer healthy service." }; }
}

/** Durable queue by school: measured counts and ages, plus a labelled estimate of time to drain. */
async function queueBySchool() {
  try {
    const rows = await prisma.$queryRaw<{ school_id: string; pending: number; running: number; failed_24h: number; oldest_pending_s: number | null; completed_15m: number }[]>`
      SELECT j.school_id,
        count(*) FILTER (WHERE j.state IN ('queued','retrying'))::int AS pending,
        count(*) FILTER (WHERE j.state='running' AND j.lease_until > now())::int AS running,
        count(*) FILTER (WHERE j.state='failed' AND j.updated_at > now() - interval '24 hours')::int AS failed_24h,
        max(EXTRACT(EPOCH FROM now() - e.available_at)) FILTER (WHERE j.state IN ('queued','retrying') AND e.available_at <= now())::int AS oldest_pending_s,
        count(*) FILTER (WHERE j.state='completed' AND j.finished_at > now() - interval '15 minutes')::int AS completed_15m
      FROM workflow_jobs j JOIN workflow_events e ON e.id=j.id AND e.school_id=j.school_id
      WHERE j.state IN ('queued','retrying','running') OR j.updated_at > now() - interval '24 hours'
      GROUP BY j.school_id ORDER BY pending DESC, running DESC LIMIT 25`;
    const names = await unscoped("name schools in the queue report", () => prisma.school.findMany({ where: { id: { in: rows.map(r => r.school_id) } }, select: { id: true, name: true } }));
    const nameOf = new Map(names.map(n => [n.id, n.name]));
    return {
      available: true as const, measuredAt: new Date(),
      schools: rows.map(r => ({
        schoolId: r.school_id, name: nameOf.get(r.school_id) ?? null, pending: r.pending, running: r.running, failed24h: r.failed_24h, oldestPendingSeconds: r.oldest_pending_s ?? 0,
        estimate: r.pending === 0 ? null : r.completed_15m > 0 ? { kind: "ESTIMATE", drainMinutes: Math.ceil(r.pending / (r.completed_15m / 15)), basis: "completed jobs in the last 15 minutes" } : { kind: "ESTIMATE", drainMinutes: null, basis: "no completions in the last 15 minutes" },
      })),
    };
  } catch { return { available: false as const, measuredAt: new Date(), reason: "Telemetry is unavailable; do not infer healthy service.", schools: [] }; }
}

export async function report() {
  const [db, queue, policies, history, runs, schoolList] = await Promise.all([
    databasePressure(), queueBySchool(), activePolicies(true),
    unscoped("policy history", () => prisma.resourcePolicy.findMany({ orderBy: { createdAt: "desc" }, take: 50 })),
    unscoped("recorded performance runs", () => prisma.performanceRun.findMany({ orderBy: { finishedAt: "desc" }, take: 20 })),
    unscoped("schools a policy can target", () => prisma.school.findMany({ where: { status: { not: "DELETED" } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 })),
  ]);
  const ids = [...new Set([...history.map(h => h.targetSchoolId).filter((x): x is string => !!x)])];
  const schools = await unscoped("name schools in policy history", () => prisma.school.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }));
  const nameOf = new Map(schools.map(s => [s.id, s.name]));
  const lastChange = history.reduce<Date | null>((at, h) => { const t = h.revokedAt && h.revokedAt > h.createdAt ? h.revokedAt : h.createdAt; return !at || t > at ? t : at; }, null);
  const lastRun = runs[0]?.finishedAt ?? null;
  return {
    requests: snapshot(), inflight: inflightBackground(), database: db, queue,
    policy: {
      defaults: { ...DEFAULTS, GLOBAL_BACKGROUND_REQUESTS }, platform: { BACKGROUND_REQUESTS: effective(policies, null, "BACKGROUND_REQUESTS"), BACKGROUND_JOBS: effective(policies, null, "BACKGROUND_JOBS") },
      active: policies.map(p => ({ ...p, schoolName: p.targetSchoolId ? nameOf.get(p.targetSchoolId) ?? null : null })),
      history: history.map(h => ({ id: h.id, targetSchoolId: h.targetSchoolId, schoolName: h.targetSchoolId ? nameOf.get(h.targetSchoolId) ?? null : null, scope: h.scope, limitValue: h.limitValue, reason: h.reason, expiresAt: h.expiresAt, createdAt: h.createdAt, revokedAt: h.revokedAt, revokeReason: h.revokeReason })),
    },
    objectives: OBJECTIVES,
    runs: runs.map(r => ({ id: r.id, runId: r.runId, profile: r.profile, environment: r.environment, release: r.release, dataset: r.dataset, concurrency: r.concurrency, results: r.results, objectives: r.objectives, passed: r.passed, policyIds: r.policyIds, notes: r.notes, startedAt: r.startedAt, finishedAt: r.finishedAt })),
    followUpRequired: !!lastChange && (!lastRun || lastRun < lastChange),
    schools: schoolList,
    lastPolicyChangeAt: lastChange,
  };
}

async function audit(actorId: string, action: string, targetId: string | null, targetName: string | null, oldValues: unknown, newValues: unknown) {
  await prisma.superAdminAuditLog.create({ data: { userId: actorId, action, targetType: "resource_policy", targetId, targetName, oldValues: json(oldValues), newValues: json(newValues) } });
}

const applyInput = z.object({
  targetSchoolId: z.string().min(1).max(100).nullish(), scope: z.enum(["BACKGROUND_REQUESTS", "BACKGROUND_JOBS"]),
  limitValue: z.number().int().min(0).max(1000), reason: z.string().trim().min(10, "Give the incident or reason (at least 10 characters).").max(2000),
  expiresAt: z.string().datetime({ offset: true }).nullish(),
});
export async function applyPolicy(actorId: string, raw: unknown) {
  const input = parse(applyInput, raw);
  const target = input.targetSchoolId ?? null;
  // A school-scoped change is an incident measure: it must end on its own.
  if (target && !input.expiresAt) throw new ApiError("A school-scoped change needs an expiry, such as the end of the incident.", 400);
  if (input.expiresAt && new Date(input.expiresAt) <= new Date()) throw new ApiError("Choose a future expiry.", 400);
  let schoolName: string | null = null;
  if (target) {
    const school = await unscoped("verify policy target school", () => prisma.school.findUnique({ where: { id: target }, select: { name: true } }));
    if (!school) throw new ApiError("School not found", 404);
    schoolName = school.name;
  }
  const before = effective(await activePolicies(true), target, input.scope as Scope);
  const row = await unscoped("record resource policy", () => prisma.resourcePolicy.create({ data: { targetSchoolId: target, scope: input.scope, limitValue: input.limitValue, reason: input.reason, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, createdById: actorId } }));
  invalidatePolicies();
  const after = effective(await activePolicies(true), target, input.scope as Scope);
  await audit(actorId, "capacity_policy_apply", row.id, schoolName ?? "Platform default", { scope: input.scope, limit: before.limit, source: before.source }, { scope: input.scope, limit: after.limit, reason: input.reason, expiresAt: input.expiresAt ?? null, target: target ?? "platform" });
  return { id: row.id, before, after, message: "Scoped policy applied. A follow-up measurement is required." };
}

export async function revertPolicy(actorId: string, raw: unknown) {
  const input = parse(z.object({ id: z.string().uuid(), reason: z.string().trim().min(5, "Say why the change is reverted.").max(2000) }), raw);
  const row = await unscoped("find resource policy", () => prisma.resourcePolicy.findUnique({ where: { id: input.id } }));
  if (!row) throw new ApiError("Policy not found", 404);
  if (row.revokedAt) throw new ApiError("This change was already reverted.", 409);
  const before = effective(await activePolicies(true), row.targetSchoolId, row.scope as Scope);
  await unscoped("revert resource policy", () => prisma.resourcePolicy.update({ where: { id: row.id }, data: { revokedAt: new Date(), revokedById: actorId, revokeReason: input.reason } }));
  invalidatePolicies();
  const after = effective(await activePolicies(true), row.targetSchoolId, row.scope as Scope);
  await audit(actorId, "capacity_policy_revert", row.id, row.targetSchoolId ?? "Platform default", { scope: row.scope, limit: before.limit }, { scope: row.scope, limit: after.limit, source: after.source, reason: input.reason });
  return { id: row.id, before, after, message: "Change reverted; the previous limit applies again. A follow-up measurement is required." };
}

const runInput = z.object({
  runId: z.string().trim().min(3).max(80), profile: z.string().trim().min(2).max(120), environment: z.string().trim().min(2).max(200), release: z.string().trim().min(2).max(80),
  dataset: z.record(z.string(), z.unknown()), concurrency: z.record(z.string(), z.unknown()),
  results: z.record(z.string(), z.object({ serviceClass: z.string(), count: z.number(), p50: z.number().nullable(), p95: z.number().nullable(), p99: z.number().nullable(), maxMs: z.number().nullable(), errors: z.number(), rejected: z.number(), timeouts: z.number(), errorRate: z.number().nullable() }).passthrough()),
  baseline: z.record(z.string(), z.object({ serviceClass: z.string(), count: z.number(), p50: z.number().nullable(), p95: z.number().nullable(), p99: z.number().nullable(), maxMs: z.number().nullable(), errors: z.number(), rejected: z.number(), timeouts: z.number(), errorRate: z.number().nullable() }).passthrough()).optional(),
  backgroundPeaks: z.array(z.object({ schoolId: z.string(), peak: z.number(), limit: z.number() })).default([]),
  notes: z.string().max(4000).nullish(), startedAt: z.string().datetime({ offset: true }), finishedAt: z.string().datetime({ offset: true }),
});
export async function recordRun(actorId: string, raw: unknown) {
  const input = parse(runInput, raw) as RunReport & { runId: string; notes?: string | null };
  const objectives = evaluate(input);
  const policies = await activePolicies(true);
  try {
    const row = await unscoped("record performance run", () => prisma.performanceRun.create({ data: {
      runId: input.runId, profile: input.profile, environment: input.environment, release: input.release, dataset: json(input.dataset), concurrency: json(input.concurrency),
      results: json({ workloads: input.results, baseline: input.baseline ?? null, backgroundPeaks: input.backgroundPeaks }), objectives: json(objectives), // Unmeasured is not a pass.
      passed: objectives.every(o => o.pass === true),
      policyIds: policies.map(p => p.id), notes: input.notes ?? null, startedAt: new Date(input.startedAt), finishedAt: new Date(input.finishedAt), recordedById: actorId,
    } }));
    await audit(actorId, "capacity_run_record", row.id, input.runId, null, { passed: row.passed, profile: input.profile, release: input.release });
    return { id: row.id, runId: row.runId, passed: row.passed, objectives };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("A run with this id is already recorded.", 409);
    throw error;
  }
}
