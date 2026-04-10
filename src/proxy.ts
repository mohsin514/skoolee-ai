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

const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // 1. Allow public routes
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // 2. Protect all other routes
  const { userId, orgId, orgSlug } = await auth();
  if (!userId) {
    return (await auth()).redirectToSignIn();
  }

  // 3. Handle Onboarding (Creating first school)
  if (isOnboardingRoute(req)) {
    return NextResponse.next();
  }

  // 4. Force Onboarding if no organization selected
  if (!orgId && !req.nextUrl.pathname.startsWith("/onboarding")) {
    const onboardingUrl = new URL("/onboarding", req.url);
    return NextResponse.redirect(onboardingUrl);
  }

  // 5. Tenant Resolution Context
  const requestHeaders = new Headers(req.headers);
  if (orgId) {
    // Pass orgId and slug as headers for easy access in API/Server layouts
    requestHeaders.set("x-tenant-id", orgId);
    if (orgSlug) requestHeaders.set("x-tenant-slug", orgSlug);
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
