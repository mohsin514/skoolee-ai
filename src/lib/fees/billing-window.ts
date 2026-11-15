/** SKAI-2059: a class is billed only for months that fall inside its own academic cycle's dates. */
export type CycleWindow = { startDate: Date | null; endDate: Date | null };

const day = (value: Date) => value.toISOString().slice(0, 10);

/** True when the billing month [monthStart, nextMonth) does not overlap the cycle. A cycle with no dates bounds nothing. */
export function monthOutsideCycle(cycle: CycleWindow | undefined, monthStart: Date, nextMonth: Date): boolean {
  if (!cycle) return false;
  if (cycle.startDate && day(nextMonth) <= day(cycle.startDate)) return true;
  if (cycle.endDate && day(monthStart) > day(cycle.endDate)) return true;
  return false;
}
