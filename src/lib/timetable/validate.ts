import { prisma } from "@/lib/db/prisma";

/**
 * Server-side conflict engine for a class timetable.
 *
 * Two gaps this closes:
 *
 *  - Publishing did no checking at all. `action: "publish"` flipped the status
 *    and notified every family, so a board with a teacher standing in two rooms
 *    at 09:20 went out as the official timetable.
 *  - Room capacity was stored and displayed but never compared against the
 *    class roll, so a 35-student class could be seated in a 25-seat room.
 *
 * The save path already checked teacher and room clashes inline; that logic now
 * lives here so save and publish can never drift apart.
 *
 * Severity follows the product rule: CRITICAL blocks the operation, WARNING is
 * surfaced but does not block.
 */

export type ConflictSeverity = "CRITICAL" | "WARNING";

export type ConflictType =
  | "TEACHER_DOUBLE_BOOKED"
  | "ROOM_DOUBLE_BOOKED"
  | "ROOM_CAPACITY"
  | "MISSING_TEACHER"
  | "MISSING_ROOM";

export interface TimetableConflict {
  type: ConflictType;
  severity: ConflictSeverity;
  /** One sentence an administrator can act on without opening another screen. */
  message: string;
  dayOfWeek: number;
  periodNumber: number;
  slotId?: string;
  teacherName?: string;
  roomNumber?: string;
  otherClass?: string;
}

export interface TimetableValidation {
  conflicts: TimetableConflict[];
  counts: {
    teacher: number;
    room: number;
    capacity: number;
    missing: number;
    critical: number;
    warning: number;
  };
  /** False when at least one CRITICAL conflict remains. */
  canPublish: boolean;
}

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function classLabel(cls: { name: string; section: string | null } | null | undefined) {
  if (!cls) return "another class";
  return `${cls.name}${cls.section ? ` - ${cls.section}` : ""}`;
}

function summarise(conflicts: TimetableConflict[]): TimetableValidation {
  const counts = {
    teacher: conflicts.filter((c) => c.type === "TEACHER_DOUBLE_BOOKED").length,
    room: conflicts.filter((c) => c.type === "ROOM_DOUBLE_BOOKED").length,
    capacity: conflicts.filter((c) => c.type === "ROOM_CAPACITY").length,
    missing: conflicts.filter((c) => c.type === "MISSING_TEACHER" || c.type === "MISSING_ROOM").length,
    critical: conflicts.filter((c) => c.severity === "CRITICAL").length,
    warning: conflicts.filter((c) => c.severity === "WARNING").length,
  };
  return { conflicts, counts, canPublish: counts.critical === 0 };
}

/** The slot shape both the save payload and stored rows can satisfy. */
export interface ValidatableSlot {
  id?: string;
  dayOfWeek: number;
  periodNumber: number;
  subjectId?: string | null;
  teacherId?: string | null;
  roomId?: string | null;
  slotType?: string | null;
}

/**
 * Check a set of slots against everything else booked on the campus.
 *
 * `timetableId` is excluded from the clash search so a timetable never collides
 * with its own stored rows, and `classSize` drives the capacity rule.
 */
export async function validateTimetableSlots(opts: {
  campusId: string;
  timetableId: string;
  classId: string;
  slots: ValidatableSlot[];
  /** Treat unassigned teacher/room as a warning. Off during drafting. */
  requireComplete?: boolean;
}): Promise<TimetableValidation> {
  const { campusId, timetableId, classId, slots, requireComplete = false } = opts;

  const teaching = slots.filter((s) => (s.slotType ?? "CLASS") === "CLASS" && s.subjectId);
  if (teaching.length === 0) return summarise([]);

  const classSize = await prisma.student.count({ where: { classId, campusId } });

  const teacherIds = [...new Set(teaching.map((s) => s.teacherId).filter(Boolean))] as string[];
  const roomIds = [...new Set(teaching.map((s) => s.roomId).filter(Boolean))] as string[];

  // Everything else on the campus that could collide, fetched once rather than
  // per slot — the old inline version issued two queries per slot, which on a
  // 48-slot week meant ~96 round-trips per save.
  const [otherSlots, rooms] = await Promise.all([
    teacherIds.length || roomIds.length
      ? prisma.timetableSlot.findMany({
          where: {
            timetable: { campusId, id: { not: timetableId } },
            slotType: "CLASS",
            OR: [
              ...(teacherIds.length ? [{ teacherId: { in: teacherIds } }] : []),
              ...(roomIds.length ? [{ roomId: { in: roomIds } }] : []),
            ],
          },
          select: {
            dayOfWeek: true,
            periodNumber: true,
            teacherId: true,
            roomId: true,
            teacher: { select: { fullName: true } },
            room: { select: { roomNumber: true } },
            timetable: { select: { class: { select: { name: true, section: true } } } },
          },
        })
      : Promise.resolve([]),
    roomIds.length
      ? prisma.classRoom.findMany({
          where: { id: { in: roomIds }, campusId },
          select: { id: true, roomNumber: true, capacity: true },
        })
      : Promise.resolve([]),
  ]);

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const conflicts: TimetableConflict[] = [];

  for (const slot of teaching) {
    const when = `${DAYS[slot.dayOfWeek] ?? "Day " + slot.dayOfWeek}, period ${slot.periodNumber}`;

    if (slot.teacherId) {
      const clash = otherSlots.find(
        (o) =>
          o.teacherId === slot.teacherId &&
          o.dayOfWeek === slot.dayOfWeek &&
          o.periodNumber === slot.periodNumber,
      );
      if (clash) {
        conflicts.push({
          type: "TEACHER_DOUBLE_BOOKED",
          severity: "CRITICAL",
          message: `${clash.teacher?.fullName ?? "This teacher"} is already teaching ${classLabel(clash.timetable.class)} on ${when}.`,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          slotId: slot.id,
          teacherName: clash.teacher?.fullName ?? undefined,
          otherClass: classLabel(clash.timetable.class),
        });
      }
    } else if (requireComplete) {
      conflicts.push({
        type: "MISSING_TEACHER",
        severity: "WARNING",
        message: `No teacher assigned for ${when}.`,
        dayOfWeek: slot.dayOfWeek,
        periodNumber: slot.periodNumber,
        slotId: slot.id,
      });
    }

    if (slot.roomId) {
      const clash = otherSlots.find(
        (o) =>
          o.roomId === slot.roomId &&
          o.dayOfWeek === slot.dayOfWeek &&
          o.periodNumber === slot.periodNumber,
      );
      if (clash) {
        conflicts.push({
          type: "ROOM_DOUBLE_BOOKED",
          severity: "CRITICAL",
          message: `Room ${clash.room?.roomNumber ?? ""} is already booked for ${classLabel(clash.timetable.class)} on ${when}.`,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          slotId: slot.id,
          roomNumber: clash.room?.roomNumber ?? undefined,
          otherClass: classLabel(clash.timetable.class),
        });
      }

      // capacity 0 means the school has not recorded it — not a violation.
      const room = roomById.get(slot.roomId);
      if (room && room.capacity > 0 && classSize > room.capacity) {
        conflicts.push({
          type: "ROOM_CAPACITY",
          severity: "WARNING",
          message: `Room ${room.roomNumber} seats ${room.capacity} but this class has ${classSize} students (${classSize - room.capacity} over) on ${when}.`,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          slotId: slot.id,
          roomNumber: room.roomNumber,
        });
      }
    } else if (requireComplete) {
      conflicts.push({
        type: "MISSING_ROOM",
        severity: "WARNING",
        message: `No room assigned for ${when}.`,
        dayOfWeek: slot.dayOfWeek,
        periodNumber: slot.periodNumber,
        slotId: slot.id,
      });
    }
  }

  return summarise(conflicts);
}

/** Validate a timetable exactly as it currently stands in the database. */
export async function validateStoredTimetable(
  timetableId: string,
  campusId: string,
): Promise<TimetableValidation> {
  const timetable = await prisma.timetable.findFirst({
    where: { id: timetableId, campusId },
    select: {
      classId: true,
      slots: {
        select: {
          id: true,
          dayOfWeek: true,
          periodNumber: true,
          subjectId: true,
          teacherId: true,
          roomId: true,
          slotType: true,
        },
      },
    },
  });
  if (!timetable) return summarise([]);

  return validateTimetableSlots({
    campusId,
    timetableId,
    classId: timetable.classId,
    slots: timetable.slots,
    requireComplete: true,
  });
}
