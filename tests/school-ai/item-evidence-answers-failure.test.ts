import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1577: a failed answer-detail load is shown as a failure with retry, never as an empty answer list.
const src = readFileSync("src/components/school-ai/item-evidence-panel.tsx", "utf8");
const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");

test("failures set a failed flag and keep loaded answers", () => {
  assert.doesNotMatch(src, /catch \{ setResponses\(\[\]\); \}/);
  assert.match(src, /if \(!Array\.isArray\(rows\)\) throw/);
  assert.match(src, /catch \{ setResponsesFailed\(true\); \}/);
  assert.doesNotMatch(src, /setResponsesFailed\(true\)[^\n]*setResponses\(/);
});

test("failure renders an alert with retry; a genuine empty list is explained", () => {
  assert.match(src, /data-item-answers-failed/);
  assert.match(src, /onClick=\{loadResponses\}>\{ui\("Try again"\)\}/);
  assert.match(src, /responses\.length === 0 \? <p[^>]*data-item-answers-empty/);
});

test("new strings are translated", () => {
  for (const en of ["Answers could not load. Learner responses may exist.", "No answers are recorded for this question."]) {
    assert.match(messages, new RegExp(`\\["${en.replace(/\./g, "\\.")}", "[^"]+", "[^"]+"\\]`));
  }
});
