// SKAI-1977: GET /api/ai-workflows/questionnaire runs on every principal, teacher and parent landing.
// Its route module used to pull the whole AI Workflows runtime (registry, job-service, planner, the
// OpenAI SDK, fees/PDF and exam services) at load, ~6.7 MB and ~700 ms on a cold instance. These tests
// walk the route's static (value) import graph and keep that runtime behind POST's dynamic imports.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const ROUTE = "src/app/api/ai-workflows/questionnaire/route.ts";

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

function staticGraph(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [join(ROOT, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of staticSpecifiers(readFileSync(file, "utf8"))) {
      const local = resolveLocal(file, specifier);
      if (local) queue.push(local);
      else if (!specifier.startsWith(".") && !specifier.startsWith("@/")) packages.add(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]);
    }
  }
  return { files: new Set([...files].map(file => relative(ROOT, file))), packages };
}

test("the questionnaire status route does not statically load the AI Workflows runtime", () => {
  const { files, packages } = staticGraph(ROUTE);
  for (const heavy of [
    "src/lib/ai-workflows/registry/index.ts",
    "src/lib/ai-workflows/jobs/job-service.ts",
    "src/lib/ai-workflows/jobs/questionnaire.ts",
    "src/lib/ai-workflows/planner/plan.ts",
    "src/lib/ai-workflows/view.ts",
    "src/lib/ai-workflows/questionnaire/service.ts",
    "src/lib/ai/openai.ts",
    "src/lib/school-ai/http.ts",
  ]) assert.ok(!files.has(heavy), `${ROUTE} statically reaches ${heavy}`);
  for (const pkg of ["openai", "@react-pdf/renderer", "@aws-sdk/client-s3"]) assert.ok(!packages.has(pkg), `${ROUTE} statically reaches ${pkg}`);
});

test("POST still reaches the job runtime, and service.ts keeps exporting the status read", () => {
  const route = readFileSync(join(ROOT, ROUTE), "utf8");
  for (const lazy of ["@/lib/school-ai/http", "@/lib/ai-workflows/jobs/job-service", "@/lib/ai-workflows/jobs/questionnaire", "@/lib/ai-workflows/view"]) {
    assert.ok(route.includes(`import("${lazy}")`), `POST loads ${lazy}`);
  }
  const service = readFileSync(join(ROOT, "src/lib/ai-workflows/questionnaire/service.ts"), "utf8");
  assert.match(service, /export \{ definitionForRole, setupStatus \} from "\.\/status";/);
});

test("the status read keeps its tenant wrapper and user/school/campus filter", () => {
  const status = readFileSync(join(ROOT, "src/lib/ai-workflows/questionnaire/status.ts"), "utf8");
  assert.match(status, /return inTenant\(user, async \(\) => \{/);
  assert.match(status, /where: \{ schoolId: user\.schoolId, userId: user\.userId, questionnaireKey: definition\.key, campusId: await setupCampus\(user\) \}/);
  assert.match(status, /prisma\.school\.findUnique\(\{ where: \{ id: user\.schoolId \}/);
});
