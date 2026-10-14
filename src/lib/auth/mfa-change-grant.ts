import { SignJWT, jwtVerify } from "jose";
import { JWT_SECRET } from "./secret";

/**
 * Proof that this browser passed re-authentication for an authenticator change
 * (or enable) started from Settings. Mirrors mfa-ticket.ts: an HS256 JWT in an
 * httpOnly cookie, so page script can never read the grant. It names the
 * pending row (`nonce` = `mfaPendingTicket`) and the `accessVersion` it was
 * issued against, so any security change in between invalidates it.
 */
export const MFA_CHANGE_COOKIE = "skoolee-mfa-change";
export const MFA_CHANGE_TTL_SECONDS = 600;
export type MfaChangeMode = "change" | "enable";
export interface ChangeGrant {
  userId: string;
  schoolId: string;
  accessVersion: number;
  nonce: string;
  mode: MfaChangeMode;
}

export function mfaChangeCookieAttributes(maxAge = MFA_CHANGE_TTL_SECONDS) {
  return { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/api/account/mfa", maxAge };
}

export async function signChangeGrant(grant: ChangeGrant) {
  return new SignJWT({ purpose: "mfa-change", ...grant })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MFA_CHANGE_TTL_SECONDS}s`).sign(JWT_SECRET);
}

/** Throws on a missing, expired, tampered or wrong-purpose token; the caller maps that to `setup_expired`. */
export async function readChangeGrant(token: string): Promise<ChangeGrant> {
  const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
  if (payload.purpose !== "mfa-change" || typeof payload.userId !== "string" || typeof payload.schoolId !== "string" || typeof payload.accessVersion !== "number" || typeof payload.nonce !== "string" || (payload.mode !== "change" && payload.mode !== "enable")) {
    throw new Error("Not an MFA change grant");
  }
  return { userId: payload.userId, schoolId: payload.schoolId, accessVersion: payload.accessVersion, nonce: payload.nonce, mode: payload.mode };
}
