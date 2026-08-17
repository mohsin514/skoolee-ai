/**
 * Recovery from a session the server has stopped accepting.
 *
 * A 401 from an authenticated endpoint means the cookie no longer identifies a
 * usable session. The common cause is that the school it names has been deleted
 * (a tenant removed, or a QA re-seed minting fresh ids), which leaves a cookie
 * that still decodes and still passes signature checks but points at nothing.
 *
 * Before this existed, that state was a dead end: every request failed, the
 * shell rendered "Operations Locked", and because the header's sign-out lives
 * behind the same failing data, the only way out was clearing cookies by hand.
 * Tearing the cookie down and returning to the sign-in page is the only useful
 * response, so it is centralised here rather than repeated per call site.
 */

/**
 * Guards against a stampede: several panels typically fetch in parallel and
 * would each get their own 401, so without this the page would fire N logout
 * requests and N navigations for one expired session.
 */
let recovering = false;

export function isInvalidSessionResponse(response: { status: number }): boolean {
  return response.status === 401;
}

export async function signOutInvalidSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (recovering) return;

  // Already on the way out — never bounce the sign-in page off itself.
  const path = window.location.pathname;
  if (path.startsWith("/login") || path.startsWith("/register")) return;

  recovering = true;

  // Best effort: the endpoint clears the cookie and closes the login session
  // row. If it fails the redirect still happens, and signing in overwrites the
  // cookie anyway, so a failure here must not strand the user.
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* ignore — the redirect below is what actually matters */
  }

  window.location.href = "/login?reason=session-expired";
}
