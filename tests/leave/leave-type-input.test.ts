import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../../src/lib/api/scope";
import {
  isLeaveTypeNameClash,
  leaveTypeNameTaken,
  parseLeaveTypeDefaultDays,
} from "../../src/lib/leave/type-input";

// SKAI-446: leave type default days are validated, and concurrent identical creates map to 409.

function statusOf(fn: () => unknown): number | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof ApiError ? error.status : -1;
  }
}

test("missing default days means 0", () => {
  assert.equal(parseLeaveTypeDefaultDays(undefined), 0);
  assert.equal(parseLeaveTypeDefaultDays(null), 0);
});

test("valid numeric default days are accepted, including numeric strings", () => {
  assert.equal(parseLeaveTypeDefaultDays(10), 10);
  assert.equal(parseLeaveTypeDefaultDays(2.5), 2.5);
  assert.equal(parseLeaveTypeDefaultDays("7"), 7);
  assert.equal(parseLeaveTypeDefaultDays(0), 0);
});

test("negative default days are rejected with a 400 naming the field", () => {
  assert.equal(statusOf(() => parseLeaveTypeDefaultDays(-3)), 400);
  assert.equal(statusOf(() => parseLeaveTypeDefaultDays("-0.5")), 400);
  try {
    parseLeaveTypeDefaultDays(-2);
    assert.fail("expected a 400");
  } catch (error) {
    assert.match((error as ApiError).message, /defaultDays/);
  }
});

test("non-numeric default days are rejected with a 400, not a server error", () => {
  assert.equal(statusOf(() => parseLeaveTypeDefaultDays("abc")), 400);
  assert.equal(statusOf(() => parseLeaveTypeDefaultDays("")), 400);
  assert.equal(statusOf(() => parseLeaveTypeDefaultDays("   ")), 400);
  assert.equal(statusOf(() => parseLeaveTypeDefaultDays(Number.NaN)), 400);
  assert.equal(statusOf(() => parseLeaveTypeDefaultDays(Number.POSITIVE_INFINITY)), 400);
  assert.equal(statusOf(() => parseLeaveTypeDefaultDays(true)), 400);
  assert.equal(statusOf(() => parseLeaveTypeDefaultDays({})), 400);
});

test("a unique-key violation (P2002) from a concurrent identical create maps to a 409 conflict", () => {
  assert.equal(isLeaveTypeNameClash({ code: "P2002" }), true);
  assert.equal(isLeaveTypeNameClash(new Error("boom")), false);
  assert.equal(isLeaveTypeNameClash(null), false);
  assert.equal(isLeaveTypeNameClash({ code: "P2025" }), false);

  const conflict = leaveTypeNameTaken("Casual");
  assert.equal(conflict.status, 409);
  assert.equal(conflict.message, 'Leave type "Casual" already exists');
});
