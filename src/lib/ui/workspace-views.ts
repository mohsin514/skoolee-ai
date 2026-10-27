/** Presentation metadata only: never records, scopes, permissions or drafts. */
export const workspaceViews = ["cards", "table", "grid", "calendar"] as const;
export type WorkspaceView = typeof workspaceViews[number];
export function validWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === "string" && workspaceViews.includes(value as WorkspaceView);
}
export type CalendarDate = { value: string | Date | null | undefined; kind: "date" | "instant" };
/** Date-only domain fields retain their civil day; instants require an explicit offset. */
export function calendarDay(input: CalendarDate | undefined, timezone: string): string | null {
  if (!input?.value) return null;
  if (input.value instanceof Date && !Number.isFinite(input.value.getTime())) return null;
  const value = input.value instanceof Date ? input.value.toISOString() : input.value;
  if (typeof value !== "string") return null;
  if (input.kind === "date") {
    const day = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const parsed = new Date(`${day}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
  }
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value) || !calendarDay({ value: value.slice(0, 10), kind: "date" }, timezone)) return null;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch { return null; }
}
export function groupCalendarRows<T>(rows: T[], getDate: (row: T) => CalendarDate | undefined, timezone: string) {
  const dated = new Map<string, T[]>();
  const undated: T[] = [];
  for (const row of rows) {
    const day = calendarDay(getDate(row), timezone);
    if (!day) undated.push(row);
    else { const group = dated.get(day); if (group) group.push(row); else dated.set(day, [row]); }
  }
  return { days: [...dated].sort(([a], [b]) => a.localeCompare(b)), undated };
}
