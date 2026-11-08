import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { ApiError, ValidationError } from "../../src/lib/api/scope";
import { codeForStatus, created, fail, failFrom, ok, statusForCode } from "../../src/lib/api/envelope";
import { readApiData, readApiError, readApiErrorCode, readApiFields } from "../../src/lib/api/envelope-client";

// SKAI-1163 batch 1: the envelope helper and the student-tag routes that adopt it.
const ADOPTED_ROUTES = ["src/app/api/student-categories/route.ts", "src/app/api/student-groups/route.ts"];

test("ok and created wrap the payload in { data }", async () => {
  const res = ok([{ id: "c1" }]);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { data: [{ id: "c1" }] });
  assert.equal(created({ id: "c1" }).status, 201);
});

test("fail maps codes to statuses and keeps fields", async () => {
  const res = fail("CONFLICT", "Already exists");
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: { code: "CONFLICT", message: "Already exists" } });
  const invalid = await fail("VALIDATION_FAILED", "Check", { name: ["Required"] }).json();
  assert.deepEqual(invalid.error.fields, { name: ["Required"] });
  assert.equal(statusForCode("RATE_LIMITED"), 429);
  assert.equal(codeForStatus(403), "FORBIDDEN");
  assert.equal(codeForStatus(422), "BAD_REQUEST");
  assert.equal(codeForStatus(503), "INTERNAL");
});

test("failFrom reshapes ApiError, keeping its machine code", async () => {
  const res = await failFrom(new ApiError("Insufficient permissions", 403));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
  assert.ok(res.headers.get("x-request-id"));
  const coded = await (await failFrom(new ApiError("Verify first", 401, "MFA_REQUIRED"))).json();
  assert.equal(coded.error.code, "MFA_REQUIRED");
});

test("failFrom carries validation field maps", async () => {
  const body = await (await failFrom(new ValidationError({ name: ["Name is required"] }))).json();
  assert.equal(body.error.code, "VALIDATION_FAILED");
  assert.deepEqual(body.error.fields, { name: ["Name is required"] });
  const parsed = z.object({ name: z.string() }).safeParse({});
  assert.equal(parsed.success, false);
  const zod = await (await failFrom(parsed.error)).json();
  assert.equal(zod.error.code, "VALIDATION_FAILED");
  assert.ok(zod.error.fields.name);
});

test("failFrom never leaks a 5xx message", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const res = await failFrom(new Error("connection string postgres://secret"), "[x] failed");
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error.code, "INTERNAL");
    assert.doesNotMatch(body.error.message, /secret/);
  } finally {
    console.error = original;
  }
});

test("client readers accept both envelope and legacy shapes", () => {
  assert.equal(readApiError({ error: { code: "CONFLICT", message: "Taken" } }), "Taken");
  assert.equal(readApiError({ error: "Legacy" }), "Legacy");
  assert.equal(readApiError(null, "Fallback"), "Fallback");
  assert.equal(readApiErrorCode({ error: { code: "FORBIDDEN", message: "x" } }), "FORBIDDEN");
  assert.equal(readApiErrorCode({ error: "x", code: "SUBSCRIPTION_SUSPENDED" }), "SUBSCRIPTION_SUSPENDED");
  assert.deepEqual(readApiFields({ error: { code: "VALIDATION_FAILED", message: "x", fields: { a: ["b"] } } }), { a: ["b"] });
  assert.deepEqual(readApiData({ data: [1] }, []), [1]);
  assert.deepEqual(readApiData({ success: true, data: [2] }, []), [2]);
  assert.deepEqual(readApiData({ success: false, data: [3] }, []), []);
  assert.deepEqual(readApiData({ error: { code: "X", message: "y" } }, []), []);
});

test("adopted routes emit only the envelope", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
    assert.match(source, /parseBody\(/, `${file} must keep SKAI-1161 validation`);
  }
});

test("shared client helpers accept the envelope", async () => {
  const { checkedJson } = await import("../../src/lib/http/request-state");
  const { apiErrorMessage } = await import("../../src/lib/errors");
  assert.deepEqual(await checkedJson(ok([1])), { data: [1] });
  assert.deepEqual(await checkedJson(Response.json({ success: true, data: [2] })), { success: true, data: [2] });
  await assert.rejects(checkedJson(Response.json({ error: { code: "X", message: "y" }, data: null })));
  await assert.rejects(checkedJson(Response.json({ items: [] })));
  assert.equal(apiErrorMessage({ code: "CONFLICT", message: "Taken" }, "fallback"), "Taken");
  assert.equal(apiErrorMessage({ name: ["Required"] }, "fallback"), "name: Required");
});
