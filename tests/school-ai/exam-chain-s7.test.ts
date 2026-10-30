import assert from "node:assert/strict";
import { test } from "node:test";
import { dayReadiness, deliveryReady, paperReadiness, readinessDay, type ReadinessPaperInput } from "../../src/lib/academic/exam-readiness";

// SKO-506: "are we ready for <day>?" from the ledger, by one rule.
const paper = (over: Partial<ReadinessPaperInput> = {}): ReadinessPaperInput => ({
  scheduleId: "s1", label: "Grade 7 A · Science", date: "2026-11-02", startTime: "08:00", endTime: "10:00",
  published: { date: "2026-11-02", startTime: "08:00", endTime: "10:00" }, slot: { sealedAt: new Date(), sealHash: "current-seal", deliveryKind: "PAPER" },
  printed: true, onlineSitting: false, rooms: [{ invigilated: true }], candidates: 30, seated: 30, ...over,
});

test("a fully prepared paper is ready; each gap is named by its check", () => {
  assert.equal(paperReadiness(paper()).ready, true);
  const gaps = (over: Partial<ReadinessPaperInput>) => paperReadiness(paper(over)).checks.filter(check => !check.ok).map(check => check.check);
  assert.deepEqual(gaps({ published: { date: "2026-11-03", startTime: "08:00", endTime: "10:00" } }), ["PUBLISHED"], "a live move not yet republished is not ready");
  assert.deepEqual(gaps({ slot: { sealedAt: null, sealHash: null, deliveryKind: "PAPER" } }), ["SEALED"]);
  assert.deepEqual(gaps({ slot: { sealedAt: new Date(), sealHash: "current-seal", compromisedAt: new Date(), deliveryKind: "PAPER" } }), ["SEALED"]);
  assert.deepEqual(gaps({ slot: { sealedAt: new Date(), sealHash: "current-seal", cancelledAt: new Date(), deliveryKind: "PAPER" } }), ["SEALED"]);
  assert.deepEqual(gaps({ printed: false }), ["DELIVERY"]);
  assert.deepEqual(gaps({ slot: { sealedAt: new Date(), sealHash: "current-seal", deliveryKind: "ONLINE" }, printed: false, onlineSitting: true }), [], "an online paper needs its sitting, not a print run");
  assert.deepEqual(gaps({ rooms: [{ invigilated: true }, { invigilated: false }] }), ["INVIGILATED"]);
  assert.deepEqual(gaps({ rooms: [] }), ["ROOMED", "INVIGILATED"]);
  assert.deepEqual(gaps({ seated: 29 }), ["SEATED"]);
});

test("delivery readiness requires every current candidate and the current seal", () => {
  const slot = { sealedAt: new Date("2026-10-01"), sealHash: "1234567890abcdef-current", deliveryKind: "PAPER" };
  const prints = [{ sealPrefix: "1234567890abcdef", candidates: 2, copies: 3, createdAt: new Date("2026-10-02") }];
  const scripts = ["a", "b"].map(studentId => ({ studentId, sealPrefix: "1234567890abcdef" }));
  assert.equal(deliveryReady(slot, ["a", "b"], prints, scripts, []), true);
  assert.equal(deliveryReady(slot, ["a", "c"], prints, scripts, []), false, "a changed roster needs the new learner's cover");
  assert.equal(deliveryReady(slot, ["a", "b"], prints.map(run => ({ ...run, sealPrefix: "old" })), scripts, []), false);
  assert.equal(deliveryReady(slot, ["a", "b"], prints.map(run => ({ ...run, createdAt: new Date("2026-09-30") })), scripts, []), false);
  const online = { ...slot, deliveryKind: "ONLINE" };
  assert.equal(deliveryReady(online, ["a", "b"], [], [], [{ contentHash: slot.sealHash, studentIds: ["a"] }]), false);
  assert.equal(deliveryReady(online, ["a", "b"], [], [], [{ contentHash: "old", studentIds: ["a", "b"] }]), false);
  assert.equal(deliveryReady(online, ["a", "b"], [], [], [{ contentHash: slot.sealHash, studentIds: ["a", "b"] }]), true);
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
