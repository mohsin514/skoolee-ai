import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { emptyAssessmentBrief } from "../../src/lib/school-ai/assessment-brief";
import { BriefRefusedError, answerBrief, getBrief } from "../../src/lib/school-ai/brief-service";
import { examImprovement } from "../../src/lib/school-ai/improve-service";
import { recordRehearsal, releaseReadiness, releaseResults, reviewItem } from "../../src/lib/school-ai/exam-release-service";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { paperDataSchema } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 Brief, Review desk evidence and Improve against the isolated database, synthetic data only.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `spc408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), outsider = actor("TEACHER"), learner = actor("STUDENT");
const learnerId = randomUUID();
let briefId = "", curriculumId = "", paperId = "", examId = "";
const ctx = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
const version = async () => (await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: briefId } })).version;

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic spaces school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author, outsider, learner]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 8", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  await raw.student.create({ data: { id: learnerId, schoolId, campusId, classId, studentUserId: learner.userId, fullName: "Synthetic learner", rollNo: "1", gender: "FEMALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  const curriculumData = { ...fixture.curriculum, outcomes: [...fixture.curriculum.outcomes, { id: "outcome-2", title: "Divide fractions", sourceId: "source-1", sourcePage: "2", included: false, taught: false }],
    sectionCoverage: [{ section: "unit-3", outcomeIds: ["outcome-1"], taughtOn: "2026-09-01", confirmed: true }] };
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: curriculumData, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  curriculumId = curriculum.id;
  briefId = (await createWorkspaceRecord(author, { kind: "BRIEF", campusId, title: "Synthetic brief", data: emptyAssessmentBrief({ subjectId, classId }) as unknown as Record<string, unknown>, idempotencyKey: randomUUID() })).id;
  paperId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Synthetic unit test", data: { ...fixture.paper, curriculumId, curriculumVersion: curriculum.version, coverageSection: "unit-3" } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() })).id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("the brief asks one decision at a time and saves each answer as a new immutable version", async () => {
  const first = await getBrief(author, briefId);
  assert.equal(first.next, "subject");
  const subject = await answerBrief(author, briefId, { op: "confirm", version: first.record.version, key: "subject", value: subjectId });
  assert.equal(subject.next, "class");
  assert.equal(subject.brief.decisions.subject.classification, "CONFIRMED_FACT");
  assert.equal(subject.record.version, first.record.version + 1);
  const revisions = await raw.schoolAiRevision.findMany({ where: { recordId: briefId }, orderBy: { version: "asc" } });
  assert.deepEqual(revisions.map(row => row.version), [1, 2]);
  assert.equal((revisions[0].data as { decisions: { subject: { classification: string } } }).decisions.subject.classification, "OPEN_DECISION", "the previous revision is preserved unchanged (R3.13)");
  await assert.rejects(() => answerBrief(author, briefId, { op: "confirm", version: first.record.version, key: "class", value: classId }), { status: 409 }, "a stale version is refused");
  const current = await version();
  await assert.rejects(() => answerBrief(outsider, briefId, { op: "confirm", version: current, key: "class", value: classId }), (error: { status?: number }) => error.status === 403 || error.status === 404, "a teacher outside the subject cannot answer");
  assert.ok(await raw.auditLog.count({ where: { schoolId, tableName: "school_ai_studio_actions", recordId: briefId } }) >= 1);
});

test("a failed bound states the bound and keeps the entered text; skipping keeps the decision open", async () => {
  await answerBrief(author, briefId, { op: "confirm", version: await version(), key: "class", value: classId });
  const before = await version();
  // Coverage first, then the shape of the paper.
  await assert.rejects(() => answerBrief(author, briefId, { op: "confirm", version: before, key: "taughtCoverage", value: { section: "unit-3", outcomeIds: ["outcome-1", "outcome-2"] } }),
    (error: unknown) => error instanceof BriefRefusedError && /not recorded as taught in section unit-3: outcome-2/.test(error.message) && error.view.brief.decisions.taughtCoverage.classification === "OPEN_DECISION" && (error.view.brief.decisions.taughtCoverage as { lastEnteredText?: string }).lastEnteredText!.includes("outcome-2"));
  assert.equal(await version(), before, "a refused answer writes nothing");
  const suggested = await answerBrief(author, briefId, { op: "suggest-coverage", version: before, curriculumId, section: "unit-3" });
  const suggestion = suggested.brief.decisions.taughtCoverage;
  assert.equal(suggestion.classification, "EXTRACTED_SUGGESTION");
  assert.equal(suggestion.classification === "EXTRACTED_SUGGESTION" && suggestion.sourceId, curriculumId, "the suggestion names its source record (R3.4)");
  assert.equal(suggested.readiness.awaitingAcceptance.includes("taughtCoverage"), true, "a suggestion still blocks until accepted");
  const accepted = await answerBrief(author, briefId, { op: "accept", version: suggested.record.version, key: "taughtCoverage" });
  assert.equal(accepted.brief.decisions.taughtCoverage.classification, "CONFIRMED_FACT");
  assert.equal(accepted.brief.history.at(-1)?.event, "ACCEPTED_SUGGESTION");
  await assert.rejects(() => answerBrief(author, briefId, { op: "confirm", version: accepted.record.version, key: "durationMinutes", value: "ninety" }),
    (error: unknown) => error instanceof BriefRefusedError && error.status === 422 && /between 1 and 480/.test(error.message) && (error.view.brief.decisions.durationMinutes as { lastEnteredText?: string }).lastEnteredText === "ninety");
  const skipped = await answerBrief(author, briefId, { op: "skip", version: accepted.record.version, key: "durationMinutes" });
  assert.equal(skipped.next, "totalMarks", "skipping moves on");
  assert.deepEqual(skipped.readiness.skipped, ["durationMinutes"]);
  assert.equal(skipped.readiness.ready, false);
  const resumed = await getBrief(author, briefId);
  assert.equal(resumed.resume, "durationMinutes", "a returning author resumes at the first open decision (R3.10)");
});

test("the evidence drawer carries sources, outcomes, review history with names, and keys only for key holders", async () => {
  for (const id of ["q1", "q2", "q3"]) {
    const row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } });
    await reviewItem(author, paperId, { version: row.version, questionId: id, target: "READY_FOR_REVIEW", itemRevision: paperDataSchema.parse(row.data).questions.find(item => item.id === id)!.review?.itemRevision ?? 1 });
  }
  const view = await releaseReadiness(author, paperId);
  const q1 = view.items.find(item => item.id === "q1")!;
  assert.deepEqual(q1.outcomes, [{ id: "outcome-1", title: "Add whole numbers" }]);
  assert.equal(q1.sources[0].title, "Synthetic mathematics syllabus");
  assert.equal(q1.reviewHistory.at(-1)?.name, "Synthetic TEACHER");
  assert.equal(view.canReadKey, true, "an author holds the protected key");
  assert.deepEqual(q1.key?.correct, ["4"]);
  assert.equal(view.generation.kind, "MANUAL");
});

test("improvement states the evidence base; a learner sees their own feedback only after release", async () => {
  for (const id of ["q1", "q2", "q3"]) {
    const row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } });
    await reviewItem(lead, paperId, { version: row.version, questionId: id, target: "APPROVED", itemRevision: paperDataSchema.parse(row.data).questions.find(item => item.id === id)!.review!.itemRevision });
  }
  let row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } });
  await updateWorkspaceRecord(author, paperId, { version: row.version, action: "review" });
  row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } });
  const approved = await updateWorkspaceRecord(lead, paperId, { version: row.version, action: "approve" });
  await recordRehearsal(author, paperId, { version: approved.version, findings: [] });
  examId = (await ctx(lead, () => createSchoolAiExam(lead, { idempotencyKey: randomUUID(), paperId, title: "Synthetic unit test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: [learnerId], mode: "STANDARD" }))).id;
  const attempt = await ctx(learner, () => startSchoolAiExam(learner, examId));
  await ctx(learner, () => saveSchoolAiAttempt(learner, examId, { sequence: 1, responses: { q1: attempt!.paper.questions[0].options[0].id, q3: "Combine both groups and count." }, submit: true }));
  const submitted = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: examId } });
  await ctx(lead, () => reviewSchoolAiAttempt(lead, examId, submitted.id, { marks: [{ questionId: "q1", marks: 2, feedback: "Correct sum." }, { questionId: "q3", marks: 1, feedback: "Name the counting step." }], note: "Moderated." }));

  const staff = await ctx(lead, () => examImprovement(lead, examId));
  assert.equal(staff.role, "STAFF");
  if (staff.role !== "STAFF") return;
  assert.deepEqual(staff.counts, { assigned: 1, absent: 0, inProgress: 0, unmarked: 0, reviewed: 1 });
  assert.equal(staff.items[0].reading, "INSUFFICIENT_EVIDENCE", "one response is too few to read");
  assert.equal(staff.learners[0].feedback[0].status, "PARTIAL");
  assert.equal(JSON.stringify(staff).includes("teaching") || JSON.stringify(staff).includes("averageReviewHours"), false, "no teacher metric (R18.11)");

  const hidden = await ctx(learner, () => examImprovement(learner, examId));
  assert.deepEqual(hidden, { role: "LEARNER", released: false, feedback: null, note: null }, "nothing before the release (R18.12)");
  await raw.schoolAiExamAssignment.update({ where: { id: examId }, data: { endsAt: new Date(Date.now() - 1000) } });
  await ctx(lead, () => releaseResults(lead, examId));
  const shown = await ctx(learner, () => examImprovement(learner, examId));
  assert.equal(shown.role, "LEARNER");
  if (shown.role !== "LEARNER") return;
  assert.equal(shown.released, true);
  assert.deepEqual(shown.feedback?.[0].evidence.map(entry => entry.feedback), ["Correct sum.", null, "Name the counting step."]);
  assert.equal(JSON.stringify(shown).includes("modelAnswer"), false);
});
