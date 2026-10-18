import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/scope";
import { startSignIn } from "@/lib/identity/service";
import { sessionCookieAttributes } from "@/lib/auth/session-cookie";

export const runtime = "nodejs";

// SKO-446: GET /api/auth/sso/start?connection= → the provider's authorization URL, with a 10-minute signed state cookie.
export async function GET(request: NextRequest) {
  try {
    const { url, cookie } = await startSignIn(request.nextUrl.searchParams.get("connection") ?? "", request.nextUrl.origin);
    const response = NextResponse.redirect(url, 302);
    response.cookies.set("sk_sso_state", cookie, { ...sessionCookieAttributes(1), maxAge: 600 });
    return response;
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "School sign-in is unavailable. Use your Skoolee password.";
    return NextResponse.redirect(new URL(`/sso?error=${encodeURIComponent(message)}`, request.nextUrl.origin), 302);
  }
}
