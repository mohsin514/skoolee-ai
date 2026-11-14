import { test } from "node:test";
import assert from "node:assert/strict";
import { indexRows, mergeTimetableYear, timetableListUrl, timetableLoadYear } from "../../src/lib/timetable/year-load";

// SKAI-1966: the editors list years from the slot-free index and swap in one year's full rows.
type Row = { id: string; academicYear: number; slots: string[] };
const now = new Date("2026-11-14T00:00:00Z");

test("the list URL carries the campus and the mode", () => {
  assert.equal(timetableListUrl("c 1", { view: "index" }), "/api/timetable?campusId=c+1&view=index");
  assert.equal(timetableListUrl(undefined, { academicYear: 2026 }), "/api/timetable?academicYear=2026");
});

test("the load year keeps a still-listed previous year, else uses the default", () => {
  const index = [{ academicYear: 2024 }, { academicYear: 2026 }];
  const classes = [{ academicYear: 2027 }];
  assert.equal(timetableLoadYear(index, classes, null, now), 2026);
  assert.equal(timetableLoadYear(index, classes, 2024, now), 2024);
  assert.equal(timetableLoadYear(index, classes, 2027, now), 2027);
  assert.equal(timetableLoadYear(index, classes, 2019, now), 2026);
  assert.equal(timetableLoadYear([], [], null, now), 2026);
});

test("merging replaces one year's index rows and keeps the others and their order", () => {
  const index = indexRows<Row>([{ id: "new", academicYear: 2026 }, { id: "old", academicYear: 2025 }, { id: "mid", academicYear: 2026 }]);
  assert.deepEqual(index.map(row => row.slots), [[], [], []]);
  const merged = mergeTimetableYear(index, 2026, [{ id: "added", academicYear: 2026, slots: ["s"] }, { id: "new", academicYear: 2026, slots: ["a"] }, { id: "mid", academicYear: 2026, slots: ["b"] }]);
  assert.deepEqual(merged.map(row => [row.id, row.slots]), [["added", ["s"]], ["new", ["a"]], ["old", []], ["mid", ["b"]]]);
});

test("a row gone from the year's full list is dropped", () => {
  const index = indexRows<Row>([{ id: "gone", academicYear: 2026 }, { id: "old", academicYear: 2025 }]);
  assert.deepEqual(mergeTimetableYear(index, 2026, []).map(row => row.id), ["old"]);
});
