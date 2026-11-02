import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studioResultsCopy } from "@/lib/school-ai/exam-studio-copy-results";

// SKAI-1572: a failed appeal-queue load shows an error with Retry instead of hiding the queue.
const src = readFileSync("src/components/school-ai/exam-studio/department-appeals.tsx", "utf8");

test("non-OK, network and malformed responses become a failed state", () => {
  assert.match(src, /if \(!Array\.isArray\(data\?\.appeals\)\) throw/);
  assert.match(src, /\.catch\(\(\) => \{ if \(!controller\.signal\.aborted\) setFailed\(true\); \}\)/);
  assert.doesNotMatch(src, /\.catch\(\(\) => \{\}\)/);
});

test("queue hides only after a successful empty load and keeps rows on refresh failure", () => {
  assert.match(src, /if \(!appeals\.length && !failed\) return null;/);
  assert.doesNotMatch(src, /setFailed\(true\)[^;]*setAppeals/);
  assert.match(src, /data-department-appeals-failed/);
  assert.match(src, /onClick=\{\(\) => setRevision\(value => value \+ 1\)\}>\{t\.departmentRetry\}/);
});

test("failure copy exists in every language", () => {
  for (const lang of ["en", "ar", "ur"] as const) {
    const t = studioResultsCopy(lang);
    assert.ok(t.departmentLoadFailed && t.departmentRetry, lang);
  }
});
