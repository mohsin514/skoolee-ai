import { test } from "node:test";
import assert from "node:assert/strict";
import { claimSupport, findingHash, limitations, measureFinding, timeFinding, type MeasureRow, type ObservationRow } from "../../src/lib/pilots/findings";

// SKO-430 pure findings: denominators, exclusions, separate measures and claim fingerprints.
let n = 0;
const obs = (participant: string, phase: string, active: number | null, correction: number | null, extra: Partial<ObservationRow> = {}): ObservationRow => ({
  id: `o${++n}`, workflow: "MARKS_ENTRY", phase, participant, task: "Term test marks", difficulty: "Standard", activeSeconds: active, correctionSeconds: correction,
  elapsedSeconds: active == null ? null : active * 3, completed: true, assisted: false, source: "OBSERVED", synthetic: false, excludedReason: null, observedOn: "2026-10-01", ...extra,
});
const measure = (kind: string, value: number | null, denominator: number | null, extra: Partial<MeasureRow> = {}): MeasureRow => ({
  id: `m${++n}`, kind, workflow: "MARKS_ENTRY", periodStart: "2026-10-01", periodEnd: "2026-10-07", value, denominator, unit: "items", state: "MEASURED", method: "Random 1 in 5 pages", reference: "Teacher-approved sheet", synthetic: false, supersededAt: null, ...extra,
});

test("pairs only comparable, complete, real observations and shows every missing case", () => {
  const rows = [
    ...["T1", "T2", "T3", "T4", "T5"].flatMap((p, i) => [obs(p, "BASELINE", 600 + i * 60, 120), obs(p, "FOLLOW_UP", 300 + i * 60, 60)]),
    obs("T6", "BASELINE", 500, 100),                                   // no follow-up
    obs("T7", "FOLLOW_UP", 200, 50),                                   // no baseline
    obs("T8", "BASELINE", 400, 60), obs("T8", "FOLLOW_UP", 200, 40, { difficulty: "Hard" }),
    obs("T9", "BASELINE", 400, null),                                  // correction time missing: not filled from elapsed
    obs("T10", "FOLLOW_UP", null, null, { completed: false }),
    obs("T11", "BASELINE", 100, 10, { synthetic: true }),
    obs("T12", "BASELINE", 100, 10, { excludedReason: "Observer interrupted the task" }),
  ];
  const f = timeFinding("MARKS_ENTRY", rows);
  assert.equal(f.counts.paired, 5);
  assert.deepEqual(f.missing, { baselineOnly: 1, followUpOnly: 1, noTaskTime: 1, incomplete: 1, difficultyChanged: 1 });
  assert.deepEqual(f.excluded.map((e) => e.reason).sort(), ["Observer interrupted the task", "Synthetic record"]);
  assert.equal(f.medianTaskSeconds.baseline, 840);
  assert.equal(f.medianTaskSeconds.followUp, 480);
  assert.equal(f.changePercent, -42.9);
  assert.equal(f.medianElapsedSeconds.baseline, 2160, "elapsed is reported, separately, from elapsed values only");
  assert.ok(limitations(f).some((l) => /does not show that the product caused/.test(l)));
});

test("too few pairs give counts but no percentage", () => {
  const f = timeFinding("MARKS_ENTRY", [obs("A", "BASELINE", 600, 60), obs("A", "FOLLOW_UP", 300, 30)]);
  assert.equal(f.counts.paired, 1);
  assert.equal(f.changePercent, null);
  assert.match(f.percentWithheld!, /Too few paired observations for a percentage \(1 of 5 needed\)/);
  assert.equal(claimSupport(f).supported, false);
});

test("extraction and final approved accuracy stay separate; unknown is null, never zero; targets never support a claim", () => {
  const rows = [measure("CORRECTNESS_EXTRACTION", 82, 100), measure("CORRECTNESS_FINAL", 99, 100), measure("CORRECTNESS_EXTRACTION", 5, 5, { synthetic: true })];
  assert.equal(measureFinding("CORRECTNESS_EXTRACTION", "MARKS_ENTRY", rows).rate, 82);
  assert.equal(measureFinding("CORRECTNESS_FINAL", "MARKS_ENTRY", rows).rate, 99);
  assert.equal(measureFinding("CORRECTNESS_EXTRACTION", "MARKS_ENTRY", rows).excludedSynthetic, 1);
  const cost = measureFinding("SERVING_COST", null, [measure("SERVING_COST", 12, null, { workflow: null, state: "UNKNOWN" })]);
  assert.equal(cost.current[0].value, null);
  assert.equal(cost.rate, null);
  const target = measureFinding("PAID_CONVERSION", null, [measure("PAID_CONVERSION", 1, 1, { workflow: null, state: "TARGET" })]);
  assert.match(claimSupport(target).reason!, /none is a measured result/);
  const noInvoice = measureFinding("PAID_CONVERSION", null, [measure("PAID_CONVERSION", 1, 1, { workflow: null, reference: null })]);
  assert.match(claimSupport(noInvoice).reason!, /source evidence/);
  const noDenominator = measureFinding("WEEKLY_ACTIVE", null, [measure("WEEKLY_ACTIVE", 14, null, { workflow: null })]);
  assert.equal(noDenominator.rate, null);
  assert.match(noDenominator.rateWithheld!, /No valid denominator/);
});

test("a corrected source changes the finding's fingerprint", () => {
  const original = measure("CORRECTNESS_FINAL", 99, 100);
  const before = findingHash(measureFinding("CORRECTNESS_FINAL", "MARKS_ENTRY", [original]));
  const corrected = [{ ...original, supersededAt: "2026-10-09" }, measure("CORRECTNESS_FINAL", 95, 100)];
  assert.notEqual(findingHash(measureFinding("CORRECTNESS_FINAL", "MARKS_ENTRY", corrected)), before);
  assert.equal(findingHash(measureFinding("CORRECTNESS_FINAL", "MARKS_ENTRY", [original])), before, "the fingerprint is stable for unchanged evidence");
});
