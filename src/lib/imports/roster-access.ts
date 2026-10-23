import { canConfigureCampus } from "@/lib/school-ai/setup-role";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { moduleFlags, type PermissionAction, type PermissionFlags } from "@/lib/permissions";

/** Import previews and commits must observe live membership and grant revocations. */
export async function assertRosterPermission(user: AuthUser, action: PermissionAction, db: TxClient = prisma) {
  const member = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, role: user.role, campusId: user.campusId, isActive: true }, select: { id: true } });
  if (!member) throw new ApiError("Your school access changed. Sign in again before importing.", 403);
  if (!canConfigureCampus(user.role)) throw new ApiError("Student imports require a campus administrator.", 403);
  const permissions = await db.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role, module: "students" }, select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true, updatedAt: true } }); // updatedAt: role-defaults cut-over (§7.4)
  const flag = { view: "canView", add: "canAdd", edit: "canEdit", delete: "canDelete" }[action] as keyof PermissionFlags;
  if (!moduleFlags(permissions, user.role, "students")[flag]) throw new ApiError("Insufficient permissions: students." + action, 403);
}
