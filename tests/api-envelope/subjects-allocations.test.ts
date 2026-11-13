import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1203 batch C: bulk teacher allocation adopts the envelope.
const ROUTE = "src/app/api/subjects/allocations/route.ts";
const CALLER = "src/components/shared-admin/bulk-allocate.tsx";

test("the allocation route emits only the envelope", () => {
  const source = readFileSync(ROUTE, "utf8");
  assert.doesNotMatch(source, /Response\.json\(/, "route still builds a raw response");
  assert.doesNotMatch(source, /errorResponse\(/, "route still uses the legacy error shape");
  assert.match(source, /from "@\/lib\/api\/envelope"/);
  assert.match(source, /return ok\(\{ \.\.\.result,/);
});

test("the allocation caller reads the envelope, not the success flag", () => {
  const source = readFileSync(CALLER, "utf8");
  assert.match(source, /isApiOk\(json\)/);
  assert.match(source, /readApiData\(json, null\) as Preview/);
  assert.doesNotMatch(source, /json\.success/);
});

test("a denied teacher gets a FORBIDDEN envelope and the caller shows its message", async () => {
  const res = await failFrom(new ApiError("Insufficient permissions", 403));
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.error.code, "FORBIDDEN");
  assert.equal(isApiOk(body), false);
  assert.equal(readApiError(body, "Could not allocate the teacher."), "Insufficient permissions");
});

test("a successful preview reads its data through the envelope", async () => {
  const body = await ok({ changes: 2, unchanged: 0, scheduledSubjects: 2, capacity: null, warnings: [] }).json();
  assert.equal(isApiOk(body), true);
  assert.equal(readApiData<{ changes: number } | null>(body, null)?.changes, 2);
});
