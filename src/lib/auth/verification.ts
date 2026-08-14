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

export async function createVerificationToken(userId: string) {
  return new SignJWT({ userId, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(JWT_SECRET);
}

/** Returns the user id the token was issued for, or null if it is not valid. */
export async function verifyVerificationToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.purpose !== PURPOSE) return null;
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}
