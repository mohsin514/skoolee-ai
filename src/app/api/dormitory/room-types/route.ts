import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));

    const data = await prisma.dormRoomType.findMany({
      where: { campusId },
      include: { _count: { select: { rooms: true } } },
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[dormitory] GET room-types failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name || "").trim();
    if (!name) throw new ApiError("name is required", 400);

    const existing = await prisma.dormRoomType.findFirst({
      where: { campusId, name },
      select: { id: true },
    });
    if (existing) throw new ApiError("Room type already exists", 409);

    const data = await prisma.dormRoomType.create({
      data: {
        campusId,
        name,
        description: body.description ? String(body.description).trim() : null,
        // Paisa, matching every other money column.
        costPerTerm: Number.isFinite(Number(body.costPerTerm)) ? Math.max(0, Math.round(Number(body.costPerTerm))) : 0,
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[dormitory] POST room-types failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, body.campusId);

    const existing = await prisma.dormRoomType.findFirst({
      where: { id, campusId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Room type not found", 404);

    if (updates.name) {
      const name = String(updates.name).trim();
      const dup = await prisma.dormRoomType.findFirst({
        where: { campusId, name, id: { not: id } },
        select: { id: true },
      });
      if (dup) throw new ApiError("Room type already exists", 409);
      updates.name = name;
    }

    const data = await prisma.dormRoomType.update({
      where: { id },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.description !== undefined
          ? { description: updates.description ? String(updates.description).trim() : null }
          : {}),
        ...(updates.costPerTerm !== undefined
          ? { costPerTerm: Math.max(0, Math.round(Number(updates.costPerTerm) || 0)) }
          : {}),
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[dormitory] PATCH room-types failed");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));

    const existing = await prisma.dormRoomType.findFirst({
      where: { id, campusId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Room type not found", 404);

    const roomCount = await prisma.dormRoom.count({ where: { roomTypeId: id } });
    if (roomCount > 0) {
      throw new ApiError(`Cannot delete: ${roomCount} room(s) reference this room type`, 409);
    }

    const data = await prisma.dormRoomType.delete({ where: { id } });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[dormitory] DELETE room-types failed");
  }
}
