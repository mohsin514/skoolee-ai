import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { applyRemedy, listRemedies, proposeRemedy } from "../../src/lib/school-ai/exam-incident-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R17.7 against the isolated database: rubric-correction and re-mark remedies from the moderator's per-script marks.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `rmk408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), learners = [actor("STUDENT"), actor("STUDENT"), actor("STUDENT")];
const studentIds = learners.map(() => randomUUID());
let examId = "", attemptIds: string[] = [];
const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic re-mark school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author, ...learners]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role} ${user.userId.slice(0, 4)}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 8", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  for (const [index, learner] of learners.entries()) await raw.student.create({ data: { id: studentIds[index], schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic learner ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Synthetic incident test", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
  await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  examId = (await as(author, () => createSchoolAiExam(author, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Synthetic incident test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds, mode: "STANDARD" }))).id;
  for (const learner of learners.slice(0, 2)) await as(learner, () => startSchoolAiExam(learner, examId));
  attemptIds = (await raw.schoolAiExamAttempt.findMany({ where: { assignmentId: examId }, orderBy: { startedAt: "asc" } })).map(row => row.id);
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("scripts are listed for re-marking, and invalid re-marks are refused", async () => {
  for (const [index, learner] of learners.slice(0, 2).entries()) {
    const attempt = await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attemptIds[index] } });
    await as(learner, () => saveSchoolAiAttempt(learner, examId, { sequence: attempt.sequence + 1, responses: { q1: "a1", q3: index ? "I count them." : "Combine both groups, then count all of them." }, submit: true }));
    await as(lead, () => reviewSchoolAiAttempt(lead, examId, attemptIds[index], { marks: [{ questionId: "q1", marks: 2, feedback: "Marked." }, { questionId: "q3", marks: 2, feedback: "Marked." }], note: "Moderated." }));
  }
  const listed = await as(author, () => listRemedies(author, examId, "q3"));
  assert.deepEqual(listed.scripts.map(script => [script.answer, script.marks, script.maximum]), [["Combine both groups, then count all of them.", 2, 3], ["I count them.", 2, 3]]);
  await assert.rejects(() => as(author, () => proposeRemedy(author, examId, { type: "REGRADE", questionId: "q3", reason: "Second marker review." })), { status: 422 });
  await assert.rejects(() => as(author, () => proposeRemedy(author, examId, { type: "REGRADE", questionId: "q3", reason: "Second marker review.", marks: { [attemptIds[0]]: 4 } })), { status: 422 });
  await assert.rejects(() => as(author, () => proposeRemedy(author, examId, { type: "REGRADE", questionId: "q3", reason: "Second marker review.", marks: { [randomUUID()]: 1 } })), { status: 422 });
  await assert.rejects(() => as(author, () => proposeRemedy(author, examId, { type: "RUBRIC_CORRECTION", questionId: "q3", reason: "Rubric fixed.", marks: { [attemptIds[1]]: 1 } })), { status: 422 });
});

test("a rubric correction re-marks only the named scripts and applies through result revisions on authorization", async () => {
  const remedy = await as(author, () => proposeRemedy(author, examId, { type: "RUBRIC_CORRECTION", questionId: "q3", reason: "Rubric demanded a named counting step.", rubricChange: "Criterion now requires naming the counting step for full marks.", marks: { [attemptIds[0]]: 3, [attemptIds[1]]: 1 } }));
  assert.deepEqual(remedy.rows.map(row => [row.previous, row.proposed, row.previousTotal, row.proposedTotal]), [[2, 3, 4, 5], [2, 1, 4, 3]]);
  const stored = await raw.schoolAiExamRemedy.findUniqueOrThrow({ where: { id: remedy.id } });
  assert.deepEqual(stored.correction, { rubricChange: "Criterion now requires naming the counting step for full marks." });
  await assert.rejects(() => as(author, () => applyRemedy(author, examId, remedy.id)), (error: { status?: number }) => error.status === 403);
  const applied = await as(lead, () => applyRemedy(lead, examId, remedy.id));
  assert.deepEqual(applied.outcomes.map(row => row.outcome), ["APPLIED", "APPLIED"]);
  const revisions = await raw.schoolAiExamResultRevision.findMany({ where: { assignmentId: examId, version: 2 }, orderBy: { createdAt: "asc" } });
  assert.ok(revisions.every(row => row.reason.startsWith("Rubric correction (remedy")));
  const regrade = await as(author, () => proposeRemedy(author, examId, { type: "REGRADE", questionId: "q1", reason: "Second marker agreed with the first.", marks: { [attemptIds[0]]: 2 } }));
  const unchanged = await as(lead, () => applyRemedy(lead, examId, regrade.id));
  assert.deepEqual(unchanged.outcomes.map(row => row.outcome), ["UNCHANGED", "UNCHANGED"], "a re-mark that changes nothing writes no new version");
});
