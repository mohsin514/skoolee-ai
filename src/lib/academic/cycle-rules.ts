import type { AcademicModelConfiguration, ConfigProblem } from "@/lib/academic/model-config";

/**
 * SKAI-117: academic cycles (terms, semesters, reporting periods) live in an academic model version's
 * `configuration.terms`. `validateAcademicModel` already checks names, dates, teaching weeks, overlaps and
 * the version's effective dates; these rules add the campus academic year (SKAI-116) as the outer bound,
 * a stable date order, the cycle in session today, and the stale/duplicate guards for the write routes.
 */
type Cycle = AcademicModelConfiguration["terms"][number];
export type YearBounds = { label: string; startDate: Date | null; endDate: Date | null };

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Dated cycles first in start order, undated ones after them in their entered order. */
export function orderCycles<T extends Pick<Cycle, "startDate">>(cycles: T[]): T[] {
  return cycles.map((cycle, index) => ({ cycle, index }))
    .sort((a, b) => (a.cycle.startDate ? 0 : 1) - (b.cycle.startDate ? 0 : 1) || a.cycle.startDate.localeCompare(b.cycle.startDate) || a.index - b.index)
    .map(({ cycle }) => cycle);
}

/** Every cycle must sit inside the campus academic year; a year without dates cannot bound them. */
export function cycleYearProblems(cycles: Cycle[], year: YearBounds | null): ConfigProblem[] {
  const repairHref = "/admin?view=year-cycle";
  if (!year) return [{ code: "year_missing", message: "Create this academic year before activating its terms.", template: "Create this academic year before activating its terms.", repairHref }];
  if (!year.startDate || !year.endDate) return [{ code: "year_undated", message: `Set the start and end dates of ${year.label} before activating its terms.`, template: "Set the start and end dates of {0} before activating its terms.", params: [year.label], repairHref }];
  const start = iso(year.startDate), end = iso(year.endDate);
  return cycles.filter((cycle) => cycle.startDate && cycle.endDate && (cycle.startDate < start || cycle.endDate > end))
    .map((cycle) => ({ code: "period_outside_year", message: `${cycle.label} falls outside ${year.label} (${start} to ${end}).`, template: "{0} falls outside {1} ({2} to {3}).", params: [cycle.label, year.label, start, end], repairHref: "#academic-model-periods" }));
}

/** The cycle in session on `today` (YYYY-MM-DD), else the next one to start, else null. */
export function currentCycle<T extends Pick<Cycle, "startDate" | "endDate">>(cycles: T[], today: string): { cycle: T; state: "current" | "next" } | null {
  const dated = orderCycles(cycles.filter((cycle) => cycle.startDate && cycle.endDate));
  const current = dated.find((cycle) => cycle.startDate <= today && cycle.endDate >= today);
  if (current) return { cycle: current, state: "current" };
  const next = dated.find((cycle) => cycle.startDate > today);
  return next ? { cycle: next, state: "next" } : null;
}

/**
 * Stale-edit guard: the caller echoes the `updatedAt` it loaded; another saved value is stale (the route answers 409).
 * Pure, because the panel imports this module too.
 */
export function isModelCurrent(expected: unknown, saved: Date) {
  if (expected === undefined) return true;
  return typeof expected === "string" && new Date(expected).getTime() === saved.getTime();
}

/** Key-order-independent JSON (Postgres jsonb does not keep the order the configuration was written in). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** A retried save of the same draft returns the saved draft instead of numbering a new version. */
export function isSameDraft(
  saved: { status: string; title: string; effectiveFrom: Date; effectiveTo: Date | null; configuration: unknown },
  next: { title: string; effectiveFrom: Date; effectiveTo: Date | null; configuration: unknown },
) {
  return saved.status === "DRAFT" && saved.title === next.title && saved.effectiveFrom.getTime() === next.effectiveFrom.getTime()
    && (saved.effectiveTo?.getTime() ?? null) === (next.effectiveTo?.getTime() ?? null)
    && canonical(saved.configuration) === canonical(next.configuration);
}
