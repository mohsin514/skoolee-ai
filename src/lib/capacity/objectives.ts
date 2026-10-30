import { OBJECTIVES } from "./policy";

/** SKO-451: evaluate a run against the documented objectives. A metric with no samples is unmeasured, not a pass. */
export type Summary = { serviceClass: string; count: number; p50: number | null; p95: number | null; p99: number | null; maxMs: number | null; errors: number; rejected: number; timeouts: number; errorRate: number | null };
export type RunReport = { profile: string; environment: string; release: string; dataset: Record<string, unknown>; concurrency: Record<string, unknown>; results: Record<string, Summary>; baseline?: Record<string, Summary>; backgroundPeaks: { schoolId: string; peak: number; limit: number }[]; startedAt: string; finishedAt: string };

export function evaluate(run: Pick<RunReport, "results" | "backgroundPeaks" | "baseline">) {
  const all = Object.values(run.results);
  return OBJECTIVES.map(o => {
    let observed: number | null;
    if (o.metric === "peakOverLimit") observed = run.backgroundPeaks.length ? Math.max(...run.backgroundPeaks.map(p => p.peak - p.limit)) : null;
    else if (o.metric === "fairnessRatio") {
      // The same workload measured alone before the noise: how much the noisy school slowed it down.
      const ratios = Object.entries(run.results).filter(([name, x]) => x.serviceClass === o.serviceClass && x.p95 !== null && run.baseline?.[name]?.p95)
        .map(([name, x]) => x.p95! / run.baseline![name].p95!);
      observed = ratios.length ? Math.round(Math.max(...ratios) * 100) / 100 : null;
    }
    else {
      // Only workloads that actually ran contribute.
      const rows = all.filter(x => x.count > 0 && (o.serviceClass === "ALL" || x.serviceClass === o.serviceClass));
      const values = rows.map(x => x[o.metric as "p95" | "errorRate" | "maxMs"]).filter((v): v is number => v !== null);
      observed = values.length ? Math.max(...values) : null;
    }
    return { key: o.key, label: o.label, target: o.max, observed, pass: observed === null ? null : observed <= o.max };
  });
}
