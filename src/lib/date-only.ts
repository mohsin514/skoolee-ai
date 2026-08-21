/**
 * Calendar-date helpers with no server dependencies, safe in client components.
 *
 * A "date-only" value here is the YYYY-MM-DD string the app and
 * <input type="date"> both use. Two traps these exist to avoid:
 *
 * 1. `new Date("2026-08-21")` parses as UTC midnight, but `getDate()` and
 *    `setDate()` read and write in LOCAL time. Mixing them shifts the date by a
 *    day for any browser west of UTC — an attendance page stepping "yesterday"
 *    would land two days back.
 *
 * 2. `new Date().toISOString().slice(0, 10)` is the UTC calendar date, not the
 *    user's. Between 00:00 and 05:00 in Pakistan it names the previous day.
 */

/** Today's date in the BROWSER's timezone, as YYYY-MM-DD. */
export function localToday(): string {
  // en-CA renders as YYYY-MM-DD, and unlike toISOString it respects local time.
  return new Date().toLocaleDateString("en-CA");
}

/** Shift a YYYY-MM-DD string by whole days, using UTC arithmetic throughout. */
export function shiftDateOnly(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
