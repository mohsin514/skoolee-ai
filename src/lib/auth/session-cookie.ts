// ─────────────────────────────────────────────────────────────────
// The session cookie: its name, its attributes, and how its value is
// hashed for storage.
//
// Deliberately dependency-free (node:crypto only). No Prisma, no
// next/headers. That is what lets proxy.ts, the login route, the
// onboarding server actions and the test harness all share one
// definition instead of each spelling it out again.
//
// Why this file exists at all: the cookie was created in four places
// and destroyed in three, each with its own hand-written attribute
// list. Logout cleared it with `{ maxAge: 0, path: "/" }` while login
// set it with httpOnly/secure/sameSite as well. Browsers happen to
// match on name and path alone, so it worked — but "happens to work,
// for reasons nobody restated at any of the seven call sites" is the
// kind of thing that stops working during an unrelated change.
// ─────────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";

export const SESSION_COOKIE_NAME = "skoolee_token";

/** Session lengths, in days. `rememberMe` is the only thing that picks. */
export const SESSION_DAYS = { default: 7, remembered: 30 } as const;

/**
 * What gets stored in LoginSession.tokenHash.
 *
 * The raw JWT is a bearer credential: holding it is holding the session, so a
 * table of them would be a table of live passwords. SHA-256 is the right shape
 * here (not bcrypt) because lookup is by exact hash on every request and the
 * input is already 200+ bits of signed, unguessable material — there is no
 * dictionary to slow an attacker down to.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * True when cookies must carry `Secure`.
 *
 * Keyed off NODE_ENV rather than the request scheme because that is what every
 * existing call site already did, and changing it would quietly log everyone
 * out of any deployment terminating TLS upstream while reporting development.
 */
// Not named useSecureCookies(): the `use` prefix makes the React hooks lint
// rule treat a plain predicate as a hook call.
function shouldUseSecureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

export interface SessionCookieAttributes {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/**
 * The canonical attribute set.
 *
 * - `httpOnly`  — script must never be able to read a session token.
 * - `sameSite: "lax"` — sent on top-level navigation (so a link into the app
 *   stays signed in) but not on cross-site subrequests.
 * - `path: "/"` — the whole app is behind this one cookie.
 */
export function sessionCookieAttributes(days: number): SessionCookieAttributes {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * days,
  };
}

/**
 * The same attributes with `maxAge: 0`.
 *
 * Mirroring matters: a browser matches a replacement cookie on name, domain
 * and path, so the tear-down must agree with the thing it is tearing down. It
 * also means one place to change if the attributes ever move.
 */
export function clearedSessionCookieAttributes(): SessionCookieAttributes {
  return { ...sessionCookieAttributes(0), maxAge: 0 };
}
