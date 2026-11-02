/**
 * Message day and clock formatting in the school locale timezone (SKAI-1437).
 * Instants are formatted and compared as calendar days in `timeZone`, never in the device timezone,
 * so the same message reads the same date and time on every device.
 */

/** A calendar day in `timeZone` as "YYYY-MM-DD". */
export function zonedDayKey(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** The calendar day before a "YYYY-MM-DD" key, computed on calendar fields so DST shifts cannot move it. */
export function previousDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function dayLabelIn(
  iso: string,
  { ui, tag, timeZone, now = new Date() }: { ui: (key: string) => string; tag: string; timeZone: string; now?: Date },
) {
  const date = new Date(iso);
  const day = zonedDayKey(date, timeZone);
  const today = zonedDayKey(now, timeZone);
  if (day === today) return ui("Today");
  if (day === previousDayKey(today)) return ui("Yesterday");
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone }).format(date);
}

export function clockTimeIn(iso: string, tag: string | undefined, timeZone: string) {
  return new Date(iso).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", timeZone });
}
