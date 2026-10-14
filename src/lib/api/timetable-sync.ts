import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { assertSubstituteLessonsUnchanged } from "@/lib/school-ai/school-operations-bookings";
import { validateStoredTimetable } from "@/lib/timetable/validate";

/** Kept in successful assignment responses for existing administrative clients. */
export interface TimetableClash {
  teacherName: string;
  label: string;
  classes: string[];
  message: string;
}

/**
 * The caller owns the SERIALIZABLE transaction and must acquire the campus
 * timetable fence before reading assignments. There is intentionally no global
 * client fallback: assignment, slot updates and validation commit together.
 */
export async function syncTimetableSlotsForSubjects(
  tx: TxClient,
  scope: { schoolId: string; campusId: string },
  subjectIds: string[],
  teacherId: string | null,
): Promise<void> {
  const ids = [...new Set(subjectIds)];
  if (!ids.length) return;
  const subjects = await tx.subject.findMany({
    where: { id: { in: ids }, ...scope }, select: { id: true, classId: true },
  });
  if (subjects.length !== ids.length) throw new ApiError("A subject is outside this school or campus", 403);
  const classBySubject = new Map(subjects.map(subject => [subject.id, subject.classId]));
  const affected = await tx.timetableSlot.findMany({
    where: { schoolId: scope.schoolId, subjectId: { in: ids } },
    select: { id: true, subjectId: true, teacherId: true, roomId: true, startTime: true, endTime: true, slotType: true, timetable: { select: { id: true, schoolId: true, campusId: true, classId: true } } },
  });
  if (affected.some(slot => slot.timetable.schoolId !== scope.schoolId || slot.timetable.campusId !== scope.campusId || slot.timetable.classId !== classBySubject.get(slot.subjectId!))) {
    throw new ApiError("A scheduled subject no longer belongs to its timetable class. Correct the schedule before changing its teacher.", 409);
  }
  if (!affected.length) return;
  await assertSubstituteLessonsUnchanged(tx, scope.schoolId, scope.campusId, affected, affected.map(slot => ({ ...slot, teacherId })));
  await tx.timetableSlot.updateMany({
    where: { id: { in: affected.map(slot => slot.id) }, schoolId: scope.schoolId, timetable: { schoolId: scope.schoolId, campusId: scope.campusId } },
    data: { teacherId },
  });
  const timetableIds = [...new Set(affected.map(slot => slot.timetable.id))];
  for (const timetableId of timetableIds) {
    // Validate the entire resulting board, including unchanged lessons, using
    // its own academic year and term. Draft completeness remains a warning.
    const validation = await validateStoredTimetable(timetableId, scope.campusId, tx);
    const conflicts = validation.conflicts.filter(conflict => conflict.severity === "CRITICAL");
    if (conflicts.length) throw new ApiError(`Teacher assignment was not saved. ${conflicts.map(conflict => conflict.message).join(" ")}`, 409);
  }
  await tx.timetable.updateMany({ where: { id: { in: timetableIds }, ...scope }, data: { updatedAt: new Date() } });
}
