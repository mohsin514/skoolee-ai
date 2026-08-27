import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { roomCapacity, roomLocation, seatGrid } from "@/lib/academic/room-capacity";

/**
 * Multi-room exam allocation (§58, corrected in §79).
 *
 * A paper for a class of 90 cannot sit in one 40-seat room. Before this, the
 * date sheet held a single `roomId` and simply refused any room smaller than
 * the class, which left the only real answer — use two rooms — unavailable.
 *
 * §79 fixed the number being compared. Allocation used to read the room's
 * TEACHING capacity, so a 30-seat room laid out three-to-a-bench was handed
 * thirty candidates who would have had to sit shoulder to shoulder. Capacity
 * now comes from `roomCapacity()`, which applies the room's exam spacing.
 *
 * The rules, in the order they are enforced:
 *
 *  1. Every room must belong to the campus, and no room may be listed twice.
 *  2. Combined EXAM capacity must cover the whole class. A room with no
 *     recorded size contributes nothing and is rejected outright, because an
 *     unmeasured room cannot be part of a seating plan.
 *  3. No room may be double-booked against another paper in the same slot,
 *     nor against a published lesson in that hour.
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
  /** Exam-day capacity of the chosen rooms — never the teaching figure. */
  totalCapacity: number;
  /** Teaching capacity, shown alongside so the spacing loss is visible. */
  totalTeachingCapacity: number;
  unseated: number;
  rooms: {
    examRoomId: string;
    roomId: string;
    roomNumber: string;
    location: string;
    /** Exam-day seats in this room. */
    capacity: number;
    teachingCapacity: number;
    rows: number;
    benchesPerRow: number;
    seatsPerBench: number;
    examSeatsPerBench: number;
    isPrimary: boolean;
    seated: number;
    students: {
      studentId: string;
      fullName: string;
      rollNumber: string;
      seatNumber: number;
      rowNo: number;
      benchNo: number;
      seatOnBench: number;
      seatLabel: string;
    }[];
  }[];
}

const ROOM_SELECT = {
  id: true,
  roomNumber: true,
  capacity: true,
  building: true,
  floor: true,
  wing: true,
  roomType: true,
  rows: true,
  benchesPerRow: true,
  seatsPerBench: true,
  examSeatsPerBench: true,
  isExamHall: true,
} as const;

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

/** Which rooms are free for a given date + period, with their exam capacity. */
export async function findAvailableRooms(opts: {
  campusId: string;
  date: string;
  periodDefinitionId: string | null;
  excludeScheduleId?: string;
}) {
  const { campusId, date, periodDefinitionId, excludeScheduleId } = opts;

  const rooms = await prisma.classRoom.findMany({
    where: { campusId },
    select: ROOM_SELECT,
    orderBy: [{ roomNumber: "asc" }],
  });

  const taken = new Set<string>();
  if (periodDefinitionId) {
    const booked = await prisma.examRoom.findMany({
      where: {
        campusId,
        examScheduleId: excludeScheduleId ? { not: excludeScheduleId } : undefined,
        examSchedule: { date: new Date(`${date}T00:00:00.000Z`), periodDefinitionId },
      },
      select: { roomId: true },
    });
    booked.forEach((b) => taken.add(b.roomId));
  }

  const period = periodDefinitionId
    ? await prisma.periodDefinition.findFirst({
        where: { id: periodDefinitionId, campusId },
        select: { startTime: true, endTime: true },
      })
    : null;

  const lessonBusy = new Set<string>();
  if (period) {
    const [y, m, d] = date.split("-").map(Number);
    const jsDay = new Date(y, m - 1, d).getDay();
    const slots = await prisma.timetableSlot.findMany({
      where: {
        roomId: { in: rooms.map((r) => r.id) },
        dayOfWeek: jsDay === 0 ? 7 : jsDay,
        slotType: "CLASS",
        timetable: { campusId, status: "PUBLISHED" },
      },
      select: { roomId: true, startTime: true, endTime: true },
    });
    slots
      .filter((s) => s.startTime < period.endTime && period.startTime < s.endTime)
      .forEach((s) => s.roomId && lessonBusy.add(s.roomId));
  }

  return rooms.map((r) => {
    const cap = roomCapacity(r);
    return {
      ...r,
      location: roomLocation(r),
      examCapacity: cap.exam,
      teachingCapacity: cap.teaching,
      benches: cap.benches,
      hasLayout: cap.hasLayout,
      unmeasured: cap.unmeasured,
      busy: taken.has(r.id) || lessonBusy.has(r.id),
      busyReason: taken.has(r.id)
        ? "Hosting another paper in this slot"
        : lessonBusy.has(r.id)
        ? "A published lesson uses it at this hour"
        : null,
    };
  });
}

/**
 * Pick rooms for a paper without the admin choosing them.
 *
 * Preference order is the one a head of exams uses: purpose-built halls first
 * (fewer rooms means fewer invigilators), then largest first, so a class fits
 * into as few rooms as it can. Rooms already busy in that slot, and rooms with
 * no recorded size, are never offered.
 */
export async function suggestRooms(opts: {
  campusId: string;
  date: string;
  periodDefinitionId: string | null;
  headcount: number;
  excludeScheduleId?: string;
}): Promise<{ roomIds: string[]; capacity: number; short: number }> {
  const available = (await findAvailableRooms(opts)).filter(
    (r) => !r.busy && !r.unmeasured && r.examCapacity > 0,
  );

  available.sort((a, b) => {
    if (a.isExamHall !== b.isExamHall) return a.isExamHall ? -1 : 1;
    if (b.examCapacity !== a.examCapacity) return b.examCapacity - a.examCapacity;
    return a.roomNumber.localeCompare(b.roomNumber);
  });

  const chosen: typeof available = [];
  let capacity = 0;
  for (const room of available) {
    if (capacity >= opts.headcount) break;
    chosen.push(room);
    capacity += room.examCapacity;
  }

  return {
    roomIds: chosen.map((r) => r.id),
    capacity,
    short: Math.max(0, opts.headcount - capacity),
  };
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
    select: ROOM_SELECT,
  });
  if (rooms.length !== roomIds.length) {
    throw new ApiError("One or more rooms do not belong to this campus", 400);
  }

  const unsized = rooms.filter((r) => roomCapacity(r).unmeasured);
  if (unsized.length) {
    throw new ApiError(
      `Room ${unsized.map((r) => r.roomNumber).join(", ")} has no recorded capacity — set its size or bench layout before using it in a seating plan`,
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
  const capacities = ordered.map((r) => roomCapacity(r));
  const totalCapacity = capacities.reduce((sum, c) => sum + c.exam, 0);

  if (students.length > totalCapacity) {
    const detail = ordered
      .map((r, i) => `${r.roomNumber} holds ${capacities[i].exam} at exam spacing`)
      .join(", ");
    throw new ApiError(
      `Capacity conflict: ${students.length} students are sitting ${schedule.subject.name} but the chosen rooms hold ${totalCapacity} (${students.length - totalCapacity} short). ${detail}. Add another room.`,
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

      const grid = seatGrid(room);
      const take = students.slice(cursor, cursor + capacities[index].exam);
      if (take.length) {
        await tx.examSeat.createMany({
          data: take.map((s, i) => ({
            campusId,
            examScheduleId: scheduleId,
            examRoomId: examRoom.id,
            studentId: s.id,
            seatNumber: grid[i]?.seatNumber ?? i + 1,
            rowNo: grid[i]?.rowNo ?? 0,
            benchNo: grid[i]?.benchNo ?? 0,
            seatOnBench: grid[i]?.seatOnBench ?? 0,
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
      room: { select: ROOM_SELECT },
      seats: {
        orderBy: { seatNumber: "asc" },
        select: {
          seatNumber: true,
          rowNo: true,
          benchNo: true,
          seatOnBench: true,
          student: { select: { id: true, fullName: true, rollNo: true } },
        },
      },
    },
  });

  const mapped = rooms.map((r) => {
    const cap = roomCapacity(r.room);
    return {
      examRoomId: r.id,
      roomId: r.room.id,
      roomNumber: r.room.roomNumber,
      location: roomLocation(r.room),
      capacity: cap.exam,
      teachingCapacity: cap.teaching,
      rows: r.room.rows,
      benchesPerRow: r.room.benchesPerRow,
      seatsPerBench: r.room.seatsPerBench,
      examSeatsPerBench: r.room.examSeatsPerBench,
      isPrimary: r.isPrimary,
      seated: r.seats.length,
      students: r.seats.map((s) => ({
        studentId: s.student.id,
        fullName: s.student.fullName,
        rollNumber: s.student.rollNo,
        seatNumber: s.seatNumber,
        rowNo: s.rowNo,
        benchNo: s.benchNo,
        seatOnBench: s.seatOnBench,
        seatLabel:
          s.rowNo > 0
            ? `R${s.rowNo}-B${s.benchNo}${s.seatOnBench > 1 ? `-S${s.seatOnBench}` : ""}`
            : `S${s.seatNumber}`,
      })),
    };
  });

  return {
    scheduleId,
    totalStudents: mapped.reduce((n, r) => n + r.seated, 0),
    totalCapacity: mapped.reduce((n, r) => n + r.capacity, 0),
    totalTeachingCapacity: mapped.reduce((n, r) => n + r.teachingCapacity, 0),
    unseated: 0,
    rooms: mapped,
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
