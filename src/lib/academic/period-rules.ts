// SKAI-146: pure rules for period definitions (the bell schedule). Shared by the periods API and its tests.

export const PERIOD_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type PeriodRow = { id: string; periodNumber: number; startTime: string; endTime: string };

export function periodMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Touching periods (one ends 08:40, the next starts 08:40) do not overlap. */
export function periodsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return periodMinutes(aStart) < periodMinutes(bEnd) && periodMinutes(bStart) < periodMinutes(aEnd);
}

export function findPeriodOverlap(rows: PeriodRow[], start: string, end: string, excludeId?: string) {
  return rows.find((r) => r.id !== excludeId && periodsOverlap(r.startTime, r.endTime, start, end));
}

/** Returns an error message for an invalid period, or null when it is valid. */
export function periodInputProblem(periodNumber: number, startTime: string, endTime: string): string | null {
  if (!Number.isInteger(periodNumber) || periodNumber < 1) return "periodNumber must be >= 1";
  if (!PERIOD_TIME_RE.test(startTime) || !PERIOD_TIME_RE.test(endTime)) return "startTime/endTime must be HH:mm";
  if (periodMinutes(startTime) >= periodMinutes(endTime)) return "endTime must be after startTime";
  return null;
}

export type PeriodTimetableImpact = { slots: number; timetables: number; published: number };

/**
 * What a class-period edit does to timetables already built on it. Slots reference periods by number, so a renumber
 * or delete would orphan them (blocked); a time change needs explicit confirmation and then re-times the draft slots.
 */
export function classPeriodEditDecision(input: {
  impact: PeriodTimetableImpact;
  renumbered: boolean;
  timesShifted: boolean;
  applyToTimetables: boolean;
}): "ok" | "blocked-renumber" | "confirm" | "apply" {
  if (input.impact.slots === 0) return "ok";
  if (input.renumbered) return "blocked-renumber";
  if (!input.timesShifted) return "ok";
  return input.applyToTimetables ? "apply" : "confirm";
}

export function periodImpactMessage(periodNumber: number, impact: PeriodTimetableImpact): string {
  const published = impact.published > 0 ? ` (${impact.published} published — families keep the current version until you republish)` : "";
  return `Period ${periodNumber} is used by ${impact.slots} slot(s) in ${impact.timetables} timetable(s)${published}. Confirm to move those slots to the new times.`;
}
