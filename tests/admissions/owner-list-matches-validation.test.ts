import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-2114: the Owner dropdown (GET /api/admissions?owners=1) must offer only people validOwner() accepts.
const route = readFileSync("src/app/api/admissions/route.ts", "utf8");
const service = readFileSync("src/lib/admissions/service.ts", "utf8");

test("owner list and owner validation share one filter", () => {
  assert.match(route, /prisma\.user\.findMany\(\{ where: applicationOwnerWhere\(user\.schoolId, campusId\)/);
  assert.match(service, /where: \{ id: ownerId, \.\.\.applicationOwnerWhere\(user\.schoolId, campusId\) \}/);
});

test("owner roles exclude principal and group owner", () => {
  const roles = service.match(/APPLICATION_OWNER_ROLES = \[([^\]]*)\]/)?.[1] ?? "";
  assert.ok(roles.includes("CAMPUS_ADMIN") && roles.includes("RECEPTIONIST"));
  assert.ok(!roles.includes("PRINCIPAL") && !roles.includes("SUPER_ADMIN"));
  assert.doesNotMatch(route, /SUPER_ADMIN/);
});
