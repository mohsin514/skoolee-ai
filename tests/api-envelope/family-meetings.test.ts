import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, ok } from "../../src/lib/api/envelope";
import { readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1163 batch 2: trips, meetings and pathways routes adopt the envelope.
const ADOPTED_ROUTES = ["src/app/api/trips/route.ts", "src/app/api/meetings/route.ts", "src/app/api/pathways/route.ts"];
const CALLERS = ["src/components/family/staff-requests.tsx", "src/components/meetings/meeting-desk.tsx", "src/components/pathways/pathway-panel.tsx"];

test("batch 2 routes emit only the envelope", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
});

test("batch 2 callers read errors through the shared reader, not `success`", () => {
  for (const file of CALLERS) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /readApiError\(json/, `${file} must read envelope errors`);
    assert.doesNotMatch(source, /!json\??\.success\)/, `${file} still requires the legacy success flag`);
  }
});

test("headers set by a route survive the envelope", async () => {
  const res = ok({ desk: [] }, { headers: { "Cache-Control": "private, no-store" } });
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await res.json(), { data: { desk: [] } });
});

test("a conflict thrown by a service reaches the desk as its message", async () => {
  const res = await failFrom(new ApiError("This slot was just taken", 409));
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.equal(body.error.code, "CONFLICT");
  assert.equal(readApiError(body, "The change was not saved."), "This slot was just taken");
});
