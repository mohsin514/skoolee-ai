import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "inventory");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const search = req.nextUrl.searchParams.get("search");

    const where: any = { campusId };
    if (search) where.name = { contains: search, mode: "insensitive" };

    const items = await prisma.item.findMany({
      where,
      include: {
        category: true,
        stock: {
          include: { store: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data: items });
  } catch (error) {
    return errorResponse(error, "[inventory/items] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await req.json();
    const { name, unit, categoryId } = body;

    if (!name) throw new ApiError("name required", 400);

    if (categoryId) {
      const category = await prisma.itemCategory.findFirst({ where: { id: categoryId, campusId } });
      if (!category) throw new ApiError("Category not found", 404);
    }

    const item = await prisma.item.create({
      data: { campusId, name, unit: unit ?? null, categoryId: categoryId ?? null },
      include: { category: true, stock: { include: { store: { select: { id: true, name: true } } } } },
    });

    return Response.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[inventory/items] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await req.json();
    const { id, name, unit, categoryId } = body;

    if (!id) throw new ApiError("id required", 400);

    const item = await prisma.item.findFirst({ where: { id, campusId } });
    if (!item) throw new ApiError("Item not found", 404);

    if (categoryId) {
      const category = await prisma.itemCategory.findFirst({ where: { id: categoryId, campusId } });
      if (!category) throw new ApiError("Category not found", 404);
    }

    const updated = await prisma.item.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(unit !== undefined ? { unit } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
      },
      include: { category: true, stock: { include: { store: { select: { id: true, name: true } } } } },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[inventory/items] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const item = await prisma.item.findFirst({
      where: { id, campusId },
      include: { stock: true },
    });
    if (!item) throw new ApiError("Item not found", 404);

    const hasStock = item.stock.some((s) => s.quantity > 0);
    if (hasStock) {
      throw new ApiError("Cannot delete item with remaining stock quantity", 409);
    }

    await prisma.item.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[inventory/items] DELETE failed");
  }
}
