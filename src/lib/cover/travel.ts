import type { TxClient } from "@/lib/db/prisma";

// SKO-442: a teacher who also teaches at another campus cannot cover a lesson that starts or ends too close
// to a lesson there. The gap needed is the school's travel time between campuses (a fixed default until a
// per-campus distance is configured).
export const TRAVEL_MINUTES = 30;

const mins = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };

/** Lessons of these teachers at other campuses of the school that clash with [start, end] once travel is added. */
export async function otherCampusClashes(db: TxClient, input: { schoolId: string; campusId: string; teacherIds: string[]; dayOfWeek: number; startTime: string; endTime: string; travelMinutes?: number }) {
  if (!input.teacherIds.length) return new Map<string, { campusName: string; startTime: string; endTime: string }>();
  const travel = input.travelMinutes ?? TRAVEL_MINUTES, start = mins(input.startTime), end = mins(input.endTime);
  const lessons = await db.timetableSlot.findMany({ where: { schoolId: input.schoolId, teacherId: { in: input.teacherIds }, slotType: "CLASS", dayOfWeek: input.dayOfWeek, timetable: { status: "PUBLISHED", campusId: { not: input.campusId } } }, select: { teacherId: true, startTime: true, endTime: true, timetable: { select: { campus: { select: { name: true } } } } } });
  const clashes = new Map<string, { campusName: string; startTime: string; endTime: string }>();
  for (const lesson of lessons) {
    if (!lesson.teacherId || clashes.has(lesson.teacherId)) continue;
    if (mins(lesson.startTime) < end + travel && start < mins(lesson.endTime) + travel) clashes.set(lesson.teacherId, { campusName: lesson.timetable.campus.name, startTime: lesson.startTime, endTime: lesson.endTime });
  }
  return clashes;
}
