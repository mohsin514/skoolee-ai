// SKAI-1585: approving a report card names its current version ID and carries no edit fields. A remark save
// makes a new version, so the approval must follow it. Runs against a disposable loopback database with
// synthetic data only.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { updateReportCardCommand } from "../../src/lib/reports/edit-remarks-command";
import { approvalBody, remarkBody } from "../../src/lib/reports/approval-request";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const raw = new PrismaClient();

const schoolA = `rc-a-${randomUUID()}`, schoolB = `rc-b-${randomUUID()}`;
const campusA1 = randomUUID(), campusA2 = randomUUID(), campusB1 = randomUUID();
const exams: Record<string, string> = {};
const user = (schoolId: string, campusId: string, role: AuthUser["role"], name: string): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, fullName: name, accessVersion: 0 });
const principalA1 = user(schoolA, campusA1, "PRINCIPAL", "Synthetic principal A1");
const principalA2 = user(schoolA, campusA2, "PRINCIPAL", "Synthetic principal A2");
const principalB = user(schoolB, campusB1, "PRINCIPAL", "Synthetic principal B");
const teacherA1 = user(schoolA, campusA1, "TEACHER", "Synthetic teacher A1");
const as = <T>(actor: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: actor.schoolId, campusId: actor.campusId, userId: actor.userId, role: actor.role }, fn);
const cardsByStudent: string[] = [];
const currentVersion = async (cardId: string) => (await raw.reportCard.findUniqueOrThrow({ where: { id: cardId }, select: { currentVersionId: true } })).currentVersionId;
const approved = async (cardId: string) => (await raw.reportCard.findUniqueOrThrow({ where: { id: cardId }, select: { remarksApproved: true } })).remarksApproved;

/** A locked exam with one class, one subject, one student and one mark per school. */
async function fixture(schoolId: string, campusId: string, label: string, students: number) {
  const classId = randomUUID(), subjectId = randomUUID();
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: `Synthetic ${label}`, academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", totalMarks: 100 } });
  const exam = await raw.exam.create({ data: { schoolId, campusId, classId, title: `EXAM-${label}`, term: "Term-1", academicYear: 2026, status: "LOCKED", isLocked: true } });
  exams[label] = exam.id;
  const ids: string[] = [];
  for (let n = 0; n < students; n += 1) {
    const student = await raw.student.create({ data: { schoolId, campusId, classId, fullName: `Synthetic student ${label}${n}`, rollNo: `${label}-${n}`, gender: "MALE" } });
    await raw.mark.create({ data: { schoolId, campusId, studentId: student.id, examId: exam.id, subjectId, marksObtained: 70 } });
    const card = await raw.reportCard.create({ data: { schoolId, campusId, studentId: student.id, examId: exam.id, totalMarks: 100, obtainedMarks: 70, percentage: 70, grade: "B", status: "DRAFT" } });
    ids.push(card.id);
  }
  return ids;
}

before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: { id, name: "Synthetic report school", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.createMany({ data: [
    { id: campusA1, schoolId: schoolA, name: "Synthetic campus A1", regId: campusA1, city: "Synthetic" },
    { id: campusA2, schoolId: schoolA, name: "Synthetic campus A2", regId: campusA2, city: "Synthetic" },
    { id: campusB1, schoolId: schoolB, name: "Synthetic campus B1", regId: campusB1, city: "Synthetic" },
  ] });
  for (const actor of [principalA1, principalA2, principalB, teacherA1]) await raw.user.create({ data: { id: actor.userId, schoolId: actor.schoolId, campusId: actor.campusId, email: actor.email, role: actor.role, fullName: actor.fullName!, onboardingComplete: true } });
  cardsByStudent.push(...await fixture(schoolA, campusA1, "A1", 2));
  [cardOne, cardTwo] = cardsByStudent;
  await fixture(schoolB, campusB1, "B1", 1);
});

after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

let cardOne = "", cardTwo = "";

test("approving the current version with no edit fields approves the card", async () => {
  await as(principalA1, () => updateReportCardCommand(principalA1, cardOne, remarkBody("Synthetic remark one")));
  const versionId = await currentVersion(cardOne);
  assert.ok(versionId);
  await as(principalA1, () => updateReportCardCommand(principalA1, cardOne, approvalBody(versionId)));
  assert.equal(await approved(cardOne), true);
});

test("the old body that mixes an edit into an approval is still refused with 409", async () => {
  await assert.rejects(
    as(principalA1, () => updateReportCardCommand(principalA1, cardTwo, { remarksEn: "Synthetic remark two", approve: true } as never)),
    (error: { status?: number }) => error.status === 409
  );
  assert.equal(await approved(cardTwo), false);
});

test("save then approve: the approval names the version the save created", async () => {
  await as(principalA1, () => updateReportCardCommand(principalA1, cardTwo, remarkBody("Synthetic remark two")));
  const versionId = await currentVersion(cardTwo);
  await as(principalA1, () => updateReportCardCommand(principalA1, cardTwo, approvalBody(versionId!)));
  assert.equal(await approved(cardTwo), true);
});

test("an approval without a version ID is refused with 409", async () => {
  const fresh = (await fixture(schoolA, campusA1, "A1-NOVER", 1))[0];
  await assert.rejects(
    as(principalA1, () => updateReportCardCommand(principalA1, fresh, { approve: true } as never)),
    (error: { status?: number }) => error.status === 409
  );
});

test("a stale version ID is refused and the card stays unapproved", async () => {
  const card = (await fixture(schoolA, campusA1, "A1-STALE", 1))[0];
  await as(principalA1, () => updateReportCardCommand(principalA1, card, remarkBody("First remark")));
  const stale = await currentVersion(card);
  await as(principalA1, () => updateReportCardCommand(principalA1, card, remarkBody("Second remark")));
  await assert.rejects(
    as(principalA1, () => updateReportCardCommand(principalA1, card, approvalBody(stale!))),
    (error: { status?: number }) => error.status === 409
  );
  assert.equal(await approved(card), false);
});

test("bulk approval approves each card on its own current version", async () => {
  const batch = await fixture(schoolA, campusA1, "A1-BULK", 2);
  const versions: string[] = [];
  for (const card of batch) {
    await as(principalA1, () => updateReportCardCommand(principalA1, card, remarkBody(`Bulk remark ${card}`)));
    versions.push((await currentVersion(card))!);
  }
  assert.notEqual(versions[0], versions[1]);
  for (const [index, card] of batch.entries()) await as(principalA1, () => updateReportCardCommand(principalA1, card, approvalBody(versions[index])));
  assert.deepEqual(await Promise.all(batch.map(approved)), [true, true]);
});

test("a teacher cannot approve a report card", async () => {
  const card = (await fixture(schoolA, campusA1, "A1-TEACH", 1))[0];
  await assert.rejects(
    as(teacherA1, async () => updateReportCardCommand(teacherA1, card, approvalBody((await currentVersion(card)) ?? "none"))),
    (error: { status?: number }) => error.status === 403
  );
});

test("a principal of another school cannot approve or see the card", async () => {
  const versionId = (await currentVersion(cardOne))!;
  await assert.rejects(
    as(principalB, () => updateReportCardCommand(principalB, cardOne, approvalBody(versionId))),
    (error: { status?: number }) => error.status === 403
  );
});

test("a principal of another campus in the same school cannot approve the card", async () => {
  const card = (await fixture(schoolA, campusA1, "A1-ISO", 1))[0];
  await as(principalA1, () => updateReportCardCommand(principalA1, card, remarkBody("Campus remark")));
  const versionId = (await currentVersion(card))!;
  await assert.rejects(
    as(principalA2, () => updateReportCardCommand(principalA2, card, approvalBody(versionId))),
    (error: { status?: number }) => error.status === 403
  );
  assert.equal(await approved(card), false);
});

test("the other school's exam is untouched by approvals in this school", async () => {
  const otherCard = (await raw.reportCard.findFirstOrThrow({ where: { examId: exams["B1"] } })).id;
  assert.equal(await approved(otherCard), false);
});
