import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1546: a marks load failure is not "No students in this class".
const src = readFileSync("src/components/academic/exams/ExamDetailDialog.tsx", "utf8");

test("non-OK and malformed marks responses are failures", () => {
  assert.match(src, /fetch\(`\/api\/marks\?examId=\$\{exam\.id\}`\)\.then\(\(r\) => \(r\.ok \? r\.json\(\) : \{ success: false \}\)\)/);
  assert.match(src, /!res\.success \|\| !Array\.isArray\(res\.students\) \|\| !Array\.isArray\(res\.subjects\)\) throw/);
  assert.match(src, /catch \{[\s\S]{0,120}setLoadFailed\(true\);/);
});

test("failure with no sheet shows ErrorState with Retry before the empty state", () => {
  const failure = src.indexOf("if (loadFailed && students.length === 0)");
  const empty = src.indexOf('title={tr("No students in this class")}');
  assert.ok(failure > 0 && failure < empty);
  assert.match(src, /<ErrorState[\s\S]{0,200}onRetry=\{\(\) => void load\(\)\}/);
});

test("failure with a sheet keeps it and shows an inline Retry", () => {
  assert.match(src, /\{loadFailed \? \(\s*<Alert tone="danger"[\s\S]{0,200}onClick=\{\(\) => void load\(\)\}/);
});
