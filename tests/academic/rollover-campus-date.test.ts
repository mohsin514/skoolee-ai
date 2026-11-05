import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calendarDateIn } from "../../src/lib/datetime";

// SKAI-1413: rollover opens on the campus calendar date on both the server gate and the review UI.
const lib = readFileSync("src/lib/academic/rollover.ts", "utf8");
const ui = readFileSync("src/components/academic/rollover-review.tsx", "utf8");

test("the campus date differs from UTC at the boundaries the gate must respect", () => {
  const instant = new Date("2026-08-31T20:30:00Z");
  assert.equal(instant.toISOString().slice(0, 10), "2026-08-31");
  assert.equal(calendarDateIn("Asia/Dubai", instant), "2026-09-01");
  assert.equal(calendarDateIn("America/Los_Angeles", new Date("2026-09-01T03:00:00Z")), "2026-08-31");
});

test("the server gates execution and corrections on the campus date, never UTC", () => {
  assert.doesNotMatch(lib, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(lib, /const today = async \(schoolId: string, campusId: string\) => dateOnly\(await schoolToday\(schoolId, campusId\)\)/);
  assert.match(lib, /plan\.effectiveDate > await today\(plan\.schoolId, plan\.campusId\)/);
  assert.match(lib, /effectiveDate > await today\(plan\.schoolId, plan\.campusId\)\) throw/);
  assert.match(lib, /const base = \{ today: await schoolToday\(user\.schoolId, campusId\),/);
});

test("the review page defaults its dates to the campus date the server returns", () => {
  assert.match(ui, /else if \(json\.data\.today && !dateTouched\.current\) setEffectiveDate\(json\.data\.today\)/);
  assert.match(ui, /setCorrection\(current => current\.reason \? current : \{ \.\.\.current, date: json\.data\.today \}\)/);
});
