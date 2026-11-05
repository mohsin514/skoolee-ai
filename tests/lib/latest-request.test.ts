import { test } from "node:test";
import assert from "node:assert/strict";
import { createLatestRequest } from "../../src/lib/latest-request";

test("a slow response for A arriving after B is selected is ignored; B is applied", () => {
  const guard = createLatestRequest<string>();
  const a = guard.begin("teacher-a");
  const b = guard.begin("teacher-b");
  assert.equal(guard.isCurrent(b, "teacher-b"), true);
  assert.equal(guard.isCurrent(a, "teacher-b"), false);
});

test("cancel ignores in-flight responses after close", () => {
  const guard = createLatestRequest<string>();
  const a = guard.begin("teacher-a");
  guard.cancel();
  assert.equal(guard.isCurrent(a, "teacher-a"), false);
});

test("token must match the active key", () => {
  const guard = createLatestRequest<string>();
  const a = guard.begin("teacher-a");
  assert.equal(guard.isCurrent(a, "teacher-b"), false);
});

test("payroll period: slow March 2026 response after March 2027 is ignored; March 2027 is applied", () => {
  const guard = createLatestRequest<string>();
  const older = guard.begin("2026-3");
  const newer = guard.begin("2027-3");
  assert.equal(guard.isCurrent(newer, "2027-3"), true);
  assert.equal(guard.isCurrent(older, "2026-3"), false);
});
