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
      select: { fullName: true, email: true, phone: true, profileImageUrl: true },
    });

    return NextResponse.json({
      user: {
        id: user.userId,
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
