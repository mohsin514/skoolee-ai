import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1607: analytics attendance for a year stops at the end of that year.
test("the attendance filter has a UTC start and an exclusive next-year end", () => {
  const src = readFileSync("src/app/api/analytics/route.ts", "utf8");
  assert.match(src, /date: \{ gte: new Date\(Date\.UTC\(academicYear, 0, 1\)\), lt: new Date\(Date\.UTC\(academicYear \+ 1, 0, 1\)\) \}/);
  const gte = new Date(Date.UTC(2025, 0, 1)), lt = new Date(Date.UTC(2026, 0, 1));
  const inYear = (d: string) => new Date(d) >= gte && new Date(d) < lt;
  assert.deepEqual(["2025-01-01", "2025-04-01", "2025-12-31", "2026-01-01", "2026-04-01"].map(inYear), [true, true, true, false, false]);
});
