// ─────────────────────────────────────────────────────────────────
// PUT /api/auth/first-password
//
// Completes a forced password change for an account that was
// provisioned by the APP_OWNER with a generated temporary password.
//
// The current password is not required: the caller already proved
// possession of it by logging in, and this route only works while
// mustChangePassword is still true. Once cleared, it is a no-op.
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export async function PUT(req: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { newPassword } = await req.json();
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return Response.json(
        { error: "Password must contain at least one letter and one number" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { school: true },
    });
    if (!user || !user.password) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }
    if (!user.mustChangePassword) {
      return Response.json({ error: "No password change is pending" }, { status: 409 });
    }

    const sameAsTemp = await bcrypt.compare(newPassword, user.password);
    if (sameAsTemp) {
      return Response.json(
        { error: "Choose a password different from the one you were given" },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    await prisma.$transaction([
      prisma.passwordHistory.create({
        data: {
          userId: user.id,
          oldPasswordHash: user.password,
          changeReason: "admin_forced",
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashed,
          mustChangePassword: false,
          lastPasswordChange: now,
        },
      }),
    ]);

    // Re-issue the token so mustChangePassword is false in the cookie —
    // otherwise the proxy would keep redirecting back to /first-login.
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
      mustChangePassword: false,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    const res = NextResponse.json({
      success: true,
      role: user.role,
      onboardingComplete: user.onboardingComplete,
    });

    res.cookies.set("skoolee_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return res;
  } catch (error) {
    console.error("[auth/first-password]", error);
    return Response.json({ error: "Could not update password" }, { status: 500 });
  }
}
