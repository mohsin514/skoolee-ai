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
 * inbox is ordered by lastRemindedAt first. The time shown and the day heading follow the same latest activity, so a
 * grouped chat notification reads "4 minutes ago" for its newest message, not the age of the first one.
 */
export function inboxItemTime(item: { createdAt: string; lastRemindedAt?: string | null }): string {
  return item.lastRemindedAt ?? item.createdAt;
}
