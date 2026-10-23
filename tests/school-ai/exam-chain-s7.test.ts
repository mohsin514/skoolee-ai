import assert from "node:assert/strict";
import { test } from "node:test";
import { dayReadiness, paperReadiness, readinessDay, type ReadinessPaperInput } from "../../src/lib/academic/exam-readiness";

// SKO-506: "are we ready for <day>?" from the ledger, by one rule.
const paper = (over: Partial<ReadinessPaperInput> = {}): ReadinessPaperInput => ({
  scheduleId: "s1", label: "Grade 7 A · Science", date: "2026-11-02", startTime: "08:00", endTime: "10:00",
  published: { date: "2026-11-02", startTime: "08:00", endTime: "10:00" }, slot: { sealedAt: new Date(), deliveryKind: "PAPER" },
  printed: true, onlineSitting: false, rooms: [{ invigilated: true }], candidates: 30, seated: 30, ...over,
});

test("a fully prepared paper is ready; each gap is named by its check", () => {
  assert.equal(paperReadiness(paper()).ready, true);
  const gaps = (over: Partial<ReadinessPaperInput>) => paperReadiness(paper(over)).checks.filter(check => !check.ok).map(check => check.check);
  assert.deepEqual(gaps({ published: { date: "2026-11-03", startTime: "08:00", endTime: "10:00" } }), ["PUBLISHED"], "a live move not yet republished is not ready");
  assert.deepEqual(gaps({ slot: { sealedAt: null, deliveryKind: "PAPER" } }), ["SEALED"]);
  assert.deepEqual(gaps({ printed: false }), ["DELIVERY"]);
  assert.deepEqual(gaps({ slot: { sealedAt: new Date(), deliveryKind: "ONLINE" }, printed: false, onlineSitting: true }), [], "an online paper needs its sitting, not a print run");
  assert.deepEqual(gaps({ rooms: [{ invigilated: true }, { invigilated: false }] }), ["INVIGILATED"]);
  assert.deepEqual(gaps({ rooms: [] }), ["ROOMED", "INVIGILATED"]);
  assert.deepEqual(gaps({ seated: 29 }), ["SEATED"]);
});

test("the day is the next one with papers unless the office picks one; open exceptions are reported, not blocking", () => {
  assert.equal(readinessDay(["2026-11-05", "2026-11-02", "2026-10-30"], "2026-11-01"), "2026-11-02");
  assert.equal(readinessDay(["2026-11-05"], "2026-11-01", "2026-11-05"), "2026-11-05");
  assert.equal(readinessDay(["2026-10-30"], "2026-11-01"), null);
  const day = dayReadiness([paper(), paper({ scheduleId: "s2", label: "Grade 7 B · Science", seated: 10 }), paper({ scheduleId: "s3", date: "2026-11-05" })], "2026-11-02", 2);
  assert.equal(day.papers.length, 2);
  assert.equal(day.ready, false);
  assert.equal(day.blocking, 1);
  assert.equal(day.openExceptions, 2);
  assert.equal(dayReadiness([], null, 0).ready, false, "a day with no papers is not reported as ready");
});
