import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARCHIVED_STUDENT_STATUSES, rosterStatusWhere } from "@/lib/students/roster-status";

test("SKAI-1480: archived records include consolidated identity aliases", () => {
  assert.deepEqual(rosterStatusWhere(true), { status: { in: ARCHIVED_STUDENT_STATUSES } });
  assert.ok(ARCHIVED_STUDENT_STATUSES.includes("consolidated"));
  assert.deepEqual(rosterStatusWhere(false), { status: { notIn: ARCHIVED_STUDENT_STATUSES } });
});

test("SKAI-1480: the roster and its CSV export share one lifecycle predicate", () => {
  for (const file of ["src/app/api/students/route.ts", "src/app/api/students/export/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /\.\.\.rosterStatusWhere\(archivedOnly\),/, file);
    assert.doesNotMatch(source, /status: \{ in: \["inactive", "archived", "transferred", "graduated"/, file);
  }
});
