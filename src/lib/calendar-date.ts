// Pure calendar helpers: no DB or server imports, so client components can use them.
/**
 * Tenant-local calendar dates.
 *
 * Stored datetimes are UTC and stay that way — that part was always correct.
 * The bug this fixes is narrower: deciding WHICH DAY it is. Code used
 * `new Date().toISOString().slice(0, 10)`, which is the UTC calendar date. For
 * a UTC+5 tenant those disagree between 00:00 and 05:00 local, so anything
 * running in that window — an early attendance mark, a nightly cron, a fee
 * cutoff — dated itself to the previous day.
 *
 * IMPORTANT: only use these for "what is today / what day is this instant on".
 * Do NOT use them to format a stored date-only column. Those are persisted at
 * UTC midnight, so `.toISOString().slice(0, 10)` round-trips them correctly and
 * converting to a tenant zone would shift them by a day.
 */

import { zonedInstant } from "./meetings/time";

const DEFAULT_TIME_ZONE = "Asia/Karachi";

/** YYYY-MM-DD for `instant` as seen in `timeZone`. */
export function calendarDateIn(timeZone: string, instant: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is the shape the app and <input type="date"> use.
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    // An unknown IANA zone must not take a request down; fall back to the default.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  }
}

/**
 * SKAI-1931: the last instant (ISO) of calendar day `day` (YYYY-MM-DD) on the clock of `timeZone`, so a deadline of
 * "end of today" means midnight at the campus, not midnight UTC. An unknown zone falls back to the end of the UTC day.
 */
export function endOfCalendarDayIn(day: string, timeZone: string): string {
  const next = new Date(`${day}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  try {
    const midnight = zonedInstant(next.toISOString().slice(0, 10), "00:00", timeZone);
    if (!Number.isNaN(midnight.getTime())) return new Date(midnight.getTime() - 1).toISOString();
  } catch { /* unknown zone: fall through */ }
  return new Date(next.getTime() - 1).toISOString();
}
