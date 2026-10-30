import { prisma, type TxClient } from "@/lib/db/prisma";
import { getExamBookingSlots } from "@/lib/academic/exam-bookings";
import { SchoolAiError } from "@/lib/school-ai/access";
import { getSubstituteBookings } from "@/lib/school-ai/school-operations-bookings";

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
  | "ROOM_ARCHIVED"
  | "MISSING_TEACHER"
  | "MISSING_ROOM";

export interface TimetableConflict {
  /** Stable server-derived identity; never built from translated display labels. */
  identity?: string;
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
  /** SKO-403: the colliding booking, so the conflict links to every affected slot. */
  otherSlotId?: string;
  otherTimetableId?: string;
  otherTime?: string;
  otherCampus?: string;
  /** This slot's clock times, for a localized description. */
  time?: string;
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
  startTime?: string;
  endTime?: string;
}

// SKO-403: lessons collide when their clock times overlap. Period numbers are labels: the same number at two
// campuses (or two bell schedules) can be different times, and different numbers can overlap. A number is
// used only when a slot has no times recorded.
function overlaps(first: ValidatableSlot, second: ValidatableSlot) {
  if (first.dayOfWeek !== second.dayOfWeek) return false;
  if (!first.startTime || !first.endTime || !second.startTime || !second.endTime) return first.periodNumber === second.periodNumber;
  const valid = (slot: ValidatableSlot) => /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime!) && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.endTime!) && slot.startTime! < slot.endTime!;
  // Bad persisted times cannot prove that a teacher or room is free.
  if (!valid(first) || !valid(second)) return true;
  return first.startTime < second.endTime && second.startTime < first.endTime;
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
  /** Reviewed setup uses the same year and overlapping annual/term schedules. */
  academicYear?: number;
  term?: string;
}, db: TxClient = prisma): Promise<TimetableValidation> {
  const { campusId, timetableId, classId, slots, requireComplete = false } = opts;

  const teaching = slots.filter((s) => (s.slotType ?? "CLASS") === "CLASS" && (s.subjectId || s.teacherId || s.roomId));
  if (teaching.length === 0) return summarise([]);

  const classSize = await db.student.count({ where: { classId, campusId } });
  const cls = await db.class.findFirst({ where: { id: classId, campusId }, select: { schoolId: true } });
  if (!cls) throw new SchoolAiError("Class not found in this campus.", 404);

  const teacherIds = [...new Set(teaching.map((s) => s.teacherId).filter(Boolean))] as string[];
  const roomIds = [...new Set(teaching.map((s) => s.roomId).filter(Boolean))] as string[];

  // Everything else on the campus that could collide, fetched once rather than
  // per slot — the old inline version issued two queries per slot, which on a
  // 48-slot week meant ~96 round-trips per save.
  const [otherSlots, rooms] = await Promise.all([
    teacherIds.length || roomIds.length
      ? db.timetableSlot.findMany({
          where: {
            timetable: {
              // A teacher can work at several campuses of the school; a room belongs to one campus.
              schoolId: cls.schoolId,
              id: { not: timetableId },
              ...(opts.academicYear ? { academicYear: opts.academicYear } : {}),
              // Only known, disjoint terms can narrow the search. Legacy labels
              // have no reliable date range, so they overlap every term.
              ...(opts.term && ["TERM_1", "TERM_2", "TERM_3"].includes(opts.term) ? {
                OR: [
                  { term: { in: ["ANNUAL", opts.term] } },
                  { term: { notIn: ["ANNUAL", "TERM_1", "TERM_2", "TERM_3"] } },
                ],
              } : {}),
            },
            slotType: "CLASS",
            OR: [
              ...(teacherIds.length ? [{ teacherId: { in: teacherIds } }] : []),
              ...(roomIds.length ? [{ roomId: { in: roomIds }, timetable: { campusId } }] : []),
            ],
          },
          select: {
            id: true,
            dayOfWeek: true,
            periodNumber: true,
            startTime: true,
            endTime: true,
            teacherId: true,
            roomId: true,
            teacher: { select: { fullName: true } },
            room: { select: { roomNumber: true } },
            timetable: { select: { id: true, campusId: true, campus: { select: { name: true } }, class: { select: { name: true, section: true } } } },
          },
        })
      : Promise.resolve([]),
    roomIds.length
      ? db.classRoom.findMany({
          where: { id: { in: roomIds }, campusId },
          select: { id: true, roomNumber: true, capacity: true, archivedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const conflicts: TimetableConflict[] = [];
  const substitutes = await getSubstituteBookings(db, { schoolId: cls.schoolId, campusId, academicYear: opts.academicYear, term: opts.term });
  for (const slot of teaching) for (const duty of substitutes) {
    if (slot.id !== duty.slotId && slot.teacherId === duty.teacherId && overlaps(slot, duty)) conflicts.push({ identity: JSON.stringify(["SUBSTITUTE_BOOKING", duty.id, slot.id ?? `${slot.dayOfWeek}/${slot.periodNumber}`]), type: "TEACHER_DOUBLE_BOOKED", severity: "CRITICAL", message: `This teacher has substitute cover for ${duty.className} on ${duty.date}. Reassign the dated duty first.`, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, slotId: slot.id, teacherName: duty.teacherName, otherClass: duty.className });
  }
  const examBookings = await getExamBookingSlots(db, { schoolId: cls.schoolId, campusId, academicYear: opts.academicYear, term: opts.term });
  for (const slot of teaching) for (const exam of examBookings) {
    // CLASS and EXAM period numbers are separate namespaces; compare clocks.
    if (slot.dayOfWeek !== exam.dayOfWeek || slot.startTime && slot.endTime && slot.startTime < slot.endTime && (slot.startTime >= exam.endTime || exam.startTime >= slot.endTime)) continue;
    for (const resource of ["teacher", "room"] as const) {
      const id = resource === "teacher" ? slot.teacherId : slot.roomId;
      if (!id || id !== (resource === "teacher" ? exam.teacherId : exam.roomId)) continue;
      conflicts.push({ identity: JSON.stringify(["EXAM_BOOKING", resource, id, slot.id ?? `${slot.dayOfWeek}/${slot.periodNumber}`, exam.id]), type: resource === "teacher" ? "TEACHER_DOUBLE_BOOKED" : "ROOM_DOUBLE_BOOKED", severity: "CRITICAL", message: `${resource === "teacher" ? "Teacher" : "Room"} is reserved for ${exam.examTitle} at ${exam.startTime}–${exam.endTime} on ${DAYS[slot.dayOfWeek]}. Review the dated exam before using this weekly period.`, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, slotId: slot.id, teacherName: exam.teacherName ?? undefined, roomNumber: exam.roomNumber ?? undefined, otherClass: exam.className });
    }
  }

  // The stored board is excluded above, so check the proposed complete board
  // against itself as well. Assignment synchronization can change several
  // lessons together, including legacy periods with overlapping clock times.
  for (let index = 0; index < teaching.length; index++) {
    const slot = teaching[index];
    for (const other of teaching.slice(0, index)) {
      if (!overlaps(slot, other)) continue;
      const when = `${DAYS[slot.dayOfWeek] ?? "Day " + slot.dayOfWeek}, periods ${other.periodNumber} and ${slot.periodNumber}`;
      if (slot.teacherId && slot.teacherId === other.teacherId) conflicts.push({
        identity: JSON.stringify(["TEACHER_DOUBLE_BOOKED", slot.teacherId, timetableId, ...[slot.id ?? `${slot.dayOfWeek}/${slot.periodNumber}`, other.id ?? `${other.dayOfWeek}/${other.periodNumber}`].sort()]),
        type: "TEACHER_DOUBLE_BOOKED", severity: "CRITICAL",
        message: `The same teacher is assigned to overlapping lessons in this timetable on ${when}.`,
        dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, slotId: slot.id,
      });
      if (slot.roomId && slot.roomId === other.roomId) conflicts.push({
        identity: JSON.stringify(["ROOM_DOUBLE_BOOKED", slot.roomId, timetableId, ...[slot.id ?? `${slot.dayOfWeek}/${slot.periodNumber}`, other.id ?? `${other.dayOfWeek}/${other.periodNumber}`].sort()]),
        type: "ROOM_DOUBLE_BOOKED", severity: "CRITICAL",
        message: `The same room is assigned to overlapping lessons in this timetable on ${when}.`,
        dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, slotId: slot.id,
        roomNumber: roomById.get(slot.roomId)?.roomNumber,
      });
    }
  }

  for (const slot of teaching) {
    const when = `${DAYS[slot.dayOfWeek] ?? "Day " + slot.dayOfWeek}, period ${slot.periodNumber}`;

    if (slot.teacherId) {
      const clashes = otherSlots.filter(
        (o) =>
          o.teacherId === slot.teacherId &&
          overlaps(slot, o),
      );
      for (const clash of clashes) {
        conflicts.push({
          identity: JSON.stringify(["TEACHER_DOUBLE_BOOKED", slot.teacherId, timetableId, slot.id ?? `${slot.dayOfWeek}/${slot.periodNumber}`, clash.timetable.id, clash.id]),
          type: "TEACHER_DOUBLE_BOOKED",
          severity: "CRITICAL",
          message: `${clash.teacher?.fullName ?? "This teacher"} is already teaching ${classLabel(clash.timetable.class)}${clash.timetable.campusId && clash.timetable.campusId !== campusId ? ` at ${clash.timetable.campus?.name ?? "another campus"}` : ""} at ${clash.startTime}–${clash.endTime}, overlapping ${slot.startTime ?? ""}–${slot.endTime ?? ""} on ${when}.`,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          slotId: slot.id,
          teacherName: clash.teacher?.fullName ?? undefined,
          otherClass: classLabel(clash.timetable.class),
          otherSlotId: clash.id,
          otherTimetableId: clash.timetable.id,
          otherTime: `${clash.startTime}–${clash.endTime}`,
          otherCampus: clash.timetable.campusId && clash.timetable.campusId !== campusId ? clash.timetable.campus?.name ?? undefined : undefined,
          time: slot.startTime && slot.endTime ? `${slot.startTime}–${slot.endTime}` : undefined,
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
      const clashes = otherSlots.filter(
        (o) =>
          o.roomId === slot.roomId &&
          overlaps(slot, o),
      );
      for (const clash of clashes) {
        conflicts.push({
          identity: JSON.stringify(["ROOM_DOUBLE_BOOKED", slot.roomId, timetableId, slot.id ?? `${slot.dayOfWeek}/${slot.periodNumber}`, clash.timetable.id, clash.id]),
          type: "ROOM_DOUBLE_BOOKED",
          severity: "CRITICAL",
          message: `Room ${clash.room?.roomNumber ?? ""} is already booked for ${classLabel(clash.timetable.class)} at ${clash.startTime}–${clash.endTime}, overlapping ${slot.startTime ?? ""}–${slot.endTime ?? ""} on ${when}.`,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          slotId: slot.id,
          roomNumber: clash.room?.roomNumber ?? undefined,
          otherClass: classLabel(clash.timetable.class),
          otherSlotId: clash.id,
          otherTimetableId: clash.timetable.id,
          otherTime: `${clash.startTime}–${clash.endTime}`,
          time: slot.startTime && slot.endTime ? `${slot.startTime}–${slot.endTime}` : undefined,
        });
      }

      // capacity 0 means the school has not recorded it — not a violation.
      const room = roomById.get(slot.roomId);
      if (room?.archivedAt) conflicts.push({ type: "ROOM_ARCHIVED", severity: "WARNING", message: `Room ${room.roomNumber} is archived. Move this lesson to an active room.`, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, slotId: slot.id, roomNumber: room.roomNumber });
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
  db: TxClient = prisma,
): Promise<TimetableValidation> {
  const timetable = await db.timetable.findFirst({
    where: { id: timetableId, campusId },
    select: {
      classId: true,
      academicYear: true,
      term: true,
      slots: {
        select: {
          id: true,
          dayOfWeek: true,
          periodNumber: true,
          startTime: true,
          endTime: true,
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
    academicYear: timetable.academicYear,
    term: timetable.term,
  }, db);
}
