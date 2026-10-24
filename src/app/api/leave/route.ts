import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canLeadAcademics,
  canManageAcademics,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { getBatchLeaveBalances, getLeaveBalances } from "@/lib/leave";
import { applyLeave } from "@/lib/leave/apply-command";
import { getActiveAcademicYear } from "@/lib/academic/cycle";
import { resolveSourceActions } from "@/lib/notifications/actions";
import { isCampusOperator } from "@/lib/auth/institution";
import { isStaffRole } from "@/lib/roles";

const LEAVE_STAFF_ROLES = ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN"];

/** Whose leave a reviewer sees (§2.2 #33, §7.6): teaching staff belong to the academic lead (the principal,
 *  or a campus operator while no principal is appointed); everyone else, the principal included, to the
 *  campus operator. The group admin keeps a read-only view of every applicant. */
async function leaveApplicantRoles(user: Parameters<typeof canManageAcademics>[0], campusId: string, purpose: "decide" | "balances") {
  if (user.role === "SUPER_ADMIN") return LEAVE_STAFF_ROLES;
  if (user.role === "PRINCIPAL") return ["TEACHER"];
  if (!isCampusOperator(user)) return [];
  // Operators own allocations, so their balance view covers every member of staff.
  if (purpose === "balances") return LEAVE_STAFF_ROLES;
  const leadsTeaching = await canLeadAcademics(user, campusId);
  return leadsTeaching ? LEAVE_STAFF_ROLES : LEAVE_STAFF_ROLES.filter((role) => role !== "TEACHER");
}

// Leave requests.
// GET — ?mode=my        staff: their own requests + balances
//       ?mode=all       admin: every request on the campus (with reviewer info)
//       ?userId=&...    admin: balances for a specific user/year
// POST — apply for leave { leaveTypeId, fromDate, toDate, reason?, days?, attachmentKey? }

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Staff leave, including the campus's leave-type list. "my" mode is scoped
    // to the caller so nothing leaked, but a student or guardian has no leave
    // record and no reason to be on this module — the matrix says so, and now
    // this route asks it.
    await assertModuleRead(user, "leave");
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const mode = searchParams.get("mode") || "my";
    const academicYear =
      Number(searchParams.get("academicYear")) || (await getActiveAcademicYear(campusId));
    const statusFilter = searchParams.get("status");

    const yearStart = new Date(`${academicYear}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${academicYear + 1}-01-01T00:00:00Z`);

    if (mode === "balances") {
      if (!canManageAcademics(user)) throw new ApiError("Insufficient permissions", 403);
      const roles = await leaveApplicantRoles(user, campusId, "balances");
      const staff = await prisma.user.findMany({
        where: {
          campusId,
          schoolId: user.schoolId,
          isActive: true,
          role: { in: roles as any },
        },
        select: { id: true, fullName: true, role: true, email: true },
        orderBy: { fullName: "asc" },
      });
      const balancesMap = await getBatchLeaveBalances(campusId, staff, academicYear);
      const balancesAll = staff.map((s) => ({
        user: s,
        balances: balancesMap.get(s.id) || [],
      }));
      return Response.json({ success: true, data: { staff: balancesAll, academicYear } });
    }

    if (mode === "all") {
      if (!canManageAcademics(user)) throw new ApiError("Insufficient permissions", 403);
      const roles = await leaveApplicantRoles(user, campusId, "decide");
      const [requests, users] = await Promise.all([
        prisma.leaveRequest.findMany({
          where: {
            campusId,
            user: { role: { in: roles as any } },
            ...(statusFilter ? { status: String(statusFilter).toUpperCase() } : {}),
            fromDate: { gte: yearStart, lt: yearEnd },
          },
          include: {
            leaveType: { select: { name: true } },
            user: { select: { id: true, fullName: true, email: true, role: true } },
            reviewedBy: { select: { id: true, fullName: true } },
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        }),
        prisma.user.findMany({
          where: { campusId, schoolId: user.schoolId, isActive: true, role: { in: roles as any } },
          select: { id: true, fullName: true, role: true },
          orderBy: { fullName: "asc" },
        }),
      ]);
      return Response.json({ success: true, data: { requests, users } });
    }

    // "my" — any signed-in staff sees their own requests and balances
    const [requests, balances, types] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          campusId,
          userId: user.userId,
          ...(statusFilter ? { status: String(statusFilter).toUpperCase() } : {}),
        },
        include: {
          leaveType: { select: { name: true, defaultDays: true } },
          reviewedBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      getLeaveBalances(campusId, user.userId, user.role, academicYear),
      prisma.leaveType.findMany({ where: { campusId }, orderBy: { name: "asc" } }),
    ]);

    return Response.json({ success: true, data: { requests, balances, types, academicYear } });
  } catch (error) {
    return errorResponse(error, "[leave] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Leave is for members of staff; families and the platform operator have no leave record.
    if (!isStaffRole(user.role)) throw new ApiError("Leave applications are for school staff.", 403);
    const body = await req.json();
    const request = await applyLeave(user, body);

    return Response.json({ success: true, data: request }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[leave] POST failed");
  }
}

// PATCH /api/leave — { id } lets the requester cancel their own PENDING request.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);

    const request = await prisma.leaveRequest.findFirst({
      where: { id, userId: user.userId },
    });
    if (!request) throw new ApiError("Leave request not found", 404);
    if (request.status !== "PENDING") {
      throw new ApiError(`Only pending requests can be cancelled (current status: ${request.status})`, 409);
    }

    const changed = await prisma.leaveRequest.updateMany({
      where: { id, schoolId: user.schoolId, userId: user.userId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (changed.count !== 1) throw new ApiError("This request was already reviewed or cancelled. Refresh its status.", 409);
    // SKO-416: reviewers' "review this leave" actions close because the request was withdrawn.
    await resolveSourceActions({ schoolId: user.schoolId, sourceType: "leave", sourceId: id, resolution: "CANCELLED" });
    const updated = await prisma.leaveRequest.findFirstOrThrow({ where: { id, schoolId: user.schoolId, userId: user.userId } });
    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[leave] PATCH failed");
  }
}
