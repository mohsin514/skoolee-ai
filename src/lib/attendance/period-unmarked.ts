// SKAI-1537: a week or month summary counts unmarked pupil-days, not pupils who never appeared.
// Expected days are the weekdays in the period plus any other day the campus actually marked.
export function expectedDays(start: Date, end: Date, markedDates: Iterable<string>): Set<string> {
  const days = new Set(markedDates);
  // Attendance dates are stored as UTC calendar days, so the expected days are walked in UTC too.
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) days.add(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Pupil-days in `days` with no record, for a class of `pupils` and its records. */
export function unmarkedPupilDays(pupils: number, days: Set<string>, records: { studentId: string; date: string }[]): number {
  const marked = new Set(records.filter(r => days.has(r.date)).map(r => `${r.studentId}:${r.date}`));
  return Math.max(0, pupils * days.size - marked.size);
}
