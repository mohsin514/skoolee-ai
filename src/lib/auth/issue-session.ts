import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { JWT_SECRET } from "./secret";
import { SESSION_COOKIE_NAME, sessionCookieAttributes } from "./session-cookie";
import { recordLoginSession, hashToken, logSuperAdminAction } from "@/lib/audit";
import { prisma, RLS_ENABLED } from "@/lib/db/prisma";
import { withoutAutoAudit } from "@/lib/db/audit-trail";
import { invalidateAfterWrite, invalidationTargets } from "@/lib/auth/principal-cache";
import type { User } from "@prisma/client";

/**
 * `extra` marks a mid-session reissue (Settings 2FA change/disable): its `body`
 * is merged into the JSON, and the SUPER_ADMIN "login" row is skipped because
 * a reissue is not a sign-in (the manage audit row records the change).
 */
export type IssueSessionExtra = { reason: "mfa-change"; body?: Record<string, unknown> };
/** SKAI-1973: a caller that already loaded the user's school (password sign-in, MFA ticket) passes it to save a read. */
export type IssueSessionSchool = { name: string; slug: string; status: string };
export async function issueSession(user: User, days: number, mfaVerified: boolean | "deferred", req: Request, extra?: IssueSessionExtra, loadedSchool?: IssueSessionSchool | null) {
  const school = loadedSchool ?? await prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { name: true, slug: true, status: true } });
  const expiresAt = new Date(Date.now() + days * 86400_000);
  const token = await new SignJWT({ userId: user.id, accessVersion: user.accessVersion, email: user.email, fullName: user.fullName, role: user.role, schoolId: user.schoolId, campusId: user.campusId, schoolSlug: school.slug, schoolStatus: school.status, onboardingComplete: user.onboardingComplete, mustChangePassword: user.mustChangePassword, mfaVerified })
    .setJti(randomUUID()).setIssuedAt().setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${days}d`).sign(JWT_SECRET);
  await recordLoginSession({ userId: user.id, schoolId: user.schoolId, tokenHash: hashToken(token), expiresAt, userAgent: req.headers.get("user-agent") || undefined });
  await recordLastLogin(user);
  if (user.role === "SUPER_ADMIN" && !extra) await logSuperAdminAction({ userId: user.id, action: "login", status: "success", targetType: "user", targetName: user.email });
  const response = NextResponse.json({ ...extra?.body, success: true, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, schoolId: user.schoolId, campusId: user.campusId, schoolName: school.name, schoolStatus: school.status, onboardingComplete: user.onboardingComplete, mustChangePassword: user.mustChangePassword } });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieAttributes(days));
  return response;
}

/**
 * SKAI-1973: last_login is one scoped statement. No full-row pre-read, no RETURNING of every column (MFA secret
 * included) and no automatic audit row: the login_sessions row (and the SUPER_ADMIN login row) is this sign-in's
 * record. Prisma's updateMany wraps its UPDATE in BEGIN/COMMIT, so outside RLS mode it is a raw UPDATE pinned to the
 * user's own id and school. Under TENANT_RLS the guarded updateMany is kept, as it sets the tenant for the policy.
 * The value is UTC wall time, as Prisma stores DateTime in this TIMESTAMP(3) column.
 */
async function recordLastLogin(user: Pick<User, "id" | "schoolId">) {
  const lastLogin = new Date();
  const where = { id: user.id, schoolId: user.schoolId };
  if (RLS_ENABLED) {
    await withoutAutoAudit(() => prisma.user.updateMany({ where, data: { lastLogin } }));
    return;
  }
  await prisma.$executeRaw`UPDATE "users" SET "last_login" = ${lastLogin.toISOString()}::timestamp(3) WHERE "id" = ${user.id} AND "school_id" = ${user.schoolId}`;
  // The same principal-cache bump the guarded updateMany made (raw SQL bypasses the client extensions).
  const targets = invalidationTargets("User", "updateMany", { where, data: { lastLogin } });
  if (targets) await invalidateAfterWrite(targets);
}
