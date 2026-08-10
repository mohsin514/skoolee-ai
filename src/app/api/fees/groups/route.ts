import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId, scopedCampusWhere } from "@/lib/api/scope";

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
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError("name required", 400);

    const existing = await prisma.feeGroup.findFirst({ where: { campusId, name } });
    if (existing) throw new ApiError("A fee group with this name already exists", 409);

    const group = await prisma.feeGroup.create({
      data: { campusId, name, description: body.description ?? null },
    });
    return Response.json({ success: true, data: group }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/groups] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    if (!body.id) throw new ApiError("id required", 400);

    const existing = await prisma.feeGroup.findFirst({ where: { id: body.id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Fee group not found", 404);

    const group = await prisma.feeGroup.update({
      where: { id: body.id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        description: body.description !== undefined ? body.description : undefined,
      },
    });
    return Response.json({ success: true, data: group });
  } catch (error) {
    return errorResponse(error, "[fees/groups] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feeGroup.findFirst({ where: { id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Fee group not found", 404);

    await prisma.feeGroup.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/groups] DELETE failed");
  }
}
