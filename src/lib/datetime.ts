import { prisma } from "@/lib/db/prisma";

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

// Tenant timezone changes about never, and this is read on hot paths, so it is
// cached briefly rather than adding a lookup to every attendance request.
const zoneCache = new Map<string, { zone: string; at: number }>();
const CACHE_TTL_MS = 60_000;

export async function getSchoolTimeZone(schoolId: string): Promise<string> {
  const hit = zoneCache.get(schoolId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.zone;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { timezone: true },
  });
  const zone = school?.timezone || DEFAULT_TIME_ZONE;
  zoneCache.set(schoolId, { zone, at: Date.now() });
  return zone;
}

/** Today's calendar date for a tenant, as YYYY-MM-DD. */
export async function schoolToday(schoolId: string): Promise<string> {
  return calendarDateIn(await getSchoolTimeZone(schoolId));
}
