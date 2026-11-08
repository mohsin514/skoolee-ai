import { ApiError } from "@/lib/api/scope";

/** SKAI-118: pure weekend-configuration rules, shared by the calendar route and unit tests. Days are 1=Mon … 7=Sun. */
const DAY_MS = 86_400_000;
export const WEEKEND_PREVIEW_MAX_DAYS = 400;
export const WEEKEND_SAMPLE_DATES = 6;

export function parseWeekendDays(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) throw new ApiError("Choose at least one weekend day.", 400);
  const days = value.map(Number);
  if (days.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new ApiError("Weekend days must be Monday to Sunday (1-7).", 400);
  if (new Set(days).size !== days.length) throw new ApiError("Each weekend day can be chosen once.", 400);
  if (days.length === 7) throw new ApiError("Keep at least one working day in the week.", 400);
  return [...days].sort((a, b) => a - b);
}

/** Optimistic concurrency: the caller states the weekend it was looking at; a different saved set means another edit won. */
export function assertWeekendCurrent(expected: unknown, current: number[]) {
  if (expected === undefined || expected === null) return;
  if (!Array.isArray(expected) || [...expected].map(Number).sort((a, b) => a - b).join() !== [...current].sort((a, b) => a - b).join())
    throw new ApiError("The weekend changed since you opened this page. Reload to see the latest days, then try again.", 409);
}

export type WeekendHoliday = { fromDate: Date | string; toDate: Date | string };
export type WeekendImpact = {
  from: string; to: string;
  newlyClosed: number; newlyOpened: number; holidayDaysOnNewWeekend: number;
  closedSamples: string[]; openedSamples: string[];
};
const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (value: Date | string) => new Date(`${typeof value === "string" ? value.slice(0, 10) : iso(value)}T00:00:00.000Z`);
const dow = (date: Date) => date.getUTCDay() || 7;

/** Dates from `from` to `to` (inclusive, capped) whose working/weekend status flips, and holidays already on the new weekend. */
export function weekendImpact(current: number[], proposed: number[], from: string, to: string, holidays: WeekendHoliday[] = []): WeekendImpact {
  const start = utc(from);
  const end = new Date(Math.min(utc(to).getTime(), start.getTime() + (WEEKEND_PREVIEW_MAX_DAYS - 1) * DAY_MS));
  const ranges = holidays.map(h => ({ start: utc(h.fromDate).getTime(), end: utc(h.toDate).getTime() }));
  const impact: WeekendImpact = { from: iso(start), to: iso(end < start ? start : end), newlyClosed: 0, newlyOpened: 0, holidayDaysOnNewWeekend: 0, closedSamples: [], openedSamples: [] };
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const day = dow(new Date(t)), was = current.includes(day), will = proposed.includes(day);
    if (will && ranges.some(r => t >= r.start && t <= r.end)) { if (!was) impact.holidayDaysOnNewWeekend++; continue; }
    if (will && !was) { impact.newlyClosed++; if (impact.closedSamples.length < WEEKEND_SAMPLE_DATES) impact.closedSamples.push(iso(new Date(t))); }
    if (was && !will && !ranges.some(r => t >= r.start && t <= r.end)) { impact.newlyOpened++; if (impact.openedSamples.length < WEEKEND_SAMPLE_DATES) impact.openedSamples.push(iso(new Date(t))); }
  }
  return impact;
}

/** Preview window: today to the end of the active academic year, else one year ahead. */
export function previewWindow(today: string, cycleEnd?: Date | null) {
  const start = utc(today);
  const fallback = new Date(start.getTime() + 364 * DAY_MS);
  const end = cycleEnd && utc(cycleEnd) >= start ? utc(cycleEnd) : fallback;
  return { from: iso(start), to: iso(end) };
}
