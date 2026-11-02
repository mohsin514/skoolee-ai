import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1609: class performance groups each report by its exam's class, so a later move does not rewrite history.
test("classPerformance attributes a report to its exam's class first", () => {
  const src = readFileSync("src/app/api/analytics/route.ts", "utf8");
  assert.match(src, /const examClass = new Map\(exams\.map\(\(e\) => \[e\.id, e\.classId\]\)\);/);
  assert.match(src, /const classId = examClass\.get\(r\.examId\) \?\? r\.student\.classId;/);
});
