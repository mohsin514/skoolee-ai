/** Shared by timetable editors and resource views; no server or database imports. */
export const TIMETABLE_TERMS = ["ANNUAL", "TERM_1", "TERM_2", "TERM_3"] as const;
export interface TimetableScopeIdentity { academicYear: number; term: string }
export function timetableTermsOverlap(left: string, right: string): boolean {
  const known = (term: string) => TIMETABLE_TERMS.includes(term as typeof TIMETABLE_TERMS[number]);
  return !known(left) || !known(right) || left === "ANNUAL" || right === "ANNUAL" || left === right;
}
export function scopeTimetables<T extends TimetableScopeIdentity>(records: T[], academicYear: number, term: string, includeOverlaps = false): T[] {
  return records.filter(record => record.academicYear === academicYear && (includeOverlaps ? timetableTermsOverlap(record.term, term) : record.term === term));
}
export function timetablePeriods(slots: Array<{ periodNumber: number; startTime: string; endTime: string; slotType: string }>, definitions: Array<{ periodNumber: number; startTime: string; endTime: string }>) {
  const periods = new Map<number, { num: number; start: string; end: string; type: string }>();
  for (const slot of slots) if (!periods.has(slot.periodNumber)) periods.set(slot.periodNumber, { num: slot.periodNumber, start: slot.startTime, end: slot.endTime, type: slot.slotType });
  // Stored schedule times describe the selected draft. Campus defaults only fill missing rows.
  for (const period of definitions) if (!periods.has(period.periodNumber)) periods.set(period.periodNumber, { num: period.periodNumber, start: period.startTime, end: period.endTime, type: "CLASS" });
  return [...periods.values()].sort((a, b) => a.num - b.num);
}
