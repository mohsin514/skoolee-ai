import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { getLeaveBalances, tenthsToDays } from "@/lib/leave";
import { notify } from "@/lib/notifications/in-app";

// PATCH /api/leave/review
// body: { id, status: APPROVED | REJECTED, reviewNote?, override? }
// Approving beyond the remaining allocation is refused unless override=true.

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "leave", "edit");
    const body = await req.json();

    const id = String(body.id ?? "");
    const status = String(body.status ?? "").toUpperCase();
    if (!id) throw new ApiError("id is required", 400);
    if (status !== "APPROVED" && status !== "REJECTED") {
      throw new ApiError("status must be APPROVED or REJECTED", 400);
    }

    const request = await prisma.leaveRequest.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      include: { leaveType: { select: { name: true } }, user: { select: { role: true } } },
    });
    if (!request) throw new ApiError("Leave request not found", 404);
    if (request.status === "APPROVED" || request.status === "REJECTED") {
      throw new ApiError(`This request was already ${request.status.toLowerCase()}`, 409);
    }

    if (status === "APPROVED") {
      const fromYear = request.fromDate.getFullYear();
      const balances = await getLeaveBalances(
        request.campusId,
        request.userId,
        request.user.role,
        fromYear
      );
      const balance = balances.find((b) => b.leaveTypeId === request.leaveTypeId);
      const allocated = balance?.allocated ?? 0;
      const alreadyApproved = balance?.approved ?? 0;

      if (allocated === 0 && !body.override) {
        throw new ApiError(
          `No ${request.leaveType.name} allocation exists for this staff member in ${fromYear}. Approve with override to continue.`,
          409
        );
      }
      if (allocated > 0 && alreadyApproved + request.days > allocated && !body.override) {
        const over = (alreadyApproved + request.days - allocated) / 10;
        throw new ApiError(
          `Approving ${tenthsToDays(request.days)} day(s) exceeds the remaining ${tenthsToDays(allocated - alreadyApproved)} ${request.leaveType.name} balance by ${over} day(s). Approve with override to continue.`,
          409
        );
      }
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: user.userId,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote ? String(body.reviewNote).trim().slice(0, 2000) || null : null,
      },
    });

    notify("LEAVE_REVIEWED", {
      schoolId: user.schoolId,
      campusId: request.campusId,
      actorId: user.userId,
      actorName: user.fullName,
      recipientId: request.userId,
      leaveTypeName: request.leaveType.name,
      fromDate: request.fromDate.toISOString().slice(0, 10),
      toDate: request.toDate.toISOString().slice(0, 10),
      status,
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[leave/review] PATCH failed");
  }
}
