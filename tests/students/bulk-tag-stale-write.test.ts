import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bulkTagExpectedValues, expectedValueConditions } from "../../src/lib/students/profile-update";

// SKAI-1760: bulk tagging binds the tag each roster row showed; the route's atomic predicate turns a stale row into 409.
type Pupil = { id: string; schoolId: string; categoryId: string | null; groupId: string | null };
const asDate = (v: string | null) => (v ? new Date(v) : null);
let pupils: Pupil[] = [];
const reset = () => { pupils = [{ id: "p-a", schoolId: "school-a", categoryId: null, groupId: null }, { id: "p-b", schoolId: "school-b", categoryId: null, groupId: null }]; };
const rowOf = (p: Pupil) => ({ category: p.categoryId ? { id: p.categoryId } : null, group: p.groupId ? { id: p.groupId } : null });
// Mirrors prisma.student.update({ where: { id, schoolId, AND: conditions } }): no match is P2025, which the route maps to 409.
function patch(schoolId: string, body: { id: string; expectedValues?: Record<string, string | null> } & Partial<Pupil>, role = "CAMPUS_ADMIN") {
  if (role === "TEACHER") return 403;
  const { id, expectedValues, ...data } = body;
  const conditions = expectedValueConditions(data, expectedValues, asDate) as Array<Record<string, unknown>>;
  const row = pupils.find(p => p.id === id && p.schoolId === schoolId && conditions.every(c => Object.entries(c).every(([k, v]) => (p as Record<string, unknown>)[k] === v)));
  if (!row) return 409;
  Object.assign(row, data);
  return 200;
}

test("a fresh bulk tag on the row as read succeeds", () => {
  reset();
  const seen = rowOf(pupils[0]);
  assert.deepEqual(bulkTagExpectedValues(seen, { groupId: "g1" }), { expectedValues: { groupId: null } });
  assert.equal(patch("school-a", { id: "p-a", groupId: "g1", ...bulkTagExpectedValues(seen, { groupId: "g1" }) }), 200);
  assert.equal(pupils[0].groupId, "g1");
});

test("a stale session's tag gets 409 and the first accepted tag is kept", () => {
  reset();
  const sessionA = rowOf(pupils[0]), sessionB = rowOf(pupils[0]);
  assert.equal(patch("school-a", { id: "p-a", categoryId: "cat-a", ...bulkTagExpectedValues(sessionA, { categoryId: "cat-a" }) }), 200);
  assert.equal(patch("school-a", { id: "p-a", categoryId: "cat-b", ...bulkTagExpectedValues(sessionB, { categoryId: "cat-b" }) }), 409);
  assert.equal(pupils[0].categoryId, "cat-a");
  // Only the tagged field is bound: a group tag does not conflict with an unrelated category change.
  assert.deepEqual(bulkTagExpectedValues(sessionB, { groupId: "g1" }), { expectedValues: { groupId: null } });
});

test("another school's pupil is never reached", () => {
  reset();
  assert.equal(patch("school-b", { id: "p-a", groupId: "g1", ...bulkTagExpectedValues(rowOf(pupils[0]), { groupId: "g1" }) }), 409);
  assert.equal(pupils[0].groupId, null);
});

test("the route refuses non-operators with 403 and maps a failed predicate to 409", () => {
  reset();
  assert.equal(patch("school-a", { id: "p-a", groupId: "g1" }, "TEACHER"), 403);
  const src = readFileSync("src/app/api/students/route.ts", "utf8");
  const handler = src.slice(src.indexOf("export async function PATCH"));
  assert.match(handler, /if \(!canManageCampusOps\(user\)\) throw new ApiError\("Insufficient permissions", 403\)/);
  assert.match(handler, /const conditions = expectedValueConditions\(data, expected, asDate\);/);
  assert.match(handler, /error\?\.code === "P2025"\) return Response\.json\(\{ error: "This pupil record changed\. Review your draft against the current record\." \}, \{ status: 409 \}\)/);
  assert.match(readFileSync("src/components/shared-admin/students-panel.tsx", "utf8"), /\.\.\.bulkTagExpectedValues\(students\.find\(\(s\) => s\.id === id\), patch\)/);
});
