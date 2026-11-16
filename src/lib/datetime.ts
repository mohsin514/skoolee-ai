import { getLocalePackage } from "@/lib/locale/store";
import { calendarDateIn } from "@/lib/calendar-date";

export { calendarDateIn };

/** Resolve at the instant of use: a cache can cross an effective-date boundary. */
export async function getSchoolTimeZone(schoolId: string, campusId: string | null = null): Promise<string> {
  return (await getLocalePackage(schoolId, campusId)).timezone;
}

/**
 * SKAI-2088: the `dueDate < cutoff` bound for "overdue". Due dates are stored as UTC-midnight calendar dates, so
 * comparing them with the current instant made an invoice overdue from 00:00 UTC on its due day (05:00 in Karachi).
 * The cutoff is UTC midnight of the school's calendar date: an invoice due today is "due today", not overdue.
 */
export async function overdueCutoff(schoolId: string, campusId: string | null = null): Promise<Date> {
  return new Date(`${await schoolToday(schoolId, campusId)}T00:00:00.000Z`);
}

export async function schoolToday(schoolId: string, campusId: string | null = null): Promise<string> {
  return calendarDateIn(await getSchoolTimeZone(schoolId, campusId));
}
