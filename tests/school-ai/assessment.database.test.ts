import assert from "node:assert/strict";
import { before, beforeEach, after, test, type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma, type TxClient } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { approveSchoolAiAccommodation, getSchoolAiAccommodations, createSchoolAiExam, examRoster, getSchoolAiAttempt, getSchoolAiExam, listSchoolAiAttempts, listSchoolAiExams, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { assessmentFixture } from "./assessment-fixture";

const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only the isolated school AI fixture database on 127.0.0.1:55438/postgres.");
const raw = new PrismaClient();
const schoolId = `ai-exam-${randomUUID()}`, campusId = randomUUID(), anotherCampusId = randomUUID(), classId = randomUUID(), otherClassId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"], campus = campusId): AuthUser => ({ userId: randomUUID(), schoolId, campusId: campus, role, email: `${randomUUID()}@example.invalid` });
const admin = actor("CAMPUS_ADMIN"), teacher = actor("TEACHER"), unrelatedTeacher = actor("TEACHER"), student = actor("STUDENT"), secondStudent = actor("STUDENT"), wrongClass = actor("STUDENT"), wrongCampus = actor("STUDENT", anotherCampusId), parent = actor("PARENT");
const studentId = randomUUID(), secondStudentId = randomUUID(), wrongClassId = randomUUID();
const now = new Date("2026-10-12T10:00:00Z");
let paperId: string, paperVersion: number;
const ctx = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, fn);
const createExam = async (changes: Record<string, unknown> = {}) => ctx(admin, () => createSchoolAiExam(admin, { idempotencyKey: randomUUID(), paperId, title: "Synthetic controlled exam", startsAt: "2026-10-12T09:59:00Z", endsAt: "2026-10-12T11:00:00Z", studentIds: [studentId, secondStudentId], mode: "STANDARD", ...changes }, now));

function rollbackFirstTransaction(t: TestContext, advanceTo: Date) {
  const client = globalThis.prisma;
  assert(client, "The isolated fixture must use the nonproduction guarded client");
  const original = client.$transaction, transaction = original.bind(client);
  let rolledBack = false;
  // Run the real PostgreSQL callback, then abort before commit exactly once.
  // The retry must reread the rolled-back state and the advanced server clock.
  client.$transaction = (async (work: (tx: TxClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => transaction(async tx => {
    const result = await work(tx);
    if (!rolledBack) {
      rolledBack = true;
      t.mock.timers.setTime(advanceTo.getTime());
      throw new Prisma.PrismaClientKnownRequestError("Synthetic serialization rollback after real database work", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
    }
    return result;
  }, options)) as typeof client.$transaction;
  t.after(() => { client.$transaction = original; });
  return () => rolledBack;
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic exam school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  for (const id of [campusId, anotherCampusId]) await raw.campus.create({ data: { id, schoolId, name: "Synthetic campus", regId: id, city: "Synthetic" } });
  for (const user of [admin, teacher, unrelatedTeacher, student, secondStudent, wrongClass, wrongCampus, parent]) await raw.user.create({ data: { id: user.userId, schoolId, campusId: user.campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  for (const [index, id] of [classId, otherClassId].entries()) await raw.class.create({ data: { id, schoolId, campusId, name: "Synthetic class", section: `S${index + 1}`, academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId } });
  for (const [id, userId, cls] of [[studentId, student.userId, classId], [secondStudentId, secondStudent.userId, classId], [wrongClassId, wrongClass.userId, otherClassId]]) await raw.student.create({ data: { id, schoolId, campusId, classId: cls, studentUserId: userId, fullName: "Synthetic learner", rollNo: id.slice(0, 8), gender: "MALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(admin, { kind: "CURRICULUM", campusId, title: "Synthetic approved curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(admin, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(admin, { kind: "PAPER", campusId, title: fixture.paper.blueprint.title, data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(admin, paper.id, { version: paper.version, action: "approve" }); paperId = paper.id; paperVersion = paper.version;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });
beforeEach(async () => {
  // Each scenario owns its active attempt; cross-assignment conflicts are tested within a case.
  await raw.schoolAiExamAttempt.updateMany({ where: { schoolId, status: "IN_PROGRESS" }, data: { status: "SUBMITTED", submittedAt: now } });
});

test("assignment requires an approved paper, valid roster and configured mode; identical retry returns one assignment", async () => {
  const key = randomUUID(); const a = await createExam({ idempotencyKey: key }); const b = await createExam({ idempotencyKey: key }); assert.equal(a.id, b.id); assert.equal(a.paperVersion, paperVersion);
  await assert.rejects(() => createExam({ idempotencyKey: key, title: "Conflicting retry" }), { status: 409 });
  await assert.rejects(() => createExam({ mode: "SECURE_BROWSER" }), { status: 409 });
  await assert.rejects(() => createExam({ mode: "PROCTORED" }), { status: 409 });
  await assert.rejects(() => createExam({ studentIds: [wrongClassId] }), { status: 403 });
  await assert.rejects(() => createExam({ paperId: randomUUID() }), { status: 404 });
});
test("student list and metadata expose assigned exams only, never paper keys, roster or other attempts", async () => {
  const exam = await createExam({ studentIds: [studentId] });
  const available = await ctx(student, () => listSchoolAiExams(student)); assert(available.some((item) => item.id === exam.id));
  const metadata = await ctx(student, () => getSchoolAiExam(student, exam.id)); const text = JSON.stringify(metadata);
  for (const forbidden of ["paperSnapshot", "correctOptionId", "modelAnswer", "studentIds", "responses"]) assert.equal(text.includes(forbidden), false);
  assert.equal((await ctx(secondStudent, () => listSchoolAiExams(secondStudent))).some((item) => item.id === exam.id), false);
  for (const user of [secondStudent, wrongClass, wrongCampus, parent, unrelatedTeacher]) await assert.rejects(() => ctx(user, () => getSchoolAiExam(user, exam.id)));
  await assert.rejects(() => ctx(student, () => examRoster(student, paperId)), { status: 403 });
});
test("starting and reopening use one attempt and immutable paper snapshot without answer keys", async () => {
  const exam = await createExam(); const attempt = await ctx(student, () => startSchoolAiExam(student, exam.id, now));
  const resumed = await ctx(student, () => startSchoolAiExam(student, exam.id, new Date(now.getTime() + 60000)));
  assert.equal(attempt!.id, resumed!.id); assert.equal(attempt!.deadlineAt.toISOString(), "2026-10-12T10:30:00.000Z");
  const text = JSON.stringify(attempt); for (const forbidden of ["correctOptionId", "modelAnswer", "rubric", "sourceRefs", "generation"]) assert.equal(text.includes(forbidden), false);
  assert.equal((await ctx(student, () => getSchoolAiAttempt(student, exam.id, now)))?.sequence, 0);
});
test("server clock refuses early/late starts and clamps a late start to the exam availability end", async () => {
  const exam = await createExam({ startsAt: "2026-10-12T10:10:00Z", endsAt: "2026-10-12T10:20:00Z" });
  await assert.rejects(() => ctx(student, () => startSchoolAiExam(student, exam.id, now)), { status: 409 });
  await assert.rejects(() => ctx(student, () => startSchoolAiExam(student, exam.id, new Date("2026-10-12T10:20:00Z"))), { status: 409 });
  const attempt = await ctx(student, () => startSchoolAiExam(student, exam.id, new Date("2026-10-12T10:11:00Z")));
  assert.equal(attempt!.deadlineAt.toISOString(), "2026-10-12T10:20:00.000Z");
});
test("sequenced saves reject older/conflicting versions and replay identical network retries", async () => {
  const exam = await createExam(); await ctx(student, () => startSchoolAiExam(student, exam.id, now));
  const input = { sequence: 2, responses: { q1: "a1", q3: "Combine quantities" } };
  const saved = await ctx(student, () => saveSchoolAiAttempt(student, exam.id, input, now));
  const replay = await ctx(student, () => saveSchoolAiAttempt(student, exam.id, input, now)); assert.equal(saved.sequence, replay.sequence); assert.deepEqual(replay.responses, input.responses);
  await assert.rejects(() => ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 1, responses: {} }, now)), { status: 409 });
  await assert.rejects(() => ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 2, responses: { q1: "a2" } }, now)), { status: 409 });
  await assert.rejects(() => ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 3, responses: { q1: "a1", q2: "a2" } }, now)), { status: 400 });
  await assert.rejects(() => ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 3, responses: { invented: "text" } }, now)), { status: 400 });
});
test("final submission is retry safe, freezes responses, and written marks remain proposals", async () => {
  const exam = await createExam(); await ctx(student, () => startSchoolAiExam(student, exam.id, now));
  const submitted = await ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 1, responses: { q1: "a1", q3: "Combine quantities" }, submit: true }, now));
  const repeated = await ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 2, responses: { q1: "a2" }, submit: true }, now));
  assert.equal(submitted.status, "SUBMITTED"); assert.deepEqual(submitted.responses, repeated.responses); assert.equal(repeated.accepted, false);
  assert.equal(JSON.stringify(submitted).includes("scoreProposal"), false);
  const staff = await ctx(admin, () => listSchoolAiAttempts(admin, exam.id, now));
  const proposal = staff.attempts[0].scoreProposal as { totalObjectiveMarks: number; pendingReviewCount: number }; assert.equal(proposal.totalObjectiveMarks, 2); assert.equal(proposal.pendingReviewCount, 1);
  await assert.rejects(() => ctx(student, () => listSchoolAiAttempts(student, exam.id, now)), { status: 403 });
});
test("expired saves accept only responses already persisted before the deadline", async () => {
  const exam = await createExam(); await ctx(student, () => startSchoolAiExam(student, exam.id, now));
  await ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 1, responses: { q1: "a1" } }, now));
  const expired = await ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 2, responses: { q1: "a2", q3: "Too late" } }, new Date("2026-10-12T10:31:00Z")));
  assert.deepEqual(expired.responses, { q1: "a1" }); assert.equal(expired.status, "SUBMITTED"); assert.equal(expired.accepted, false);
});
test("moderation rejects invented marks and repeat review; gradebook remains unchanged", async () => {
  const exam = await createExam(); const attempt = await ctx(student, () => startSchoolAiExam(student, exam.id, now));
  await ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 1, responses: { q1: "a1", q3: "My working" }, submit: true }, now));
  await assert.rejects(() => ctx(admin, () => reviewSchoolAiAttempt(admin, exam.id, attempt!.id, { note: "Review", marks: [{ questionId: "q2", marks: 2, feedback: "No work" }] }, now)), { status: 400 });
  const review = { note: "Teacher moderation", marks: [{ questionId: "q1", marks: 2, feedback: "Correct" }, { questionId: "q3", marks: 2, feedback: "Partial method" }] };
  await assert.rejects(() => ctx(student, () => reviewSchoolAiAttempt(student, exam.id, attempt!.id, review, now)), { status: 403 });
  const beforeCount = await raw.mark.count({ where: { schoolId } });
  const result = await ctx(admin, () => reviewSchoolAiAttempt(admin, exam.id, attempt!.id, review, now)); assert.equal(result.status, "REVIEWED");
  await assert.rejects(() => ctx(admin, () => reviewSchoolAiAttempt(admin, exam.id, attempt!.id, review, now)), { status: 409 });
  assert.equal(await raw.mark.count({ where: { schoolId } }), beforeCount);
});
test("approved extra time is bounded, student-specific, versioned and private", async () => {
  const exam = await createExam();
  const input = { version: 1, studentId, extraMinutes: 15, reason: "Approved school assessment arrangement" };
  await assert.rejects(() => ctx(student, () => approveSchoolAiAccommodation(student, exam.id, input, now)), { status: 403 });
  await assert.rejects(() => ctx(teacher, () => approveSchoolAiAccommodation(teacher, exam.id, input, now)));
  await assert.rejects(() => ctx(wrongCampus, () => approveSchoolAiAccommodation(wrongCampus, exam.id, input, now)), { status: 404 });
  await assert.rejects(() => ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, { ...input, studentId: wrongClassId }, now)), { status: 404 });
  await assert.rejects(() => ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, { ...input, extraMinutes: 241 }, now)));
  const approved = await ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, input, now)); assert.equal(approved.version, 2);
  await assert.rejects(() => ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, { ...input, extraMinutes: 20 }, now)), { status: 409 });
  const metadata = await ctx(student, () => getSchoolAiExam(student, exam.id)); assert.equal(metadata.extraMinutes, 15); assert.equal(metadata.durationMinutes, 45);
  assert.equal((await ctx(secondStudent, () => getSchoolAiExam(secondStudent, exam.id))).extraMinutes, 0);
  for (const forbidden of [input.reason, "approvedById", secondStudentId]) assert.equal(JSON.stringify(metadata).includes(forbidden), false);
  await assert.rejects(() => ctx(student, () => getSchoolAiAccommodations(student, exam.id)), { status: 403 });
  assert.equal((await ctx(admin, () => getSchoolAiAccommodations(admin, exam.id))).students.find((entry) => entry.id === studentId)?.reason, input.reason);
  await assert.rejects(() => ctx(student, () => startSchoolAiExam(student, exam.id, now, 1)), { status: 409 });
  assert.equal(await ctx(student, () => getSchoolAiAttempt(student, exam.id, now)), null);
  const attempt = await ctx(student, () => startSchoolAiExam(student, exam.id, now, 2)); assert.equal(attempt!.deadlineAt.toISOString(), "2026-10-12T10:45:00.000Z");
  const unchanged = await ctx(secondStudent, () => startSchoolAiExam(secondStudent, exam.id, now, 2)); assert.equal(unchanged!.deadlineAt.toISOString(), "2026-10-12T10:30:00.000Z");
  for (const extraMinutes of [0, 30]) await assert.rejects(() => ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, { ...input, version: 2, extraMinutes }, now)), { status: 409 });
  assert.equal((await ctx(student, () => startSchoolAiExam(student, exam.id, now, 1)))!.deadlineAt.toISOString(), attempt!.deadlineAt.toISOString());
  assert.equal((await ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 1, responses: { q1: "a1" } }, new Date("2026-10-12T10:35:00Z")))).accepted, true);
  assert.equal((await ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 2, responses: { q1: "a2" } }, new Date("2026-10-12T10:46:00Z")))).accepted, false);
});
test("extra time observes the hard window end and live approval permission revocation", async () => {
  const exam = await createExam({ endsAt: "2026-10-12T10:40:00Z" });
  const input = { version: 1, studentId, extraMinutes: 60, reason: "Approved timing arrangement" };
  // Warmed permission caches must not permit a newly revoked accommodation approval.
  await raw.rolePermission.create({ data: { schoolId, role: admin.role, module: "exams", canView: true, canAdd: true, canEdit: false, canDelete: false } });
  try { await assert.rejects(() => ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, input, now)), { status: 403 }); }
  finally { await raw.rolePermission.deleteMany({ where: { schoolId, role: admin.role, module: "exams" } }); }
  await ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, input, now));
  const attempt = await ctx(student, () => startSchoolAiExam(student, exam.id, now, 2)); assert.equal(attempt!.deadlineAt.toISOString(), "2026-10-12T10:40:00.000Z");
});
test("extra time can be revised or removed before start, but never approved after closing", async () => {
  const exam = await createExam();
  const input = { studentId, extraMinutes: 15, reason: "Initial arrangement" };
  await ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, { ...input, version: 1 }, now));
  await ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, { ...input, version: 2, extraMinutes: 0, reason: "Arrangement withdrawn before start" }, now));
  const metadata = await ctx(student, () => getSchoolAiExam(student, exam.id)); assert.equal(metadata.extraMinutes, 0); assert.equal(metadata.version, 3);
  await assert.rejects(() => ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, { ...input, studentId: secondStudentId, version: 3 }, new Date("2026-10-12T11:00:00Z"))), { status: 409 });
  const attempt = await ctx(student, () => startSchoolAiExam(student, exam.id, now, 3)); assert.equal(attempt!.deadlineAt.toISOString(), "2026-10-12T10:30:00.000Z");
});
test("simultaneous approval and start cannot alter time after attempt creation", async () => {
  const exam = await createExam();
  const outcomes = await Promise.allSettled([
    ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, { version: 1, studentId, extraMinutes: 15, reason: "Approved before start" }, now)),
    ctx(student, () => startSchoolAiExam(student, exam.id, now, 1)),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const metadata = await ctx(student, () => getSchoolAiExam(student, exam.id));
  const attempt = await ctx(student, () => startSchoolAiExam(student, exam.id, now, metadata.version));
  assert.equal(attempt!.deadlineAt.getTime() - now.getTime(), metadata.durationMinutes * 60000);
  await assert.rejects(() => ctx(admin, () => approveSchoolAiAccommodation(admin, exam.id, { version: metadata.version, studentId, extraMinutes: 0, reason: "Cannot shorten" }, now)), { status: 409 });
});
test("concurrent independent exams and duplicate starts admit one active exam per learner without extending deadlines", async () => {
  const exams = await Promise.all(Array.from({ length: 4 }, () => createExam()));
  const starts = await Promise.allSettled(exams.flatMap(exam => [
    ctx(student, () => startSchoolAiExam(student, exam.id, now, 1)),
    ctx(student, () => startSchoolAiExam(student, exam.id, now, 1)),
    ctx(secondStudent, () => startSchoolAiExam(secondStudent, exam.id, now, 1)),
  ]));
  const attempts = await raw.schoolAiExamAttempt.findMany({ where: { schoolId, assignmentId: { in: exams.map(exam => exam.id) } } });
  assert.equal(attempts.length, 2);
  assert.equal(new Set(attempts.map(attempt => attempt.userId)).size, 2);
  for (const attempt of attempts) {
    assert.equal(attempt.startedAt.toISOString(), now.toISOString());
    assert.equal(attempt.deadlineAt.toISOString(), "2026-10-12T10:30:00.000Z");
  }
  for (const outcome of starts) {
    if (outcome.status === "fulfilled") assert.ok(attempts.some(attempt => attempt.id === outcome.value!.id));
    else assert.equal(outcome.reason.status, 409);
  }
});
test("a start rolled back past closing rereads the production clock and creates no attempt", async t => {
  const exam = await createExam({ endsAt: "2026-10-12T10:01:00Z" });
  t.mock.timers.enable({ apis: ["Date"], now });
  const rolledBack = rollbackFirstTransaction(t, new Date("2026-10-12T10:02:00Z"));
  await assert.rejects(() => ctx(student, () => startSchoolAiExam(student, exam.id, undefined, 1)), { status: 409, message: "The exam is outside its availability window." });
  assert.equal(rolledBack(), true);
  assert.equal(await raw.schoolAiExamAttempt.count({ where: { schoolId, assignmentId: exam.id } }), 0);
});
test("a save rolled back past the deadline submits only previously persisted responses", async t => {
  const exam = await createExam();
  const attempt = await ctx(student, () => startSchoolAiExam(student, exam.id, now));
  await ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 1, responses: { q1: "a1" } }, now));
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T10:29:00Z") });
  const rolledBack = rollbackFirstTransaction(t, new Date("2026-10-12T10:31:00Z"));
  const saved = await ctx(student, () => saveSchoolAiAttempt(student, exam.id, { sequence: 2, responses: { q1: "a2", q3: "Rolled-back late answer" } }));
  assert.equal(rolledBack(), true);
  assert.equal(saved.status, "SUBMITTED"); assert.equal(saved.accepted, false);
  assert.equal(saved.sequence, 1); assert.deepEqual(saved.responses, { q1: "a1" });
  assert.equal(saved.deadlineAt.toISOString(), attempt!.deadlineAt.toISOString());
  assert.equal(saved.serverNow, "2026-10-12T10:31:00.000Z");
});
test("a published assignment keeps its approved question snapshot when authoring creates a later draft", async () => {
  const exam = await createExam();
  await updateWorkspaceRecord(admin, paperId, { version: paperVersion, title: "Later authoring draft" });
  const attempt = await ctx(student, () => startSchoolAiExam(student, exam.id, now));
  assert.equal(attempt!.paper.title, "Synthetic mathematics assessment");
  await assert.rejects(() => createExam(), { status: 409 });
});
