import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LARGE_CLASS_SIZE, LARGE_CLASS_ROLL_PREFIX, largeClassRoster, parseSize } from "../../scripts/qa/large-class-plan";

test("default size is over 100 and bounds are enforced", () => {
  assert.ok(parseSize(undefined) >= 100);
  assert.equal(parseSize(undefined), DEFAULT_LARGE_CLASS_SIZE);
  assert.equal(parseSize("250"), 250);
  for (const bad of ["99", "1001", "abc", "120.5"]) assert.throws(() => parseSize(bad), /size must be/);
});

test("roster is deterministic, unique and prefixed per school", () => {
  const a = largeClassRoster("qa-alpha", 120);
  assert.equal(a.length, 120);
  assert.deepEqual(a, largeClassRoster("qa-alpha", 120));
  assert.equal(new Set(a.map((s) => s.rollNo)).size, 120);
  assert.ok(a.every((s) => s.rollNo.startsWith(LARGE_CLASS_ROLL_PREFIX)));
  assert.ok(a.some((s) => /[؀-ۿ]/.test(s.fullName)), "includes right-to-left names");
});

test("two schools never share admission numbers", () => {
  const alpha = new Set(largeClassRoster("qa-alpha", 150).map((s) => s.admissionNo));
  const beta = largeClassRoster("qa-beta", 150).map((s) => s.admissionNo);
  assert.ok(beta.every((n) => !alpha.has(n)));
});
