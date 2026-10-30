import { operationDeleteResponse } from "@/lib/destructive/operations";
import { withSchedulingResourceWrite, resourceScope } from "@/lib/academic/resource-write";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageCampusOps, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { roomCapacity, roomLocation } from "@/lib/academic/room-capacity";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { BULK_ROOM_LIMIT, cleanRoomName, parseBulkRooms } from "@/lib/academic/room-setup";
import type { TxClient } from "@/lib/db/prisma";

// GET /api/academic/rooms?campusId= — list class rooms with exam-day capacity
// POST /api/academic/rooms {campusId, roomNumber, ...layout}
// PATCH /api/academic/rooms {id, ...}
// DELETE /api/academic/rooms?id=  (blocked while booked — archive instead)
// POST {campusId, rooms: "<pasted lines>"} bulk-adds all rows or none (SKAI-147)
// PATCH {id, archived: true|false} archives/restores; archived rooms keep history
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
/** Names are unique per campus regardless of case (SKAI-147). */
async function assertNameFree(tx: TxClient, schoolId: string, campusId: string, roomNumber: string, exceptId?: string) {
  const dup = await tx.classRoom.findFirst({
    where: { schoolId, campusId, roomNumber: { equals: roomNumber, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { roomNumber: true, archivedAt: true },
  });
  if (dup) throw new ApiError(dup.archivedAt ? `Room "${dup.roomNumber}" already exists in the archive. Restore it instead.` : `Room "${dup.roomNumber}" already exists`, 409);
}

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
    const includeArchived = searchParams.get("includeArchived") === "1";

    const rooms = await prisma.classRoom.findMany({
      where: { campusId, ...(includeArchived ? {} : { archivedAt: null }) },
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
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "add");

    const body = await parseBody(req, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    if (body.rooms !== undefined) {
      // Bulk add: every line validated first, then all rows created in one
      // transaction, so a retry or a bad line never leaves half a list behind.
      const { rows, errors } = parseBulkRooms(String(body.rooms));
      if (errors.length) return Response.json({ success: false, error: "Some lines need fixing", errors }, { status: 400 });
      if (!rows.length) throw new ApiError("Add at least one room", 400);
      if (rows.length > BULK_ROOM_LIMIT) throw new ApiError(`Add up to ${BULK_ROOM_LIMIT} rooms at a time`, 400);
      return await withSchedulingResourceWrite(user, campusId, "timetable", "add", async tx => {
        const existing = await tx.classRoom.findMany({ where: { schoolId: user.schoolId, campusId }, select: { roomNumber: true } });
        const taken = new Set(existing.map(r => r.roomNumber.toLocaleLowerCase("en")));
        const clashes = rows.filter(r => taken.has(r.roomNumber.toLocaleLowerCase("en")));
        if (clashes.length) return Response.json({ success: false, error: "Some rooms already exist", errors: clashes.map(r => ({ line: r.line, code: "ALREADY_EXISTS", value: r.roomNumber })) }, { status: 409 });
        await tx.classRoom.createMany({ data: rows.map(r => ({ schoolId: user.schoolId, campusId, roomNumber: r.roomNumber, capacity: r.capacity, roomType: r.roomType, building: r.building, floor: r.floor, isExamHall: r.roomType === "HALL" })) });
        return Response.json({ success: true, data: { created: rows.length } });
      });
    }

    const roomNumber = cleanRoomName(body.roomNumber);
    if (!roomNumber) throw new ApiError("roomNumber is required", 400);

    return await withSchedulingResourceWrite(user, campusId, "timetable", "add", async tx => {
      await assertNameFree(tx, user.schoolId, campusId, roomNumber);

      const roomType = String(body.roomType ?? "CLASSROOM");
      if (!ROOM_TYPES.has(roomType)) throw new ApiError("Unknown room type", 400);

      const room = await tx.classRoom.create({
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
    });
  } catch (error) {
    return errorResponse(error, "[academic/rooms] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "timetable", "edit");

    const body = await parseBody(req, jsonObjectBody);
    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);

    const target = await prisma.classRoom.findFirst({ where: { id, ...resourceScope(user) }, select: { campusId: true } });
    if (!target) throw new ApiError("Resource not found in your campus", 404);
    return await withSchedulingResourceWrite(user, target.campusId, "timetable", "edit", async tx => {
      const room = await tx.classRoom.findFirst({
        where: { id, ...resourceScope(user), campusId: target.campusId },
      });
      if (!room) throw new ApiError("Room not found", 404);

      if (typeof body.archived === "boolean") {
        // Archive keeps every timetable and exam booking intact; the room only
        // stops being offered for new ones. Restoring re-checks the name.
        if (!body.archived) await assertNameFree(tx, user.schoolId, room.campusId, room.roomNumber, id);
        const updated = await tx.classRoom.update({ where: { id }, data: { archivedAt: body.archived ? room.archivedAt ?? new Date() : null } });
        return Response.json({ success: true, data: decorate(updated) });
      }
      if (room.archivedAt) throw new ApiError("Restore this room before editing it", 409);

      const roomNumber = body.roomNumber !== undefined ? cleanRoomName(body.roomNumber) : room.roomNumber;
      if (!roomNumber) throw new ApiError("roomNumber cannot be empty", 400);
      if (roomNumber !== room.roomNumber) await assertNameFree(tx, user.schoolId, room.campusId, roomNumber, id);

      const roomType = body.roomType !== undefined ? String(body.roomType) : room.roomType;
      if (!ROOM_TYPES.has(roomType)) throw new ApiError("Unknown room type", 400);

      const layout = layoutFrom(body, room);
      if ((["rows", "benchesPerRow", "seatsPerBench", "examSeatsPerBench", "capacity"] as const).some(key => layout[key] !== room[key]) && await tx.examSeat.count({ where: { schoolId: user.schoolId, examRoom: { roomId: id, campusId: room.campusId } } })) throw new ApiError("This room has assigned exam seats. Move its papers to another room before changing its seating layout or capacity.", 409);
      const updated = await tx.classRoom.update({
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
          ...layout,
        },
      });

      return Response.json({ success: true, data: decorate(updated) });
    });
  } catch (error) {
    return errorResponse(error, "[academic/rooms] PATCH failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "academic/rooms");
}
