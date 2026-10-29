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
// The login route additionally revokes any session cookie the browser still
// presents when it issues a new one, so even a failed step 2 cannot be resumed.
// ─────────────────────────────────────────────────────────────────
import { clearDeviceDrafts } from "@/lib/drafts/store";
import { clearNavigationAccessCache } from "@/components/nav/NavigationAccess";
import { resetShellSession } from "@/components/role-dashboard/ScopeBadge";

export function clearClientIdentity(): void {
  clearDeviceDrafts();
  clearNavigationAccessCache();
  resetShellSession();
}

/** POSTs the sign-out, retrying once. Resolves true when the server confirmed it. */
export async function endServerSession(fetcher: typeof fetch = fetch): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher("/api/auth/logout", { method: "POST", cache: "no-store", credentials: "same-origin" });
      if (response.ok) return true;
    } catch {
      /* retry once, then fall through */
    }
  }
  return false;
}

export async function signOutAndLeave(destination = "/login"): Promise<void> {
  clearClientIdentity();
  await endServerSession();
  window.location.replace(destination);
}
