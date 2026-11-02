import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1598: the one-open-proposal rule is checked and enforced under one per-enrollment lock.
test("propose locks the current enrollment before checking for an open proposal and creating one", () => {
  const src = readFileSync("src/app/api/students/enrollments/route.ts", "utf8");
  const body = src.slice(src.indexOf('if (body.action !== "propose")'));
  const tx = body.indexOf("await prisma.$transaction(async tx => {");
  const lock = body.indexOf("pg_advisory_xact_lock(hashtext(${`enrollment-proposal:${user.schoolId}:${id}:${fromId}`}))");
  const check = body.indexOf("tx.enrollmentProposal.findFirst");
  const create = body.indexOf("tx.enrollmentProposal.create");
  assert.ok(tx > 0 && tx < lock && lock < check && check < create, "transaction, lock, check, create");
  assert.doesNotMatch(body, /prisma\.enrollmentProposal\.(findFirst|create)/, "no unlocked check or create remains");
  assert.match(body, /throw new ApiError\("This pupil already has an open enrollment proposal\. Confirm or review it first\.", 409\);/);
});
