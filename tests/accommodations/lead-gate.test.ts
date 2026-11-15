import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2190: access-plan writes and supporting records use the page's gate (canLeadAcademics), not canManageOperations.
test("accommodations approver is the academic lead", () => {
  const source = readFileSync("src/lib/accommodations/service.ts", "utf8");
  assert.match(source, /const isApprover = \(user: AuthUser\) => canLeadAcademics\(user\)\.catch\(\(\) => false\);/);
  assert.doesNotMatch(source, /canManageOperations/);
});
