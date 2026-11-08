import { ApiError } from "@/lib/api/scope";

/** SKAI-145: pure holiday-calendar rules, shared by POST/PUT and unit tests. */
export const HOLIDAY_NAME_MAX = 120;
export const HOLIDAY_SPAN_MAX_DAYS = 92;
export const HOLIDAY_REPEAT_MAX_YEARS = 4;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export type HolidayRange = { start: Date; end: Date };
export type HolidayInput = { name: string; range: HolidayRange; repeatYears: number; allCampuses: boolean };

function day(text: unknown, field: string) {
  const value = String(text ?? "");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!DATE_RE.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ApiError(`${field} must be a real calendar date (YYYY-MM-DD).`, 400);
  return date;
}

export function parseHolidayInput(body: Record<string, unknown>): HolidayInput {
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new ApiError("Name this holiday to add it.", 400);
  if (name.length > HOLIDAY_NAME_MAX) throw new ApiError(`Keep the holiday name to ${HOLIDAY_NAME_MAX} characters.`, 400);
  const start = day(body.fromDate, "fromDate"), end = day(body.toDate, "toDate");
  if (start > end) throw new ApiError("The end date is before the start date.", 400);
  if ((end.getTime() - start.getTime()) / DAY_MS + 1 > HOLIDAY_SPAN_MAX_DAYS) throw new ApiError(`A holiday can cover at most ${HOLIDAY_SPAN_MAX_DAYS} days. Split longer breaks into terms.`, 400);
  const repeatYears = body.repeatYears === undefined || body.repeatYears === null || body.repeatYears === "" ? 0 : Number(body.repeatYears);
  if (!Number.isInteger(repeatYears) || repeatYears < 0 || repeatYears > HOLIDAY_REPEAT_MAX_YEARS) throw new ApiError(`Repeat a holiday for 0 to ${HOLIDAY_REPEAT_MAX_YEARS} more years.`, 400);
  return { name, range: { start, end }, repeatYears, allCampuses: body.allCampuses === true };
}

/** The first range plus one copy per following year; 29 February copies that do not exist are skipped. */
export function expandRecurring(range: HolidayRange, repeatYears: number): HolidayRange[] {
  const out: HolidayRange[] = [range];
  for (let year = 1; year <= repeatYears; year++) {
    const shift = (date: Date) => {
      const next = new Date(Date.UTC(date.getUTCFullYear() + year, date.getUTCMonth(), date.getUTCDate()));
      return next.getUTCMonth() === date.getUTCMonth() ? next : null;
    };
    const start = shift(range.start), end = shift(range.end);
    if (start && end) out.push({ start, end });
  }
  return out;
}

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Ranges that already have a holiday on any of their days, named so the office can find them. */
export function overlapMessage(existing: { name: string; fromDate: Date; toDate: Date }[]) {
  const first = existing[0];
  return first ? `These dates overlap "${first.name}" (${isoDay(first.fromDate)} to ${isoDay(first.toDate)}). Edit that holiday instead of adding a second one.` : null;
}

/**
 * Academic-year bounds: when the campus has dated academic years, every holiday day must fall inside
 * one of them. A campus that has not dated its years yet is not blocked (setup checklist still open).
 */
export function outsideAcademicYears(range: HolidayRange, cycles: { startDate: Date | null; endDate: Date | null }[]) {
  const dated = cycles.filter((cycle): cycle is { startDate: Date; endDate: Date } => Boolean(cycle.startDate && cycle.endDate));
  if (!dated.length) return false;
  return !dated.some(cycle => cycle.startDate <= range.start && cycle.endDate >= range.end);
}
