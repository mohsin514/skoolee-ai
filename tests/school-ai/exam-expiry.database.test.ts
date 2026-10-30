import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { Database } from "../../src/lib/queue/outbox";
import { expireSchoolAiAttempts } from "../../src/lib/school-ai/exam-expiry";
import { assessmentFixture } from "./assessment-fixture";

const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only the isolated school AI fixture database on 127.0.0.1:55438/postgres.");
const db = new PrismaClient();
after(() => db.$disconnect());
const paper = assessmentFixture().paper;

async function withSchool(run: (scope: { schoolId: string; campusId: string; paperId: string }) => Promise<void>) {
  const schoolId = `expiry-${randomUUID()}`, campusId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: "Synthetic expiry school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  try {
    await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
    const record = await db.schoolAiRecord.create({ data: { schoolId, campusId, kind: "PAPER", title: "Synthetic immutable paper", status: "APPROVED", data: paper, createdById: "fixture", updatedById: "fixture", approvedById: "fixture", approvedAt: new Date(), idempotencyKey: randomUUID(), requestHash: "fixture" } });
    await run({ schoolId, campusId, paperId: record.id });
  } finally { await db.school.deleteMany({ where: { id: schoolId } }); }
}

async function attempt(scope: { schoolId: string; campusId: string; paperId: string }, changes: { status?: string; mode?: string; due?: boolean; age?: number; responses?: Prisma.InputJsonValue; snapshot?: Prisma.InputJsonValue } = {}) {
  const studentId = randomUUID(), userId = randomUUID();
  const deadlineAt = new Date(Date.now() + (changes.due === false ? 3600000 : -(changes.age ?? 60_000)));
  const startedAt = new Date(deadlineAt.getTime() - 30 * 60_000);
  const assignment = await db.schoolAiExamAssignment.create({ data: { ...scope, classId: "synthetic-class", paperVersion: 1, paperSnapshot: changes.snapshot ?? paper, createdById: "fixture", title: "Synthetic expiry exam", startsAt: startedAt, endsAt: deadlineAt, studentIds: [studentId], status: "ACTIVE", mode: changes.mode ?? "STANDARD" } });
  return db.schoolAiExamAttempt.create({ data: { schoolId: scope.schoolId, campusId: scope.campusId, assignmentId: assignment.id, studentId, userId, startedAt, deadlineAt, sequence: 7, responses: changes.responses ?? { q1: "a1", q3: "My saved written work" }, status: changes.status ?? "IN_PROGRESS" } });
}

test("expiry uses saved answers and immutable paper, records one content-free audit, and replays without extra effects", () => withSchool(async (scope) => {
  const original = await attempt(scope);
  // Later authoring edits cannot change the assigned paper's scoring snapshot.
  await db.schoolAiRecord.update({ where: { id: scope.paperId }, data: { status: "DRAFT", data: { ...paper, questions: [] } } });
  const result = await expireSchoolAiAttempts(db, { schoolId: scope.schoolId });
  assert.equal(result.submitted, 1, JSON.stringify(result)); assert.equal(result.invalid, 0);
  const saved = await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: original.id } });
  assert.equal(saved.status, "SUBMITTED"); assert.deepEqual(saved.responses, original.responses); assert.equal(saved.sequence, 7);
  assert.equal(saved.submittedAt?.toISOString(), original.deadlineAt.toISOString());
  assert.equal((saved.scoreProposal as { totalObjectiveMarks: number }).totalObjectiveMarks, 2);
  assert.equal((saved.scoreProposal as { pendingReviewCount: number }).pendingReviewCount, 1);
  assert.equal(saved.review, null); assert.equal(saved.reviewedAt, null);
  const audits = await db.auditLog.findMany({ where: { schoolId: scope.schoolId, recordId: saved.id } });
  assert.equal(audits.length, 1); assert.equal(audits[0].userId, "system:school-ai-expiry");
  const auditText = JSON.stringify(audits);
  for (const forbidden of ["My saved written work", "correctOptionId", "totalObjectiveMarks", original.userId, original.studentId]) assert.equal(auditText.includes(forbidden), false);
  assert.equal((await expireSchoolAiAttempts(db, { schoolId: scope.schoolId })).submitted, 0);
  assert.equal(await db.auditLog.count({ where: { schoolId: scope.schoolId, recordId: saved.id } }), 1);
}));

test("future, submitted, reviewed and unsupported exam modes remain untouched", () => withSchool(async (scope) => {
  const records = await Promise.all([attempt(scope, { due: false }), attempt(scope, { status: "SUBMITTED" }), attempt(scope, { status: "REVIEWED" }), attempt(scope, { mode: "PROCTORED" })]);
  const result = await expireSchoolAiAttempts(db, { schoolId: scope.schoolId });
  assert.equal(result.submitted, 0);
  for (const original of records) assert.deepEqual(await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: original.id } }), original);
  assert.equal(await db.auditLog.count({ where: { schoolId: scope.schoolId } }), 0);
}));

test("an operator school scope cannot process another school's attempts", () => withSchool(async (scope) => withSchool(async (other) => {
  const first = await attempt(scope), second = await attempt(other);
  assert.equal((await expireSchoolAiAttempts(db, { schoolId: scope.schoolId })).submitted, 1);
  assert.equal((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: first.id } })).status, "SUBMITTED");
  assert.equal((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: second.id } })).status, "IN_PROGRESS");
  assert.equal(await db.auditLog.count({ where: { schoolId: other.schoolId } }), 0);
  assert.equal((await expireSchoolAiAttempts(db, { schoolId: other.schoolId })).submitted, 1);
})));

test("simultaneous workers submit each attempt and audit exactly once", () => withSchool(async (scope) => {
  const records = await Promise.all(Array.from({ length: 8 }, () => attempt(scope)));
  const results = await Promise.all(Array.from({ length: 4 }, () => expireSchoolAiAttempts(db, { schoolId: scope.schoolId })));
  assert.equal(results.reduce((sum, result) => sum + result.submitted, 0), records.length);
  assert.equal(await db.schoolAiExamAttempt.count({ where: { schoolId: scope.schoolId, status: "SUBMITTED" } }), records.length);
  const audits = await db.auditLog.findMany({ where: { schoolId: scope.schoolId } });
  assert.equal(audits.length, records.length); assert.equal(new Set(audits.map((audit) => audit.recordId)).size, records.length);
}));

test("a locked autosave is skipped; the next pass scores its committed answers without reverting them", () => withSchool(async (scope) => {
  const original = await attempt(scope, { responses: { q1: "a2" } });
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM school_ai_exam_attempts WHERE id = ${original.id} FOR UPDATE`;
    assert.equal((await expireSchoolAiAttempts(db, { schoolId: scope.schoolId })).submitted, 0);
    await tx.schoolAiExamAttempt.update({ where: { id: original.id }, data: { sequence: 8, responses: { q1: "a1" } } });
  });
  assert.equal((await expireSchoolAiAttempts(db, { schoolId: scope.schoolId })).submitted, 1);
  const saved = await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: original.id } });
  assert.equal(saved.sequence, 8); assert.deepEqual(saved.responses, { q1: "a1" });
  assert.equal((saved.scoreProposal as { totalObjectiveMarks: number }).totalObjectiveMarks, 2);
}));

test("corrupt paper/answer data is not graded and cursor progress prevents starvation", () => withSchool(async (scope) => {
  const badPaper = await attempt(scope, { age: 120000, snapshot: {} });
  const badAnswers = await attempt(scope, { age: 90000, responses: { invented: "Not a question" } });
  const valid = await attempt(scope, { age: 60000 });
  const first = await expireSchoolAiAttempts(db, { schoolId: scope.schoolId, limit: 1 });
  assert.equal(first.invalid, 1); assert.equal(first.submitted, 0); assert(first.cursor);
  const second = await expireSchoolAiAttempts(db, { schoolId: scope.schoolId, limit: 1, cursor: first.cursor });
  assert.equal(second.invalid, 1); assert(second.cursor);
  const third = await expireSchoolAiAttempts(db, { schoolId: scope.schoolId, limit: 1, cursor: second.cursor });
  assert.equal(third.submitted, 1); assert.equal(third.invalid, 0);
  assert.equal((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: valid.id } })).status, "SUBMITTED");
  for (const record of [badPaper, badAnswers]) assert.equal((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: record.id } })).status, "IN_PROGRESS");
  assert.equal((await expireSchoolAiAttempts(db, { schoolId: scope.schoolId, cursor: third.cursor })).cursor, null);
  await db.schoolAiExamAssignment.update({ where: { id: badPaper.assignmentId }, data: { paperSnapshot: paper } });
  assert.equal((await expireSchoolAiAttempts(db, { schoolId: scope.schoolId })).submitted, 1);
}));

test("audit failure rolls back submission, and a retry later completes both", () => withSchool(async (scope) => {
  const original = await attempt(scope);
  const failAudit: Database = {
    $queryRaw: db.$queryRaw.bind(db), $executeRaw: db.$executeRaw.bind(db),
    $transaction: (fn) => db.$transaction((tx) => fn({
      $queryRaw: tx.$queryRaw.bind(tx),
      $executeRaw: (strings, ...values) => {
        const first = "strings" in strings ? strings.strings[0] : strings[0];
        if (first.includes("INSERT INTO audit_logs")) return Promise.reject(new Error("SYNTHETIC_AUDIT_FAILURE")) as ReturnType<typeof tx.$executeRaw>;
        return tx.$executeRaw(strings, ...values);
      },
    })),
  };
  await assert.rejects(() => expireSchoolAiAttempts(failAudit, { schoolId: scope.schoolId }), /SYNTHETIC_AUDIT_FAILURE/);
  assert.deepEqual(await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: original.id } }), original);
  assert.equal(await db.auditLog.count({ where: { schoolId: scope.schoolId } }), 0);
  assert.equal((await expireSchoolAiAttempts(db, { schoolId: scope.schoolId })).submitted, 1);
}));

test("expiry rejects malformed bounds before database discovery", async () => {
  for (const limit of [0, -1, 501, 1.5, NaN, Infinity]) await assert.rejects(() => expireSchoolAiAttempts(db, { limit }), /INVALID_EXAM_EXPIRY_LIMIT/);
  await assert.rejects(() => expireSchoolAiAttempts(db, { schoolId: "" }), /INVALID_EXAM_EXPIRY_SCHOOL/);
  await assert.rejects(() => expireSchoolAiAttempts(db, { cursor: { id: "test", deadlineAt: new Date(NaN) } }), /INVALID_EXAM_EXPIRY_CURSOR/);
});
