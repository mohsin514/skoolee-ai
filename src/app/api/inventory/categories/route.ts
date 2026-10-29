import { operationDeleteResponse } from "@/lib/destructive/operations";
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
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const categories = await prisma.itemCategory.findMany({
      where: { campusId },
      include: { _count: { select: { items: true } } },
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data: categories });
  } catch (error) {
    return errorResponse(error, "[inventory/categories] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await parseBody(req, jsonObjectBody);
    const { name } = body;

    if (!name) throw new ApiError("name required", 400);

    const existing = await prisma.itemCategory.findFirst({
      where: { campusId, name },
    });
    if (existing) throw new ApiError("Category with this name already exists", 409);

    const category = await prisma.itemCategory.create({
      data: { campusId, name },
    });

    return Response.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[inventory/categories] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await parseBody(req, jsonObjectBody);
    const { id, name } = body;

    if (!id) throw new ApiError("id required", 400);

    const category = await prisma.itemCategory.findFirst({ where: { id, campusId } });
    if (!category) throw new ApiError("Category not found", 404);

    if (name && name !== category.name) {
      const existing = await prisma.itemCategory.findFirst({
        where: { campusId, name, id: { not: id } },
      });
      if (existing) throw new ApiError("Category with this name already exists", 409);
    }

    const updated = await prisma.itemCategory.update({
      where: { id },
      data: { ...(name !== undefined ? { name } : {}) },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[inventory/categories] PATCH failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "inventory/categories");
}
