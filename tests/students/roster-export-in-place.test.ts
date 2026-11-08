import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync("src/components/shared-admin/students-panel.tsx", "utf8");
const exportFn = panel.slice(panel.indexOf("const exportMatching"), panel.indexOf("if (students.length === 0)"));

test("roster export no longer navigates the whole page to the export endpoint", () => {
  assert.doesNotMatch(exportFn, /window\.location\.href = `\/api\/students\/export/);
  assert.match(exportFn, /await fetch\(`\/api\/students\/export\?\$\{params\.toString\(\)\}`/);
});

test("non-OK responses are handled on the page before any download is created", () => {
  const notOk = exportFn.indexOf("if (!response.ok)");
  assert.ok(notOk > 0 && notOk < exportFn.indexOf("URL.createObjectURL"));
  assert.match(exportFn, /response\.status === 429\) toast\.warning\(ui\("Another export is running for your school\. Try again in \{0\} seconds\."/);
  assert.match(exportFn, /Retry-After/);
  assert.match(exportFn, /response\.status === 401 \|\| response\.status === 403\) toast\.error\(ui\("You do not have permission to export this roster\."\)\)/);
  assert.match(exportFn, /onClick: \(\) => void exportMatching\(\)/);
});
