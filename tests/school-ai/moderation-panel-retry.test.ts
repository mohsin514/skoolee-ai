import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1600: a failed first moderation load offers Try again; a refresh failure keeps the loaded panel.
const src = readFileSync("src/components/school-ai/exam-moderation-panel.tsx", "utf8");
const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");

test("a malformed body counts as a failure", () => {
  assert.match(src, /if \(!Array\.isArray\(result\?\.corrections\) \|\| !Array\.isArray\(result\?\.appeals\) \|\| !Array\.isArray\(result\?\.samples\)\) throw/);
});

test("the null-data branch shows the error with Try again, distinct from loading", () => {
  assert.match(src, /\{error \? <div role="alert"[^>]*data-moderation-load-failed>/);
  assert.match(src, /onClick=\{\(\) => void load\(\)\}>\{ui\("Try again"\)\}/);
  assert.match(src, /: <p role="status" className="text-sm text-ink-subtle">\{ui\("Loading moderation…"\)\}<\/p>\}/);
});

test("a refresh failure only sets error and never clears data", () => {
  assert.doesNotMatch(src, /setData\(null\)/);
});

test("copy is translated", () => {
  assert.match(messages, /\["Moderation could not load\. Pending corrections and appeals may be hidden\.", "[^"]+", "[^"]+"\]/);
});
