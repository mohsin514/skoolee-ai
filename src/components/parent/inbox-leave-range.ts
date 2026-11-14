/**
 * SKAI-1937: a leave request's dates in the family inbox. The inbox source sends `"<from>–<to>"` as calendar days
 * (YYYY-MM-DD); the card shows them in the reader's language, the way the Attendance page does, never the raw ISO
 * text. One day reads as that day alone. Anything else is shown unchanged.
 */
export function inboxLeaveRange(formatDate: (value: string) => string, detail: string | null): string | null {
  const match = detail?.match(/^(\d{4}-\d{2}-\d{2})–(\d{4}-\d{2}-\d{2})$/);
  if (!match) return detail;
  return match[1] === match[2] ? formatDate(match[1]) : `${formatDate(match[1])} – ${formatDate(match[2])}`;
}
