import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SignJWT } from "jose";
import { JWT_SECRET } from "../../src/lib/auth/secret";
import {
  isPendingVerification,
  issueVerificationToken,
  readVerificationToken,
  VERIFICATION_COMPLETED_ACTION,
  VERIFICATION_REJECTED_ACTION,
  VERIFICATION_RESENT_ACTION,
  verificationRedirect,
} from "../../src/lib/auth/verification";

// SKAI-83: the verify-email link. Synthetic ids only.
const userId = "00000000-0000-4000-8000-000000000083";
const verifyRoute = readFileSync("src/app/api/auth/verify/route.ts", "utf8");

test("an expired link reads as invalid", async () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  const expired = await new SignJWT({ userId, purpose: "email-verification" })
    .setProtectedHeader({ alg: "HS256" }).setJti("old").setIssuedAt(past - 86_400).setExpirationTime(past).sign(JWT_SECRET);
  assert.equal(await readVerificationToken(expired), null);
});

test("a token signed for another purpose is not a verification link", async () => {
  const other = await new SignJWT({ userId, purpose: "password-reset" })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(JWT_SECRET);
  assert.equal(await readVerificationToken(other), null);
  assert.ok(await readVerificationToken((await issueVerificationToken(userId)).token));
});

test("only an inactive, never-verified owner is activated", () => {
  assert.equal(isPendingVerification({ isActive: false, emailVerifiedAt: null, isInstitutionOwner: true }), true);
  assert.equal(isPendingVerification({ isActive: true, emailVerifiedAt: null, isInstitutionOwner: true }), false);
  assert.equal(isPendingVerification({ isActive: false, emailVerifiedAt: new Date(), isInstitutionOwner: true }), false);
  assert.equal(isPendingVerification({ isActive: false, emailVerifiedAt: null, isInstitutionOwner: false }), false);
});

test("superseded, unknown and invalid links redirect identically (no account enumeration)", () => {
  assert.deepEqual(verificationRedirect("superseded"), verificationRedirect("invalid"));
  assert.deepEqual(verificationRedirect("activated"), { pathname: "/verify-success", params: {} });
  assert.deepEqual(verificationRedirect("already_verified"), { pathname: "/login", params: { verified: "true" } });
});

test("activation is single-use: one conditional update guarded by the pending-owner filter", () => {
  assert.match(verifyRoute, /updateMany\(\{\s*where: \{ id: userId, \.\.\.pendingVerificationWhere \}/);
  assert.match(verifyRoute, /activated\.count === 0/);
});

test("activation and refused links are audited without email or token", () => {
  assert.notEqual(VERIFICATION_COMPLETED_ACTION, VERIFICATION_RESENT_ACTION);
  assert.notEqual(VERIFICATION_REJECTED_ACTION, VERIFICATION_RESENT_ACTION);
  const completed = verifyRoute.indexOf("audit(userId, VERIFICATION_COMPLETED_ACTION");
  assert.ok(completed > verifyRoute.indexOf("updateMany("));
  assert.match(verifyRoute, /reason: "superseded"/);
  assert.match(verifyRoute, /reason: "not_pending"/);
  assert.match(verifyRoute, /newValue: \{ action, \.\.\.detail \}/);
  assert.doesNotMatch(verifyRoute, /audit\([^)]*(email|token[,}\s])/);
});
