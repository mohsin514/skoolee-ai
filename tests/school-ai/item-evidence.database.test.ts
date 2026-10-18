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
import { approveGroup, decideItem, itemEvidence, itemResponsesFor, reviewDecision } from "../../src/lib/school-ai/item-evidence-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-422: question-level evidence separates not attempted, awaiting review, not chosen and wrong
// answers; small samples get counts and a caution, not a percentage; a hypothesis must cite answers
// that lost marks; a flagged question blocks interpretation and practice; a re-review makes an
// interpretation stale; an approved group becomes draft learning actions citing each learner's attempt.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `item-evidence-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const admin = actor("CAMPUS_ADMIN");
const learners = Array.from({ length: 7 }, (_, i) => ({ id: randomUUID(), user: actor("STUDENT"), name: `Synthetic Learner ${i + 1}` }));
const now = new Date("2026-10-12T10:00:00Z");
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, work);
const review = (q1: number) => ({ note: "Evidence checked", marks: [{ questionId: "q1", marks: q1, feedback: q1 ? "Correct" : "Chose 5" }, { questionId: "q3", marks: 2, feedback: "Method reviewed", evidence: [{ criterionId: "r2", quote: "combine", marks: 2 }] }] });
let curriculumId: string, examId: string;
const attempts: Record<number, string> = {};
let paperId: string, q1Key = "";
const Q1 = () => q1Key;
const evidence = () => ctx(admin, () => itemEvidence(admin, curriculumId));
const item = async (q: string) => { const row = (await evidence()).items.find((r) => r.questionId === q)!; if (q === "q1") q1Key = row.key; return row; };

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic item evidence school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic", regId: campusId, city: "Synthetic" } });
  for (const user of [admin, ...learners.map((l) => l.user)]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Item class", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Math" } });
  for (const [i, l] of learners.entries()) await raw.student.create({ data: { id: l.id, schoolId, campusId, classId, studentUserId: l.user.userId, fullName: l.name, rollNo: `IE-${i + 1}`, gender: "OTHER", status: "active" } });
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(admin, { kind: "CURRICULUM", campusId, title: "Item evidence curriculum", data: data.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(admin, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(admin, { kind: "PAPER", campusId, title: "Item evidence paper", data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(admin, paper.id, { version: paper.version, action: "approve" });
  curriculumId = curriculum.id; paperId = paper.id;
  const exam = await ctx(admin, () => createSchoolAiExam(admin, { idempotencyKey: randomUUID(), paperId, title: "Addition check", startsAt: "2026-10-12T09:59:00Z", endsAt: "2026-10-12T11:00:00Z", studentIds: learners.map((l) => l.id), mode: "STANDARD" }, now));
  examId = exam.id;
  // Learners 1–6 submit (1–2 choose 4, 3–5 choose 5, 6 chooses 4); learner 7 never starts.
  for (const [i, l] of learners.slice(0, 6).entries()) {
    const attempt = await ctx(l.user, () => startSchoolAiExam(l.user, examId, now));
    await ctx(l.user, () => saveSchoolAiAttempt(l.user, examId, { sequence: 1, responses: { q1: i < 2 || i === 5 ? "a1" : "a2", q3: "I combine the quantities." }, submit: true }, now));
    attempts[i + 1] = attempt!.id;
  }
  // Only three are reviewed at first.
  for (const n of [1, 3, 4]) await ctx(admin, () => reviewSchoolAiAttempt(admin, examId, attempts[n], review(n === 1 ? 2 : 0), now));
});
after(async () => {
  await raw.interventionPlan.deleteMany({ where: { schoolId } });
  await raw.itemEvidenceDecision.deleteMany({ where: { schoolId } });
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

test("absent, awaiting review and unchosen alternatives are not wrong answers; a small sample has no percentage", async () => {
  const q1 = await item("q1");
  assert.equal(q1.counts.expected, 7);
  assert.equal(q1.counts.answered, 3);
  assert.deepEqual([q1.counts.CORRECT, q1.counts.INCORRECT, q1.counts.AWAITING_REVIEW, q1.counts.NOT_ATTEMPTED], [1, 2, 3, 1]);
  assert.equal(q1.percentCorrect, null);
  assert.match(q1.caution!, /Only 3 reviewed answers/);
  const q2 = await item("q2");
  assert.equal(q2.counts.NOT_CHOSEN, 3, "the alternative in an answer-one-of-two section was not chosen, not left blank");
  assert.equal(q2.counts.UNANSWERED, 0);
  assert.equal(q2.counts.answered, 0);
  for (const n of [2, 5]) await ctx(admin, () => reviewSchoolAiAttempt(admin, examId, attempts[n], review(n === 2 ? 2 : 0), now));
  const after = await item("q1");
  assert.equal(after.counts.answered, 5);
  assert.equal(after.percentCorrect, 40);
  assert.deepEqual(after.choices.map((c) => [c.label, c.count, c.correct]), [["4", 2, true], ["5", 3, false]]);
  const responses = (await ctx(admin, () => itemResponsesFor(admin, curriculumId, Q1()))).responses;
  assert.equal(responses.find((r) => r.studentId === learners[6].id)!.state, "NOT_ATTEMPTED");
  assert.equal(responses.find((r) => r.studentId === learners[5].id)!.state, "AWAITING_REVIEW");
  await assert.rejects(() => ctx(learners[0].user, () => itemEvidence(learners[0].user, curriculumId)), (e: { status?: number }) => e.status === 403 || e.status === 404);
});

test("a hypothesis cites answers that lost marks; a flagged question blocks interpretation and practice", async () => {
  const q1 = await item("q1");
  const base = { kind: "HYPOTHESIS", key: Q1(), statement: "Counting on from the larger number and overshooting by one.", reason: "Three learners chose 5 on a single-step sum.", evidenceHash: q1.evidenceHash };
  await assert.rejects(() => ctx(admin, () => decideItem(admin, curriculumId, { ...base, citedAttemptIds: [attempts[1]] })), { status: 400 }, "a full-marks answer is not evidence of a misconception");
  await assert.rejects(() => ctx(admin, () => decideItem(admin, curriculumId, { ...base, citedAttemptIds: [attempts[3]], evidenceHash: "0".repeat(64) })), { status: 409 });
  const hypothesis = await ctx(admin, () => decideItem(admin, curriculumId, { ...base, citedAttemptIds: [attempts[3], attempts[4]] }));
  const flag = await ctx(admin, () => decideItem(admin, curriculumId, { kind: "FLAG", key: Q1(), flagCategory: "AMBIGUOUS", statement: "The options sit too close to the prompt on the printed page.", reason: "Two learners asked which box to tick.", evidenceHash: q1.evidenceHash }));
  await assert.rejects(() => ctx(admin, () => decideItem(admin, curriculumId, { ...base, citedAttemptIds: [attempts[5]] })), { status: 409 });
  await assert.rejects(() => ctx(admin, () => approveGroup(admin, hypothesis.id, { version: 1, studentIds: [learners[2].id], reason: "Short counting-on practice." })), { status: 409 });
  await ctx(admin, () => reviewDecision(admin, flag.id, { action: "RESOLVE", version: 1, reason: "Moderator confirmed the layout is clear in the delivered paper." }));
  assert.equal((await item("q1")).decisions.length, 2);
});

test("a re-review makes the interpretation stale; the approved group becomes draft learning actions citing each learner's own attempt", async () => {
  const decision = (await item("q1")).decisions.find((d) => d.kind === "HYPOTHESIS")!;
  await ctx(admin, () => regradeExamAttempt(admin, examId, { attemptId: attempts[3], version: 1, reason: "Confirmed after reading the working", review: review(2) }));
  const stale = (await item("q1")).decisions.find((d) => d.id === decision.id)!;
  assert.equal(stale.stale, true);
  await assert.rejects(() => ctx(admin, () => approveGroup(admin, decision.id, { version: 1, studentIds: [learners[3].id], reason: "Short counting-on practice." })), { status: 409 });
  const reconfirmed = await ctx(admin, () => reviewDecision(admin, decision.id, { action: "RECONFIRM", version: 1, reason: "Learners 4 and 5 still chose 5 after re-review." }));
  assert.deepEqual(reconfirmed!.citedAttemptIds, [attempts[4]], "the re-reviewed answer no longer supports the hypothesis");
  await assert.rejects(() => ctx(admin, () => approveGroup(admin, decision.id, { version: 2, studentIds: [randomUUID()], reason: "Short counting-on practice." })), { status: 400 });
  const result = await ctx(admin, () => approveGroup(admin, decision.id, { version: 2, studentIds: [learners[3].id, learners[4].id], reason: "Ten minutes of counting-on with a number line." }));
  assert.equal(result.actionPlanIds.length, 2);
  assert.deepEqual(result.failed, []);
  const plans = await raw.interventionPlan.findMany({ where: { id: { in: result.actionPlanIds } } });
  assert.ok(plans.every((p) => p.status === "DRAFT"), "practice still needs a leader to activate it");
  const forLearner4 = plans.find((p) => p.studentId === learners[3].id)!;
  assert.deepEqual((forLearner4.evidenceRefs as { kind: string; refId: string }[]).map((r) => [r.kind, r.refId]), [["EXAM_ATTEMPT", attempts[4]]]);
  assert.equal((await raw.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attempts[4] } })).reviewVersion, 1, "approving practice never changes a mark");
  await assert.rejects(() => ctx(admin, () => approveGroup(admin, decision.id, { version: 3, studentIds: [learners[3].id], reason: "Approving the same group again." })), { status: 409 });
});
