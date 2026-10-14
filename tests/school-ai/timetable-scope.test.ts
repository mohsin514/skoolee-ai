import assert from "node:assert/strict";
import test from "node:test";
import { scopeTimetables, timetablePeriods, timetableTermsOverlap } from "../../src/lib/timetable/view-scope";
import { timetableScopeCopy, addPeriodCopy } from "../../src/lib/timetable/editor-copy";

test("exact class schedules and overlapping resource schedules keep their selected year and term", () => {
  const records = [{ id: "first", academicYear: 2026, term: "TERM_1" }, { id: "second", academicYear: 2026, term: "TERM_2" }, { id: "annual", academicYear: 2026, term: "ANNUAL" }, { id: "legacy", academicYear: 2026, term: "Autumn" }, { id: "old", academicYear: 2025, term: "TERM_2" }];
  assert.deepEqual(scopeTimetables(records, 2026, "TERM_2").map(item => item.id), ["second"]);
  assert.deepEqual(scopeTimetables(records, 2026, "TERM_2", true).map(item => item.id), ["second", "annual", "legacy"]);
  assert.equal(timetableTermsOverlap("TERM_1", "TERM_2"), false);
  assert.equal(timetableTermsOverlap("Autumn", "TERM_2"), true);
  assert.equal(timetableTermsOverlap("ANNUAL", "TERM_2"), true);
});
test("stored schedule times remain visible when campus defaults differ and missing rows are still offered", () => {
  assert.deepEqual(timetablePeriods([{ periodNumber: 1, startTime: "09:00", endTime: "09:45", slotType: "CLASS" }], [{ periodNumber: 1, startTime: "08:00", endTime: "08:40" }, { periodNumber: 2, startTime: "08:40", endTime: "09:20" }]), [{ num: 1, start: "09:00", end: "09:45", type: "CLASS" }, { num: 2, start: "08:40", end: "09:20", type: "CLASS" }]);
});
test("timetable scope, unsaved-change prompts and period errors are translated in Arabic and Urdu", () => {
  for (const language of ["ar", "ur"] as const) for (const dictionary of [timetableScopeCopy(language), addPeriodCopy(language)]) for (const value of Object.values(dictionary)) assert.match(value, /[\u0600-\u06ff]/);
});
