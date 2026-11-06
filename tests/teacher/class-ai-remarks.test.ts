import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-347 (lane f): the header "Draft with AI" posted { examId } without batch, so the API validated it as a
// single-pupil request and answered "studentId: Invalid input". The batch reply is 200 with a `failed` list,
// which must never be announced as "drafted for every pupil".
const page = readFileSync("src/app/teacher/reports/page.tsx", "utf8");
const handler = page.slice(page.indexOf("const handleGenerateRemarks"), page.indexOf("const handleGenerateStudentRemarks"));

test("class-wide AI draft asks the API for a batch", () => {
  assert.match(handler, /JSON\.stringify\(\{\s*batch:\s*true,\s*examId:/);
});

test("class-wide AI draft reports pupils that failed instead of claiming every pupil", () => {
  assert.match(handler, /result\.failed/);
  assert.match(handler, /result\.succeeded/);
});
