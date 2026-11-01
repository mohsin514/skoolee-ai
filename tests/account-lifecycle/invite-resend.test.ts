import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/actions/invite.ts", "utf8");
const resend = source.slice(source.indexOf("export async function resendInvitation"), source.indexOf("export async function acceptInvite("));

test("SKAI-1624: resend claims the pending invite by its old token and answers a lost race with 409", () => {
  assert.match(resend, /updateMany\(\{\s*where: \{ id: invite\.id, campusId: invite\.campusId, status: "pending", token: invite\.token \}/);
  assert.match(resend, /claimed\.count !== 1\) \{\s*throw new ApiError\([^)]*, 409\)/);
  assert.doesNotMatch(resend, /staffInvitation\.update\(\{\s*where: \{ id: invite\.id, status/);
});

test("SKAI-1624: the email is sent only after the claim succeeds", () => {
  assert.ok(resend.indexOf("claimed.count !== 1") < resend.indexOf("sendInviteEmail("));
});

test("SKAI-1624: school and campus authorization still run before the claim", () => {
  const claim = resend.indexOf("updateMany(");
  assert.ok(resend.indexOf("invite.campus.schoolId !== session.schoolId") < claim);
  assert.ok(resend.indexOf("invite.campusId !== session.campusId") < claim);
});
