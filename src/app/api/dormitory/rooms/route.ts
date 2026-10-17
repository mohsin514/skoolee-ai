import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { campusToday, overlaps, roomChangeImpact } from "@/lib/dormitory/allocations";
import {
  ApiError,
  assertModuleRead,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "dormitory");
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));

    // Occupancy is today's dated stays (SKO-463), not the legacy current-room pointer.
    const today = await campusToday(user.schoolId, campusId);
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const rooms = await prisma.dormRoom.findMany({
      where: { campusId },
      include: {
        roomType: { select: { name: true } },
        allocations: { where: { status: "ACTIVE", OR: [{ endDate: null }, { endDate: { gt: today } }] }, select: { startDate: true, endDate: true } },
        _count: { select: { allocations: true } },
      },
      orderBy: { number: "asc" },
    });
    const data = rooms.map(({ allocations, ...room }) => ({ ...room, occupied: allocations.filter(stay => overlaps(stay, today, tomorrow)).length, upcoming: allocations.filter(stay => stay.startDate >= tomorrow).length }));

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
    if (!Number.isInteger(capacity) || capacity <= 0 || capacity > 50) throw new ApiError("Capacity must be a whole number from 1 to 50.", 400);

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

    const capacity = updates.capacity !== undefined ? Number(updates.capacity) : undefined;
    if (capacity !== undefined && (!Number.isInteger(capacity) || capacity <= 0 || capacity > 50)) throw new ApiError("Capacity must be a whole number from 1 to 50.", 400);
    const status = updates.status !== undefined ? String(updates.status) : undefined;
    if (status !== undefined && status !== "AVAILABLE" && status !== "OUT_OF_SERVICE") throw new ApiError("Unknown room status", 400);
    const statusReason = String(updates.statusReason ?? "").trim();
    if (!updates.dryRun && status === "OUT_OF_SERVICE" && (statusReason.length < 3 || statusReason.length > 500)) throw new ApiError("Say why the room is out of service (3–500 characters).", 400);

    // SKO-463: capacity and status changes are checked against current and future stays under the
    // room lock, so they can never strand residents; `dryRun` returns the same impact without saving.
    const result = await schoolAiTransaction(user, async (db) => {
      const [locked] = await db.$queryRaw<{ id: string; capacity: number; status: string }[]>`SELECT id, capacity, status FROM dorm_rooms WHERE id = ${id} AND campus_id = ${campusId} FOR UPDATE`;
      if (!locked) throw new ApiError("Room not found", 404);
      const impact = await roomChangeImpact(db, locked, await campusToday(user.schoolId, campusId, db), { capacity, status });
      if (updates.dryRun) return { impact, room: null };
      if (impact.blocked) throw Object.assign(new ApiError(impact.message, 409), { impact });
      const room = await db.dormRoom.update({ where: { id }, data: { ...data, ...(capacity !== undefined ? { capacity } : {}), ...(status !== undefined ? { status, statusReason: status === "OUT_OF_SERVICE" ? statusReason : null } : {}) } });
      await writeAuditEvent(db, user, { table: "dorm_rooms", recordId: id, action: "UPDATE", campusId, before: { capacity: locked.capacity, status: locked.status }, after: { capacity: room.capacity, status: room.status, ...(status === "OUT_OF_SERVICE" ? { reason: statusReason } : {}) } });
      return { impact, room };
    });
    if (updates.dryRun) return Response.json({ success: true, data: result.impact });
    const room = result.room;

    return Response.json({ success: true, data: room });
  } catch (error) {
    if (error instanceof ApiError && "impact" in error) return Response.json({ error: error.message, impact: (error as ApiError & { impact: unknown }).impact }, { status: error.status });
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

    const history = await prisma.dormAllocation.count({ where: { roomId: id } });
    if (history > 0) {
      throw new ApiError("This room has allocation history, which is kept. Mark it out of service instead.", 409);
    }

    const data = await prisma.dormRoom.delete({ where: { id } });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[dormitory] DELETE rooms failed");
  }
}
