import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { moduleFlags, type PermissionAction } from "@/lib/permissions";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "@/lib/timetable/locking";

export async function assertExamSchedulingAccess(user: AuthUser, campusId: string, action: PermissionAction, tx: TxClient, allowClassroomTeacher = false) {
  if ((!canManageOperations(user) && !(allowClassroomTeacher && user.role === "TEACHER")) || user.role !== "SUPER_ADMIN" && user.campusId !== campusId) throw new ApiError("Forbidden", 403);
  const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new ApiError("Account access changed. Sign in again.", 403);
  const grants = await tx.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role }, select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true } });
  const flags = moduleFlags(grants, user.role, "exams");
  if (!flags[{ view: "canView", add: "canAdd", edit: "canEdit", delete: "canDelete" }[action] as keyof typeof flags]) throw new ApiError(`Insufficient permissions: exams.${action}`, 403);
  await assertSchoolOperational(user.schoolId, tx);
}
/** All schedule/room writes share the timetable campus fence before booking reads. */
export async function withExamSchedulingWrite<T>(user: AuthUser, campusId: string, action: PermissionAction, work: (tx: TxClient) => Promise<T>, allowClassroomTeacher = false) {
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, campusId, action === "delete");
    await assertExamSchedulingAccess(user, campusId, action, tx, allowClassroomTeacher);
    return work(tx);
  });
}
