import { withSchedulingResourceWrite, resourceScope } from "@/lib/academic/resource-write";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { getLeaveBalances, tenthsToDays } from "@/lib/leave";
import { notify } from "@/lib/notifications/in-app";
import { resolveSourceActions } from "@/lib/notifications/actions";

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

    const target = await prisma.leaveRequest.findFirst({ where: { id, ...resourceScope(user) }, select: { campusId: true } });
    if (!target) throw new ApiError("Leave request not found", 404);
    const { request, updated } = await withSchedulingResourceWrite(user, target.campusId, "leave", "edit", async tx => {
      const request = await tx.leaveRequest.findFirst({
        where: { id, ...resourceScope(user), campusId: target.campusId },
        include: { leaveType: { select: { name: true } }, user: { select: { role: true } } },
      });
      if (!request) throw new ApiError("Leave request not found", 404);
      if (request.status !== "PENDING") {
        throw new ApiError(`This request was already ${request.status.toLowerCase()}`, 409);
      }

      if (status === "APPROVED") {
        if (await tx.schoolAiSubstituteDuty.count({ where: { schoolId: user.schoolId, campusId: request.campusId, teacherId: request.userId, status: "ASSIGNED", date: { gte: new Date(request.fromDate.toISOString().slice(0, 10)), lte: new Date(request.toDate.toISOString().slice(0, 10)) } } })) throw new ApiError("This staff member has substitute cover during this leave. Reassign or cancel the cover before approving leave.", 409);
        if (await tx.examInvigilation.count({ where: { schoolId: user.schoolId, campusId: request.campusId, teacherId: request.userId, examRoom: { examSchedule: { date: { gte: request.fromDate, lte: request.toDate }, exam: { status: { notIn: ["CANCELLED", "ARCHIVED"] }, class: { archivedAt: null } } } } } })) throw new ApiError("This staff member has an exam duty during this leave. Reassign or clear that duty before approving leave.", 409);
        const fromYear = request.fromDate.getUTCFullYear();
        const balances = await getLeaveBalances(
          request.campusId,
          request.userId,
          request.user.role,
          fromYear,
          tx
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

      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status,
          reviewedById: user.userId,
          reviewedAt: new Date(),
          reviewNote: body.reviewNote ? String(body.reviewNote).trim().slice(0, 2000) || null : null,
        },
      });

      return { request, updated };
    });

    // SKO-416: every reviewer's action for this request is resolved by the decision itself.
    await resolveSourceActions({ schoolId: user.schoolId, sourceType: "leave", sourceId: request.id, resolution: "COMPLETED" });

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
