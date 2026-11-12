// SKAI-1876: the teacher roster re-sorted every pupil and drew every card on each keystroke, and the Today
// schedule re-rendered every second for a clock that only shows hours and minutes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MINUTE_MS, msToNextMinute, subscribeMinuteBoundary } from "../../src/components/teacher/minute-boundary";
import { ROSTER_PAGE, matchesRosterSearch, sortRoster } from "../../src/components/teacher/roster-order";

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

test("the schedule clock ticks once per minute, on the minute, instead of every second", (t) => {
  const start = 100 * MINUTE_MS + 25_000; // 25 s into a minute
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: start });
  assert.equal(msToNextMinute(start), 35_000);
  let ticks = 0;
  const off = subscribeMinuteBoundary(() => { ticks += 1; });

  t.mock.timers.tick(34_999);
  assert.equal(ticks, 0, "no re-render before the minute changes");
  t.mock.timers.tick(1);
  assert.equal(ticks, 1, "the display updates exactly when the minute turns");
  for (let second = 0; second < 3600; second += 1) t.mock.timers.tick(1000);
  assert.equal(ticks, 61, "an hour on screen is 60 renders, not 3600");

  off();
  for (let minute = 0; minute < 5; minute += 1) t.mock.timers.tick(MINUTE_MS);
  assert.equal(ticks, 61, "unmount stops the clock");
  assert.equal(visibility.listeners.size, 0, "and removes its visibility listener");
});

test("the schedule clock does no work in a hidden tab and catches up when shown", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 200 * MINUTE_MS });
  let ticks = 0;
  const off = subscribeMinuteBoundary(() => { ticks += 1; });
  setVisibility("hidden");
  for (let minute = 0; minute < 10; minute += 1) t.mock.timers.tick(MINUTE_MS);
  assert.equal(ticks, 0, "hidden: nothing runs");
  t.mock.timers.tick(7_000);
  setVisibility("visible");
  assert.equal(ticks, 1, "shown again: one immediate catch-up");
  t.mock.timers.tick(MINUTE_MS - 7_000);
  assert.equal(ticks, 2, "then back on the minute boundary");
  off();
});

const pupils = [
  { fullName: "Zara", rollNo: "10", guardianName: "Omar", guardianPhone: "0300", reportCards: [{ percentage: 70 }], cls: "B" },
  { fullName: "adam", rollNo: "2", guardianName: "Sana", guardianPhone: "0311", reportCards: [], cls: "A" },
  { fullName: "Bilal", rollNo: "1", guardianName: null, guardianPhone: null, reportCards: [{ percentage: 90 }], cls: "C" },
];
const classOf = (p: { cls: string }) => p.cls;
const names = (list: { fullName: string }[]) => list.map((p) => p.fullName);

test("roster order is unchanged: numeric roll numbers, case-insensitive names, grade and class", () => {
  assert.deepEqual(names(sortRoster(pupils, "roll", "asc", classOf)), ["Bilal", "adam", "Zara"]);
  assert.deepEqual(names(sortRoster(pupils, "roll", "desc", classOf)), ["Zara", "adam", "Bilal"]);
  assert.deepEqual(names(sortRoster(pupils, "name", "asc", classOf)), ["adam", "Bilal", "Zara"]);
  assert.deepEqual(names(sortRoster(pupils, "grade", "desc", classOf)), ["Bilal", "Zara", "adam"]);
  assert.deepEqual(names(sortRoster(pupils, "class", "asc", classOf)), ["adam", "Zara", "Bilal"]);
  assert.deepEqual(names(pupils), ["Zara", "adam", "Bilal"], "the source list is not mutated");
});

test("roster search matches name, roll number, guardian and phone as before", () => {
  assert.deepEqual(names(pupils.filter((p) => matchesRosterSearch(p, "ZAR"))), ["Zara"]);
  assert.deepEqual(names(pupils.filter((p) => matchesRosterSearch(p, "sana"))), ["adam"]);
  assert.deepEqual(names(pupils.filter((p) => matchesRosterSearch(p, "031"))), ["adam"]);
  assert.deepEqual(names(pupils.filter((p) => matchesRosterSearch(p, "1"))), ["Zara", "adam", "Bilal"]);
});

test("sorting a large roster builds no collator per keystroke", (t) => {
  const big = Array.from({ length: 2000 }, (_, i) => ({ fullName: `Pupil ${i}`, rollNo: String(2000 - i), cls: "A" }));
  const ctor = t.mock.method(Intl, "Collator");
  for (let keystroke = 0; keystroke < 5; keystroke += 1) sortRoster(big, "roll", "asc", classOf);
  assert.equal(ctor.mock.callCount(), 0);
});

test("the roster defers search and draws one page of cards; the schedule has no 1 s interval", () => {
  const page = readFileSync("src/app/teacher/students/page.tsx", "utf8");
  assert.match(page, /const deferredSearch = useDeferredValue\(search\)/);
  assert.match(page, /filtered\.slice\(0, ROSTER_PAGE\)/);
  assert.match(page, /cardStudents\.map\(/);
  assert.doesNotMatch(page, /\{filtered\.map\(/);
  assert.doesNotMatch(page, /new Intl\.Collator/);
  assert.equal(ROSTER_PAGE, 50);
  const schedule = readFileSync("src/components/teacher/today-schedule.tsx", "utf8");
  assert.doesNotMatch(schedule, /setInterval/);
  assert.match(schedule, /subscribeMinuteBoundary\(/);
});
