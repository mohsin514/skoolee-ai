/** SKAI-1701: the month a user chose is kept as `?cal=YYYY-MM`, so Back, refresh and relogin reopen it. */
export function parseCalendarMonth(value: string | null | undefined): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]) - 1;
  if (year < 1900 || year > 2200 || month < 0 || month > 11) return null;
  return { year, month };
}
export function calendarMonthParam(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}
