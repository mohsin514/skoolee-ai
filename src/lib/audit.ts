import { prisma } from "@/lib/db/prisma";
import { headers } from "next/headers";
import { createHash } from "crypto";
import { runWithTenantContext } from "@/lib/db/tenant-context";

export async function logSuperAdminAction(params: {
  userId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  oldValues?: any;
  newValues?: any;
  status?: string;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  let ip = params.ipAddress;
  let ua = params.userAgent;

  if (!ip || !ua) {
    try {
      const h = await headers();
      ip = ip || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
      ua = ua || h.get("user-agent") || undefined;
    } catch {
      // headers() may throw outside request context
    }
  }

  await prisma.superAdminAuditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName,
      oldValues: params.oldValues,
      newValues: params.newValues,
      ipAddress: ip,
      userAgent: ua,
      status: params.status || "success",
      errorMessage: params.errorMessage,
    },
  });
}

/**
 * Re-exported so the existing call sites keep working. The implementation moved
 * to session-cookie.ts, which has no dependencies, so proxy.ts and the test
 * harness can hash a token without pulling in Prisma or next/headers. One
 * implementation matters here more than most places: a session is looked up by
 * this value, so two spellings of it would mean rows that can never be found.
 */
export { hashSessionToken as hashToken } from "@/lib/auth/session-cookie";

export async function recordLoginSession(params: {
  userId: string;
  schoolId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}) {
  let ip = params.ipAddress;
  let ua = params.userAgent;

  if (!ip || !ua) {
    try {
      const h = await headers();
      ip = ip || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
      ua = ua || h.get("user-agent") || undefined;
    } catch {}
  }

  // Called from the login handler, which runs unscoped because the school
  // is not known until the account is found. Bind it explicitly here.
  await runWithTenantContext({ schoolId: params.schoolId, userId: params.userId }, () =>
    prisma.loginSession.create({
      data: {
        userId: params.userId,
        schoolId: params.schoolId,
        tokenHash: params.tokenHash,
        ipAddress: ip,
        userAgent: ua,
        expiresAt: params.expiresAt,
      },
    })
  );
}

/**
 * Replaces the session row when a flow issues a fresh token mid-session.
 *
 * Three flows re-mint the cookie without the user signing in again — the forced
 * password change and the two onboarding completions — and none of them touched
 * login_sessions. That left a row keyed to a token nobody holds any more, still
 * marked active, while the token actually in the browser had no row at all. The
 * consequences compound: the stale row sits in the owner and super consoles'
 * active-session lists permanently and "terminate" cannot reach it, and the
 * live session is invisible there and unrevocable, because revocation works by
 * closing a row that in this case was never written.
 *
 * Deliberately swallows its own failures. Session bookkeeping must never be the
 * reason a password change or an onboarding completion fails; a missing row
 * degrades to an unrevocable session, which is the pre-existing behaviour, not
 * a regression.
 */
export async function rotateLoginSession(params: {
  /** The token being replaced, if there is one. */
  previousToken?: string;
  token: string;
  userId: string;
  schoolId: string;
  expiresAt: Date;
}) {
  const { endSession } = await import("@/lib/auth/session-revocation");
  const { hashSessionToken } = await import("@/lib/auth/session-cookie");

  try {
    if (params.previousToken) await endSession(params.previousToken);

    await recordLoginSession({
      userId: params.userId,
      schoolId: params.schoolId,
      tokenHash: hashSessionToken(params.token),
      expiresAt: params.expiresAt,
    });
  } catch (error) {
    console.warn("[audit] could not rotate the login session record", error);
  }
}
