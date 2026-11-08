import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertGroupCurrent, cleanGroupName, parseGroupInput } from "../../src/lib/students/group-policy";

const status = (fn: () => unknown) => {
  try { fn(); } catch (error) { return (error as { status?: number }).status; }
  return 200;
};

test("SKAI-169: create input is cleaned, defaulted and bounded", () => {
  assert.deepEqual(parseGroupInput({ name: "  Transport   users ", description: " " }, false), { name: "Transport users", description: null });
  assert.equal(status(() => parseGroupInput({}, false)), 400);
  assert.equal(status(() => parseGroupInput({ name: "   " }, false)), 400);
  assert.equal(status(() => parseGroupInput({ name: "x".repeat(61) }, false)), 400);
  assert.equal(status(() => parseGroupInput({ name: "ok", description: "d".repeat(241) }, false)), 400);
  assert.equal(status(() => parseGroupInput({ name: { $ne: "" } }, false)), 400);
  assert.equal(status(() => parseGroupInput({ name: "ok", description: 5 }, false)), 400);
  assert.equal(cleanGroupName(" Hostel\tresidents "), "Hostel residents");
});

test("SKAI-169: an edit returns only the fields sent", () => {
  assert.deepEqual(parseGroupInput({ description: "Morning van" }, true), { description: "Morning van" });
  assert.deepEqual(parseGroupInput({ name: "Choir" }, true), { name: "Choir" });
  assert.deepEqual(parseGroupInput({ description: "" }, true), { description: null });
  assert.equal(status(() => parseGroupInput({ name: "" }, true)), 400);
});

test("SKAI-169: a stale edit is refused with 409; a current or unversioned edit passes", () => {
  const current = { name: "Transport users", description: null };
  assert.equal(status(() => assertGroupCurrent(undefined, current)), 200);
  assert.equal(status(() => assertGroupCurrent({ name: "Transport users", description: null }, current)), 200);
  assert.equal(status(() => assertGroupCurrent({ name: "Transport users", description: "" }, current)), 200);
  assert.equal(status(() => assertGroupCurrent({ name: "Old name" }, current)), 409);
  assert.equal(status(() => assertGroupCurrent({ description: "Was set" }, current)), 409);
});

test("SKAI-169: the group route keeps families out, checks permissions, writes the tenant and audits", () => {
  const route = readFileSync("src/app/api/student-groups/route.ts", "utf8");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(get, /assertStaffRole\(user\)/);
  assert.match(route, /assertPermission\(user, "students", "add"\)/);
  assert.match(route, /assertPermission\(user, "students", "edit"\)/);
  assert.match(route, /schoolId: user\.schoolId, campusId, \.\.\.input/);
  assert.match(route, /mode: "insensitive"/);
  assert.match(route, /assertGroupCurrent\(body\.expected, existing\)/);
  assert.equal((route.match(/writeAuditEvent\(tx, user, \{ table: "student_groups"/g) || []).length, 2);
  // Every lookup by id stays inside the caller's campus scope (another school/campus → 404).
  assert.match(route, /id: String\(body\.id\), \.\.\.scopedCampusWhere\(user/);
});
