import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { createFeeGroup } from "@/lib/fees/fee-group-command";
import { ApiError, assertPermission, canManageFinance, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = user.role === "SUPER_ADMIN" ? searchParams.get("campusId") : user.campusId;

    const groups = await prisma.feeGroup.findMany({
      where: { ...scopedCampusWhere(user, campusId) },
      include: {
        lines: {
          include: { feeType: { select: { id: true, name: true, code: true } } },
          orderBy: { feeType: { name: "asc" } },
        },
        assignments: {
          include: { class: { select: { id: true, name: true, section: true } } },
        },
      },
      orderBy: { name: "asc" },
    });
    return Response.json({ success: true, data: groups });
  } catch (error) {
    return errorResponse(error, "[fees/groups] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "add");

    const body = await req.json();
    const group = await createFeeGroup(user, body);
    return Response.json({ success: true, data: group }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/groups] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "edit");

    const body = await req.json();
    if (!body.id) throw new ApiError("id required", 400);

    const existing = await prisma.feeGroup.findFirst({ where: { id: body.id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Fee group not found", 404);

    const group = await prisma.$transaction(async (tx) => {
      const next = await tx.feeGroup.update({
        where: { id: body.id },
        data: {
          name: body.name !== undefined ? String(body.name).trim() : undefined,
          description: body.description !== undefined ? body.description : undefined,
        },
      });
      await writeAuditEvent(tx, user, { table: "fee_groups", recordId: next.id, action: "UPDATE", campusId: existing.campusId, after: { renamed: body.name !== undefined && next.name !== existing.name } });
      return next;
    });
    return Response.json({ success: true, data: group });
  } catch (error) {
    return errorResponse(error, "[fees/groups] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "delete");

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feeGroup.findFirst({ where: { id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Fee group not found", 404);

    await prisma.$transaction(async (tx) => {
      // SKO-389: a group still assigned to classes or holding master lines is not deleted with them.
      const [lines, assignments] = await Promise.all([tx.feesMasterLine.count({ where: { feeGroupId: id } }), tx.feeGroupAssignment.count({ where: { feeGroupId: id } })]);
      if (lines || assignments) throw new ApiError(`This fee group has ${lines} master line(s) and ${assignments} class assignment(s). Remove those first; invoices already issued are not affected.`, 409);
      await tx.feeGroup.delete({ where: { id } });
      await writeAuditEvent(tx, user, { table: "fee_groups", recordId: id, action: "DELETE", campusId: existing.campusId, before: { currency: existing.currency } });
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/groups] DELETE failed");
  }
}
