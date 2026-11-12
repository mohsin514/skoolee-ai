/** SKAI-1829: focus and route changes within this window reuse the last sidebar badge counts instead of refetching. */
export const NAVIGATION_COUNTS_REFRESH_MS = 30_000;

/** Whether the shell should refetch /api/navigation/counts now: always when it holds no fresh read, otherwise only
 *  once the last read is at least NAVIGATION_COUNTS_REFRESH_MS old. */
export function navigationCountsDue(lastFetchAt: number | null, now: number): boolean {
  return lastFetchAt === null || now - lastFetchAt >= NAVIGATION_COUNTS_REFRESH_MS;
}
