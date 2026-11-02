import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { commitBatch, createTemplate, reverseBatch, startBatch } from "../../src/lib/marks-scan/service";
import { gradeForMark, thresholdsForClass } from "../../src/lib/academic/report-cards";

// SKAI-1436: reversing a scanned marks import restores the exact prior state, including an exemption.
// Covers exempt, absent and numeric priors, teacher scope, and two schools and two campuses.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient();
const schoolA = `scan-a-${randomUUID()}`, schoolB = `scan-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const teacher = { userId: randomUUID(), schoolId: schoolA, campusId: campusA1, role: "TEACHER", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic teacher" } as AuthUser;
const otherTeacher = { ...teacher, userId: randomUUID(), email: `${randomUUID()}@example.invalid` } as AuthUser;
const adminA2 = { userId: randomUUID(), schoolId: schoolA, campusId: campusA2, role: "CAMPUS_ADMIN", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic admin" } as AuthUser;
const adminB1 = { userId: randomUUID(), schoolId: schoolB, campusId: campusB1, role: "CAMPUS_ADMIN", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic admin B" } as AuthUser;
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId!, userId: user.userId, role: user.role as "TEACHER" }, work);

type Prior = { marksObtained: number; isAbsent: boolean; isExempt: boolean };
const PRIORS: [string, Prior, string | null][] = [
  ["exempt", { marksObtained: 0, isAbsent: false, isExempt: true }, null],
  ["absent", { marksObtained: 0, isAbsent: true, isExempt: false }, null],
  ["numeric", { marksObtained: 42, isAbsent: false, isExempt: false }, "computed"],
];

/** A class with one pupil and an open exam in one subject, taught by `teacher` (or left unassigned). */
async function scenario(schoolId: string, campusId: string, prior: Prior, teacherId: string | null) {
  const classId = randomUUID(), subjectId = randomUUID(), examId = randomUUID(), studentId = randomUUID();
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: `Class ${classId.slice(0, 8)}`, academicYear: 2027, classTeacherId: null } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Maths", totalMarks: 100, teacherId } });
  await raw.exam.create({ data: { id: examId, schoolId, campusId, classId, title: "Midterm", term: "T1", academicYear: 2027, examType: "MIDTERM", totalMarks: 100, status: "DRAFT_OPEN", isLocked: false, rejectionCount: 0 } });
  await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic pupil", rollNo: `R${studentId.slice(0, 6)}`, gender: "FEMALE", enrollmentDate: new Date("2027-01-01T00:00:00Z"), status: "active" } });
  await raw.mark.create({ data: { schoolId, campusId, examId, studentId, subjectId, marksObtained: prior.marksObtained, isAbsent: prior.isAbsent, isExempt: prior.isExempt, grade: prior.isExempt || prior.isAbsent ? null : "A" } });
  return { classId, subjectId, examId, studentId };
}

/** Commit a numeric scanned mark for the pupil after a batch is started and approved. */
async function importNumeric(user: AuthUser, s: { subjectId: string; examId: string; studentId: string }, value: number) {
  const template = await ctx(user, () => createTemplate(user, { examId: s.examId, subjectId: s.subjectId }));
  const batch = await ctx(user, () => startBatch(user, { templateId: template.id }));
  await raw.markScanCell.create({ data: { schoolId: user.schoolId, batchId: batch.id, pageNumber: 1, rowNumber: 1, studentId: s.studentId, proposedValue: value, reviewedValue: value, reviewedAbsent: false, status: "REVIEWED", reviewedById: user.userId, reviewedAt: new Date() } });
  const approved = await raw.markScanBatch.update({ where: { id: batch.id }, data: { status: "APPROVED", approvedById: user.userId, approvedAt: new Date() } });
  const committed = await ctx(user, () => commitBatch(user, batch.id, { commitKey: `commit-${randomUUID()}`, knownVersion: approved.version }));
  return { batchId: batch.id, receipt: committed.receipt as { changed: { before: Record<string, unknown> | null }[] } };
}
const markOf = (examId: string, studentId: string) => raw.mark.findFirst({ where: { examId, studentId } });

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic scan school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [schoolId, campusId] of [[schoolA, campusA1], [schoolA, campusA2], [schoolB, campusB1]]) await raw.campus.create({ data: { id: campusId, schoolId, name: `Synthetic ${campusId.slice(0, 4)}`, regId: campusId, city: "Lahore" } });
  for (const u of [teacher, otherTeacher, adminA2, adminB1]) await raw.user.create({ data: { id: u.userId, schoolId: u.schoolId, campusId: u.campusId, role: u.role as "TEACHER", email: u.email, fullName: u.fullName!, onboardingComplete: true, isActive: true } });
});
after(async () => {
  await raw.$disconnect(); await prisma.$disconnect();
});

for (const [label, prior, grade] of PRIORS) {
  test(`reversing an import restores a ${label} prior state exactly`, async () => {
    const s = await scenario(schoolA, campusA1, prior, teacher.userId);
    const { batchId, receipt } = await importNumeric(teacher, s, 77);
    assert.deepEqual(receipt.changed[0].before, { marksObtained: prior.marksObtained, isAbsent: prior.isAbsent, isExempt: prior.isExempt }, "the receipt keeps the prior exemption");
    assert.equal((await markOf(s.examId, s.studentId))!.marksObtained, 77);
    await ctx(teacher, () => reverseBatch(teacher, batchId));
    const restored = await markOf(s.examId, s.studentId);
    // A numeric prior gets the grade the scale gives it; an exempt or absent prior has no grade.
    const expectedGrade = grade === "computed" ? gradeForMark(prior.marksObtained, 100, await ctx(teacher, () => thresholdsForClass(s.classId, 2027, prisma, null))) : grade;
    assert.deepEqual([restored!.marksObtained, restored!.isAbsent, restored!.isExempt, restored!.grade], [prior.marksObtained, prior.isAbsent, prior.isExempt, expectedGrade]);
  });
}

test("a teacher not assigned to the subject cannot start or reverse the import", async () => {
  const s = await scenario(schoolA, campusA1, PRIORS[0][1], teacher.userId);
  const template = await ctx(teacher, () => createTemplate(teacher, { examId: s.examId, subjectId: s.subjectId }));
  await assert.rejects(() => ctx(otherTeacher, () => startBatch(otherTeacher, { templateId: template.id })), { status: 404 });
});

test("another campus of the same school and another school cannot reverse an import", async () => {
  const s = await scenario(schoolA, campusA1, PRIORS[0][1], teacher.userId);
  const { batchId } = await importNumeric(teacher, s, 60);
  await assert.rejects(() => ctx(adminA2, () => reverseBatch(adminA2, batchId)), { status: 404 }, "the second campus cannot see this exam");
  await assert.rejects(() => ctx(adminB1, () => reverseBatch(adminB1, batchId)), { status: 404 }, "the other school cannot see this batch");
  assert.equal((await markOf(s.examId, s.studentId))!.marksObtained, 60, "nothing was reversed by either");
});
