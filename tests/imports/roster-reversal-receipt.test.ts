import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/import-batches/[batchId]/route.ts", "utf8");
const create = readFileSync("src/lib/students/create.ts", "utf8");

test("SKAI-1483: commit receipts store the pupil id under result.studentId", () => {
  assert.match(create, /result: student \? \{ studentId: student\.id/);
});

test("SKAI-1483: reversal reads result.studentId, falls back to legacy rows and de-duplicates", () => {
  assert.match(route, /\.result\?\.studentId \?\? row\.studentId/);
  assert.match(route, /const studentIds = \[\.\.\.new Set\(receiptRows\.flatMap/);
  assert.match(route, /typeof id === "string" && id \? \[id\] : \[\]/);
});

test("SKAI-1483: dependency and concurrency guards are unchanged", () => {
  assert.match(route, /eligible = studentIds\.length > 0 && !dependencies\.length && !missing\.length/);
  assert.match(route, /Pupil dependencies changed during reversal; recheck before trying again/);
});
