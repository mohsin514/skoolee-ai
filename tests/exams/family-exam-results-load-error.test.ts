import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateUi } from "@/lib/locale/ui-messages";

const source = readFileSync("src/components/exams/family-exam-results.tsx", "utf8");
const message = "Online exam results could not be loaded. Try again.";

test("SKAI-1521: a non-OK response or network failure is a failure, not zero results", () => {
  // SKAI-760: SKAI-1715 paging kept the rule but reshaped the lines (nextCursor, request-id guard).
  assert.match(source, /if \(response\.ok && Array\.isArray\(payload\.data\)\) \{ setResults\(payload\.data\);[^}]*\} else setFailed\(true\);/);
  assert.match(source, /\.catch\(\(\) => \{ if \(id === request\.current\) setFailed\(true\); \}\)/);
  assert.doesNotMatch(source, /setResults\(\[\]\)/);
});

test("SKAI-1521: the failure shows a translated error with Try again that reloads the same child", () => {
  assert.ok(source.indexOf("if (failed) return") < source.indexOf("if (!results?.length) return null;"));
  assert.match(source, /onClick=\{\(\) => setAttempt\(value => value \+ 1\)\}>\{ui\("Try again"\)\}/);
  assert.match(source, /\}, \[studentId, attempt\]\);/);
  for (const language of ["ar", "ur"] as const) assert.notEqual(translateUi(message, language), message, language);
});
