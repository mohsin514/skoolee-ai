// ─────────────────────────────────────────────────────────────────
// Email-verification tokens
//
// The verification link used to carry only the user's id, so anyone who
// knew or guessed an id could activate an account they did not own. The
// link now carries a short-lived signed token bound to that user, and
// /api/auth/verify accepts nothing else.
// ─────────────────────────────────────────────────────────────────
import { SignJWT, jwtVerify } from "jose";
import { JWT_SECRET } from "./secret";

const PURPOSE = "email-verification";
const TTL = "24h";

/** SKAI-84: each link carries its own id, so a resend can supersede every earlier link. */
export async function issueVerificationToken(userId: string) {
  const tokenId = crypto.randomUUID();
  const token = await new SignJWT({ userId, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(tokenId)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(JWT_SECRET);
  return { token, tokenId };
}

export async function createVerificationToken(userId: string) {
  return (await issueVerificationToken(userId)).token;
}

/** The user and link id the token was issued for, or null if it is not valid. */
export async function readVerificationToken(token: string): Promise<{ userId: string; tokenId: string | null } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.purpose !== PURPOSE || typeof payload.userId !== "string") return null;
    return { userId: payload.userId, tokenId: typeof payload.jti === "string" ? payload.jti : null };
  } catch {
    return null;
  }
}

/** Returns the user id the token was issued for, or null if it is not valid. */
export async function verifyVerificationToken(token: string): Promise<string | null> {
  return (await readVerificationToken(token))?.userId ?? null;
}

/** Audit action written after a resend is delivered; its `tokenId` names the only link still usable. */
export const VERIFICATION_RESENT_ACTION = "email_verification.resent";

/**
 * SKAI-84: once a resend has been delivered, only the newest link works. Before any resend
 * (or for resends logged before link ids existed) the register link is the current one.
 */
export const isCurrentVerificationLink = (tokenId: string | null, latestResentTokenId: string | null) =>
  latestResentTokenId === null || tokenId === latestResentTokenId;

/**
 * SKO-457: an account is waiting for email verification only when it is a self-registered owner
 * that is inactive and has never been verified. A deactivated account never matches, so neither a
 * verification link nor a resend request can bring it back.
 */
export const pendingVerificationWhere = { isActive: false, emailVerifiedAt: null, isInstitutionOwner: true } as const;

export const isPendingVerification = (user: { isActive: boolean; emailVerifiedAt: Date | null; isInstitutionOwner: boolean }) =>
  !user.isActive && !user.emailVerifiedAt && user.isInstitutionOwner;
