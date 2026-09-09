// ─────────────────────────────────────────────────────────────────
// Page-level session gate for the role consoles.
//
// Until sessions could be revoked, proxy.ts was a sufficient gate for pages: if
// a request reached a console, its cookie had a valid signature, so
// getAuthUser() returning null there was effectively impossible and the layouts
// that called it treated null as "carry on".
//
// Revocation changes that. The proxy is deliberately kept free of database
// reads (see the note in proxy.ts), so a revoked token still reaches the render
// — and every console page is a client component that fetches its own data.
// Left ungated, signing out would still leave the shell renderable: the panels
// inside would 401 and the client would eventually recover, but the console
// itself would paint first, which is precisely what "signed out" should never
// look like.
//
// This is the pattern /dashboard already uses ("a gate in one place is a gate
// that can be widened by accident"), lifted into one function so the ten other
// consoles state it identically rather than each inventing it.
// ─────────────────────────────────────────────────────────────────
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthUser, type AuthUser } from "@/lib/auth";

/**
 * Returns the signed-in user, or redirects to /login and never returns.
 *
 * The requested path is carried through as `?redirect=`, matching the proxy's
 * unauthenticated redirect, so being bounced from a deep link still returns the
 * user there after signing in. `x-pathname` is injected by proxy.ts.
 */
export async function requirePageSession(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (user) return user;

  let pathname = "";
  try {
    pathname = (await headers()).get("x-pathname") || "";
  } catch {
    // No request headers available; fall through to a bare /login.
  }

  // Only a same-site absolute path is ever echoed back, so this cannot be
  // turned into an open redirect by way of a spoofed header.
  const safePath = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "";

  redirect(safePath ? `/login?redirect=${encodeURIComponent(safePath)}` : "/login");
}
