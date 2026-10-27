/**
 * SKAI-951 / NFR-SEC-04 — pure CSP builder, shared by the middleware and its
 * tests. Kept free of edge-runtime APIs so it runs under node:test.
 */
import { storageConnectOrigins } from "@/lib/storage/csp";

export function buildCsp(opts: {
  nonce: string;
  isProd: boolean;
  env?: NodeJS.ProcessEnv;
}): string {
  const { nonce, isProd } = opts;
  const env = opts.env ?? process.env;

  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    // img.clerk.com removed (SKAI-951): Clerk is not in use.
    "img-src 'self' data: blob: https://api.dicebear.com https://*.amazonaws.com https://*.r2.cloudflarestorage.com",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${storageConnectOrigins(env).join(" ")}`,
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
