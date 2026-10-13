import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { moduleFlags, type PermissionAction } from "@/lib/permissions";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "@/lib/timetable/locking";

/** Resource changes use the same campus fence as lesson, exam and duty booking. */
export async function withSchedulingResourceWrite<T>(user: AuthUser, campusId: string, module: "timetable" | "leave", action: PermissionAction, work: (tx: TxClient) => Promise<T>) {
  return schoolAiTransaction(user, async tx => {
    if (!canManageOperations(user) || user.role !== "SUPER_ADMIN" && user.campusId !== campusId) throw new ApiError("Forbidden", 403);
    await lockTimetableCampus(tx, user.schoolId, campusId, action === "delete");
    const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
    if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new ApiError("Account access changed. Sign in again.", 403);
    const rows = await tx.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role } });
    const flags = moduleFlags(rows, user.role, module);
    if (!flags[{ view: "canView", add: "canAdd", edit: "canEdit", delete: "canDelete" }[action] as keyof typeof flags]) throw new ApiError(`Insufficient permissions: ${module}.${action}`, 403);
    await assertSchoolOperational(user.schoolId, tx);
    return work(tx);
  });
}

export function resourceScope(user: AuthUser) { return { schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }; }
