import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { accountSetupEmailText, ACCOUNT_SETUP_TTL_MS } from "../../src/lib/owner/account-setup-email";

// SKAI-1801: owner-created accounts were never emailed.

test("the setup email carries a set-password link and sign-in URL, never a password", () => {
  const text = accountSetupEmailText({
    fullName: "QA Teacher",
    schoolName: "QA Alpha School",
    roleLabel: "Teacher",
    actionUrl: "https://dev.example/forgot-password?token=abc",
    loginUrl: "https://dev.example/login",
  });
  assert.match(text, /QA Alpha School \(Teacher\)/);
  assert.match(text, /forgot-password\?token=abc/);
  assert.match(text, /https:\/\/dev\.example\/login/);
  assert.doesNotMatch(text, /password:/i);
  assert.equal(ACCOUNT_SETUP_TTL_MS, 72 * 3600_000);
});

test("both owner create routes send the setup email and report delivery", () => {
  for (const file of ["src/app/api/owner/users/route.ts", "src/app/api/owner/schools/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /sendAccountSetupEmail\(/, `${file} sends the setup email`);
    assert.match(source, /emailDelivery/, `${file} returns emailDelivery`);
  }
});

test("redeeming a set-password link clears the forced first-login change", () => {
  const source = readFileSync("src/app/actions/auth/reset.ts", "utf8");
  assert.match(source, /mustChangePassword: false/);
});

test("no support session is an empty 200, not a 403", () => {
  const source = readFileSync("src/app/api/owner/support/session/route.ts", "utf8");
  assert.match(source, /get\(SUPPORT_COOKIE\)\?\.value\) return Response\.json\(\{ success: true, data: null \}\)/);
});
