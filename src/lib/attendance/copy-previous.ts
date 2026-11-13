// SKAI-228: "Copy previous register" fills a register's draft from the last earlier day that has marks.
// It follows the SKO-405 rule that unmarked is never assumed: only pupils still unmarked in this draft are
// filled, a mark someone already made is never overwritten, and pupils with no earlier mark stay unmarked.
// Nothing is saved here; the copied marks go through the normal save, review and conflict checks.

export type CopyDraft = { status: string | null; arrivalTime: string; departureTime: string };
export type CopySource = { studentId: string; status: string | null; arrivalTime: string | null; departureTime: string | null };

/** The earlier days to look at, newest first (YYYY-MM-DD, UTC calendar arithmetic). */
export function previousDates(date: string, lookback = 7): string[] {
  const base = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return [];
  return Array.from({ length: lookback }, (_, index) => new Date(base.getTime() - (index + 1) * 86_400_000).toISOString().slice(0, 10));
}

export function hasMarks(source: CopySource[]): boolean {
  return source.some(row => row.status);
}

export function copyPreviousIntoDrafts<D extends CopyDraft>(drafts: Record<string, D>, source: CopySource[]): { drafts: Record<string, D>; copied: number; skipped: number } {
  const previous = new Map(source.filter(row => row.status).map(row => [row.studentId, row]));
  let copied = 0, skipped = 0;
  const next = Object.fromEntries(Object.entries(drafts).map(([id, draft]) => {
    if (draft.status) return [id, draft];
    const row = previous.get(id);
    if (!row) { skipped += 1; return [id, draft]; }
    copied += 1;
    return [id, { ...draft, status: row.status, arrivalTime: row.arrivalTime ?? "", departureTime: row.departureTime ?? "" }];
  })) as Record<string, D>;
  return { drafts: next, copied, skipped };
}
