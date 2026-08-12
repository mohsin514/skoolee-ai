import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jwtVerify } from "jose";
import { logSuperAdminAction, hashToken } from "@/lib/audit";

import { JWT_SECRET } from "@/lib/auth/secret";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const userId = payload.userId as string;
      const tHash = hashToken(token);

      prisma.loginSession.updateMany({
        where: { tokenHash: tHash, isActive: true },
        data: { isActive: false, logoutAt: new Date() },
      }).catch(() => {});

      if (payload.role === "SUPER_ADMIN") {
        logSuperAdminAction({
          userId,
          action: "logout",
          status: "success",
          targetType: "user",
        }).catch(() => {});
      }
    } catch {}
  }

  cookieStore.set("skoolee_token", "", {
    maxAge: 0,
    path: "/",
  });

  return NextResponse.json({ success: true, message: "Logged out successfully" });
}
