/** SKO-451: the release performance report as Markdown, published beside the release artifacts. */
type Objective = { key: string; label: string; target: number; observed: number | null; pass: boolean | null };
type Workload = { serviceClass: string; concurrency?: number; count: number; p50: number | null; p95: number | null; p99: number | null; maxMs: number | null; errors: number; rejected: number; timeouts: number; errorRate: number | null; statusCounts?: Record<string, number> };
export function renderRunMarkdown(run: { runId: string; profile: string; environment: string; release: string; dataset: Record<string, unknown>; concurrency: Record<string, unknown>; results: Record<string, Workload>; baseline?: Record<string, Workload>; objectives: Objective[]; backgroundPeaks: { schoolId: string; peak: number; limit: number }[]; startedAt: string; finishedAt: string; policies?: string[] }) {
  const v = (n: number | null, unit = "") => n === null ? "not measured" : `${n}${unit}`;
  const lines = [
    `# Release performance report · ${run.runId}`, "",
    `- Profile: ${run.profile}`, `- Release: ${run.release}`, `- Environment: ${run.environment}`,
    `- Window: ${run.startedAt} → ${run.finishedAt}`, `- Dataset: ${JSON.stringify(run.dataset)}`, `- Concurrency: ${JSON.stringify(run.concurrency)}`,
    ...(run.policies?.length ? [`- Resource policies in force: ${run.policies.join("; ")}`] : []),
    "", "> Synthetic data only. Timings describe this environment and are not a capacity claim. Fairness ratios compare the same work with and without the noise inside this run; absolute p95 targets apply to the declared release environment.", "",
    "## Objectives", "", "| Objective | Target | Observed | Result |", "|---|---|---|---|",
    ...run.objectives.map(o => `| ${o.label} | ${o.target} | ${v(o.observed)} | ${o.pass === null ? "NOT MEASURED" : o.pass ? "PASS" : "FAIL"} |`),
    "", "## Workloads", "", "| Workload | Class | Concurrency | Requests | p50 ms | p95 ms | p99 ms | Max ms | Errors | Rejected (429) | Timeouts |", "|---|---|---|---|---|---|---|---|---|---|---|",
    ...Object.entries(run.results).map(([name, w]) => `| ${name} | ${w.serviceClass} | ${w.concurrency ?? ""} | ${w.count} | ${v(w.p50)} | ${v(w.p95)} | ${v(w.p99)} | ${v(w.maxMs)} | ${w.errors} | ${w.rejected} | ${w.timeouts} |`),
    ...(run.baseline ? ["", "## Before and during the noise (p95 ms)", "", "| Workload | Quiet baseline p95 | Under noise p95 | Ratio |", "|---|---|---|---|",
      ...Object.entries(run.baseline).map(([name, b]) => { const d = run.results[name]; return `| ${name} | ${v(b.p95)} | ${v(d?.p95 ?? null)} | ${b.p95 && d?.p95 ? (d.p95 / b.p95).toFixed(2) : "not measured"} |`; })] : []),
    "", "## Background concurrency per school (server-measured peak)", "", "| School | Peak in flight | Limit |", "|---|---|---|",
    ...run.backgroundPeaks.map(p => `| ${p.schoolId} | ${p.peak} | ${p.limit} |`),
    "", "## Runbook", "",
    "1. Find the failing objective and the school whose background work or queue age rose with it (operator capacity view).",
    "2. Apply a school-scoped BACKGROUND_REQUESTS or BACKGROUND_JOBS limit with the incident as the reason and its end as the expiry.",
    "3. Re-run this profile; the change is not resolved until a later run shows its effect.",
    "4. Revert the change when the incident ends; the previous limit applies again and both steps are audited.", "",
  ];
  return lines.join("\n");
}
