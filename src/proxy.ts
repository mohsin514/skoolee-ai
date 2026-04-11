// ─────────────────────────────────────────────────────────────────
// SkooleeAI — Middleware
// 1. Reads the JWT cookie to identify the logged-in user
// 2. Protects /dashboard/* routes  (redirects to /login if not authed)
// 3. Injects campus/school context headers for server components & API routes
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

const PUBLIC_PATHS = ["/", "/login", "/register", "/accept-invite", "/api/auth/login", "/api/auth/register", "/api/auth/logout"];

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
