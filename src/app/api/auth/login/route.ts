import { requiresMfa } from "@/lib/auth/mfa-crypto";
import { startMfa } from "@/lib/auth/mfa-ticket";
import { issueSession } from "@/lib/auth/issue-session";
// ─────────────────────────────────────────────────────────────────
// POST /api/auth/login  — Email + password login
// POST /api/auth/logout — Clear session
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validators/schemas";
import bcrypt from "bcryptjs";
import { logSuperAdminAction } from "@/lib/audit";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { runUnscoped } from "@/lib/db/tenant-context";

import {
  SESSION_DAYS,
} from "@/lib/auth/session-cookie";

export async function POST(req: NextRequest) {
  // Login is inherently cross-tenant: the school is unknown until the
  // account is found, and email is unique platform-wide. Everything after
  // the lookup is keyed by the resolved user's own id.
  return runUnscoped("login: resolve account by email before school is known", () =>
    handleLogin(req)
  );
}

async function handleLogin(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const body = await req.json();
    const rateKeyEmail = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    const { ok, remaining } = await authRateLimit(`login:${ip}:${rateKeyEmail}`, { limit: 10, windowMs: 60_000 });
    const ipLimit = await authRateLimit(`login-ip:${ip}`, { limit: 60, windowMs: 60_000 });
    if (!ok || !ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again in a minute." },
        { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": String(remaining) } }
      );
    }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { email, password, rememberMe } = parsed.data;
    const ua = req.headers.get("user-agent") || undefined;

    // "Keep me signed in" is a deliberate choice on a device the user owns, so
    // it lengthens the session rather than silently defaulting to it. Cookie
    // maxAge, JWT expiry and the recorded session row all have to agree —
    // a cookie that outlives its token just logs people out mid-task.
    const sessionDays = rememberMe ? SESSION_DAYS.remembered : SESSION_DAYS.default;

    // 1. Find every account on this address.
    //
    // FINDING-D: identity is tenant-scoped, so one address can hold an account
    // at more than one school — a parent with children at two institutions, or
    // a teacher working across two groups. The email alone no longer names a
    // single user.
    const requestedSchoolId = typeof (body as { schoolId?: unknown })?.schoolId === "string"
      ? (body as { schoolId: string }).schoolId
      : null;

    const candidates = await prisma.user.findMany({
      where: {
        email,
        ...(requestedSchoolId ? { schoolId: requestedSchoolId } : {}),
      },
      include: { school: true, campus: true },
    });

    // 2. Verify the password against each candidate BEFORE revealing anything.
    //
    // The disambiguation prompt below names the schools this address belongs
    // to, which would be an enumeration oracle if it were shown to someone who
    // only guessed the address. Checking the password first means the prompt is
    // only ever seen by whoever already holds the credentials (AUTH-1.2).
    const matched = [];
    for (const candidate of candidates) {
      if (!candidate.password) continue;
      if (await bcrypt.compare(password, candidate.password)) matched.push(candidate);
    }

    if (matched.length === 0) {
      const known = candidates.find((c) => c.role === "SUPER_ADMIN");
      if (known) {
        logSuperAdminAction({
          userId: known.id,
          action: "login",
          status: "failed",
          errorMessage: "Invalid password",
          ipAddress: ip,
          userAgent: ua,
          targetType: "user",
          targetName: email,
        }).catch(() => {});
      }
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // A soft-deleted tenant is not a place anyone can sign in to.
    const usable = matched.filter((c) => c.isActive && String(c.school?.status || "").toUpperCase() !== "DELETED");
    if (usable.length === 0) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // 3. One address, several schools — ask which. Password is already verified.
    if (usable.length > 1) {
      return Response.json({
        needsSchoolSelection: true,
        message: "This email is registered at more than one school. Choose which to sign in to.",
        schools: usable.map((c) => ({
          schoolId: c.schoolId,
          schoolName: c.school?.name ?? "",
          schoolCity: c.school?.city ?? "",
          logoUrl: c.school?.logoUrl ?? null,
          campusName: c.campus?.name ?? null,
          role: c.role,
        })),
      });
    }

    const user = usable[0];

    if (!user.isActive) {
      return Response.json({ error: "Account not verified. Please check your email inbox to activate it." }, { status: 403 });
    }

    if (requiresMfa(user)) return startMfa(user, sessionDays);
    return issueSession(user, sessionDays, false, req);
  } catch (error) {
    console.error("[auth/login]", error);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}
