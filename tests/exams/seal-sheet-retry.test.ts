import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1549: a failed moderation load in the seal sheet shows why and offers Retry.
const src = readFileSync("src/components/academic/exams/PapersStep.tsx", "utf8");
const sheet = src.slice(src.indexOf("function SealSheet"), src.indexOf("function CompromiseSlot"));

test("non-OK, malformed and network failures set factsFailed", () => {
  assert.match(sheet, /typeof payload\?\.data\?\.paperVersion !== "number"\) \{ setFactsFailed\(true\); return; \}/);
  assert.match(sheet, /\.catch\(\(\) => \{ if \(live\) setFactsFailed\(true\); \}\)/);
  assert.match(sheet, /\[slot\.id, slot\.moderatorName, attempt\]/);
});

test("the failure is explained, Retry reloads the same slot, and sealing stays blocked", () => {
  assert.match(sheet, /blockedReason=\{facts \? null : factsFailed \? t\.loadFailed : t\.sealConfirm\}/);
  assert.match(sheet, /\{factsFailed && !facts \? <Alert tone="danger"[\s\S]*onClick=\{\(\) => setAttempt\(n => n \+ 1\)\}>\{t\.retry\}/);
});
