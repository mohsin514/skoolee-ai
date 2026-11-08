import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { createDiscount } from "@/lib/fees/discount-command";
import { ApiError, assertPermission, canManageFinance, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

// FeeDiscount: named discount, PERCENT (value 0-100) or FLAT (paisa).
// Optional categoryId auto-applies to all students in that StudentCategory.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = user.role === "SUPER_ADMIN" ? searchParams.get("campusId") : user.campusId;

    const discounts = await prisma.feeDiscount.findMany({
      where: { ...scopedCampusWhere(user, campusId) },
      include: {
        category: { select: { id: true, name: true } },
        assignments: { select: { id: true, studentId: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { name: "asc" },
    });
    return Response.json({ success: true, data: discounts });
  } catch (error) {
    return errorResponse(error, "[fees/discounts] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "add");

    const body = await parseBody(req, jsonObjectBody);
    const discount = await createDiscount(user, body);
    return Response.json({ success: true, data: discount }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/discounts] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "edit");

    const body = await parseBody(req, idBody);

    const existing = await prisma.feeDiscount.findFirst({ where: { id: body.id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Discount not found", 404);

    const type = body.type !== undefined ? String(body.type).toUpperCase() : existing.type;
    if (type !== "PERCENT" && type !== "FLAT") throw new ApiError("type must be PERCENT or FLAT", 400);

    const value = body.value !== undefined ? Number(body.value) : existing.value;
    if (!Number.isInteger(value) || value < 0) throw new ApiError("value must be a non-negative integer", 400);
    if (type === "PERCENT" && value > 100) throw new ApiError("percent discount cannot exceed 100", 400);

    if (body.categoryId !== undefined && body.categoryId) {
      const category = await prisma.studentCategory.findFirst({ where: { id: body.categoryId, campusId: existing.campusId } });
      if (!category) throw new ApiError("Category not found", 404);
    }

    const discount = await prisma.$transaction(async (tx) => {
      const next = await tx.feeDiscount.update({
        where: { id: body.id },
        data: {
          name: body.name !== undefined ? String(body.name).trim() : undefined,
          type,
          value,
          categoryId: body.categoryId !== undefined ? body.categoryId || null : undefined,
        },
        include: { category: { select: { id: true, name: true } } },
      });
      await writeAuditEvent(tx, user, { table: "fee_discounts", recordId: next.id, action: "UPDATE", campusId: existing.campusId, before: { type: existing.type, value: existing.value, categoryId: existing.categoryId }, after: { type: next.type, value: next.value, categoryId: next.categoryId } });
      return next;
    });
    return Response.json({ success: true, data: discount });
  } catch (error) {
    return errorResponse(error, "[fees/discounts] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  return operationDeleteResponse(req, "fees/discounts");
}
