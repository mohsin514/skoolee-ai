import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2199: care event, visit, dose and instruction times older than 20 years are refused.
test("care when() has a 20-year lower bound and the forms carry a min", () => {
  const source = readFileSync("src/lib/care/service.ts", "utf8");
  const when = source.slice(source.indexOf("const when = "), source.indexOf("export const contentHash"));
  assert.match(when, /d\.getTime\(\) < earliestCareTime\(\)/);
  assert.match(when, /getUTCFullYear\(\) - 20/);
  const desk = readFileSync("src/components/care/care.tsx", "utf8");
  assert.equal((desk.match(/type="datetime-local" min=\{CARE_MIN_LOCAL\}/g) ?? []).length, 4);
});
