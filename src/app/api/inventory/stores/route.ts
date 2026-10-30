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

    const stores = await prisma.itemStore.findMany({
      where: { campusId },
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data: stores });
  } catch (error) {
    return errorResponse(error, "[inventory/stores] GET failed");
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

    const existing = await prisma.itemStore.findFirst({ where: { campusId, name } });
    if (existing) throw new ApiError("Store with this name already exists", 409);

    const store = await prisma.itemStore.create({
      data: { campusId, name },
    });

    return Response.json({ success: true, data: store }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[inventory/stores] POST failed");
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

    const store = await prisma.itemStore.findFirst({ where: { id, campusId } });
    if (!store) throw new ApiError("Store not found", 404);

    if (name && name !== store.name) {
      const existing = await prisma.itemStore.findFirst({ where: { campusId, name, id: { not: id } } });
      if (existing) throw new ApiError("Store with this name already exists", 409);
    }

    const updated = await prisma.itemStore.update({
      where: { id },
      data: { ...(name !== undefined ? { name } : {}) },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[inventory/stores] PATCH failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "inventory/stores");
}
