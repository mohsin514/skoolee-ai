/** Date-only billing context. A monthly bill must never predate admission or
 * silently inherit a different class's historical enrollment. */
export function invoiceEnrollmentContext(
  periods: Array<{ id: string; startDate: Date; endDate: Date | null }>,
  monthStart: Date,
  dueDate: Date,
  cycleStart?: Date | null,
): { enrollmentId: string; invoiceDate: string } | null {
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const due = date(dueDate);
  const matches = periods.filter(period => date(period.startDate) <= due && (!period.endDate || date(period.endDate) > due));
  // The database forbids overlapping verified periods. Fail closed for an
  // unreconciled legacy dataset instead of guessing a placement.
  if (matches.length !== 1) return null;
  const period = matches[0];
  const invoiceDate = [date(monthStart), date(period.startDate), ...(cycleStart ? [date(cycleStart)] : [])].sort().at(-1)!;
  if (invoiceDate > due) return null;
  return { enrollmentId: period.id, invoiceDate };
}
