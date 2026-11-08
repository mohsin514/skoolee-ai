import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, getSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { listClarifications, superviseAttempts } from "../../src/lib/school-ai/exam-incident-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R15.4 against the isolated database: a supervised pause stops the clock and resuming restores exactly the paused time.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `pau408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), learners = [actor("STUDENT"), actor("STUDENT")];
const studentIds = learners.map(() => randomUUID());
let examId = "", attemptIds: string[] = [];
const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic pause school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author, ...learners]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 8", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  for (const [index, learner] of learners.entries()) await raw.student.create({ data: { id: studentIds[index], schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic learner ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Synthetic pause test", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
  await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  examId = (await as(author, () => createSchoolAiExam(author, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Synthetic pause test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds, mode: "STANDARD" }))).id;
  for (const learner of learners) await as(learner, () => startSchoolAiExam(learner, examId));
  attemptIds = (await raw.schoolAiExamAttempt.findMany({ where: { assignmentId: examId }, orderBy: { startedAt: "asc" } })).map(row => row.id);
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("a pause needs staff and a reason, and reports each candidate's outcome", async () => {
  await assert.rejects(() => as(learners[0], () => superviseAttempts(learners[0], examId, { action: "pause", attemptIds: [attemptIds[0]], reason: "Fire drill" })), { status: 403 });
  await assert.rejects(() => as(author, () => superviseAttempts(author, examId, { action: "pause", attemptIds: [attemptIds[0]] })), { status: 422 });
  const paused = await as(author, () => superviseAttempts(author, examId, { action: "pause", attemptIds: [attemptIds[0], attemptIds[0], randomUUID()], reason: "Candidate unwell, supervised break" }));
  assert.deepEqual(paused.outcomes.map(row => row.outcome), ["PAUSED", "NOT_IN_PROGRESS"]);
  const again = await as(author, () => superviseAttempts(author, examId, { action: "pause", attemptIds: [attemptIds[0]], reason: "Again" }));
  assert.deepEqual(again.outcomes.map(row => row.outcome), ["ALREADY_PAUSED"]);
  const view = await as(learners[0], () => listClarifications(learners[0], examId)) as { pausedAt: Date | null };
  assert.ok(view.pausedAt, "the candidate's page learns it is paused");
  assert.equal((await as(learners[1], () => listClarifications(learners[1], examId)) as { pausedAt: Date | null }).pausedAt, null, "only the named attempt is paused");
});

test("while paused, answers are not saved and the deadline cannot close the attempt", async () => {
  const attempt = await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attemptIds[0] } });
  await assert.rejects(() => as(learners[0], () => saveSchoolAiAttempt(learners[0], examId, { sequence: attempt.sequence + 1, responses: { q1: "a1" } })), { status: 423 });
  // The deadline passes during the pause: the attempt must stay open.
  await raw.schoolAiExamAttempt.update({ where: { id: attempt.id }, data: { startedAt: new Date(Date.now() - 600_000), deadlineAt: new Date(Date.now() - 1000), pausedAt: new Date(Date.now() - 120_000) } });
  const read = await as(learners[0], () => getSchoolAiAttempt(learners[0], examId));
  assert.equal(read?.status, "IN_PROGRESS");
});

test("resuming restores exactly the paused time and closes the pause record for good", async () => {
  const before = await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attemptIds[0] } });
  const resumed = await as(lead, () => superviseAttempts(lead, examId, { action: "resume", attemptIds: [attemptIds[0], attemptIds[1]] }));
  assert.deepEqual(resumed.outcomes.map(row => row.outcome), ["RESUMED", "NOT_PAUSED"]);
  const after = await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attemptIds[0] } });
  const restored = after.deadlineAt.getTime() - before.deadlineAt.getTime();
  assert.ok(restored >= 120_000 && restored < 130_000, `about two minutes restored, got ${restored}`);
  assert.equal(after.pausedAt, null);
  const pause = await raw.schoolAiExamPause.findFirstOrThrow({ where: { attemptId: attemptIds[0] } });
  assert.equal(pause.endedById, lead.userId);
  assert.equal(pause.restoredMs, restored);
  await assert.rejects(() => raw.schoolAiExamPause.update({ where: { id: pause.id }, data: { reason: "Rewritten" } }), /closed, once/);
  const saved = await as(learners[0], () => saveSchoolAiAttempt(learners[0], examId, { sequence: after.sequence + 1, responses: { q1: "a1" } }));
  assert.equal(saved.accepted, true, "answers save again once resumed");
  assert.ok(await raw.auditLog.count({ where: { schoolId, tableName: "school_ai_exam_attempts", recordId: attemptIds[0] } }) >= 2);
});
