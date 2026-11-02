import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1567: clearing the primary department leaves no active membership marked primary.
const src = readFileSync("src/lib/staff/hierarchy.ts", "utf8");

test("the clear-to-null branch unmarks active primary memberships without ending them", () => {
  const i = src.indexOf('} else if (has("primaryDepartmentId")) {');
  assert.ok(i > 0, "clear branch present");
  const branch = src.slice(i, i + 400);
  assert.match(branch, /departmentMember\.updateMany\(\{ where: \{ userId, isPrimary: true, endedAt: null \}, data: \{ isPrimary: false \} \}\)/);
  assert.doesNotMatch(branch, /endedAt: new Date|delete/);
});
