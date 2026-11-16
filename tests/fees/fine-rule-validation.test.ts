import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../../src/lib/api/scope";
import { MAX_FINE_INT, parseFineGraceDays, parseFineIsActive, parseFineName, parseFineType, parseFineValue } from "../../src/lib/fees/fine-rule-command";

// SKAI-2023: POST and PATCH /api/fees/fine-rules share these validators; bad input is a 400, never a raw 500.
const status = (fn: () => unknown) => {
  try {
    fn();
    return 200;
  } catch (error) {
    return error instanceof ApiError ? error.status : 500;
  }
};

test("name must be a non-blank string", () => {
  assert.equal(parseFineName("  Late  "), "Late");
  for (const bad of ["", "   ", undefined, null, 5]) assert.equal(status(() => parseFineName(bad)), 400);
});

test("type is normalised and restricted", () => {
  assert.equal(parseFineType("flat"), "FLAT");
  assert.equal(status(() => parseFineType("bogus")), 400);
});

test("value is an integer within Int4, percent capped at 100", () => {
  assert.equal(parseFineValue("5", "FLAT"), 5);
  assert.equal(parseFineValue(MAX_FINE_INT, "FLAT"), MAX_FINE_INT);
  for (const bad of [99999999999, MAX_FINE_INT + 1, -1, 2.5, "abc", "", null, {}]) assert.equal(status(() => parseFineValue(bad, "FLAT")), 400);
  assert.equal(status(() => parseFineValue(101, "PERCENT")), 400);
});

test("graceDays is a non-negative Int4 whole number", () => {
  assert.equal(parseFineGraceDays(0), 0);
  assert.equal(parseFineGraceDays("10"), 10);
  for (const bad of ["abc", "ten", "", -7, -1, 1.5, 99999999999, 3000000000, null, {}]) assert.equal(status(() => parseFineGraceDays(bad)), 400);
});

test("isActive must be a boolean", () => {
  assert.equal(parseFineIsActive(false), false);
  for (const bad of ["yes", 1, null]) assert.equal(status(() => parseFineIsActive(bad)), 400);
});
