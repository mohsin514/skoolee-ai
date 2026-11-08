import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { refreshVersion, versionTransaction } from "../../src/lib/academic/report-versions";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { decideAssessmentRepair, listAssessmentRepairs, previewAssessmentRepair, proposeAssessmentRepair, resumeAssessmentRepair, acknowledgeRepairedLearningAction } from "../../src/lib/school-ai/assessment-repair";
import { assessmentFixture } from "./assessment-fixture";

// SKO-472 on the isolated database: a released objective key is repaired through the existing owners.
// Impact comes from stored records; a different leader approves; results, marks, a report successor,
// stale learning actions and family notices follow exactly once; a changed source makes the preview
// stale with nothing written; an interrupted repair resumes only its unfinished steps.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `repair-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID(), legacyExamId = randomUUID();
const actor = (role: AuthUser["role"], campus = campusId): AuthUser => ({ userId: randomUUID(), schoolId, campusId: campus, role, email: `${randomUUID()}@example.invalid` });
const marker = actor("CAMPUS_ADMIN"), lead = actor("PRINCIPAL"), outsider = actor("PRINCIPAL", otherCampusId), guardian = actor("PARENT");
// Learners 1 and 4 chose a1 (the original key), learners 2 and 3 chose a2.
const learners = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), user: actor("STUDENT"), i, choice: i === 0 || i === 3 ? "a1" : "a2" }));
const now = new Date("2026-10-12T10:00:00Z");
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, work);
let examId = "", stalePlanId = "", unrelatedPlanId = "", reportId = "", publishedVersionId = "";
const attempts: string[] = [], markIds: string[] = [];

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic repair school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campusId, otherCampusId]) await raw.campus.create({ data: { id, schoolId, name: id === campusId ? "Repair campus" : "Other campus", regId: id, city: "Synthetic" } });
  for (const user of [marker, lead, outsider, guardian, ...learners.map(l => l.user)]) await raw.user.create({ data: { id: user.userId, schoolId, campusId: user.campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true, isActive: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Repair class", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Math", totalMarks: 5 } });
  for (const l of learners) await raw.student.create({ data: { id: l.id, schoolId, campusId, classId, studentUserId: l.user.userId, fullName: `Synthetic Learner ${l.i + 1}`, rollNo: `RP-${l.i + 1}`, gender: "OTHER", status: "active", enrollmentDate: new Date("2026-01-01Z") } });
  const relationship = await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId: learners[0].id, guardianUserId: guardian.userId, createdByUserId: marker.userId, fullName: "Synthetic Guardian", email: guardian.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date("2026-01-01Z") } });
  await raw.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: marker.userId, reason: "Synthetic", effectiveFrom: new Date("2026-01-01Z"), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(marker, { kind: "CURRICULUM", campusId, title: "Repair curriculum", data: data.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(marker, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(marker, { kind: "PAPER", campusId, title: "Repair paper", data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(marker, paper.id, { version: paper.version, action: "approve" });
  const exam = await ctx(marker, () => createSchoolAiExam(marker, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Repair check", startsAt: "2026-10-12T09:59:00Z", endsAt: "2026-10-12T11:00:00Z", studentIds: learners.map(l => l.id), mode: "STANDARD" }, now));
  examId = exam.id;
  for (const l of learners) {
    const attempt = await ctx(l.user, () => startSchoolAiExam(l.user, examId, now));
    await ctx(l.user, () => saveSchoolAiAttempt(l.user, examId, { sequence: 1, responses: { q1: l.choice, q3: "I combine the quantities." }, submit: true }, now));
    await ctx(marker, () => reviewSchoolAiAttempt(marker, examId, attempt!.id, { note: "Evidence checked", marks: [{ questionId: "q1", marks: l.choice === "a1" ? 2 : 0, feedback: "Scored" }, { questionId: "q3", marks: 2, feedback: "Method reviewed", evidence: [{ criterionId: "r2", quote: "combine", marks: 2 }] }] }, now));
    attempts.push(attempt!.id);
  }
  // Released, and published to the gradebook (exact conversion, 5 marks) with a published report for learner 1.
  await raw.exam.create({ data: { id: legacyExamId, schoolId, campusId, classId, title: "Term test", term: "1", academicYear: 2026, status: "PUBLISHED" } });
  const rows = [];
  for (const [i, l] of learners.entries()) {
    const total = l.choice === "a1" ? 4 : 2;
    const mark = await raw.mark.create({ data: { schoolId, campusId, examId: legacyExamId, studentId: l.id, subjectId, marksObtained: total, grade: "B", enteredBy: marker.userId } });
    markIds.push(mark.id);
    rows.push({ attemptId: attempts[i], studentId: l.id, reviewedAt: now.toISOString(), reviewedById: marker.userId, reviewHash: "a".repeat(64), rawTotal: total, targetMark: total, grade: "B", markId: mark.id });
  }
  const publication = { id: randomUUID(), assignmentId: examId, assignmentVersion: 1, paperId: paper.id, paperVersion: paper.version, examId: legacyExamId, subjectId, conversion: "EXACT", previewHash: "b".repeat(64), sourceHash: "c".repeat(64), createdById: marker.userId, idempotencyKey: randomUUID(), createdAt: now.toISOString(), sourceMaximum: 5, targetMaximum: 5, academicYear: 2026, examTitle: "Term test", subjectName: "Math", rows, unenteredStudentIds: [], thresholds: { aplus: 90, a: 80, b: 70, c: 60, d: 50 }, resultRoundingRule: "WHOLE" };
  await raw.schoolAiExamAssignment.update({ where: { id: examId }, data: { resultsReleasedAt: new Date("2026-10-12T12:00:00Z"), resultsReleasedById: lead.userId, gradebookPublication: publication } });
  reportId = (await raw.reportCard.create({ data: { schoolId, campusId, studentId: learners[0].id, examId: legacyExamId, status: "PUBLISHED" } })).id;
  const first = await ctx(lead, () => versionTransaction(tx => refreshVersion(tx, reportId)));
  publishedVersionId = first.id;
  await raw.reportVersion.update({ where: { id: first.id }, data: { approvedAt: new Date(), approvedBy: lead.userId, publishedAt: new Date(), documentBytes: Buffer.from("synthetic approved report") } });
  await raw.reportCard.update({ where: { id: reportId }, data: { publishedVersionId: first.id } });
  // One learning action cites learner 1's attempt; another for the same learner cites nothing from it.
  stalePlanId = (await raw.interventionPlan.create({ data: { schoolId, campusId, studentId: learners[0].id, createdBy: marker.userId, title: "Addition fluency", summary: "Synthetic", status: "ACTIVE", evidenceRefs: [{ kind: "EXAM_ATTEMPT", refId: attempts[0], label: "Repair check" }] } })).id;
  unrelatedPlanId = (await raw.interventionPlan.create({ data: { schoolId, campusId, studentId: learners[0].id, createdBy: marker.userId, title: "Reading practice", summary: "Synthetic", status: "ACTIVE", evidenceRefs: [{ kind: "OBSERVATION", refId: "obs-1", label: "Reading" }] } })).id;
  await raw.schoolAiRecord.create({ data: { schoolId, campusId, kind: "PRACTICE", title: "Addition practice", status: "APPROVED", data: { items: [{ sourceAssignmentId: examId, questionId: "q1" }] }, createdById: marker.userId, updatedById: marker.userId, idempotencyKey: randomUUID(), requestHash: "d".repeat(64) } });
});
after(async () => {
  await raw.schoolAiAssessmentRepair.deleteMany({ where: { schoolId } });
  await raw.notification.deleteMany({ where: { schoolId } });
  await raw.reportCard.updateMany({ where: { schoolId }, data: { currentVersionId: null, publishedVersionId: null } }).catch(() => undefined);
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

const correction = (key: string) => ({ questionId: "q1", correctOptionId: key });
const versions = async () => (await raw.schoolAiExamAttempt.findMany({ where: { id: { in: attempts } }, orderBy: { id: "asc" }, select: { id: true, reviewVersion: true } }));

test("the impact map lists every dependent record from stored references, within the exam's campus only", async () => {
  await assert.rejects(() => ctx(outsider, () => previewAssessmentRepair(outsider, examId, { correction: correction("a2") })), { status: 404 }, "another campus sees nothing");
  await assert.rejects(() => ctx(marker, () => previewAssessmentRepair(marker, examId, { correction: { questionId: "q3", correctOptionId: "a1" } })), { status: 400 }, "written answers are not key-repaired");
  const preview = await ctx(marker, () => previewAssessmentRepair(marker, examId, { correction: correction("a2") }));
  const kinds = (group: string) => preview.impact.filter(row => row.group === group).map(row => row.kind).sort();
  assert.equal(preview.impact.filter(row => row.group === "CHANGED" && row.kind === "RESULT").length, 4, "every learner's total changes");
  assert.deepEqual(preview.impact.filter(row => row.kind === "RESULT").map(row => `${row.before}->${row.after}`).sort(), ["2->4", "2->4", "4->2", "4->2"]);
  assert.equal(preview.impact.filter(row => row.kind === "MARK" && row.group === "CHANGED").length, 4);
  assert.ok(kinds("NEEDS_REVIEW").includes("REPORT") && kinds("NEEDS_REVIEW").includes("LEARNING_ACTION") && kinds("NEEDS_REVIEW").includes("PRACTICE"));
  assert.ok(kinds("ALREADY_DELIVERED").includes("REPORT") && kinds("ALREADY_DELIVERED").includes("RELEASED_RESULT"));
  assert.ok(kinds("UNTRACKED").includes("EXTERNAL"), "copies outside the product are named, not hidden");
  const actions = preview.impact.filter(row => row.kind === "LEARNING_ACTION").map(row => row.recordId);
  assert.deepEqual(actions, [stalePlanId], "the unrelated action for the same learner is not listed");
  const notice = preview.steps.find(step => step.type === "NOTICE" && step.studentId === learners[0].id);
  assert.deepEqual(notice && "recipientIds" in notice ? notice.recipientIds : [], [guardian.userId, learners[0].user.userId].sort(), "the learner and the guardian with a current grant");
  assert.equal(preview.evidence.approvedKey, "4"); assert.equal(preview.evidence.proposedKey, "5");
  assert.deepEqual(await versions(), attempts.map(id => ({ id, reviewVersion: 1 })).sort((a, b) => a.id.localeCompare(b.id)), "a preview writes nothing");
});

test("an independent leader approves; every owner changes exactly once and families get one notice", async () => {
  const preview = await ctx(marker, () => previewAssessmentRepair(marker, examId, { correction: correction("a2") }));
  const key = randomUUID();
  const body = { correction: correction("a2"), fingerprint: preview.fingerprint, reason: "Option a2 is the intended answer.", publicExplanation: "Question 1 had the wrong answer key. Your result has been corrected.", idempotencyKey: key };
  const proposed = await ctx(marker, () => proposeAssessmentRepair(marker, examId, body));
  assert.equal((await ctx(marker, () => proposeAssessmentRepair(marker, examId, body))).id, proposed.id, "a replayed submit is the same repair");
  await assert.rejects(() => ctx(marker, () => decideAssessmentRepair(marker, examId, { repairId: proposed.id, version: proposed.version, decision: "APPROVE", note: "Self" })), { status: 403 }, "the proposer cannot approve");
  const done = await ctx(lead, () => decideAssessmentRepair(lead, examId, { repairId: proposed.id, version: proposed.version, decision: "APPROVE", note: "Checked against the syllabus." }));
  assert.equal(done.status, "APPLIED"); assert.equal(done.remaining.length, 0);
  assert.ok(done.receipt.every(entry => entry.status === "APPLIED"));
  assert.ok((await versions()).every(row => row.reviewVersion === 2), "one new result version per changed learner");
  const totals = await raw.schoolAiExamAttempt.findMany({ where: { id: { in: attempts } }, select: { id: true, review: true } });
  for (const [i, l] of learners.entries()) assert.equal((totals.find(t => t.id === attempts[i])!.review as { total: number }).total, l.choice === "a2" ? 4 : 2);
  const marks = await raw.mark.findMany({ where: { id: { in: markIds } }, select: { id: true, marksObtained: true, correctionVersion: true } });
  for (const [i, l] of learners.entries()) { const m = marks.find(x => x.id === markIds[i])!; assert.equal(m.marksObtained, l.choice === "a2" ? 4 : 2); assert.equal(m.correctionVersion, 1); }
  const report = await raw.reportCard.findUniqueOrThrow({ where: { id: reportId } });
  assert.equal(report.publishedVersionId, publishedVersionId, "the published report is untouched");
  const successor = await raw.reportVersion.findUniqueOrThrow({ where: { id: report.currentVersionId! } });
  assert.notEqual(successor.id, publishedVersionId); assert.equal(successor.publishedAt, null, "the successor waits for report approval");
  assert.equal(successor.correctionReason, body.publicExplanation);
  const plans = await raw.interventionPlan.findMany({ where: { id: { in: [stalePlanId, unrelatedPlanId] } } });
  assert.ok(plans.find(p => p.id === stalePlanId)!.staleSince, "the citing action is marked for review");
  assert.equal(plans.find(p => p.id === unrelatedPlanId)!.staleSince, null, "the unrelated action is untouched");
  const notices = await raw.notification.findMany({ where: { schoolId, sourceId: proposed.id } });
  assert.equal(notices.filter(n => n.userId === guardian.userId).length, 1);
  assert.ok(notices.every(n => n.message === body.publicExplanation && !n.message.includes("syllabus")), "families get only the approved explanation");
  await assert.rejects(() => ctx(lead, () => resumeAssessmentRepair(lead, examId, { repairId: proposed.id, version: done.version })), { status: 409 }, "an applied repair cannot run again");
  await ctx(marker, () => acknowledgeRepairedLearningAction(marker, stalePlanId));
  assert.equal((await raw.interventionPlan.findUniqueOrThrow({ where: { id: stalePlanId } })).staleSince, null);
});

test("a source change after the preview makes the repair stale and nothing is written", async () => {
  const preview = await ctx(marker, () => previewAssessmentRepair(marker, examId, { correction: correction("a1") }));
  const proposed = await ctx(marker, () => proposeAssessmentRepair(marker, examId, { correction: correction("a1"), fingerprint: preview.fingerprint, reason: "Revert", publicExplanation: "Corrected again.", idempotencyKey: randomUUID() }));
  await raw.mark.update({ where: { id: markIds[1] }, data: { marksObtained: 3 } }); // another tab corrects a mark
  const before = await versions();
  await assert.rejects(() => ctx(lead, () => decideAssessmentRepair(lead, examId, { repairId: proposed.id, version: proposed.version, decision: "APPROVE", note: "Go" })), { status: 409 });
  assert.deepEqual(await versions(), before, "no partial overwrite");
  assert.equal((await raw.schoolAiAssessmentRepair.findUniqueOrThrow({ where: { id: proposed.id } })).status, "STALE");
  assert.equal((await raw.mark.findUniqueOrThrow({ where: { id: markIds[1] } })).marksObtained, 3);
});

test("an interrupted repair resumes only its unfinished steps, with no duplicate adjustment or notice", async () => {
  const preview = await ctx(marker, () => previewAssessmentRepair(marker, examId, { correction: correction("a1") }));
  const changedMark = preview.impact.find(row => row.kind === "MARK" && row.recordId === markIds[1]);
  assert.equal(changedMark?.before, "3", "the preview reads the current mark");
  const proposed = await ctx(marker, () => proposeAssessmentRepair(marker, examId, { correction: correction("a1"), fingerprint: preview.fingerprint, reason: "Revert after review", publicExplanation: "Question 1 is marked with its original key again.", idempotencyKey: randomUUID() }));
  const resultSteps = proposed.plan.filter(step => step.type === "RESULT").length;
  const partial = await ctx(lead, () => decideAssessmentRepair(lead, examId, { repairId: proposed.id, version: proposed.version, decision: "APPROVE", note: "Go" }, { stopAfter: resultSteps }));
  assert.equal(partial.status, "APPLYING", "interrupted after the results, before marks and reports");
  assert.equal(partial.receipt.length, resultSteps);
  assert.ok((await versions()).every(row => row.reviewVersion === 3));
  const resumed = await ctx(lead, () => resumeAssessmentRepair(lead, examId, { repairId: proposed.id, version: partial.version }));
  assert.equal(resumed.status, "APPLIED");
  assert.ok((await versions()).every(row => row.reviewVersion === 3), "results were not adjusted twice");
  assert.equal((await raw.notification.findMany({ where: { schoolId, sourceId: proposed.id, userId: guardian.userId } })).length, 1);
  const listed = await ctx(lead, () => listAssessmentRepairs(lead, examId));
  assert.deepEqual(listed.repairs.map(r => r.status).sort(), ["APPLIED", "APPLIED", "STALE"]);
});
