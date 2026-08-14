import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { logSuperAdminAction } from "@/lib/audit";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePlatformOwner();

    const { id: targetUserId } = await params;
    const { newPassword } = await req.json();

    if (!newPassword || typeof newPassword !== "string") {
      throw new ApiError("newPassword is required", 400);
    }
    if (newPassword.length < 8) {
      throw new ApiError("Password must be at least 8 characters", 400);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, fullName: true, password: true },
    });

    if (!targetUser) throw new ApiError("User not found", 404);

    const recentPasswords = await prisma.passwordHistory.findMany({
      where: { userId: targetUserId },
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
        where: { id: targetUserId },
        data: { password: hashedPassword, lastPasswordChange: new Date() },
      }),
      ...(targetUser.password
        ? [
            prisma.passwordHistory.create({
              data: {
                userId: targetUserId,
                oldPasswordHash: targetUser.password,
                changedBy: user.userId,
                changeReason: "admin_forced",
              },
            }),
          ]
        : []),
    ]);

    await logSuperAdminAction({
      userId: user.userId,
      action: "password_change",
      targetType: "user",
      targetId: targetUserId,
      targetName: targetUser.email,
      status: "success",
    }).catch(() => {});

    return Response.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    return errorResponse(error, "[owner/users/password] PUT failed");
  }
}
