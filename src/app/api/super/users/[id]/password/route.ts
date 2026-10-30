import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import {
  ApiError,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { isInstitutionAuthority } from "@/lib/auth/institution";
import { logSuperAdminAction } from "@/lib/audit";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    // G12: the institution authority (group admin, or the school admin of a single school), school-scoped.
    if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator can open this.", 403);

    // A forced password reset needs a verified second factor (G12).
    if (user.mfaVerified !== true) return Response.json({ error: "Turn on two-step sign-in before you reset someone's password.", code: "MFA_REQUIRED" }, { status: 403 });

    const { id: targetUserId } = await params;
    const { newPassword } = await parseBody(req, jsonObjectBody, { preserve: ["newPassword"] });

    if (!newPassword || typeof newPassword !== "string") {
      throw new ApiError("newPassword is required", 400);
    }

    if (newPassword.length < 8) {
      throw new ApiError("Password must be at least 8 characters", 400);
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, schoolId: user.schoolId },
      select: { id: true, email: true, fullName: true, password: true, role: true, campusId: true },
    });

    if (!targetUser) throw new ApiError("User not found", 404);
    // Never another administrator of the institution (or yourself): they reset their own password.
    if (targetUser.id === user.userId || isInstitutionAuthority({ role: targetUser.role, institutionKind: user.institutionKind }) || targetUser.role === "APP_OWNER") {
      throw new ApiError("This account resets its own password.", 403);
    }

    if (targetUser.password && await bcrypt.compare(newPassword, targetUser.password)) {
      throw new ApiError("New password must be different from current password", 400);
    }

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
      prisma.loginSession.updateMany({ where: { userId: targetUserId, isActive: true }, data: { isActive: false, logoutAt: new Date() } }),
      prisma.user.update({
        where: { id: targetUserId },
        data: { password: hashedPassword, lastPasswordChange: new Date(), mustChangePassword: true },
      }),
      ...(targetUser.password
        ? [
            prisma.passwordHistory.create({
              data: {
                schoolId: user.schoolId,
                userId: targetUserId,
                oldPasswordHash: targetUser.password,
                changedBy: user.userId,
                changeReason: user.userId === targetUserId ? "user_request" : "admin_forced",
              },
            }),
          ]
        : []),
    ]);

    await prisma.auditLog.create({ data: { schoolId: user.schoolId, campusId: targetUser.campusId, tableName: "users", recordId: targetUserId, userId: user.userId, newValue: { action: "password.reset_by_admin" } } });

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
    return errorResponse(error, "[super/users/password] PUT failed");
  }
}
