import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));

    const data = await prisma.dormRoom.findMany({
      where: { campusId },
      include: {
        roomType: { select: { name: true } },
        _count: { select: { students: true } },
      },
      orderBy: { number: "asc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[dormitory] GET rooms failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const campusId = await resolveCampusId(user, body.campusId);

    const roomTypeId = String(body.roomTypeId || "").trim();
    const number = String(body.number || "").trim();
    const capacity = Number(body.capacity);

    if (!roomTypeId) throw new ApiError("roomTypeId is required", 400);
    if (!number) throw new ApiError("number is required", 400);
    if (!Number.isFinite(capacity) || capacity <= 0) throw new ApiError("capacity must be a positive number", 400);

    const roomType = await prisma.dormRoomType.findFirst({
      where: { id: roomTypeId, campusId },
      select: { id: true },
    });
    if (!roomType) throw new ApiError("Room type not found", 404);

    const existing = await prisma.dormRoom.findFirst({
      where: { campusId, number },
      select: { id: true },
    });
    if (existing) throw new ApiError("Room number already exists", 409);

    const data = await prisma.dormRoom.create({
      data: { campusId, roomTypeId, number, capacity },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[dormitory] POST rooms failed");
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

    const existing = await prisma.dormRoom.findFirst({
      where: { id, campusId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Room not found", 404);

    const data: { roomTypeId?: string; number?: string; capacity?: number } = {};

    if (updates.roomTypeId) {
      const roomType = await prisma.dormRoomType.findFirst({
        where: { id: updates.roomTypeId, campusId },
        select: { id: true },
      });
      if (!roomType) throw new ApiError("Room type not found", 404);
      data.roomTypeId = updates.roomTypeId;
    }

    if (updates.number) {
      const number = String(updates.number).trim();
      const dup = await prisma.dormRoom.findFirst({
        where: { campusId, number, id: { not: id } },
        select: { id: true },
      });
      if (dup) throw new ApiError("Room number already exists", 409);
      data.number = number;
    }

    if (updates.capacity !== undefined) {
      const capacity = Number(updates.capacity);
      if (!Number.isFinite(capacity) || capacity <= 0) throw new ApiError("capacity must be a positive number", 400);
      data.capacity = capacity;
    }

    const room = await prisma.dormRoom.update({ where: { id }, data });

    return Response.json({ success: true, data: room });
  } catch (error) {
    return errorResponse(error, "[dormitory] PATCH rooms failed");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));

    const existing = await prisma.dormRoom.findFirst({
      where: { id, campusId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Room not found", 404);

    const studentCount = await prisma.student.count({ where: { dormRoomId: id } });
    if (studentCount > 0) {
      throw new ApiError(`Cannot delete: ${studentCount} student(s) reference this room`, 409);
    }

    const data = await prisma.dormRoom.delete({ where: { id } });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[dormitory] DELETE rooms failed");
  }
}
