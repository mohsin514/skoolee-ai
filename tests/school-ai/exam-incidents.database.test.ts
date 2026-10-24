import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { regradeExamAttempt } from "../../src/lib/school-ai/exam-results";
import { acknowledgeClarification, applyRemedy, issueClarification, listClarifications, listRemedies, proposeRemedy } from "../../src/lib/school-ai/exam-incident-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R17 against the isolated database: versioned notices to an exact audience, and remedies that are previewed, authorized and applied per candidate.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `inc408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), learners = [actor("STUDENT"), actor("STUDENT"), actor("STUDENT")];
const studentIds = learners.map(() => randomUUID());
let examId = "", attemptIds: string[] = [], sittingNotice = "";
const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic incident school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
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

test("a notice reaches exactly its audience, is acknowledged per attempt and never touches the paper", async () => {
  const before = await raw.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: examId } });
  sittingNotice = (await as(author, () => issueClarification(author, examId, { text: "Question 2: 'adding' means finding the total.", audience: { kind: "SITTING" }, questionId: "q2" }))).id;
  const targeted = await as(author, () => issueClarification(author, examId, { text: "Your extra sheet is on the desk.", audience: { kind: "ATTEMPTS", attemptIds: [attemptIds[0]] } }));
  const first = await as(learners[0], () => listClarifications(learners[0], examId)) as { notices: Array<{ id: string; question: number | null; acknowledged: boolean }> };
  const second = await as(learners[1], () => listClarifications(learners[1], examId)) as { notices: Array<{ id: string }> };
  assert.deepEqual(first.notices.map(row => [row.id, row.question]), [[sittingNotice, 2], [targeted.id, null]]);
  assert.deepEqual(second.notices.map(row => row.id), [sittingNotice], "a candidate outside the audience never receives the notice (R17.3)");
  await assert.rejects(() => as(learners[1], () => acknowledgeClarification(learners[1], examId, { acknowledge: targeted.id })), { status: 404 });
  await as(learners[0], () => acknowledgeClarification(learners[0], examId, { acknowledge: sittingNotice }));
  await as(learners[0], () => acknowledgeClarification(learners[0], examId, { acknowledge: sittingNotice }));
  const board = await as(author, () => listClarifications(author, examId)) as { notices: Array<{ id: string; acknowledged: number; audienceSize: number }> };
  assert.deepEqual(board.notices.find(row => row.id === sittingNotice), { ...board.notices.find(row => row.id === sittingNotice)!, acknowledged: 1, audienceSize: 2 });
  const after = await raw.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: examId } });
  assert.deepEqual(after.paperSnapshot, before.paperSnapshot, "the frozen paper is unchanged (R17.5)");
  assert.equal(after.endsAt.getTime(), before.endsAt.getTime(), "no timing change (R17.6)");
  await assert.rejects(() => as(learners[0], () => issueClarification(learners[0], examId, { text: "Hi", audience: { kind: "SITTING" } })), { status: 403 });
  await assert.rejects(() => as(author, () => issueClarification(author, examId, { text: "x", audience: { kind: "ATTEMPTS", attemptIds: [randomUUID()] } })), { status: 422 });
  await assert.rejects(() => raw.schoolAiExamClarification.update({ where: { id: sittingNotice }, data: { text: "Rewritten" } }), /kept as evidence/);
});

test("a revision is a new version; the candidate sees the update and the original stays on record", async () => {
  const revised = await as(lead, () => issueClarification(lead, examId, { text: "Question 2: 'adding' means finding the total of both numbers.", audience: { kind: "SITTING" }, questionId: "q2", revisesId: sittingNotice }));
  await assert.rejects(() => as(lead, () => issueClarification(lead, examId, { text: "Again", audience: { kind: "SITTING" }, revisesId: sittingNotice })), { status: 409 });
  const view = await as(learners[1], () => listClarifications(learners[1], examId)) as { notices: Array<{ id: string; revised: boolean; acknowledged: boolean }> };
  assert.deepEqual(view.notices.map(row => [row.id, row.revised, row.acknowledged]), [[revised.id, true, false]]);
  assert.equal(await raw.schoolAiExamClarification.count({ where: { assignmentId: examId } }), 3);
  assert.ok(await raw.auditLog.count({ where: { schoolId, tableName: "school_ai_exam_clarifications" } }) >= 3);
});

test("a key-correction remedy is previewed per candidate and applies only when an approver authorizes it", async () => {
  for (const [index, learner] of learners.slice(0, 2).entries()) {
    const attempt = await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attemptIds[index] } });
    await as(learner, () => saveSchoolAiAttempt(learner, examId, { sequence: attempt.sequence + 1, responses: { q1: index === 0 ? "a1" : "a2", q3: "Combine both groups." }, submit: true }));
    await as(lead, () => reviewSchoolAiAttempt(lead, examId, attemptIds[index], { marks: [{ questionId: "q1", marks: index === 0 ? 2 : 0, feedback: "Marked." }, { questionId: "q3", marks: 2, feedback: "Marked." }], note: "Moderated." }));
  }
  await assert.rejects(() => as(author, () => issueClarification(author, examId, { text: "Late", audience: { kind: "SITTING" } })), { status: 409 }, "no live attempt, no notice");
  const remedy = await as(author, () => proposeRemedy(author, examId, { type: "KEY_CORRECTION", questionId: "q1", reason: "The key marked the wrong option.", correction: { questionId: "q1", correctOptionId: "a2" } }));
  assert.deepEqual(remedy.rows.map(row => [row.previous, row.proposed, row.previousTotal, row.proposedTotal]), [[2, 0, 4, 2], [0, 2, 2, 4]]);
  assert.equal(remedy.pending, 0);
  assert.equal(await raw.schoolAiExamResultRevision.count({ where: { assignmentId: examId } }), 2, "a preview changes nothing");
  await assert.rejects(() => as(author, () => applyRemedy(author, examId, remedy.id)), (error: { status?: number }) => error.status === 403, "only an approver authorizes (R17.9)");
  const applied = await as(lead, () => applyRemedy(lead, examId, remedy.id));
  assert.deepEqual(applied.outcomes.map(row => [row.outcome, row.version]), [["APPLIED", 2], ["APPLIED", 2]]);
  const revisions = await raw.schoolAiExamResultRevision.findMany({ where: { assignmentId: examId, version: 2 } });
  assert.equal(revisions.length, 2);
  assert.ok(revisions.every(row => row.reason.includes(remedy.id)), "each new result version names the applied proposal (R17.11)");
  await assert.rejects(() => as(lead, () => applyRemedy(lead, examId, remedy.id)), { status: 409 });
  await assert.rejects(() => raw.schoolAiExamRemedy.update({ where: { id: remedy.id }, data: { reason: "Rewritten" } }), /cannot change/);
});

test("a result that changed after the preview is skipped and named, the rest still apply", async () => {
  const remedy = await as(author, () => proposeRemedy(author, examId, { type: "ITEM_NEUTRALIZATION", questionId: "q3", reason: "Question 3 was ambiguous for every candidate.", notify: false }));
  assert.deepEqual(remedy.rows.map(row => row.proposed), [3, 3]);
  const current = await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attemptIds[0] } });
  const review = current.review as { marks: Array<{ questionId: string; marks: number; feedback: string }>; note: string; keyCorrections?: unknown[] };
  await as(lead, () => regradeExamAttempt(lead, examId, { attemptId: attemptIds[0], version: current.reviewVersion, reason: "Moderator correction.", review: { marks: review.marks, note: "Re-moderated.", ...(review.keyCorrections ? { keyCorrections: review.keyCorrections as never } : {}) } }));
  const applied = await as(lead, () => applyRemedy(lead, examId, remedy.id));
  assert.deepEqual(applied.outcomes.map(row => row.outcome), ["SKIPPED_CHANGED", "APPLIED"]);
  const list = await as(lead, () => listRemedies(lead, examId));
  assert.equal(list.remedies.find(row => row.id === remedy.id)?.status, "APPLIED");
  assert.equal(list.remedies.find(row => row.id === remedy.id)?.notify, false, "the notification decision is recorded");
});
