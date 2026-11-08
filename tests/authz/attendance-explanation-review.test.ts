import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_PERMISSIONS } from "../../src/lib/permissions";

/**
 * SKAI-1037 — an assigned teacher decides guardian absence explanations for their own class.
 * Source assertions over `reviewExplanation` (no database): the permission gate a teacher can pass, the
 * class-assignment check that keeps other classes, campuses and schools out, and the atomic correction.
 */
const root = join(__dirname, "..", "..");
const code = readFileSync(join(root, "src/lib/attendance/register.ts"), "utf8")
  .split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
const review = code.slice(code.indexOf("export async function reviewExplanation"), code.indexOf("export async function exceptionQueue"));

test("teachers hold attendance add but not edit, so the review gate asks teachers for add", () => {
  const teacher = (DEFAULT_PERMISSIONS as any).TEACHER.attendance;
  assert.equal(teacher.canAdd, true);
  assert.equal(teacher.canEdit, false);
  assert.match(review, /assertPermission\(user, "attendance", user\.role === "TEACHER" \? "add" : "edit"\)/);
});

test("a teacher may decide only explanations for a class they are assigned to, in their school and campus", () => {
  assert.match(review, /school_id = \$\{user\.schoolId\} FOR UPDATE/, "school scoped and row locked");
  assert.match(review, /explanation\.campusId !== user\.campusId\)\) throw new ApiError\("Explanation not found", 404\)/, "other campuses are not found");
  assert.match(review, /if \(user\.role === "TEACHER"\) await assignedClass\(db, user, explanation\.attendance\.classId \?\? ""\)/, "other classes are refused");
  assert.match(code, /async function assignedClass[\s\S]*?schoolId: user\.schoolId[\s\S]*?campusId: user\.campusId[\s\S]*?classTeacherId: user\.userId/);
});

test("accepting corrects the mark and writes history in the same transaction", () => {
  assert.match(review, /schoolAiTransaction\(user, async db =>/);
  assert.match(review, /db\.attendance\.update\(/);
  assert.match(review, /db\.attendanceEditHistory\.create\(/);
  assert.match(review, /status: "ACCEPTED"/);
  for (const action of ["reject", "clarify"]) assert.match(review, new RegExp(`action === "${action}"`));
});
