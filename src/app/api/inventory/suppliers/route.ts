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

    const suppliers = await prisma.supplier.findMany({
      where: { campusId },
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data: suppliers });
  } catch (error) {
    return errorResponse(error, "[inventory/suppliers] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await parseBody(req, jsonObjectBody);
    const { name, phone, email, address } = body;

    if (!name) throw new ApiError("name required", 400);

    const supplier = await prisma.supplier.create({
      data: {
        campusId,
        name,
        phone: phone ?? null,
        email: email ?? null,
        address: address ?? null,
      },
    });

    return Response.json({ success: true, data: supplier }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[inventory/suppliers] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await parseBody(req, jsonObjectBody);
    const { id, name, phone, email, address } = body;

    if (!id) throw new ApiError("id required", 400);

    const supplier = await prisma.supplier.findFirst({ where: { id, campusId } });
    if (!supplier) throw new ApiError("Supplier not found", 404);

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(address !== undefined ? { address } : {}),
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[inventory/suppliers] PATCH failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "inventory/suppliers");
}
