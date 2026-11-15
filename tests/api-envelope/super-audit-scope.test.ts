import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { schoolAuditScope } from "../../src/lib/audit-scope";

// SKAI-2144: a school's audit view must not include platform-owner actions on other schools,
// even when the APP_OWNER user record lives in that school's tenant.
test("actor clause excludes the platform owner", () => {
  const [actor] = schoolAuditScope("school-a") as any[];
  assert.equal(actor.user.schoolId, "school-a");
  assert.deepEqual(actor.user.role, { not: "APP_OWNER" });
});

test("rows about the school itself stay visible", () => {
  const scope = schoolAuditScope("school-a") as any[];
  assert.ok(scope.some((c) => c.newValues?.equals === "school-a"));
  assert.ok(scope.some((c) => c.targetType === "school" && c.targetId === "school-a"));
});

test("route uses the shared scope, not a bare actor-school match", () => {
  const source = readFileSync("src/app/api/super/audit-logs/route.ts", "utf8");
  assert.match(source, /schoolAuditScope\(user\.schoolId\)/);
  assert.doesNotMatch(source, /user: \{ schoolId: user\.schoolId \}/);
});
