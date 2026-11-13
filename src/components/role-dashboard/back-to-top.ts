/** Scrolled this far down a workspace page, a Back to top button is offered. */
export const BACK_TO_TOP_AFTER = 640;

/**
 * Room the floating button needs at the bottom of the scroll area: its 16px offset, its height and a margin.
 * Within this distance of the end, the page's last controls (a list pager, a form's actions) sit where the button
 * would float, so it stands aside instead of covering them (SKAI-1930).
 */
export const BACK_TO_TOP_END_ROOM = 96;

export function shouldShowBackToTop({ scrollTop, scrollHeight, clientHeight }: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  if (scrollTop <= BACK_TO_TOP_AFTER) return false;
  return scrollHeight - clientHeight - scrollTop > BACK_TO_TOP_END_ROOM;
}
