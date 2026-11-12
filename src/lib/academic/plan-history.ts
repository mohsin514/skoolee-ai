// SKAI-1745: plan history is shown a page at a time, newest first, with the total and the
// remaining count always visible, so a long plan never looks complete when it is not.
export const PLAN_HISTORY_PAGE = 30;

export function planHistoryPage<T>(events: readonly T[], shown: number) {
  const total = events.length;
  const visible = events.slice(0, Math.min(Math.max(shown, PLAN_HISTORY_PAGE), total));
  return { visible, total, remaining: total - visible.length };
}
