import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-815: a phone change is class C and needs two-step sign-in in the session, enforced on the server.
const source = readFileSync("src/app/api/profile/route.ts", "utf8");

test("PATCH /api/profile gates a changed phone number on mfaVerified before the update", () => {
  const gate = source.indexOf('"MFA_REQUIRED"');
  const update = source.indexOf("await prisma.user.update({");
  assert.ok(gate > 0, "MFA_REQUIRED gate missing");
  assert.ok(gate < update, "gate must run before the user update");
  assert.match(source, /session\.mfaVerified !== true/);
});

test("the phone gate compares with the stored number so an unchanged phone is not blocked", () => {
  assert.match(source, /\(phone \|\| null\) !== \(currentUser\?\.phone \|\| null\)/);
  assert.match(source, /select: \{ fullName: true, phone: true, profileImageUrl: true \}/);
});

test("the gate does not run for name or photo-only saves", () => {
  // The gate sits inside the body.phone branch, so it never fires for fullName or profileImageUrl changes.
  const branch = source.indexOf("if (body.phone !== undefined) {");
  const gate = source.indexOf('"MFA_REQUIRED"');
  const nextBranch = source.indexOf("if (body.profileImageUrl !== undefined)");
  assert.ok(branch > 0 && gate > branch && gate < nextBranch);
});
