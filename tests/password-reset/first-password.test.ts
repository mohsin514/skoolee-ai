import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-87: contract checks on the forced first-login password route. The database
// behaviour (revocation, replay, reuse) is exercised in tests/account-lifecycle.
const route = readFileSync(new URL("../../src/app/api/auth/first-password/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../src/app/(auth)/first-login/page.tsx", import.meta.url), "utf8");

test("first-login uses the reset password policy on server and page", () => {
  assert.match(route, /resetPasswordProblem\(newPassword\)/);
  assert.match(page, /passwordRules\(v, v\)/);
  assert.doesNotMatch(route, /newPassword\.length < 8/);
});

test("temporary and the last five passwords are refused", () => {
  assert.match(route, /passwordHistory\.findMany\(\{[\s\S]*take: 5/);
  assert.match(route, /\[temporaryHash, \.\.\.history/);
});

test("attempts are rate limited per account before any bcrypt work", () => {
  const limit = route.indexOf("authRateLimit(`first-password:${auth.userId}`");
  assert.ok(limit > 0 && limit < route.indexOf("bcrypt.compare"));
});

test("completion is a single conditional claim that revokes sessions and audits", () => {
  assert.match(route, /updateMany\(\{\s*where: \{ id: user\.id, mustChangePassword: true, accessVersion: user\.accessVersion \}/);
  assert.match(route, /if \(claim\.count !== 1\) return false/);
  assert.match(route, /loginSession\.updateMany/);
  assert.match(route, /action: "first_password\.completed", sessionsRevoked: true/);
  assert.doesNotMatch(route, /newValue: \{[^}]*(hash|newPassword)/i, "no secret in the audit value");
});

test("errors are non-enumerating codes the page localizes in every language", () => {
  assert.doesNotMatch(route, /Account not found/);
  for (const code of ["policy", "reused", "limited", "not_pending"]) {
    assert.match(route, new RegExp(`fail\\("${code}"`));
    assert.match(page, new RegExp(`${code}: t\\.`));
  }
  for (const key of ["reused: \"", "limited: \"", "notPending: \""]) assert.equal(page.split(key).length - 1, 3, key);
});
