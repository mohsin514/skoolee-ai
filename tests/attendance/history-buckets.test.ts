import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketHistory, HISTORY_STATUSES } from "@/lib/attendance/history-buckets";

const day = new Date("2026-10-20T00:00:00.000Z");

test("late, excused and partial are counted, and buckets sum to total", () => {
  const [row] = bucketHistory([
    { date: day, status: "LATE", _count: 1 },
    { date: day, status: "EXCUSED", _count: 1 },
    { date: day, status: "PARTIAL", _count: 1 },
  ]);
  assert.deepEqual(row, { date: "2026-10-20", present: 0, absent: 0, leave: 0, late: 1, excused: 1, partial: 1, total: 3 });
});

test("all six statuses have a bucket", () => {
  const [row] = bucketHistory(HISTORY_STATUSES.map((status, i) => ({ date: day, status, _count: i + 1 })));
  const sum = row.present + row.absent + row.leave + row.late + row.excused + row.partial;
  assert.equal(sum, row.total);
  assert.equal(row.total, 21);
});

test("dates are kept apart", () => {
  const rows = bucketHistory([
    { date: day, status: "PRESENT", _count: 2 },
    { date: new Date("2026-10-21T00:00:00.000Z"), status: "ABSENT", _count: 1 },
  ]);
  assert.equal(rows.length, 2);
});
