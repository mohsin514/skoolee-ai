// SKAI-1694: the Notification Center reads the inbox a page at a time. The first page and every older page use
// the same view filters; an older page appends only rows not already shown, so a retried cursor is safe.
export const INBOX_PAGE_SIZE = 30;

export function inboxPageUrl(view: string, cursor?: string | null) {
  const params = new URLSearchParams({ view, limit: String(INBOX_PAGE_SIZE), ...(view === "actions" ? { status: "open" } : {}), ...(cursor ? { cursor } : {}) });
  return `/api/notifications?${params}`;
}

export function appendInboxPage<T extends { id: string }>(shown: T[], page: T[]): T[] {
  const seen = new Set(shown.map(row => row.id));
  return [...shown, ...page.filter(row => !seen.has(row.id))];
}

/**
 * SKAI-1940: a reminder bumps an existing row (reminderCount, lastRemindedAt) instead of adding a new one, and the
 * inbox is ordered by latest activity (see compareLatestActivity). The time shown and the day heading follow the same
 * latest activity, so a
 * grouped chat notification reads "4 minutes ago" for its newest message, not the age of the first one.
 */
export function inboxItemTime(item: { createdAt: string; lastRemindedAt?: string | null }): string {
  return item.lastRemindedAt ?? item.createdAt;
}

type ActivityRow = { id: string; createdAt: Date; lastRemindedAt: Date | null };

/** SKAI-1940: the inbox order, newest latest activity (lastRemindedAt ?? createdAt) first, then id descending. */
export function compareLatestActivity(a: ActivityRow, b: ActivityRow): number {
  const gap = (b.lastRemindedAt ?? b.createdAt).getTime() - (a.lastRemindedAt ?? a.createdAt).getTime();
  return gap !== 0 ? gap : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Prisma cannot order by COALESCE(last_reminded_at, created_at), so the inbox reads two streams that are each sorted
 * by their own activity column (reminded rows by lastRemindedAt, never-reminded rows by createdAt), both id
 * descending, and merges them. Each stream is limited to `take`, so the merged first `take` rows are exact.
 */
export function mergeLatestActivity<T extends ActivityRow>(reminded: T[], plain: T[], take: number): T[] {
  return [...reminded, ...plain].sort(compareLatestActivity).slice(0, take);
}

/** Keyset filter for rows strictly after the cursor row in the inbox order, on one stream's activity column. */
export function olderThanCursor(column: "lastRemindedAt" | "createdAt", cursor: ActivityRow) {
  const at = cursor.lastRemindedAt ?? cursor.createdAt;
  return { OR: [{ [column]: { lt: at } }, { [column]: at, id: { lt: cursor.id } }] };
}
