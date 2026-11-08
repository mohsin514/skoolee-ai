import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { getLocalePackage } from "@/lib/locale/store";
import { calendarDateIn } from "@/lib/datetime";
import { outsideAcademicYears, overlapMessage, type HolidayRange } from "@/lib/academic/holiday-rules";

/** Shared by reviewed setup and manual routes while holding the campus scheduling fence. */
export async function inspectWeekendChange(tx: TxClient, scope: { schoolId: string; campusId: string }, days: number[]) {
  if (!days.length || new Set(days).size !== days.length || days.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new ApiError("Choose unique weekend days from Monday to Sunday.", 400);
  const policies = await tx.localePolicy.findMany({ where: { schoolId: scope.schoolId, status: "ACTIVE", effectiveAt: { lte: new Date() }, OR: [{ campusId: null }, { campusId: scope.campusId }] }, orderBy: { id: "asc" } });
  if (policies.some(policy => policy.settings && typeof policy.settings === "object" && !Array.isArray(policy.settings) && "weekend" in policy.settings)) throw new ApiError("Weekend policy is controlled in Language and regional settings. Preview an effective-dated change there.", 409);
  const current = await getLocalePackage(scope.schoolId, scope.campusId, new Date(), undefined, tx), currentDays = current.weekend.map(day => day || 7).sort(), newlyClosed = days.filter(day => !currentDays.includes(day)), today = new Date(calendarDateIn(current.timezone));
  const [weekends, exams, slots, substitutes] = await Promise.all([
    tx.weekend.findMany({ where: scope, orderBy: { dayOfWeek: "asc" } }),
    tx.examSchedule.findMany({ where: { ...scope, date: { gte: today }, exam: { status: { notIn: ["CANCELLED", "ARCHIVED"] }, class: { archivedAt: null } } }, select: { id: true, date: true }, orderBy: { id: "asc" }, take: 5001 }),
    tx.timetableSlot.findMany({ where: { schoolId: scope.schoolId, dayOfWeek: { in: newlyClosed }, slotType: "CLASS", subjectId: { not: null }, timetable: { ...scope, status: "PUBLISHED", class: { archivedAt: null, status: "ACTIVE" } } }, select: { id: true }, take: 1 }),
    tx.schoolAiSubstituteDuty.findMany({ where: { ...scope, status: "ASSIGNED", date: { gte: today } }, select: { id: true, date: true }, orderBy: { id: "asc" }, take: 5001 }),
  ]);
  if (exams.length > 5000 || substitutes.length > 5000) throw new ApiError("Split this calendar review into a smaller scheduling scope.", 409);
  if (exams.some(exam => newlyClosed.includes(exam.date.getUTCDay() || 7)) || slots.length || substitutes.some(duty => newlyClosed.includes(duty.date.getUTCDay() || 7))) throw new ApiError("Move scheduled exams, published lessons and dated substitute cover off the proposed closed days first.", 409);
  return { currentDays, weekends, policies, exams, substitutes };
}
export async function inspectHolidayRange(tx: TxClient, scope: { schoolId: string; campusId: string }, start: Date, end: Date, excludeId?: string) {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new ApiError("Choose real calendar dates in order.", 400);
  const [holidays, exams, substitutes] = await Promise.all([
    tx.holiday.findMany({ where: { ...scope, ...(excludeId ? { id: { not: excludeId } } : {}), fromDate: { lte: end }, toDate: { gte: start } }, orderBy: { id: "asc" }, take: 501 }),
    tx.examSchedule.findMany({ where: { ...scope, date: { gte: start, lte: end }, exam: { status: { notIn: ["CANCELLED", "ARCHIVED"] }, class: { archivedAt: null } } }, select: { id: true }, take: 1 }),
    tx.schoolAiSubstituteDuty.findMany({ where: { ...scope, status: "ASSIGNED", date: { gte: start, lte: end } }, select: { id: true }, take: 1 }),
  ]);
  if (exams.length || substitutes.length) throw new ApiError("Move scheduled exams and cancel dated substitute cover before closing these dates.", 409);
  if (holidays.length > 500) throw new ApiError("Review duplicate calendar records before adding holidays.", 409);
  return { holidays };
}
/** SKAI-145: the manual route's stricter fence — no overlapping holiday and inside the campus's dated academic years. */
export async function assertHolidayWritable(tx: TxClient, scope: { schoolId: string; campusId: string }, range: HolidayRange, excludeId?: string) {
  const { holidays } = await inspectHolidayRange(tx, scope, range.start, range.end, excludeId);
  const overlap = overlapMessage(holidays);
  if (overlap) throw new ApiError(overlap, 409);
  const cycles = await tx.academicCycle.findMany({ where: { ...scope, status: { not: "ENDED" } }, select: { startDate: true, endDate: true } });
  if (outsideAcademicYears(range, cycles)) throw new ApiError("Holiday dates must fall inside a current academic year. Check the year's start and end dates first.", 400);
}
