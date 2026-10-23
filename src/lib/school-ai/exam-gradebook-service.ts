import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { type TxClient } from "@/lib/db/prisma";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { gradeForMark, thresholdsForClass } from "@/lib/academic/report-cards";
import { getOrCreateGradeWeightConfig } from "@/lib/academic/grade-calculator";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspacePermission, loadWorkspacePermissionSnapshot, SchoolAiError } from "./access";
import { paperDataSchema } from "./assessment";
import { examReviewSchema, responsesSchema, validateExamReview, validateResponses } from "./exam";
import { schoolAiTransaction } from "./transaction";
import { canManageExamType } from "@/lib/academic/exam-permissions";
import { workspaceRequestHash } from "./repository";
import { convertGradebookMark, countGradebookOutcomes, gradebookDrift, gradebookConversionSchema, gradebookPublicationInputSchema, gradebookPublicationSchema, type GradebookBlocker, type GradebookConversion, type GradebookOptions, type GradebookOutcome, type GradebookPreview } from "./exam-gradebook";

const json = (value: unknown) => value as Prisma.InputJsonValue;
function fail(code: string, status = 409): never { throw new SchoolAiError("Review the current exam and gradebook information before sending marks.", status, code); }
/**
 * Managers send marks for any sitting. SKO-500 (§14.5): a teacher may send the marks of a sitting they
 * created into a quiz or class test they manage (checked on the target in `assertTeacherTarget`).
 */
async function authorize(user: AuthUser, db: TxClient, assignmentId: string) {
  const teacher = user.role === "TEACHER";
  if (teacher) {
    const own = await db.schoolAiExamAssignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId, campusId: user.campusId ?? "", createdById: user.userId }, select: { id: true } });
    if (!own) fail("PERMISSION_DENIED", 403);
  } else assertApprovalRole(user);
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) fail("PERMISSION_DENIED", 403);
  const permissions = await loadWorkspacePermissionSnapshot(user, db);
  await assertSchoolAiAccess(user, teacher ? "add" : "edit", permissions);
  await assertWorkspacePermission(user, "exams", "view", permissions);
  await assertWorkspacePermission(user, "exams", "edit", permissions);
  await assertSchoolOperational(user.schoolId, db);
}
async function readSource(user: AuthUser, id: string, db: TxClient) {
  const assignment = await db.schoolAiExamAssignment.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
  if (!assignment) fail("GRADEBOOK_SCOPE", 404);
  const paper = paperDataSchema.parse(assignment.paperSnapshot);
  if (paper.classId !== assignment.classId || !["STANDARD", "SECURE_BROWSER"].includes(assignment.mode)) fail("GRADEBOOK_SCOPE");
  const scope = { schoolId: user.schoolId, campusId: assignment.campusId };
  const roster = z.array(z.string().min(1).max(128)).min(1).max(500).parse(assignment.studentIds);
  if (new Set(roster).size !== roster.length) fail("GRADEBOOK_SOURCE_INVALID");
  const [cls, subject, students, attempts, clock] = await Promise.all([
    db.class.findFirst({ where: { ...scope, id: assignment.classId, campus: { archivedAt: null } }, select: { id: true, academicYear: true, archivedAt: true, status: true } }),
    db.subject.findFirst({ where: { ...scope, id: paper.subjectId, classId: assignment.classId }, select: { id: true, name: true, totalMarks: true } }),
    db.student.findMany({ where: { ...scope, classId: assignment.classId, id: { in: roster }, archivedAt: null, status: "active" }, select: { id: true, fullName: true, rollNo: true } }),
    db.schoolAiExamAttempt.findMany({ where: { ...scope, assignmentId: id }, orderBy: { id: "asc" }, take: 501 }),
    db.$queryRaw<Array<{ now: Date }>>`SELECT statement_timestamp() AS now`,
  ]);
  if (!cls || !subject || !Number.isSafeInteger(subject.totalMarks) || subject.totalMarks <= 0) fail("GRADEBOOK_SCOPE");
  if (attempts.length > 500 || attempts.some(attempt => !roster.includes(attempt.studentId)) || new Set(attempts.map(attempt => attempt.studentId)).size !== attempts.length) fail("GRADEBOOK_SOURCE_INVALID");
  const outcomes: GradebookOutcome[] = roster.map(studentId => {
    const student = students.find(item => item.id === studentId), attempt = attempts.find(item => item.studentId === studentId);
    const state = !student ? "UNAVAILABLE" : !attempt ? "NOT_STARTED" : ["IN_PROGRESS", "SUBMITTED", "REVIEWED"].includes(attempt.status) ? attempt.status as GradebookOutcome["state"] : "UNAVAILABLE";
    return { studentId, fullName: student?.fullName ?? null, rollNo: student?.rollNo ?? null, state };
  });
  const publication = assignment.gradebookPublication ? gradebookPublicationSchema.parse(assignment.gradebookPublication) : null;
  const windowClosed = assignment.endsAt <= clock[0].now;
  return { assignment, paper, scope, cls, subject, students, attempts, outcomes, counts: countGradebookOutcomes(outcomes), publication, windowClosed, now: clock[0].now };
}

export async function getExamGradebookOptions(user: AuthUser, assignmentId: string): Promise<GradebookOptions> {
  return schoolAiTransaction(user, async db => {
    await authorize(user, db, assignmentId);
    const source = await readSource(user, assignmentId, db);
    const exams = source.cls.archivedAt || source.cls.status !== "ACTIVE" ? [] : await db.exam.findMany({
      where: { ...source.scope, classId: source.cls.id, academicYear: source.cls.academicYear, isLocked: false, status: { in: ["ACTIVE", "MARKS_ENTRY"] }, OR: [{ subjectId: null }, { subjectId: source.subject.id }] },
      select: { id: true, title: true, term: true, academicYear: true, status: true }, orderBy: [{ academicYear: "desc" }, { title: "asc" }, { id: "asc" }], take: 101,
    });
    if (exams.length > 100) fail("GRADEBOOK_SCOPE_LIMIT", 422);
    const sentMarks = source.publication ? await db.mark.findMany({ where: { ...source.scope, id: { in: source.publication.rows.map(row => row.markId) } }, select: { id: true, marksObtained: true } }) : [];
    const drift = source.publication ? gradebookDrift(source.publication, source.attempts, sentMarks, new Map(source.students.map(row => [row.id, row.fullName]))) : [];
    return { assignmentVersion: source.assignment.version, assignmentTitle: source.assignment.title, windowClosed: source.windowClosed, endsAt: source.assignment.endsAt.toISOString(), subject: source.subject, counts: source.counts, outcomes: source.outcomes, exams, publication: source.publication, drift };
  });
}

async function preview(user: AuthUser, assignmentId: string, examId: string, conversion: GradebookConversion, db: TxClient): Promise<GradebookPreview> {
  const source = await readSource(user, assignmentId, db);
  if (source.publication) fail("GRADEBOOK_ALREADY_SENT");
  if (source.assignment.status !== "ACTIVE" || source.cls.archivedAt || source.cls.status !== "ACTIVE") fail("GRADEBOOK_SCOPE");
  const target = await db.exam.findFirst({ where: { ...source.scope, id: examId, classId: source.cls.id, academicYear: source.cls.academicYear, OR: [{ subjectId: null }, { subjectId: source.subject.id }] }, select: { id: true, title: true, term: true, academicYear: true, status: true, isLocked: true, academicModelVersionId: true, subjectId: true, marksEntryAt: true, examType: true } });
  if (!target) fail("GRADEBOOK_SCOPE", 404);
  if (user.role === "TEACHER" && !canManageExamType(user.role, target.examType)) fail("PERMISSION_DENIED", 403);
  if (target.isLocked || !["ACTIVE", "MARKS_ENTRY"].includes(target.status)) fail("GRADEBOOK_TARGET_LOCKED");
  const [thresholds, config, marks, reportCount] = await Promise.all([
    thresholdsForClass(source.cls.id, target.academicYear, db, target.academicModelVersionId),
    getOrCreateGradeWeightConfig(source.assignment.campusId, source.cls.id, target.academicYear, db, target.academicModelVersionId),
    db.mark.findMany({ where: { ...source.scope, examId: target.id, subjectId: source.subject.id, studentId: { in: source.outcomes.map(item => item.studentId) } }, select: { id: true, studentId: true, marksObtained: true, isAbsent: true, isExempt: true, grade: true, correctionVersion: true } }),
    db.reportCard.count({ where: { ...source.scope, examId: target.id } }),
  ]);
  const blockers = new Set<GradebookBlocker>();
  if (!source.windowClosed) blockers.add("WINDOW_OPEN");
  if (source.counts.inProgress || source.counts.submitted) blockers.add("PENDING_MODERATION");
  if (!source.counts.reviewed) blockers.add("NO_REVIEWED_ATTEMPTS");
  if (source.counts.unavailable) blockers.add("STUDENT_SCOPE_CHANGED");
  if (marks.length) blockers.add("MARKS_EXIST");
  if (reportCount) blockers.add("REPORTS_EXIST");
  const rows: GradebookPreview["rows"] = [];
  for (const attempt of source.attempts.filter(item => item.status === "REVIEWED")) {
    const stored = attempt.review as { marks?: unknown; note?: unknown; total?: unknown } | null;
    const review = examReviewSchema.safeParse({ marks: stored?.marks, note: stored?.note }), responses = responsesSchema.safeParse(attempt.responses);
    if (!review.success || !responses.success || !attempt.reviewedAt || !attempt.reviewedById || !attempt.submittedAt || validateResponses(source.paper, responses.data).length || validateExamReview(source.paper, responses.data, review.data).length) { blockers.add("INVALID_REVIEW"); continue; }
    const rawTotal = review.data.marks.reduce((sum, mark) => sum + mark.marks, 0);
    if (typeof stored?.total !== "number" || !Number.isFinite(stored.total) || Math.abs(stored.total - rawTotal) > 1e-8) { blockers.add("INVALID_REVIEW"); continue; }
    const targetMark = convertGradebookMark(rawTotal, source.paper.blueprint.totalMarks, source.subject.totalMarks, conversion);
    if (targetMark === null) { blockers.add("CONVERSION_REQUIRED"); continue; }
    const student = source.students.find(item => item.id === attempt.studentId);
    if (!student) continue;
    const reviewHash = workspaceRequestHash({ review: attempt.review, responses: attempt.responses, sequence: attempt.sequence, reviewedAt: attempt.reviewedAt.toISOString(), reviewedById: attempt.reviewedById });
    rows.push({ attemptId: attempt.id, studentId: attempt.studentId, fullName: student.fullName, rollNo: student.rollNo, reviewedAt: attempt.reviewedAt.toISOString(), reviewedById: attempt.reviewedById, reviewHash, rawTotal, targetMark, grade: gradeForMark(targetMark, source.subject.totalMarks, thresholds) });
  }
  const sourceHash = workspaceRequestHash({ assignmentId, version: source.assignment.version, paperVersion: source.assignment.paperVersion, paper: source.paper, roster: source.assignment.studentIds, endsAt: source.assignment.endsAt.toISOString(), attempts: source.attempts.map(item => ({ id: item.id, studentId: item.studentId, sequence: item.sequence, status: item.status, review: item.review, reviewedAt: item.reviewedAt?.toISOString(), reviewedById: item.reviewedById, responses: item.responses })) });
  const result = { assignmentId, assignmentVersion: source.assignment.version, assignmentTitle: source.assignment.title, paperVersion: source.assignment.paperVersion, exam: { id: target.id, title: target.title, term: target.term, academicYear: target.academicYear, status: target.status }, subject: source.subject, conversion, sourceMaximum: source.paper.blueprint.totalMarks, targetMaximum: source.subject.totalMarks, counts: source.counts, outcomes: source.outcomes, blockers: [...blockers], rows, unenteredStudentIds: source.outcomes.filter(item => item.state === "NOT_STARTED").map(item => item.studentId), thresholds, resultRoundingRule: config.roundingRule ?? "WHOLE", sourceHash };
  return { ...result, previewHash: workspaceRequestHash({ result, target: { ...target, marksEntryAt: target.marksEntryAt?.toISOString() }, config, marks, reportCount }) };
}

export async function previewExamGradebook(user: AuthUser, assignmentId: string, examId: string, conversion: GradebookConversion): Promise<GradebookPreview> {
  gradebookConversionSchema.parse(conversion);
  return schoolAiTransaction(user, async db => { await authorize(user, db, assignmentId); return preview(user, assignmentId, examId, conversion, db); });
}

export async function publishExamGradebook(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = gradebookPublicationInputSchema.parse(raw);
  try {
    return await schoolAiTransaction(user, async db => {
      await authorize(user, db, assignmentId);
      // Lock the publication owner before checking a durable replay. No separate
      // transaction can send this assignment to another gradebook destination.
      const locked = await db.schoolAiExamAssignment.updateMany({ where: { id: assignmentId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, data: { version: { increment: 0 } } });
      if (locked.count !== 1) fail("GRADEBOOK_SCOPE", 404);
      const source = await readSource(user, assignmentId, db);
      if (source.publication) {
        const previous = source.publication;
        if (previous.examId !== input.examId || previous.conversion !== input.conversion || previous.assignmentVersion !== input.version || previous.previewHash !== input.previewHash) fail("GRADEBOOK_RECEIPT_CONFLICT");
        return previous;
      }
      // Lock the existing exam too: its normal lock/publish transition must not
      // overtake a reviewed gradebook insertion.
      await db.$queryRaw`SELECT id FROM exams WHERE id = ${input.examId} AND school_id = ${user.schoolId} AND campus_id = ${source.assignment.campusId} FOR UPDATE`;
      const checked = await preview(user, assignmentId, input.examId, input.conversion, db);
      if (checked.assignmentVersion !== input.version || checked.previewHash !== input.previewHash) fail("GRADEBOOK_STALE_PREVIEW");
      if (checked.blockers.length) fail("GRADEBOOK_BLOCKED");
      const rows = [];
      for (const item of checked.rows) {
        const mark = await db.mark.create({ data: { schoolId: user.schoolId, campusId: source.assignment.campusId, examId: input.examId, studentId: item.studentId, subjectId: source.subject.id, marksObtained: item.targetMark, grade: item.grade, enteredBy: user.userId, isAbsent: false, isExempt: false } });
        const { fullName: _name, rollNo: _roll, ...row } = item;
        rows.push({ ...row, markId: mark.id });
        await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "marks", recordId: mark.id, userId: user.userId, oldValue: Prisma.JsonNull, newValue: { source: "school_ai_reviewed_exam", assignmentId, attemptId: item.attemptId, reviewHash: item.reviewHash, rawTotal: item.rawTotal, sourceMaximum: checked.sourceMaximum, conversion: input.conversion, marksObtained: mark.marksObtained, isAbsent: false, isExempt: false, grade: mark.grade, enteredBy: user.userId } } });
      }
      const publication = gradebookPublicationSchema.parse({ id: randomUUID(), assignmentId, assignmentVersion: checked.assignmentVersion, paperId: source.assignment.paperId, paperVersion: source.assignment.paperVersion, examId: input.examId, subjectId: source.subject.id, conversion: input.conversion, previewHash: input.previewHash, sourceHash: checked.sourceHash, createdById: user.userId, idempotencyKey: input.idempotencyKey, createdAt: source.now.toISOString(), sourceMaximum: checked.sourceMaximum, targetMaximum: checked.targetMaximum, academicYear: checked.exam.academicYear, examTitle: checked.exam.title, subjectName: source.subject.name, rows, unenteredStudentIds: checked.unenteredStudentIds, thresholds: checked.thresholds, resultRoundingRule: checked.resultRoundingRule });
      await db.schoolAiExamAssignment.update({ where: { id: assignmentId }, data: { gradebookPublication: json(publication) } });
      if (checked.exam.status === "ACTIVE") await db.exam.update({ where: { id: input.examId }, data: { status: "MARKS_ENTRY", marksEntryAt: source.now } });
      await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_exam_assignments", recordId: assignmentId, userId: user.userId, oldValue: Prisma.JsonNull, newValue: { action: "gradebook_publication", receiptId: publication.id, examId: input.examId, sourceHash: checked.sourceHash, previewHash: input.previewHash, insertedCount: rows.length, unenteredCount: checked.unenteredStudentIds.length } } });
      return publication;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) fail("GRADEBOOK_STALE_PREVIEW");
    throw error;
  }
}
