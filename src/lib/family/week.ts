// SKAI-1405: the Monday of the week containing a calendar day, as YYYY-MM-DD.
// The day is read from the given date's local calendar parts, then the arithmetic runs in UTC, so
// toISOString's UTC shift cannot move the result to the previous week in zones east of UTC.
export function mondayOf(date: Date): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const isoWeekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() - isoWeekday + 1);
  return day.toISOString().slice(0, 10);
}
