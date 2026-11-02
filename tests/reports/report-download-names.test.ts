import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1557: report-card download buttons carry the exam title in their accessible name.
test("student and parent download buttons name their report", () => {
  const student = readFileSync("src/app/student/reports/page.tsx", "utf8");
  const parent = readFileSync("src/app/parent/results/page.tsx", "utf8");
  assert.match(student, /\{ui\("Download"\)\}[\s\S]{0,240}<span className="sr-only">: <bdi>\{report\.exam\?\.title \|\| ui\("Report card"\)\}<\/bdi><\/span>/);
  assert.match(parent, /\{ui\("Download"\)\}[\s\S]{0,240}<span className="sr-only">: <bdi>\{rc\.examTitle\}<\/bdi><\/span>/);
});
