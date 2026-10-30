import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertCategoryCurrent, cleanCategoryName, parseCategoryInput, sameCategoryName } from "../../src/lib/students/category-policy";

const status = (fn: () => unknown) => {
  try { fn(); } catch (error) { return (error as { status?: number }).status; }
  return 200;
};

test("SKAI-168: create input is cleaned, defaulted and bounded", () => {
  assert.deepEqual(parseCategoryInput({ name: "  Staff   child ", description: " " }, false), { name: "Staff child", description: null, isActive: true });
  assert.equal(status(() => parseCategoryInput({ name: "   " }, false)), 400);
  assert.equal(status(() => parseCategoryInput({ name: "x".repeat(61) }, false)), 400);
  assert.equal(status(() => parseCategoryInput({ name: "ok", description: "d".repeat(241) }, false)), 400);
  assert.equal(status(() => parseCategoryInput({ name: "ok", isActive: "false" }, false)), 400);
});

test("SKAI-168: an edit returns only the fields sent", () => {
  assert.deepEqual(parseCategoryInput({ isActive: false }, true), { isActive: false });
  assert.deepEqual(parseCategoryInput({ name: "Orphan" }, true), { name: "Orphan" });
  assert.equal(status(() => parseCategoryInput({ name: "" }, true)), 400);
});

test("SKAI-168: a stale edit is refused with 409; a current or unversioned edit passes", () => {
  const current = { name: "Scholarship", description: null, isActive: true };
  assert.equal(status(() => assertCategoryCurrent(undefined, current)), 200);
  assert.equal(status(() => assertCategoryCurrent({ name: "Scholarship", description: null, isActive: true }, current)), 200);
  assert.equal(status(() => assertCategoryCurrent({ name: "Scholarship", description: "", isActive: true }, current)), 200);
  assert.equal(status(() => assertCategoryCurrent({ name: "Old name" }, current)), 409);
  assert.equal(status(() => assertCategoryCurrent({ isActive: false }, current)), 409);
});

test("SKAI-168: names compare without case", () => {
  assert.ok(sameCategoryName("Scholarship", "scholarship"));
  assert.ok(!sameCategoryName("Scholarship", "Staff child"));
  assert.equal(cleanCategoryName(null), "");
});

test("SKAI-168: the route keeps families out, gates writes, audits, and checks duplicates per campus", () => {
  const route = readFileSync("src/app/api/student-categories/route.ts", "utf8");
  assert.match(route, /assertStaffRole\(user\)/);
  assert.match(route, /assertPermission\(user, "students", "add"\)/);
  assert.match(route, /assertPermission\(user, "students", "edit"\)/);
  assert.match(route, /canManageCampusOps\(user\)/);
  assert.match(route, /mode: "insensitive"/);
  assert.match(route, /assertCategoryCurrent\(body\.expected/);
  assert.equal((route.match(/writeAuditEvent\(tx/g) ?? []).length, 2);
});

test("SKAI-168: inactive categories cannot be newly applied on admission or edit", () => {
  assert.match(readFileSync("src/lib/students/create.ts", "utf8"), /if \(!category\.isActive\)/);
  assert.match(readFileSync("src/app/api/students/route.ts", "utf8"), /!category\.isActive && categoryId !== existing\.categoryId/);
});
