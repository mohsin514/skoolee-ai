import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
// The clock reads `document` only when something subscribes, so the fake page below is in place in time.
import { MINUTE_MS, minuteClockServerSnapshot, minuteClockSnapshot, relativeTimeFormatter, subscribeMinuteClock } from "../../src/components/ui/minute-clock";

// A minimal page: visibility state plus the visibilitychange listeners the clock registers.
const visibility = { state: "visible" as DocumentVisibilityState, listeners: new Set<() => void>() };
(globalThis as { document?: unknown }).document = {
  get visibilityState() { return visibility.state; },
  addEventListener: (_: string, fn: () => void) => visibility.listeners.add(fn),
  removeEventListener: (_: string, fn: () => void) => visibility.listeners.delete(fn),
};
function setVisibility(state: DocumentVisibilityState) {
  visibility.state = state;
  for (const fn of [...visibility.listeners]) fn();
}


test("500 timestamps share one interval and each re-renders once a minute", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: 1_000_000 });
  let intervals = 0;
  const realSetInterval = globalThis.setInterval;
  t.mock.method(globalThis, "setInterval", ((...args: Parameters<typeof setInterval>) => { intervals += 1; return realSetInterval(...args); }) as typeof setInterval);

  assert.equal(minuteClockSnapshot(), null, "nothing subscribed yet: first paint shows the exact date");
  const calls = new Array(500).fill(0);
  const unsubscribe = calls.map((_, row) => subscribeMinuteClock(() => { calls[row] += 1; }));
  assert.equal(intervals, 1, "one timer for the whole page, not one per row");
  assert.equal(minuteClockSnapshot(), 1_000_000);

  calls.fill(0);
  t.mock.timers.tick(MINUTE_MS);
  assert.equal(minuteClockSnapshot(), 1_000_000 + MINUTE_MS);
  assert.ok(calls.every((count) => count === 1), "every row hears the minute exactly once");

  unsubscribe.forEach((off) => off());
  calls.fill(0);
  t.mock.timers.tick(MINUTE_MS * 3);
  assert.ok(calls.every((count) => count === 0), "the timer stops when the last row unmounts");
  assert.equal(minuteClockSnapshot(), null, "a later mount starts from the exact date again, never a stale reading");
  assert.equal(visibility.listeners.size, 0);
});

test("the clock pauses while the tab is hidden and catches up when shown", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: 5_000_000 });
  let ticks = 0;
  const off = subscribeMinuteClock(() => { ticks += 1; });
  ticks = 0;

  setVisibility("hidden");
  t.mock.timers.tick(MINUTE_MS * 10);
  assert.equal(ticks, 0, "no work while hidden");

  setVisibility("visible");
  assert.equal(ticks, 1, "shown again: one immediate catch-up");
  assert.equal(minuteClockSnapshot(), 5_000_000 + MINUTE_MS * 10);
  t.mock.timers.tick(MINUTE_MS);
  assert.equal(ticks, 2, "and the minute timer runs again");
  off();
});

test("a tab that is hidden when the first row mounts starts no timer until shown", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: 9_000_000 });
  visibility.state = "hidden";
  let ticks = 0;
  const off = subscribeMinuteClock(() => { ticks += 1; });
  ticks = 0;
  t.mock.timers.tick(MINUTE_MS * 5);
  assert.equal(ticks, 0);
  setVisibility("visible");
  t.mock.timers.tick(MINUTE_MS);
  assert.equal(ticks, 2);
  off();
});

test("server render has no clock, and formatters are built once per language", () => {
  assert.equal(minuteClockServerSnapshot(), null);
  assert.equal(relativeTimeFormatter("en"), relativeTimeFormatter("en"));
  assert.notEqual(relativeTimeFormatter("en"), relativeTimeFormatter("ar"));
  assert.equal(relativeTimeFormatter("en").format(-2, "day"), new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-2, "day"));
  assert.equal(relativeTimeFormatter("ar").format(1, "hour"), new Intl.RelativeTimeFormat("ar", { numeric: "auto" }).format(1, "hour"));
});

test("RelativeTime reads the shared clock instead of running its own interval", () => {
  const desk = readFileSync("src/components/ui/desk.tsx", "utf8");
  const body = desk.slice(desk.indexOf("export function RelativeTime"), desk.indexOf("export function DeskQuickFilter"));
  assert.match(body, /useSyncExternalStore\(subscribeMinuteClock, minuteClockSnapshot, minuteClockServerSnapshot\)/);
  assert.match(body, /relativeTimeFormatter\(language\)/);
  assert.doesNotMatch(body, /setInterval|new Intl\.RelativeTimeFormat/);
});
