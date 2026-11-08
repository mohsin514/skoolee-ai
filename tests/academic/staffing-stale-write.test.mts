import { mock, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// SKAI-1759: class-teacher and single-subject saves carry the teacher the editor saw; a stale page gets 409.
type Row = Record<string, unknown> & { id: string; schoolId: string };
const db = { classes: [] as Row[], subjects: [] as Row[], users: [] as Row[] };
const match = (row: Row, where: Record<string, unknown> = {}) => Object.entries(where).every(([k, v]) => v === undefined || (v && typeof v === "object" ? true : row[k] === v));
const table = (rows: () => Row[]) => ({
  findFirst: async ({ where }: { where: Record<string, unknown> }) => rows().find(r => match(r, where)) ?? null,
  findMany: async ({ where }: { where: Record<string, unknown> }) => rows().filter(r => match(r, where)),
  update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows().find(r => r.id === where.id)!, data),
  updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: rows().filter(r => match(r, where)).map(r => Object.assign(r, data)).length }),
});
const none = { findFirst: async () => null, findMany: async () => [], count: async () => 0, create: async ({ data }: { data: unknown }) => data, update: async () => ({}) };
const fake = new Proxy({ class: table(() => db.classes), subject: table(() => db.subjects), user: table(() => db.users) } as Record<string, unknown>, { get: (t, k: string) => t[k] ?? none });
mock.module(import.meta.resolve("../../src/lib/db/prisma.ts"), { namedExports: { prisma: fake } });
mock.module(import.meta.resolve("../../src/lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (tx: unknown) => unknown) => fn(fake) } });
mock.module(import.meta.resolve("../../src/lib/timetable/locking.ts"), { namedExports: { lockTimetableCampus: async () => undefined } });
mock.module(import.meta.resolve("../../src/lib/billing/entitlements.ts"), { namedExports: { assertSchoolOperational: async () => undefined } });
mock.module(import.meta.resolve("../../src/lib/api/timetable-sync.ts"), { namedExports: { syncTimetableSlotsForSubjects: async () => undefined } });
const { updateClassWithTeacherAssignment, updateSubjectWithTeacherAssignment } = await import("../../src/lib/api/teacher-assignments");

const as = (schoolId: string, role = "CAMPUS_ADMIN") => ({ userId: `${schoolId}-${role}`, schoolId, campusId: `${schoolId}-campus`, role, fullName: "Synthetic QA-01 user" }) as never;
beforeEach(() => {
  db.users = [];
  db.classes = []; db.subjects = [];
  for (const s of ["qa-01-a", "qa-01-b"]) {
    const campusId = `${s}-campus`;
    db.users.push({ id: `${s}-CAMPUS_ADMIN`, schoolId: s, campusId, role: "CAMPUS_ADMIN", isActive: true }, { id: `${s}-TEACHER`, schoolId: s, campusId, role: "TEACHER", isActive: true });
    for (const t of ["t-a", "t-b", "t-c"]) db.users.push({ id: `${s}-${t}`, schoolId: s, campusId, role: "TEACHER", isActive: true });
    db.classes.push({ id: `${s}-class`, schoolId: s, campusId, classTeacherId: `${s}-t-a`, teachingMode: "SUBJECT", academicYear: 2026, name: "Grade 1", section: "A", capacity: 30, archivedAt: null });
    db.subjects.push({ id: `${s}-math`, schoolId: s, campusId, classId: `${s}-class`, name: "Mathematics", code: null, teacherId: `${s}-t-a`, archivedAt: null, class: { archivedAt: null } });
  }
});
const classTeacher = (s: string) => db.classes.find(r => r.schoolId === s)!.classTeacherId;
const subjectTeacher = (s: string) => db.subjects.find(r => r.schoolId === s)!.teacherId;

test("a fresh class-teacher and subject-teacher save succeeds", async () => {
  await updateClassWithTeacherAssignment(as("qa-01-a"), { id: "qa-01-a-class", classTeacherId: "qa-01-a-t-b", expectedClassTeacherId: "qa-01-a-t-a" });
  await updateSubjectWithTeacherAssignment(as("qa-01-a"), { id: "qa-01-a-math", teacherId: "qa-01-a-t-b", expectedTeacherId: "qa-01-a-t-a" });
  assert.equal(classTeacher("qa-01-a"), "qa-01-a-t-b");
  assert.equal(subjectTeacher("qa-01-a"), "qa-01-a-t-b");
});

test("a stale save gets 409 and the newer allocation is kept", async () => {
  await updateClassWithTeacherAssignment(as("qa-01-a"), { id: "qa-01-a-class", classTeacherId: "qa-01-a-t-b", expectedClassTeacherId: "qa-01-a-t-a" });
  await assert.rejects(updateClassWithTeacherAssignment(as("qa-01-a"), { id: "qa-01-a-class", classTeacherId: "qa-01-a-t-c", expectedClassTeacherId: "qa-01-a-t-a" }), { status: 409 });
  assert.equal(classTeacher("qa-01-a"), "qa-01-a-t-b");
  await updateSubjectWithTeacherAssignment(as("qa-01-a"), { id: "qa-01-a-math", teacherId: "qa-01-a-t-b", expectedTeacherId: "qa-01-a-t-a" });
  await assert.rejects(updateSubjectWithTeacherAssignment(as("qa-01-a"), { id: "qa-01-a-math", teacherId: "qa-01-a-t-c", expectedTeacherId: "qa-01-a-t-a" }), { status: 409 });
  assert.equal(subjectTeacher("qa-01-a"), "qa-01-a-t-b");
});

test("two schools are isolated", async () => {
  await assert.rejects(updateClassWithTeacherAssignment(as("qa-01-b"), { id: "qa-01-a-class", classTeacherId: "qa-01-b-t-b", expectedClassTeacherId: "qa-01-a-t-a" }), { status: 404 });
  await assert.rejects(updateSubjectWithTeacherAssignment(as("qa-01-b"), { id: "qa-01-a-math", teacherId: "qa-01-b-t-b", expectedTeacherId: "qa-01-a-t-a" }), { status: 404 });
  await updateClassWithTeacherAssignment(as("qa-01-b"), { id: "qa-01-b-class", classTeacherId: "qa-01-b-t-c", expectedClassTeacherId: "qa-01-b-t-a" });
  assert.equal(classTeacher("qa-01-a"), "qa-01-a-t-a");
  assert.equal(subjectTeacher("qa-01-a"), "qa-01-a-t-a");
  assert.equal(classTeacher("qa-01-b"), "qa-01-b-t-c");
});

test("a denied role gets 403 and changes nothing", async () => {
  await assert.rejects(updateClassWithTeacherAssignment(as("qa-01-a", "TEACHER"), { id: "qa-01-a-class", classTeacherId: "qa-01-a-t-b", expectedClassTeacherId: "qa-01-a-t-a" }), { status: 403 });
  await assert.rejects(updateSubjectWithTeacherAssignment(as("qa-01-a", "TEACHER"), { id: "qa-01-a-math", teacherId: "qa-01-a-t-b", expectedTeacherId: "qa-01-a-t-a" }), { status: 403 });
  assert.equal(classTeacher("qa-01-a"), "qa-01-a-t-a");
  assert.equal(subjectTeacher("qa-01-a"), "qa-01-a-t-a");
});
