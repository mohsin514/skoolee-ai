#!/usr/bin/env node
// SKAI-953 (G-10, NFR-PERF-01): first-load JS page-weight budget.
// Run after `next build`. Next 16 no longer prints "First Load JS", so this reads
// the build output directly:
//   - build-manifest.json `rootMainFiles` (runtime + framework chunks every route loads)
//   - server/app/<route>/page_client-reference-manifest.js `entryJSFiles`
//     (chunks for the route's layouts, page, error and not-found boundaries)
// The union of those chunks is gzipped and summed per route.
// Usage: node scripts/size-check.mjs [--budget-kb 300] [--dir .next]
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

export const DEFAULT_BUDGET_KB = 300;

// Login plus the public marketing and trust routes named in SKAI-953.
export const ROUTES = [
  "/(auth)/login",
  "/(public)/pricing",
  "/(public)/privacy",
  "/(public)/terms",
  "/(public)/security",
  "/(public)/dpa",
  "/(public)/ai-governance",
  "/(public)/human-review-policy",
  "/(public)/guardian-notice",
  "/(public)/ai-school-management-software",
];

/** Turn "/(auth)/login" into the URL path "/login". */
export function displayRoute(route) {
  const path = route.replace(/\/\([^)]+\)/g, "");
  return path === "" ? "/" : path;
}

/** Union of chunk paths a route loads on first visit. */
export function routeChunks(rootMainFiles, entryJSFiles) {
  const set = new Set(rootMainFiles);
  for (const files of Object.values(entryJSFiles || {})) for (const f of files) set.add(f);
  return [...set].filter((f) => f.endsWith(".js"));
}

/** Compare measured gzip bytes with the budget. */
export function evaluate(results, budgetKb) {
  const budgetBytes = budgetKb * 1024;
  const rows = results.map((r) => ({ ...r, over: r.gzipBytes > budgetBytes }));
  return { rows, budgetBytes, failed: rows.some((r) => r.over) };
}

export function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatTable({ rows, budgetBytes }) {
  const head = ["Route", "Chunks", "Gzip first-load JS", "Budget", "Status"];
  const body = rows.map((r) => [
    displayRoute(r.route),
    String(r.chunks),
    formatKb(r.gzipBytes),
    formatKb(budgetBytes),
    r.over ? `OVER by ${formatKb(r.gzipBytes - budgetBytes)}` : "ok",
  ]);
  const all = [head, ...body];
  const widths = head.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  const line = (row) => row.map((c, i) => c.padEnd(widths[i])).join("  ");
  return [line(head), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(line)].join("\n");
}

function loadEntryJSFiles(dir, route) {
  const file = join(dir, "server", "app", route, "page_client-reference-manifest.js");
  if (!existsSync(file)) throw new Error(`No client reference manifest for ${route} (${file}). Run next build first.`);
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(file, "utf8"), sandbox);
  const manifest = sandbox.__RSC_MANIFEST?.[`${route}/page`];
  if (!manifest) throw new Error(`Manifest for ${route} has no "${route}/page" entry.`);
  return manifest.entryJSFiles;
}

export function measure(dir, routes = ROUTES) {
  const build = JSON.parse(readFileSync(join(dir, "build-manifest.json"), "utf8"));
  const cache = new Map();
  const gz = (f) => {
    if (!cache.has(f)) cache.set(f, gzipSync(readFileSync(join(dir, f)), { level: 9 }).length);
    return cache.get(f);
  };
  return routes.map((route) => {
    const chunks = routeChunks(build.rootMainFiles || [], loadEntryJSFiles(dir, route));
    return { route, chunks: chunks.length, gzipBytes: chunks.reduce((n, f) => n + gz(f), 0) };
  });
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const dir = arg("--dir", process.env.NEXT_BUILD_DIR || ".next");
  const budgetKb = Number(arg("--budget-kb", DEFAULT_BUDGET_KB));
  const result = evaluate(measure(dir), budgetKb);
  console.log(`Page-weight budget (SKAI-953): first-load JS, gzip level 9, build dir ${dir}\n`);
  console.log(formatTable(result));
  if (result.failed) {
    console.error(`\nOne or more routes exceed the ${budgetKb} KB gzip budget.`);
    process.exit(1);
  }
}
