import { test } from "node:test";
import assert from "node:assert/strict";
import { ACADEMIC_EXAMS, ACADEMIC_SUBJECTS, PERIODS, SCHOOL_DAYS, markFor, previousMonth, studentsFor, subjectIndexFor } from "../../scripts/qa/academics-seed-plan";

test("roll and admission numbers are unique across all seeded classes", () => {
  const all = [0, 1, 2].flatMap((c) => studentsFor(c));
  assert.equal(new Set(all.map((s) => s.admissionNo)).size, all.length);
  assert.equal(new Set(all.map((s) => s.rollNo)).size, all.length); // unique per campus
});

test("timetable covers every subject each week", () => {
  const used = new Set(SCHOOL_DAYS.flatMap((d) => PERIODS.map((p) => subjectIndexFor(d, p.periodNumber))));
  assert.equal(used.size, ACADEMIC_SUBJECTS.length);
});

test("one published and one draft exam; marks within 0..100", () => {
  assert.deepEqual(ACADEMIC_EXAMS.map((e) => e.status).sort(), ["DRAFT", "PUBLISHED"]);
  for (let s = 0; s < 6; s++) for (let j = 0; j < 4; j++) { const m = markFor(s, j); assert.ok(m >= 0 && m <= 100); }
});

test("previous month wraps January to December of last year", () => {
  assert.deepEqual(previousMonth(new Date(Date.UTC(2026, 0, 15))), { month: 12, year: 2025 });
  assert.deepEqual(previousMonth(new Date(Date.UTC(2026, 10, 8))), { month: 10, year: 2026 });
});
