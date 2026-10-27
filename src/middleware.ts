import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/security/csp-policy";

/**
 * SKAI-951 / NFR-SEC-04 — production Content-Security-Policy with a per-request
 * nonce. Static next.config.ts headers cannot carry a nonce (they are computed
 * once at build), so the page CSP is owned here instead.
 *
 * Production: script-src uses 'self' + a per-request nonce + 'strict-dynamic'.
 *   No 'unsafe-inline', no 'unsafe-eval'. Next.js reads the nonce from this CSP
 *   and stamps it onto its own injected <script> tags automatically.
 * Development: Next dev/HMR and React refresh require 'unsafe-eval' and inline
 *   scripts, so those allowances are scoped to development only.
 *
 * The stale img.clerk.com allow-list is removed (Clerk is not used).
 */
export function middleware(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";

  // 128-bit random nonce, base64. Edge runtime provides Web Crypto.
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  const csp = buildCsp({ nonce, isProd, env: process.env });

  // Pass the nonce down so Server Components / next/script can read it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  /**
   * Run on page routes only. Exclude API routes (they set their own CSP in
   * next.config.ts — print/upload sandboxes) and static assets, so we do not
   * override the isolated document policies or pay the cost on every asset.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
