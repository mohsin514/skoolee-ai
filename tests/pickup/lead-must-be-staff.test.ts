import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2132: a pickup lead is an active campus leader of the same school and campus; families never decide.
test("pickup restriction lead is validated and decide requires a campus leader", () => {
  const service = readFileSync("src/lib/pickup/service.ts", "utf8");
  const guard = service.slice(service.indexOf("async function assertPickupLead"), service.indexOf("export async function addRestriction"));
  assert.match(guard, /schoolId, isActive: true/);
  assert.match(guard, /canManageCampusOps\(lead as AuthUser\)/);
  assert.match(guard, /lead\.campusId !== campusId/);
  assert.match(service, /restriction\?\.leadUserId === user\.userId && isLead\(user\)/);
});
