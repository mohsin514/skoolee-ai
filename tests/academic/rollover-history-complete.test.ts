import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PLAN_HISTORY_PAGE, planHistoryPage } from "../../src/lib/academic/plan-history";
import { arabicWorkflowUi, urduWorkflowUi } from "../../src/lib/locale/workflow-ui-messages";

const src = readFileSync("src/lib/academic/rollover.ts", "utf8");
const ui = readFileSync("src/components/academic/rollover-review.tsx", "utf8");

test("SKAI-1745: plan history query returns every event of the plan, newest first", () => {
  const line = src.split("\n").find(row => row.includes("const events = await prisma.rolloverEvent.findMany(")) ?? "";
  assert.ok(line, "events query present");
  assert.doesNotMatch(line, /take:/, "no 30-event cap");
  assert.match(line, /where: \{ planId: plan\.id \}/, "scoped to the plan the viewer already opened");
  assert.match(line, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/, "deterministic order");
});

test("SKAI-1745: 75 events page by 30 and the oldest event stays reachable", () => {
  const events = Array.from({ length: 75 }, (_, i) => ({ id: `e${75 - i}` })); // newest first; e1 is the oldest
  let shown = PLAN_HISTORY_PAGE, page = planHistoryPage(events, shown), pages = 1;
  assert.deepEqual([page.visible.length, page.total, page.remaining], [30, 75, 45]);
  assert.ok(!page.visible.some(e => e.id === "e1"), "first page is truncated, and says so via remaining");
  while (page.remaining) { shown = page.visible.length + PLAN_HISTORY_PAGE; page = planHistoryPage(events, shown); pages++; }
  assert.equal(pages, 3);
  assert.equal(page.visible.at(-1)?.id, "e1", "oldest event reachable");
  assert.deepEqual(page.visible.map(e => e.id), events.map(e => e.id), "order preserved, nothing skipped or repeated");
  assert.deepEqual(planHistoryPage(events.slice(0, 31), 30).remaining, 1, "event 31 is counted, never silent");
  assert.deepEqual(planHistoryPage([], 30), { visible: [], total: 0, remaining: 0 });
});

test("SKAI-1745: UI shows total/remaining, a Load older control and focuses the first older event", () => {
  assert.match(ui, /planHistoryPage\(view\.events, historyShown\)/);
  assert.match(ui, /aria-live="polite" data-events-total=\{h\.total\}/);
  assert.match(ui, /data-events-older/);
  assert.match(ui, /historyFocus\.current = view\.events\?\.\[h\.visible\.length\]/);
  for (const key of ["Showing {0} of {1} plan events, newest first", "Load older events ({0} more)", "All {0} plan events are shown."]) {
    assert.ok(arabicWorkflowUi[key] && urduWorkflowUi[key], `${key} has AR and UR`);
  }
});
