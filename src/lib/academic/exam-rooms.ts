import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";

/**
 * Multi-room exam allocation (§58).
 *
 * A paper for a class of 90 cannot sit in one 40-seat room. Before this, the
 * date sheet held a single `roomId` and simply refused any room smaller than
 * the class, which left the only real answer — use two rooms — unavailable.
 *
 * The rules, in the order they are enforced:
 *
 *  1. Every room must belong to the campus, and no room may be listed twice.
 *  2. Combined capacity must cover the whole class. A room with capacity 0
 *     ("not recorded") contributes nothing and is rejected outright here,
 *     because an unknown-size room cannot be part of a seating plan.
 *  3. No room may be double-booked against another paper in the same slot.
 *  4. Each student gets exactly one seat. That last rule is a unique index on
 *     (examScheduleId, studentId) as well as allocation logic — code can be
 *     rewritten, a constraint cannot be forgotten.
 *
 * Allocation fills rooms in the order given, in roll-number order, which is
 * what an invigilator expects: contiguous roll numbers per room rather than a
 * scatter, so the seating list can be read off a door.
 */

export interface SeatingPlan {
  scheduleId: string;
  totalStudents: number;
  totalCapacity: number;
  rooms: {
    examRoomId: string;
    roomId: string;
    roomNumber: string;
    capacity: number;
    isPrimary: boolean;
    seated: number;
    students: { studentId: string; fullName: string; rollNumber: string; seatNumber: number }[];
  }[];
}

/**
 * Rooms occupied by a *lesson* at the exam's time (§72).
 *
 * The exam chain and the weekly timetable chain each validated themselves and
 * neither looked at the other, so a paper could be seated in a room that a
 * different class was timetabled into at that hour. A room can only hold one
 * of the two, so this is a genuine clash rather than a warning.
 *
 * Only PUBLISHED timetables count: a draft board is not yet a commitment, and
 * blocking exam scheduling on someone's half-built draft would be wrong.
 */
export async function findTimetableRoomClashes(opts: {
  campusId: string;
  roomIds: string[];
  /** The exam date, as YYYY-MM-DD. */
  date: string;
  startTime: string | null;
  endTime: string | null;
}): Promise<string[]> {
  const { campusId, roomIds, date, startTime, endTime } = opts;
  if (!roomIds.length || !startTime || !endTime) return [];

  const [y, m, d] = date.split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;

  const slots = await prisma.timetableSlot.findMany({
    where: {
      roomId: { in: roomIds },
      dayOfWeek,
      slotType: "CLASS",
      timetable: { campusId, status: "PUBLISHED" },
    },
    select: {
      startTime: true,
      endTime: true,
      room: { select: { roomNumber: true } },
      timetable: { select: { class: { select: { name: true, section: true } } } },
    },
  });

  // "HH:mm" strings compare correctly as strings, which is why the columns are
  // stored that way — no parsing, no timezone to get wrong.
  const overlaps = slots.filter((s) => s.startTime < endTime && startTime < s.endTime);

  return overlaps.map((s) => {
    const cls = s.timetable.class;
    const label = `${cls.name}${cls.section ? ` - ${cls.section}` : ""}`;
    return `Room ${s.room?.roomNumber} is timetabled to ${label} from ${s.startTime} to ${s.endTime} that day. Move the paper, pick another room, or unpublish that timetable.`;
  });
}

/** Rooms already taken by another paper in the same date + period. */
async function findRoomClashes(opts: {
  campusId: string;
  roomIds: string[];
  date: Date;
  periodDefinitionId: string | null;
  excludeScheduleId: string;
}) {
  const { campusId, roomIds, date, periodDefinitionId, excludeScheduleId } = opts;
  if (!periodDefinitionId) return [];

  const clashing = await prisma.examRoom.findMany({
    where: {
      campusId,
      roomId: { in: roomIds },
      examScheduleId: { not: excludeScheduleId },
      examSchedule: { date, periodDefinitionId },
    },
    select: {
      room: { select: { roomNumber: true } },
      examSchedule: {
        select: { exam: { select: { title: true } }, subject: { select: { name: true } } },
      },
    },
  });

  return clashing.map(
    (c) =>
      `Room ${c.room.roomNumber} is already hosting ${c.examSchedule.exam.title} (${c.examSchedule.subject.name}) in that time slot`,
  );
}

/**
 * Replace the room set for one paper and re-seat every student.
 *
 * Idempotent: calling it twice with the same rooms produces the same plan.
 * Seats are rebuilt rather than patched, because a partial re-seat is how a
 * student ends up either in two rooms or in none.
 */
export async function allocateExamRooms(opts: {
  campusId: string;
  scheduleId: string;
  roomIds: string[];
}): Promise<SeatingPlan> {
  const { campusId, scheduleId } = opts;
  const roomIds = [...new Set(opts.roomIds)];

  if (roomIds.length !== opts.roomIds.length) {
    throw new ApiError("The same room is listed more than once", 400);
  }
  if (roomIds.length === 0) {
    throw new ApiError("At least one room is required", 400);
  }

  const schedule = await prisma.examSchedule.findFirst({
    where: { id: scheduleId, campusId },
    select: {
      id: true,
      date: true,
      periodDefinitionId: true,
      periodDefinition: { select: { startTime: true, endTime: true } },
      subject: { select: { name: true } },
      exam: { select: { classId: true, title: true } },
    },
  });
  if (!schedule) throw new ApiError("Schedule not found", 404);

  const rooms = await prisma.classRoom.findMany({
    where: { id: { in: roomIds }, campusId },
    select: { id: true, roomNumber: true, capacity: true },
  });
  if (rooms.length !== roomIds.length) {
    throw new ApiError("One or more rooms do not belong to this campus", 400);
  }

  const unsized = rooms.filter((r) => r.capacity <= 0);
  if (unsized.length) {
    throw new ApiError(
      `Room ${unsized.map((r) => r.roomNumber).join(", ")} has no recorded capacity — set it before using it in a seating plan`,
      400,
    );
  }

  const students = await prisma.student.findMany({
    where: { classId: schedule.exam.classId, campusId, status: "active" },
    select: { id: true, fullName: true, rollNo: true },
    orderBy: [{ rollNo: "asc" }, { fullName: "asc" }],
  });

  // Preserve the caller's room order — it is the invigilation order.
  const ordered = roomIds.map((id) => rooms.find((r) => r.id === id)!);
  const totalCapacity = ordered.reduce((sum, r) => sum + r.capacity, 0);

  if (students.length > totalCapacity) {
    throw new ApiError(
      `Capacity conflict: ${students.length} students are sitting ${schedule.subject.name} but the chosen rooms hold ${totalCapacity} (${students.length - totalCapacity} short). Add another room.`,
      409,
    );
  }

  const clashes = await findRoomClashes({
    campusId,
    roomIds,
    date: schedule.date,
    periodDefinitionId: schedule.periodDefinitionId,
    excludeScheduleId: scheduleId,
  });
  if (clashes.length) throw new ApiError(clashes[0], 409);

  const lessonClashes = await findTimetableRoomClashes({
    campusId,
    roomIds,
    date: schedule.date.toISOString().slice(0, 10),
    startTime: schedule.periodDefinition?.startTime ?? null,
    endTime: schedule.periodDefinition?.endTime ?? null,
  });
  if (lessonClashes.length) throw new ApiError(lessonClashes[0], 409);

  await prisma.$transaction(async (tx) => {
    // Seats first — they point at the rooms.
    await tx.examSeat.deleteMany({ where: { examScheduleId: scheduleId } });
    await tx.examRoom.deleteMany({ where: { examScheduleId: scheduleId } });

    let cursor = 0;
    for (const [index, room] of ordered.entries()) {
      const examRoom = await tx.examRoom.create({
        data: { campusId, examScheduleId: scheduleId, roomId: room.id, isPrimary: index === 0 },
        select: { id: true },
      });

      const take = students.slice(cursor, cursor + room.capacity);
      if (take.length) {
        await tx.examSeat.createMany({
          data: take.map((s, i) => ({
            campusId,
            examScheduleId: scheduleId,
            examRoomId: examRoom.id,
            studentId: s.id,
            seatNumber: i + 1,
          })),
        });
      }
      cursor += take.length;
    }

    // Keep the legacy single-room field pointing at the primary room so the
    // date sheet, report cards and admin table keep rendering without knowing
    // anything about multi-room.
    await tx.examSchedule.update({
      where: { id: scheduleId },
      data: { roomId: ordered[0].id },
    });
  });

  return getSeatingPlan(campusId, scheduleId);
}

export async function getSeatingPlan(campusId: string, scheduleId: string): Promise<SeatingPlan> {
  const rooms = await prisma.examRoom.findMany({
    where: { examScheduleId: scheduleId, campusId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      isPrimary: true,
      room: { select: { id: true, roomNumber: true, capacity: true } },
      seats: {
        orderBy: { seatNumber: "asc" },
        select: {
          seatNumber: true,
          student: { select: { id: true, fullName: true, rollNo: true } },
        },
      },
    },
  });

  return {
    scheduleId,
    totalStudents: rooms.reduce((n, r) => n + r.seats.length, 0),
    totalCapacity: rooms.reduce((n, r) => n + r.room.capacity, 0),
    rooms: rooms.map((r) => ({
      examRoomId: r.id,
      roomId: r.room.id,
      roomNumber: r.room.roomNumber,
      capacity: r.room.capacity,
      isPrimary: r.isPrimary,
      seated: r.seats.length,
      students: r.seats.map((s) => ({
        studentId: s.student.id,
        fullName: s.student.fullName,
        rollNumber: s.student.rollNo,
        seatNumber: s.seatNumber,
      })),
    })),
  };
}

/**
 * Keep the single-room path and the room set consistent.
 *
 * The date sheet still writes one `roomId`. Mirroring it into ExamRoom here
 * means every reader can ask the same question ("which rooms host this
 * paper?") whether the paper was scheduled the simple way or split.
 */
export async function syncPrimaryExamRoom(opts: {
  campusId: string;
  scheduleId: string;
  roomId: string | null;
}) {
  const { campusId, scheduleId, roomId } = opts;

  const existing = await prisma.examRoom.findMany({
    where: { examScheduleId: scheduleId },
    select: { id: true, roomId: true, isPrimary: true },
  });

  // A genuine multi-room plan is left alone — the date sheet's single roomId
  // is a mirror of its primary room, not an instruction to collapse the plan.
  if (existing.length > 1) return;

  if (!roomId) {
    if (existing.length) {
      await prisma.examSeat.deleteMany({ where: { examScheduleId: scheduleId } });
      await prisma.examRoom.deleteMany({ where: { examScheduleId: scheduleId } });
    }
    return;
  }

  if (existing.length === 1 && existing[0].roomId === roomId) return;

  await prisma.$transaction(async (tx) => {
    await tx.examSeat.deleteMany({ where: { examScheduleId: scheduleId } });
    await tx.examRoom.deleteMany({ where: { examScheduleId: scheduleId } });
    await tx.examRoom.create({
      data: { campusId, examScheduleId: scheduleId, roomId, isPrimary: true },
    });
  });
}
