/**
 * SKAI-2033 — the fee-setup GETs (structure, carry-forwards, groups, master-lines, assignments) gate on
 * assertFeesRead like /api/fees/invoices: families are refused outright and staff need fees.view, so a
 * PRINCIPAL (fees.view denied by default) gets 403. Reads stay inside the caller's school and campus.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { assertPermission, moduleFlags } from "../../src/lib/permissions";
import { assertStaffRole, scopedCampusWhere } from "../../src/lib/api/scope";
import type { AuthUser } from "../../src/lib/auth";

const root = join(__dirname, "..", "..");
const code = (path: string) => readFileSync(join(root, path), "utf8")
  .split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
const handler = (src: string, verb: string) => {
  const start = src.indexOf(`export async function ${verb}(`);
  assert.ok(start >= 0, `${verb} handler exists`);
  const next = src.indexOf("export async function", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};

const user = (role: AuthUser["role"], schoolId = "school-a", campusId = "campus-a1"): AuthUser =>
  ({ userId: `${role}-1`, email: `${role.toLowerCase()}@qa.test`, role, schoolId, campusId });
const db = (rows: Record<string, any[]> = {}) => ({
  rolePermission: { findMany: async ({ where }: any) => rows[`${where.schoolId}:${where.role}`] ?? [] },
}) as any;

const ROUTES = ["structure", "carry-forwards", "groups", "master-lines", "assignments"];

for (const name of ROUTES) {
  test(`GET /api/fees/${name} calls assertFeesRead before any database read`, () => {
    const get = handler(code(`src/app/api/fees/${name}/route.ts`), "GET");
    const gate = get.indexOf("await assertFeesRead(user)");
    assert.ok(gate > 0, "assertFeesRead gate present");
    assert.ok(gate < get.indexOf("prisma."), "gate runs before the first query");
    assert.ok(get.indexOf("requireAuthUser()") < gate, "gate follows authentication");
  });
}

test("GET /api/fees/carry-forwards is scoped to the caller's campus, not the whole school", () => {
  const get = handler(code("src/app/api/fees/carry-forwards/route.ts"), "GET");
  assert.match(get, /scopedCampusWhere\(user, campusId\)/);
  assert.match(get, /user\.role === "SUPER_ADMIN" \? searchParams\.get\("campusId"\) : user\.campusId/);
});

test("fees.view default: finance seats read fee setup, PRINCIPAL and non-finance staff do not", () => {
  for (const role of ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "ACCOUNTANT"]) assert.equal(moduleFlags(null, role, "fees").canView, true, role);
  for (const role of ["PRINCIPAL", "TEACHER", "LIBRARIAN"]) assert.equal(moduleFlags(null, role, "fees").canView, false, role);
});

test("families are refused before the matrix is consulted", () => {
  for (const role of ["STUDENT", "PARENT"] as const) assert.throws(() => assertStaffRole(user(role)), /not available to student or guardian/);
  assert.doesNotThrow(() => assertStaffRole(user("ACCOUNTANT")));
});

test("a fees.view grant at school B does not open fee setup to the PRINCIPAL of school A", async () => {
  const granted = { module: "fees", canView: true, canAdd: false, canEdit: false, canDelete: false, updatedAt: new Date() };
  const rows = { "school-b:PRINCIPAL": [granted] };
  assert.equal(await assertPermission(user("PRINCIPAL", "school-b", "campus-b1"), "fees", "view", db(rows)), true);
  await assert.rejects(assertPermission(user("PRINCIPAL", "school-a"), "fees", "view", db(rows)), /fees\.view/);
});

test("campus scope: two campuses of one school and a second school never overlap", () => {
  assert.deepEqual(scopedCampusWhere(user("ACCOUNTANT", "school-a", "campus-a1"), "campus-a1"), { campus: { schoolId: "school-a", id: "campus-a1" } });
  assert.deepEqual(scopedCampusWhere(user("ACCOUNTANT", "school-a", "campus-a2"), "campus-a2"), { campus: { schoolId: "school-a", id: "campus-a2" } });
  assert.deepEqual(scopedCampusWhere(user("ACCOUNTANT", "school-b", "campus-b1"), "campus-b1"), { campus: { schoolId: "school-b", id: "campus-b1" } });
});
