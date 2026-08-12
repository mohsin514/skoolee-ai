import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { getBatchLeaveBalances, getLeaveBalances, rangeTenths } from "@/lib/leave";
import { notify } from "@/lib/notifications/in-app";

// Leave requests.
// GET — ?mode=my        staff: their own requests + balances
//       ?mode=all       admin: every request on the campus (with reviewer info)
//       ?userId=&...    admin: balances for a specific user/year
// POST — apply for leave { leaveTypeId, fromDate, toDate, reason?, days?, attachmentKey? }

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const mode = searchParams.get("mode") || "my";
    const academicYear = Number(searchParams.get("academicYear")) || new Date().getFullYear();
    const statusFilter = searchParams.get("status");

    const yearStart = new Date(`${academicYear}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${academicYear + 1}-01-01T00:00:00Z`);

    if (mode === "balances") {
      if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
      const staff = await prisma.user.findMany({
        where: {
          campusId,
          schoolId: user.schoolId,
          isActive: true,
          role: { in: ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN"] as any },
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
      if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
      const [requests, users] = await Promise.all([
        prisma.leaveRequest.findMany({
          where: {
            campusId,
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
          where: { campusId, schoolId: user.schoolId, isActive: true },
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
    const body = await req.json();

    const campusId = await resolveCampusId(user, body.campusId);
    const leaveTypeId = String(body.leaveTypeId ?? "");
    const fromDate = body.fromDate ? new Date(String(body.fromDate)) : null;
    const toDate = body.toDate ? new Date(String(body.toDate)) : null;

    if (!leaveTypeId) throw new ApiError("leaveTypeId is required", 400);
    if (!fromDate || isNaN(fromDate.getTime())) throw new ApiError("Valid fromDate is required", 400);
    if (!toDate || isNaN(toDate.getTime())) throw new ApiError("Valid toDate is required", 400);

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
    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        campusId,
        userId: user.userId,
        status: { in: ["PENDING", "APPROVED"] },
        fromDate: { lte: end },
        toDate: { gte: start },
      },
      include: { leaveType: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
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
      actorId: user.userId,
      actorName: user.fullName,
      leaveTypeName: leaveType.name,
      fromDate: start.toISOString().slice(0, 10),
      toDate: end.toISOString().slice(0, 10),
    });

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

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[leave] PATCH failed");
  }
}
