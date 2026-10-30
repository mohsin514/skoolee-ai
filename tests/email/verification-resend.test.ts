import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createVerificationToken,
  isCurrentVerificationLink,
  issueVerificationToken,
  readVerificationToken,
  verifyVerificationToken,
} from "../../src/lib/auth/verification";

// SKAI-84: verification email resend. Synthetic ids only.
const userId = "00000000-0000-4000-8000-000000000084";

test("each issued link carries its own id and names its user", async () => {
  const a = await issueVerificationToken(userId);
  const b = await issueVerificationToken(userId);
  assert.notEqual(a.tokenId, b.tokenId);
  assert.deepEqual(await readVerificationToken(a.token), { userId, tokenId: a.tokenId });
  assert.equal(await verifyVerificationToken(await createVerificationToken(userId)), userId);
});

test("a tampered or foreign token reads as invalid", async () => {
  const { token } = await issueVerificationToken(userId);
  assert.equal(await readVerificationToken(`${token}x`), null);
  assert.equal(await readVerificationToken("not-a-token"), null);
});

test("a resend supersedes every earlier link; before any resend the register link works", () => {
  assert.equal(isCurrentVerificationLink("register-link", null), true);
  assert.equal(isCurrentVerificationLink("register-link", "resent-link"), false);
  assert.equal(isCurrentVerificationLink(null, "resent-link"), false);
  assert.equal(isCurrentVerificationLink("resent-link", "resent-link"), true);
});

const resendRoute = readFileSync("src/app/api/auth/verify/resend/route.ts", "utf8");
const verifyRoute = readFileSync("src/app/api/auth/verify/route.ts", "utf8");

test("resend answers identically whatever the account state, and works after the response", () => {
  assert.match(resendRoute, /after\(/);
  assert.equal((resendRoute.match(/NextResponse\.json\(ACCEPTED/g) ?? []).length, 1);
  assert.match(resendRoute, /verify-resend:target:/);
  assert.match(resendRoute, /verify-resend:\$\{ip\}/);
});

test("the superseding audit entry is written only after delivery succeeds", () => {
  const send = resendRoute.indexOf("sendVerificationEmail(");
  const audit = resendRoute.indexOf("auditLog.create(");
  assert.ok(send > 0 && audit > send);
  assert.match(resendRoute, /tokenId \}/);
});

test("verify rejects a superseded link the same way as an expired one", () => {
  assert.match(verifyRoute, /!\(await isLatestLink\(userId, link\.tokenId\)\)/);
  assert.match(verifyRoute, /schoolId: user\.schoolId/);
});
