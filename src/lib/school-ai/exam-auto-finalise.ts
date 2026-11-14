import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import type { PaperData } from "./assessment";
import { responsesSchema, scoreObjectiveResponses, type ExamResponses, type ExamReview } from "./exam";
import { reviewSchoolAiAttempt, scopedAssignment, staffMarkingAccess } from "./exam-service";
import { assertSchoolAiRole, assertWorkspacePermission, type WorkspacePermissionSnapshot } from "./access";

const FEEDBACK = "Auto-scored objective answer.";
const NOTE = "Finalised automatically: every answered question is auto-scored.";

/**
 * SKAI-785: an attempt needs no marker when every answered question is auto-scored. Returns the review
 * a marker would otherwise approve by hand (auto marks only, no overrides), or null when any answered
 * question still needs judgement.
 */
export function objectiveOnlyReview(paper: PaperData, responses: ExamResponses): ExamReview | null {
  const proposal = scoreObjectiveResponses(paper, responses);
  if (proposal.pendingReviewCount > 0) return null;
  const marks = proposal.questions.filter(row => row.state === "OBJECTIVE").map(row => ({ questionId: row.questionId, marks: row.marks ?? 0, feedback: FEEDBACK }));
  return { marks, note: NOTE };
}

/**
 * SKAI-785 (QA FAIL, denied role): a role without marking rights is refused with a 403 before any exam lookup,
 * instead of falling through to the generic 503 response.
 */
export async function assertObjectiveFinaliseAccess(user: AuthUser, permissions?: WorkspacePermissionSnapshot) {
  assertSchoolAiRole(user);
  await assertWorkspacePermission(user, "exams", "edit", permissions);
}

/**
 * Finalises every submitted, unreviewed attempt whose answers are all objective. Each one goes through the
 * normal review path, so access, validation, the result revision and the audit event are unchanged.
 * Attempts with any written answer stay in the marking queue.
 */
export async function finaliseObjectiveOnlyAttempts(user: AuthUser, assignmentId: string, now = new Date()) {
  await assertObjectiveFinaliseAccess(user);
  const { assignment, paper } = await scopedAssignment(user, assignmentId);
  await staffMarkingAccess(user, assignment);
  const attempts = await prisma.schoolAiExamAttempt.findMany({ where: { assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, status: "SUBMITTED", reviewVersion: 0 }, select: { id: true, responses: true }, orderBy: { startedAt: "asc" }, take: 2000 });
  let finalised = 0, held = 0, conflicts = 0;
  for (const attempt of attempts) {
    const review = objectiveOnlyReview(paper, responsesSchema.parse(attempt.responses));
    if (!review) { held += 1; continue; }
    try { await reviewSchoolAiAttempt(user, assignmentId, attempt.id, review, now); finalised += 1; }
    catch (error) { if (error instanceof ApiError && error.status === 409) conflicts += 1; else throw error; }
  }
  return { finalised, held, conflicts };
}
