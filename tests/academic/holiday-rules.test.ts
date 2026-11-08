import assert from "node:assert/strict";
import test from "node:test";
import { expandRecurring, outsideAcademicYears, overlapMessage, parseHolidayInput } from "../../src/lib/academic/holiday-rules";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const status = (fn: () => unknown) => { try { fn(); return 0; } catch (error) { return (error as { status?: number }).status; } };

test("SKAI-145 holiday input: required name, real ordered dates, bounded span and repeat", () => {
  const ok = parseHolidayInput({ name: "  Eid   break ", fromDate: "2026-12-30", toDate: "2027-01-02", repeatYears: 2 });
  assert.equal(ok.name, "Eid break");
  assert.equal(ok.repeatYears, 2);
  assert.equal(ok.allCampuses, false);
  assert.equal(status(() => parseHolidayInput({ name: "", fromDate: "2026-01-01", toDate: "2026-01-01" })), 400);
  assert.equal(status(() => parseHolidayInput({ name: "x".repeat(121), fromDate: "2026-01-01", toDate: "2026-01-01" })), 400);
  assert.equal(status(() => parseHolidayInput({ name: "Bad", fromDate: "2026-02-30", toDate: "2026-03-01" })), 400);
  assert.equal(status(() => parseHolidayInput({ name: "Rev", fromDate: "2026-03-02", toDate: "2026-03-01" })), 400);
  assert.equal(status(() => parseHolidayInput({ name: "Long", fromDate: "2026-01-01", toDate: "2026-04-03" })), 400);
  assert.equal(status(() => parseHolidayInput({ name: "Ok", fromDate: "2026-01-01", toDate: "2026-04-02" })), 0);
  assert.equal(status(() => parseHolidayInput({ name: "Rep", fromDate: "2026-01-01", toDate: "2026-01-01", repeatYears: 5 })), 400);
  assert.equal(status(() => parseHolidayInput({ name: "Rep", fromDate: "2026-01-01", toDate: "2026-01-01", repeatYears: 1.5 })), 400);
});

test("SKAI-145 recurring holidays copy yearly and skip 29 February where it does not exist", () => {
  const multi = expandRecurring({ start: d("2026-12-30"), end: d("2027-01-02") }, 2).map(r => [r.start.toISOString().slice(0, 10), r.end.toISOString().slice(0, 10)]);
  assert.deepEqual(multi, [["2026-12-30", "2027-01-02"], ["2027-12-30", "2028-01-02"], ["2028-12-30", "2029-01-02"]]);
  assert.equal(expandRecurring({ start: d("2028-02-29"), end: d("2028-02-29") }, 4).length, 2);
});

test("SKAI-145 overlap and academic-year bounds", () => {
  assert.equal(overlapMessage([]), null);
  assert.match(overlapMessage([{ name: "Winter", fromDate: d("2026-12-20"), toDate: d("2026-12-31") }])!, /Winter.*2026-12-20 to 2026-12-31/);
  const range = { start: d("2026-12-20"), end: d("2026-12-31") };
  assert.equal(outsideAcademicYears(range, []), false, "undated campus is not blocked");
  assert.equal(outsideAcademicYears(range, [{ startDate: null, endDate: null }]), false);
  assert.equal(outsideAcademicYears(range, [{ startDate: d("2026-08-01"), endDate: d("2027-06-30") }]), false);
  assert.equal(outsideAcademicYears(range, [{ startDate: d("2026-08-01"), endDate: d("2026-12-25") }]), true);
});
