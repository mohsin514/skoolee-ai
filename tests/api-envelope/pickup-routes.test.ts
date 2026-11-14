import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1204 (SKAI-1163 follow-up): pickup routes adopt the envelope.
const ROUTES = ["src/app/api/pickup/route.ts", "src/app/api/pickup/gate/route.ts", "src/app/api/pickup/restrictions/route.ts"];

test("pickup routes emit only the envelope", () => {
  for (const file of ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw JSON response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
});

test("the pickup client reads the envelope", () => {
  const source = readFileSync("src/components/pickup/pickup.tsx", "utf8");
  assert.doesNotMatch(source, /json\.success/);
  assert.match(source, /isApiOk\(json\)/);
  assert.match(source, /readApiError\(json,/);
});

test("a pickup success body reads as data and a denied body as its message", async () => {
  const body = await ok({ items: [{ id: "p1" }], nextCursor: null }, { headers: { "Cache-Control": "private, no-store" } }).json();
  assert.deepEqual(body, { data: { items: [{ id: "p1" }], nextCursor: null } });
  assert.equal(isApiOk(body), true);
  assert.deepEqual(readApiData(body, null), { items: [{ id: "p1" }], nextCursor: null });

  const denied = await failFrom(new ApiError("Pickup verification access is required.", 403)).then(r => r.json());
  assert.equal(isApiOk(denied), false);
  assert.equal(readApiError(denied, "fallback"), "Pickup verification access is required.");
});

test("an unknown pickup action is a coded 400", async () => {
  const response = await failFrom(new ApiError("Unknown action", 400));
  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, "BAD_REQUEST");
  assert.equal(body.error.message, "Unknown action");
});
