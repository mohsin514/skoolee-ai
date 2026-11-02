import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1566: roster and source failures are shown with their own retry, not as empty selectors.
const src = readFileSync("src/components/school-ai/exam-scripts.tsx", "utf8");

test("the two dependencies load separately and treat non-OK or malformed bodies as failures", () => {
  assert.doesNotMatch(src, /Promise\.all\(\[fetch\(`\/api\/school-ai\/exams/);
  assert.match(src, /roster\.ok \? await roster\.json\(\)\.catch\(\(\) => null\) : null/);
  assert.match(src, /if \(Array\.isArray\(a\?\.accommodations\?\.students\)\) setStudents\(a\.accommodations\.students\); else setRosterFailed\(true\);/);
  assert.match(src, /if \(Array\.isArray\(b\?\.records\)\) setSources\([\s\S]*?\); else setSourcesFailed\(true\);/);
  assert.match(src, /\[id, rosterTry\]/);
  assert.match(src, /\[paper\.subjectId, paper\.classId, sourcesTry\]/);
});

test("each failure has a scoped retry next to its selector", () => {
  assert.match(src, /data-script-roster-failed>\{t\.failure\} <Button[^>]*onClick=\{\(\) => setRosterTry\(n => n \+ 1\)\}>\{t\.refresh\}/);
  assert.match(src, /data-script-sources-failed>\{t\.failure\} <Button[^>]*onClick=\{\(\) => setSourcesTry\(n => n \+ 1\)\}>\{t\.refresh\}/);
});
