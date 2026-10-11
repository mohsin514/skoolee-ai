import { assertSameOrigin } from "@/lib/auth/same-origin";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { MFA_COOKIE, readMfaTicket } from "@/lib/auth/mfa-ticket";
import { newAuthenticatorSecret, protectSecret, revealSecret, checkTotp, newRecoveryCodes, recoveryHash, normalizeMfaCode, looksLikeRecoveryCode, MfaSecretUnavailableError, type TotpCheck } from "@/lib/auth/mfa-crypto";
import { issueSession } from "@/lib/auth/issue-session";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { ApiError } from "@/lib/api/scope";

/**
 * Every MFA failure is answered as `{ error, reason }` so the page can explain
 * what went wrong, and is recorded (audit row + warning) with the reason only:
 * never the code, the secret or a hash.
 */
type MfaReason = "invalid_code" | "clock_skew" | "code_reused" | "recovery_invalid" | "session_expired" | "setup_expired" | "secret_unavailable" | "rate_limited" | "invalid_request" | "server_error";
const FAILURES: Record<MfaReason, { status: number; message: string }> = {
  invalid_code: { status: 400, message: "That code didn't match. Enter the current 6-digit code from your authenticator app." },
  clock_skew: { status: 400, message: "That code is out of date. Make sure your phone sets its date and time automatically, then enter the current code." },
  code_reused: { status: 409, message: "That code was already used. Wait for the next code in your authenticator app." },
  recovery_invalid: { status: 400, message: "That recovery code isn't recognised or has already been used. Try another unused recovery code." },
  session_expired: { status: 401, message: "Your sign-in timed out. Sign in again to continue." },
  setup_expired: { status: 409, message: "This setup session has expired. Start setup again." },
  secret_unavailable: { status: 400, message: "Your authenticator can't be checked right now. Sign in with one of your recovery codes, or ask your administrator for help." },
  rate_limited: { status: 429, message: "Too many attempts. Wait five minutes, then try again." },
  invalid_request: { status: 400, message: "Complete verification and save your recovery instructions before continuing." },
  server_error: { status: 500, message: "Something went wrong. Try again." },
};
const TOTP_REASONS: Record<Exclude<TotpCheck, { ok: true }>["reason"], MfaReason> = { invalid: "invalid_code", skew: "clock_skew", reused: "code_reused" };
const NO_STORE = { "Cache-Control": "no-store" };

class MfaFailure extends Error {
  constructor(readonly reason: MfaReason, readonly auditAction?: string, message = FAILURES[reason].message, readonly status = FAILURES[reason].status) {
    super(message);
  }
}

type MfaUser = Awaited<ReturnType<typeof context>>["user"];

async function audit(user: MfaUser, action: string, reason?: MfaReason) {
  await prisma.auditLog.create({ data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: reason ? { action, reason } : { action } } });
}

async function failureResponse(error: unknown, user: MfaUser | undefined, action: unknown) {
  let failure: MfaFailure;
  if (error instanceof MfaFailure) failure = error;
  else if (error instanceof ApiError) failure = new MfaFailure("invalid_request", undefined, error.message, error.status);
  else {
    console.error("[auth/mfa]", error);
    failure = new MfaFailure("server_error");
  }
  console.warn("[auth/mfa]", { userId: user?.id ?? null, action: typeof action === "string" ? action : null, reason: failure.reason });
  if (user && failure.auditAction) {
    await audit(user, failure.auditAction, failure.reason).catch(auditError => console.error("[auth/mfa] audit write failed", auditError));
  }
  return NextResponse.json({ error: failure.message, reason: failure.reason }, { status: failure.status, headers: NO_STORE });
}

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

function reveal(value: string) {
  try {
    return revealSecret(value);
  } catch (error) {
    if (error instanceof MfaSecretUnavailableError) throw new MfaFailure("secret_unavailable", "mfa.secret.unavailable");
    throw error;
  }
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
        const changed = await prisma.user.updateMany({ where: { id: user.id, accessVersion: user.accessVersion, mfaEnabled: false, mfaPendingVerified: true, mfaPendingTicket: claims.ticketId, mfaPendingExpiresAt: { gt: new Date() } }, data: { mfaEnabled: true, mfaSecret: user.mfaPendingSecret, mfaPendingSecret: null, mfaPendingTicket: null, mfaPendingVerified: false, mfaPendingExpiresAt: null } });
        if (changed.count !== 1) throw new MfaFailure("setup_expired", undefined, "Setup changed. Sign in again.");
        await audit(user, "mfa.enrolled");
      } else if (action === "challenge" && ((user.mfaEnabled && user.mfaSecret) || resumable(user))) {
        // Resuming: the user proved possession at verify-setup and holds the recovery codes.
        // A second factor is still required, and promotion is atomic with its use.
        const resume = !user.mfaEnabled;
        const promotionGuard = resume ? { mfaEnabled: false, mfaPendingVerified: true, mfaPendingSecret: user.mfaPendingSecret } : {};
        const promotion = resume ? { mfaEnabled: true, mfaSecret: user.mfaPendingSecret, mfaPendingSecret: null, mfaPendingTicket: null, mfaPendingVerified: false, mfaPendingExpiresAt: null } : {};
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
      response.cookies.set(MFA_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    } catch (error) { return failureResponse(error, user, action); }
  });
}
