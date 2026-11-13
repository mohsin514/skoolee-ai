import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1344: the roster CSV must carry official identifiers plus a stable record key for regulator reconciliation.
const src = readFileSync("src/app/api/students/export/route.ts", "utf8");

for (const header of ["Admission No", "Nationality", "Emirates ID", "eSIS / MOE ID", "Record Key"]) {
  test(`students export includes ${header}`, () => {
    assert.ok(src.includes(`header: "${header}"`), `missing header ${header}`);
  });
}

test("students export keeps the export uncached", () => {
  assert.ok(src.includes('"Cache-Control": "no-store"'));
});
