import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// GET /api/academic/rooms?campusId= — list class rooms
// POST /api/academic/rooms {campusId, roomNumber, capacity?, note?}
// PATCH /api/academic/rooms {id, roomNumber?, capacity?, note?}
// DELETE /api/academic/rooms?id=

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));

    const rooms = await prisma.classRoom.findMany({
      where: { campusId },
      orderBy: [{ roomNumber: "asc" }],
      include: { _count: { select: { slots: true } } },
    });

    return Response.json({ success: true, data: rooms });
  } catch (error) {
    return errorResponse(error, "[academic/rooms] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "add");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const roomNumber = String(body.roomNumber ?? "").trim();
    if (!roomNumber) throw new ApiError("roomNumber is required", 400);

    const existing = await prisma.classRoom.findUnique({
      where: { campusId_roomNumber: { campusId, roomNumber } },
    });
    if (existing) throw new ApiError(`Room "${roomNumber}" already exists`, 409);

    const room = await prisma.classRoom.create({
      data: {
        campusId,
        roomNumber,
        capacity: Math.max(0, parseInt(String(body.capacity ?? "0"), 10) || 0),
        note: body.note ? String(body.note).trim().slice(0, 2000) || null : null,
      },
    });

    return Response.json({ success: true, data: room });
  } catch (error) {
    return errorResponse(error, "[academic/rooms] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "edit");

    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);

    const room = await prisma.classRoom.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!room) throw new ApiError("Room not found", 404);

    const roomNumber = body.roomNumber !== undefined ? String(body.roomNumber).trim() : room.roomNumber;
    if (!roomNumber) throw new ApiError("roomNumber cannot be empty", 400);
    if (roomNumber !== room.roomNumber) {
      const dup = await prisma.classRoom.findUnique({
        where: { campusId_roomNumber: { campusId: room.campusId, roomNumber } },
      });
      if (dup) throw new ApiError(`Room "${roomNumber}" already exists`, 409);
    }

    const updated = await prisma.classRoom.update({
      where: { id },
      data: {
        roomNumber,
        capacity: body.capacity !== undefined ? Math.max(0, parseInt(String(body.capacity), 10) || 0) : room.capacity,
        note: body.note !== undefined ? (String(body.note).trim().slice(0, 2000) || null) : room.note,
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[academic/rooms] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "delete");

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const room = await prisma.classRoom.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      select: { id: true, roomNumber: true, _count: { select: { slots: true } } },
    });
    if (!room) throw new ApiError("Room not found", 404);

    await prisma.classRoom.delete({ where: { id } });
    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[academic/rooms] DELETE failed");
  }
}
