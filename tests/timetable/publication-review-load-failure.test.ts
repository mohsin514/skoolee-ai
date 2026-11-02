import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1644: a failed publication-review load replaces the skeleton with a retryable ErrorState.
const source = readFileSync("src/components/timetable/PublicationReview.tsx", "utf8");

test("connection and malformed-response failures are caught", () => {
  assert.match(source, /fetch\(`\/api\/timetable\/\$\{timetableId\}\?publication=1`, \{ cache: "no-store" \}\)\.catch\(\(\) => null\)/);
  assert.match(source, /if \(!response\?\.ok \|\| !json\?\.success \|\| !json\.data\) \{ setLoadFailed\(/);
});

test("a failed first load shows ErrorState with Try again instead of the skeleton", () => {
  assert.match(source, /\{!data && loadFailed \? <div data-publication-load-failed><ErrorState [^>]*onRetry=\{\(\) => load\(\)\}/);
});

test("a failed refresh keeps the loaded review, note and effective date", () => {
  assert.match(source, /\{loadFailed && data \? <div data-publication-error>/);
  assert.match(source, /setEffectiveFrom\(current => current \|\| json\.data\.today\)/);
});
