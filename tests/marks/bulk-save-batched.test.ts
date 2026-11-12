import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";

// SKAI-1834: saving marks runs a fixed number of statements however full the sheet is. Unchanged rows are not
// rewritten, new rows go in one insert, audit rows go in one insert, and every read stays on the caller's school.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, any>;
type User = { userId: string; role: "TEACHER" | "PRINCIPAL"; schoolId: string; campusId: string; email: string; fullName: string; accessVersion: number };
const calls: Array<{ op: string; args: Row }> = [];
let marks: Row[] = [];
const STUDENTS = Array.from({ length: 45 }, (_, i) => `st-${i}`);
const SUBJECTS = Array.from({ length: 10 }, (_, i) => `sub-${i}`);
const exams: Row[] = [
  { id: "exam-a", schoolId: "school-a", campusId: "campus-a1", classId: "class-a", academicYear: 2026, academicModelVersionId: null, status: "MARKS_ENTRY", isLocked: false, subjectId: null, title: "Term 1",
    class: { id: "class-a", name: "Grade 6", section: "A", classTeacherId: "u-class-teacher", students: STUDENTS.map((id) => ({ id })), subjects: SUBJECTS.map((id) => ({ id, totalMarks: 100, teacherId: id === "sub-0" ? "u-teacher" : "u-other" })) } },
];
const inList = (cond: unknown, value: unknown) => !cond || (typeof cond === "object" && "in" in (cond as Row) ? (cond as { in: unknown[] }).in.includes(value) : cond === value);
const tx = {
  mark: {
    findMany: async ({ where }: { where: Row }) => { calls.push({ op: "mark.findMany", args: where }); return marks.filter((m) => m.examId === where.examId && m.schoolId === where.schoolId && inList(where.studentId, m.studentId) && inList(where.subjectId, m.subjectId)).map((m) => ({ ...m })); },
    update: async ({ where, data }: { where: Row; data: Row }) => { calls.push({ op: "mark.update", args: { where, data } }); const row = marks.find((m) => m.id === where.id)!; Object.assign(row, data); return { ...row }; },
    createMany: async ({ data }: { data: Row[] }) => { calls.push({ op: "mark.createMany", args: { data } }); marks.push(...data.map((d) => ({ schoolId: "school-a", ...d }))); return { count: data.length }; },
  },
  auditLog: { createMany: async ({ data }: { data: Row[] }) => { calls.push({ op: "auditLog.createMany", args: { data } }); return { count: data.length }; } },
  exam: { update: async (args: Row) => { calls.push({ op: "exam.update", args }); return {}; } },
};
const prisma = {
  exam: { findFirst: async ({ where }: { where: Row }) => exams.find((e) => e.id === where.id && e.schoolId === where.schoolId) ?? null },
  examSchedule: { findMany: async () => [] },
  examAttendance: { findMany: async () => [] },
  $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
};
class ApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }
mock.module(src("lib/api/scope.ts"), { namedExports: { ApiError } });
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/db/audit-trail.ts"), { namedExports: { withoutAutoAudit: (fn: () => unknown) => fn() } });
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: () => undefined } });
mock.module(src("lib/academic/report-cards.ts"), { namedExports: {
  gradeForMark: (obtained: number, total: number) => (obtained / total >= 0.5 ? "P" : "F"),
  isLockedStatus: (status: string) => ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(status),
  thresholdsForClass: async () => [],
} });

const user = (role: User["role"], userId: string, schoolId = "school-a", campusId = "campus-a1"): User => ({ userId, role, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic", accessVersion: 0 });
const head = user("PRINCIPAL", "u-head");
const fullSheet = (enteredBy = "u-head") => {
  marks = STUDENTS.flatMap((s) => SUBJECTS.map((sub) => ({ id: `m-${s}-${sub}`, schoolId: "school-a", campusId: "campus-a1", examId: "exam-a", studentId: s, subjectId: sub, marksObtained: 60, isAbsent: false, isExempt: false, grade: "P", enteredBy })));
  calls.length = 0;
};
const ops = () => calls.map((c) => c.op);
const load = () => import("../../src/lib/marks/enter-bulk-command");

test("editing one cell on a full 45x10 sheet runs one read, one update and one audit insert", async () => {
  fullSheet();
  const { enterBulkMarks } = await load();
  const result = await enterBulkMarks(head, { examId: "exam-a", entries: [{ studentId: "st-3", subjectId: "sub-2", marksObtained: 70 }], expectedMarks: { "st-3:sub-2": "60" }, ipAddress: null });
  assert.deepEqual(ops(), ["mark.findMany", "mark.update", "auditLog.createMany"]);
  assert.equal(calls[0].args.schoolId, "school-a", "the read keeps the school scope");
  assert.deepEqual({ savedCount: result.savedCount, changed: result.changed }, { savedCount: 1, changed: 1 });
  const audit = calls[2].args.data as Row[];
  assert.equal(audit.length, 1);
  assert.equal(audit[0].recordId, "m-st-3-sub-2");
  assert.equal(audit[0].oldValue.marksObtained, 60);
  assert.equal(audit[0].newValue.marksObtained, 70);
});

test("re-sending the whole unchanged sheet writes nothing", async () => {
  fullSheet();
  const { enterBulkMarks } = await load();
  const entries = STUDENTS.flatMap((s) => SUBJECTS.map((sub) => ({ studentId: s, subjectId: sub, marksObtained: 60 })));
  const result = await enterBulkMarks(head, { examId: "exam-a", entries, ipAddress: null });
  assert.deepEqual(ops(), ["mark.findMany"]);
  assert.deepEqual({ savedCount: result.savedCount, changed: result.changed }, { savedCount: 450, changed: 0 });
});

test("an unchanged mark entered by someone else is still re-attributed and audited, as before", async () => {
  fullSheet("u-someone-else");
  const { enterBulkMarks } = await load();
  await enterBulkMarks(head, { examId: "exam-a", entries: [{ studentId: "st-0", subjectId: "sub-0", marksObtained: 60 }], ipAddress: null });
  assert.deepEqual(ops(), ["mark.findMany", "mark.update", "auditLog.createMany"]);
  assert.equal((calls[1].args.data as Row).enteredBy, "u-head");
});

test("a fresh 45x10 sheet is inserted in one statement and every new mark gets its own audit row", async () => {
  marks = []; calls.length = 0;
  const { enterBulkMarks } = await load();
  const entries = STUDENTS.flatMap((s) => SUBJECTS.map((sub, i) => (i === 1 ? { studentId: s, subjectId: sub, marksObtained: 0, isAbsent: true } : { studentId: s, subjectId: sub, marksObtained: 40 })));
  const result = await enterBulkMarks(head, { examId: "exam-a", entries, ipAddress: "203.0.113.1" });
  assert.deepEqual(ops(), ["mark.findMany", "mark.createMany", "auditLog.createMany"]);
  const created = calls[1].args.data as Row[];
  const audits = calls[2].args.data as Row[];
  assert.equal(created.length, 450);
  assert.ok(created.every((row) => row.campusId === "campus-a1" && row.examId === "exam-a" && row.enteredBy === "u-head"));
  assert.equal(created.find((row) => row.subjectId === "sub-1")?.grade, null, "an absent pupil has no grade");
  assert.deepEqual(audits.map((a) => a.recordId), created.map((row) => row.id), "each audit row names its new mark");
  assert.ok(audits.every((a) => a.oldValue === Prisma.JsonNull && a.ipAddress === "203.0.113.1" && a.tableName === "marks"));
  assert.equal(new Set(created.map((row) => row.id)).size, 450);
  assert.equal(result.changed, 450);
});

test("a stale baseline is refused before anything is written", async () => {
  fullSheet();
  const { enterBulkMarks } = await load();
  await assert.rejects(enterBulkMarks(head, { examId: "exam-a", entries: [{ studentId: "st-1", subjectId: "sub-1", marksObtained: 80 }], expectedMarks: { "st-1:sub-1": "55" }, ipAddress: null }), /RECORD_CHANGED/);
  assert.deepEqual(ops(), ["mark.findMany"]);
});

test("two schools and a denied role: another school's caller and an unassigned teacher write nothing", async () => {
  fullSheet();
  const { enterBulkMarks } = await load();
  const entry = { studentId: "st-1", subjectId: "sub-1", marksObtained: 80 };
  await assert.rejects(enterBulkMarks(user("PRINCIPAL", "u-b", "school-b", "campus-b1"), { examId: "exam-a", entries: [entry], ipAddress: null }), (e: ApiError) => e.status === 404);
  await assert.rejects(enterBulkMarks(user("PRINCIPAL", "u-a2", "school-a", "campus-a2"), { examId: "exam-a", entries: [entry], ipAddress: null }), (e: ApiError) => e.status === 403);
  await assert.rejects(enterBulkMarks(user("TEACHER", "u-teacher"), { examId: "exam-a", entries: [entry], ipAddress: null }), (e: ApiError) => e.status === 403);
  assert.deepEqual(ops(), []);
});
