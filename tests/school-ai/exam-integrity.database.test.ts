import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { examProctorFixture, removeProctorFixture, proctorContext as ctx, type ProctorFixture } from "./exam-proctor-fixture";
import { recordExamIntegrityEvent, getExamIntegrity, reviewExamIntegrity } from "../../src/lib/school-ai/exam-integrity-service";
import { candidateExamBoundary } from "../../src/lib/school-ai/exam-boundary-service";
import { createSchoolAiExam, startSchoolAiExam, getSchoolAiExam, approveSchoolAiAccommodation, saveSchoolAiAttempt } from "../../src/lib/school-ai/exam-service";
import { updateExamProctorPolicy } from "../../src/lib/school-ai/exam-proctor-service";
import { PROCTOR_CONSENT_VERSION } from "../../src/lib/school-ai/exam-proctor";
import { auditHistoryScope } from "../../src/lib/audit-history";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated PG55438 only.");
const db = new PrismaClient(), schools: string[] = []; let storage = "";
before(async () => { storage = await mkdtemp(join(tmpdir(), "exam-integrity-test-")); process.env.SCHOOL_AI_STORAGE_DIR = storage; });
after(async () => { for (const school of schools) await removeProctorFixture(db, school); await rm(storage, { recursive: true, force: true }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture(options = {}) { const result = await examProctorFixture(db, { integrityDays: 2, ...options }); schools.push(result.schoolId); return result; }
const event = (f: ProctorFixture) => ({ attemptId: f.attempt!.id, clientEventId: randomUUID(), kind: "PAGE_HIDDEN", observedAt: new Date().toISOString(), details: {} });

test("observations are scoped, idempotent, immutable and cannot change answers or marks", async () => {
  const f = await fixture(), input = event(f);
  const first = await ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, input));
  assert.equal((await ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, input))).id, first.id);
  await assert.rejects(() => ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, { ...input, kind: "CAMERA_ENDED" })), { status: 409 });
  await assert.rejects(() => ctx(f.other, () => recordExamIntegrityEvent(f.other, f.assignment.id, input)), { status: 404 });
  await assert.rejects(() => ctx(f.admin, () => recordExamIntegrityEvent(f.admin, f.assignment.id, input)), { status: 403 });
  await assert.rejects(() => db.schoolAiExamIntegrityEvent.update({ where: { id: first.id }, data: { kind: "CAMERA_ENDED" } }));
  const attempt = await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: f.attempt!.id } });
  assert.deepEqual(attempt.responses, {}); assert.equal(attempt.sequence, 0); assert.equal(attempt.review, null); assert.equal(await db.mark.count({ where: { schoolId: f.schoolId } }), 0);
});
test("only current scoped staff review observations; stale reviews preserve an audit history", async () => {
  const f = await fixture(), saved = await ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, event(f)));
  await assert.rejects(() => ctx(f.learner, () => getExamIntegrity(f.learner, f.assignment.id)), { status: 403 });
  await assert.rejects(() => ctx(f.teacher, () => getExamIntegrity(f.teacher, f.assignment.id)), { status: 404 });
  const view = await ctx(f.admin, () => getExamIntegrity(f.admin, f.assignment.id)); assert.equal(view.summary.pending, 1); assert.equal(view.events[0].id, saved.id);
  for (const secret of ["responses", "correctOptionId", "modelAnswer", "scoreProposal"]) assert.equal(JSON.stringify(view).includes(secret), false);
  const input = { eventId: saved.id, version: 1, decision: "DISMISSED", reason: "Learner used an approved accessibility tool." };
  assert.equal((await ctx(f.admin, () => reviewExamIntegrity(f.admin, f.assignment.id, input))).version, 2);
  const current = await ctx(f.admin, () => getExamIntegrity(f.admin, f.assignment.id, undefined, saved.id));
  assert.equal(current.events.length, 1); assert.equal(current.events[0].version, 2); assert.equal(current.nextCursor, null);
  await assert.rejects(() => ctx(f.admin, () => getExamIntegrity(f.admin, f.assignment.id, undefined, randomUUID())), { status: 404 });
  await assert.rejects(() => ctx(f.admin, () => getExamIntegrity(f.admin, f.assignment.id, saved.id, saved.id)), { status: 400 });
  assert.equal((await ctx(f.admin, () => reviewExamIntegrity(f.admin, f.assignment.id, input))).replay, true);
  await assert.rejects(() => ctx(f.admin, () => reviewExamIntegrity(f.admin, f.assignment.id, { ...input, decision: "FOLLOW_UP", reason: "Different decision" })), { status: 409 });
  assert.equal(await db.auditLog.count({ where: { schoolId: f.schoolId, tableName: "school_ai_exam_integrity_events" } }), 1);
  const auditCopy = await db.auditLog.findFirstOrThrow({ where: { schoolId: f.schoolId, tableName: "school_ai_exam_integrity_events" } });
  assert.equal(auditCopy.campusId, f.campusId);
  await db.auditLog.createMany({ data: [
    { schoolId: f.schoolId, campusId: "another-campus", tableName: "school_ai_exam_integrity_events", recordId: randomUUID(), userId: f.admin.userId, retentionUntil: new Date(Date.now() + 86400000), newValue: { reason: "Other campus private context" } },
    { schoolId: f.schoolId, tableName: "school_ai_exam_integrity_events", recordId: randomUUID(), userId: f.admin.userId, retentionUntil: new Date(Date.now() + 86400000), newValue: { reason: "Legacy unknown campus context" } },
  ] });
  const campusHistory = await db.auditLog.findMany({ where: { ...auditHistoryScope(f.admin), tableName: "school_ai_exam_integrity_events" } });
  assert.deepEqual(campusHistory.map(row => row.id), [auditCopy.id]);
  assert.throws(() => auditHistoryScope({ ...f.admin, campusId: null }), { status: 403 });
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "ADMIN", module: "exams", canView: false } });
  await assert.rejects(() => ctx(f.admin, () => getExamIntegrity(f.admin, f.assignment.id)), { status: 403 });
});
test("observation limits and ended attempts never interfere with answer submission", async () => {
  const f = await fixture();
  await db.schoolAiExamIntegrityEvent.createMany({ data: Array.from({ length: 600 }, () => ({ id: randomUUID(), schoolId: f.schoolId, campusId: f.campusId, assignmentId: f.assignment.id, attemptId: f.attempt!.id, userId: f.learner.userId, clientEventId: randomUUID(), kind: "PAGE_HIDDEN", observedAt: new Date(), retentionUntil: new Date(Date.now() + 86400000), details: {} })) });
  await assert.rejects(() => ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, event(f))), { status: 429 });
  const seen = new Set<string>(); let cursor: string | undefined;
  for (let page = 0; page < 3; page += 1) {
    const view = await ctx(f.admin, () => getExamIntegrity(f.admin, f.assignment.id, cursor));
    assert.equal(view.summary.total, 600); assert.equal(view.events.length, 200);
    for (const row of view.events) { assert.equal(seen.has(row.id), false); seen.add(row.id); }
    if (page < 2) assert.ok(view.nextCursor); else assert.equal(view.nextCursor, null);
    cursor = view.nextCursor ?? undefined;
  }
  assert.equal(seen.size, 600);
  await assert.rejects(() => ctx(f.admin, () => getExamIntegrity(f.admin, f.assignment.id, randomUUID())), { status: 404 });
  const receipt = await ctx(f.learner, () => saveSchoolAiAttempt(f.learner, f.assignment.id, { sequence: 1, responses: { q1: "a1" }, submit: true })); assert.equal(receipt.status, "SUBMITTED");
  assert.equal(await candidateExamBoundary(f.learner), null);
  await assert.rejects(() => ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, event(f))), { status: 409 });
});
test("assigned teachers and campus principals receive only their current view and review grants", async () => {
  const f = await fixture();
  const saved = await ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, event(f)));
  await db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { createdById: f.teacher.userId } });
  const teacherView = await ctx(f.teacher, () => getExamIntegrity(f.teacher, f.assignment.id));
  assert.equal(teacherView.events[0].id, saved.id); assert.equal(teacherView.canReview, false);
  const review = { eventId: saved.id, version: 1, decision: "NOTED", reason: "Documented device interruption; answers remain unaffected." };
  await assert.rejects(() => ctx(f.teacher, () => reviewExamIntegrity(f.teacher, f.assignment.id, review)), { status: 403 });
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "TEACHER", module: "ai", canView: true, canAdd: true, canEdit: true } });
  assert.equal((await ctx(f.teacher, () => getExamIntegrity(f.teacher, f.assignment.id))).canReview, true);
  assert.equal((await ctx(f.teacher, () => reviewExamIntegrity(f.teacher, f.assignment.id, review))).version, 2);
  const principal = { ...f.admin, role: "PRINCIPAL" as const };
  await db.user.update({ where: { id: principal.userId }, data: { role: "PRINCIPAL" } });
  const principalView = await ctx(principal, () => getExamIntegrity(principal, f.assignment.id));
  assert.equal(principalView.canReview, true); assert.equal(principalView.events[0].version, 2);
  assert.equal((await ctx(principal, () => reviewExamIntegrity(principal, f.assignment.id, { ...review, version: 2, decision: "DISMISSED", reason: "Reviewed the learner's approved support arrangement." }))).version, 3);
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "PRINCIPAL", module: "exams", canView: false } });
  await assert.rejects(() => ctx(principal, () => getExamIntegrity(principal, f.assignment.id)), { status: 403 });
});
test("observation and final submission races preserve the final answers and answer timestamp", async () => {
  const f = await fixture(), beforeSubmission = new Date();
  const results = await Promise.allSettled([
    ...Array.from({ length: 3 }, () => ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, event(f)))),
    ctx(f.learner, () => saveSchoolAiAttempt(f.learner, f.assignment.id, { sequence: 1, responses: { q1: "a1" }, submit: true })),
  ]);
  assert.equal(results[3].status, "fulfilled");
  for (const result of results.slice(0, 3)) if (result.status === "rejected") assert.equal(result.reason.status, 409);
  const saved = await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: f.attempt!.id } });
  assert.equal(saved.status, "SUBMITTED"); assert.equal(saved.sequence, 1); assert.deepEqual(saved.responses, { q1: "a1" });
  assert.ok(saved.updatedAt >= beforeSubmission);
  await assert.rejects(() => ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, event(f))), { status: 409 });
  assert.equal((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: saved.id } })).updatedAt.getTime(), saved.updatedAt.getTime());
});
test("withdrawn assignment membership releases navigation and cannot strand a new eligible exam", async () => {
  const f = await fixture({ enabled: false });
  assert.ok(await candidateExamBoundary(f.learner));
  await db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { studentIds: [f.students[1].id] } });
  assert.equal(await candidateExamBoundary(f.learner), null);
  await assert.rejects(() => ctx(f.learner, () => getSchoolAiExam(f.learner, f.assignment.id)), { status: 404 });
  const assignment = await db.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } });
  const replacement = await ctx(f.admin, () => createSchoolAiExam(f.admin, { idempotencyKey: randomUUID(), paperId: assignment.paperId, title: "Eligible replacement exam", startsAt: assignment.startsAt.toISOString(), endsAt: assignment.endsAt.toISOString(), studentIds: f.students.map(student => student.id), mode: "STANDARD" }));
  const started = await ctx(f.learner, () => startSchoolAiExam(f.learner, replacement.id));
  assert.ok(started); assert.equal((await candidateExamBoundary(f.learner))?.assignmentId, replacement.id);
});
test("simultaneous starts across assignments admit one active exam; deadline releases the boundary", async () => {
  const f = await fixture({ start: false, enabled: false });
  const assignment = await db.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } });
  const second = await ctx(f.admin, () => createSchoolAiExam(f.admin, { idempotencyKey: randomUUID(), paperId: assignment.paperId, title: "Second synthetic exam", startsAt: assignment.startsAt.toISOString(), endsAt: assignment.endsAt.toISOString(), studentIds: f.students.map(s => s.id), mode: "STANDARD" }));
  const results = await Promise.allSettled([f.assignment.id, second.id].map(id => ctx(f.learner, () => startSchoolAiExam(f.learner, id))));
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  const active = await candidateExamBoundary(f.learner); assert.ok(active);
  assert.equal(await candidateExamBoundary(f.other), null);
  assert.equal(await candidateExamBoundary(f.learner, new Date(active.deadlineAt.getTime() + 1)), null);
});
test("required camera start checks happen before timer creation and approved exceptions are respected", async () => {
  const f = await fixture({ start: false });
  const current = await db.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } });
  await ctx(f.admin, () => updateExamProctorPolicy(f.admin, f.assignment.id, { version: current.version, policy: { enabled: true, camera: true, requireCamera: true, retentionDays: 1 } }));
  const info = await ctx(f.learner, () => getSchoolAiExam(f.learner, f.assignment.id)); assert.equal(info.cameraRequired, true);
  await assert.rejects(() => ctx(f.learner, () => startSchoolAiExam(f.learner, f.assignment.id, undefined, info.version)), { status: 422 });
  await assert.rejects(() => ctx(f.learner, () => startSchoolAiExam(f.learner, f.assignment.id, undefined, info.version, { cameraReady: true, consentVersion: "wrong" })), { status: 422 });
  assert.equal(await db.schoolAiExamAttempt.count({ where: { schoolId: f.schoolId } }), 0);
  const started = await ctx(f.learner, () => startSchoolAiExam(f.learner, f.assignment.id, undefined, info.version, { cameraReady: true, consentVersion: PROCTOR_CONSENT_VERSION })); assert.ok(started); assert.equal(started.status, "IN_PROGRESS");
  const exempt = await fixture({ start: false }), before = await db.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: exempt.assignment.id } });
  const policy = await ctx(exempt.admin, () => updateExamProctorPolicy(exempt.admin, exempt.assignment.id, { version: before.version, policy: { enabled: true, camera: true, requireCamera: true } }));
  await ctx(exempt.admin, () => approveSchoolAiAccommodation(exempt.admin, exempt.assignment.id, { version: policy.version, studentId: exempt.students[0].id, extraMinutes: 0, cameraExempt: true, reason: "Approved supervised accessible alternative." }));
  const exemptInfo = await ctx(exempt.learner, () => getSchoolAiExam(exempt.learner, exempt.assignment.id)); assert.equal(exemptInfo.cameraRequired, false);
  const exemptAttempt = await ctx(exempt.learner, () => startSchoolAiExam(exempt.learner, exempt.assignment.id, undefined, exemptInfo.version)); assert.ok(exemptAttempt); assert.equal(exemptAttempt.status, "IN_PROGRESS");
});
