import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";

// SKAI-1610: a failed department-approvals load is shown with Try again, distinct from "heads no department".
const src = readFileSync("src/components/school-ai/exam-studio/department-queue.tsx", "utf8");

test("HTTP, network and malformed bodies set loadFailed without clearing the queue", () => {
  assert.match(src, /if \(!next \|\| typeof next\.heads !== "boolean" \|\| \(next\.heads && \(!Array\.isArray\(next\.approvals\) \|\| !Array\.isArray\(next\.jumps\)\)\)\) \{ setLoadFailed\(true\); return; \}/);
  assert.doesNotMatch(src, /setQueue\(payload\?\.queue \?\? null\)/);
});

test("no data + failure shows the section; a non-head stays hidden; refresh failure keeps the queue", () => {
  assert.match(src, /if \(!queue\) return failure \? <section[^]*?\{failure\}<\/section> : null;\n\s*if \(!queue\.heads\) return null;/);
  assert.match(src, /onClick=\{\(\) => void load\(\)\}>\{t\.queueRetry\}/);
  assert.match(src, /live="polite">\{notice\.text\}<\/Alert> : null\}\n\s*\{failure\}/);
});

test("copy exists in every language", () => {
  for (const lang of ["en", "ar", "ur"] as const) {
    const t = studioHomeCopy(lang);
    assert.ok(t.queueLoadFailed && t.queueRetry, lang);
  }
});
