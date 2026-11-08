/** Include all earlier days and today's callbacks in the institution's calendar. */
export function callbackDueByToday(dueAt: string, now: Date, timezone: string): boolean {
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime())) return false;
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return format.format(due) <= format.format(now);
}
