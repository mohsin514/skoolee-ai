// SKO-420: wall-clock time in the school's timezone ↔ instants. Windows are stored as school-local date and
// times; a booking stores the exact instant. Conversions go through Intl so daylight-saving changes resolve
// to the instant the school's clock shows.

const parts = (instant: Date, timeZone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }).formatToParts(instant).map(p => [p.type, p.value]));
const offsetMs = (instant: Date, timeZone: string) => { const p = parts(instant, timeZone); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(instant.getTime() / 1000) * 1000; };

/** The instant at which the school's clock shows `date` `time` (YYYY-MM-DD, HH:MM). */
export function zonedInstant(date: string, time: string, timeZone: string) {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
/** School-local date, HH:MM and ISO weekday (1 = Monday) of an instant. */
export function localParts(instant: Date, timeZone: string) {
  const p = parts(instant, timeZone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: WEEKDAY[p.weekday] ?? 0 };
}

export const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
export const hhmm = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
export const validTimeZone = (timeZone: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone }); return true; } catch { return false; } };
