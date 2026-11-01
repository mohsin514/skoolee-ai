import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1578: a 409 on a question-evidence action disables stale actions and offers an in-place reload.
const src = readFileSync("src/components/school-ai/item-evidence-panel.tsx", "utf8");
const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");

test("request errors carry their HTTP status", () => {
  assert.match(src, /throw Object\.assign\(new Error\(json\?\.error \|\| "Request failed"\), \{ status: response\?\.status \?\? 0 \}\)/);
});

test("a 409 marks the panel stale and disables actions until reload", () => {
  assert.match(src, /\.status === 409\) setStale\(true\)/);
  assert.match(src, /disabled=\{disabled \|\| stale\}/);
  assert.match(src, /const reload = async \(\) => \{ await load\(\); setStale\(false\); setError\(null\); \};/);
  assert.match(src, /data-item-evidence-stale/);
  assert.match(src, /onClick=\{\(\) => void reload\(\)\}>\{ui\("Reload current evidence"\)\}/);
});

test("item cards keep their keys so drafts survive the reload", () => {
  assert.match(src, /<ItemCard key=\{item\.key\}/);
});

test("new strings are translated", () => {
  for (const en of ["This evidence changed. Reload it and review again before resubmitting.", "Reload current evidence"]) {
    assert.match(messages, new RegExp(`\\["${en.replace(/\./g, "\\.")}", "[^"]+", "[^"]+"\\]`));
  }
});
