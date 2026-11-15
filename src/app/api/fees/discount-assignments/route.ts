import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { assignDiscount } from "@/lib/fees/assign-discount-command";
import { ApiError, assertFeesRead, assertPermission, canManageFinance, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { isInstitutionAuthority } from "@/lib/auth/institution";

// FeeDiscountAssignment: attach/detach a discount to a specific student.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // SKAI-2021: assignments expose a pupil's scholarship/discount, so they are finance data like the discount list.
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertFeesRead(user);
    // Campus-pinned staff read only their own campus; a non-institution user with no campus fails closed.
    const institution = isInstitutionAuthority(user);
    if (!institution && !user.campusId) throw new ApiError("Insufficient permissions", 403);
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const discountId = searchParams.get("discountId");

    const assignments = await prisma.feeDiscountAssignment.findMany({
      where: {
        ...(studentId ? { studentId } : {}),
        ...(discountId ? { discountId } : {}),
        student: { campus: { schoolId: user.schoolId, ...(institution ? {} : { id: user.campusId as string }) } },
      },
      include: {
        discount: { select: { id: true, name: true, code: true, type: true, value: true } },
        student: { select: { id: true, fullName: true, rollNo: true } },
      },
      orderBy: { student: { fullName: "asc" } },
    });
    return Response.json({ success: true, data: assignments });
  } catch (error) {
    return errorResponse(error, "[fees/discount-assignments] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "add");

    const body = await parseBody(req, jsonObjectBody);
    const assignment = await assignDiscount(user, body);
    return Response.json({ success: true, data: assignment }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/discount-assignments] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  return operationDeleteResponse(req, "fees/discount-assignments");
}
