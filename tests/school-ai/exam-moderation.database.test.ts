import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { appealExamResult, getExamResults, regradeExamAttempt } from "../../src/lib/school-ai/exam-results";
import { createModerationSample, decideResultCorrection, moderationOverview, proposeResultCorrection, resolveSampleItem, submitSecondMark } from "../../src/lib/school-ai/exam-moderation-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-424: released results change only through a correction approved by a different reviewer; one
// correction can be pending per result version and a stale one is superseded, never applied; rejected
// corrections keep their evidence; appeals carry disputed questions; moderation samples exclude the
// reviewer's own scripts, hide originals in blind mode and flag differences above the threshold for a
// lead (never the second marker) to decide.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `moderation-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const marker = actor("CAMPUS_ADMIN"), lead = actor("PRINCIPAL"), moderator = actor("CAMPUS_ADMIN");
const learners = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), user: actor("STUDENT"), i }));
const now = new Date("2026-10-12T10:00:00Z");
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, work);
const review = (q1: number, q3 = 2) => ({ note: "Evidence checked", marks: [{ questionId: "q1", marks: q1, feedback: q1 ? "Correct" : "Incorrect" }, { questionId: "q3", marks: q3, feedback: "Method reviewed", evidence: [{ criterionId: "r2", quote: "combine", marks: q3 }] }] });
let examId: string;
const attempts: string[] = [];

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic moderation school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic", regId: campusId, city: "Synthetic" } });
  for (const user of [marker, lead, moderator, ...learners.map((l) => l.user)]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Moderation class", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Math" } });
  for (const l of learners) await raw.student.create({ data: { id: l.id, schoolId, campusId, classId, studentUserId: l.user.userId, fullName: `Synthetic Learner ${l.i + 1}`, rollNo: `MD-${l.i + 1}`, gender: "OTHER", status: "active" } });
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(marker, { kind: "CURRICULUM", campusId, title: "Moderation curriculum", data: data.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(marker, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(marker, { kind: "PAPER", campusId, title: "Moderation paper", data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(marker, paper.id, { version: paper.version, action: "approve" });
  const exam = await ctx(marker, () => createSchoolAiExam(marker, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Moderated check", startsAt: "2026-10-12T09:59:00Z", endsAt: "2026-10-12T11:00:00Z", studentIds: learners.map((l) => l.id), mode: "STANDARD" }, now));
  examId = exam.id;
  for (const l of learners) {
    const attempt = await ctx(l.user, () => startSchoolAiExam(l.user, examId, now));
    await ctx(l.user, () => saveSchoolAiAttempt(l.user, examId, { sequence: 1, responses: { q1: "a1", q3: "I combine the quantities." }, submit: true }, now));
    // Learner 4's script is marked by the moderator, so it can never be in the moderator's sample.
    const by = l.i === 3 ? moderator : marker;
    await ctx(by, () => reviewSchoolAiAttempt(by, examId, attempt!.id, review(2, l.i === 0 ? 0 : 2), now));
    attempts.push(attempt!.id);
  }
});
after(async () => {
  await raw.schoolAiResultCorrection.deleteMany({ where: { schoolId } });
  await raw.schoolAiModerationSample.deleteMany({ where: { schoolId } });
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

test("moderation samples skip the reviewer's own scripts, hide originals when blind and flag differences above the threshold", async () => {
  await assert.rejects(() => ctx(marker, () => createModerationSample(marker, examId, { method: "LOWEST", size: 2, threshold: 1, blind: true, reviewerId: learners[0].user.userId })), { status: 400 }, "a learner cannot review");
  const sample = await ctx(lead, () => createModerationSample(lead, examId, { method: "LOWEST", size: 4, threshold: 1, blind: true, reviewerId: moderator.userId }));
  const items = sample.items as { attemptId: string; originalTotal: number }[];
  assert.equal(items.length, 3, "the moderator's own script is excluded");
  assert.ok(!items.some((i) => i.attemptId === attempts[3]));
  assert.equal(items[0].attemptId, attempts[0], "LOWEST puts the lowest total first");
  const blindView = (await ctx(moderator, () => moderationOverview(moderator, examId))).samples[0].items;
  assert.ok(blindView.every((i) => i.originalTotal === null && i.originalMarkerId === null), "the reviewer marks without seeing the original");
  assert.ok((await ctx(lead, () => moderationOverview(lead, examId))).samples[0].items.every((i) => i.originalTotal !== null), "leads see the originals");
  await assert.rejects(() => ctx(lead, () => submitSecondMark(lead, sample.id, { attemptId: attempts[0], version: 1, marks: [{ questionId: "q1", marks: 2 }] })), { status: 403 });
  await assert.rejects(() => ctx(moderator, () => submitSecondMark(moderator, sample.id, { attemptId: attempts[0], version: 1, marks: [{ questionId: "q1", marks: 9 }] })), { status: 400 });
  const first = await ctx(moderator, () => submitSecondMark(moderator, sample.id, { attemptId: attempts[0], version: 1, marks: [{ questionId: "q1", marks: 2 }, { questionId: "q3", marks: 3 }], note: "Method is complete." }));
  assert.deepEqual([first.secondTotal, first.discrepancy, first.flagged], [5, 3, true]);
  const second = await ctx(moderator, () => submitSecondMark(moderator, sample.id, { attemptId: attempts[1], version: 2, marks: [{ questionId: "q1", marks: 2 }, { questionId: "q3", marks: 2 }] }));
  assert.equal(second.flagged, false);
  await assert.rejects(() => ctx(moderator, () => resolveSampleItem(moderator, sample.id, { attemptId: attempts[0], version: 3, outcome: "CONFIRM_ORIGINAL", reason: "Deciding my own discrepancy." })), { status: 403 });
  // Before release a lead's correction applies directly.
  const resolved = await ctx(lead, () => resolveSampleItem(lead, sample.id, { attemptId: attempts[0], version: 3, outcome: "PROPOSE_CORRECTION", reason: "Second marker's reading matches the rubric.", review: review(2, 3) }));
  assert.equal(resolved.outcome, "CORRECTED");
  assert.equal((await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attempts[0] } })).reviewVersion, 2);
});

test("released results change only through an independently approved correction", async () => {
  await assert.rejects(() => ctx(marker, () => proposeResultCorrection(marker, examId, { attemptId: attempts[1], version: 1, reason: "Not released yet, regrade directly.", review: review(2, 3) })), { status: 409 });
  await raw.schoolAiExamAssignment.update({ where: { id: examId }, data: { resultsReleasedAt: new Date(), resultsReleasedById: marker.userId } });
  await assert.rejects(() => ctx(marker, () => regradeExamAttempt(marker, examId, { attemptId: attempts[1], version: 1, reason: "Direct change after release", review: review(2, 3) })), { status: 409 });
  const input = { attemptId: attempts[1], version: 1, reason: "Alternative method meets criterion r2.", review: review(2, 3) };
  const proposed = await ctx(marker, () => proposeResultCorrection(marker, examId, input));
  assert.equal((await ctx(marker, () => proposeResultCorrection(marker, examId, input))).id, proposed.id, "an exact retry replays");
  await assert.rejects(() => ctx(lead, () => proposeResultCorrection(lead, examId, { ...input, review: review(0, 2) })), { status: 409 }, "a contradictory correction cannot be pending at the same time");
  assert.equal((await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attempts[1] } })).reviewVersion, 1, "a proposal does not change the published result");
  await assert.rejects(() => ctx(marker, () => decideResultCorrection(marker, examId, { correctionId: proposed.id, version: 1, decision: "APPROVE", note: "Approving my own correction." })), { status: 403 });
  const race = await Promise.allSettled([lead, moderator].map((who) => ctx(who, () => decideResultCorrection(who, examId, { correctionId: proposed.id, version: 1, decision: "APPROVE", note: "Rubric criterion r2 is met." }))));
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1, "parallel approvals have one winner");
  const revisions = await raw.schoolAiExamResultRevision.findMany({ where: { attemptId: attempts[1] }, orderBy: { version: "asc" } });
  assert.deepEqual(revisions.map((r) => (r.review as { total: number }).total), [4, 5]);
  assert.equal(revisions[1].createdById, marker.userId, "the revision records who proposed it");
  const audit = await raw.schoolAiResultCorrection.findUniqueOrThrow({ where: { id: proposed.id } });
  assert.deepEqual([audit.status, audit.previousTotal, audit.proposedTotal], ["APPROVED", 4, 5]);
  assert.ok(audit.decidedById && audit.decidedById !== marker.userId);
});

test("stale corrections are superseded, rejections keep their evidence, and appeals name the disputed questions", async () => {
  const a = await ctx(marker, () => proposeResultCorrection(marker, examId, { attemptId: attempts[2], version: 1, reason: "Partial credit for working shown.", review: review(2, 1) }));
  await ctx(lead, () => decideResultCorrection(lead, examId, { correctionId: a.id, version: 1, decision: "REJECT", note: "Working does not meet criterion r2." }));
  const rejected = await raw.schoolAiResultCorrection.findUniqueOrThrow({ where: { id: a.id } });
  assert.deepEqual([rejected.status, rejected.reason, rejected.decisionNote], ["REJECTED", "Partial credit for working shown.", "Working does not meet criterion r2."]);
  assert.equal((await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attempts[2] } })).reviewVersion, 1);

  const learner = learners[2].user;
  await assert.rejects(() => ctx(learner, () => appealExamResult(learner, examId, { version: 1, reason: "Please check question 3.", disputedQuestionIds: ["not-a-question"] })), { status: 400 });
  const appeal = await ctx(learner, () => appealExamResult(learner, examId, { version: 1, reason: "Please check question 3.", disputedQuestionIds: ["q3"], requestedOutcome: "Credit for combining the quantities." }));
  assert.deepEqual((await ctx(learner, () => appealExamResult(learner, examId, { version: 1, reason: "Please check question 3.", disputedQuestionIds: ["q3"] }))).id, appeal.id, "the same request for the same result version is one case");
  const mine = await ctx(learner, () => getExamResults(learner, examId));
  assert.deepEqual(mine.appeals[0].disputedQuestionIds, ["q3"]);
  assert.ok(!JSON.stringify(mine).includes("Working does not meet"), "internal correction notes never reach the learner");

  const fromAppeal = await ctx(marker, () => proposeResultCorrection(marker, examId, { attemptId: attempts[2], version: 1, reason: "Appeal: combining method credited.", review: review(2, 3), appealId: appeal.id, source: "APPEAL" }));
  // Another correction lands first on a different path: this one is now stale and must not apply.
  const other = await ctx(lead, () => proposeResultCorrection(lead, examId, { attemptId: attempts[3], version: 1, reason: "Unrelated script, independent change.", review: review(2, 3) }));
  await ctx(moderator, () => decideResultCorrection(moderator, examId, { correctionId: other.id, version: 1, decision: "APPROVE", note: "Checked against the rubric." }));
  await raw.schoolAiExamAttempt.update({ where: { id: attempts[2] }, data: { reviewVersion: 9 } });
  await assert.rejects(() => ctx(lead, () => decideResultCorrection(lead, examId, { correctionId: fromAppeal.id, version: 1, decision: "APPROVE", note: "Approving after the result moved." })), { status: 409 });
  assert.equal((await raw.schoolAiResultCorrection.findUniqueOrThrow({ where: { id: fromAppeal.id } })).status, "SUPERSEDED");
});
