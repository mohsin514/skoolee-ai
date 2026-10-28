// ─────────────────────────────────────────────────────────────────
// SkooleeAI — Middleware
// 1. Reads the JWT cookie to identify the logged-in user
// 2. Protects /dashboard/* routes  (redirects to /login if not authed)
// 3. Injects campus/school context headers for server components & API routes
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import {
  dashboardPathForRole,
  normalizeUserRole,
  roleGuardRedirect,
} from "./lib/roles";
import { SUBSCRIPTION_PAUSED_MESSAGE } from "@/lib/billing/hub";

import { JWT_SECRET } from "@/lib/auth/secret";
import { buildCsp } from "@/lib/security/csp-policy";
import { requiredOnboardingPath } from "@/lib/onboarding/launch-plan";
import { allowedDuringCandidateExam, candidateExamUrl } from "@/lib/school-ai/exam-boundary";
// The cookie helper stays dependency-free. The active candidate boundary below
// is the explicit, narrow exception that reads authoritative database state.
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieAttributes,
} from "@/lib/auth/session-cookie";

const PUBLIC_PATHS = [
  "/showcase", // Generic presentation with a session-aware continuation; no setup mutations.
  "/school-capture", // Empty phone handoff shell; all capture data requires current authenticated API access.
  "/", "/login", "/sign-in", "/register", "/register-split", "/sign-up", "/pricing",
  "/verify-success", // Informational destination of token verification; it creates no session.
  "/accept-invite", "/forgot-password", "/protect-account", "/api/auth/mfa",
  "/apply", // SKO-398 family admission form; data is reached only by the link token or reference + resume key.
  "/api/invite/status", "/api/invite/reissue", // Scoped by a secret invitation token before sign-in.
  // "/parent" is no longer public (D14): the parent layout already requires a signed-in session.
  "/ai-school-management-software", "/ai-report-cards-urdu-english",
  "/whatsapp-report-card-software", "/multi-campus-school-erp",
  "/school-fee-management-software", "/ai-student-performance-analytics",
  "/privacy", "/ai-governance", "/security", "/human-review-policy",
  "/api/auth/login",
  "/sso", "/api/auth/sso", // SKO-446: school sign-in; the routes verify state, PKCE and the provider's ID token.
  "/api/auth/logout", "/api/auth/verify", "/api/auth/session",
  "/api/auth/showcase-entry", // Read-only current-session continuation; also resolves genuine guests.
  "/api/auth/signup-step1", "/api/auth/signup-step2",
  // These routes authenticate the session themselves; portal capability links (`?token=`) are retired (D14) and no
  // longer stand in for one (`resolveParentScope`).
  "/api/reports/download",
  "/api/parent/data",
  "/api/parent/timetable",
  "/api/parent/exam-datesheet",
  "/api/parent/inbox", // SKO-419

  // Gateway webhooks — no session cookie by design; each route authenticates
  // itself via the provider's signature/secret before mutating anything.
  "/api/safepay/notification",
  "/api/safepay/simulate",
  "/api/stripe/webhook",
  "/api/stripe/connect-webhook",
  "/api/whatsapp/webhook",

  // Cron endpoints — the routes themselves require the CRON_SECRET bearer
  // token (and refuse to run in production without one).
  "/api/cron",
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

/** The payer's billing workspace in either kind of school, plus the legacy entry points that redirect to it (G43). */
function isBillingWorkspacePath(pathname: string, view: string | null) {
  return pathname === "/billing" ||
    pathname.startsWith("/super/billing") ||
    pathname.startsWith("/dashboard/billing") ||
    (pathname === "/super" && view === "billing") ||
    (pathname === "/admin" && view === "billing");
}

/** Shell reads a suspended school still needs so the minimal shell can render (GET only, G43). */
const SUSPENDED_SHELL_READS = ["/api/navigation/access", "/api/navigation/counts", "/api/profile", "/api/notifications", "/api/auth/tour"];

/**
 * What a suspended school can still reach: the recovery screen, the payer's billing workspace and its APIs,
 * sign-out, the read-only shell calls, and two-step sign-in enrolment (a deferred-MFA owner must be able to
 * enrol before changing the payment method, K-I5).
 */
function allowedWhileSuspended(pathname: string, method: string, isBillingWorkspace: boolean) {
  if (pathname === "/subscription-suspended" || pathname === "/subscription" || isBillingWorkspace) return true;
  if (matchesPath(pathname, ["/api/billing", "/api/stripe", "/api/auth/logout", "/account/security"])) return true;
  if (pathname.startsWith("/api/account/mfa")) return true;
  return (method === "GET" || method === "HEAD") && matchesPath(pathname, SUSPENDED_SHELL_READS);
}

async function proxyImpl(req: NextRequest, nonce: string) {
  let normalizedPath: string;
  try {
    normalizedPath = req.nextUrl.pathname;
    for (let i = 0; i < 3 && normalizedPath.includes("%"); i++) normalizedPath = decodeURIComponent(normalizedPath);
    const segments: string[] = [];
    for (const part of normalizedPath.replace(/\\/g, "/").split("/")) {
      if (part === "..") segments.pop();
      else if (part && part !== ".") segments.push(part);
    }
    normalizedPath = `/${segments.join("/")}`;
  } catch { return new NextResponse(null, { status: 400 }); }
  if (normalizedPath === "/generated/reports" || normalizedPath.startsWith("/generated/reports/")) return new NextResponse(null, { status: 404 });
  const { pathname } = req.nextUrl;

  // Unlike general optimistic navigation checks, the active-exam boundary must
  // read current server state. It runs before public/dotted-path shortcuts so a
  // second tab or encoded route cannot reach unrelated Skoolee data. Domain
  // authentication and authorization still run in each allowed handler.
  const examToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (examToken && !normalizedPath.startsWith("/_next/static/") && normalizedPath !== "/_next/image" && !(normalizedPath === "/api/auth/logout" && req.method === "POST")) {
    let candidate: { userId: string; schoolId: string; role: "STUDENT"; accessVersion: unknown; mfaVerified: unknown } | null = null;
    try {
      const { payload } = await jwtVerify(examToken, JWT_SECRET);
      if (normalizeUserRole(payload.role) === "STUDENT" && typeof payload.userId === "string" && typeof payload.schoolId === "string") candidate = { userId: payload.userId, schoolId: payload.schoolId, role: "STUDENT", accessVersion: payload.accessVersion, mfaVerified: payload.mfaVerified };
    } catch { /* The regular authentication path below handles invalid tokens. */ }
    if (candidate) {
      try {
        const { candidateExamBoundaryForSession } = await import("@/lib/school-ai/exam-boundary-service");
        const session = await candidateExamBoundaryForSession(examToken, candidate);
        if (!session.authenticated) {
          // A revoked cookie must not disclose even the active assignment URL
          // or deadline, including through otherwise-public navigation routes.
          const response = normalizedPath.startsWith("/api/") || !["GET", "HEAD"].includes(req.method)
            ? NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })
            : NextResponse.redirect(new URL("/login", req.url));
          response.headers.set("Cache-Control", "private, no-store");
          response.cookies.set(SESSION_COOKIE_NAME, "", clearedSessionCookieAttributes());
          return response;
        }
        const active = session.active;
        if (active && !allowedDuringCandidateExam(normalizedPath, req.method, active.assignmentId)) {
          const examUrl = candidateExamUrl(active.assignmentId);
          if (normalizedPath.startsWith("/api/") || !["GET", "HEAD"].includes(req.method)) return NextResponse.json({ error: "Return to your active exam. Other Skoolee tasks become available after submission or the server deadline.", code: "EXAM_SESSION_ACTIVE", examUrl, deadlineAt: active.deadlineAt.toISOString() }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
          const destination = new URL(examUrl, req.url);
          // Next 16 dev overwrites document no-store with no-cache, and native
          // history can reuse HTML whose request-specific debug stream ended.
          // A dev-only fresh URL avoids that stale stream; production keeps
          // the canonical URL and noncacheable candidate document response.
          if (process.env.NODE_ENV === "development") destination.searchParams.set("_exam_resume", crypto.randomUUID());
          const response = NextResponse.redirect(destination);
          response.headers.set("Cache-Control", "private, no-store");
          return response;
        }
      } catch {
        // Never fail open into unrelated tasks when current exam state is unknown.
        return NextResponse.json({ error: "Exam session status is unavailable. Retry to continue safely.", code: "EXAM_SESSION_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      }
    }
  }

  // Synthetic component reference only; the page also refuses production access.
  if (process.env.NODE_ENV === "development" && pathname === "/design-system") return NextResponse.next();

  // 1. Lightning-fast early exit for static assets and internal Next.js files
  if (
    pathname.startsWith("/_next") ||
    pathname.includes(".") || // Matches .css, .js, .png, .svg, etc.
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/media/logos/")
  ) {
    return NextResponse.next();
  }

  // 2. Pass through public routes
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Protected routes — verify JWT
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    // Keep the query so a deep link (?view=…, ?invoice=…) survives sign-in (G46).
    loginUrl.searchParams.set("redirect", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  try {
    // NOTE: this verifies the signature only, and deliberately does not check
    // whether the session has been revoked.
    //
    // General authentication stays optimistic here because Proxy also handles
    // prefetches. Revocation and fresh role/resource authority belong beside
    // protected data. The narrow student-attempt lookup above is an intentional
    // exception: its response must reflect submission/expiry immediately, so a
    // stale JWT claim cannot decide the application boundary. Next 16 Proxy
    // runs in Node.js; this lookup has no process-local authorization cache.
    //
    // So this stays a cheap filter, and getAuthUser() — which every page,
    // layout and route handler already goes through — is where a revoked token
    // is actually turned away. The student boundary above also authenticates
    // the current session before disclosing attempt metadata, but does not
    // replace any domain checks. Other roles remain optimistic here, so
    // nothing downstream may infer "the proxy let it through" as evidence
    // that a session is live.
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

    let onboardingPath = requiredOnboardingPath(role, onboardingComplete);
    // A campus administrator's incomplete profile is not permission to create an institution.
    // Only owners and explicitly named delegates enter the institution wizard.
    if (!mustChangePassword && onboardingPath === "/onboarding" && !pathname.startsWith("/api")) {
      const { needsInstitutionSetup } = await import("@/lib/onboarding/setup-routing");
      try {
        if (!await needsInstitutionSetup(String(payload.userId), String(payload.schoolId))) {
          onboardingPath = null;
          if (pathname === "/onboarding") return NextResponse.redirect(new URL(dashboardPathForRole(role), req.url));
        }
      } catch {
        return NextResponse.json({ error: "Setup status is unavailable. Please retry." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      }
    }
    if (!mustChangePassword && onboardingPath && pathname !== onboardingPath && !pathname.startsWith(onboardingPath + "/") && !pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL(onboardingPath, req.url));
    }

    const schoolStatus = typeof payload.schoolStatus === "string" ? payload.schoolStatus : "";
    const isBillingWorkspace = isBillingWorkspacePath(pathname, req.nextUrl.searchParams.get("view"));

    if (schoolStatus === "SUSPENDED" && role !== "APP_OWNER" && !allowedWhileSuspended(pathname, req.method, isBillingWorkspace)) {
      if (pathname.startsWith("/api")) {
        // Neutral for every role (G51): the account owner renews; nobody else is sent to billing.
        return NextResponse.json({ error: SUBSCRIPTION_PAUSED_MESSAGE, code: "SUBSCRIPTION_SUSPENDED" }, { status: 402 });
      }
      return NextResponse.redirect(new URL("/subscription-suspended", req.url));
    }

    if (onboardingComplete && pathname === "/dashboard") {
      return NextResponse.redirect(new URL(dashboardPathForRole(role), req.url));
    }

    if (onboardingComplete && pathname.startsWith("/onboarding")) {
      return NextResponse.redirect(new URL(dashboardPathForRole(role), req.url));
    }

    // Role-based routing guard (G44, G45): one pure decision for every page path. API paths are never
    // redirected here; families default-deny to their home; APP_OWNER goes to /owner; staff on another
    // role's console see /403. Legacy /dashboard/** is admitted for staff and the group admin — its
    // page redirects each of them to their own console view (§6.1).
    const guardTarget = roleGuardRedirect(role, pathname);
    if (guardTarget && guardTarget !== pathname) {
      return NextResponse.redirect(new URL(guardTarget, req.url));
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
    requestHeaders.set("x-nonce", nonce);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (role === "STUDENT" && /^\/ai\/exams\/[^/]+$/.test(pathname)) {
      // Native history can reuse an old exam document after the active-attempt
      // redirect. Never reuse candidate HTML (or its development Flight stream).
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  } catch {
    // Invalid or expired token
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set(SESSION_COOKIE_NAME, "", clearedSessionCookieAttributes());
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

/**
 * SKAI-951 / NFR-SEC-04 — wrap the proxy so every page response carries a
 * per-request nonce CSP. Production script-src = self + nonce + strict-dynamic
 * (no unsafe-inline/unsafe-eval); dev keeps the permissive policy for HMR.
 * API routes keep their own per-route CSPs set in next.config.ts, so we do not
 * overwrite a CSP the inner handler already set (e.g. the print/upload sandboxes).
 */
export async function proxy(req: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  const response = await proxyImpl(req, nonce);

  // Only stamp the page CSP when the inner handler did not set one, and never
  // on API routes (they own their policy).
  const pathname = req.nextUrl.pathname;
  if (!pathname.startsWith("/api") && !response.headers.has("content-security-policy")) {
    response.headers.set("content-security-policy", buildCsp({ nonce, isProd, env: process.env }));
  }
  return response;
}
