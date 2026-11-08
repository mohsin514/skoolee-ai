// ─────────────────────────────────────────────────────────────────
// POST /api/auth/login/fallback — SKAI-1033
//
// The sign-in <form> is a client-handled form, but a browser that submits it
// before hydration (slow network, script blocked, Enter pressed instantly) does
// the native thing. With no method/action that meant GET /login?email=…&password=…:
// credentials in the address bar, history, server and proxy logs and Referer.
//
// The form now declares method="post" and this action. Credentials therefore
// only ever travel in a request body, and this handler deliberately reads none
// of it: it never signs anyone in (the JSON endpoint keeps its CSRF content-type
// gate) and simply sends the browser back to a clean /login with a 303 so the
// retry is a GET without a body and nothing sensitive is in any URL.
// ─────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const target = new URL("/login", req.nextUrl.origin);
  target.searchParams.set("reason", "retry");
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/** A GET can only come from someone typing the URL; it carries nothing either way. */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/login", req.nextUrl.origin), 303);
}
