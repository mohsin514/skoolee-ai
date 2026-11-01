import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateUi } from "@/lib/locale/ui-messages";

const source = readFileSync("src/components/academic/ExamCycleManager.tsx", "utf8");
const message = "The exam date sheet could not be loaded, so scheduled papers are not shown.";

test("SKAI-1522: a non-OK, unsuccessful or failed schedule response is a failure, not an empty datesheet", () => {
  assert.match(source, /return r\.ok && j\.success && Array\.isArray\(j\.data\) \? j : \{ failed: true \}; \}\)\.catch\(\(\) => \(\{ failed: true \}\)\)/);
  assert.match(source, /if \("failed" in schedRes\) setScheduleFailed\(true\);\s*else \{ setScheduleFailed\(false\); setScheduleRows/);
  assert.doesNotMatch(source, /setScheduleRows\(\(schedRes\.data \|\| \[\]\) as ScheduleRow\[\]\);\n/);
});

test("SKAI-1522: exams stay visible with an inline schedule error and Try again", () => {
  assert.match(source, /\{scheduleFailed && !loadFailed && !loading \? \(\s*<Alert tone="danger" compact data-exam-schedule-error>/);
  assert.match(source, /onClick=\{\(\) => void load\(true\)\}>\{ui\("Try again"\)\}/);
  for (const language of ["ar", "ur"] as const) assert.notEqual(translateUi(message, language), message, language);
});
