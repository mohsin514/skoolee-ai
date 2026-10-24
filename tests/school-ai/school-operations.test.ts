import { riskDecisionProposalSchema } from "../../src/lib/school-ai/school-operations-risk";
import { publicationCopy } from "../../src/components/school-ai/school-operations-publish-copy";
import { riskCopy } from "../../src/components/school-ai/school-operations-risk-copy";
import { lifecycleCopy } from "../../src/components/school-ai/school-operations-lifecycle-copy";
import assert from "node:assert/strict";
import { test } from "node:test";
import { solveSchoolTimetable, type SchoolSolverClass } from "../../src/lib/school-ai/timetable-school-solver";
import { attendanceProposalSchema, operationDate, schoolTimetableSolveSchema, substituteProposalSchema } from "../../src/lib/school-ai/school-operations";
import { schoolOperationsCopy } from "../../src/components/school-ai/school-operations-copy";

const windows = [{ dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40" }, { dayOfWeek: 1, periodNumber: 2, startTime: "08:40", endTime: "09:20" }];
const cls = (id: string, teacher = "teacher"): SchoolSolverClass => ({ classId: id, academicYear: 2026, requirements: [{ subjectId: `subject-${id}`, teacherId: teacher, periodsPerWeek: 1, maxPerDay: 1 }], windows, roomIds: ["room"], bookings: [] });
test("whole-school solver jointly reserves shared staff and rooms instead of making colliding independent schedules", () => { const result = solveSchoolTimetable([cls("a"), cls("b")], "ANNUAL"); assert.equal(result.status, "SOLVED"); assert.equal(result.timetables.length, 2); assert.notEqual(result.timetables[0].slots[0].periodNumber, result.timetables[1].slots[0].periodNumber); });
test("school solver can place constrained class first and backtrack across classes", () => { const a = cls("a"), b = cls("b"); b.windows = [windows[0]]; const result = solveSchoolTimetable([a, b], "TERM_1"); assert.equal(result.status, "SOLVED"); assert.equal(result.timetables[0].slots[0].periodNumber, 2); assert.equal(result.timetables[1].slots[0].periodNumber, 1); });
test("search limits are distinct from impossibility and never return partial drafts", () => { const a = cls("a"), b = cls("b"); a.windows = b.windows = [windows[0]]; assert.equal(solveSchoolTimetable([a, b], "ANNUAL").status, "NO_SOLUTION"); const limited = solveSchoolTimetable([cls("a"), cls("b")], "ANNUAL", 0); assert.equal(limited.status, "SEARCH_LIMIT"); assert.deepEqual(limited.timetables, []); });
test("actual overlapping clock windows block staff even with distinct period numbers", () => { const a = cls("a"), b = cls("b"); a.windows = [windows[0]]; b.windows = [{ ...windows[0], periodNumber: 9, startTime: "08:20", endTime: "09:00" }]; assert.equal(solveSchoolTimetable([a, b], "ANNUAL").status, "NO_SOLUTION"); });
test("review schemas reject duplicate pupils, guessed observations, invalid dates and duplicate duties", () => { const entry = { studentId: "pupil", status: "PRESENT", note: "" }; assert(!attendanceProposalSchema.safeParse({ operation: "attendance.record_register", classId: "class", date: "2026-10-13", entries: [entry], observationConfirmed: false }).success); assert(!attendanceProposalSchema.safeParse({ operation: "attendance.record_register", classId: "class", date: "2026-10-13", entries: [entry, entry], observationConfirmed: true }).success); assert(!operationDate.safeParse("2026-02-30").success); assert(!substituteProposalSchema.safeParse({ operation: "timetable.assign_substitutes", date: "2026-10-13", duties: [{ slotId: "lesson", teacherId: "teacher", reason: "Approved leave" }, { slotId: "lesson", teacherId: null, reason: "Changed" }] }).success); });
test("school solver retains per-class limits and exposes complete translated controls", () => { assert(!schoolTimetableSolveSchema.safeParse({ campusId: "campus", classes: [{ classId: "class", term: "ANNUAL", days: [1, 1], roomIds: ["room"], requirements: [{ subjectId: "subject", periodsPerWeek: 2, maxPerDay: 1 }] }] }).success); const keys = Object.keys(schoolOperationsCopy("en")); for (const lang of ["ar", "ur"] as const) { assert.deepEqual(Object.keys(schoolOperationsCopy(lang)), keys); assert(Object.values(schoolOperationsCopy(lang)).every(value => value.trim())); } });


test("risk decisions require reviewed evidence, bounded rationale and all locale keys", () => {
  const valid = { operation: "operations.record_risk_decision", indicator: "ATTENDANCE_GAPS", scopeId: "class", date: "2026-10-05", evidenceHash: "a".repeat(64), ownerId: "owner", dueDate: "2026-10-06", decision: "ACTION", note: "Review the observed class register." };
  assert(riskDecisionProposalSchema.safeParse(valid).success);
  for (const patch of [{ evidenceHash: "invented" }, { ownerId: "" }, { note: "ok" }, { decision: "AUTO_PUNISH" }, { date: "2026-02-30" }]) assert(!riskDecisionProposalSchema.safeParse({ ...valid, ...patch }).success);
  for (const copy of [riskCopy, lifecycleCopy, publicationCopy]) { assert.deepEqual(Object.keys(copy("en")).sort(), Object.keys(copy("ar")).sort()); assert.deepEqual(Object.keys(copy("en")).sort(), Object.keys(copy("ur")).sort()); }
});
