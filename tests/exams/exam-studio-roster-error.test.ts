import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { examFormsCopy } from "@/components/school-ai/exam-forms-copy";

const source = readFileSync("src/components/school-ai/exam-studio/spaces/blueprint-space.tsx", "utf8");

test("SKAI-1525: a non-OK, malformed or failed roster request is a failure, not an empty roster", () => {
  assert.match(source, /if \(!response\.ok \|\| !Array\.isArray\(payload\.students\)\) throw new Error\("roster"\)/);
  assert.match(source, /\.catch\(\(\) => \{ if \(live\) setRosterFailed\(true\); \}\)/);
  assert.doesNotMatch(source, /\.catch\(\(\) => setStudents\(\[\]\)\)/);
});

test("SKAI-1525: Try again re-runs the roster; stale responses and still-valid choices are handled", () => {
  assert.match(source, /onClick=\{\(\) => setRosterAttempt\(value => value \+ 1\)\}>\{t\.retry\}/);
  assert.match(source, /\}, \[rosterPaperId, rosterAttempt\]\);/);
  assert.match(source, /if \(!live\) return; setStudents\(list\); setChosen\(previous => previous\.filter/);
});

test("SKAI-1525: the roster error copy exists in EN, AR and UR", () => {
  for (const locale of ["en", "ar", "ur"] as const) {
    const t = examFormsCopy(locale);
    assert.ok(t.rosterFailed && t.retry, locale);
  }
  assert.notEqual(examFormsCopy("ar").rosterFailed, examFormsCopy("en").rosterFailed);
});
