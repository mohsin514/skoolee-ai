import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { assignFeeGroup } from "@/lib/fees/group-assignment-command";
import { ApiError, assertPermission, canManageFinance, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";

// FeeGroupAssignment: which fee group serves which class for an academic year.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = user.role === "SUPER_ADMIN" ? searchParams.get("campusId") : user.campusId;

    const assignments = await prisma.feeGroupAssignment.findMany({
      where: { ...scopedCampusWhere(user, campusId) },
      include: {
        feeGroup: { select: { id: true, name: true } },
        class: { select: { id: true, name: true, section: true } },
      },
      orderBy: [{ academicYear: "desc" }, { class: { name: "asc" } }],
    });
    return Response.json({ success: true, data: assignments });
  } catch (error) {
    return errorResponse(error, "[fees/assignments] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "add");

    const body = await req.json();
    const assignment = await assignFeeGroup(user, body);
    return Response.json({ success: true, data: assignment }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/assignments] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "delete");

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feeGroupAssignment.findFirst({ where: { id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Assignment not found", 404);

    await prisma.$transaction(async (tx) => {
      await tx.feeGroupAssignment.delete({ where: { id } });
      await writeAuditEvent(tx, user, { table: "fee_group_assignments", recordId: id, action: "DELETE", campusId: existing.campusId, before: { feeGroupId: existing.feeGroupId, classId: existing.classId, academicYear: existing.academicYear } });
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/assignments] DELETE failed");
  }
}
