// ─────────────────────────────────────────────────────────────────
// SkooleeAI — Middleware
// 1. Reads the JWT cookie to identify the logged-in user
// 2. Protects /dashboard/* routes  (redirects to /login if not authed)
// 3. Injects campus/school context headers for server components & API routes
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

const PUBLIC_PATHS = [
  "/", "/login", "/register", "/accept-invite", "/forgot-password",
  "/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/auth/verify"
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
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
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const { role, onboardingComplete } = payload as any;

    if (!onboardingComplete && !pathname.startsWith("/onboarding") && !pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    if (onboardingComplete && pathname.startsWith("/onboarding")) {
       if(role === 'SUPER_ADMIN') return NextResponse.redirect(new URL("/super", req.url));
       if(role === 'CAMPUS_ADMIN') return NextResponse.redirect(new URL("/admin", req.url));
       if(role === 'PRINCIPAL') return NextResponse.redirect(new URL("/principal", req.url));
       if(role === 'TEACHER') return NextResponse.redirect(new URL("/teacher", req.url));
       if(role === 'PARENT' || role === 'STUDENT') return NextResponse.redirect(new URL("/student", req.url));
    }

    // Role-based routing guard
    if (pathname.startsWith("/super") && role !== "SUPER_ADMIN") return NextResponse.redirect(new URL("/403", req.url));
    if (pathname.startsWith("/admin") && role !== "CAMPUS_ADMIN") return NextResponse.redirect(new URL("/403", req.url));
    if (pathname.startsWith("/principal") && role !== "PRINCIPAL") return NextResponse.redirect(new URL("/403", req.url));
    if (pathname.startsWith("/teacher") && role !== "TEACHER") return NextResponse.redirect(new URL("/403", req.url));
    if (pathname.startsWith("/student") && role !== "STUDENT") return NextResponse.redirect(new URL("/403", req.url));

    // Inject auth context as headers for server components
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-id", String(payload.userId));
    requestHeaders.set("x-user-role", String(payload.role));
    requestHeaders.set("x-school-id", String(payload.schoolId));
    requestHeaders.set("x-campus-id", String(payload.campusId || ""));
    requestHeaders.set("x-school-slug", String(payload.schoolSlug || ""));

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    // Invalid or expired token
    const loginUrl = new URL("/login", req.url);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set("skoolee_token", "", { maxAge: 0, path: "/" });
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
