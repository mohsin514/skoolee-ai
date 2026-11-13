import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultTimetableYear } from "../../src/lib/timetable/view-scope";

const now = new Date("2026-11-13T00:00:00Z");

test("a future-year class does not move the default away from the current timetables", () => {
  assert.equal(defaultTimetableYear([2031, 2027, 2026], [2026], now), 2026);
});

test("without timetables the latest year not after today is chosen", () => {
  assert.equal(defaultTimetableYear([2031, 2026, 2025], [], now), 2026);
});

test("only future years falls back to the nearest one", () => {
  assert.equal(defaultTimetableYear([2031, 2028], [], now), 2028);
});

test("no years at all uses the calendar year", () => {
  assert.equal(defaultTimetableYear([], [], now), 2026);
});
