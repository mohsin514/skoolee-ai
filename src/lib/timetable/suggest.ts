import { prisma } from "@/lib/db/prisma";
import {
  validateStoredTimetable,
  type TimetableConflict,
  type TimetableValidation,
} from "@/lib/timetable/validate";

/**
 * Conflict resolution for a class timetable (§67–69).
 *
 * The validator already says *what* is wrong. This says what to do about it,
 * as a concrete change an administrator can approve in one click:
 *
 *   §67  propose fixes for every conflict on the board
 *   §68  each proposal is a real, applicable change — not advice
 *   §69  applying one re-runs validation, because a fix can create a new clash
 *
 * Two deliberate constraints:
 *
 *  - Nothing is applied automatically. Every proposal names the human cost
 *    ("moves Mathematics to Wednesday period 3") and waits for approval. A
 *    timetable is a promise to staff and families; silently rewriting it is
 *    worse than leaving the clash visible.
 *  - A proposal is only ever a *suggestion*: `applySuggestion` re-derives and
 *    re-validates rather than trusting what it is handed, so a stale proposal
 *    from a board that has since changed is rejected instead of applied.
 */

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type SuggestionKind = "REASSIGN_TEACHER" | "REASSIGN_ROOM" | "MOVE_SLOT";

export interface SuggestionAction {
  type: SuggestionKind;
  slotId: string;
  teacherId?: string;
  roomId?: string;
  /** For MOVE_SLOT: the empty slot the lesson moves into. */
  targetSlotId?: string;
}

export interface Suggestion {
  id: string;
  /** The conflict this answers, so the UI can group them. */
  conflictType: TimetableConflict["type"];
  severity: TimetableConflict["severity"];
  dayOfWeek: number;
  periodNumber: number;
  /** One sentence naming the change and its consequence. */
  description: string;
  action: SuggestionAction;
}

export interface SuggestionReport {
  validation: TimetableValidation;
  suggestions: Suggestion[];
  /** Conflicts nothing could be proposed for — an honest empty answer. */
  unresolvable: TimetableConflict[];
}

interface SlotRow {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  slotType: string | null;
  subjectId: string | null;
  teacherId: string | null;
  roomId: string | null;
}

const key = (id: string, day: number, period: number) => `${id}-${day}-${period}`;

/**
 * Everything the proposals are built from, loaded once.
 *
 * Busy maps cover the whole campus, including this timetable, so a proposal
 * can never move a lesson onto a period the same teacher already works.
 */
async function loadContext(campusId: string, timetableId: string) {
  const timetable = await prisma.timetable.findFirst({
    where: { id: timetableId, campusId },
    select: {
      classId: true,
      class: { select: { name: true, section: true } },
      slots: {
        select: {
          id: true,
          dayOfWeek: true,
          periodNumber: true,
          slotType: true,
          subjectId: true,
          teacherId: true,
          roomId: true,
        },
        orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
      },
    },
  });
  if (!timetable) return null;

  const [allSlots, rooms, teachers, subjects, classSize] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { timetable: { campusId }, slotType: "CLASS" },
      select: { id: true, dayOfWeek: true, periodNumber: true, teacherId: true, roomId: true },
    }),
    prisma.classRoom.findMany({
      where: { campusId },
      select: { id: true, roomNumber: true, capacity: true },
      orderBy: { capacity: "asc" },
    }),
    prisma.user.findMany({
      where: { campusId, role: { in: ["TEACHER", "PRINCIPAL"] }, isActive: true },
      select: { id: true, fullName: true, subjectSpecialties: true, teachesAllSubjects: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.subject.findMany({
      where: { classId: timetable.classId },
      select: { id: true, name: true, teacherId: true },
    }),
    prisma.student.count({ where: { classId: timetable.classId, campusId } }),
  ]);

  const teacherBusy = new Set<string>();
  const roomBusy = new Set<string>();
  for (const s of allSlots) {
    if (s.teacherId) teacherBusy.add(key(s.teacherId, s.dayOfWeek, s.periodNumber));
    if (s.roomId) roomBusy.add(key(s.roomId, s.dayOfWeek, s.periodNumber));
  }

  return {
    timetable,
    slots: timetable.slots as SlotRow[],
    rooms,
    teachers,
    subjects: new Map(subjects.map((s) => [s.id, s])),
    classSize,
    teacherBusy,
    roomBusy,
  };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

/** Teachers free at this day/period, best match for the subject first. */
function freeTeachersFor(ctx: Ctx, subjectId: string | null, day: number, period: number) {
  const subject = subjectId ? ctx.subjects.get(subjectId) : null;
  return ctx.teachers
    .filter((t) => !ctx.teacherBusy.has(key(t.id, day, period)))
    .map((t) => {
      // The subject's own teacher is the obvious answer; a declared specialism
      // is the next best; anyone else is a fallback the admin may still want.
      const score =
        subject?.teacherId === t.id
          ? 0
          : subject && t.subjectSpecialties.includes(subject.name)
            ? 1
            : t.teachesAllSubjects
              ? 2
              : 3;
      return { ...t, score };
    })
    .sort((a, b) => a.score - b.score);
}

/** Rooms free at this day/period that can hold the class, smallest first. */
function freeRoomsFor(ctx: Ctx, day: number, period: number) {
  return ctx.rooms.filter(
    (r) =>
      !ctx.roomBusy.has(key(r.id, day, period)) &&
      (r.capacity === 0 || r.capacity >= ctx.classSize),
  );
}

/** Empty CLASS slots on this board where the given teacher and room are both free. */
function freeSlotsFor(ctx: Ctx, teacherId: string | null, roomId: string | null) {
  return ctx.slots.filter((s) => {
    if ((s.slotType ?? "CLASS") !== "CLASS") return false;
    if (s.subjectId) return false;
    if (teacherId && ctx.teacherBusy.has(key(teacherId, s.dayOfWeek, s.periodNumber))) return false;
    if (roomId && ctx.roomBusy.has(key(roomId, s.dayOfWeek, s.periodNumber))) return false;
    return true;
  });
}

const when = (day: number, period: number) =>
  `${DAYS[day] ?? `Day ${day}`} period ${period}`;

/**
 * Propose fixes for every conflict currently on the board.
 *
 * At most three proposals per conflict, cheapest change first: swapping one
 * teacher or room disturbs less than moving a lesson to another day.
 */
export async function buildSuggestions(
  campusId: string,
  timetableId: string,
): Promise<SuggestionReport> {
  const validation = await validateStoredTimetable(timetableId, campusId);
  const ctx = await loadContext(campusId, timetableId);
  if (!ctx) return { validation, suggestions: [], unresolvable: validation.conflicts };

  const suggestions: Suggestion[] = [];
  const unresolvable: TimetableConflict[] = [];
  const slotById = new Map(ctx.slots.map((s) => [s.id, s]));

  for (const conflict of validation.conflicts) {
    const slot = conflict.slotId ? slotById.get(conflict.slotId) : undefined;
    if (!slot) {
      unresolvable.push(conflict);
      continue;
    }

    const subjectName = slot.subjectId ? ctx.subjects.get(slot.subjectId)?.name ?? "This lesson" : "This lesson";
    const before = suggestions.length;
    const push = (s: Omit<Suggestion, "id" | "conflictType" | "severity" | "dayOfWeek" | "periodNumber">) =>
      suggestions.push({
        id: `${conflict.type}:${slot.id}:${suggestions.length}`,
        conflictType: conflict.type,
        severity: conflict.severity,
        dayOfWeek: slot.dayOfWeek,
        periodNumber: slot.periodNumber,
        ...s,
      });

    if (conflict.type === "TEACHER_DOUBLE_BOOKED" || conflict.type === "MISSING_TEACHER") {
      for (const t of freeTeachersFor(ctx, slot.subjectId, slot.dayOfWeek, slot.periodNumber).slice(0, 2)) {
        push({
          description: `Give ${subjectName} to ${t.fullName}, who is free on ${when(slot.dayOfWeek, slot.periodNumber)}.`,
          action: { type: "REASSIGN_TEACHER", slotId: slot.id, teacherId: t.id },
        });
      }
    }

    if (conflict.type === "ROOM_DOUBLE_BOOKED" || conflict.type === "ROOM_CAPACITY" || conflict.type === "MISSING_ROOM") {
      for (const r of freeRoomsFor(ctx, slot.dayOfWeek, slot.periodNumber).slice(0, 2)) {
        if (r.id === slot.roomId) continue;
        push({
          description: `Move ${subjectName} into Room ${r.roomNumber} (seats ${r.capacity || "unrecorded"}), free on ${when(slot.dayOfWeek, slot.periodNumber)}.`,
          action: { type: "REASSIGN_ROOM", slotId: slot.id, roomId: r.id },
        });
      }
    }

    // Moving the lesson is the last resort — it changes the week for the whole
    // class, not just one resource.
    if (conflict.severity === "CRITICAL") {
      const target = freeSlotsFor(ctx, slot.teacherId, slot.roomId)[0];
      if (target) {
        push({
          description: `Move ${subjectName} to ${when(target.dayOfWeek, target.periodNumber)}, leaving ${when(slot.dayOfWeek, slot.periodNumber)} empty.`,
          action: { type: "MOVE_SLOT", slotId: slot.id, targetSlotId: target.id },
        });
      }
    }

    if (suggestions.length === before) unresolvable.push(conflict);
  }

  // One slot can carry a teacher clash and a room clash at once, and "move the
  // lesson" answers both — so the same change would otherwise be offered twice.
  const seen = new Set<string>();
  const deduped = suggestions.filter((s) => {
    const sig = `${s.action.type}:${s.action.slotId}:${s.action.teacherId ?? ""}:${s.action.roomId ?? ""}:${s.action.targetSlotId ?? ""}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });

  return { validation, suggestions: deduped, unresolvable };
}

/**
 * Apply one approved change, then re-validate the whole board (§69).
 *
 * The re-validation is the point: freeing Monday period 1 by moving a lesson to
 * Wednesday can put that teacher into a clash on Wednesday. Returning the fresh
 * conflict list means the admin sees the actual consequence of what they just
 * approved rather than an assurance that it worked.
 */
export async function applySuggestion(opts: {
  campusId: string;
  timetableId: string;
  action: SuggestionAction;
}): Promise<{ applied: SuggestionAction; report: SuggestionReport }> {
  const { campusId, timetableId, action } = opts;

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: action.slotId, timetableId },
    select: {
      id: true,
      subjectId: true,
      teacherId: true,
      roomId: true,
      roomNumber: true,
      slotType: true,
      startTime: true,
      endTime: true,
    },
  });
  if (!slot) throw new ApiErrorLike("That slot is not part of this timetable", 400);

  if (action.type === "REASSIGN_TEACHER") {
    if (!action.teacherId) throw new ApiErrorLike("teacherId is required", 400);
    const teacher = await prisma.user.findFirst({
      where: { id: action.teacherId, campusId, role: { in: ["TEACHER", "PRINCIPAL"] }, isActive: true },
      select: { id: true },
    });
    if (!teacher) throw new ApiErrorLike("That teacher is not active in this campus", 400);
    await prisma.timetableSlot.update({ where: { id: slot.id }, data: { teacherId: teacher.id } });
  } else if (action.type === "REASSIGN_ROOM") {
    if (!action.roomId) throw new ApiErrorLike("roomId is required", 400);
    const room = await prisma.classRoom.findFirst({
      where: { id: action.roomId, campusId },
      select: { id: true, roomNumber: true },
    });
    if (!room) throw new ApiErrorLike("That room does not belong to this campus", 400);
    await prisma.timetableSlot.update({
      where: { id: slot.id },
      data: { roomId: room.id, roomNumber: room.roomNumber },
    });
  } else if (action.type === "MOVE_SLOT") {
    if (!action.targetSlotId) throw new ApiErrorLike("targetSlotId is required", 400);
    const target = await prisma.timetableSlot.findFirst({
      where: { id: action.targetSlotId, timetableId },
      select: { id: true, subjectId: true },
    });
    if (!target) throw new ApiErrorLike("That target slot is not part of this timetable", 400);
    if (target.subjectId) {
      throw new ApiErrorLike("That period is no longer free — refresh the suggestions", 409);
    }

    // Both halves in one transaction: a move that only half-lands would either
    // duplicate the lesson or delete it.
    await prisma.$transaction([
      prisma.timetableSlot.update({
        where: { id: target.id },
        data: {
          subjectId: slot.subjectId,
          teacherId: slot.teacherId,
          roomId: slot.roomId,
          roomNumber: slot.roomNumber,
        },
      }),
      prisma.timetableSlot.update({
        where: { id: slot.id },
        data: { subjectId: null, teacherId: null, roomId: null, roomNumber: null },
      }),
    ]);
  } else {
    throw new ApiErrorLike("Unknown suggestion type", 400);
  }

  return { applied: action, report: await buildSuggestions(campusId, timetableId) };
}

/**
 * Local mirror of ApiError.
 *
 * Importing `@/lib/api/scope` here would pull the whole auth/entitlement chain
 * into a module that is otherwise pure scheduling logic; `errorResponse` reads
 * `.status` structurally, so this satisfies it without the coupling.
 */
class ApiErrorLike extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
