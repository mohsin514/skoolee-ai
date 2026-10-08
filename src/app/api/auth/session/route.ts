import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session-cookie";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { dashboardPathForRole, roleLabel } from "@/lib/roles";

export async function GET() {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { fullName: true, email: true, phone: true, profileImageUrl: true, isActive: true, schoolId: true, role: true, campusId: true },
    });

    if (!profile?.isActive || profile.schoolId !== user.schoolId || profile.role !== user.role || profile.campusId !== user.campusId) return NextResponse.json({ user: null }, { status: 401 });

    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    return NextResponse.json({
      user: {
        id: user.userId,
        schoolId: user.schoolId,
        // A purpose-scoped digest is not a bearer credential. New logins cannot recover old drafts.
        draftScope: token ? hashSessionToken(`device-draft:${token}:${user.schoolId}:${user.campusId}:${user.role}`) : null,
        email: profile?.email || user.email,
        fullName: profile?.fullName || user.fullName || user.email,
        phone: profile?.phone || "",
        profileImageUrl: profile?.profileImageUrl || "",
        role: user.role,
        roleLabel: roleLabel(user.role),
        dashboardPath: dashboardPathForRole(user.role),
      },
    });
  } catch (error) {
    console.error("[auth/session] GET failed", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
