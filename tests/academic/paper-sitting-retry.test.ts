import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";

// SKAI-1591: a failed first sitting load offers Retry in place instead of a dead-end alert.
const src = readFileSync("src/components/academic/exams/PaperSittingPanel.tsx", "utf8");

test("HTTP, network and invalid-body failures leave the view empty with an error notice", () => {
  assert.match(src, /\.catch\(\(\) => null\);/);
  assert.match(src, /if \(!Array\.isArray\(payload\.data\?\.sections\)\) \{ setNotice\(\{ tone: "danger", text: t\.failed \}\); return; \}/);
});

test("the failed state renders Retry that reloads the same slot", () => {
  assert.match(src, /data-paper-sitting-failed>/);
  assert.match(src, /onClick=\{\(\) => \{ setNotice\(null\); void load\(\); \}\}>\{t\.retry\}<\/Button>/);
  assert.match(src, /: <TaskLoading label=\{t\.sittingTitle\} \/>;/, "loading stays distinct from failure");
});

test("Retry is translated", () => {
  for (const lang of ["en", "ar", "ur"] as const) assert.ok(studioSlotsCopy(lang).retry, lang);
});
