import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { roomCapacity, roomLocation } from "@/lib/academic/room-capacity";

// GET /api/academic/rooms?campusId= — list class rooms with exam-day capacity
// POST /api/academic/rooms {campusId, roomNumber, ...layout}
// PATCH /api/academic/rooms {id, ...}
// DELETE /api/academic/rooms?id=
//
// Rooms carry two capacities (§79): the teaching figure everyone already knew
// about, and the exam figure derived from the bench layout. Both are returned
// so a screen never has to guess which one it is looking at.

const ROOM_TYPES = new Set(["CLASSROOM", "HALL", "LAB", "LIBRARY", "AUDITORIUM"]);

function toInt(value: unknown, fallback: number, { min = 0, max = 500 } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function text(value: unknown, limit = 120): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, limit) : null;
}

/**
 * Turn the request body into the stored shape.
 *
 * `capacity` is deliberately derived from the layout when one is given: a room
 * that says "5 rows × 2 benches × 3 seats" and also "capacity 40" is a room
 * with two contradictory answers, and the layout is the one an invigilator can
 * verify by walking in.
 */
function layoutFrom(body: Record<string, unknown>, current?: {
  capacity: number;
  rows: number;
  benchesPerRow: number;
  seatsPerBench: number;
  examSeatsPerBench: number;
}) {
  const rows = toInt(body.rows, current?.rows ?? 0, { max: 60 });
  const benchesPerRow = toInt(body.benchesPerRow, current?.benchesPerRow ?? 0, { max: 60 });
  const seatsPerBench = toInt(body.seatsPerBench, current?.seatsPerBench ?? 1, { min: 1, max: 10 });
  // Exam spacing can never exceed how many actually fit on the bench.
  const examSeatsPerBench = Math.min(
    toInt(body.examSeatsPerBench, current?.examSeatsPerBench ?? 1, { min: 1, max: 10 }),
    seatsPerBench,
  );

  const derived = rows > 0 && benchesPerRow > 0 ? rows * benchesPerRow * seatsPerBench : null;
  const capacity = derived ?? toInt(body.capacity, current?.capacity ?? 0, { max: 2000 });

  return { rows, benchesPerRow, seatsPerBench, examSeatsPerBench, capacity };
}

function decorate<T extends Parameters<typeof roomCapacity>[0] & { building?: string | null; floor?: number | null; wing?: string | null }>(room: T) {
  const cap = roomCapacity(room);
  return {
    ...room,
    location: roomLocation(room),
    examCapacity: cap.exam,
    teachingCapacity: cap.teaching,
    benches: cap.benches,
    spacingLoss: cap.spacingLoss,
    hasLayout: cap.hasLayout,
    unmeasured: cap.unmeasured,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));

    const rooms = await prisma.classRoom.findMany({
      where: { campusId },
      orderBy: [{ building: "asc" }, { floor: "asc" }, { roomNumber: "asc" }],
      // Exam usage matters as much as timetable usage when deciding whether a
      // room can be renamed or removed.
      include: { _count: { select: { slots: true, examSchedules: true, examRooms: true } } },
    });

    return Response.json({ success: true, data: rooms.map(decorate) });
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

    const roomType = String(body.roomType ?? "CLASSROOM");
    if (!ROOM_TYPES.has(roomType)) throw new ApiError("Unknown room type", 400);

    const room = await prisma.classRoom.create({
      data: {
        campusId,
        roomNumber,
        note: text(body.note, 2000),
        building: text(body.building),
        floor: toInt(body.floor, 0, { min: -5, max: 60 }),
        wing: text(body.wing, 60),
        roomType,
        isExamHall: Boolean(body.isExamHall) || roomType === "HALL",
        ...layoutFrom(body),
      },
    });

    return Response.json({ success: true, data: decorate(room) });
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

    const roomType = body.roomType !== undefined ? String(body.roomType) : room.roomType;
    if (!ROOM_TYPES.has(roomType)) throw new ApiError("Unknown room type", 400);

    const updated = await prisma.classRoom.update({
      where: { id },
      data: {
        roomNumber,
        note: body.note !== undefined ? text(body.note, 2000) : room.note,
        building: body.building !== undefined ? text(body.building) : room.building,
        floor: body.floor !== undefined ? toInt(body.floor, room.floor, { min: -5, max: 60 }) : room.floor,
        wing: body.wing !== undefined ? text(body.wing, 60) : room.wing,
        roomType,
        isExamHall:
          body.isExamHall !== undefined ? Boolean(body.isExamHall) : room.isExamHall,
        ...layoutFrom(body, room),
      },
    });

    return Response.json({ success: true, data: decorate(updated) });
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
      select: {
        id: true,
        roomNumber: true,
        _count: { select: { slots: true, examSchedules: true, examRooms: true } },
      },
    });
    if (!room) throw new ApiError("Room not found", 404);

    // The usage count was already being read here and then ignored, so deleting
    // a room that timetables and date sheets point at silently unpicked those
    // assignments. Refuse, and say exactly what is holding the room.
    const holds: string[] = [];
    if (room._count.slots > 0) {
      holds.push(`${room._count.slots} timetable slot${room._count.slots === 1 ? "" : "s"}`);
    }
    const examUses = room._count.examSchedules + room._count.examRooms;
    if (examUses > 0) {
      holds.push(`${examUses} exam paper${examUses === 1 ? "" : "s"}`);
    }
    if (holds.length > 0) {
      throw new ApiError(
        `Room ${room.roomNumber} is still in use by ${holds.join(" and ")}. Move them to another room first.`,
        409,
      );
    }

    await prisma.classRoom.delete({ where: { id } });
    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[academic/rooms] DELETE failed");
  }
}
