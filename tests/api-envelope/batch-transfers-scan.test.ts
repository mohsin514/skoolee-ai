import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1985 batch: learning-transfer detail and the marks-scan template answer on the envelope; their callers read it.
test("learning-transfer detail and marks-scan template routes emit only the envelope", () => {
  for (const file of ["src/app/api/learning-transfers/[id]/route.ts", "src/app/api/marks-scan/template/[id]/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.match(source, /failFrom\(error/);
  }
});

test("batch callers read errors through readApiError, not the legacy string key", () => {
  const transfer = readFileSync("src/components/learning/learning-transfer.tsx", "utf8");
  assert.match(transfer, /readApiError\(payload, ""\)/);
  assert.doesNotMatch(transfer, /typeof payload\.error === "string"/);
  const scan = readFileSync("src/components/marks/mark-scan-panel.tsx", "utf8");
  assert.match(scan, /readApiError\(json, "The change was not saved\."\)/);
  assert.doesNotMatch(scan, /json\.error \|\|/);
});
