import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rosterStatusWhere } from "@/lib/students/roster-status";

const source = readFileSync("src/app/actions/dashboard.ts", "utf8");

test("SKAI-1496: network campus rows count and chart only on-roll pupils", () => {
  const block = source.slice(source.indexOf("// SKAI-1496"), source.indexOf("// SKAI-1496") + 1500);
  assert.match(block, /students: \{\s*where: ON_ROLL,\s*select: \{/);
  assert.match(block, /students: \{ where: ON_ROLL \},/);
});

test("SKAI-1496: ON_ROLL excludes every off-roll lifecycle state", () => {
  const notIn = (rosterStatusWhere(false) as { status: { notIn: string[] } }).status.notIn;
  for (const status of ["inactive", "archived", "transferred", "graduated", "consolidated"]) assert.ok(notIn.includes(status), status);
  assert.ok(!notIn.includes("active"));
});
