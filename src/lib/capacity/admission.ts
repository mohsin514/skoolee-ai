import { GLOBAL_BACKGROUND_REQUESTS, limitFor, type ServiceClass } from "./policy";
import { measure, record, trackInflight } from "./telemetry";

/**
 * SKO-451 admission for background requests (exports, scans, generation). A school past its concurrent limit, or
 * an instance past its total, gets an immediate 429 with Retry-After and a reason it can act on; nothing waits in
 * memory and nothing hangs. A read-only background request past its deadline answers 503 rather than running on.
 */
const g = globalThis as unknown as { __skAdmission?: { perSchool: Map<string, number>; total: number } };
const slots = (g.__skAdmission ??= { perSchool: new Map(), total: 0 });
const perSchool = slots.perSchool;

export const BACKGROUND_DEADLINE_MS = Number(process.env.CAPACITY_BACKGROUND_DEADLINE_MS || 25_000);
const headers = (retryAfter: number) => ({ "Retry-After": String(retryAfter), "Cache-Control": "private, no-store" });

export function rejection(reason: "SCHOOL_LIMIT" | "PLATFORM_LIMIT", retryAfter: number, limit: number) {
  return Response.json({
    success: false, code: "BACKGROUND_LIMIT", reason, retryAfterSeconds: retryAfter, limit,
    error: reason === "SCHOOL_LIMIT"
      ? `Background exports are limited; interactive school work remains prioritized. Your school already has ${limit} running. Try again in ${retryAfter} seconds.`
      : `Background work is busy across the service; interactive school work remains prioritized. Try again in ${retryAfter} seconds.`,
  }, { status: 429, headers: headers(retryAfter) });
}

export async function withBackgroundAdmission(schoolId: string, workload: string, fn: () => Promise<Response>, opts: { readOnly?: boolean } = {}): Promise<Response> {
  const { limit } = await limitFor(schoolId, "BACKGROUND_REQUESTS");
  const mine = perSchool.get(schoolId) ?? 0;
  if (mine >= limit || slots.total >= GLOBAL_BACKGROUND_REQUESTS) {
    record("BACKGROUND", workload, schoolId, 0, "rejected");
    return rejection(mine >= limit ? "SCHOOL_LIMIT" : "PLATFORM_LIMIT", mine >= limit ? 10 : 5, limit);
  }
  perSchool.set(schoolId, mine + 1); slots.total++;
  trackInflight(schoolId, 1, limit);
  try {
    return await measure("BACKGROUND", workload, schoolId, async () => {
      if (!opts.readOnly) return fn();
      let timer: NodeJS.Timeout | undefined;
      const late = new Promise<Response>(resolve => { timer = setTimeout(() => resolve(Response.json({ success: false, code: "DEADLINE", error: "This export took too long and was stopped. Nothing was changed. Try again with a narrower filter." }, { status: 503, headers: headers(30) })), BACKGROUND_DEADLINE_MS); });
      try { return await Promise.race([fn(), late]); } finally { clearTimeout(timer); }
    });
  } finally {
    perSchool.set(schoolId, Math.max(0, (perSchool.get(schoolId) ?? 1) - 1)); slots.total = Math.max(0, slots.total - 1);
    trackInflight(schoolId, -1, limit);
  }
}

/** Critical and interactive work is measured only; background quotas never apply to it. */
export function measured(serviceClass: Exclude<ServiceClass, "BACKGROUND">, workload: string, schoolId: string, fn: () => Promise<Response>) {
  return measure(serviceClass, workload, schoolId, fn);
}

export function inflightBackground() { return { total: slots.total, perSchool: Object.fromEntries(perSchool) }; }
