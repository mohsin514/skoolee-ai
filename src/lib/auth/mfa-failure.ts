import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/scope";
import { MfaSecretUnavailableError, revealSecret, type TotpCheck } from "@/lib/auth/mfa-crypto";
import type { TxClient } from "@/lib/db/prisma";

/**
 * Every MFA failure is answered as `{ error, reason }` so the page can explain
 * what went wrong, and is recorded (audit row + warning) with the reason only:
 * never the code, the secret or a hash.
 *
 * Shared by the sign-in MFA route (/api/auth/mfa) and the Settings manage
 * route (/api/account/mfa), so both speak the same reason codes.
 */
export type MfaReason =
  | "invalid_code" | "clock_skew" | "code_reused" | "recovery_invalid" | "session_expired" | "setup_expired" | "secret_unavailable" | "rate_limited" | "invalid_request" | "server_error"
  | "password_invalid" | "mfa_required" | "state_changed";
export const FAILURES: Record<MfaReason, { status: number; message: string }> = {
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
  password_invalid: { status: 400, message: "That password isn't correct." },
  mfa_required: { status: 403, message: "Two-factor authentication is required for your role and can't be turned off." },
  state_changed: { status: 409, message: "Your security settings changed in another tab or device. Reload and try again." },
};
export const TOTP_REASONS: Record<Exclude<TotpCheck, { ok: true }>["reason"], MfaReason> = { invalid: "invalid_code", skew: "clock_skew", reused: "code_reused" };
export const NO_STORE = { "Cache-Control": "no-store" };

export class MfaFailure extends Error {
  constructor(readonly reason: MfaReason, readonly auditAction?: string, message = FAILURES[reason].message, readonly status = FAILURES[reason].status) {
    super(message);
  }
}

/** The only user fields an audit row or failure log needs. */
export type MfaAuditUser = { id: string; schoolId: string };
/** Any client with an `auditLog` delegate: `prisma`, or the `tx` of a `$transaction` so the row rolls back with the write. */
export type AuditClient = Pick<TxClient, "auditLog">;

export async function audit(db: AuditClient, user: MfaAuditUser, action: string, reason?: MfaReason) {
  await db.auditLog.create({ data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: reason ? { action, reason } : { action } } });
}

/**
 * Logs the failure (reason only) and answers `{ error, reason }` with no-store.
 * `db` writes the failure's audit row; omit it when the caller already audited
 * (the manage core writes its own failure audits through its injected client).
 */
export async function failureResponse(error: unknown, user: MfaAuditUser | undefined, action: unknown, logTag: string, db?: AuditClient) {
  let failure: MfaFailure;
  if (error instanceof MfaFailure) failure = error;
  else if (error instanceof ApiError) failure = new MfaFailure("invalid_request", undefined, error.message, error.status);
  else {
    console.error(logTag, error);
    failure = new MfaFailure("server_error");
  }
  console.warn(logTag, { userId: user?.id ?? null, action: typeof action === "string" ? action : null, reason: failure.reason });
  if (db && user && failure.auditAction) {
    await audit(db, user, failure.auditAction, failure.reason).catch(auditError => console.error(`${logTag} audit write failed`, auditError));
  }
  return NextResponse.json({ error: failure.message, reason: failure.reason }, { status: failure.status, headers: NO_STORE });
}

/** Decrypts a stored secret; a secret encrypted under another deployment's key becomes `secret_unavailable`. */
export function reveal(value: string) {
  try {
    return revealSecret(value);
  } catch (error) {
    if (error instanceof MfaSecretUnavailableError) throw new MfaFailure("secret_unavailable", "mfa.secret.unavailable");
    throw error;
  }
}
