import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { JWT_SECRET } from "./secret";
import { SESSION_COOKIE_NAME, sessionCookieAttributes } from "./session-cookie";
import { recordLoginSession, hashToken, logSuperAdminAction } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@prisma/client";

export async function issueSession(user: User, days: number, mfaVerified: boolean, req: Request) {
  const school = await prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { name: true, slug: true, status: true } });
  const expiresAt = new Date(Date.now() + days * 86400_000);
  const token = await new SignJWT({ userId: user.id, accessVersion: user.accessVersion, email: user.email, fullName: user.fullName, role: user.role, schoolId: user.schoolId, campusId: user.campusId, schoolSlug: school.slug, schoolStatus: school.status, onboardingComplete: user.onboardingComplete, mustChangePassword: user.mustChangePassword, mfaVerified })
    .setJti(randomUUID()).setIssuedAt().setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${days}d`).sign(JWT_SECRET);
  await recordLoginSession({ userId: user.id, schoolId: user.schoolId, tokenHash: hashToken(token), expiresAt, userAgent: req.headers.get("user-agent") || undefined });
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  if (user.role === "SUPER_ADMIN") await logSuperAdminAction({ userId: user.id, action: "login", status: "success", targetType: "user", targetName: user.email });
  const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, schoolId: user.schoolId, campusId: user.campusId, schoolName: school.name, schoolStatus: school.status, onboardingComplete: user.onboardingComplete, mustChangePassword: user.mustChangePassword } });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieAttributes(days));
  return response;
}
