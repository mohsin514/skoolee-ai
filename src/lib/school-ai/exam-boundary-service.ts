import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { accountAuthorityHolds, resolveCurrentPrincipal } from "@/lib/auth/principal";
import { candidateBoundaryRead, type CandidateBoundaryRow } from "@/lib/auth/request-auth";
import { checkRevocationStrict, decideRevocation, worthRetrying } from "@/lib/auth/session-revocation";
import { hashSessionToken } from "@/lib/auth/session-cookie";
import type { AuthUser } from "@/lib/auth";
import type { CandidateExamBoundary } from "./exam-boundary";
import { candidateMayBeInExam } from "./exam-active-marker";

type CandidateSessionClaims = Parameters<typeof resolveCurrentPrincipal>[0] & { role: "STUDENT" };
type CandidateSessionDependencies = {
  /**
   * SKAI-1971: when present, session, account and attempt come from this ONE read instead of the three lookups
   * below; the decisions on the rows are the same. Production uses candidateBoundaryRead.
   */
  readAll?: (tokenHash: string, claims: CandidateSessionClaims) => Promise<CandidateBoundaryRow>;
  isRevoked: (tokenHash: string) => Promise<boolean>;
  resolvePrincipal: typeof resolveCurrentPrincipal;
  lookupBoundary: (actor: AuthUser) => Promise<CandidateExamBoundary | null>;
  /** SKAI-1840: false only when Redis positively says this account has no exam marker. Omitted = always check. */
  mayBeInExam?: (userId: string) => Promise<boolean>;
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
    readAll: (tokenHash, claims) => candidateBoundaryRead(tokenHash, claims.userId, claims.schoolId),
    // Strict: an unavailable store must surface as "retry", never as a sign-out (SKAI-1063).
    isRevoked: checkRevocationStrict,
    resolvePrincipal: resolveCurrentPrincipal,
    lookupBoundary: candidateExamBoundary,
    mayBeInExam: candidateMayBeInExam,
  },
): Promise<CandidateSessionBoundary> {
  // No marker: no attempt can be active (see exam-active-marker.ts), so the proxy stays
  // optimistic here as it is for every other role; getAuthUser still rejects revoked sessions.
  if (dependencies.mayBeInExam && !(await dependencies.mayBeInExam(claims.userId))) return { authenticated: true, active: null };
  if (dependencies.readAll) return decideCandidateBoundary(await readOnceRetrying(dependencies.readAll, hashSessionToken(token), claims), claims);
  if (await dependencies.isRevoked(hashSessionToken(token))) return { authenticated: false };
  const actor = await dependencies.resolvePrincipal(claims);
  if (!actor || actor.role !== "STUDENT") return { authenticated: false };
  return { authenticated: true, active: await dependencies.lookupBoundary(actor) };
}

/** Revocation first, then current account authority (STUDENT only); the attempt is looked at only after both pass. */
export function decideCandidateBoundary(row: CandidateBoundaryRow, claims: CandidateSessionClaims): CandidateSessionBoundary {
  if (decideRevocation(row.sessions)) return { authenticated: false };
  if (!accountAuthorityHolds(row.account, claims) || row.account?.role !== "STUDENT") return { authenticated: false };
  return { authenticated: true, active: row.attempt };
}

/** checkRevocationStrict semantics (SKAI-1063/1962): one retry for a dropped connection, none when saturated; errors propagate as 503. */
async function readOnceRetrying(read: NonNullable<CandidateSessionDependencies["readAll"]>, tokenHash: string, claims: CandidateSessionClaims): Promise<CandidateBoundaryRow> {
  try {
    return await read(tokenHash, claims);
  } catch (error) {
    if (!worthRetrying(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
    return read(tokenHash, claims);
  }
}

/** Authenticated callers only. No cache: submission or deadline releases the next request. */
export async function candidateExamBoundary(actor: { userId: string; schoolId: string; campusId?: string | null }, now = new Date(), db: TxClient = prisma): Promise<CandidateExamBoundary | null> {
  return runWithTenantContext({ ...actor, role: "STUDENT" }, async () => {
    const student = await db.student.findFirst({ where: { schoolId: actor.schoolId, studentUserId: actor.userId, status: "active", archivedAt: null }, select: { id: true, campusId: true, classId: true } });
    if (!student) return null;
    const attempt = await db.schoolAiExamAttempt.findFirst({
      // Withdrawing exam access must not trap a learner on an inaccessible page.
      // Current pupil membership, not the cookie's campus claim, is authoritative.
      where: { schoolId: actor.schoolId, userId: actor.userId, studentId: student.id, campusId: student.campusId, status: "IN_PROGRESS", deadlineAt: { gt: now }, assignment: { status: "ACTIVE", mode: { in: ["STANDARD", "SECURE_BROWSER"] }, classId: student.classId, studentIds: { array_contains: [student.id] } } },
      select: { id: true, assignmentId: true, deadlineAt: true },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    });
    return attempt ? { attemptId: attempt.id, assignmentId: attempt.assignmentId, deadlineAt: attempt.deadlineAt } : null;
  });
}
