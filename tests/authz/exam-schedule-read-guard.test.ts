/**
 * SKAI-2084 — GET /api/academic/exam-schedule and /exam-sessions/seating must require exams.view for staff,
 * so accountant, librarian and receptionist cannot read the unpublished date sheet or room occupancy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { assertPermission } from "../../src/lib/permissions";
import type { AuthUser } from "../../src/lib/auth";

const root = join(__dirname, "..", "..");
const code = (path: string) => readFileSync(join(root, path), "utf8")
  .split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
const get = (src: string) => {
  const start = src.indexOf("export async function GET(");
  assert.ok(start >= 0);
  const next = src.indexOf("export async function", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};
const user = (role: AuthUser["role"]): AuthUser =>
  ({ userId: `${role}-1`, email: `${role.toLowerCase()}@qa.test`, role, schoolId: "school-a", campusId: "campus-a" });
const db = () => ({ rolePermission: { findMany: async () => [] } }) as any;

test("exam-schedule GET checks exams.view for non-family roles before reading", () => {
  const h = get(code("src/app/api/academic/exam-schedule/route.ts"));
  const guard = h.indexOf('assertPermission(user, "exams", "view")');
  assert.ok(guard > 0, "guard present");
  assert.ok(guard < h.indexOf("prisma.examSchedule.findMany"), "guard runs before the query");
  assert.match(h.slice(guard - 40, guard), /!isFamilyRole\(user\)/);
});

test("exam-sessions/seating GET checks exams.view", () => {
  const h = get(code("src/app/api/academic/exam-sessions/seating/route.ts"));
  assert.ok(h.indexOf('assertPermission(user, "exams", "view")') > h.indexOf("assertStaffRole(user)"));
  assert.ok(h.indexOf('assertPermission(user, "exams", "view")') < h.indexOf("campusSeatingCapacity"));
});

test("default matrix denies exams.view to the three roles and allows the principal", async () => {
  for (const role of ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const) {
    await assert.rejects(assertPermission(user(role), "exams", "view", db()), /exams\.view denied/, role);
  }
  assert.equal(await assertPermission(user("PRINCIPAL"), "exams", "view", db()), true);
});
