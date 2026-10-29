import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTeachingMode } from "../../src/lib/academic/teaching-mode";

// SKAI-197: teaching-mode input validation shared by class create and update.
test("an omitted mode takes the fallback", () => {
  assert.equal(parseTeachingMode(undefined, "SINGLE"), "SINGLE");
  assert.equal(parseTeachingMode(null, "SUBJECT"), "SUBJECT");
  assert.equal(parseTeachingMode("", "SUBJECT"), "SUBJECT");
});

test("known modes are accepted regardless of case and spacing", () => {
  assert.equal(parseTeachingMode("subject", "SINGLE"), "SUBJECT");
  assert.equal(parseTeachingMode(" Single ", "SUBJECT"), "SINGLE");
});

test("an unknown mode is refused with a 400, not coerced to SINGLE", () => {
  for (const bad of ["HYBRID", "online", 3, {}]) {
    assert.throws(() => parseTeachingMode(bad, "SINGLE"), (error: { status?: number }) => error.status === 400);
  }
});
