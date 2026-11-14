import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, resolveCampusId } from "@/lib/api/scope";
import { daysToTenths } from "@/lib/leave";

/**
 * SKAI-447: a supplied allocation amount must be a finite positive number of days. daysToTenths() clamps anything
 * below 0.1 up to 0.1, so without this check a negative or non-numeric value was stored silently.
 */
function allocationDaysToTenths(value: unknown): number {
  const days = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(days) || days <= 0) throw new ApiError("days must be a positive number of days", 400);
  return daysToTenths(days);
}

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

  const days = body.days === undefined || body.days === null ? daysToTenths(0) : allocationDaysToTenths(body.days);
  // SKAI-1672: the duplicate check and the insert run under the campus row lock, so two identical POSTs cannot both
  // see "no row". The loser reads the committed allocation and gets a deterministic 409.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM campuses WHERE id = ${campusId} FOR UPDATE`;
    const duplicate = await tx.leaveAllocation.findFirst({ where: { campusId, leaveTypeId, academicYear, role, userId } });
    if (duplicate) throw new ApiError("An allocation for this leave type / scope / year already exists", 409);
    return tx.leaveAllocation.create({ data: { campusId, leaveTypeId, role, userId, days, academicYear } });
  });
}

/**
 * Update an allocation (PATCH /api/leave/allocations). SKAI-1672: the new identity (campus, type, year, role, user) is
 * checked under the same campus row lock as create, so a PATCH cannot turn one allocation into another's identity.
 * The caller has already checked canManageCampusOps and the leave.edit permission.
 */
export async function updateLeaveAllocation(user: AuthUser, body: Record<string, unknown>) {
  const id = String(body.id ?? "");
  const allocation = await prisma.leaveAllocation.findFirst({ where: { id, campus: { schoolId: user.schoolId } } });
  if (!allocation) throw new ApiError("Allocation not found", 404);

  const days = body.days !== undefined ? allocationDaysToTenths(body.days) : allocation.days;
  const academicYear = body.academicYear !== undefined ? Number(body.academicYear) : allocation.academicYear;
  let role = body.role !== undefined ? (body.role ? String(body.role).toUpperCase() : null) : allocation.role;
  let userId = body.userId !== undefined ? (body.userId ? String(body.userId) : null) : allocation.userId;
  // Switching scope clears the other side, so a row stays either role-wide or per-user.
  if (body.role && body.userId === undefined) userId = null;
  if (body.userId && body.role === undefined) role = null;
  if (!Number.isInteger(academicYear) || academicYear < 1900) throw new ApiError("academicYear is invalid", 400);
  if (!role && !userId) throw new ApiError("Provide either a role or a user", 400);
  if (role && userId) throw new ApiError("Provide either a role or a user, not both", 400);
  const { campusId, leaveTypeId } = allocation;

  if (userId && userId !== allocation.userId) {
    const target = await prisma.user.findFirst({ where: { id: userId, campusId, schoolId: user.schoolId } });
    if (!target) throw new ApiError("User not found on this campus", 404);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM campuses WHERE id = ${campusId} FOR UPDATE`;
    const clash = await tx.leaveAllocation.findFirst({ where: { campusId, leaveTypeId, academicYear, role, userId, id: { not: allocation.id } } });
    if (clash) throw new ApiError("An allocation for this leave type / scope / year already exists", 409);
    return tx.leaveAllocation.update({ where: { id: allocation.id }, data: { days, academicYear, role, userId } });
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
