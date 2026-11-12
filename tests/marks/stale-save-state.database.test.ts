// SKAI-1438: the stale-save guard compares each cell's full state (score, ABSENT, EXEMPT) with the baseline the
// teacher saw. An unchanged absent or exempt sheet saves normally, and a concurrent change of state is refused
// with RECORD_CHANGED. Runs against a disposable loopback database with synthetic data only.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { enterBulkMarks } from "../../src/lib/marks/enter-bulk-command";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const raw = new PrismaClient();

const schoolA = `marks-a-${randomUUID()}`, schoolB = `marks-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const classA1 = randomUUID(), subjectA1 = randomUUID(), subjectA1b = randomUUID();
const student1 = randomUUID(), student2 = randomUUID(), student3 = randomUUID();
const examA1 = randomUUID(), examB1 = randomUUID();
const actor = (schoolId: string, campusId: string, role: AuthUser["role"], name: string, userId = randomUUID()): AuthUser => ({ userId, schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, fullName: name, accessVersion: 0 });
const teacherA1 = actor(schoolA, campusA1, "TEACHER", "Synthetic subject teacher A1");
const otherTeacherA1 = actor(schoolA, campusA1, "TEACHER", "Synthetic other teacher A1");
const teacherA2 = actor(schoolA, campusA2, "TEACHER", "Synthetic teacher A2");
const teacherB1 = actor(schoolB, campusB1, "TEACHER", "Synthetic teacher B1");
const as = <T>(who: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: who.schoolId, campusId: who.campusId, userId: who.userId, role: who.role }, fn);
const save = (who: AuthUser, entries: { studentId: string; subjectId: string; marksObtained: number; isAbsent?: boolean; isExempt?: boolean }[], expectedMarks?: Record<string, string>, examId = examA1) =>
  as(who, () => enterBulkMarks(who, { examId, entries, expectedMarks, ipAddress: null }));
const key = (studentId: string, subjectId = subjectA1) => `${studentId}:${subjectId}`;
const markOf = (studentId: string, subjectId = subjectA1) => raw.mark.findFirst({ where: { examId: examA1, studentId, subjectId } });
const isRecordChanged = (error: unknown) => (error as Error).message === "RECORD_CHANGED";
/** The baseline the marks sheet sends, read from the stored state of each cell (ABSENT, EXEMPT, or the score). */
const tokenOf = (mark: { marksObtained: number; isAbsent: boolean; isExempt: boolean } | null) => (!mark ? "" : mark.isAbsent ? "ABSENT" : mark.isExempt ? "EXEMPT" : String(mark.marksObtained));
const baseline = async (studentIds: string[], subjectId = subjectA1) => Object.fromEntries(await Promise.all(studentIds.map(async (id) => [key(id, subjectId), tokenOf(await markOf(id, subjectId))])));
const setMark = (studentId: string, data: { marksObtained: number; isAbsent?: boolean; isExempt?: boolean }) =>
  raw.mark.updateMany({ where: { examId: examA1, studentId, subjectId: subjectA1 }, data: { isAbsent: false, isExempt: false, ...data } });

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic marks school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.createMany({ data: [
    { id: campusA1, schoolId: schoolA, name: "Synthetic campus A1", regId: campusA1, city: "Synthetic" },
    { id: campusA2, schoolId: schoolA, name: "Synthetic campus A2", regId: campusA2, city: "Synthetic" },
    { id: campusB1, schoolId: schoolB, name: "Synthetic campus B1", regId: campusB1, city: "Synthetic" },
  ] });
  for (const who of [teacherA1, otherTeacherA1, teacherA2, teacherB1]) await raw.user.create({ data: { id: who.userId, schoolId: who.schoolId, campusId: who.campusId, email: who.email, role: who.role, fullName: who.fullName!, onboardingComplete: true } });
  await raw.class.create({ data: { id: classA1, schoolId: schoolA, campusId: campusA1, name: "Synthetic class", academicYear: 2026, status: "ACTIVE" } });
  await raw.subject.createMany({ data: [
    { id: subjectA1, schoolId: schoolA, campusId: campusA1, classId: classA1, name: "Mathematics", totalMarks: 100, teacherId: teacherA1.userId },
    { id: subjectA1b, schoolId: schoolA, campusId: campusA1, classId: classA1, name: "Physics", totalMarks: 100, teacherId: otherTeacherA1.userId },
  ] });
  for (const [id, roll] of [[student1, "1"], [student2, "2"], [student3, "3"]] as const) await raw.student.create({ data: { id, schoolId: schoolA, campusId: campusA1, classId: classA1, fullName: `Pupil ${roll}`, rollNo: roll, gender: "MALE" } });
  await raw.exam.create({ data: { id: examA1, schoolId: schoolA, campusId: campusA1, classId: classA1, title: "Term 1", term: "Term-1", academicYear: 2026, status: "ACTIVE", isLocked: false } });
  const classB = await raw.class.create({ data: { schoolId: schoolB, campusId: campusB1, name: "School B class", academicYear: 2026, status: "ACTIVE" } });
  const subjectB = await raw.subject.create({ data: { schoolId: schoolB, campusId: campusB1, classId: classB.id, name: "Mathematics", totalMarks: 100, teacherId: teacherB1.userId } });
  const studentB = await raw.student.create({ data: { schoolId: schoolB, campusId: campusB1, classId: classB.id, fullName: "Pupil B", rollNo: "B1", gender: "MALE" } });
  await raw.exam.create({ data: { id: examB1, schoolId: schoolB, campusId: campusB1, classId: classB.id, title: "School B term", term: "Term-1", academicYear: 2026, status: "ACTIVE", isLocked: false } });
  await raw.mark.create({ data: { schoolId: schoolB, campusId: campusB1, examId: examB1, studentId: studentB.id, subjectId: subjectB.id, marksObtained: 50, enteredBy: teacherB1.userId } });
  await raw.mark.create({ data: { schoolId: schoolA, campusId: campusA1, examId: examA1, studentId: student1, subjectId: subjectA1, marksObtained: 0, isAbsent: true, enteredBy: teacherA1.userId } });
  await raw.mark.create({ data: { schoolId: schoolA, campusId: campusA1, examId: examA1, studentId: student2, subjectId: subjectA1, marksObtained: 0, isExempt: true, enteredBy: teacherA1.userId } });
  await raw.mark.create({ data: { schoolId: schoolA, campusId: campusA1, examId: examA1, studentId: student3, subjectId: subjectA1, marksObtained: 40, enteredBy: teacherA1.userId } });
});

after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("A: an unchanged ABSENT row saves normally when the sheet is saved with another pupil's edit", async () => {
  await setMark(student1, { marksObtained: 0, isAbsent: true });
  await setMark(student3, { marksObtained: 40 });
  const expectedMarks = await baseline([student1, student3]);
  // The whole sheet is sent, so the ABSENT row is in the entries too.
  await save(teacherA1, [{ studentId: student1, subjectId: subjectA1, marksObtained: 0, isAbsent: true }, { studentId: student3, subjectId: subjectA1, marksObtained: 41 }], expectedMarks);
  assert.equal((await markOf(student3))?.marksObtained, 41);
  assert.equal((await markOf(student1))?.isAbsent, true);
});

test("A: an unchanged EXEMPT row saves normally when the sheet is saved with another pupil's edit", async () => {
  await setMark(student2, { marksObtained: 0, isExempt: true });
  await setMark(student3, { marksObtained: 41 });
  const expectedMarks = await baseline([student2, student3]);
  await save(teacherA1, [{ studentId: student2, subjectId: subjectA1, marksObtained: 0, isExempt: true }, { studentId: student3, subjectId: subjectA1, marksObtained: 42 }], expectedMarks);
  assert.equal((await markOf(student2))?.isExempt, true);
  assert.equal((await markOf(student3))?.marksObtained, 42);
});

test("B: a stale numeric-zero save is refused when the row became EXEMPT concurrently, and the exemption survives", async () => {
  await setMark(student2, { marksObtained: 0 });
  const stale = await baseline([student2]); // editor A's sheet: "0"
  await setMark(student2, { marksObtained: 0, isExempt: true }); // editor B exempts the pupil
  await assert.rejects(save(teacherA1, [{ studentId: student2, subjectId: subjectA1, marksObtained: 0 }], stale), isRecordChanged);
  assert.equal((await markOf(student2))?.isExempt, true, "the exemption is not erased");
});

test("a row that became ABSENT concurrently is refused when the sheet still shows a score", async () => {
  await setMark(student3, { marksObtained: 42 });
  const stale = await baseline([student3]);
  await setMark(student3, { marksObtained: 0, isAbsent: true });
  await assert.rejects(save(teacherA1, [{ studentId: student3, subjectId: subjectA1, marksObtained: 42 }], stale), isRecordChanged);
});

test("a row that changed from a score to ABSENT concurrently is refused", async () => {
  await setMark(student3, { marksObtained: 40 });
  const stale = await baseline([student3]);
  await setMark(student3, { marksObtained: 0, isAbsent: true });
  await assert.rejects(save(teacherA1, [{ studentId: student3, subjectId: subjectA1, marksObtained: 0, isAbsent: true }], stale), isRecordChanged);
});

test("a new pupil with no row and an empty baseline saves", async () => {
  const fourth = randomUUID();
  await raw.student.create({ data: { id: fourth, schoolId: schoolA, campusId: campusA1, classId: classA1, fullName: "Pupil 4", rollNo: "4", gender: "MALE" } });
  await save(teacherA1, [{ studentId: fourth, subjectId: subjectA1, marksObtained: 55 }], { [key(fourth)]: "" });
  assert.equal((await markOf(fourth))?.marksObtained, 55);
});

test("teacher scope: a subject teacher cannot enter marks for another teacher's subject", async () => {
  await assert.rejects(save(teacherA1, [{ studentId: student3, subjectId: subjectA1b, marksObtained: 10 }]), (error: { status?: number }) => error.status === 403);
});

test("two campuses: a teacher on campus two cannot see or save marks on campus one's exam", async () => {
  const before = (await markOf(student3))?.marksObtained;
  // The campus-scoped lookup misses campus one's exam, so the save is refused and nothing is written.
  await assert.rejects(save(teacherA2, [{ studentId: student3, subjectId: subjectA1, marksObtained: 10 }]), (error: { status?: number }) => error.status === 403 || error.status === 404);
  assert.equal((await markOf(student3))?.marksObtained, before);
});

test("two schools: school A cannot save marks against school B's exam", async () => {
  const studentB = await raw.student.findFirstOrThrow({ where: { schoolId: schoolB } });
  const subjectB = await raw.subject.findFirstOrThrow({ where: { schoolId: schoolB } });
  await assert.rejects(save(teacherA1, [{ studentId: studentB.id, subjectId: subjectB.id, marksObtained: 10 }], undefined, examB1), (error: { status?: number }) => error.status === 404);
  assert.equal((await raw.mark.findFirstOrThrow({ where: { examId: examB1 } })).marksObtained, 50);
});

test("SKAI-1834: new marks go in together through the tenant guard, each with one audit row, and an unchanged row is not rewritten", async () => {
  const pupils = [randomUUID(), randomUUID()];
  for (const [i, id] of pupils.entries()) await raw.student.create({ data: { id, schoolId: schoolA, campusId: campusA1, classId: classA1, fullName: `Pupil new ${i}`, rollNo: `N${i}`, gender: "MALE" } });
  await setMark(student3, { marksObtained: 40 });
  await raw.mark.updateMany({ where: { examId: examA1, studentId: student3, subjectId: subjectA1 }, data: { enteredBy: teacherA1.userId, grade: (await markOf(student3))?.grade } });
  const auditsBefore = await raw.auditLog.count({ where: { schoolId: schoolA, tableName: "marks" } });
  const result = await save(teacherA1, [...pupils.map((studentId) => ({ studentId, subjectId: subjectA1, marksObtained: 30 })), { studentId: student3, subjectId: subjectA1, marksObtained: 40 }]);
  const created = await raw.mark.findMany({ where: { examId: examA1, studentId: { in: pupils } } });
  assert.equal(created.length, 2);
  assert.ok(created.every((mark) => mark.schoolId === schoolA && mark.campusId === campusA1 && mark.enteredBy === teacherA1.userId));
  const audits = await raw.auditLog.findMany({ where: { schoolId: schoolA, tableName: "marks", createdAt: { gte: new Date(Date.now() - 60_000) } }, orderBy: { createdAt: "desc" } });
  for (const mark of created) assert.equal(audits.filter((row) => row.recordId === mark.id).length, 1, "one audit row per new mark");
  assert.equal(audits.filter((row) => row.recordId === "*").length, 0, "no bulk audit row");
  assert.equal(result.changed, 2);
  assert.equal(await raw.auditLog.count({ where: { schoolId: schoolA, tableName: "marks" } }), auditsBefore + 2, "the unchanged row adds no audit");
});
