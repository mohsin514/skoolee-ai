import { prisma } from "@/lib/db/prisma";
import { roomCapacity, roomLocation } from "@/lib/academic/room-capacity";

// ─── Conflict-prevention availability queries ───────────────────────────────
// These power the "prevent, don't detect" UX: dropdowns only ever offer
// resources that are free for a given day/period, so a busy teacher or room
// can never be selected in the first place.

export interface AvailableTeacher {
  id: string;
  fullName: string;
}

export interface AvailableRoom {
  id: string;
  roomNumber: string;
  /** Teaching capacity — what `capacity` has always meant. */
  capacity: number;
  /** Seats at exam spacing (§79). Never equal to `capacity` in a room with
   *  more than one pupil per bench, and it is this number a paper must fit. */
  examCapacity: number;
  teachingCapacity: number;
  benches: number;
  unmeasured: boolean;
  isExamHall: boolean;
  location: string;
}

const ROOM_SELECT = {
  id: true,
  roomNumber: true,
  capacity: true,
  building: true,
  floor: true,
  wing: true,
  rows: true,
  benchesPerRow: true,
  seatsPerBench: true,
  examSeatsPerBench: true,
  isExamHall: true,
} as const;

function toAvailableRoom(room: {
  id: string;
  roomNumber: string;
  capacity: number;
  building: string | null;
  floor: number;
  wing: string | null;
  rows: number;
  benchesPerRow: number;
  seatsPerBench: number;
  examSeatsPerBench: number;
  isExamHall: boolean;
}): AvailableRoom {
  const cap = roomCapacity(room);
  return {
    id: room.id,
    roomNumber: room.roomNumber,
    capacity: room.capacity,
    examCapacity: cap.exam,
    teachingCapacity: cap.teaching,
    benches: cap.benches,
    unmeasured: cap.unmeasured,
    isExamHall: room.isExamHall,
    location: roomLocation(room),
  };
}

/**
 * Teachers who are NOT already teaching a CLASS slot in the given
 * day/period across the campus (excluding the timetable currently being edited).
 */
export async function getAvailableTeachers(
  campusId: string,
  dayOfWeek: number,
  periodNumber: number,
  excludeTimetableId?: string
): Promise<AvailableTeacher[]> {
  const busy = await prisma.timetableSlot.findMany({
    where: {
      timetable: {
        campusId,
        ...(excludeTimetableId ? { id: { not: excludeTimetableId } } : {}),
      },
      dayOfWeek,
      periodNumber,
      slotType: "CLASS",
      teacherId: { not: null },
    },
    select: { teacherId: true },
    distinct: ["teacherId"],
  });
  const busyIds = busy.map((b) => b.teacherId as string);
  const teachers = await prisma.user.findMany({
    where: { campusId, role: "TEACHER", id: { notIn: busyIds } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return teachers;
}

/**
 * Rooms that are NOT already occupied by a CLASS slot in the given
 * day/period across the campus (excluding the timetable being edited).
 */
export async function getAvailableRooms(
  campusId: string,
  dayOfWeek: number,
  periodNumber: number,
  excludeTimetableId?: string
): Promise<AvailableRoom[]> {
  const busy = await prisma.timetableSlot.findMany({
    where: {
      timetable: {
        campusId,
        ...(excludeTimetableId ? { id: { not: excludeTimetableId } } : {}),
      },
      dayOfWeek,
      periodNumber,
      roomId: { not: null },
    },
    select: { roomId: true },
    distinct: ["roomId"],
  });
  const busyIds = busy.map((b) => b.roomId as string);
  const rooms = await prisma.classRoom.findMany({
    where: { campusId, id: { notIn: busyIds } },
    select: ROOM_SELECT,
    orderBy: { roomNumber: "asc" },
  });
  return rooms.map(toAvailableRoom);
}

/**
 * For exam scheduling: rooms that are NOT already booked for any exam in the
 * campus on the given date+period. `examId` excludes the current exam's own
 * schedules so editing an existing schedule doesn't block itself.
 */
export async function getAvailableExamRooms(
  campusId: string,
  date: string,
  periodDefinitionId: string | null,
  examId?: string
): Promise<AvailableRoom[]> {
  // Since §58 a paper can occupy several rooms, and only its primary one is
  // mirrored into `examSchedule.roomId`. Asking that column alone therefore
  // reported every overflow room of a split paper as free, and offered it to
  // the next paper in the same slot.
  const busy = await prisma.examRoom.findMany({
    where: {
      campusId,
      examSchedule: {
        date: new Date(`${date}T00:00:00.000Z`),
        ...(periodDefinitionId ? { periodDefinitionId } : {}),
        ...(examId ? { examId: { not: examId } } : {}),
      },
    },
    select: { roomId: true },
    distinct: ["roomId"],
  });
  const busyIds = busy.map((b) => b.roomId);
  const rooms = await prisma.classRoom.findMany({
    where: { campusId, id: { notIn: busyIds } },
    select: ROOM_SELECT,
    orderBy: { roomNumber: "asc" },
  });
  return rooms.map(toAvailableRoom);
}
