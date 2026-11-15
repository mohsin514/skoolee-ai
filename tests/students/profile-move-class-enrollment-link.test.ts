import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-2093: PATCH /api/students answers 409 for classId/rollNo changes, so the profile must not offer a dialog or field that can only fail.
test("profile Move class sends the admin to the enrolment history", () => {
  const page = readFileSync("src/app/admin/page.tsx", "utf8");
  assert.match(page, /onMove=\{\(\) => \{ window\.location\.assign\(`\/pupils\/\$\{selectedStudent\.id\}`\)/);
  assert.doesNotMatch(page, /body: JSON\.stringify\(\{ id: movingStudent\.id, classId/);
});

test("profile edit form does not offer an editable roll number or send it", () => {
  const src = readFileSync("src/components/shared-admin/index.tsx", "utf8");
  assert.doesNotMatch(src, /onChange=\{\(v\) => setEd\("rollNo"/);
  assert.doesNotMatch(src, /updates\.rollNo = next\.rollNo/);
  assert.match(src, /href=\{`\/pupils\/\$\{student\.id\}`\}>\{ui\("Roll and class changes are made in the enrolment history"\)/);
});
