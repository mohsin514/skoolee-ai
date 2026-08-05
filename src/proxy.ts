// ─────────────────────────────────────────────────────────────────
// SkooleeAI — Middleware
// 1. Reads the JWT cookie to identify the logged-in user
// 2. Protects /dashboard/* routes  (redirects to /login if not authed)
// 3. Injects campus/school context headers for server components & API routes
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import {
  canAccessRoleDashboard,
  dashboardPathForRole,
  normalizeUserRole,
} from "./lib/roles";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

const PUBLIC_PATHS = [
  "/", "/login", "/register", "/register-split", "/sign-up",
  "/accept-invite", "/forgot-password",
  "/parent",
  "/ai-school-management-software", "/ai-report-cards-urdu-english",
  "/whatsapp-report-card-software", "/multi-campus-school-erp",
  "/school-fee-management-software", "/ai-student-performance-analytics",
  "/privacy", "/ai-governance", "/security", "/human-review-policy",
  "/api/auth/login",
  "/api/auth/logout", "/api/auth/verify", "/api/auth/session",
  "/api/auth/register", "/api/auth/signup-step1", "/api/auth/signup-step2",
  "/api/parent/data",
  "/api/parent/timetable",
];

// ─────────────────────────────────────────────────────────────────
// Self-serve registration is enabled. New schools sign themselves up
// through /register and its signup API routes, which are public.
// ─────────────────────────────────────────────────────────────────
const DISABLED_PATHS: string[] = [];

function matchesPath(pathname: string, list: string[]) {
  return list.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublic(pathname: string) {
  return matchesPath(pathname, PUBLIC_PATHS);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Lightning-fast early exit for static assets and internal Next.js files
  if (
    pathname.startsWith("/_next") ||
    pathname.includes(".") || // Matches .css, .js, .png, .svg, etc.
    pathname.startsWith("/api/public")
  ) {
    return NextResponse.next();
  }

  // 2. Pass through public routes
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Protected routes — verify JWT
  const token = req.cookies.get("skoolee_token")?.value;

  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = normalizeUserRole(payload.role);
    const onboardingComplete = Boolean(payload.onboardingComplete);

    if (!role) {
      throw new Error("Invalid role");
    }

    // An owner-generated password must be replaced before the account
    // can reach anything else — this outranks even onboarding.
    const mustChangePassword = Boolean(payload.mustChangePassword);
    if (mustChangePassword) {
      const allowedDuringReset =
        pathname === "/first-login" ||
        pathname.startsWith("/api/auth/first-password") ||
        pathname.startsWith("/api/auth/logout") ||
        pathname.startsWith("/api/auth/session");

      if (!allowedDuringReset) {
        if (pathname.startsWith("/api")) {
          return NextResponse.json(
            { error: "You must set a new password before continuing." },
            { status: 403 }
          );
        }
        return NextResponse.redirect(new URL("/first-login", req.url));
      }
    } else if (pathname === "/first-login") {
      // Nothing pending — don't let the reset screen be revisited.
      return NextResponse.redirect(new URL(dashboardPathForRole(role), req.url));
    }

    if (!onboardingComplete && !pathname.startsWith("/onboarding") && !pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    const schoolStatus = typeof payload.schoolStatus === "string" ? payload.schoolStatus : "";
    const isSuperBillingView = pathname === "/super" && req.nextUrl.searchParams.get("view") === "billing";
    const isBillingWorkspace =
      pathname.startsWith("/super/billing") ||
      pathname.startsWith("/dashboard/billing") ||
      isSuperBillingView;
    const billingAllowedPath =
      pathname === "/subscription-suspended" ||
      isBillingWorkspace ||
      pathname.startsWith("/api/billing") ||
      pathname.startsWith("/api/stripe") ||
      pathname.startsWith("/api/auth/logout");

    if (schoolStatus === "SUSPENDED" && !billingAllowedPath && role !== "APP_OWNER") {
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          { error: "Subscription suspended. Open billing to update your plan or payment method." },
          { status: 402 }
        );
      }
      return NextResponse.redirect(new URL("/subscription-suspended", req.url));
    }

    if (onboardingComplete && pathname === "/dashboard") {
      return NextResponse.redirect(new URL(dashboardPathForRole(role), req.url));
    }

    if (onboardingComplete && pathname.startsWith("/onboarding")) {
       return NextResponse.redirect(new URL(dashboardPathForRole(role), req.url));
    }

    if (role === "APP_OWNER" && pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/owner", req.url));
    }

    if (role === "APP_OWNER" && pathname.startsWith("/super")) {
      return NextResponse.redirect(new URL("/owner", req.url));
    }

    if (role === "SUPER_ADMIN" && pathname.startsWith("/dashboard")) {
      const target = pathname.startsWith("/dashboard/billing") ? "/super?view=billing" : "/super";
      return NextResponse.redirect(new URL(target, req.url));
    }

    if (role === "PRINCIPAL" && pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/principal", req.url));
    }

    // Role-based routing guard
    if (!canAccessRoleDashboard(role, pathname)) {
      return NextResponse.redirect(new URL("/403", req.url));
    }

    // Inject auth context as headers for server components
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", pathname);
    requestHeaders.set("x-billing-workspace", isBillingWorkspace ? "1" : "0");
    requestHeaders.set("x-user-id", String(payload.userId));
    requestHeaders.set("x-user-role", role);
    requestHeaders.set("x-school-id", String(payload.schoolId));
    if (typeof payload.campusId === "string" && payload.campusId.length > 0) {
      requestHeaders.set("x-campus-id", payload.campusId);
    } else {
      requestHeaders.delete("x-campus-id");
    }
    requestHeaders.set("x-school-slug", String(payload.schoolSlug || ""));

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    // Invalid or expired token
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set("skoolee_token", "", { maxAge: 0, path: "/" });
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
