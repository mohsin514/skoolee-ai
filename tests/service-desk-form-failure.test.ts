import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1657: a failed form-options lookup shows Retry instead of silently disabling submission.
const source = readFileSync("src/components/service-desk/service-desk.tsx", "utf8");

test("form lookup failure is recorded, not swallowed", () => {
  assert.match(source, /\.catch\(\(\) => setFormFailed\(true\)\)/);
  assert.match(source, /setForm\(f\); setFormFailed\(false\);/);
});

test("Try again re-runs the lookup without clearing the draft", () => {
  assert.match(source, /\{formFailed \? <div data-sd-form-failed>/);
  assert.match(source, /setFormAttempt\(n => n \+ 1\)/);
  assert.match(source, /draft\.categoryId, formAttempt\]\);/);
});
