import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { JWT_SECRET } from "./secret";
import { NextResponse } from "next/server";
import { sessionCookieAttributes, SESSION_COOKIE_NAME, clearedSessionCookieAttributes } from "./session-cookie";
import type { User } from "@prisma/client";
export const MFA_COOKIE = "skoolee-mfa";
export async function startMfa(user: User, days: number) {
  const ticket = await new SignJWT({ purpose: "mfa", userId: user.id, schoolId: user.schoolId, accessVersion: user.accessVersion, days })
    .setJti(randomUUID()).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(JWT_SECRET);
  const response = NextResponse.json({ mfaRequired: true, user: { mfaRequired: true } });
  response.cookies.set(MFA_COOKIE, ticket, { ...sessionCookieAttributes(1), maxAge: 600 });
  response.cookies.set(SESSION_COOKIE_NAME, "", clearedSessionCookieAttributes());
  return response;
}
export async function readMfaTicket(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (payload.purpose !== "mfa" || typeof payload.userId !== "string" || typeof payload.schoolId !== "string" || !payload.jti) throw new Error("Sign in again to continue");
  return { userId: payload.userId, schoolId: payload.schoolId, version: payload.accessVersion, ticketId: payload.jti, days: payload.days === 30 ? 30 : 7 };
}
