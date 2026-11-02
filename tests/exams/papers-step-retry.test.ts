import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";

// SKAI-1541: a paper-slot load failure has a Retry; a failed refresh keeps the loaded papers.
const src = readFileSync("src/components/academic/exams/PapersStep.tsx", "utf8");

test("non-OK or slot-less payloads are failures", () => {
  assert.match(src, /if \(!response\?\.ok \|\| !Array\.isArray\(payload\?\.data\?\.slots\)\) \{ setFailed/);
});

test("first-load failure shows TaskFeedback with Retry; later failures keep the list", () => {
  assert.match(src, /const retry = <Button[^>]*onClick=\{\(\) => void load\(\)\}>\{t\.retry\}<\/Button>/);
  assert.match(src, /if \(failed && !data\) return <TaskFeedback kind="error" title=\{t\.loadFailed\} action=\{retry\}>/);
  assert.match(src, /\{failed \? <Alert tone="danger"[\s\S]*\{retry\}<\/Alert> : null\}/);
});

test("retry and load-failed copy exists in EN/AR/UR", () => {
  for (const lang of ["en", "ar", "ur"] as const) {
    const t = studioSlotsCopy(lang);
    assert.ok(t.retry && t.loadFailed, lang);
  }
});
