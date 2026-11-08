import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorResponse } from "../../src/lib/api/scope";
import { parseBody, readJsonBody } from "../../src/lib/api/validate";
import { jsonObjectBody, requiredIdBody } from "../../src/lib/validators/route-bodies";

// Batch of SKAI-1161: auth, billing and AI write routes.
const ADOPTED_ROUTES = [
  "src/app/api/ai/generate-remarks/route.ts",
  "src/app/api/ai/insights/route.ts",
  "src/app/api/ai/review/[id]/route.ts",
  "src/app/api/ai/translate/route.ts",
  "src/app/api/auth/signup-step1/route.ts",
  "src/app/api/billing/lifecycle/route.ts",
  "src/app/api/billing/payment-request/route.ts",
  "src/app/api/data-lifecycle/requests/route.ts",
  "src/app/api/invite/reissue/route.ts",
  "src/app/api/onboarding/package/route.ts",
  "src/app/api/onboarding/package/test-checkout/route.ts",
  "src/app/api/parent/exam-brief/route.ts",
  "src/app/api/parent/invitations/route.ts",
  "src/app/api/profile/route.ts",
  "src/app/api/safepay/simulate/route.ts",
  "src/app/api/stripe/checkout/route.ts",
  "src/app/api/super/sessions/route.ts",
  "src/app/api/super/support-grants/route.ts",
  "src/app/api/tenants/route.ts",
  "src/app/api/users/route.ts",
  "src/app/api/whatsapp/route.ts",
];

const post = (body: string) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });

const statusOf = (promise: Promise<unknown>) =>
  promise.then(() => 200, (error) => errorResponse(error).status);

test("auth, billing and AI routes reject malformed JSON with 400, not 500", async () => {
  assert.equal(await statusOf(readJsonBody(post("{not json"))), 400);
  assert.equal(await statusOf(parseBody(post("[1,2]"), jsonObjectBody)), 400);
});

test("auth, billing and AI routes keep valid bodies intact", async () => {
  const body = { studentId: "stu_1", userId: "usr_1", note: "kept", extra: { nested: true } };
  assert.deepEqual(await parseBody(post(JSON.stringify(body)), jsonObjectBody), body);
});

test("auth, billing and AI id lookups report the missing field", async () => {
  const response = errorResponse(await parseBody(post("{\"userId\":\"\"}"), requiredIdBody("userId")).catch((e) => e));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).details, { userId: ["userId required"] });
});

test("auth, billing and AI write routes read bodies through the shared helper", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /await (req|request)\.json\(\)(?!\.catch)/, file);
    assert.match(source, /(parseBody|readJsonBody)\(/, file);
  }
});
