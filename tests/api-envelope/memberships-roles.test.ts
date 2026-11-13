import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ok, failFrom } from "../../src/lib/api/envelope";
import { ApiError } from "../../src/lib/api/scope";
import { isApiOk, readApiData, readApiError, readApiErrorCode } from "../../src/lib/api/envelope-client";

// SKAI-1215 (SKAI-1163 follow-up): memberships and roles/permissions adopt the envelope.
const ROUTES = ["src/app/api/memberships/route.ts", "src/app/api/roles/permissions/route.ts"];
const CALLERS = ["src/components/memberships/memberships-panel.tsx", "src/app/super/page.tsx", "src/components/shared-admin/role-permissions-panel.tsx"];

test("memberships and roles routes emit only the envelope", () => {
  for (const file of ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
});

test("callers read the envelope instead of the flat or success shapes", () => {
  for (const file of CALLERS) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /json\??\.success\b/, `${file} still reads json.success`);
    assert.doesNotMatch(source, /throw new Error\(result\.error\)/, `${file} still throws the raw error field`);
    assert.match(source, /readApiData/);
  }
  assert.doesNotMatch(readFileSync(CALLERS[0], "utf8"), /envelope: false/);
});

test("the memberships GET body round-trips through readApiData", async () => {
  const body = await ok({ members: [{ id: "m1" }], campuses: [], canManage: true }).json();
  assert.equal(isApiOk(body), true);
  assert.deepEqual(readApiData<{ members: unknown[] }>(body, { members: [] }).members, [{ id: "m1" }]);
});

test("a denied role gets an envelope error that keeps the MFA code", async () => {
  const denied = await failFrom(new ApiError("Membership management is not delegated", 403));
  assert.equal(denied.status, 403);
  const body = await denied.json();
  assert.equal(isApiOk(body), false);
  assert.equal(readApiError(body), "Membership management is not delegated");
  const mfa = await (await failFrom(new ApiError("Turn on two-step sign-in", 403, "MFA_REQUIRED"))).json();
  assert.equal(readApiErrorCode(mfa), "MFA_REQUIRED");
});
