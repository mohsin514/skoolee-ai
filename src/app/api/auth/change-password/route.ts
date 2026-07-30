import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || typeof currentPassword !== "string") {
      throw new ApiError("Current password is required", 400);
    }
    if (!newPassword || typeof newPassword !== "string") {
      throw new ApiError("New password is required", 400);
    }
    if (newPassword.length < 8) {
      throw new ApiError("Password must be at least 8 characters", 400);
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, password: true, email: true },
    });
    if (!dbUser) throw new ApiError("User not found", 404);

    if (!dbUser.password) {
      throw new ApiError("Cannot change password for this account", 400);
    }

    const valid = await bcrypt.compare(currentPassword, dbUser.password);
    if (!valid) {
      throw new ApiError("Current password is incorrect", 403);
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, dbUser.password);
    if (sameAsCurrent) {
      throw new ApiError("New password must be different from current password", 400);
    }

    const recentPasswords = await prisma.passwordHistory.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { oldPasswordHash: true },
    });

    for (const entry of recentPasswords) {
      const matches = await bcrypt.compare(newPassword, entry.oldPasswordHash);
      if (matches) {
        throw new ApiError("Cannot reuse one of the last 5 passwords", 400);
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.userId },
        data: { password: hashedPassword, lastPasswordChange: new Date() },
      }),
      prisma.passwordHistory.create({
        data: {
          userId: user.userId,
          oldPasswordHash: dbUser.password,
          changedBy: user.userId,
          changeReason: "user_request",
        },
      }),
    ]);

    return Response.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    return errorResponse(error, "[auth/change-password] PUT failed");
  }
}
