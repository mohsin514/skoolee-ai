// ─────────────────────────────────────────────────────────────────
// POST /api/auth/logout
//
// Signing out has to do three things, and for a while it only reliably did the
// first: drop the cookie, close the session server-side so the token itself
// stops working, and leave the caller able to reach /login.
//
// The close-out used to be fire-and-forget and gated behind a jwtVerify() whose
// catch was empty — so an expired cookie skipped revocation entirely, and even
// a valid one could see the response arrive before the row was closed. Both now
// live in endSession(), which is awaited and does not need the token to still
// be verifiable.
// ─────────────────────────────────────────────────────────────────
import { cookies } from "next/headers";
import { NextResponse, after, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { logSuperAdminAction } from "@/lib/audit";
import { JWT_SECRET } from "@/lib/auth/secret";
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieAttributes,
} from "@/lib/auth/session-cookie";
import { endSession } from "@/lib/auth/session-revocation";

/**
 * Refuses a sign-out driven from another site.
 *
 * Largely belt-and-braces: the cookie is SameSite=Lax, so a cross-site POST
 * would not carry it and the handler would be a no-op anyway. It is stated
 * explicitly because this route is in the proxy's PUBLIC_PATHS — nothing
 * upstream examines it — and "harmless because of an attribute set in a
 * different file" is a property worth asserting where it is relied upon.
 *
 * A missing Origin is allowed: non-browser callers (the test harness, curl)
 * legitimately omit it, and there is no cookie to abuse in that case either.
 */
function isCrossSite(req: NextRequest): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return true;

  const origin = req.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin !== req.nextUrl.origin;
  } catch {
    return true;
  }
}

export async function POST(req: NextRequest) {
  if (isCrossSite(req)) {
    return NextResponse.json({ error: "Cross-site sign-out refused" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    // Awaited: the response says "you are signed out", so the session it
    // describes must already be closed by the time it is sent. endSession()
    // swallows its own failures, so this cannot strand the caller.
    await endSession(token);

    // Audit is genuinely incidental to the outcome, so it runs after the
    // response. Decoding is best-effort — an expired token still deserves to
    // have its session closed above, it just cannot tell us whose it was.
    after(async () => {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        if (payload.role !== "SUPER_ADMIN") return;

        await logSuperAdminAction({
          userId: String(payload.userId),
          action: "logout",
          status: "success",
          targetType: "user",
        });
      } catch {
        // An unverifiable token has no identity to attribute the entry to.
      }
    });
  }

  // Mirrors the attributes login sets, from the one definition of them.
  cookieStore.set(SESSION_COOKIE_NAME, "", clearedSessionCookieAttributes());

  return NextResponse.json({ success: true, message: "Logged out successfully" });
}
