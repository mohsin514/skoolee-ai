import { assertSameOrigin } from "@/lib/auth/same-origin";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { MFA_COOKIE, readMfaTicket } from "@/lib/auth/mfa-ticket";
import { newAuthenticatorSecret, protectSecret, revealSecret, verifyTotp, newRecoveryCodes, recoveryHash } from "@/lib/auth/mfa-crypto";
import { issueSession } from "@/lib/auth/issue-session";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { ApiError, errorResponse } from "@/lib/api/scope";

async function context(req: NextRequest) {
  const claims = await readMfaTicket(req.cookies.get(MFA_COOKIE)?.value || "").catch(() => { throw new ApiError("Sign in again to continue", 401); });
  const user = await prisma.user.findFirst({ where: { id: claims.userId, schoolId: claims.schoolId, isActive: true }, include: { school: true, campus: { select: { schoolId: true } } } });
  if (!user || user.accessVersion !== claims.version || user.school.status === "DELETED" || (user.campus && user.campus.schoolId !== user.schoolId)) throw new ApiError("Sign in again to continue", 401);
  return { user, claims };
}
export async function GET(req: NextRequest) {
  return runUnscoped("MFA status: exact password-authenticated ticket", async () => {
    try { const { user, claims } = await context(req); return NextResponse.json({ enrolled: user.mfaEnabled, school: user.school.name, awaitingAcknowledgement: !user.mfaEnabled && user.mfaPendingVerified && user.mfaPendingTicket === claims.ticketId }, { headers: { "Cache-Control": "no-store" } }); }
    catch { return NextResponse.json({ error: "Sign in again to continue" }, { status: 401 }); }
  });
}
export async function POST(req: NextRequest) {
  return runUnscoped("MFA: exact password-authenticated ticket", async () => {
    try {
      assertSameOrigin(req);
      const { user, claims } = await context(req);
      if (!(await authRateLimit(`mfa:${user.id}`, { limit: 10, windowMs: 300_000 })).ok) throw new ApiError("Too many attempts. Wait five minutes, then try again.", 429);
      const body = await req.json(); const action = body.action;
      const audit = (action: string) => prisma.auditLog.create({ data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: { action } } });
      if (action === "setup" && !user.mfaEnabled) {
        const secret = newAuthenticatorSecret();
        await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaEnabled: false }, data: { mfaPendingSecret: protectSecret(secret), mfaPendingTicket: claims.ticketId, mfaPendingExpiresAt: new Date(Date.now() + 600_000), mfaPendingVerified: false, recoveryCodeHashes: [] } });
        return NextResponse.json({ secret, uri: `otpauth://totp/${encodeURIComponent(`Skoolee:${user.email}`)}?secret=${secret}&issuer=Skoolee&algorithm=SHA1&digits=6&period=30` }, { headers: { "Cache-Control": "no-store" } });
      }
      const pending = !user.mfaEnabled && user.mfaPendingTicket === claims.ticketId && user.mfaPendingExpiresAt && user.mfaPendingExpiresAt > new Date();
      if (action === "verify-setup" && pending && user.mfaPendingSecret && !user.mfaPendingVerified) {
        const step = verifyTotp(revealSecret(user.mfaPendingSecret), String(body.code || ""));
        if (step === null) throw new ApiError("Code not accepted. Check your authenticator clock and try again.", 400);
        const codes = newRecoveryCodes();
        const result = await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaEnabled: false, mfaPendingSecret: user.mfaPendingSecret, mfaPendingTicket: claims.ticketId, mfaPendingVerified: false, mfaPendingExpiresAt: { gt: new Date() } }, data: { mfaPendingVerified: true, recoveryCodeHashes: codes.map(recoveryHash), mfaLastStep: step } });
        if (result.count !== 1) throw new ApiError("Setup changed. Start again.", 409);
        return NextResponse.json({ recoveryCodes: codes }, { headers: { "Cache-Control": "no-store" } });
      }
      if (action === "acknowledge" && pending && user.mfaPendingVerified && user.mfaPendingSecret && body.acknowledged === true) {
        const changed = await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaEnabled: false, mfaPendingVerified: true, mfaPendingTicket: claims.ticketId, mfaPendingExpiresAt: { gt: new Date() } }, data: { mfaEnabled: true, mfaSecret: user.mfaPendingSecret, mfaPendingSecret: null, mfaPendingTicket: null, mfaPendingVerified: false, mfaPendingExpiresAt: null } });
        if (changed.count !== 1) throw new ApiError("Setup changed. Sign in again.", 409);
        await audit("mfa.enrolled");
      } else if (action === "challenge" && user.mfaEnabled && user.mfaSecret) {
        const code = String(body.code || "");
        if (body.recovery === true) {
          const hash = recoveryHash(code);
          if (!user.recoveryCodeHashes.includes(hash)) { await audit("mfa.recovery.failed"); throw new ApiError("Code not accepted. Try another unused recovery code or your authenticator.", 400); }
          const consumed = await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, recoveryCodeHashes: { equals: user.recoveryCodeHashes } }, data: { recoveryCodeHashes: user.recoveryCodeHashes.filter(value => value !== hash), accessVersion: { increment: 1 } } });
          if (consumed.count !== 1) throw new ApiError("Code already used. Sign in again.", 409);
          await prisma.loginSession.updateMany({ where: { userId: user.id }, data: { isActive: false, logoutAt: new Date() } });
          await audit("mfa.recovery.used");
        } else {
          const step = verifyTotp(revealSecret(user.mfaSecret), code, user.mfaLastStep);
          if (step === null) { await audit("mfa.challenge.failed"); throw new ApiError("Code not accepted. Try the next authenticator code or an unused recovery code.", 400); }
          const result = await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaEnabled: true, mfaLastStep: { lt: step } }, data: { mfaLastStep: step } });
          if (result.count !== 1) throw new ApiError("Code already used. Wait for the next code.", 409);
          await audit("mfa.challenge.succeeded");
        }
      } else { throw new ApiError("Complete verification and save your recovery instructions before continuing.", 400); }
      const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const expectedVersion = user.accessVersion + (action === "challenge" && body.recovery === true ? 1 : 0);
      if (!current.isActive || !current.mfaEnabled || current.accessVersion !== expectedVersion) throw new ApiError("Access changed. Sign in again.", 401);
      const response = await issueSession(current, claims.days, true, req);
      response.cookies.set(MFA_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    } catch (error) { return errorResponse(error, "[auth/mfa]"); }
  });
}
