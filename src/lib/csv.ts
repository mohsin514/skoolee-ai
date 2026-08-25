/**
 * One CSV cell encoder for the whole app.
 *
 * There were four separate copies of this logic (the students export route,
 * the shared-admin roster export, the fees export and the teacher marks
 * export) and they disagreed: two escaped quotes only, one also neutralised
 * formulas. Divergent copies of a security control are how a fix reaches three
 * of four call sites, so the behaviour lives here now.
 *
 * Handles two distinct problems:
 *
 * 1. RFC 4180 quoting. Guardian names carry commas ("Khan, Ayesha") and
 *    addresses carry newlines; unescaped, either silently shifts every later
 *    column.
 *
 * 2. Formula/DDE injection (SEC-3). A cell beginning = + - @ (or tab/CR) is
 *    evaluated as a formula by Excel, Sheets and LibreOffice, so a student
 *    stored as =cmd|'/c calc'!A1 becomes command execution on the machine of
 *    whoever opens the export. School rosters are full of free text an outsider
 *    can influence, so this is reachable by anyone who can get a student
 *    admitted or submit an admission enquiry.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);

  // Phone numbers legitimately begin with "+", and a value made only of digits
  // and phone punctuation cannot express a formula payload — so those are left
  // alone rather than sprinkling apostrophes through every contact column.
  const looksLikePhone = /^\+?[\d\s()\-]+$/.test(s);
  if (/^[=+\-@\t\r]/.test(s) && !looksLikePhone) {
    s = `'${s}`;
  }

  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
