import { ApiError } from "@/lib/api/scope";

/**
 * SKAI-116: academic-year dates. A year's start and end bound the holiday calendar (SKAI-145
 * `outsideAcademicYears`), the weekend preview window (SKAI-118) and attendance, so they are
 * validated here once: real calendar days, end after start, a plausible length, and no overlap
 * with another year on the same campus.
 */
export const YEAR_MIN_DAYS = 28;
export const YEAR_MAX_DAYS = 550;
const DAY_MS = 86_400_000;

export type YearRange = { start: Date; end: Date };
type DatedYear = { id: string; label: string; startDate: Date | null; endDate: Date | null };

const iso = (date: Date) => date.toISOString().slice(0, 10);

function parseDay(value: unknown, field: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(`Enter the ${field} as a date.`, 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || iso(date) !== value) throw new ApiError(`The ${field} is not a real calendar day.`, 400);
  return date;
}

/** Both dates or neither (create stays compatible with callers that date the year later). */
export function parseYearRange(body: { startDate?: unknown; endDate?: unknown }, required: boolean): YearRange | null {
  if (!required && body.startDate == null && body.endDate == null) return null;
  const start = parseDay(body.startDate, "start date"), end = parseDay(body.endDate, "end date");
  const days = (end.getTime() - start.getTime()) / DAY_MS + 1;
  if (end <= start) throw new ApiError("The end date must be after the start date.", 400);
  if (days < YEAR_MIN_DAYS) throw new ApiError(`An academic year must be at least ${YEAR_MIN_DAYS} days long.`, 400);
  if (days > YEAR_MAX_DAYS) throw new ApiError(`An academic year can be at most ${YEAR_MAX_DAYS} days long.`, 400);
  return { start, end };
}

/** The other dated year on this campus whose days overlap the range, if any. */
export function overlappingYear(range: YearRange, years: DatedYear[], excludeId?: string) {
  return years.find(year => year.id !== excludeId && year.startDate && year.endDate && year.startDate <= range.end && year.endDate >= range.start) ?? null;
}

export function assertNoOverlap(range: YearRange, years: DatedYear[], excludeId?: string) {
  const other = overlappingYear(range, years, excludeId);
  if (other) throw new ApiError(`These dates overlap "${other.label}" (${iso(other.startDate!)} to ${iso(other.endDate!)}). Academic years on a campus cannot share days.`, 409);
}

/** Holidays that would fall (partly) outside the new range; they would no longer sit inside a year. */
export function holidaysOutside(range: YearRange, holidays: { name: string; fromDate: Date; toDate: Date }[]) {
  return holidays.filter(holiday => holiday.fromDate < range.start || holiday.toDate > range.end);
}

/** Stale-edit guard: the caller echoes the `updatedAt` it loaded; a different saved value is a 409. */
export function assertYearCurrent(expected: unknown, saved: Date) {
  if (expected === undefined) return;
  if (typeof expected !== "string" || new Date(expected).getTime() !== saved.getTime()) {
    throw new ApiError("Someone else changed this academic year. Reload to see the latest dates.", 409);
  }
}

/** Rollover: the next year's draft starts the day after the source ends and runs the same length. */
export function nextYearDraft(source: { academicYear: number; label: string; startDate: Date | null; endDate: Date | null }) {
  const academicYear = source.academicYear + 1;
  // "Session 2026-27" → "Session 2027-28"; a label without a year gets one appended.
  const bumped = source.label.replace(/\b(20\d{2})(\s*[-–/]\s*)?(\d{2}(?!\d)|20\d{2})?/g, (_, year: string, sep?: string, tail?: string) =>
    `${Number(year) + 1}${sep ?? ""}${tail ? String((Number(tail) + 1) % (tail.length === 2 ? 100 : 10000)).padStart(tail.length, "0") : ""}`);
  const label = bumped !== source.label ? bumped : `${source.label} (${academicYear})`;
  if (!source.startDate || !source.endDate) return { academicYear, label, startDate: null, endDate: null };
  const length = source.endDate.getTime() - source.startDate.getTime();
  const startDate = new Date(source.endDate.getTime() + DAY_MS);
  return { academicYear, label: label.slice(0, 180), startDate, endDate: new Date(startDate.getTime() + length) };
}
