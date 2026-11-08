import assert from "node:assert/strict";
import test from "node:test";
import { getYearClosureReport } from "../../src/lib/academic/year-closure";

// SKAI-1289: a downstream step is only done when its work exists, never because its candidate set is empty.
function fakeDb(exams: { status: string; reportCards: number }[], reportCards = 0) {
  return {
    exam: { findMany: async () => exams.map((e, i) => ({ id: `e${i}`, title: `Final ${i}`, status: e.status, _count: { reportCards: e.reportCards } })) },
    reportCard: { count: async () => reportCards },
  } as never;
}
const step = (r: Awaited<ReturnType<typeof getYearClosureReport>>, id: string) => r.steps.find((s) => s.id === id)!;

test("exams still in marks entry leave report cards and principal approval pending", async () => {
  const r = await getYearClosureReport("cmp", 2026, fakeDb([{ status: "ACTIVE", reportCards: 0 }, { status: "MARKS_ENTRY", reportCards: 0 }]));
  assert.equal(r.canClose, false);
  assert.deepEqual([step(r, "report-cards").done, step(r, "report-cards").outstanding], [false, 2]);
  assert.deepEqual([step(r, "principal-approved").done, step(r, "principal-approved").outstanding], [false, 2]);
  assert.doesNotMatch(step(r, "principal-approved").detail, /signed off/);
});

test("a locked exam with report cards still waits for the principal", async () => {
  const r = await getYearClosureReport("cmp", 2026, fakeDb([{ status: "LOCKED", reportCards: 30 }], 30));
  assert.equal(step(r, "report-cards").done, true);
  assert.equal(step(r, "principal-approved").done, false);
});

test("reviewed and published exams with report cards complete every step", async () => {
  const r = await getYearClosureReport("cmp", 2026, fakeDb([{ status: "PRINCIPAL_REVIEWED", reportCards: 5 }, { status: "PUBLISHED", reportCards: 5 }], 10));
  assert.equal(step(r, "report-cards").done, true);
  assert.equal(step(r, "principal-approved").done, true);
  assert.equal(step(r, "results-released").done, false);
});

test("a year with no exams completes nothing", async () => {
  const r = await getYearClosureReport("cmp", 2026, fakeDb([]));
  assert.equal(r.canClose, false);
  assert.ok(r.steps.every((s) => !s.done));
});
