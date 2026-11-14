import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-1318: contract checks on redeeming a reset link. The redeem runs unscoped (no tenant
// context before sign-in), so every tenant-owned write must carry the user's own school id.
const action = readFileSync(new URL("../../src/app/actions/auth/reset.ts", import.meta.url), "utf8");
const redeem = action.slice(action.indexOf("export async function resetPassword"));

test("the history row is written with the reset user's school id", () => {
  assert.match(redeem, /tx\.passwordHistory\.create\(\{ data: \{ schoolId: user\.schoolId, userId: user\.id, oldPasswordHash: current\.password/);
});

test("history and the audit row take the school from the user, never from input", () => {
  assert.doesNotMatch(redeem, /schoolId: (?!user\.schoolId)/);
});

test("the current password and the last five are still refused before the claim", () => {
  const claim = redeem.indexOf("$transaction");
  const currentCheck = redeem.indexOf("verifyPassword(newPassword, current.password)");
  const historyCheck = redeem.indexOf("verifyPassword(newPassword, entry.oldPasswordHash)");
  assert.ok(currentCheck > 0 && currentCheck < claim);
  assert.ok(historyCheck > 0 && historyCheck < claim);
  assert.match(redeem, /passwordHistory\.findMany\(\{\s*where: \{ userId \},[\s\S]*take: 5/);
});
