import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";

/**
 * SKO-451 documented service policy. Work is placed in a service class by what it does, not by who asks:
 *  - CRITICAL: exam answer saves and submission, payment confirmation. Never shed by background quotas; a request
 *    that cannot finish reports an unknown outcome to retry with the same operation identity, never success.
 *  - INTERACTIVE: attendance, marking and everyday pages. Measured, not throttled by these quotas.
 *  - BACKGROUND: exports, scans/OCR, generation and report batches. Limited per school and in total so one busy
 *    school cannot starve the others; excess work is refused with a retry time, never queued silently in memory.
 * Limits are per application instance for requests and platform-wide for durable jobs (the outbox).
 */
export type ServiceClass = "CRITICAL" | "INTERACTIVE" | "BACKGROUND";
export type Scope = "BACKGROUND_REQUESTS" | "BACKGROUND_JOBS";

export const DEFAULTS: Record<Scope, number> = { BACKGROUND_REQUESTS: 2, BACKGROUND_JOBS: 3 };
/** Instance-wide ceiling on concurrent background requests across all schools. */
export const GLOBAL_BACKGROUND_REQUESTS = Number(process.env.CAPACITY_GLOBAL_BACKGROUND || 8);
// Durable job kinds are classified in the outbox dispatcher: PAYMENT_CONFIRMATION and EXAM_* are critical.
export const OBJECTIVES = [
  { key: "critical_p95_ms", label: "Exam answer save p95", serviceClass: "CRITICAL", metric: "p95", max: 800 },
  { key: "critical_error_rate", label: "Exam answer save errors", serviceClass: "CRITICAL", metric: "errorRate", max: 0.005 },
  { key: "interactive_p95_ms", label: "Attendance register p95 for other schools", serviceClass: "INTERACTIVE", metric: "p95", max: 1500 },
  { key: "interactive_error_rate", label: "Attendance register errors", serviceClass: "INTERACTIVE", metric: "errorRate", max: 0.01 },
  { key: "critical_fairness_ratio", label: "Exam answer save p95 under noise vs quiet baseline", serviceClass: "CRITICAL", metric: "fairnessRatio", max: 2 },
  { key: "interactive_fairness_ratio", label: "Attendance register p95 under noise vs quiet baseline", serviceClass: "INTERACTIVE", metric: "fairnessRatio", max: 2 },
  { key: "background_within_limit", label: "Noisy school stays within its background limit", serviceClass: "BACKGROUND", metric: "peakOverLimit", max: 0 },
  { key: "no_hung_requests", label: "No request runs past the deadline", serviceClass: "ALL", metric: "maxMs", max: 30_000 },
] as const;

type Row = { id: string; targetSchoolId: string | null; scope: string; limitValue: number; expiresAt: Date | null; createdAt: Date; reason: string };
let cache: { at: number; rows: Row[] } | null = null;
const TTL_MS = 5_000;

/** Active (unrevoked, unexpired) policies, newest first. Read across schools: this is platform configuration. */
export async function activePolicies(force = false): Promise<Row[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await runUnscoped("capacity: read platform resource policy", () => prisma.resourcePolicy.findMany({
    where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { id: true, targetSchoolId: true, scope: true, limitValue: true, expiresAt: true, createdAt: true, reason: true },
    orderBy: { createdAt: "desc" },
  }));
  cache = { at: Date.now(), rows };
  return rows;
}
export function invalidatePolicies() { cache = null; }

/** The effective limit: the newest tenant policy, else the newest platform default, else the documented default. */
export function effective(rows: Row[], schoolId: string | null, scope: Scope) {
  const tenant = schoolId ? rows.find(r => r.targetSchoolId === schoolId && r.scope === scope) : undefined;
  const platform = rows.find(r => r.targetSchoolId === null && r.scope === scope);
  const source = tenant ?? platform;
  return { limit: source?.limitValue ?? DEFAULTS[scope], policyId: source?.id ?? null, source: tenant ? "TENANT_POLICY" : platform ? "PLATFORM_POLICY" : "DEFAULT", expiresAt: source?.expiresAt ?? null };
}

export async function limitFor(schoolId: string, scope: Scope) {
  try { return effective(await activePolicies(), schoolId, scope); }
  // Policy storage unavailable: fall back to the documented default rather than unlimited.
  catch { return { limit: DEFAULTS[scope], policyId: null, source: "DEFAULT" as const, expiresAt: null }; }
}
