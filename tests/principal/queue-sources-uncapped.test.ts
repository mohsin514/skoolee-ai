import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync("src/lib/principal/queue.ts", "utf8");
const sources = src.slice(0, src.indexOf("const resolved = await prisma.queueItemState.findMany("));

test("SKAI-1744: no queue source collector caps unresolved rows before counts are built", () => {
  for (const marker of ["db.leaveRequest.findMany(", "db.parentCommunication.findMany(", "db.correction.findMany(", "kind: \"CURRICULUM\", status: \"IN_REVIEW\"", "db.examPaperSlot.findMany(", "status: \"PRINCIPAL_REVIEWED\""]) {
    const lines = sources.split("\n").filter(row => row.includes(marker));
    assert.ok(lines.length, marker);
    for (const line of lines) assert.doesNotMatch(line, /take: (50|100|200)\b/, marker);
  }
});

test("SKAI-1744: counts come from the full merged queue and every source keeps its scope", () => {
  assert.match(src, /counts: \{ active: queue\.filter\(i => !i\.snoozed\)\.length, overdue: queue\.filter\(i => i\.overdue\)\.length/);
  const scoped = sources.split("\n").filter(row => /await db\.\w+\.findMany\(\{ where: \{ \.\.\.scope,/.test(row));
  assert.ok(scoped.length >= 7, "every source collector filters by the campus scope");
  assert.match(src, /const settleable = settled\.filter\(state => !\(campus\.failed as string\[\]\)\.includes/, "failed feeds still never settle");
});
