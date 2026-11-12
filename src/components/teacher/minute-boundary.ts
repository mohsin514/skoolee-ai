/**
 * A clock that only shows hours and minutes needs one update per minute, on the minute. This schedules each
 * tick for the next minute boundary, runs nothing while the tab is hidden, and catches up the moment the tab is
 * shown again. Returns the cleanup for `useEffect`.
 */
export const MINUTE_MS = 60_000;

export function msToNextMinute(nowMs: number) {
  return MINUTE_MS - (nowMs % MINUTE_MS);
}

export function subscribeMinuteBoundary(onTick: () => void) {
  const doc = typeof document === "undefined" ? null : document;
  const hidden = () => doc?.visibilityState === "hidden";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    stop();
    if (hidden()) return;
    timer = setTimeout(() => {
      timer = null;
      onTick();
      schedule();
    }, msToNextMinute(Date.now()));
  };
  const onVisibility = () => {
    if (hidden()) return stop();
    onTick();
    schedule();
  };

  doc?.addEventListener("visibilitychange", onVisibility);
  schedule();
  return () => {
    stop();
    doc?.removeEventListener("visibilitychange", onVisibility);
  };
}
