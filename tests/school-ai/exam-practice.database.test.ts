import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { releaseResults } from "../../src/lib/school-ai/exam-release-service";
import { draftPractice, formativeComparison, learnerPractice, outcomeComparison, scheduleFormativeCheck } from "../../src/lib/school-ai/practice-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R18.4-R18.10 against the isolated database: practice from released items only, learner access after approval, and an earlier/later comparison.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `prc408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), learners = [actor("STUDENT"), actor("STUDENT"), actor("STUDENT")];
const studentIds = learners.map(() => randomUUID());
let paperId = "", earlierId = "", laterId = "";
const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);

async function sit(startOffsetMs: number, marks: [number, number], paper = () => paperId) {
  const id = (await as(author, () => createSchoolAiExam(author, { idempotencyKey: randomUUID(), paperId: paper(), title: `Synthetic check ${startOffsetMs}`, startsAt: new Date(Date.now() + startOffsetMs).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: studentIds.slice(0, 2), mode: "STANDARD" }))).id;
  for (const [index, learner] of learners.slice(0, 2).entries()) {
    await as(learner, () => startSchoolAiExam(learner, id));
    const attempt = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: id, userId: learner.userId } });
    await as(learner, () => saveSchoolAiAttempt(learner, id, { sequence: attempt.sequence + 1, responses: { q1: "a1", q3: "Combine the groups." }, submit: true }));
    await as(lead, () => reviewSchoolAiAttempt(lead, id, attempt.id, { marks: [{ questionId: "q1", marks: 2, feedback: "Correct." }, { questionId: "q3", marks: marks[index], feedback: "Marked." }], note: "Moderated." }));
  }
  return id;
}
const release = async (id: string) => { await raw.schoolAiExamAssignment.update({ where: { id }, data: { endsAt: new Date(Date.now() - 1000) } }); await as(lead, () => releaseResults(lead, id)); };

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic practice school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author, ...learners]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role} ${user.userId.slice(0, 4)}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 8", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  for (const [index, learner] of learners.entries()) await raw.student.create({ data: { id: studentIds[index], schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic learner ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Synthetic practice source", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
  paperId = (await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" })).id;
  earlierId = await sit(-120_000, [1, 0]);
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("practice comes only from a released exam, key-free, for outcomes the class found hardest", async () => {
  await assert.rejects(() => as(author, () => draftPractice(author, earlierId, {})), { status: 409 }, "unreleased results cannot feed practice");
  await release(earlierId);
  const record = await as(author, () => draftPractice(author, earlierId, {}));
  assert.equal(record.kind, "PRACTICE");
  assert.equal(record.status, "DRAFT");
  const data = record.data as { outcomeIds: string[]; items: Array<{ questionId: string }> };
  assert.deepEqual(data.outcomeIds, ["outcome-1"], "outcome-1 was below 70% for this class");
  assert.equal(data.items.length, 3);
  for (const field of ["correctOptionId", "modelAnswer", "rubric", "sourceRefs"]) assert.equal(JSON.stringify(record.data).includes(field), false, `no ${field} in practice`);
  const forged = { ...(record.data as object), items: data.items.map((item, index) => index ? item : { ...item, prompt: "Something never released" }) };
  await assert.rejects(() => updateWorkspaceRecord(author, record.id, { version: record.version, data: forged as Record<string, unknown> }), { code: "PRACTICE_ITEM_CHANGED" });
});

test("an item scheduled in a future exam is refused for practice", async () => {
  const paperRow = await raw.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: earlierId } });
  await raw.schoolAiExposureEntry.create({ data: { schoolId, campusId, itemGroupId: "q2", questionId: "q2", itemRevision: 1, paperId, paperVersion: paperRow.paperVersion, formLabel: "A", cohortIds: [classId], examDate: new Date(Date.now() + 86_400_000) } });
  await assert.rejects(() => as(author, () => draftPractice(author, earlierId, {})), { code: "PRACTICE_FUTURE_EXPOSURE" });
  await raw.schoolAiExposureEntry.deleteMany({ where: { schoolId, examDate: { gt: new Date() } } });
});

test("learners see practice only after a teacher approves it, and only for exams they sat", async () => {
  const record = (await raw.schoolAiRecord.findFirstOrThrow({ where: { schoolId, kind: "PRACTICE" } }));
  assert.deepEqual((await as(learners[0], () => learnerPractice(learners[0]))).sets, []);
  const reviewed = await updateWorkspaceRecord(author, record.id, { version: record.version, action: "review" });
  await updateWorkspaceRecord(lead, record.id, { version: reviewed.version, action: "approve" });
  const mine = await as(learners[0], () => learnerPractice(learners[0]));
  assert.equal(mine.sets.length, 1);
  assert.equal(mine.sets[0].items.length, 3);
  assert.equal(JSON.stringify(mine).includes("correctOptionId"), false);
  assert.deepEqual((await as(learners[2], () => learnerPractice(learners[2]))).sets, [], "a learner who did not sit the exam does not get its practice");
});

test("the earlier and later exams sit side by side with item and candidate counts", async () => {
  laterId = await sit(-60_000, [3, 3]);
  await release(laterId);
  const comparison = await as(author, () => outcomeComparison(author, earlierId, laterId));
  assert.deepEqual(comparison.outcomes.map(row => [row.outcomeId, row.earlier, row.later]), [["outcome-1", { percentage: 35.7, items: 3, candidates: 2 }, { percentage: 71.4, items: 3, candidates: 2 }]]);
  await assert.rejects(() => as(author, () => outcomeComparison(author, laterId, earlierId)), { status: 409 });
  assert.equal(JSON.stringify(comparison).includes("teacher"), false, "no teacher measure (R18.11)");
});

test("a formative check from approved practice travels the ordinary paper path and sits beside the exam it follows up (R18.8)", async () => {
  const practice = await raw.schoolAiRecord.findFirstOrThrow({ where: { schoolId, kind: "PRACTICE", status: "APPROVED" } });
  const draft = await as(author, () => draftPractice(author, earlierId, {}));
  await assert.rejects(() => as(author, () => scheduleFormativeCheck(author, draft.id, {})), { status: 409 }, "only approved practice is scheduled");
  const check = await as(author, () => scheduleFormativeCheck(author, practice.id, {}));
  assert.equal(check.kind, "PAPER");
  assert.equal(check.status, "DRAFT", "it starts as a draft paper, not a delivered exam");
  const data = check.data as { formativeOf: { practiceRecordId: string; sourceAssignmentIds: string[] }; questions: Array<{ id: string; correctOptionId: string | null; review?: unknown }> };
  assert.deepEqual([data.formativeOf.practiceRecordId, data.formativeOf.sourceAssignmentIds], [practice.id, [earlierId]]);
  assert.ok(data.questions.some(question => question.correctOptionId), "the check carries its keys for marking");
  assert.equal(data.questions.some(question => question.review), false, "item review starts afresh");
  // A forged link to someone else's sources is refused on save.
  await assert.rejects(() => as(author, () => updateWorkspaceRecord(author, check.id, { version: check.version, data: { ...data, formativeOf: { ...data.formativeOf, sourceAssignmentIds: [randomUUID()] } } as unknown as Record<string, unknown> })), { status: 403 });
  // The same path as any paper: review, approval, a sitting, release.
  const reviewed = await updateWorkspaceRecord(author, check.id, { version: check.version, action: "review" });
  await updateWorkspaceRecord(lead, check.id, { version: reviewed.version, action: "approve" });
  const formativeId = await sit(-30_000, [3, 2], () => check.id);
  await assert.rejects(() => as(author, () => formativeComparison(author, formativeId)), { status: 409 }, "no comparison before results are released");
  await release(formativeId);
  const comparison = await as(author, () => formativeComparison(author, formativeId));
  assert.equal(comparison.earlier.id, earlierId);
  assert.equal(comparison.later.id, formativeId);
  assert.ok(comparison.outcomes.every(row => row.earlier && row.later && row.later.candidates === 2), "both sides state their sample sizes");
  await assert.rejects(() => as(author, () => formativeComparison(author, earlierId)), { status: 409 }, "an ordinary exam is not a formative check");
});
