// SKAI-1746: Today must report the full open-work total and keep overdue-first priority, so the card can
// show "Showing N of M" and a "See all work" link instead of silently hiding items after the cap.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { todayWorkList, TODAY_WORK_LIMIT, type TodayWork } from "@/lib/student/today";

const item = (i: number, overdue = false): TodayWork => ({ id: `a${i}`, title: `Assignment ${i}`, state: "OPEN", dueAt: new Date(Date.UTC(2026, 10, 10 + i)).toISOString(), dueLocal: "", extended: false, overdue, canSubmit: true, draftSavedAt: null, href: `/student/assignments?open=a${i}&from=today` });

test("7 open items: all listed, total is 7, overdue first", () => {
  const open = Array.from({ length: 7 }, (_, i) => item(i + 1, i === 6));
  const overdue = open.filter(w => w.overdue);
  const { work, workTotal } = todayWorkList(open, overdue);
  assert.equal(workTotal, 7);
  assert.equal(work.length, 7);
  assert.equal(work[0].id, "a7");
});

test("21 open items: list is capped but the total stays accurate and ordering stable", () => {
  const open = Array.from({ length: 21 }, (_, i) => item(i + 1, i >= 19));
  const overdue = open.filter(w => w.overdue);
  const { work, workTotal } = todayWorkList(open, overdue);
  assert.equal(workTotal, 21);
  assert.equal(work.length, TODAY_WORK_LIMIT);
  assert.deepEqual(work.slice(0, 3).map(w => w.id), ["a20", "a21", "a1"]);
  assert.equal(new Set(work.map(w => w.id)).size, work.length);
});

test("Today card shows a total and a See all route when work exceeds what is shown", () => {
  const src = readFileSync("src/components/student/student-today.tsx", "utf8");
  assert.match(src, /data-today-work-more/);
  assert.match(src, /href="\/student\/assignments\?from=today"/);
  assert.match(src, /Showing \{0\} of \{1\} open items/);
});

test("Today stays a student-only read model (staff are denied)", () => {
  const src = readFileSync("src/lib/student/today.ts", "utf8");
  assert.match(src, /listed\.mode === "staff"\) throw new ApiError\("Today is for a student's own account\.", 403\)/);
});
