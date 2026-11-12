import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rosterStatusWhere } from "@/lib/students/roster-status";

const source = readFileSync("src/app/actions/dashboard.ts", "utf8");

test("SKAI-1496: network campus rows count and chart only on-roll pupils", () => {
  assert.match(source, /_count: \{\s*select: \{[\s\S]*?students: \{ where: ON_ROLL \},/);
  // SKAI-1856: the charts are counted in the database, with the same on-roll and live-campus rules.
  const block = source.slice(source.indexOf("// SKAI-1496"), source.indexOf("// SKAI-1496") + 1500);
  assert.match(block, /prisma\.student\.groupBy\(\{[\s\S]*?where: \{ schoolId: session\.schoolId, \.\.\.ON_ROLL, campus: \{ archivedAt: null \} \}/);
  const latest = source.slice(source.indexOf("function latestReportCardTotals"), source.indexOf("function campusAverageScore"));
  assert.match(latest, /s\.status <> ALL\(\$\{ARCHIVED_STUDENT_STATUSES\}::text\[\]\)/);
  assert.match(latest, /c\.archived_at IS NULL/);
  assert.match(latest, /rc\.school_id = \$\{schoolId\}/);
});

test("SKAI-1496: ON_ROLL excludes every off-roll lifecycle state", () => {
  const notIn = (rosterStatusWhere(false) as { status: { notIn: string[] } }).status.notIn;
  for (const status of ["inactive", "archived", "transferred", "graduated", "consolidated"]) assert.ok(notIn.includes(status), status);
  assert.ok(!notIn.includes("active"));
});
