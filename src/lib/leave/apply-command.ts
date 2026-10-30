import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, resolveCampusId } from "@/lib/api/scope";
import { rangeTenths } from "@/lib/leave";
import { notify } from "@/lib/notifications/in-app";
import { isStaffRole } from "@/lib/roles";

/**
 * Apply for leave (POST /api/leave), extracted so the route and the AI Workflows `leave.apply` capability run
 * the same command. Body: { campusId?, leaveTypeId, fromDate, toDate, reason?, days?, attachmentKey? }.
 * Throws ApiError with the route's exact messages and statuses; the reviewers (academic lead for teaching
 * staff, the campus operator for everyone else) are notified, and approval stays with them.
 */
/**
 * SKAI-1323: accept only a real YYYY-MM-DD calendar day. Impossible dates such as
 * 2026-02-30 must not be normalised into a neighbouring day.
 */
function calendarDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

export async function applyLeave(user: AuthUser, body: Record<string, unknown>) {
  // Leave is for members of staff; families and the platform operator have no leave record.
  if (!isStaffRole(user.role)) throw new ApiError("Leave applications are for school staff.", 403);

  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const leaveTypeId = String(body.leaveTypeId ?? "");
  const fromDate = calendarDate(body.fromDate);
  const toDate = calendarDate(body.toDate);

  if (!leaveTypeId) throw new ApiError("leaveTypeId is required", 400);
  if (!fromDate) throw new ApiError("Valid fromDate is required", 400);
  if (!toDate) throw new ApiError("Valid toDate is required", 400);

  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);
  if (end < start) throw new ApiError("toDate cannot be before fromDate", 400);

  const leaveType = await prisma.leaveType.findFirst({
    where: { id: leaveTypeId, campusId },
  });
  if (!leaveType) throw new ApiError("Leave type not found", 404);

  // Overlapping-request guard: any non-terminal request for the same user
  // whose date range intersects this one is a conflict.
  const overlap = await findOverlappingLeave(campusId, user.userId, start, end);
  if (overlap) {
    throw new ApiError(
      `This overlaps your existing ${overlap.status.toLowerCase()} ${overlap.leaveType.name} leave (${overlap.fromDate.toISOString().slice(0, 10)} → ${overlap.toDate.toISOString().slice(0, 10)})`,
      409
    );
  }

  const days = body.days !== undefined
    ? Math.max(1, Math.round(Number(body.days) * 10))
    : rangeTenths(start, end);

  const request = await prisma.leaveRequest.create({
    data: {
      campusId,
      userId: user.userId,
      leaveTypeId,
      fromDate: start,
      toDate: end,
      days,
      reason: body.reason ? String(body.reason).trim().slice(0, 2000) || null : null,
      attachmentKey: body.attachmentKey ? String(body.attachmentKey) : null,
    },
  });

  notify("LEAVE_APPLIED", {
    schoolId: user.schoolId,
    campusId,
    leaveId: request.id,
    actorId: user.userId,
    actorName: user.fullName,
    leaveTypeName: leaveType.name,
    fromDate: start.toISOString().slice(0, 10),
    toDate: end.toISOString().slice(0, 10),
  });

  return request;
}

/** The route's overlap rule: a PENDING or APPROVED request of this person whose range intersects [start, end]. */
export function findOverlappingLeave(campusId: string, userId: string, start: Date, end: Date) {
  return prisma.leaveRequest.findFirst({
    where: {
      campusId,
      userId,
      status: { in: ["PENDING", "APPROVED"] },
      fromDate: { lte: end },
      toDate: { gte: start },
    },
    include: { leaveType: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
