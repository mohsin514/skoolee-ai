// ─────────────────────────────────────────────────────────────────
// Server-side session revocation.
//
// The session cookie is a signed JWT with a 7- or 30-day expiry. Signature
// verification proves the server minted it; it proves nothing about whether the
// session is still meant to exist. So logging out could only ever make the
// *browser* forget — a token captured beforehand kept full access for its whole
// lifetime, and LoginSession.isActive, which logout had been dutifully writing
// since long before this, was read by nothing.
//
// This module is the missing read. It is deliberately kept apart from
// session-cookie.ts (which stays dependency-free for proxy.ts) and imports
// next/headers only lazily, so the decision logic can be unit-tested in a plain
// Node process.
// ─────────────────────────────────────────────────────────────────
import { cache } from "react";

import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session-cookie";

/** The only column the decision needs. */
export interface SessionActivityRow {
  isActive: boolean;
}

export type SessionLookup = (tokenHash: string) => Promise<SessionActivityRow[]>;

/**
 * Revoked means "we have a record of this session, and it is closed".
 *
 * The absence of a row is NOT revocation, and that asymmetry is the most
 * important thing in this file. Three separate flows — the forced password
 * change and both onboarding completions — mint a cookie without recording a
 * session row, `recordLoginSession` is fire-and-forget so any hiccup at login
 * silently skips it, and there were already 150 rows in the dev database from
 * before any of this was enforced. Treating "no row" as revoked would sign all
 * of those people out at once, which is a far worse failure than the one being
 * fixed.
 *
 * Multiple rows can share a tokenHash (the column is indexed, not unique), so
 * the rule is "revoked once nothing is left open" rather than a single-row read.
 */
export function decideRevocation(rows: SessionActivityRow[]): boolean {
  if (rows.length === 0) return false;
  return rows.every((row) => !row.isActive);
}

/**
 * Reads the session rows for a hash.
 *
 * Unscoped, and filtered by tokenHash alone. The tenant guard would otherwise
 * demand a schoolId, and there isn't one to give: this runs before the caller is
 * known to be a valid session at all, and it must also work for a token whose
 * payload can no longer be decoded. A SHA-256 of a signed JWT is not a value
 * one tenant can guess for another, so the hash is doing the scoping.
 *
 * `take` is a cheap bound on a pathological hash collision; nothing should ever
 * produce more than a handful of rows here.
 */
const lookupSessionRows: SessionLookup = (tokenHash) =>
  runUnscoped("reading login_sessions to check whether a token was revoked", () =>
    prisma.loginSession.findMany({
      where: { tokenHash },
      select: { isActive: true },
      take: 10,
    })
  );

/**
 * Uncached, injectable core. Split out from `isSessionRevoked` so every branch
 * — including the database failure — is reachable from a unit test without a
 * live database or a mutable module-level seam.
 */
export async function checkRevocation(
  tokenHash: string,
  lookup: SessionLookup = lookupSessionRows
): Promise<boolean> {
  try {
    return decideRevocation(await lookup(tokenHash));
  } catch (error) {
    // Fails open, on purpose. This check runs on the path of essentially every
    // authenticated request, so a database blip that answered "revoked" would
    // sign out every user of the platform simultaneously. Logged loudly,
    // because silently degrading an authorisation check is how it stays broken.
    console.warn(
      "[session-revocation] could not check whether the session was revoked; " +
        "allowing the request to proceed",
      error
    );
    return false;
  }
}

/**
 * Production entry point, memoised for the duration of one request.
 *
 * React's `cache` is what the Next authentication guide prescribes for a data
 * access layer: getAuthUser() is called many times across a single render pass
 * (layouts, pages, and the route handlers underneath), and without this each
 * call would repeat the same lookup. Outside a request scope it degrades to
 * simply not memoising, which is correct rather than fatal.
 */
export const isSessionRevoked = cache(
  async (tokenHash: string): Promise<boolean> => checkRevocation(tokenHash)
);

/**
 * Closes the session a token belongs to.
 *
 * Notably it does NOT verify the JWT first. The previous implementation did,
 * inside a try whose catch was empty, so signing out with an already-expired
 * cookie threw before reaching the update and left the row open forever. The
 * hash is all that is needed, and only the holder of the token can produce it,
 * so verification bought nothing and cost the tear-down.
 *
 * Awaited by its callers, unlike the fire-and-forget update it replaces: the
 * response that tells the browser "you are signed out" should not be able to
 * arrive before the session it describes is actually closed.
 *
 * Never throws. A failure here must not strand a user mid-logout — the cookie
 * still gets cleared and they still reach /login.
 */
export async function endSession(token: string): Promise<{ closed: number }> {
  if (!token) return { closed: 0 };

  try {
    const result = await runUnscoped("closing a login session on sign-out", () =>
      prisma.loginSession.updateMany({
        where: { tokenHash: hashSessionToken(token), isActive: true },
        data: { isActive: false, logoutAt: new Date() },
      })
    );

    return { closed: result.count };
  } catch (error) {
    console.warn("[session-revocation] failed to close the login session", error);
    return { closed: 0 };
  }
}

/**
 * Whether the request's own cookie names a revoked session.
 *
 * Exists so requireAuthUser() can tell "revoked" apart from "never signed in"
 * and answer with the message the client already knows how to recover from,
 * instead of a bare "Unauthorized". Shares `isSessionRevoked`'s per-request
 * memo, so this costs no extra query.
 *
 * next/headers is imported lazily to keep this module loadable outside a Next
 * runtime, matching how tenant-context.ts handles the same problem.
 */
export async function isCurrentSessionRevoked(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!token) return false;

    return await isSessionRevoked(hashSessionToken(token));
  } catch {
    return false;
  }
}
