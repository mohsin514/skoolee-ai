import { getLocalePackage } from "@/lib/locale/store";
import { calendarDateIn } from "@/lib/calendar-date";

export { calendarDateIn };

/** Resolve at the instant of use: a cache can cross an effective-date boundary. */
export async function getSchoolTimeZone(schoolId: string, campusId: string | null = null): Promise<string> {
  return (await getLocalePackage(schoolId, campusId)).timezone;
}

export async function schoolToday(schoolId: string, campusId: string | null = null): Promise<string> {
  return calendarDateIn(await getSchoolTimeZone(schoolId, campusId));
}
