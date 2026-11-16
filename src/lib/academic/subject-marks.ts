export const SUBJECT_MARKS_ERROR = "Maximum marks must be a whole number from 1 to 1000";

/** Parses the Total marks field. Blank, 0, negatives, decimals and >1000 return null instead of a silent default. */
export function parseSubjectMarks(raw: string | number | null | undefined): number | null {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= 1000 ? value : null;
}
