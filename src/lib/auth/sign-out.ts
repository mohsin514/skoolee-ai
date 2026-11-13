"use client";
// ─────────────────────────────────────────────────────────────────
// SKAI-1021 — the one client-side sign-out sequence.
//
// QA found that a rapid sign-out followed by an immediate sign-in as someone
// else could land in the previous (other-school) console. Every piece of
// identity the tab holds is torn down here, in order, before /login loads:
//
//  1. client caches that outlive a soft navigation (shell session, navigation
//     access map, device drafts);
//  2. the server session — awaited and retried once, because a fire-and-forget
//     or swallowed failure leaves a live cookie behind the sign-in form;
//  3. a full-document `replace` to /login, so the JS heap and the App Router
//     cache are discarded and Back cannot repaint the console.
//
// Each attempt in step 2 is bounded: a sign-out request that never answers used
// to leave the person staring at the console with the button spinning, never
// reaching /login. /login is public, so leaving is always safe.
//
// The login route additionally revokes any session cookie the browser still
// presents when it issues a new one, so even a failed step 2 cannot be resumed.
// ─────────────────────────────────────────────────────────────────
import { clearDeviceDrafts } from "@/lib/drafts/store";
import { clearNavigationAccessCache } from "@/components/nav/NavigationAccess";
import { resetShellSession } from "@/components/role-dashboard/ScopeBadge";
import { clearWorkspacePrefs } from "@/lib/ui/workspace-pref-storage";

export function clearClientIdentity(): void {
  clearDeviceDrafts();
  clearNavigationAccessCache();
  resetShellSession();
  clearWorkspacePrefs(); // SKAI-1780
}

/** How long one sign-out attempt may take before it is abandoned. */
export const SIGN_OUT_ATTEMPT_MS = 4000;

/** POSTs the sign-out, retrying once. Resolves true when the server confirmed it. */
export async function endServerSession(fetcher: typeof fetch = fetch, attemptMs = SIGN_OUT_ATTEMPT_MS): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptMs);
    try {
      const response = await fetcher("/api/auth/logout", { method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (response.ok) return true;
    } catch {
      /* timed out or failed: retry once, then fall through */
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

export async function signOutAndLeave(destination = "/login"): Promise<void> {
  clearClientIdentity();
  await endServerSession();
  window.location.replace(destination);
}
