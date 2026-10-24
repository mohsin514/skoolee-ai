import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, startSchoolAiExam, saveSchoolAiAttempt, reviewSchoolAiAttempt, getSchoolAiExam, getSchoolAiAttempt } from "../../src/lib/school-ai/exam-service";
import { getExamGradebookOptions, previewExamGradebook, publishExamGradebook } from "../../src/lib/school-ai/exam-gradebook-service";
import type { GradebookPreview } from "../../src/lib/school-ai/exam-gradebook";
import { assessmentFixture } from "./assessment-fixture";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only isolated localhost:55438 gradebook fixtures.");
const db = new PrismaClient(), schoolId = `gradebook-ai-${randomUUID()}`;
const ctx = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, fn);
before(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic gradebook school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE" } }); });
after(async () => { await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Test" } });
  const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
  const admin = actor("CAMPUS_ADMIN"), learner = actor("STUDENT"), absent = actor("STUDENT");
  for (const user of [admin, learner, absent]) await db.user.create({ data: { id: user.userId, schoolId, campusId, role: user.role, email: user.email, fullName: "Synthetic user" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic grade", academicYear: 2026 } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Synthetic mathematics", totalMarks: 100 } });
  const students: Array<{ id: string }> = [];
  for (const [index, user] of [learner, absent].entries()) students.push(await db.student.create({ data: { schoolId, campusId, classId, studentUserId: user.userId, fullName: `Synthetic learner ${index + 1}`, rollNo: String(index + 1), gender: "OTHER", status: "active" } }));
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(admin, { kind: "CURRICULUM", title: "Synthetic curriculum", campusId, idempotencyKey: randomUUID(), data: data.curriculum });
  curriculum = await updateWorkspaceRecord(admin, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(admin, { kind: "PAPER", title: "Synthetic paper", campusId, idempotencyKey: randomUUID(), data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } });
  paper = await updateWorkspaceRecord(admin, paper.id, { version: paper.version, action: "approve" });
  const baseline = Date.now(), at = (minutes: number) => new Date(baseline - minutes * 60000);
  const assignment = await ctx(admin, () => createSchoolAiExam(admin, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Synthetic online paper", startsAt: at(5).toISOString(), endsAt: at(1).toISOString(), studentIds: students.map(item => item.id), mode: "STANDARD" }, at(6)));
  const attempt = await ctx(learner, () => startSchoolAiExam(learner, assignment.id, at(4)));
  await ctx(learner, () => saveSchoolAiAttempt(learner, assignment.id, { sequence: 1, responses: { q1: "a1", q3: "Combine quantities" }, submit: true }, at(3)));
  await ctx(admin, () => reviewSchoolAiAttempt(admin, assignment.id, attempt!.id, { note: "Synthetic human moderation", marks: [{ questionId: "q1", marks: 2, feedback: "Correct" }, { questionId: "q3", marks: 2.5, feedback: "Mostly correct" }] }, at(2)));
  const target = await db.exam.create({ data: { schoolId, campusId, classId, title: "Synthetic destination", term: "TERM_1", academicYear: 2026, status: "ACTIVE", totalMarks: 100 } });
  return { admin, learner, absent, students, campusId, classId, subjectId, paper, assignment, attempt: attempt!, target, at };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const preview = (f: Fixture) => previewExamGradebook(f.admin, f.assignment.id, f.target.id, "PROPORTIONAL_WHOLE");
const input = (p: GradebookPreview, key = randomUUID()) => ({ examId: p.exam.id, conversion: p.conversion, version: p.assignmentVersion, previewHash: p.previewHash, idempotencyKey: key });

test("reviewed publication inserts exact previewed marks, keeps non-starters unentered and replays one receipt", async () => {
  const f = await fixture(), checked = await preview(f);
  assert.deepEqual(checked.blockers, []); assert.equal(checked.rows[0].targetMark, 90); assert.equal(checked.counts.notStarted, 1);
  const receipt = await publishExamGradebook(f.admin, f.assignment.id, input(checked));
  assert.deepEqual(await publishExamGradebook(f.admin, f.assignment.id, input(checked)), receipt);
  const marks = await db.mark.findMany({ where: { examId: f.target.id } });
  assert.equal(marks.length, 1); assert.equal(marks[0].marksObtained, 90); assert.equal(marks[0].grade, "A+"); assert.equal(marks[0].isAbsent, false);
  assert.equal((await db.exam.findUniqueOrThrow({ where: { id: f.target.id } })).status, "MARKS_ENTRY");
  assert.equal(await db.reportCard.count({ where: { examId: f.target.id } }), 0);
  assert.equal(await db.auditLog.count({ where: { schoolId, tableName: "marks", recordId: marks[0].id } }), 1);
  assert.equal((await getExamGradebookOptions(f.admin, f.assignment.id)).publication?.id, receipt.id);
  for (const payload of [await ctx(f.learner, () => getSchoolAiExam(f.learner, f.assignment.id)), await ctx(f.learner, () => getSchoolAiAttempt(f.learner, f.assignment.id))]) for (const secret of ["gradebookPublication", "reviewHash", "correctOptionId", "marksObtained"]) assert(!JSON.stringify(payload).includes(secret));
});
test("no automatic rounding, unfinished attempt or still-open exam can be sent", async () => {
  const f = await fixture();
  const exact = await previewExamGradebook(f.admin, f.assignment.id, f.target.id, "EXACT"); assert(exact.blockers.includes("CONVERSION_REQUIRED"));
  await assert.rejects(() => publishExamGradebook(f.admin, f.assignment.id, input(exact)), { code: "GRADEBOOK_BLOCKED" });
  await db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { endsAt: new Date(Date.now() + 60000) } });
  assert((await preview(f)).blockers.includes("WINDOW_OPEN"));
  await db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { endsAt: f.at(1) } });
  await ctx(f.absent, () => startSchoolAiExam(f.absent, f.assignment.id, f.at(4)));
  const pending = await preview(f); assert(pending.blockers.includes("PENDING_MODERATION"));
  await assert.rejects(() => publishExamGradebook(f.admin, f.assignment.id, input(pending)), { code: "GRADEBOOK_BLOCKED" });
  assert.equal(await db.mark.count({ where: { examId: f.target.id } }), 0);
});
test("existing marks and generated report versions remain untouched", async () => {
  const f = await fixture(), checked = await preview(f);
  const existing = await db.mark.create({ data: { schoolId, campusId: f.campusId, examId: f.target.id, studentId: f.students[0].id, subjectId: f.subjectId, marksObtained: 31, isAbsent: false, grade: "F" } });
  await assert.rejects(() => publishExamGradebook(f.admin, f.assignment.id, input(checked)), { code: "GRADEBOOK_STALE_PREVIEW" });
  assert((await preview(f)).blockers.includes("MARKS_EXIST"));
  assert.deepEqual(await db.mark.findUniqueOrThrow({ where: { id: existing.id } }), existing);
  await db.mark.delete({ where: { id: existing.id } });
  const absent = await db.mark.create({ data: { schoolId, campusId: f.campusId, examId: f.target.id, studentId: f.students[1].id, subjectId: f.subjectId, marksObtained: 0, isAbsent: true } });
  assert((await preview(f)).blockers.includes("MARKS_EXIST")); // Never describe an already-entered absence as unentered.
  assert.equal((await db.mark.findUniqueOrThrow({ where: { id: absent.id } })).isAbsent, true);
  await db.mark.delete({ where: { id: absent.id } });
  const report = await db.reportCard.create({ data: { schoolId, campusId: f.campusId, studentId: f.students[0].id, examId: f.target.id } });
  const version = await db.reportVersion.create({ data: { schoolId, reportCardId: report.id, number: 1, contentHash: "old", documentIdentity: randomUUID(), snapshot: { preserved: true }, blockers: [], changedSections: [] } });
  const blocked = await preview(f); assert(blocked.blockers.includes("REPORTS_EXIST"));
  await assert.rejects(() => publishExamGradebook(f.admin, f.assignment.id, input(blocked)), { code: "GRADEBOOK_BLOCKED" });
  assert.deepEqual(await db.reportVersion.findUniqueOrThrow({ where: { id: version.id } }), version);
});
test("live grading thresholds, destination lifecycle and assignment version invalidate old previews", async () => {
  const f = await fixture(), checked = await preview(f);
  await db.gradeWeightConfig.create({ data: { schoolId, campusId: f.campusId, classId: f.classId, academicYear: 2026, gradeAplus: 95, roundingRule: "ONE_DECIMAL" } });
  await assert.rejects(() => publishExamGradebook(f.admin, f.assignment.id, input(checked)), { code: "GRADEBOOK_STALE_PREVIEW" });
  const updated = await preview(f); assert.equal(updated.rows[0].grade, "A"); assert.equal(updated.resultRoundingRule, "ONE_DECIMAL");
  await db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { version: { increment: 1 } } });
  await assert.rejects(() => publishExamGradebook(f.admin, f.assignment.id, input(updated)), { code: "GRADEBOOK_STALE_PREVIEW" });
  await db.exam.update({ where: { id: f.target.id }, data: { status: "LOCKED", isLocked: true } });
  await assert.rejects(() => preview(f), { code: "GRADEBOOK_TARGET_LOCKED" });
  assert.equal(await db.mark.count({ where: { examId: f.target.id } }), 0);
});
test("current role, campus, subject year and permission grants guard every publication and replay", async () => {
  const f = await fixture(), checked = await preview(f);
  for (const role of ["TEACHER", "STUDENT", "PARENT"] as const) await assert.rejects(() => getExamGradebookOptions({ ...f.admin, role }, f.assignment.id), { status: 403 });
  await assert.rejects(() => previewExamGradebook({ ...f.admin, campusId: randomUUID() }, f.assignment.id, f.target.id, "EXACT"), { status: 403 });
  const principal = { ...f.admin, role: "PRINCIPAL" as const };
  await db.user.update({ where: { id: f.admin.userId }, data: { role: "PRINCIPAL" } });
  await previewExamGradebook(principal, f.assignment.id, f.target.id, "PROPORTIONAL_WHOLE");
  const grant = await db.rolePermission.create({ data: { schoolId, role: "PRINCIPAL", module: "exams", canView: true, canEdit: false } });
  try { await assert.rejects(() => publishExamGradebook(principal, f.assignment.id, input(checked)), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); }
  await db.user.update({ where: { id: f.admin.userId }, data: { role: f.admin.role } });
  await db.exam.update({ where: { id: f.target.id }, data: { academicYear: 2025 } });
  await assert.rejects(() => preview(f), { code: "GRADEBOOK_SCOPE" });
});
test("changed or corrupt moderation and moved students cannot leak into the gradebook", async () => {
  const f = await fixture(), checked = await preview(f);
  const saved = await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: f.attempt.id } });
  await db.schoolAiExamAttempt.update({ where: { id: f.attempt.id }, data: { review: { note: "Invalid", total: 1000, marks: [] } } });
  const invalid = await preview(f); assert(invalid.blockers.includes("INVALID_REVIEW"));
  await assert.rejects(() => publishExamGradebook(f.admin, f.assignment.id, input(checked)), { code: "GRADEBOOK_STALE_PREVIEW" });
  await db.schoolAiExamAttempt.update({ where: { id: f.attempt.id }, data: { review: saved.review! } });
  await db.student.update({ where: { id: f.students[0].id }, data: { archivedAt: new Date() } });
  const moved = await preview(f); assert(moved.blockers.includes("STUDENT_SCOPE_CHANGED"));
  await assert.rejects(() => publishExamGradebook(f.admin, f.assignment.id, input(moved)), { code: "GRADEBOOK_BLOCKED" });
});
test("concurrent same-assignment sends create one mark set and receipt, and cannot retarget afterward", async () => {
  const f = await fixture(), checked = await preview(f);
  const receipts = await Promise.all([publishExamGradebook(f.admin, f.assignment.id, input(checked)), publishExamGradebook(f.admin, f.assignment.id, input(checked))]);
  assert.equal(receipts[0].id, receipts[1].id); assert.equal(await db.mark.count({ where: { examId: f.target.id } }), 1);
  await assert.rejects(() => publishExamGradebook(f.admin, f.assignment.id, { ...input(checked), examId: randomUUID() }), { code: "GRADEBOOK_RECEIPT_CONFLICT" });
  await db.mark.updateMany({ where: { examId: f.target.id }, data: { marksObtained: 88 } });
  assert.equal((await getExamGradebookOptions(f.admin, f.assignment.id)).publication?.rows[0].targetMark, 90);
});
test("current active actor, access version and school operational state are checked before mutation or receipt replay", async () => {
  const f = await fixture(), checked = await preview(f);
  const actor = await db.user.findUniqueOrThrow({ where: { id: f.admin.userId } });
  const current = { ...f.admin, accessVersion: actor.accessVersion };
  await db.user.update({ where: { id: actor.id }, data: { accessVersion: { increment: 1 } } });
  await assert.rejects(() => publishExamGradebook(current, f.assignment.id, input(checked)), { code: "PERMISSION_DENIED" });
  await db.user.update({ where: { id: actor.id }, data: { accessVersion: actor.accessVersion, isActive: false } });
  await assert.rejects(() => publishExamGradebook(current, f.assignment.id, input(checked)), { code: "PERMISSION_DENIED" });
  assert.equal(await db.mark.count({ where: { examId: f.target.id } }), 0);
  await db.user.update({ where: { id: actor.id }, data: { isActive: true } });
  await publishExamGradebook(current, f.assignment.id, input(checked));
  await db.user.update({ where: { id: actor.id }, data: { isActive: false } });
  await assert.rejects(() => publishExamGradebook(current, f.assignment.id, input(checked)), { code: "PERMISSION_DENIED" });
  await db.user.update({ where: { id: actor.id }, data: { isActive: true } });
  await db.school.update({ where: { id: schoolId }, data: { status: "SUSPENDED" } });
  try { await assert.rejects(() => publishExamGradebook(current, f.assignment.id, input(checked)), { status: 402 }); }
  finally { await db.school.update({ where: { id: schoolId }, data: { status: "ACTIVE" } }); }
});
test("competing assignments cannot overwrite the same destination mark or leave a partial receipt", async () => {
  const f = await fixture();
  const second = await ctx(f.admin, () => createSchoolAiExam(f.admin, { idempotencyKey: randomUUID(), paperId: f.paper.id, title: "Second reviewed source", startsAt: f.at(5).toISOString(), endsAt: f.at(1).toISOString(), studentIds: [f.students[0].id], mode: "STANDARD" }, f.at(6)));
  const attempt = await ctx(f.learner, () => startSchoolAiExam(f.learner, second.id, f.at(4)));
  await ctx(f.learner, () => saveSchoolAiAttempt(f.learner, second.id, { sequence: 1, responses: { q1: "a1" }, submit: true }, f.at(3)));
  await ctx(f.admin, () => reviewSchoolAiAttempt(f.admin, second.id, attempt!.id, { note: "Second moderation", marks: [{ questionId: "q1", marks: 2, feedback: "Correct" }] }, f.at(2)));
  const one = await preview(f), two = await previewExamGradebook(f.admin, second.id, f.target.id, "PROPORTIONAL_WHOLE");
  const results = await Promise.allSettled([publishExamGradebook(f.admin, f.assignment.id, input(one)), publishExamGradebook(f.admin, second.id, input(two))]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.mark.count({ where: { examId: f.target.id } }), 1);
  const assignments = await db.schoolAiExamAssignment.findMany({ where: { id: { in: [f.assignment.id, second.id] } } });
  assert.equal(assignments.filter(item => item.gradebookPublication !== null).length, 1);
  assert.equal(await db.auditLog.count({ where: { schoolId, tableName: "school_ai_exam_assignments", recordId: { in: assignments.map(item => item.id) }, newValue: { path: ["action"], equals: "gradebook_publication" } } }), 1);
});
