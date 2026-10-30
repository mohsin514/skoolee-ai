import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allocationWarnings, assertTeacherCurrent, parseAllocations, specialtyMatches, weeklyPeriodCapacity } from "../../src/lib/academic/teacher-allocation";
import { teacherAllocationUiEntries } from "../../src/lib/locale/teacher-allocation-ui-messages";
import { translateUi } from "../../src/lib/locale/ui-messages";

// SKAI-150: teacher allocation — specialty match, weekly load limit, bulk allocate, stale edits.
test("specialty matches ignore case and width, and never nag generalists or unknown specialties", () => {
  assert.equal(specialtyMatches({ subjectSpecialties: ["Mathematics"], teachesAllSubjects: false }, " mathematics "), true);
  assert.equal(specialtyMatches({ subjectSpecialties: ["Physics"], teachesAllSubjects: false }, "Urdu"), false);
  assert.equal(specialtyMatches({ subjectSpecialties: ["Physics"], teachesAllSubjects: true }, "Urdu"), true);
  assert.equal(specialtyMatches({ subjectSpecialties: [], teachesAllSubjects: false }, "Urdu"), true);
  assert.equal(specialtyMatches(undefined, "Urdu"), true);
});

test("weekly capacity is periods per day times working days, unknown until periods exist", () => {
  assert.equal(weeklyPeriodCapacity(8, 2), 40);
  assert.equal(weeklyPeriodCapacity(7, 1), 42);
  assert.equal(weeklyPeriodCapacity(0, 2), null);
});

test("bulk allocations are bounded, unique per subject and typed", () => {
  assert.deepEqual(parseAllocations([{ subjectId: "s1", teacherId: "t1" }, { subjectId: "s2", teacherId: null, expectedTeacherId: "t2" }]), [{ subjectId: "s1", teacherId: "t1" }, { subjectId: "s2", teacherId: null, expectedTeacherId: "t2" }]);
  for (const bad of [undefined, [], "s1", [{ teacherId: "t1" }], [{ subjectId: "s1", teacherId: 5 }], [{ subjectId: "s1", teacherId: "t1" }, { subjectId: "s1", teacherId: "t2" }]]) assert.throws(() => parseAllocations(bad), { status: 400 });
  assert.throws(() => parseAllocations(Array.from({ length: 201 }, (_, i) => ({ subjectId: `s${i}`, teacherId: "t" }))), { status: 400 });
});

test("a stale page cannot overwrite a newer allocation", () => {
  assertTeacherCurrent(undefined, "t9");
  assertTeacherCurrent("t1", "t1");
  assertTeacherCurrent(null, null);
  assert.throws(() => assertTeacherCurrent("t1", "t2"), { status: 409 });
  assert.throws(() => assertTeacherCurrent(null, "t2"), { status: 409 });
});

test("warnings flag off-specialty and over-limit teachers, counting every new section in the batch", () => {
  const teachers = new Map([
    ["t1", { fullName: "Ayesha", subjectSpecialties: ["Physics"], teachesAllSubjects: false, weeklyPeriods: 36 }],
    ["t2", { fullName: "Bilal", subjectSpecialties: [], teachesAllSubjects: true, weeklyPeriods: 0 }],
  ]);
  const plan = [
    { subjectId: "a", subjectName: "Urdu", teacherId: "t1", currentTeacherId: null, scheduledPeriods: 3 },
    { subjectId: "b", subjectName: "Urdu", teacherId: "t1", currentTeacherId: null, scheduledPeriods: 3 },
    { subjectId: "c", subjectName: "Urdu", teacherId: "t2", currentTeacherId: null, scheduledPeriods: 5 },
    { subjectId: "d", subjectName: "Urdu", teacherId: "t1", currentTeacherId: "t1", scheduledPeriods: 9 },
  ];
  const warnings = allocationWarnings(plan, teachers, 40);
  assert.deepEqual(warnings.filter(w => w.code === "OFF_SPECIALTY").map(w => w.subjectId), ["a", "b"]);
  // 36 booked + 3 + 3 new = 42 > 40; an unchanged row adds nothing.
  assert.deepEqual(warnings.filter(w => w.code === "AT_LOAD_LIMIT").map(w => w.subjectId), ["a", "b"]);
  assert.equal(allocationWarnings(plan, teachers, null).some(w => w.code === "AT_LOAD_LIMIT"), false);
});

test("the bulk route gates academics, scopes the campus and commits all rows in one fenced transaction", () => {
  const route = readFileSync("src/app/api/subjects/allocations/route.ts", "utf8");
  assert.match(route, /if \(!canManageAcademics\(user\)\) throw new ApiError\("Insufficient permissions", 403\)/);
  assert.match(route, /resolveCampusId\(user/);
  const service = readFileSync("src/lib/api/teacher-assignments.ts", "utf8");
  const plan = service.slice(service.indexOf("export async function planTeacherAllocations"));
  assert.match(plan, /schoolAiTransaction\(user, async tx => \{\s*await lockTimetableCampus\(tx, user\.schoolId, campusId\);\s*const grants = await authorizeAssignment\(tx, user, "exams"\)/);
  assert.match(plan, /schoolId: user\.schoolId, campusId \}/);
  assert.match(plan, /if \(!options\.preview\) \{/);
  assert.match(plan, /updateSubjectWithTeacherAssignmentTx\(tx, user, .*campusId, grants\)/);
  assert.match(service, /assertTeacherCurrent\(body\.expectedTeacherId/);
});

test("allocation copy reads in Arabic and Urdu", () => {
  for (const [en, ar, ur] of teacherAllocationUiEntries) {
    assert.match(ar, /[؀-ۿ]/, en);
    assert.match(ur, /[؀-ۿ]/, en);
  }
  assert.notEqual(translateUi("Weekly periods are full", "ar"), "Weekly periods are full");
  assert.notEqual(translateUi("Allocate to all {0} sections", "ur"), "Allocate to all {0} sections");
});

test("only academic leads may allocate; teachers, accountants and families are denied", async () => {
  const { canManageAcademics } = await import("../../src/lib/api/scope");
  const as = (role: string) => canManageAcademics({ role, schoolId: "a", campusId: "a1", userId: "u" } as never);
  for (const role of ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"]) assert.equal(as(role), true, role);
  for (const role of ["TEACHER", "ACCOUNTANT", "RECEPTIONIST", "STUDENT", "PARENT"]) assert.equal(as(role), false, role);
});

test("another school's or campus's subjects and teachers are never read or written", () => {
  const plan = readFileSync("src/lib/api/teacher-assignments.ts", "utf8").split("export async function planTeacherAllocations")[1];
  assert.match(plan, /tx\.subject\.findMany\(\{ where: \{ id: \{ in: rows\.map\(r => r\.subjectId\) \}, schoolId: user\.schoolId, campusId \}/);
  assert.match(plan, /if \(subjects\.length !== rows\.length\) throw new ApiError\("A subject is outside this school or campus", 404\)/);
  assert.match(plan, /tx\.user\.findMany\(\{ where: \{ id: \{ in: teacherIds \}, schoolId: user\.schoolId, campusId, role: "TEACHER", isActive: true \}/);
  assert.match(plan, /if \(teachers\.length !== teacherIds\.length\) throw new ApiError/);
});
