import { assertSameOrigin } from "@/lib/auth/same-origin";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { MFA_COOKIE, readMfaTicket } from "@/lib/auth/mfa-ticket";
import { newAuthenticatorSecret, protectSecret, checkTotp, newRecoveryCodes, recoveryHash, normalizeMfaCode, looksLikeRecoveryCode } from "@/lib/auth/mfa-crypto";
import { issueSession } from "@/lib/auth/issue-session";
import { applySignInLanguage } from "@/lib/locale/sign-in-language";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { MfaFailure, NO_STORE, TOTP_REASONS, audit as auditWith, failureResponse as respondWithFailure, reveal } from "@/lib/auth/mfa-failure";

type MfaUser = Awaited<ReturnType<typeof context>>["user"];

const audit = (user: MfaUser, action: string) => auditWith(prisma, user, action);
const failureResponse = (error: unknown, user: MfaUser | undefined, action: unknown) => respondWithFailure(error, user, action, "[auth/mfa]", prisma);

async function context(req: NextRequest) {
  const claims = await readMfaTicket(req.cookies.get(MFA_COOKIE)?.value || "").catch(() => { throw new MfaFailure("session_expired"); });
  const user = await prisma.user.findFirst({ where: { id: claims.userId, schoolId: claims.schoolId, isActive: true }, include: { school: true, campus: { select: { schoolId: true } } } });
  if (!user || user.accessVersion !== claims.version || user.school.status === "DELETED" || (user.campus && user.campus.schoolId !== user.schoolId)) throw new MfaFailure("session_expired");
  return { user, claims };
}

/** Verified during setup but never acknowledged (tab closed, ticket expired): finished by a normal challenge. */
function resumable(user: MfaUser) {
  return !user.mfaEnabled && user.mfaPendingVerified && Boolean(user.mfaPendingSecret);
}

export async function GET(req: NextRequest) {
  return runUnscoped("MFA status: exact password-authenticated ticket", async () => {
    let user: MfaUser | undefined;
    try {
      const resolved = await context(req); user = resolved.user;
      return NextResponse.json({
        enrolled: user.mfaEnabled,
        school: user.school.name,
        awaitingAcknowledgement: !user.mfaEnabled && user.mfaPendingVerified && user.mfaPendingTicket === resolved.claims.ticketId,
        resumeChallenge: resumable(user),
      }, { headers: NO_STORE });
    } catch (error) { return failureResponse(error, user, "status"); }
  });
}
export async function POST(req: NextRequest) {
  return runUnscoped("MFA: exact password-authenticated ticket", async () => {
    let user: MfaUser | undefined;
    let action: unknown;
    try {
      assertSameOrigin(req);
      const resolved = await context(req); user = resolved.user;
      const { claims } = resolved;
      if (!(await authRateLimit(`mfa:${user.id}`, { limit: 10, windowMs: 300_000 })).ok) throw new MfaFailure("rate_limited");
      const body = await req.json().catch(() => ({}));
      action = body.action;
      if (action === "setup" && !user.mfaEnabled) {
        const secret = newAuthenticatorSecret();
        await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaEnabled: false }, data: { mfaPendingSecret: protectSecret(secret), mfaPendingTicket: claims.ticketId, mfaPendingExpiresAt: new Date(Date.now() + 600_000), mfaPendingVerified: false, recoveryCodeHashes: [] } });
        return NextResponse.json({ secret, uri: `otpauth://totp/${encodeURIComponent(`Skoolee:${user.email}`)}?secret=${secret}&issuer=Skoolee&algorithm=SHA1&digits=6&period=30` }, { headers: NO_STORE });
      }
      // "Do it later": a privileged account that has not enrolled yet may sign in now
      // and set up from Account security. Never available once a factor exists.
      if (action === "defer" && !user.mfaEnabled && !resumable(user)) {
        await audit(user, "mfa.setup.deferred");
        const response = await issueSession(user, claims.days, "deferred", req);
        await applySignInLanguage(user, body, response);
        response.cookies.set(MFA_COOKIE, "", { path: "/", maxAge: 0 });
        return response;
      }
      const pending = !user.mfaEnabled && user.mfaPendingTicket === claims.ticketId && user.mfaPendingExpiresAt && user.mfaPendingExpiresAt > new Date();
      if ((action === "verify-setup" || action === "acknowledge") && !user.mfaEnabled && !pending) throw new MfaFailure("setup_expired");
      if (action === "verify-setup" && pending && user.mfaPendingSecret && !user.mfaPendingVerified) {
        const check = checkTotp(reveal(user.mfaPendingSecret), normalizeMfaCode(body.code));
        if (!check.ok) throw new MfaFailure(TOTP_REASONS[check.reason], "mfa.setup.failed");
        const codes = newRecoveryCodes();
        const result = await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaEnabled: false, mfaPendingSecret: user.mfaPendingSecret, mfaPendingTicket: claims.ticketId, mfaPendingVerified: false, mfaPendingExpiresAt: { gt: new Date() } }, data: { mfaPendingVerified: true, recoveryCodeHashes: codes.map(recoveryHash), mfaLastStep: check.step } });
        if (result.count !== 1) throw new MfaFailure("setup_expired", undefined, "Setup changed. Start again.");
        return NextResponse.json({ recoveryCodes: codes }, { headers: NO_STORE });
      }
      let recoveryUsed = false;
      if (action === "acknowledge" && pending && user.mfaPendingVerified && user.mfaPendingSecret && body.acknowledged === true) {
        const changed = await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaEnabled: false, mfaPendingVerified: true, mfaPendingTicket: claims.ticketId, mfaPendingExpiresAt: { gt: new Date() } }, data: { mfaEnabled: true, mfaSecret: user.mfaPendingSecret, mfaEnrolledAt: new Date(), mfaPendingSecret: null, mfaPendingTicket: null, mfaPendingVerified: false, mfaPendingExpiresAt: null } });
        if (changed.count !== 1) throw new MfaFailure("setup_expired", undefined, "Setup changed. Sign in again.");
        await audit(user, "mfa.enrolled");
      } else if (action === "challenge" && ((user.mfaEnabled && user.mfaSecret) || resumable(user))) {
        // Resuming: the user proved possession at verify-setup and holds the recovery codes.
        // A second factor is still required, and promotion is atomic with its use.
        const resume = !user.mfaEnabled;
        const promotionGuard = resume ? { mfaEnabled: false, mfaPendingVerified: true, mfaPendingSecret: user.mfaPendingSecret } : {};
        const promotion = resume ? { mfaEnabled: true, mfaSecret: user.mfaPendingSecret, mfaEnrolledAt: new Date(), mfaPendingSecret: null, mfaPendingTicket: null, mfaPendingVerified: false, mfaPendingExpiresAt: null } : {};
        const code = normalizeMfaCode(body.code);
        if (body.recovery === true || looksLikeRecoveryCode(code)) {
          const hash = recoveryHash(code);
          if (!user.recoveryCodeHashes.includes(hash)) throw new MfaFailure("recovery_invalid", "mfa.recovery.failed");
          const consumed = await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, recoveryCodeHashes: { equals: user.recoveryCodeHashes }, ...promotionGuard }, data: { recoveryCodeHashes: user.recoveryCodeHashes.filter(value => value !== hash), accessVersion: { increment: 1 }, ...promotion } });
          if (consumed.count !== 1) throw new MfaFailure("code_reused", "mfa.recovery.failed", "That recovery code was just used. Sign in again.");
          recoveryUsed = true;
          await prisma.loginSession.updateMany({ where: { userId: user.id }, data: { isActive: false, logoutAt: new Date() } });
          if (resume) await audit(user, "mfa.enrolled");
          await audit(user, "mfa.recovery.used");
        } else {
          const check = checkTotp(reveal(resume ? user.mfaPendingSecret! : user.mfaSecret!), code, user.mfaLastStep);
          if (!check.ok) throw new MfaFailure(TOTP_REASONS[check.reason], "mfa.challenge.failed");
          const result = await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaLastStep: { lt: check.step }, ...(resume ? promotionGuard : { mfaEnabled: true }) }, data: { mfaLastStep: check.step, ...promotion } });
          if (result.count !== 1) throw new MfaFailure("code_reused", "mfa.challenge.failed");
          if (resume) await audit(user, "mfa.enrolled");
          await audit(user, "mfa.challenge.succeeded");
        }
      } else { throw new MfaFailure("invalid_request"); }
      const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const expectedVersion = user.accessVersion + (recoveryUsed ? 1 : 0);
      if (!current.isActive || !current.mfaEnabled || current.accessVersion !== expectedVersion) throw new MfaFailure("session_expired", undefined, "Access changed. Sign in again.");
      const response = await issueSession(current, claims.days, true, req);
      await applySignInLanguage(current, body, response);
      response.cookies.set(MFA_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    } catch (error) { return failureResponse(error, user, action); }
  });
}
