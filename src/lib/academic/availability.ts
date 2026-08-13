import { prisma } from "@/lib/db/prisma";

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
  capacity: number;
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
    select: { id: true, roomNumber: true, capacity: true },
    orderBy: { roomNumber: "asc" },
  });
  return rooms;
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
  const busy = await prisma.examSchedule.findMany({
    where: {
      campusId,
      date: new Date(`${date}T00:00:00.000Z`),
      ...(periodDefinitionId ? { periodDefinitionId } : {}),
      ...(examId ? { examId: { not: examId } } : {}),
      roomId: { not: null },
    },
    select: { roomId: true },
    distinct: ["roomId"],
  });
  const busyIds = busy.map((b) => b.roomId as string);
  const rooms = await prisma.classRoom.findMany({
    where: { campusId, id: { notIn: busyIds } },
    select: { id: true, roomNumber: true, capacity: true },
    orderBy: { roomNumber: "asc" },
  });
  return rooms;
}
