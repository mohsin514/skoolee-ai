import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { settledChildScope } from "../../src/app/parent/selected-child-storage";

// SKAI-1934: the family timetable pages load each panel once, not once unscoped and again for the child.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("no child yet and the family load in flight: the panels wait", () => {
  assert.equal(settledChildScope(null, true), undefined);
});

test("a known child is used at once, even while the family payload reloads", () => {
  assert.equal(settledChildScope("kid-1", true), "kid-1");
  assert.equal(settledChildScope("kid-1", false), "kid-1");
});

test("a settled load with no child (no linked child, failed load) still lets the panels load unscoped", () => {
  assert.equal(settledChildScope(null, false), null);
});

test("the parent timetable gates its timetable, exam brief and next paper on the settled child", () => {
  const page = read("src/app/parent/timetable/page.tsx");
  assert.match(page, /settledChildScope\(activeId, familyLoading\)/);
  assert.match(page, /if \(!scopeSettled\) return;/);
  assert.match(page, /\{scopeSettled \? \(\s*<>\s*<FamilyExamBrief/);
});

test("the student timetable hands its calendar off days to the date sheet instead of a second calendar fetch", () => {
  const page = read("src/app/student/timetable/page.tsx");
  assert.equal(page.match(/\/api\/academic\/calendar/g)?.length, 1);
  assert.match(page, /<ExamDateSheet classId=\{data\?\.classId\} weekends=\{weekendDays\} \/>/);
  const sheet = read("src/components/timetable/ExamDateSheet.tsx");
  assert.match(sheet, /ownCalendar \? fetch\(`\/api\/academic\/calendar\$\{qp\}`\)/);
});
