import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { resolveCurrentPrincipal } from "@/lib/auth/principal";
import { checkRevocation } from "@/lib/auth/session-revocation";
import { hashSessionToken } from "@/lib/auth/session-cookie";
import type { AuthUser } from "@/lib/auth";
import type { CandidateExamBoundary } from "./exam-boundary";

type CandidateSessionClaims = Parameters<typeof resolveCurrentPrincipal>[0] & { role: "STUDENT" };
type CandidateSessionDependencies = {
  isRevoked: (tokenHash: string) => Promise<boolean>;
  resolvePrincipal: typeof resolveCurrentPrincipal;
  lookupBoundary: (actor: AuthUser) => Promise<CandidateExamBoundary | null>;
};
type CandidateSessionBoundary =
  | { authenticated: false }
  | { authenticated: true; active: CandidateExamBoundary | null };

/**
 * Proxy has already verified this token's signature and expiry. Reuse the same
 * live-session and current-account checks as getAuthUser before reading or
 * revealing any exam metadata; signed claims alone are not current authority.
 */
export async function candidateExamBoundaryForSession(
  token: string,
  claims: CandidateSessionClaims,
  dependencies: CandidateSessionDependencies = {
    isRevoked: checkRevocation,
    resolvePrincipal: resolveCurrentPrincipal,
    lookupBoundary: candidateExamBoundary,
  },
): Promise<CandidateSessionBoundary> {
  if (await dependencies.isRevoked(hashSessionToken(token))) return { authenticated: false };
  const actor = await dependencies.resolvePrincipal(claims);
  if (!actor || actor.role !== "STUDENT") return { authenticated: false };
  return { authenticated: true, active: await dependencies.lookupBoundary(actor) };
}

/** Authenticated callers only. No cache: submission or deadline releases the next request. */
export async function candidateExamBoundary(actor: { userId: string; schoolId: string; campusId?: string | null }, now = new Date(), db: TxClient = prisma): Promise<CandidateExamBoundary | null> {
  return runWithTenantContext({ ...actor, role: "STUDENT" }, async () => {
    const student = await db.student.findFirst({ where: { schoolId: actor.schoolId, studentUserId: actor.userId, status: "active", archivedAt: null }, select: { id: true, campusId: true, classId: true } });
    if (!student) return null;
    const attempt = await db.schoolAiExamAttempt.findFirst({
      // Withdrawing exam access must not trap a learner on an inaccessible page.
      // Current pupil membership, not the cookie's campus claim, is authoritative.
      where: { schoolId: actor.schoolId, userId: actor.userId, studentId: student.id, campusId: student.campusId, status: "IN_PROGRESS", deadlineAt: { gt: now }, assignment: { status: "ACTIVE", mode: "STANDARD", classId: student.classId, studentIds: { array_contains: [student.id] } } },
      select: { id: true, assignmentId: true, deadlineAt: true },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    });
    return attempt ? { attemptId: attempt.id, assignmentId: attempt.assignmentId, deadlineAt: attempt.deadlineAt } : null;
  });
}
