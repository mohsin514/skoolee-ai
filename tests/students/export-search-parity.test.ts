import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rosterSearchWhere } from "@/lib/students/roster-status";

test("SKAI-1526: the shared roster search covers admission number and ID", () => {
  const fields = rosterSearchWhere("ADM-SYNTH-0042").OR.map(clause => Object.keys(clause)[0]);
  assert.deepEqual(fields, ["id", "admissionNo", "fullName", "rollNo", "guardianName", "guardianPhone"]);
  assert.deepEqual(rosterSearchWhere("x").OR[1], { admissionNo: { contains: "x", mode: "insensitive" } });
});

test("SKAI-1526: the roster and its CSV export use the same search predicate", () => {
  for (const file of ["src/app/api/students/route.ts", "src/app/api/students/export/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /\.\.\.rosterSearchWhere\(search\),/, file);
    assert.doesNotMatch(source, /guardianPhone: \{ contains: search/, file);
  }
});
