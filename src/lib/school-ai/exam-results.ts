import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit-events";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import type { PaperData } from "./assessment";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { proposeCorrectionIn } from "./exam-moderation-service";
import { schoolAiTransaction } from "./transaction";
import { resultDecisionAccess, scopedAssignment, staffExamAccess } from "./exam-service";
import { examReviewSchema, responsesSchema, validateExamReview, examKeyCorrectionSchema, correctedExamPaper, scoreObjectiveResponses, objectiveOverrides, type ExamReview } from "./exam";
import { membersHeadedBy, headsAuthorDepartment } from "./department-heads";

const id = z.string().trim().min(1).max(120);
export const regradeAttemptSchema = z.object({ attemptId: id, version: z.number().int().min(1), reason: z.string().trim().min(1).max(4000), review: examReviewSchema }).strict();
// SKO-424: a review request may name the disputed questions and the outcome the learner asks for.
export const appealResultSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(1).max(4000), disputedQuestionIds: z.array(id).max(100).optional(), requestedOutcome: z.string().trim().min(1).max(2000).optional() }).strict();
// SKO-504: upholding a request may carry the corrected marks, which become a correction for a second reviewer.
export const resolveAppealSchema = z.object({ appealId: id, version: z.number().int().positive(), status: z.enum(["UPHELD", "DISMISSED"]), resolution: z.string().trim().min(1).max(4000), review: examReviewSchema.optional() }).strict();
const json = (value: unknown) => value as Prisma.InputJsonValue;

/** Learner result snapshots omit the private key, rubric, source material and other students. */
export async function getExamResults(user: AuthUser, assignmentId: string, attemptId?: string, departmentReview = false) {
 return schoolAiTransaction(user, async tx => {
  const { assignment, student, paper } = departmentReview ? await departmentResultScope(user, assignmentId, attemptId, tx) : await scopedAssignment(user, assignmentId, tx);
  if (!student && !departmentReview) await staffExamAccess(user, assignment, "view", tx);
  const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, ...(student ? { studentId: student.id, userId: user.userId } : { id: attemptId ?? "" }) } });
  // SKO-408: learners see moderated results only after an explicit release, never automatically.
  if (!attempt || (student && (!assignment.resultsReleasedAt || new Date() < assignment.endsAt))) return { attempt: null, revisions: [], appeals: [], released: !!assignment.resultsReleasedAt };
  const revisions = await tx.schoolAiExamResultRevision.findMany({ where: { attemptId: attempt.id, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId }, orderBy: { version: "desc" }, take: 100 });
  const appeals = await tx.schoolAiExamAppeal.findMany({ where: { attemptId: attempt.id, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId }, orderBy: { createdAt: "desc" }, take: 100 });
  // Criterion IDs and teacher evidence are authoring data. Students receive reviewed feedback only.
  const staffReview = (value: unknown) => { const stored = value as Record<string, unknown>; const parsed = examReviewSchema.parse({ marks: stored.marks, note: stored.note, ...(stored.keyCorrections ? { keyCorrections: stored.keyCorrections } : {}) }); return { ...parsed, total: parsed.marks.reduce((sum, item) => sum + item.marks, 0) }; };
  const candidateReview = (value: unknown) => { const parsed = staffReview(value); return { note: parsed.note, marks: parsed.marks.map(({ questionId, marks, feedback }) => ({ questionId, number: paper.questions.findIndex(question => question.id === questionId) + 1, marks, feedback })), total: parsed.total }; };
  return {
   released: !!assignment.resultsReleasedAt, resultsReleasedAt: assignment.resultsReleasedAt,
   attempt: { id: attempt.id, status: attempt.status, reviewVersion: attempt.reviewVersion, review: attempt.review ? (student ? candidateReview(attempt.review) : staffReview(attempt.review)) : null },
   revisions: revisions.map(row => ({ id: row.id, version: row.version, reason: row.reason, review: student ? candidateReview(row.review) : row.review, createdAt: row.createdAt })),
   appeals: appeals.map(row => ({ id: row.id, resultVersion: row.resultVersion, version: row.version, status: row.status, reason: row.reason, disputedQuestionIds: row.disputedQuestionIds, requestedOutcome: row.requestedOutcome, resolution: row.resolution, createdAt: row.createdAt, resolvedAt: row.resolvedAt })),
  };
 });
}

async function departmentResultScope(user: AuthUser, assignmentId: string, attemptId: string | undefined, tx: TxClient) {
 const assignment = user.role === "TEACHER" && attemptId ? await tx.schoolAiExamAssignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId, campusId: user.campusId ?? "", resultsReleasedAt: { not: null }, endsAt: { lte: new Date() } } }) : null;
 if (!assignment) throw new ApiError("Review request unavailable.", 404);
 const paper = await resultDecisionAccess(user, assignment, tx);
 const subject = await tx.subject.findFirst({ where: { id: paper.subjectId, schoolId: user.schoolId, campusId: assignment.campusId }, select: { teacherId: true } });
 const heads = await headsAuthorDepartment(tx, user.schoolId, user.userId, assignment.createdById) || Boolean(subject?.teacherId && await headsAuthorDepartment(tx, user.schoolId, user.userId, subject.teacherId));
 const appeal = heads && await tx.schoolAiExamAppeal.findFirst({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, attemptId }, select: { id: true } });
 if (!appeal) throw new ApiError("Review request unavailable.", 404);
 return { assignment, paper, student: null };
}

/** Only released results with a review request, scoped to the head's current department. */
export async function listDepartmentAppeals(user: AuthUser) {
 return schoolAiTransaction(user, async tx => {
  if (user.role !== "TEACHER") return [];
  const members = await membersHeadedBy(tx, user.schoolId, user.userId);
  if (!members.length) return [];
  const subjects = await tx.subject.findMany({ where: { schoolId: user.schoolId, campusId: user.campusId ?? "", teacherId: { in: members } }, select: { id: true } });
  const rows = await tx.schoolAiExamAppeal.findMany({ where: { schoolId: user.schoolId, campusId: user.campusId ?? "", status: { in: ["OPEN", "UPHELD"] }, attempt: { assignment: { resultsReleasedAt: { not: null }, endsAt: { lte: new Date() }, OR: [{ createdById: { in: members } }, { paper: { subjectId: { in: subjects.map(subject => subject.id) } } }] } } }, orderBy: { createdAt: "asc" }, take: 50, select: { id: true, assignmentId: true, attemptId: true, studentId: true, status: true, attempt: { select: { assignment: { select: { title: true } } } } } });
  for (const row of rows) await departmentResultScope(user, row.assignmentId, row.attemptId, tx);
  const students = await tx.student.findMany({ where: { schoolId: user.schoolId, campusId: user.campusId ?? "", id: { in: rows.map(row => row.studentId) } }, select: { id: true, fullName: true, rollNo: true } });
  const names = new Map(students.map(student => [student.id, student]));
  return rows.map(row => ({ id: row.id, assignmentId: row.assignmentId, attemptId: row.attemptId, status: row.status, title: row.attempt.assignment.title, studentName: names.get(row.studentId)?.fullName ?? "", rollNo: names.get(row.studentId)?.rollNo ?? "" }));
 });
}

export async function regradeExamAttempt(user: AuthUser, assignmentId: string, raw: unknown) {
 const input = regradeAttemptSchema.parse(raw);
 return schoolAiTransaction(user, async tx => {
  const { assignment, paper } = await scopedAssignment(user, assignmentId, tx);
  await staffExamAccess(user, assignment, "edit", tx);
  const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: input.attemptId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId } });
  if (attempt?.status === "REVIEWED" && attempt.reviewVersion === input.version + 1) {
   const revision = await tx.schoolAiExamResultRevision.findUnique({ where: { attemptId_version: { attemptId: attempt.id, version: attempt.reviewVersion } } });
   const expected = { ...input.review, total: input.review.marks.reduce((sum, row) => sum + row.marks, 0) };
   if (revision?.createdById === user.userId && revision.reason === input.reason && isDeepStrictEqual(revision.review, expected)) return { attemptId: attempt.id, version: attempt.reviewVersion, review: expected };
  }
  if (!attempt || attempt.status !== "REVIEWED" || attempt.reviewVersion !== input.version) throw new ApiError("The result changed. Reload its current version before revising it.", 409);
  // SKO-424: once results are released, a change needs a second, independent reviewer.
  if (assignment.resultsReleasedAt) throw new ApiError("Released results change only through a correction approved by another reviewer.", 409);
  return applyResultRevision(tx, user, { assignmentId, campusId: assignment.campusId, paper, attempt, fromVersion: input.version, review: input.review, reason: input.reason });
 });
}

/**
 * SKO-504: the desk's "revise" after release no longer dead-ends — it becomes a correction proposal
 * that another reviewer approves (`decideResultCorrection`). Before release it is a direct revision.
 */
export async function reviseExamResult(user: AuthUser, assignmentId: string, raw: unknown) {
 const input = regradeAttemptSchema.parse(raw);
 const { assignment } = await scopedAssignment(user, assignmentId);
 if (!assignment.resultsReleasedAt) return regradeExamAttempt(user, assignmentId, input);
 const correction = await schoolAiTransaction(user, tx => proposeCorrectionIn(tx, user, assignmentId, { attemptId: input.attemptId, version: input.version, reason: input.reason.length >= 8 ? input.reason : `Revised: ${input.reason}`, review: input.review, source: "REGRADE" }));
 return { attemptId: input.attemptId, version: input.version, correctionId: correction.id, pendingCorrection: true as const };
}

/** SKAI-1014: refuses a silent change to an auto-scored item and audit-logs every reasoned override. */
export async function assertObjectiveOverrides(tx: TxClient, user: AuthUser, args: { paper: PaperData; responses: unknown; review: ExamReview; previous?: unknown; attemptId: string; campusId: string }) {
  const previous = args.previous && typeof args.previous === "object" ? args.previous as { marks?: { questionId: string; marks: number }[] } : null;
  const { errors, overrides } = objectiveOverrides(args.paper, responsesSchema.parse(args.responses), args.review, previous);
  if (errors.length) throw new ApiError(errors.join(" "), 422);
  for (const item of overrides) await writeAuditEvent(tx, user, { table: "school_ai_exam_attempts", recordId: args.attemptId, action: "UPDATE", campusId: args.campusId, before: { questionId: item.questionId, autoMarks: item.autoMarks }, after: { objectiveOverride: true, questionId: item.questionId, marks: item.marks, overrideReason: item.reason } });
  return overrides;
}

/** Writes one result revision against an exact predecessor, with audit and appeal resolution. */
export async function applyResultRevision(tx: TxClient, user: AuthUser, args: { assignmentId: string; campusId: string; paper: PaperData; attempt: { id: string; responses: unknown; review: unknown }; fromVersion: number; review: z.infer<typeof examReviewSchema>; reason: string; createdById?: string }) {
  const { assignmentId, campusId, paper, attempt, fromVersion, reason } = args;
  const issues = validateExamReview(paper, responsesSchema.parse(attempt.responses), args.review);
  if (issues.length) throw new ApiError(issues.join(" "), 422);
  await assertObjectiveOverrides(tx, user, { paper, responses: attempt.responses, review: args.review, previous: attempt.review, attemptId: attempt.id, campusId });
  const review = { ...args.review, total: args.review.marks.reduce((sum, item) => sum + item.marks, 0) };
  const version = fromVersion + 1;
  const updated = await tx.schoolAiExamAttempt.updateMany({ where: { id: attempt.id, schoolId: user.schoolId, campusId, status: "REVIEWED", reviewVersion: fromVersion }, data: { review: json(review), reviewVersion: version, reviewedById: user.userId, reviewedAt: new Date() } });
  if (updated.count !== 1) throw new ApiError("Another result revision was saved first. Reload before editing.", 409);
  await tx.schoolAiExamResultRevision.create({ data: { schoolId: user.schoolId, campusId, assignmentId, attemptId: attempt.id, version, review: json(review), reason, createdById: args.createdById ?? user.userId } });
  const previousTotal = (attempt.review as { total?: unknown } | null)?.total;
  await writeAuditEvent(tx, user, { table: "school_ai_exam_attempts", recordId: attempt.id, action: "UPDATE", campusId, before: { reviewVersion: fromVersion, total: typeof previousTotal === "number" ? previousTotal : null }, after: { reviewVersion: version, total: review.total } });
  // A correction resolves only the upheld requests against the reviewed predecessor.
  await tx.schoolAiExamAppeal.updateMany({ where: { schoolId: user.schoolId, campusId, attemptId: attempt.id, resultVersion: fromVersion, status: { in: ["OPEN", "UPHELD"] } }, data: { status: "RESOLVED", resolution: reason, version: { increment: 1 }, resolvedAt: new Date(), resolvedById: user.userId } });
  return { attemptId: attempt.id, version, review };
}

export async function appealExamResult(user: AuthUser, assignmentId: string, raw: unknown) {
 const input = appealResultSchema.parse(raw);
 return schoolAiTransaction(user, async tx => {
  const { assignment, student, paper } = await scopedAssignment(user, assignmentId, tx);
  if (!student) throw new ApiError("Only the assigned student can request a result review.", 403);
  if (input.disputedQuestionIds?.some(questionId => !paper.questions.some(question => question.id === questionId))) throw new ApiError("Choose questions from this paper.", 400);
  if (new Date() < assignment.endsAt || !assignment.resultsReleasedAt) throw new ApiError("Results become available after your school releases them.", 409);
  const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, studentId: student.id, userId: user.userId, status: "REVIEWED", reviewVersion: input.version } });
  if (!attempt) throw new ApiError("The result changed or is awaiting moderation. Refresh the result.", 409);
  const existing = await tx.schoolAiExamAppeal.findUnique({ where: { attemptId_resultVersion: { attemptId: attempt.id, resultVersion: input.version } } });
  if (existing) {
   if (existing.schoolId !== user.schoolId || existing.userId !== user.userId || existing.reason !== input.reason) throw new ApiError("This result version already has a review request.", 409);
   // One request per result version: a second request for the same version is the same case.
   return { id: existing.id, status: existing.status, version: existing.version };
  }
  const created = await tx.schoolAiExamAppeal.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, attemptId: attempt.id, studentId: student.id, userId: user.userId, resultVersion: input.version, reason: input.reason, disputedQuestionIds: [...new Set(input.disputedQuestionIds ?? [])], requestedOutcome: input.requestedOutcome ?? null } });
  await writeAuditEvent(tx, user, { table: "school_ai_exam_appeals", recordId: created.id, action: "CREATE", campusId: assignment.campusId, after: { assignmentId, attemptId: attempt.id, resultVersion: input.version, status: created.status, version: created.version } });
  return { id: created.id, status: created.status, version: created.version };
 });
}

/** SKO-504: the sitting, in the scope of someone who may decide its re-checks (a manager, or the head of department). */
async function decidedAssignment(user: AuthUser, assignmentId: string, tx: TxClient) {
 const assignment = await tx.schoolAiExamAssignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) } });
 if (!assignment) throw new ApiError("Exam unavailable.", 404);
 return { assignment, paper: await resultDecisionAccess(user, assignment, tx) };
}

export async function resolveExamAppeal(user: AuthUser, assignmentId: string, raw: unknown) {
 const input = resolveAppealSchema.parse(raw);
 return schoolAiTransaction(user, async tx => {
  const { assignment } = await decidedAssignment(user, assignmentId, tx);
  const appeal = await tx.schoolAiExamAppeal.findFirst({ where: { id: input.appealId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, version: input.version, status: "OPEN" } });
  if (!appeal) throw new ApiError("This review request changed. Refresh it before deciding.", 409);
  const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: appeal.attemptId, schoolId: user.schoolId, campusId: assignment.campusId, reviewVersion: appeal.resultVersion } });
  if (!attempt) throw new ApiError("The result has a newer revision. Read it before resolving this historical request.", 409);
  const updated = await tx.schoolAiExamAppeal.updateMany({ where: { id: appeal.id, schoolId: user.schoolId, version: input.version, status: "OPEN" }, data: { status: input.status, resolution: input.resolution, resolvedById: user.userId, resolvedAt: new Date(), version: { increment: 1 } } });
  if (updated.count !== 1) throw new ApiError("Another decision was saved first.", 409);
  await writeAuditEvent(tx, user, { table: "school_ai_exam_appeals", recordId: appeal.id, action: input.status === "DISMISSED" ? "REJECT" : "APPROVE", campusId: assignment.campusId, before: { status: appeal.status, version: input.version }, after: { status: input.status, version: input.version + 1, attemptId: appeal.attemptId, resultVersion: appeal.resultVersion } });
  // SKO-504: an upheld request reaches the result only through a correction another reviewer approves;
  // approving it writes the revision and moves this request to RESOLVED.
  const correction = input.status === "UPHELD" && input.review ? await proposeCorrectionIn(tx, user, assignmentId, { attemptId: appeal.attemptId, version: appeal.resultVersion, reason: `Appeal upheld: ${input.resolution}`, review: input.review, appealId: appeal.id, source: "APPEAL" }) : null;
  return { id: appeal.id, status: input.status, version: input.version + 1, correctionId: correction?.id ?? null };
 });
}

export async function previewExamKeyCorrection(user: AuthUser, assignmentId: string, raw: unknown) {
 const input = z.object({ attemptId: id, version: z.number().int().positive(), corrections: z.array(examKeyCorrectionSchema).min(1).max(100) }).strict().parse(raw);
 return schoolAiTransaction(user, async tx => {
  const { assignment, paper } = await scopedAssignment(user, assignmentId, tx); await staffExamAccess(user, assignment, "edit", tx);
  const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: input.attemptId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, reviewVersion: input.version, status: "REVIEWED" } });
  if (!attempt?.review) throw new ApiError("Reload the current moderated result before correcting a key.", 409);
  let corrected;
  try { corrected = correctedExamPaper(paper, input.corrections); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Invalid corrected key.", 422); }
  const stored = attempt.review as { marks: unknown; note: unknown; keyCorrections?: unknown };
  const review = examReviewSchema.parse({ marks: stored.marks, note: stored.note, keyCorrections: stored.keyCorrections });
  const scores = scoreObjectiveResponses(corrected, responsesSchema.parse(attempt.responses));
  const keys = new Map(review.keyCorrections?.map(row => [row.questionId, row]) ?? []); for (const row of input.corrections) keys.set(row.questionId, row);
  const marks = review.marks.map(mark => input.corrections.some(row => row.questionId === mark.questionId) ? { questionId: mark.questionId, marks: scores.questions.find(row => row.questionId === mark.questionId)?.marks ?? 0, feedback: mark.feedback } : mark);
  return { version: input.version, previousTotal: review.marks.reduce((sum, row) => sum + row.marks, 0), proposedTotal: marks.reduce((sum, row) => sum + row.marks, 0), review: { ...review, keyCorrections: [...keys.values()], marks } };
 });
}
