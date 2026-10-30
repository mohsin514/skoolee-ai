import { operationDeleteResponse } from "@/lib/destructive/operations";
import { listPagination, pageWindow } from "@/lib/lists/query";
import { assertListBudget } from "@/lib/lists/access";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageCampusOps,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "inventory");
    await assertListBudget(user, "inventory/items");
    const params = req.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));
    const search = (params.get("search") ?? "").trim().slice(0, 100);
    const categoryId = params.get("categoryId");
    const { page: requestedPage, limit } = listPagination(params, 24, 100);
    const where = { schoolId: user.schoolId, campusId, ...(categoryId ? { categoryId } : {}), ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}) };
    const total = await prisma.item.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);
    const data = await prisma.item.findMany({
      where, include: { category: true, stock: { include: { store: { select: { id: true, name: true } } } } },
      orderBy: [{ name: params.get("sort") === "name-desc" ? "desc" : "asc" }, { id: "asc" }],
      skip, take: limit,
    });
    return Response.json({ success: true, data, pagination: { page, limit, total, pages } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, "[inventory/items] GET failed"); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await parseBody(req, jsonObjectBody);
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
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await parseBody(req, jsonObjectBody);
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

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "inventory/items");
}
