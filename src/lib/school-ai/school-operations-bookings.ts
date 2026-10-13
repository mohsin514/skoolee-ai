import type { TxClient } from "@/lib/db/prisma";
import { SchoolAiError } from "./access";
import { termsOverlap } from "@/lib/academic/exam-bookings";
import { z } from "zod";
import { getLocalePackage } from "@/lib/locale/store";
import { calendarDateIn } from "@/lib/datetime";
export const substituteSnapshotSchema = z.object({ classId: z.string(), academicYear: z.number().int(), term: z.string(), dayOfWeek: z.number().int(), periodNumber: z.number().int(), className: z.string(), subjectName: z.string(), roomNumber: z.string().nullable(), startTime: z.string(), endTime: z.string(), teacherName: z.string(), originalTeacherName: z.string() });

/** Dated cover reserves its teacher when ordinary timetable or exam writers run. */
export async function getSubstituteBookings(db: TxClient, scope: { schoolId: string; campusId: string; academicYear?: number; term?: string }) {
  // Include the previous UTC date so campuses west of UTC retain their current day.
  const from = new Date(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const duties = await db.schoolAiSubstituteDuty.findMany({ where: { schoolId: scope.schoolId, campusId: scope.campusId, status: "ASSIGNED", date: { gte: from } }, orderBy: { id: "asc" }, take: 5001 });
  if (duties.length > 5000) throw new SchoolAiError("Review dated lesson cover in a smaller scope.", 422, "SCHOOL_OPERATIONS_LIMIT");
  if (!duties.length) return [];
  const [slots, teachers] = await Promise.all([
    db.timetableSlot.findMany({ where: { schoolId: scope.schoolId, id: { in: duties.map(duty => duty.timetableSlotId) }, timetable: { campusId: scope.campusId, ...(scope.academicYear ? { academicYear: scope.academicYear } : {}) } }, include: { timetable: { select: { term: true, academicYear: true, class: { select: { name: true, section: true } } } } } }),
    db.user.findMany({ where: { schoolId: scope.schoolId, campusId: scope.campusId, id: { in: [...new Set(duties.map(duty => duty.teacherId))] } }, select: { id: true, fullName: true } }),
  ]);
  return duties.flatMap(duty => { const slot = slots.find(item => item.id === duty.timetableSlotId); if (!slot || scope.term && !termsOverlap(scope.term, slot.timetable.term)) return []; return [{ id: duty.id, slotId: slot.id, date: duty.date.toISOString().slice(0, 10), dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, startTime: slot.startTime, endTime: slot.endTime, teacherId: duty.teacherId, teacherName: teachers.find(item => item.id === duty.teacherId)?.fullName ?? "", className: [slot.timetable.class.name, slot.timetable.class.section].filter(Boolean).join(" · ") }]; });
}

export async function assertSubstituteLessonsUnchanged(db: TxClient, schoolId: string, campusId: string, before: Array<{ id: string; teacherId: string | null; subjectId: string | null; roomId: string | null; startTime: string; endTime: string; slotType: string }>, after: typeof before) {
  const changed = before.filter(old => { const next = after.find(item => item.id === old.id); return !next || ["teacherId", "subjectId", "roomId", "startTime", "endTime", "slotType"].some(key => next[key as keyof typeof next] !== old[key as keyof typeof old]); }).map(item => item.id);
  if (!changed.length) return;
  const locale = await getLocalePackage(schoolId, campusId, new Date(), undefined, db), today = calendarDateIn(locale.timezone);
  const duties = await db.schoolAiSubstituteDuty.findMany({ where: { schoolId, campusId, timetableSlotId: { in: changed }, status: "ASSIGNED" }, select: { date: true, lessonSnapshot: true } });
  if (duties.some(duty => duty.date.toISOString().slice(0, 10) >= today || !substituteSnapshotSchema.safeParse(duty.lessonSnapshot).success)) throw new SchoolAiError("Cancel or reassign dated substitute cover before changing these lessons.", 409, "SCHOOL_OPERATIONS_COVER_EXISTS");
}
