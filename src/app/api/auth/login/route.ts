// ─────────────────────────────────────────────────────────────────
// POST /api/auth/login  — Email + password login
// POST /api/auth/logout — Clear session
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validators/schemas";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { logSuperAdminAction, hashToken, recordLoginSession } from "@/lib/audit";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
    const ua = req.headers.get("user-agent") || undefined;

    // 1. Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { school: true, campus: true },
    });

    if (!user || !user.password) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (!user.isActive) {
      return Response.json({ error: "Account not verified. Please check your email inbox to activate it." }, { status: 403 });
    }

    // 2. Verify password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      if (user.role === "SUPER_ADMIN") {
        logSuperAdminAction({
          userId: user.id,
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

    // 3. Create JWT token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      schoolId: user.schoolId,
      campusId: user.campusId,
      schoolSlug: user.school?.slug,
      schoolStatus: user.school?.status,
      onboardingComplete: user.onboardingComplete,
      mustChangePassword: user.mustChangePassword,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    // 4. Track login session & audit log (fire-and-forget)
    const sessionPromise = recordLoginSession({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: ip,
      userAgent: ua,
    }).catch(() => {});

    const updatePromise = prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    }).catch(() => {});

    const auditPromise = user.role === "SUPER_ADMIN"
      ? logSuperAdminAction({
          userId: user.id,
          action: "login",
          status: "success",
          ipAddress: ip,
          userAgent: ua,
          targetType: "user",
          targetName: email,
        }).catch(() => {})
      : Promise.resolve();

    Promise.all([sessionPromise, updatePromise, auditPromise]).catch(() => {});

    // 5. Set cookie
    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        schoolId: user.schoolId,
        campusId: user.campusId,
        schoolName: user.school?.name,
        campusName: user.campus?.name,
        schoolStatus: user.school?.status,
        onboardingComplete: user.onboardingComplete,
        mustChangePassword: user.mustChangePassword,
      },
    });

    res.cookies.set("skoolee_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return res;
  } catch (error) {
    console.error("[auth/login]", error);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}
