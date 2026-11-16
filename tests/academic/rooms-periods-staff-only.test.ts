import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-2063: rooms and bell periods are campus structure (staff data), like /api/classes and /api/subjects.
for (const route of ["rooms", "periods"]) {
  test(`GET /api/academic/${route} denies student and guardian accounts before any read`, () => {
    const src = readFileSync(`src/app/api/academic/${route}/route.ts`, "utf8");
    const get = src.slice(src.indexOf("export async function GET"));
    assert.ok(get.indexOf("assertStaffRole(user)") > 0 && get.indexOf("assertStaffRole(user)") < get.indexOf("resolveCampusId("));
  });
}
