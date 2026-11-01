/**
 * SKAI-1616: the state of one marks cell as the client saw it, so a save can prove it still
 * matches the server. Absence and exemption are part of the state, not just the number stored
 * beside them: an absent pupil is stored as 0, so comparing numbers alone would miss a change
 * between "0" and "absent".
 *
 * "" means no mark row yet; "ABSENT" and "EXEMPT" are the flagged states; anything else is the
 * stored marks as a string.
 */
export type MarkBaseline = "" | "ABSENT" | "EXEMPT" | string;

export function markBaseline(mark: { marksObtained: number; isAbsent?: boolean | null; isExempt?: boolean | null } | null | undefined): MarkBaseline {
  if (!mark) return "";
  if (mark.isAbsent) return "ABSENT";
  if (mark.isExempt) return "EXEMPT";
  return String(mark.marksObtained);
}

/** The client's view of a cell: the sentinel values the marks dialog keeps (-1 absent, -2 exempt), or undefined when missing. */
export function clientBaseline(value: number | undefined, absentValue: number, exemptValue: number): MarkBaseline {
  if (value === undefined) return "";
  if (value === absentValue) return "ABSENT";
  if (value === exemptValue) return "EXEMPT";
  return String(value);
}
