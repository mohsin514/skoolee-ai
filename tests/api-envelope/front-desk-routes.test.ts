import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { fail, failFrom, failWith, okWith } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1204 (SKAI-1163 follow-up): the front-desk routes adopt the envelope.
const ROUTES = ["visitors", "postal", "complaints", "certificates", "phone-calls"].map(name => `src/app/api/front-desk/${name}/route.ts`);
const CALLERS = ["visitor-register", "postal-register", "phone-call-log", "complaints-desk", "certificates-desk"].map(name => `src/components/operations/${name}.tsx`);

test("front-desk routes emit only the envelope", () => {
  for (const file of ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw JSON response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
});

test("front-desk callers read the envelope, not the legacy flag or string error", () => {
  for (const file of CALLERS) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /json\??\.success\b/, `${file} still reads json.success`);
    assert.doesNotMatch(source, /json\??\.error\b/, `${file} still reads json.error as a string`);
    assert.match(source, /isApiOk\(json\)/);
  }
});

test("okWith keeps list counts beside data; the envelope data always wins", async () => {
  const body = await okWith([{ id: "v1" }], { onSite: 1, overdue: 0, overdueHours: 4 }).json();
  assert.deepEqual(body, { onSite: 1, overdue: 0, overdueHours: 4, data: [{ id: "v1" }] });
  assert.equal(isApiOk(body), true);
  assert.deepEqual(readApiData(body, []), [{ id: "v1" }]);
  const replay = okWith({ id: "c1" }, { replayed: true }, { status: 200 });
  assert.equal(replay.status, 200);
});

test("duplicate check-ins keep the candidates beside the coded error", async () => {
  const response = failWith("CONFLICT", "Possible duplicate visit", { duplicates: [{ id: "v0" }] });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.deepEqual(body, { duplicates: [{ id: "v0" }], error: { code: "CONFLICT", message: "Possible duplicate visit" } });
  assert.equal(isApiOk(body), false);
  assert.equal(readApiError(body, "x"), "Possible duplicate visit");
});

test("denied and missing records read as coded errors; deletes stay refused", async () => {
  const denied = await failFrom(new ApiError("Only front-desk staff and campus leaders can record visitors.", 403));
  assert.equal(denied.status, 403);
  const deniedBody = await denied.json();
  assert.equal(deniedBody.error.code, "FORBIDDEN");
  assert.equal(readApiError(deniedBody, "x"), "Only front-desk staff and campus leaders can record visitors.");
  const missing = await (await failFrom(new ApiError("Visitor log not found", 404))).json();
  assert.deepEqual(missing, { error: { code: "NOT_FOUND", message: "Visitor log not found" } });
  const refused = fail("BAD_REQUEST", "Visitor records are kept for safeguarding.", undefined, 405);
  assert.equal(refused.status, 405);
  assert.equal(readApiError(await refused.json(), "x"), "Visitor records are kept for safeguarding.");
});
