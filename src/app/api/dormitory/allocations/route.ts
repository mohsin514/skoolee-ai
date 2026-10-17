import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { allocate, cancelReservation, campusToday, dayText, endStay, moveStay, overlaps, parseDay } from "@/lib/dormitory/allocations";
import { ApiError, assertModuleRead, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// SKO-463 dated dormitory allocations.
// GET  ?campusId=&date=YYYY-MM-DD[&studentId=|&roomId=]  → occupancy per room on that date, current and
//      upcoming stays (full history when a student or room is named). Residents carry only name, roll
//      number and class: no academic, health or safeguarding data.
// GET  ?lookup=students&q=  → active students in the campus for the allocate picker (max 20).
// POST {action: "allocate"|"move"|"end"|"cancel", ...} → see src/lib/dormitory/allocations.ts.

const studentSelect = { id: true, fullName: true, rollNo: true, class: { select: { name: true } } } as const;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "dormitory");
    const params = request.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));

    if (params.get("lookup") === "students") {
      const q = (params.get("q") ?? "").trim().slice(0, 80);
      const students = await prisma.student.findMany({
        where: { campusId, schoolId: user.schoolId, archivedAt: null, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { rollNo: { contains: q, mode: "insensitive" } }] } : {}) },
        select: { ...studentSelect, dormRoom: { select: { number: true } } }, orderBy: { fullName: "asc" }, take: 20,
      });
      return Response.json({ success: true, data: students });
    }

    const today = await campusToday(user.schoolId, campusId);
    const date = params.get("date") ? parseDay(params.get("date"), "Date") : today;
    const nextDay = new Date(date.getTime() + 86_400_000);
    const studentId = params.get("studentId"), roomId = params.get("roomId");
    const [rooms, stays] = await Promise.all([
      prisma.dormRoom.findMany({ where: { campusId, schoolId: user.schoolId }, include: { roomType: { select: { name: true } } }, orderBy: { number: "asc" } }),
      prisma.dormAllocation.findMany({
        where: { campusId, schoolId: user.schoolId, ...(studentId ? { studentId } : {}), ...(roomId ? { roomId } : {}), ...(studentId || roomId ? {} : { status: "ACTIVE", OR: [{ endDate: null }, { endDate: { gt: date } }] }) },
        include: { student: { select: studentSelect }, room: { select: { number: true } }, next: { select: { id: true } } },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const roomRows = rooms.map(room => {
      const own = stays.filter(stay => stay.roomId === room.id && stay.status === "ACTIVE");
      const occupied = own.filter(stay => overlaps(stay, date, nextDay)).length;
      const upcoming = own.filter(stay => stay.startDate >= nextDay).length;
      return { id: room.id, number: room.number, roomType: room.roomType.name, capacity: room.capacity, status: room.status, statusReason: room.statusReason, occupied, upcoming, available: room.status === "AVAILABLE" ? Math.max(0, room.capacity - occupied) : 0 };
    });
    return Response.json({
      success: true,
      data: {
        date: dayText(date), today: dayText(today), rooms: roomRows,
        stays: stays.map(stay => ({
          id: stay.id, roomId: stay.roomId, roomNumber: stay.room.number, student: { id: stay.student.id, fullName: stay.student.fullName, rollNo: stay.student.rollNo, className: stay.student.class?.name ?? null },
          startDate: dayText(stay.startDate), endDate: dayText(stay.endDate), status: stay.status, reason: stay.reason, endReason: stay.endReason, previousId: stay.previousId, movedOn: Boolean(stay.next),
          state: stay.status === "CANCELLED" ? "CANCELLED" : stay.startDate > date ? "UPCOMING" : stay.endDate && stay.endDate <= date ? "ENDED" : "CURRENT",
        })),
      },
    });
  } catch (error) {
    return errorResponse(error, "[dormitory] GET allocations failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Only campus leaders and boarding administrators can change room allocations.", 403);
    const body = await request.json();
    const action = String(body.action ?? "");
    await assertPermission(user, "dormitory", action === "allocate" ? "add" : "edit");
    const campusId = await resolveCampusId(user, body.campusId);
    const result = action === "allocate" ? await allocate(user, campusId, body)
      : action === "move" ? await moveStay(user, campusId, body)
      : action === "end" ? await endStay(user, campusId, body)
      : action === "cancel" ? await cancelReservation(user, campusId, body)
      : null;
    if (!result) throw new ApiError("Unknown action", 400);
    const { requestHash: _hash, idempotencyKey: _key, ...allocation } = result.allocation as typeof result.allocation & { requestHash?: string | null; idempotencyKey?: string | null };
    return Response.json({ success: true, data: allocation, replayed: result.replayed }, { status: result.replayed || action !== "allocate" ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, "[dormitory] POST allocations failed");
  }
}
