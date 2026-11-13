import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { created, failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1204 (SKAI-1163 follow-up): guardian-consents and activities adopt the envelope.
const ROUTES = ["src/app/api/guardian-consents/route.ts", "src/app/api/activities/route.ts"];

test("guardian-consents and activities routes emit only the envelope", () => {
  for (const file of ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw JSON response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
});

test("their callers read the envelope", () => {
  const activities = readFileSync("src/components/activities/activities.tsx", "utf8");
  assert.doesNotMatch(activities, /json\.success/);
  assert.match(activities, /isApiOk\(json\)/);
  const consent = readFileSync("src/components/family/guardian-consent.tsx", "utf8");
  assert.match(consent, /useJson[\s\S]*isApiOk\(json\)[\s\S]*readApiError\(json, "Could not load consent\."\)/);
});

test("a created activity and a replayed session keep their statuses", async () => {
  const made = created({ id: "a1" });
  assert.equal(made.status, 201);
  const body = await made.json();
  assert.deepEqual(body, { data: { id: "a1" } });
  assert.equal(isApiOk(body), true);
  const replay = ok({ id: "s1", replayed: true }, { status: 200 });
  assert.deepEqual(readApiData(await replay.json(), null), { id: "s1", replayed: true });
});

test("a denied role and another school's activity read as coded errors", async () => {
  // Parents/students and other schools' staff get 404, so a record's existence is not revealed.
  const hidden = await failFrom(new ApiError("Not found", 404));
  assert.equal(hidden.status, 404);
  assert.deepEqual(await hidden.json(), { error: { code: "NOT_FOUND", message: "Not found" } });
  const denied = await (await failFrom(new ApiError("Only the activity coordinator can refund.", 403))).json();
  assert.equal(denied.error.code, "FORBIDDEN");
  assert.equal(isApiOk(denied), false);
  assert.equal(readApiError(denied, "x"), "Only the activity coordinator can refund.");
  const unknown = await (await failFrom(new ApiError("Unknown action", 400))).json();
  assert.equal(unknown.error.code, "BAD_REQUEST");
});
