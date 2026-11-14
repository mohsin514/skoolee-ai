/**
 * SKAI-1616: the client-seen baseline for every cell a marks save edits.
 *
 * The server (enterBulkMarks) compares each edited cell's current state with this baseline and
 * answers 409 when a concurrent editor changed it. A missing row is sent as "" so the baseline
 * matches a cell that still has no mark; ABSENT and EXEMPT are sent as their own tokens.
 */
export function expectedBaselineToken(value: number | undefined, absent: number, exempt: number): string {
  if (value === undefined) return "";
  if (value === absent) return "ABSENT";
  if (value === exempt) return "EXEMPT";
  return String(value);
}

export function buildExpectedMarks(
  entries: ReadonlyArray<{ studentId: string; subjectId: string }>,
  saved: Readonly<Record<string, number>>,
  absent: number,
  exempt: number,
): Record<string, string> {
  const expected: Record<string, string> = {};
  for (const entry of entries) {
    const key = `${entry.studentId}:${entry.subjectId}`;
    expected[key] = expectedBaselineToken(saved[key], absent, exempt);
  }
  return expected;
}
