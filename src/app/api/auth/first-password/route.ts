// ─────────────────────────────────────────────────────────────────
// PUT /api/auth/first-password
//
// Completes a forced password change for an account that was
// provisioned by the APP_OWNER with a generated temporary password.
//
// The current password is not required: the caller already proved
// possession of it by logging in, and this route only works while
// mustChangePassword is still true. Once cleared, it is a no-op.
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";

import { JWT_SECRET } from "@/lib/auth/secret";
import { rotateLoginSession } from "@/lib/audit";
import {
  SESSION_COOKIE_NAME,
  SESSION_DAYS,
  sessionCookieAttributes,
} from "@/lib/auth/session-cookie";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { resetPasswordProblem } from "@/lib/auth/reset-password-policy";

/** SKAI-87: stable codes the first-login page localizes; `error` stays as an English fallback. */
const fail = (code: string, error: string, status: number) => Response.json({ error, code }, { status });

export async function PUT(req: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Captured before the new token is minted below, so the row belonging to
    // the token being replaced can be closed rather than orphaned.
    const previousToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

    const { newPassword } = await parseBody(req, jsonObjectBody, { preserve: ["newPassword"] });
    // SKAI-87: the same policy as password reset, so neither path accepts a weaker password.
    const problem = resetPasswordProblem(newPassword);
    if (problem || typeof newPassword !== "string") return fail("policy", problem ?? "Invalid password", 400);
    // Each attempt costs bcrypt comparisons against the history below; cap it per account.
    if (!(await authRateLimit(`first-password:${auth.userId}`, { limit: 5, windowMs: 300_000 })).ok) {
      return fail("limited", "Wait five minutes before trying again", 429);
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { school: true },
    });
    // One answer for a missing account and a cleared flag: nothing about the account leaks.
    if (!user?.password || !user.mustChangePassword) {
      return fail("not_pending", "No password change is pending", 409);
    }
    const temporaryHash = user.password;

    // The temporary password and the last five are all refused, as on change-password.
    const history = await prisma.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { oldPasswordHash: true },
    });
    for (const hash of [temporaryHash, ...history.map((entry) => entry.oldPasswordHash)]) {
      if (await bcrypt.compare(newPassword, hash)) {
        return fail("reused", "Choose a password you have not used before", 400);
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    // The pending flag is the claim: a replayed or concurrent submit matches no row and
    // changes nothing, so history and sessions are only touched once.
    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.user.updateMany({
        where: { id: user.id, mustChangePassword: true, accessVersion: user.accessVersion },
        data: {
          password: hashed,
          accessVersion: { increment: 1 },
          mustChangePassword: false,
          lastPasswordChange: now,
        },
      });
      if (claim.count !== 1) return false;
      await tx.loginSession.updateMany({ where: { userId: user.id }, data: { isActive: false, logoutAt: now } });
      await tx.passwordHistory.create({
        data: { userId: user.id, oldPasswordHash: temporaryHash, changedBy: user.id, changeReason: "admin_forced" },
      });
      await tx.auditLog.create({
        data: {
          schoolId: user.schoolId,
          userId: user.id,
          tableName: "account_security",
          recordId: user.id,
          newValue: { action: "first_password.completed", sessionsRevoked: true },
        },
      });
      return true;
    }, { maxWait: 10_000, timeout: 20_000 });
    if (!claimed) return fail("not_pending", "No password change is pending", 409);

    // Re-issue the token so mustChangePassword is false in the cookie —
    // otherwise the proxy would keep redirecting back to /first-login.
    const token = await new SignJWT({
      mfaVerified: auth.mfaVerified ?? false,
      userId: user.id,
      accessVersion: user.accessVersion + 1,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      schoolId: user.schoolId,
      campusId: user.campusId,
      schoolSlug: user.school?.slug,
      schoolStatus: user.school?.status,
      onboardingComplete: user.onboardingComplete,
      mustChangePassword: false,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    // Close the replaced session and record the new one, so the session stays
    // revocable across the re-mint and the active-session lists stay honest.
    await rotateLoginSession({
      previousToken,
      token,
      userId: user.id,
      schoolId: user.schoolId,
      expiresAt: new Date(Date.now() + SESSION_DAYS.default * 24 * 60 * 60 * 1000),
    });

    const res = NextResponse.json({
      success: true,
      role: user.role,
      onboardingComplete: user.onboardingComplete,
    });

    res.cookies.set(
      SESSION_COOKIE_NAME,
      token,
      sessionCookieAttributes(SESSION_DAYS.default)
    );

    return res;
  } catch (error) {
    // Input rejected by the validation boundary keeps its 4xx instead of a generic 500.
    if (error instanceof ApiError) return errorResponse(error);
    console.error("[auth/first-password]", error);
    return Response.json({ error: "Could not update password" }, { status: 500 });
  }
}
