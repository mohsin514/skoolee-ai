import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createExamErrorMessage } from "@/lib/exams/create-error";
import { translateUi } from "@/lib/locale/ui-messages";

const source = readFileSync("src/components/academic/ExamCycleManager.tsx", "utf8");

test("SKAI-1997: create-exam 400 field errors and 409 rule errors surface the server reason", () => {
  const read = createExamErrorMessage;
  assert.equal(read({ title: ["Exam title is too long (max 200 characters)"] }), "Exam title is too long (max 200 characters)");
  assert.equal(read("Class is not active in this academic year."), "Class is not active in this academic year.");
  assert.equal(read(undefined), null);
  assert.equal(read({}), null);
});

test("SKAI-1997: the dialog shows the reason for 400/409 only and caps the title at 200", () => {
  assert.match(source, /res\.status === 400 \|\| res\.status === 409 \? createExamErrorMessage\(data\?\.error\) : null/);
  assert.match(source, /value=\{form\.title\}\s*maxLength=\{200\}/);
  for (const m of ["Exam title is too long (max 200 characters)", "Class is not active in this academic year."])
    for (const l of ["ar", "ur"] as const) assert.notEqual(translateUi(m, l), m, `${l}: ${m}`);
});
