// SKAI-1898: the pure parts of the dev load runner — target safety, journeys, statistics, the abort rule and the
// report. Kept free of I/O so they are unit-tested (tests/load/load-core.test.ts).
import { ROLE_JOURNEYS } from "./role-journeys";
import { SHELL_BATCH_MAX, SHELL_BATCH_PATHS } from "../../src/lib/network/shell-batch-paths";

/** Hosts a load run may target. Production is never on this list and there is no flag that adds it. */
const ALLOWED_HOSTS = [/^dev\.skooleeai\.com$/, /^localhost$/, /^127\.0\.0\.1$/, /^skoolee-ai-dev[a-z0-9-]*\.vercel\.app$/];
const PRODUCTION_HOSTS = [/^(www\.|app\.)?skooleeai\.com$/, /^skoolee-ai-prod/];

export function assertAllowedTarget(target: string): URL {
  let url: URL;
  try { url = new URL(target); } catch { throw new Error(`Not a URL: ${target}`); }
  if (PRODUCTION_HOSTS.some((re) => re.test(url.hostname))) throw new Error(`Refusing to load-test production (${url.hostname}).`);
  if (!ALLOWED_HOSTS.some((re) => re.test(url.hostname))) throw new Error(`Host ${url.hostname} is not on the load-test allow-list (dev, localhost).`);
  return url;
}

export const DEFAULT_MAX_VUS = 300;
export const HARD_MAX_VUS = 5000;

export function checkVirtualUsers(vus: number, allowHigh: boolean) {
  if (!Number.isInteger(vus) || vus < 1) throw new Error("--vus must be a positive whole number.");
  if (vus > HARD_MAX_VUS) throw new Error(`--vus is capped at ${HARD_MAX_VUS}.`);
  if (vus > DEFAULT_MAX_VUS && !allowHigh) throw new Error(`--vus above ${DEFAULT_MAX_VUS} needs LOAD_ALLOW_HIGH=1.`);
}

/**
 * One page view for a role, as its browser makes it: the home page first, then the dashboard's GET requests together.
 * Recorded per role in role-journeys.ts. GET only, by construction.
 */
export function pageViewFor(role: string, today: string): { home: string; apis: string[] } {
  const journey = ROLE_JOURNEYS[role] ?? ROLE_JOURNEYS.teacher;
  return { home: journey.home, apis: journey.apis.map((p) => p.replaceAll("{date}", today)) };
}

/**
 * SKAI-1949: split a page view's APIs the way the browser's fetch interceptor does: the shell GETs on the allowlist go
 * as ONE `/api/shell?p=…` request when there are two or more; everything else is sent on its own.
 */
export function shellBatched(apis: string[]): string[] {
  const shell = apis.filter((p) => SHELL_BATCH_PATHS.includes(p.split("?")[0]));
  if (shell.length < 2) return apis;
  const rest = apis.filter((p) => !shell.includes(p));
  const groups: string[][] = [];
  for (let i = 0; i < shell.length; i += SHELL_BATCH_MAX) groups.push(shell.slice(i, i + SHELL_BATCH_MAX));
  return [...groups.map((g) => `/api/shell?${g.map((p) => `p=${encodeURIComponent(p)}`).join("&")}`), ...rest];
}

/** Back-compatible flat list: the home page followed by its APIs. */
export function journeyFor(role: string, today: string): string[] {
  const view = pageViewFor(role, today);
  return [view.home, ...view.apis];
}

/** Endpoint label without ids or dates, so samples group per route. */
export function label(path: string) {
  return path.replace(/\?.*$/, "").replace(/\/[0-9a-f-]{20,}(?=\/|$)/gi, "/:id");
}

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export type Sample = { at: number; endpoint: string; ms: number; status: number };

/** Stop early when the target is clearly degrading: protects a shared dev environment. */
export function shouldAbort(recent: Sample[], { maxErrorRate = 0.2, maxP95Ms = 10_000, minSamples = 50 } = {}): string | null {
  if (recent.length < minSamples) return null;
  const errors = recent.filter((s) => s.status === 0 || s.status >= 500).length / recent.length;
  if (errors > maxErrorRate) return `error rate ${(errors * 100).toFixed(1)}% over the last ${recent.length} requests`;
  const p95 = percentile(recent.map((s) => s.ms).sort((a, b) => a - b), 95)!;
  if (p95 > maxP95Ms) return `p95 ${p95} ms over the last ${recent.length} requests`;
  return null;
}

/** SKO-451 interactive objectives (src/lib/capacity/policy.ts). */
export const OBJECTIVES = { p95Ms: 1500, errorRate: 0.01 };

export type EndpointStats = { endpoint: string; count: number; p50: number | null; p95: number | null; p99: number | null; max: number | null; errorRate: number; statuses: Record<string, number> };

export function summarize(samples: Sample[]): EndpointStats[] {
  const groups = new Map<string, Sample[]>();
  for (const s of samples) groups.set(s.endpoint, [...(groups.get(s.endpoint) ?? []), s]);
  return [...groups.entries()].map(([endpoint, rows]) => {
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    const statuses: Record<string, number> = {};
    for (const r of rows) statuses[String(r.status)] = (statuses[String(r.status)] ?? 0) + 1;
    const errors = rows.filter((r) => r.status === 0 || r.status >= 500).length;
    return { endpoint, count: rows.length, p50: percentile(ms, 50), p95: percentile(ms, 95), p99: percentile(ms, 99), max: ms.at(-1) ?? null, errorRate: errors / rows.length, statuses };
  }).sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));
}

export type RunMeta = { target: string; vus: number; durationSec: number; rampSec: number; thinkMs: [number, number]; startedAt: string; finishedAt: string; aborted: string | null; sessions: Record<string, number>; skipped: string[] };

export function report(meta: RunMeta, samples: Sample[]) {
  const all = samples.map((s) => s.ms).sort((a, b) => a - b);
  const errors = samples.filter((s) => s.status === 0 || s.status >= 500).length;
  const elapsed = Math.max(1, (Date.parse(meta.finishedAt) - Date.parse(meta.startedAt)) / 1000);
  const overall = { requests: samples.length, rps: samples.length / elapsed, p50: percentile(all, 50), p95: percentile(all, 95), p99: percentile(all, 99), errorRate: samples.length ? errors / samples.length : 0 };
  const passed = !meta.aborted && overall.p95 !== null && overall.p95 <= OBJECTIVES.p95Ms && overall.errorRate <= OBJECTIVES.errorRate;
  const endpoints = summarize(samples);
  const fmt = (v: number | null) => (v === null ? "–" : `${Math.round(v)}`);
  const md = [
    `# Dev load run — ${meta.startedAt}`,
    "",
    `Target \`${meta.target}\` · ${meta.vus} virtual users · ${meta.durationSec}s (ramp ${meta.rampSec}s) · think ${meta.thinkMs[0]}–${meta.thinkMs[1]} ms`,
    `Sessions by role: ${Object.entries(meta.sessions).map(([r, n]) => `${r} ${n}`).join(", ") || "none"}${meta.skipped.length ? ` · skipped: ${meta.skipped.join(", ")}` : ""}`,
    meta.aborted ? `\n**Aborted early:** ${meta.aborted}` : "",
    "",
    `**Result: ${passed ? "PASS" : "FAIL"}** against SKO-451 interactive objectives (p95 ≤ ${OBJECTIVES.p95Ms} ms, errors ≤ ${OBJECTIVES.errorRate * 100}%).`,
    "",
    `| Requests | Req/s | p50 ms | p95 ms | p99 ms | Errors |`,
    `|---|---|---|---|---|---|`,
    `| ${overall.requests} | ${overall.rps.toFixed(1)} | ${fmt(overall.p50)} | ${fmt(overall.p95)} | ${fmt(overall.p99)} | ${(overall.errorRate * 100).toFixed(2)}% |`,
    "",
    "## Endpoints (slowest p95 first)",
    "",
    "| Endpoint | Count | p50 | p95 | p99 | Max | Errors | Statuses |",
    "|---|---|---|---|---|---|---|---|",
    ...endpoints.map((e) => `| \`${e.endpoint}\` | ${e.count} | ${fmt(e.p50)} | ${fmt(e.p95)} | ${fmt(e.p99)} | ${fmt(e.max)} | ${(e.errorRate * 100).toFixed(1)}% | ${Object.entries(e.statuses).map(([k, v]) => `${k}×${v}`).join(" ")} |`),
  ].join("\n");
  return { passed, overall, endpoints, markdown: md };
}
