import type { TxClient } from "@/lib/db/prisma";
import { loadLocaleTimeline } from "@/lib/locale/store";

/** IDs only: calendar previews never need to expose pupils or answer material. */
export async function examsOnWeekend(tx: TxClient, schoolId: string, campusIds: string[], fromDate: Date) {
  const exams = await tx.examSchedule.findMany({ where: { schoolId, campusId: { in: campusIds }, date: { gte: fromDate }, exam: { status: { notIn: ["CANCELLED", "ARCHIVED"] }, class: { archivedAt: null } } }, select: { id: true, campusId: true, date: true }, take: 5001 });
  if (exams.length > 5000) throw new Error("calendarScopeLimit");
  const invalid = new Set<string>();
  for (const campusId of new Set(exams.map(exam => exam.campusId))) {
    const timeline = await loadLocaleTimeline(schoolId, campusId, tx);
    for (const exam of exams.filter(exam => exam.campusId === campusId)) if (timeline(exam.date).weekend.includes(exam.date.getUTCDay())) invalid.add(exam.id);
  }
  return invalid;
}

/** Caller owns the campus booking locks and transaction; a conflict rolls back the policy mutation. */
export async function withExamCalendarChange<T>(tx: TxClient, schoolId: string, campusIds: string[], fromDate: Date, change: () => Promise<T>) {
  const before = await examsOnWeekend(tx, schoolId, campusIds, fromDate);
  const lessonsBefore = await lessonsOnWeekend(tx, schoolId, campusIds, fromDate);
  const result = await change();
  const after = await examsOnWeekend(tx, schoolId, campusIds, fromDate);
  const lessonsAfter = await lessonsOnWeekend(tx, schoolId, campusIds, fromDate);
  if ([...after].some(id => !before.has(id)) || [...lessonsAfter].some(id => !lessonsBefore.has(id))) throw new Error("examWeekend");
  return result;
}

async function lessonsOnWeekend(tx: TxClient, schoolId: string, campusIds: string[], fromDate: Date) {
  const lessons = await tx.timetableSlot.findMany({ where: { schoolId, slotType: "CLASS", subjectId: { not: null }, timetable: { campusId: { in: campusIds }, status: "PUBLISHED", class: { status: "ACTIVE", archivedAt: null } } }, select: { id: true, dayOfWeek: true, timetable: { select: { campusId: true } } }, take: 10001 });
  if (lessons.length > 10000) throw new Error("calendarScopeLimit");
  const policies = await tx.localePolicy.findMany({ where: { schoolId, status: "ACTIVE", effectiveAt: { gt: fromDate }, OR: [{ campusId: null }, { campusId: { in: campusIds } }] }, select: { effectiveAt: true }, take: 501 });
  if (policies.length > 500) throw new Error("calendarScopeLimit");
  const dates = [...new Set([fromDate.toISOString(), ...policies.map(policy => policy.effectiveAt.toISOString())])];
  const invalid = new Set<string>();
  for (const campusId of new Set(lessons.map(lesson => lesson.timetable.campusId))) {
    const timeline = await loadLocaleTimeline(schoolId, campusId, tx);
    for (const lesson of lessons.filter(item => item.timetable.campusId === campusId)) {
      for (const date of dates) if (timeline(new Date(date)).weekend.includes(lesson.dayOfWeek % 7)) invalid.add(`${lesson.id}:${date}`);
    }
  }
  return invalid;
}
