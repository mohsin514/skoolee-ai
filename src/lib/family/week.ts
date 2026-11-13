import { localParts, zonedInstant } from "../meetings/time";
// SKAI-1405: the Monday of the week containing a calendar day, as YYYY-MM-DD.
// The day is read from the given date's local calendar parts, then the arithmetic runs in UTC, so
// toISOString's UTC shift cannot move the result to the previous week in zones east of UTC.
export function mondayOf(date: Date): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const isoWeekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() - isoWeekday + 1);
  return day.toISOString().slice(0, 10);
}

// SKAI-1405: campus-timezone helpers, so a staff device in another zone neither picks the wrong week
// nor schedules the wrong instant.

/** The Monday (YYYY-MM-DD) of the week that contains `now` on the school's calendar. */
export function campusMondayOf(now: Date, timeZone: string): string {
  const { date } = localParts(now, timeZone);
  const [y, m, d] = date.split("-").map(Number);
  return mondayOf(new Date(y, m - 1, d));
}

/** The ISO instant at which the school's clock shows a datetime-local value ("YYYY-MM-DDTHH:MM"). */
export function campusInstant(local: string, timeZone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(local);
  if (!match) return null;
  const instant = zonedInstant(match[1], match[2], timeZone);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
