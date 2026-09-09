'use server';

import { cookies } from "next/headers";

import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieAttributes,
} from "@/lib/auth/session-cookie";
import { endSession } from "@/lib/auth/session-revocation";

/**
 * Sign-out as a server action, used by the onboarding screen.
 *
 * This used to be a bare `cookies().delete()` — no session close-out, no audit.
 * So whether signing out actually revoked anything depended on which button a
 * user happened to press: the header called the API route and had its row
 * closed, while onboarding went through here and left `isActive: true` behind
 * forever. Same intent, two implementations, one of them silently weaker.
 *
 * Both paths now share endSession() and the cookie attributes, so there is one
 * definition of what signing out means.
 */
export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) await endSession(token);

  // Set-with-Max-Age-0 rather than delete(), so this tear-down is byte-for-byte
  // the same instruction the API route sends.
  cookieStore.set(SESSION_COOKIE_NAME, "", clearedSessionCookieAttributes());
}
