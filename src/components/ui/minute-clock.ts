/**
 * One shared minute clock for every `RelativeTime` on the page. Each instance used to run its own 60s interval,
 * so a 500-row desk ran 500 timers; now a single interval runs while at least one subscriber exists and the tab
 * is visible, and a hidden tab catches up the moment it is shown again. Shaped for `React.useSyncExternalStore`.
 */
export const MINUTE_MS = 60_000;

type Listener = () => void;

const listeners = new Set<Listener>();
let now: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function doc(): Document | null {
  return typeof document === "undefined" ? null : document;
}

function hidden() {
  return doc()?.visibilityState === "hidden";
}

function tick() {
  now = Date.now();
  for (const listener of [...listeners]) listener();
}

function stop() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function start() {
  if (timer !== null || hidden()) return;
  timer = setInterval(tick, MINUTE_MS);
}

function onVisibility() {
  if (hidden()) return stop();
  tick();
  start();
}

export function subscribeMinuteClock(listener: Listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    doc()?.addEventListener("visibilitychange", onVisibility);
    // The reading was cleared when the last subscriber left, so a remounted list never shows a stale "2 minutes ago".
    tick();
    start();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stop();
    now = null;
    doc()?.removeEventListener("visibilitychange", onVisibility);
  };
}

/** The last shared reading; `null` until something subscribes, so a first paint shows the exact date. */
export function minuteClockSnapshot() {
  return now;
}

/** Server render and hydration show the exact date, so hydration never disagrees with the clock. */
export function minuteClockServerSnapshot(): number | null {
  return null;
}

const formatters = new Map<string, Intl.RelativeTimeFormat>();

/** One `Intl.RelativeTimeFormat` per language instead of one per row per render. */
export function relativeTimeFormatter(language: string) {
  let formatter = formatters.get(language);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    formatters.set(language, formatter);
  }
  return formatter;
}
