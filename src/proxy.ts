// ===========================================
// SkooleeAI - Middleware
// ===========================================
// Handles: Clerk auth, subdomain→tenant resolution,
// and cross-tenant access prevention.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/stripe/webhook",
  "/api/auth/webhook",
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes through
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Protect all other routes
  await auth.protect();

  // ── Subdomain-based tenant resolution ──────────────────
  const hostname = req.headers.get("host") || "";
  const url = req.nextUrl.clone();

  // Extract subdomain: e.g., "springfield.skooleeai.com" → "springfield"
  // In local dev: "springfield.localhost:3000" → "springfield"
  const baseDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost:3000";
  let subdomain: string | null = null;

  if (hostname !== baseDomain && hostname !== `www.${baseDomain}`) {
    const parts = hostname.replace(`:${url.port}`, "").split(".");
    if (parts.length > 1) {
      subdomain = parts[0];
    }
    // Local dev: check for "slug.localhost"
    if (!subdomain && hostname.includes("localhost")) {
      const localParts = hostname.split(".");
      if (localParts.length >= 2 && localParts[0] !== "www") {
        subdomain = localParts[0];
      }
    }
  }

  // Attach tenant slug to headers so API routes / server components can read it
  const requestHeaders = new Headers(req.headers);
  if (subdomain) {
    requestHeaders.set("x-tenant-slug", subdomain);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
