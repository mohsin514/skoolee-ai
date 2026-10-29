import assert from "node:assert/strict";
import test from "node:test";
import { assertWeekendCurrent, parseWeekendDays, previewWindow, weekendImpact } from "../../src/lib/academic/weekend-rules";

const status = (fn: () => unknown) => { try { fn(); return 0; } catch (error) { return (error as { status?: number }).status; } };

test("SKAI-118 weekend input: Fri–Sat, Sat–Sun and Sunday-only are valid; bad sets are rejected", () => {
  assert.deepEqual(parseWeekendDays([6, 5]), [5, 6]);
  assert.deepEqual(parseWeekendDays(["7", 6]), [6, 7]);
  assert.deepEqual(parseWeekendDays([7]), [7]);
  assert.equal(status(() => parseWeekendDays([])), 400);
  assert.equal(status(() => parseWeekendDays("5,6")), 400);
  assert.equal(status(() => parseWeekendDays([0])), 400);
  assert.equal(status(() => parseWeekendDays([8])), 400);
  assert.equal(status(() => parseWeekendDays([1.5])), 400);
  assert.equal(status(() => parseWeekendDays([6, 6])), 400);
  assert.equal(status(() => parseWeekendDays([1, 2, 3, 4, 5, 6, 7])), 400);
});

test("SKAI-118 stale guard: a different saved weekend is a 409; omitting expected stays compatible", () => {
  assert.equal(status(() => assertWeekendCurrent(undefined, [6, 7])), 0);
  assert.equal(status(() => assertWeekendCurrent([7, 6], [6, 7])), 0);
  assert.equal(status(() => assertWeekendCurrent([5, 6], [6, 7])), 409);
  assert.equal(status(() => assertWeekendCurrent("6,7", [6, 7])), 409);
});

test("SKAI-118 impact: Sat–Sun to Fri–Sat over two weeks flips Fridays and Sundays", () => {
  // 2026-11-02 is a Monday.
  const impact = weekendImpact([6, 7], [5, 6], "2026-11-02", "2026-11-15");
  assert.equal(impact.newlyClosed, 2);
  assert.deepEqual(impact.closedSamples, ["2026-11-06", "2026-11-13"]);
  assert.equal(impact.newlyOpened, 2);
  assert.deepEqual(impact.openedSamples, ["2026-11-08", "2026-11-15"]);
  assert.equal(impact.holidayDaysOnNewWeekend, 0);
});

test("SKAI-118 impact: holidays are not double-counted and are reported when they land on the new weekend", () => {
  const impact = weekendImpact([6, 7], [5, 6], "2026-11-02", "2026-11-15", [{ fromDate: "2026-11-13", toDate: "2026-11-15" }]);
  assert.equal(impact.newlyClosed, 1);
  assert.equal(impact.holidayDaysOnNewWeekend, 1);
  assert.equal(impact.newlyOpened, 1); // 15 Nov stays a holiday, so it does not reopen.
  assert.equal(weekendImpact([6, 7], [6, 7], "2026-11-02", "2026-11-15").newlyClosed, 0);
});

test("SKAI-118 preview window: ends with the academic year, else a year ahead, and is capped", () => {
  assert.deepEqual(previewWindow("2026-10-30", new Date("2027-06-30T00:00:00Z")), { from: "2026-10-30", to: "2027-06-30" });
  assert.deepEqual(previewWindow("2026-10-30", new Date("2025-06-30T00:00:00Z")), { from: "2026-10-30", to: "2027-10-29" });
  assert.equal(weekendImpact([7], [6, 7], "2026-01-01", "2030-01-01").to, "2027-02-04");
});
