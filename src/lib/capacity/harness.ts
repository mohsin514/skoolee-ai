import type { ServiceClass } from "./policy";
import { summarize } from "./telemetry";

/**
 * SKO-451 workload runner. Each workload runs a fixed number of concurrent loops for the run's duration against
 * one origin; every request has a client deadline so nothing waits forever. Outcomes: 2xx ok, 429 rejected
 * (backpressure working), 503 or a client deadline is a timeout, anything else an error.
 */
export type Step = { path: string; method?: string; body?: unknown; cookie: string; after?: (status: number, payload: unknown) => void };
/** honorRetryAfter: after a 429 the loop waits the advised time, as the product UI and documented API clients do. */
export type Workload = { name: string; serviceClass: ServiceClass; schoolId: string; concurrency: number; pauseMs?: number; honorRetryAfter?: boolean; step: (slot: number, iteration: number) => Step };
type Outcome = "ok" | "error" | "rejected" | "timeout";

export async function runProfile(input: { origin: string; durationMs: number; workloads: Workload[]; clientTimeoutMs?: number }) {
  const startedAt = new Date(), deadline = Date.now() + input.durationMs, timeout = input.clientTimeoutMs ?? 30_000;
  const samples = new Map<string, { ms: number; outcome: Outcome; status: number }[]>(input.workloads.map(w => [w.name, []]));
  await Promise.all(input.workloads.flatMap(w => Array.from({ length: w.concurrency }, async (_, slot) => {
    for (let i = 0; Date.now() < deadline; i++) {
      const s = w.step(slot, i), t0 = performance.now();
      let status = 0, outcome: Outcome = "error", payload: unknown = null, retryAfterMs = 0;
      try {
        const r = await fetch(input.origin + s.path, { method: s.method ?? "GET", headers: { Origin: input.origin, Cookie: s.cookie, ...(s.body === undefined ? {} : { "Content-Type": "application/json" }) }, body: s.body === undefined ? undefined : JSON.stringify(s.body), redirect: "manual", signal: AbortSignal.timeout(timeout) });
        status = r.status;
        retryAfterMs = status === 429 ? Number(r.headers.get("retry-after") || 0) * 1000 : 0;
        payload = (r.headers.get("content-type") ?? "").includes("json") ? await r.json().catch(() => null) : await r.arrayBuffer().then(() => null);
        outcome = status >= 200 && status < 300 ? "ok" : status === 429 ? "rejected" : status === 503 ? "timeout" : "error";
      } catch { outcome = "timeout"; }
      samples.get(w.name)!.push({ ms: performance.now() - t0, outcome, status });
      s.after?.(status, payload);
      const wait = w.honorRetryAfter && retryAfterMs ? Math.min(retryAfterMs, Math.max(0, deadline - Date.now())) : w.pauseMs ?? 0;
      if (wait) await new Promise(r => setTimeout(r, wait));
    }
  })));
  const finishedAt = new Date();
  return { startedAt, finishedAt, results: summarizeAll(input.workloads, samples), samples };
}

type Raw = Map<string, { ms: number; outcome: Outcome; status: number }[]>;
function summarizeAll(workloads: Workload[], samples: Raw) {
  return Object.fromEntries(workloads.map(w => {
    const rows = samples.get(w.name) ?? [];
    const statusCounts = Object.fromEntries([...new Set(rows.map(r => r.status))].sort().map(s => [String(s), rows.filter(r => r.status === s).length]));
    return [w.name, { serviceClass: w.serviceClass, schoolId: w.schoolId, concurrency: w.concurrency, ...summarize(rows), statusCounts }];
  }));
}

/**
 * Before/after on a shared machine: alternate short quiet windows (the protected work alone) with noisy windows
 * (the same work plus the noise), so anything else running on the machine affects both sides alike.
 */
export async function runInterleaved(input: { origin: string; rounds: number; quietMs: number; noisyMs: number; quiet: () => Workload[]; noisy: () => Workload[] }) {
  const startedAt = new Date(), quiet: Raw = new Map(), noisy: Raw = new Map();
  const merge = (into: Raw, from: Raw) => { for (const [k, v] of from) into.set(k, [...(into.get(k) ?? []), ...v]); };
  for (let r = 0; r < input.rounds; r++) {
    merge(quiet, (await runProfile({ origin: input.origin, durationMs: input.quietMs, workloads: input.quiet() })).samples);
    merge(noisy, (await runProfile({ origin: input.origin, durationMs: input.noisyMs, workloads: input.noisy() })).samples);
  }
  return { startedAt, finishedAt: new Date(), baseline: summarizeAll(input.quiet(), quiet), results: summarizeAll(input.noisy(), noisy) };
}
