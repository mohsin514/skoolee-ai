// SKAI-1978: the principal and admin consoles are "use client" pages that used to import every workspace panel
// statically, so the first render of Today on a cold instance evaluated all of them (and shipped them in the page's
// first-load JS). The panels now load through next/dynamic. These tests walk each page's static (value) import graph
// and keep the heavy view panels out of it.
//   node --import tsx --test tests/cold-start/lazy-role-panels.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

/** Static value imports and re-exports; `import type`/`export type` and `import()` are skipped. */
function staticSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/^\s*(import|export)\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/gm)) out.push(match[3]);
  for (const match of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(match[1]);
  return out;
}

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(ROOT, "src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [join(ROOT, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of staticSpecifiers(readFileSync(file, "utf8"))) {
      const next = resolveLocal(file, specifier);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return new Set([...seen].map((file) => relative(ROOT, file)));
}

/** View panels neither console shows on Today. */
const VIEW_PANELS = [
  "src/components/academic/exams/ExamsWorkspace.tsx",
  "src/components/timetable/TimetableStudio.tsx",
  "src/components/question-network/question-network.tsx",
  "src/components/academic/ReportCardPipeline.tsx",
  "src/components/academic/AcademicModelPanel.tsx",
  "src/components/academic-year/CycleManagementPanel.tsx",
  "src/components/communications/engagement-panel.tsx",
  "src/components/attendance/unified-attendance-panel.tsx",
];

test("the principal console bundles Today only; views and the shared-admin panels load on demand", () => {
  const graph = staticGraph("src/app/principal/page.tsx");
  const eager = [
    ...VIEW_PANELS,
    "src/components/ai-workflows/AiWorkflowsHome.tsx",
    "src/components/shared-admin/index.tsx",
    "src/components/planning/scenario-planner.tsx",
    "src/components/pathways/pathway-panel.tsx",
  ].filter((file) => graph.has(file));
  assert.deepEqual(eager, []);
  // Today stays eager, so the landing renders without waiting on a chunk.
  for (const file of ["src/components/principal/action-queue.tsx", "src/components/insights/AcademicOverview.tsx"]) {
    assert.ok(graph.has(file), `${file} should stay in the principal page graph`);
  }
});

test("the admin console loads its workspace panels on demand", () => {
  const graph = staticGraph("src/app/admin/page.tsx");
  const eager = [
    ...VIEW_PANELS,
    "src/components/payroll/payroll-runs-panel.tsx",
    "src/components/billing/SubscriptionWorkspace.tsx",
    "src/components/identity/identity-admin.tsx",
    "src/components/operations/complaints-desk.tsx",
  ].filter((file) => graph.has(file));
  assert.deepEqual(eager, []);
  assert.ok(graph.has("src/components/principal/action-queue.tsx"));
});

test("the AI composer id no longer needs AiWorkflowsHome, and its old export still works", () => {
  const home = readFileSync(join(ROOT, "src/components/ai-workflows/AiWorkflowsHome.tsx"), "utf8");
  assert.match(home, /export \{ AI_COMPOSER_INPUT_ID \}/);
  assert.match(readFileSync(join(ROOT, "src/components/ai-workflows/ai-composer-id.ts"), "utf8"), /AI_COMPOSER_INPUT_ID = "sk-ai-flow-context"/);
});
