import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { isCampusAdminRole } from "@/lib/roles";
import { membershipAuthority } from "@/lib/membership-access";
import { notify } from "@/lib/notifications/in-app";

/**
 * Deactivates a staff account and ends its sessions (SKAI-1635). Exactly one caller can win:
 * the update is conditional on the account still being active at the accessVersion read here,
 * so a concurrent removal or role change loses with a 409 and writes no audit row or notification.
 */
export async function removeStaffMember(session: AuthUser, userId: string) {
  const { authority } = membershipAuthority(session);

  if (userId === session.userId) {
    throw new ApiError("You can't remove your own account", 403);
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, schoolId: true, campusId: true, fullName: true, isActive: true, accessVersion: true, isInstitutionOwner: true, canManageMemberships: true, canPurchaseSubscription: true },
  });

  if (!target || target.schoolId !== session.schoolId) {
    throw new ApiError("Staff member not found", 404);
  }

  if (!authority && target.campusId !== session.campusId) {
    throw new ApiError("Staff member is outside your campus", 403);
  }

  if (target.isInstitutionOwner) {
    throw new ApiError("The account owner cannot be removed", 403);
  }

  if (!authority && (target.canManageMemberships || target.canPurchaseSubscription || isCampusAdminRole(target.role) || target.role === "PRINCIPAL" || target.role === "SUPER_ADMIN")) {
    throw new ApiError("Only the institution administrator can remove campus leaders and delegated administrators", 403);
  }

  if (!target.isActive) {
    throw new ApiError("This staff member has already been removed. Refresh the staff list.", 409);
  }

  try {
    await prisma.$transaction(async tx => {
      // Claim the active target at the version we checked. A concurrent removal or role change has already
      // bumped accessVersion or cleared isActive, so this matches no row and the transaction rolls back.
      await tx.user.update({
        where: { id: userId, schoolId: session.schoolId, isActive: true, accessVersion: target.accessVersion },
        data: { isActive: false, accessVersion: { increment: 1 } },
      });
      await tx.loginSession.updateMany({ where: { userId }, data: { isActive: false } });
      await tx.auditLog.create({ data: { tableName: "membership", recordId: userId, userId: session.userId, oldValue: { isActive: true, role: target.role, campusId: target.campusId }, newValue: { isActive: false } } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ApiError("This staff member was changed or removed by someone else. Refresh the staff list and try again.", 409);
    }
    throw error;
  }

  notify("STAFF_REMOVED", {
    schoolId: session.schoolId,
    campusId: target.campusId,
    actorId: session.userId,
    actorName: session.fullName,
    staffId: target.id,
    staffName: target.fullName,
    // The removed person's role routes a principal/campus-admin vacancy to the institution authority (P9 staffing()).
    roleName: target.role,
  });

  return { success: true };
}
