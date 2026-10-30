import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { draftPractice } from "../../src/lib/school-ai/practice-service";
import { answerPractice, finishPractice, myPractice, pausePractice, practiceProgress, rescheduleRevisit, startPractice, takeHint, teacherRevisit } from "../../src/lib/school-ai/practice-session-service";
import { hintLadder, nextRevisit, progressLabel, sessionSummary } from "../../src/lib/school-ai/practice-session";
import { assessmentFixture } from "./assessment-fixture";

// SKO-426: learners practise only an approved set from exams they sat; hints are progressive and make
// the answer assisted; keys and worked examples stay on the server until an answer is given; pausing
// keeps accepted work; finishing sets a bounded, explained revisit; nothing touches formal results.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `practice-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), otherClassId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const lead = actor("CAMPUS_ADMIN"), learner = actor("STUDENT"), outsider = actor("STUDENT");
const learnerId = randomUUID(), outsiderId = randomUUID();
const now = new Date("2026-10-12T10:00:00Z");
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, work);
let practiceId: string, examId: string, attemptId: string;

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic practice school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, learner, outsider]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Practice class", academicYear: 2026 } });
  await raw.class.create({ data: { id: otherClassId, schoolId, campusId, name: "Other class", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Math" } });
  await raw.student.create({ data: { id: learnerId, schoolId, campusId, classId, studentUserId: learner.userId, fullName: "Synthetic Practice Learner", rollNo: "PR-1", gender: "OTHER", status: "active" } });
  await raw.student.create({ data: { id: outsiderId, schoolId, campusId, classId: otherClassId, studentUserId: outsider.userId, fullName: "Synthetic Other Learner", rollNo: "PR-2", gender: "OTHER", status: "active" } });
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Practice curriculum", data: data.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(lead, { kind: "PAPER", campusId, title: "Practice source paper", data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  const exam = await ctx(lead, () => createSchoolAiExam(lead, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Source exam", startsAt: "2026-10-12T09:59:00Z", endsAt: "2026-10-12T11:00:00Z", studentIds: [learnerId], mode: "STANDARD" }, now));
  examId = exam.id;
  const attempt = await ctx(learner, () => startSchoolAiExam(learner, examId, now));
  attemptId = attempt!.id;
  await ctx(learner, () => saveSchoolAiAttempt(learner, examId, { sequence: 1, responses: { q1: "a2", q3: "I add them." }, submit: true }, now));
  await ctx(lead, () => reviewSchoolAiAttempt(lead, examId, attemptId, { note: "Checked", marks: [{ questionId: "q1", marks: 0, feedback: "Chose 5" }, { questionId: "q3", marks: 1, feedback: "Partly", evidence: [{ criterionId: "r2", quote: "add", marks: 1 }] }] }, now));
  await raw.schoolAiExamAssignment.update({ where: { id: examId }, data: { resultsReleasedAt: new Date(), resultsReleasedById: lead.userId, endsAt: new Date(Date.now() - 60_000) } });
  const draft = await ctx(lead, () => draftPractice(lead, examId, {}));
  // The teacher adds a hint for q1 before approving.
  const record = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: draft.id } });
  const set = record.data as { items: Array<{ questionId: string; hints?: string[] }> };
  set.items = set.items.map((item) => (item.questionId === "q1" ? { ...item, hints: ["Count on from 2, two more steps."] } : item));
  const saved = await updateWorkspaceRecord(lead, draft.id, { version: draft.version, action: "save", data: set });
  const approved = await updateWorkspaceRecord(lead, draft.id, { version: saved.version, action: "approve" });
  practiceId = approved.id;
});
after(async () => {
  await raw.practiceSession.deleteMany({ where: { schoolId } });
  await raw.practiceRevisit.deleteMany({ where: { schoolId } });
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

test("the rules: hint ladder, separate independent and assisted results, bounded revisits, cautious wording", () => {
  assert.deepEqual(hintLadder(["Own hint"]).length, 3);
  assert.equal(hintLadder(["Own hint"])[0], "Own hint");
  const s = sessionSummary([{ correct: true, assisted: true }, { correct: true, assisted: false }, { correct: null, assisted: false }]);
  assert.deepEqual([s.independentCorrect, s.independentTotal, s.assistedCorrect, s.assistedTotal, s.checked], [1, 1, 1, 1, 2]);
  assert.equal(nextRevisit(s, 0, now)!.days, 2, "assisted success is not enough for a long gap");
  const strong = sessionSummary([{ correct: true, assisted: false }]);
  assert.equal(nextRevisit(strong, 0, now)!.days, 7);
  assert.equal(nextRevisit(strong, 1, now)!.days, 14);
  assert.equal(nextRevisit(strong, 3, now), null, "revisits are bounded");
  assert.equal(progressLabel([{ completedAt: now, summary: strong }], now), "BUILDING", "one good session is not secure");
  assert.equal(progressLabel([{ completedAt: now, summary: strong }, { completedAt: new Date(now.getTime() + 86_400_000 * 3), summary: strong }], new Date(now.getTime() + 86_400_000 * 3)), "SECURE_FOR_NOW");
});

test("only the approved set for the learner's class is delivered, and keys stay on the server", async () => {
  await assert.rejects(() => ctx(outsider, () => startPractice(outsider, { practiceRecordId: practiceId })), { status: 404 });
  await assert.rejects(() => ctx(lead, () => startPractice(lead, { practiceRecordId: practiceId })), { status: 403 });
  const session = await ctx(learner, () => startPractice(learner, { practiceRecordId: practiceId }));
  assert.ok(session.items.length >= 1);
  const text = JSON.stringify(session);
  assert.ok(!text.includes("correctOptionId") && !text.includes("Four."), "no key or worked example before an answer");
  assert.ok(session.expectedMinutes >= 5 && session.expectedMinutes <= 20);
});

test("hints are progressive and make the answer assisted; pausing keeps work; finishing sets an explained revisit", async () => {
  let session = await ctx(learner, () => startPractice(learner, { practiceRecordId: practiceId }));
  const q1 = session.items.find((i) => i.key.endsWith(":q1"))!;
  session = await ctx(learner, () => takeHint(learner, session.id, { itemKey: q1.key }));
  assert.deepEqual(session.items.find((i) => i.key === q1.key)!.hints, [{ text: "Count on from 2, two more steps.", generic: false }]);
  session = await ctx(learner, () => takeHint(learner, session.id, { itemKey: q1.key }));
  assert.equal(session.items.find((i) => i.key === q1.key)!.hints[1].generic, true, "after the teacher hint comes a generic, non-revealing one");
  session = await ctx(learner, () => answerPractice(learner, session.id, { itemKey: q1.key, answer: "a1", confidence: 2 }));
  const answered = session.items.find((i) => i.key === q1.key)!;
  assert.deepEqual([answered.correct, answered.assisted, answered.workedExample], [true, true, "Four."], "correct with hints is assisted, and the worked example appears after answering");
  await assert.rejects(() => ctx(learner, () => answerPractice(learner, session.id, { itemKey: q1.key, answer: "a2" })), { status: 409 });
  await assert.rejects(() => ctx(learner, () => takeHint(learner, session.id, { itemKey: q1.key })), { status: 409 });

  await ctx(learner, () => pausePractice(learner, session.id));
  await assert.rejects(() => ctx(learner, () => answerPractice(learner, session.id, { itemKey: q1.key, answer: "a1" })), { status: 409 });
  const resumed = await ctx(learner, () => startPractice(learner, { practiceRecordId: practiceId }));
  assert.equal(resumed.id, session.id, "the same session (same approved version) resumes");
  assert.equal(resumed.items.find((i) => i.key === q1.key)!.answer, "a1", "accepted work is kept");

  const finished = await ctx(learner, () => finishPractice(learner, session.id));
  assert.equal(finished.status, "COMPLETED");
  assert.deepEqual([(finished.summary as { independentCorrect: number }).independentCorrect, (finished.summary as { assistedCorrect: number }).assistedCorrect], [0, 1]);
  assert.match(finished.next!.reason, /needed hints/);
  const mine = await ctx(learner, () => myPractice(learner));
  const set = mine.sets.find((s) => s.practiceRecordId === practiceId)!;
  assert.equal(set.progress, "BUILDING");
  assert.ok(set.revisit);
  // The formal exam result is untouched by practice.
  const attempt = await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  assert.equal((attempt.review as { total: number }).total, 1);
  assert.equal(attempt.reviewVersion, 1);
});

test("learners move a revisit only a little; teachers can set or cancel with a reason and see assisted and independent apart", async () => {
  const set = (await ctx(learner, () => myPractice(learner))).sets.find((s) => s.practiceRecordId === practiceId)!;
  const due = new Date(`${set.revisit!.originalDueOn}T00:00:00Z`);
  const far = new Date(due.getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
  await assert.rejects(() => ctx(learner, () => rescheduleRevisit(learner, { revisitId: set.revisit!.id, dueOn: far })), { status: 400 });
  const near = new Date(due.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  assert.equal((await ctx(learner, () => rescheduleRevisit(learner, { revisitId: set.revisit!.id, dueOn: near }))).dueOn, near);
  await assert.rejects(() => ctx(learner, () => practiceProgress(learner, practiceId)), { status: 403 });
  const progress = await ctx(lead, () => practiceProgress(lead, practiceId));
  const row = progress.learners.find((l) => l.studentId === learnerId)!;
  assert.deepEqual([row.sessions, row.latest!.assistedCorrect, row.latest!.independentCorrect, row.revisit!.dueOn], [1, 1, 0, near]);
  await ctx(lead, () => teacherRevisit(lead, { practiceRecordId: practiceId, studentId: learnerId, action: "SET", dueOn: "2026-11-02", reason: "After the class visit on Friday." }));
  const revisit = await raw.practiceRevisit.findFirstOrThrow({ where: { schoolId, studentId: learnerId, status: "SCHEDULED" } });
  assert.deepEqual([revisit.source, revisit.dueOn.toISOString().slice(0, 10)], ["TEACHER", "2026-11-02"]);
  assert.equal((revisit.history as unknown[]).length >= 3, true, "rule, learner and teacher changes are all kept");
  await ctx(lead, () => teacherRevisit(lead, { practiceRecordId: practiceId, studentId: learnerId, action: "CANCEL", reason: "Covered in the lesson instead." }));
  assert.equal(await raw.practiceRevisit.count({ where: { schoolId, studentId: learnerId, status: "SCHEDULED" } }), 0);
  assert.equal(await raw.practiceSession.count({ where: { schoolId, studentId: learnerId, status: "COMPLETED" } }), 1, "earlier work is never removed");
});
