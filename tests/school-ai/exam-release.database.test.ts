import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, getSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { getExamResults } from "../../src/lib/school-ai/exam-results";
import { recordRehearsal, releaseReadiness, releaseResults, reviewItem } from "../../src/lib/school-ai/exam-release-service";
import { contentHash, contentHashPrefix } from "../../src/lib/school-ai/release";
import { buildCandidatePaperHtml } from "../../src/lib/school-ai/paper-print";
import { paperDataSchema, type PaperData } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 flagship release path against the isolated database: item review → rehearsal → repair → sealed release → explicit result release.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `rel408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), learner = actor("STUDENT");
const learnerId = randomUUID();
let curriculumId = "", curriculumVersion = 0, paperId = "";
const ctx = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
const record = () => raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } });
const assign = () => ctx(lead, () => createSchoolAiExam(lead, { idempotencyKey: randomUUID(), paperId, title: "Synthetic sealed test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: [learnerId], mode: "STANDARD" }));
async function reviewAll(by: AuthUser, target: "READY_FOR_REVIEW" | "APPROVED") {
  for (const id of ["q1", "q2", "q3"]) {
    const current = await record();
    const question = paperDataSchema.parse(current.data).questions.find(item => item.id === id)!;
    await reviewItem(by, paperId, { version: current.version, questionId: id, target, itemRevision: question.review?.itemRevision ?? 1 });
  }
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic studio school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author, learner]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 8", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  await raw.student.create({ data: { id: learnerId, schoolId, campusId, classId, studentUserId: learner.userId, fullName: "Synthetic learner", rollNo: "1", gender: "FEMALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  curriculumId = curriculum.id; curriculumVersion = curriculum.version;
  const paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Synthetic sealed test", data: { ...fixture.paper, curriculumId, curriculumVersion } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paperId = paper.id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("items are reviewed one by one: authors mark ready, only an approver approves the stated revision", async () => {
  const start = await record();
  await assert.rejects(() => reviewItem(author, paperId, { version: start.version, questionId: "q1", target: "APPROVED", itemRevision: 1 }), { status: 403 }, "an author cannot approve");
  await reviewAll(author, "READY_FOR_REVIEW");
  const ready = await record();
  await assert.rejects(() => reviewItem(lead, paperId, { version: ready.version, questionId: "q1", target: "APPROVED", itemRevision: 7 }), { status: 409 }, "approval states the exact item revision");
  await assert.rejects(() => updateWorkspaceRecord(author, paperId, { version: ready.version, data: { ...(ready.data as object), questions: (ready.data as unknown as PaperData).questions.map(question => ({ ...question, review: { ...question.review!, state: "APPROVED" } })) } as unknown as Record<string, unknown> }), { status: 403 }, "an ordinary save cannot forge review decisions");
  await reviewAll(lead, "APPROVED");
  const readiness = await releaseReadiness(lead, paperId);
  assert.equal(readiness.counts.APPROVED, 3);
  assert.equal(JSON.stringify(readiness.preview).includes("correctOptionId"), false, "the rehearsal preview is key-free");
  assert.ok(await raw.auditLog.count({ where: { schoolId, tableName: "school_ai_studio_actions" } }) >= 6);
});

test("release waits for a clean rehearsal of the exact version; a reported defect blocks until repaired and re-reviewed", async () => {
  const draft = await record();
  await updateWorkspaceRecord(author, paperId, { version: draft.version, action: "review" });
  const inReview = await record();
  const approved = await updateWorkspaceRecord(lead, paperId, { version: inReview.version, action: "approve" });
  await assert.rejects(() => assign(), { status: 409, code: "RELEASE_REHEARSAL_MISSING" });
  await recordRehearsal(author, paperId, { version: approved.version, findings: [{ questionId: "q2", severity: "BLOCKING", detail: "Option text is ambiguous for learners." }] });
  await assert.rejects(() => assign(), { status: 409, code: "RELEASE_REHEARSAL_BLOCKING" });
  assert.equal(await raw.schoolAiExamAssignment.count({ where: { schoolId } }), 0, "nothing was released");

  // Repair: an edit creates a new draft version; the edited item needs review again.
  const current = await record();
  const data = paperDataSchema.parse(current.data);
  data.questions = data.questions.map(question => question.id === "q2" ? { ...question, prompt: "Which value equals two plus two?" } : question);
  const edited = await updateWorkspaceRecord(lead, paperId, { version: current.version, data: data as unknown as Record<string, unknown> });
  assert.equal(edited.status, "DRAFT");
  assert.equal(paperDataSchema.parse((await record()).data).questions.find(question => question.id === "q2")!.review!.state, "CHANGED_AFTER_APPROVAL", "the edited item's approval went stale");
  const q2 = paperDataSchema.parse((await record()).data).questions.find(question => question.id === "q2")!;
  const editedVersion = (await record()).version;
  await assert.rejects(() => reviewItem(author, paperId, { version: editedVersion, questionId: "q2", target: "READY_FOR_REVIEW", itemRevision: q2.review!.itemRevision }), { status: 422 }, "an edited item cannot be ready until its invalidated checks are redone");
  await assert.rejects(() => reviewItem(author, paperId, { version: editedVersion, questionId: "q2", target: "READY_FOR_REVIEW", itemRevision: q2.review!.itemRevision, confirmRechecked: ["KEY"] }), { status: 422, code: "ITEM_RECHECK_MISMATCH" }, "every invalidated check must be confirmed");
  await reviewItem(author, paperId, { version: (await record()).version, questionId: "q2", target: "READY_FOR_REVIEW", itemRevision: q2.review!.itemRevision, confirmRechecked: [...new Set(q2.review!.invalidated.map(entry => entry.artifact))] });
  await reviewItem(lead, paperId, { version: (await record()).version, questionId: "q2", target: "APPROVED", itemRevision: q2.review!.itemRevision });
  await updateWorkspaceRecord(author, paperId, { version: (await record()).version, action: "review" });
  const reapproved = await updateWorkspaceRecord(lead, paperId, { version: (await record()).version, action: "approve" });
  const rehearsal = await recordRehearsal(author, paperId, { version: reapproved.version, findings: [] });
  assert.equal(rehearsal.blocking, 0);
  assert.deepEqual((await releaseReadiness(lead, paperId)).blockers, []);
});

test("the release is sealed: one content hash for browser and print, never changed afterwards", async () => {
  const exam = await assign();
  const stored = await raw.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: exam.id } });
  const paper = paperDataSchema.parse((await record()).data);
  assert.equal(stored.contentHash, contentHash(paper));
  assert.ok(stored.rehearsalId);
  assert.match(buildCandidatePaperHtml(paper, (await record()).version, contentHashPrefix(contentHash(paper))), new RegExp(`#${contentHashPrefix(stored.contentHash!)}`), "print shows the same hash prefix");
  const metadata = await ctx(learner, () => getSchoolAiExam(learner, exam.id));
  assert.equal(metadata.contentHashPrefix, contentHashPrefix(stored.contentHash!));
  await assert.rejects(() => raw.schoolAiExamAssignment.update({ where: { id: exam.id }, data: { contentHash: "0".repeat(64) } }), /sealed exam release cannot be changed/);

  // Results stay hidden until moderation and an explicit release.
  const attempt = await ctx(learner, () => startSchoolAiExam(learner, exam.id));
  await ctx(learner, () => saveSchoolAiAttempt(learner, exam.id, { sequence: 1, responses: { q1: attempt!.paper.questions[0].options[0].id, q3: "Combine both groups and count." }, submit: true }));
  await raw.schoolAiExamAssignment.update({ where: { id: exam.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  await assert.rejects(() => releaseResults(lead, exam.id), { status: 409, code: "RESULTS_AWAITING_MODERATION" });
  const submitted = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: exam.id } });
  await ctx(lead, () => reviewSchoolAiAttempt(lead, exam.id, submitted.id, { marks: [{ questionId: "q1", marks: 2, feedback: "Correct." }, { questionId: "q3", marks: 3, feedback: "Clear method." }], note: "Moderated." }));
  assert.equal((await ctx(learner, () => getExamResults(learner, exam.id))).attempt, null, "moderated but unreleased results stay hidden");
  await assert.rejects(() => releaseResults(author, exam.id), { status: 403 });
  await releaseResults(lead, exam.id);
  assert.equal((await ctx(learner, () => getExamResults(learner, exam.id))).attempt?.id, submitted.id);
  await assert.rejects(() => raw.schoolAiExamAssignment.update({ where: { id: exam.id }, data: { resultsReleasedAt: new Date(0) } }), /result release cannot be changed/);
});

test("a legacy paper outside the workbench is still sealed by its content hash, without a rehearsal", async () => {
  const fixture = assessmentFixture(subjectId, classId);
  let legacy = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Legacy paper", data: { ...fixture.paper, curriculumId, curriculumVersion } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  legacy = await updateWorkspaceRecord(lead, legacy.id, { version: legacy.version, action: "approve" });
  const exam = await ctx(lead, () => createSchoolAiExam(lead, { idempotencyKey: randomUUID(), paperId: legacy.id, title: "Legacy", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: [learnerId], mode: "STANDARD" }));
  const stored = await raw.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: exam.id } });
  assert.equal(stored.contentHash, contentHash(paperDataSchema.parse(legacy.data)));
  assert.equal(stored.rehearsalId, null);
});
