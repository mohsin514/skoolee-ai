import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError, readApiErrorCode } from "../../src/lib/api/envelope-client";

// SKAI-1209 (SKAI-1163 follow-up): the account-security auth routes adopt the envelope.
const ROUTES = ["change-password", "sessions"].map(name => `src/app/api/auth/${name}/route.ts`);

test("change-password and sessions emit only the envelope", () => {
  for (const file of ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw JSON response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
  // Sessions stay scoped to the caller's own user and school.
  assert.match(readFileSync(ROUTES[1], "utf8"), /userId: user\.userId, schoolId: user\.schoolId, isActive: true/);
});

test("callers read the envelope", () => {
  assert.match(readFileSync("src/components/settings/ChangePasswordDialog.tsx", "utf8"), /readApiError\(json/);
  assert.match(readFileSync("src/components/account-security/SecuritySettingsPanel.tsx", "utf8"), /readApiData\(nextSessions/);
  assert.match(readFileSync("src/components/auth/mfa/mfa-client.ts", "utf8"), /readApiError\(data/);
});

test("a wrong current password reads as a coded 403 with the translated message", async () => {
  const response = await failFrom(new ApiError("Current password is incorrect", 403));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.deepEqual(body, { error: { code: "FORBIDDEN", message: "Current password is incorrect" } });
  assert.equal(readApiError(body, "x"), "Current password is incorrect");
});

test("another user's session is a coded 404, an expired caller a coded 401", async () => {
  const missing = await (await failFrom(new ApiError("Session is unavailable", 404))).json();
  assert.equal(readApiErrorCode(missing), "NOT_FOUND");
  const expired = await failFrom(new ApiError("Unauthorized", 401));
  assert.equal(expired.status, 401);
  assert.equal(readApiErrorCode(await expired.json()), "UNAUTHORIZED");
});

test("the sessions list keeps its fields inside data", async () => {
  const body = await ok({ mfaEnabled: true, sessions: [{ id: "s1", current: true }] }).json();
  assert.equal(isApiOk(body), true);
  assert.deepEqual(readApiData(body, { sessions: [] }).sessions, [{ id: "s1", current: true }]);
});
