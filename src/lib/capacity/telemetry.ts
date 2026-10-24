import type { ServiceClass } from "./policy";

/**
 * SKO-451 request telemetry for this application instance: latency, outcome and admission per service class and
 * school. Only identifiers and timings are kept, never request bodies or pupil data. Samples live five minutes.
 */
type Outcome = "ok" | "error" | "rejected" | "timeout";
type Sample = { at: number; serviceClass: ServiceClass; workload: string; schoolId: string; ms: number; outcome: Outcome };
const WINDOW_MS = 5 * 60_000, MAX = 20_000;
// Shared by every route bundle in this process.
const g = globalThis as unknown as { __skCapacity?: { samples: Sample[]; startedAt: Date; inflight: Map<string, number>; peaks: Map<string, { peak: number; limit: number }> } };
const state = (g.__skCapacity ??= { samples: [] as Sample[], startedAt: new Date(), inflight: new Map(), peaks: new Map() });
const { samples, startedAt, inflight, peaks } = state;

export function record(serviceClass: ServiceClass, workload: string, schoolId: string, ms: number, outcome: Outcome) {
  samples.push({ at: Date.now(), serviceClass, workload, schoolId, ms, outcome });
  if (samples.length > MAX) samples.splice(0, samples.length - MAX);
}
/** In-flight background requests per school and the highest seen against the limit that applied at the time. */
export function trackInflight(schoolId: string, delta: number, limit: number) {
  const n = Math.max(0, (inflight.get(schoolId) ?? 0) + delta);
  inflight.set(schoolId, n);
  const p = peaks.get(schoolId);
  if (delta > 0 && (!p || n > p.peak)) peaks.set(schoolId, { peak: n, limit });
}
export function resetPeaks() { peaks.clear(); }

/** Measure one request. Outcome is an error when the handler throws or answers 5xx. */
export async function measure<T>(serviceClass: ServiceClass, workload: string, schoolId: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    const status = result instanceof Response ? result.status : 200;
    record(serviceClass, workload, schoolId, performance.now() - t0, status === 429 ? "rejected" : status === 503 ? "timeout" : status >= 500 ? "error" : "ok");
    return result;
  } catch (error) {
    record(serviceClass, workload, schoolId, performance.now() - t0, "error");
    throw error;
  }
}

const pct = (sorted: number[], p: number) => sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]) : null;
export function summarize(rows: { ms: number; outcome: Outcome }[]) {
  const done = rows.filter(r => r.outcome !== "rejected");
  const ms = done.map(r => r.ms).sort((a, b) => a - b);
  return {
    count: rows.length, p50: pct(ms, 0.5), p95: pct(ms, 0.95), p99: pct(ms, 0.99), maxMs: ms.length ? Math.round(ms[ms.length - 1]) : null,
    errors: rows.filter(r => r.outcome === "error").length, rejected: rows.filter(r => r.outcome === "rejected").length, timeouts: rows.filter(r => r.outcome === "timeout").length,
    errorRate: rows.length ? rows.filter(r => r.outcome === "error" || r.outcome === "timeout").length / rows.length : null,
  };
}

export function snapshot() {
  const now = Date.now();
  const live = samples.filter(s => now - s.at <= WINDOW_MS);
  const classes = (["CRITICAL", "INTERACTIVE", "BACKGROUND"] as ServiceClass[]).map(c => ({ serviceClass: c, ...summarize(live.filter(s => s.serviceClass === c)) }));
  const schools = [...new Set(live.map(s => s.schoolId))].map(schoolId => {
    const own = live.filter(s => s.schoolId === schoolId);
    return { schoolId, ...summarize(own), background: summarize(own.filter(s => s.serviceClass === "BACKGROUND")), inflight: inflight.get(schoolId) ?? 0, peakBackground: peaks.get(schoolId) ?? null };
  }).sort((a, b) => b.count - a.count).slice(0, 25);
  const latest = live.length ? new Date(live[live.length - 1].at) : null;
  return {
    scope: "This application instance", startedAt, windowSeconds: WINDOW_MS / 1000, measuredAt: new Date(now), latestSampleAt: latest,
    // No samples is not a healthy service: it is an unmeasured one.
    state: live.length ? (now - live[live.length - 1].at > 60_000 ? "STALE" : "MEASURED") : "NO_MEASUREMENT",
    classes, schools,
  };
}
