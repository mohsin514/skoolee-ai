import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";

// SKAI-1559: a stale-version 409 offers a reload and blocks sign/return/seal until it happens.
const src = readFileSync("src/components/school-ai/exam-studio/moderation-panel.tsx", "utf8");

test("409 marks the panel stale and the reload clears it without touching comments", () => {
  assert.equal((src.match(/status === 409\) setStale\(true\);/g) ?? []).length, 2);
  assert.match(src, /const reloadCurrent = async \(\) => \{ await load\(\); setStale\(false\); setError\(null\); \};/);
  assert.doesNotMatch(src.slice(src.indexOf("const reloadCurrent"), src.indexOf("const load = useCallback")), /setComments/);
});

test("sign, return and seal are disabled while stale and a reload button is shown", () => {
  assert.match(src, /disabled=\{busy \|\| stale \|\| view\.blocking\.length > 0\}/);
  assert.match(src, /disabled=\{busy \|\| stale\} onClick=\{\(\) => void decide\("RETURNED"\)\}/);
  assert.match(src, /disabled=\{busy \|\| stale\} onClick=\{\(\) => void seal\(\)\}/);
  assert.match(src, /onClick=\{\(\) => void reloadCurrent\(\)\} data-moderation="reload">\{t\.reloadCurrent\}/);
  for (const lang of ["en", "ar", "ur"] as const) assert.ok(studioSlotsCopy(lang).reloadCurrent, lang);
});
