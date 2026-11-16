import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseSubjectMarks } from "../../src/lib/academic/subject-marks";

// SKAI-2052: 0 and blank used to be saved as 100 by the admin UI.
test("subject marks accept whole numbers 1 to 1000 only", () => {
  assert.equal(parseSubjectMarks("60"), 60);
  assert.equal(parseSubjectMarks(" 1000 "), 1000);
  for (const bad of ["0", "", "  ", "-5", "1001", "2000", "12.5", "abc", null, undefined]) {
    assert.equal(parseSubjectMarks(bad as any), null, String(bad));
  }
});

test("admin subject forms no longer coerce invalid marks to 100", () => {
  const src = readFileSync("src/components/shared-admin/index.tsx", "utf8");
  assert.doesNotMatch(src, /Number\((subjectMarks|editSubjectMarks)\) \|\| 100/);
  assert.match(src, /parseSubjectMarks\(subjectMarks\)/);
  assert.match(src, /parseSubjectMarks\(editSubjectMarks\)/);
});
