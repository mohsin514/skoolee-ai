import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, resolveCampusId } from "@/lib/api/scope";
import { daysToTenths } from "@/lib/leave";

/**
 * Create a leave allocation (POST /api/leave/allocations), extracted so the route and the AI Workflows
 * `leave.create_allocation` capability run the same command. Body: { campusId?, leaveTypeId, role? | userId?,
 * days?, academicYear? } — a role-wide row (role set, userId null) or a per-user override (userId set, role null).
 * The caller has already checked canManageCampusOps and the leave.add permission. Throws ApiError with the
 * route's exact messages and statuses; a duplicate (campus, type, year, role, user) is 409.
 */
export async function createLeaveAllocation(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const leaveTypeId = String(body.leaveTypeId ?? "");
  const academicYear = Number(body.academicYear) || new Date().getFullYear();
  const role = body.role ? String(body.role).toUpperCase() : null;
  const userId = body.userId ? String(body.userId) : null;
  if (!leaveTypeId) throw new ApiError("leaveTypeId is required", 400);
  if (!role && !userId) throw new ApiError("Provide either a role or a user", 400);
  if (role && userId) throw new ApiError("Provide either a role or a user, not both", 400);

  const leaveType = await prisma.leaveType.findFirst({
    where: { id: leaveTypeId, campusId },
  });
  if (!leaveType) throw new ApiError("Leave type not found", 404);

  if (userId) {
    const target = await prisma.user.findFirst({
      where: { id: userId, campusId, schoolId: user.schoolId },
    });
    if (!target) throw new ApiError("User not found on this campus", 404);
  }

  const days = daysToTenths(Number(body.days ?? 0));
  const duplicate = await findLeaveAllocation(campusId, leaveTypeId, academicYear, role, userId);
  if (duplicate) throw new ApiError("An allocation for this leave type / scope / year already exists", 409);

  return prisma.leaveAllocation.create({
    data: { campusId, leaveTypeId, role, userId, days, academicYear },
  });
}

/** The route's duplicate rule: one row per (campus, leave type, academic year, role, user). */
export function findLeaveAllocation(campusId: string, leaveTypeId: string, academicYear: number, role: string | null, userId: string | null) {
  return prisma.leaveAllocation.findFirst({
    where: {
      campusId,
      leaveTypeId,
      academicYear,
      role: role ?? null,
      userId: userId ?? null,
    },
  });
}
