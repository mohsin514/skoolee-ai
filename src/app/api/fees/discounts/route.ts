import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId, scopedCampusWhere } from "@/lib/api/scope";

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
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name ?? "").trim();
    const code = String(body.code ?? "").trim().toUpperCase().replace(/\s+/g, "_");
    const type = String(body.type ?? "").toUpperCase();

    if (!name || !code) throw new ApiError("name and code required", 400);
    if (type !== "PERCENT" && type !== "FLAT") throw new ApiError("type must be PERCENT or FLAT", 400);

    const value = Number(body.value);
    if (!Number.isInteger(value) || value < 0) throw new ApiError("value must be a non-negative integer", 400);
    if (type === "PERCENT" && value > 100) throw new ApiError("percent discount cannot exceed 100", 400);

    if (body.categoryId) {
      const category = await prisma.studentCategory.findFirst({ where: { id: body.categoryId, campusId } });
      if (!category) throw new ApiError("Category not found", 404);
    }

    const existing = await prisma.feeDiscount.findUnique({ where: { campusId_code: { campusId, code } } });
    if (existing) throw new ApiError("A discount with this code already exists", 409);

    const discount = await prisma.feeDiscount.create({
      data: { campusId, name, code, type, value, categoryId: body.categoryId ?? null },
      include: { category: { select: { id: true, name: true } } },
    });
    return Response.json({ success: true, data: discount }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/discounts] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    if (!body.id) throw new ApiError("id required", 400);

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

    const discount = await prisma.feeDiscount.update({
      where: { id: body.id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        type,
        value,
        categoryId: body.categoryId !== undefined ? body.categoryId || null : undefined,
      },
      include: { category: { select: { id: true, name: true } } },
    });
    return Response.json({ success: true, data: discount });
  } catch (error) {
    return errorResponse(error, "[fees/discounts] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feeDiscount.findFirst({ where: { id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Discount not found", 404);

    await prisma.feeDiscount.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/discounts] DELETE failed");
  }
}
