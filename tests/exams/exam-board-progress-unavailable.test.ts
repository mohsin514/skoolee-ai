import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { marksProgress } from "@/lib/academic/exam-pipeline";
import { translateUi } from "@/lib/locale/ui-messages";

const source = readFileSync("src/components/academic/ExamCycleManager.tsx", "utf8");
const message = "Marking progress could not be loaded for {0} exams. Their progress is not shown.";

test("SKAI-1523: failed, non-OK or malformed marks responses never become zero counts", () => {
  assert.match(source, /if \(!r\.ok \|\| !Array\.isArray\(m\.subjects\) \|\| !Array\.isArray\(m\.students\) \|\| !Array\.isArray\(m\.marks\)\) throw/);
  assert.match(source, /\} catch \{\s*return \{ id: e\.id, meta: null \};/);
  assert.doesNotMatch(source, /subjectsCount: 0,\s*studentsCount: 0,/);
});

test("SKAI-1523: successful metadata is kept, failed exams are listed and retryable", () => {
  assert.match(source, /metas\.forEach\(\(x\) => \{ if \(x\.meta\) metaMap\[x\.id\] = x\.meta; \}\);/);
  assert.match(source, /setMetaFailed\(metas\.filter\(\(x\) => !x\.meta\)\.map\(\(x\) => x\.id\)\);/);
  assert.match(source, /data-exam-progress-error>.*onClick=\{\(\) => void load\(true\)\}>\{ui\("Try again"\)\}/);
  for (const language of ["ar", "ur"] as const) assert.notEqual(translateUi(message, language), message, language);
});

test("SKAI-1523: an exam without metadata reports no progress rather than a confirmed count", () => {
  assert.equal(marksProgress(undefined), 0);
});
