import assert from "node:assert/strict";
import test from "node:test";
import { READINESS_ITEMS, evaluatePilotReadiness, type ReadinessRecord } from "../../src/lib/school-ai/pilot-readiness";

// Synthetic fixtures only: pseudonymous roles, no real school, pupil or guardian data.
const now = new Date("2026-11-15");
const pack = { geography: "PAKISTAN_LAHORE", board: "BISE Lahore", grade: "9", subject: "Mathematics", examYear: "2027", academicYear: "2026-27", term: "Annual", tier: "Core", language: "en", approvalStatus: "APPROVED", approvedAt: "2026-10-28", reviewDueAt: "2027-10-28" } as const;
const evidence = Object.keys(READINESS_ITEMS).map((item) => ({ item, status: "PASSED", reference: `QA-LINK-${item}`, reviewer: "Reviewer R-01", reviewedOn: "2026-11-01" }));
const full = (): ReadinessRecord => ({
  schoolScope: { schoolRef: "SYN-SCHOOL-A", campusRefs: ["CAMPUS-1", "CAMPUS-2"], academicLead: "Lead L-01", teachers: ["T-01", "T-02"] },
  pack, evidence: evidence as ReadinessRecord["evidence"],
  measurement: { pilotId: "pilot-syn-1", thresholdsAgreedOn: "2026-11-02", thresholdsReference: "charter v1", baselineDefined: true },
  decision: { outcome: "GO", rationale: "All readiness items evidenced; thresholds agreed with school.", founderApprover: "Founder", schoolApprover: "Principal P-01", decidedOn: "2026-11-10", rollbackPlan: "disable pack flag", exitExportPlan: "SKAI-1015 export", salesClaimsReviewed: true, negativeEvidence: [] },
});
const blockers = (r: ReturnType<typeof evaluatePilotReadiness>) => (r.ready ? [] : r.blockers.map((b) => b.item));

test("a fully evidenced Pakistan record with a signed GO is ready", () => assert.deepEqual(evaluatePilotReadiness(full(), new Set(), now), { ready: true, market: "PAKISTAN" }));

test("every single missing readiness item keeps the pilot unavailable", () => {
  for (const item of Object.keys(READINESS_ITEMS)) {
    const r = full(); r.evidence = r.evidence.filter((e) => e.item !== item);
    assert.ok(blockers(evaluatePilotReadiness(r, new Set(), now)).includes(item), item);
  }
});

test("in-review, unreferenced or future-dated evidence does not count", () => {
  for (const patch of [{ status: "IN_REVIEW" }, { reference: undefined }, { reviewedOn: "2027-01-01" }]) {
    const r = full(); r.evidence = r.evidence.map((e) => (e.item === "SOURCE_RIGHTS" ? { ...e, ...patch } : e)) as ReadinessRecord["evidence"];
    assert.ok(blockers(evaluatePilotReadiness(r, new Set(), now)).includes("SOURCE_RIGHTS"));
  }
});

test("only AI-05 may be waived, and only when AI is off", () => {
  const waive = (item: string, note: string) => { const r = full(); r.evidence = r.evidence.map((e) => (e.item === item ? { ...e, status: "WAIVED_NOT_APPLICABLE", note } : e)) as ReadinessRecord["evidence"]; return blockers(evaluatePilotReadiness(r, new Set(), now)); };
  assert.deepEqual(waive("AI05_STATUS", "AI_OFF for this pilot"), []);
  assert.ok(waive("AI05_STATUS", "skipped").includes("AI05_STATUS"));
  assert.ok(waive("LANGUAGE_QA", "AI_OFF").includes("LANGUAGE_QA"));
});

test("no decision, or NARROW/STOP/DEFER, never activates", () => {
  const r = full(); delete r.decision;
  assert.ok(blockers(evaluatePilotReadiness(r, new Set(), now)).includes("DECISION"));
  for (const outcome of ["NARROW", "STOP", "DEFER"] as const) assert.equal(evaluatePilotReadiness({ ...full(), decision: { ...full().decision!, outcome } }, new Set(), now).ready, false);
});

test("thresholds must predate the decision and sales claims must be reviewed", () => {
  const late = full(); late.measurement = { ...late.measurement!, thresholdsAgreedOn: "2026-11-12" };
  assert.ok(blockers(evaluatePilotReadiness(late, new Set(), now)).includes("MEASUREMENT"));
  assert.equal(evaluatePilotReadiness({ ...full(), decision: { ...full().decision!, salesClaimsReviewed: false } }, new Set(), now).ready, false);
});

test("KSA and Dubai are sequenced after Pakistan and gated independently of each other", () => {
  const ksa = { ...full(), pack: { ...pack, geography: "KSA_RIYADH", localBudgetApprover: true } };
  assert.ok(blockers(evaluatePilotReadiness(ksa, new Set(), now)).includes("SEQUENCE"));
  assert.deepEqual(evaluatePilotReadiness(ksa, new Set(["PAKISTAN"] as const), now), { ready: true, market: "KSA" });
  const dubai = { ...full(), pack: { ...pack, geography: "UAE_DUBAI", localBudgetApprover: true } };
  assert.equal(evaluatePilotReadiness(dubai, new Set(["PAKISTAN"] as const), now).ready, true);
});

test("an ineligible pack (SKAI-1007) or unsupported geography blocks readiness", () => {
  assert.ok(blockers(evaluatePilotReadiness({ ...full(), pack: { ...pack, approvalStatus: "IN_REVIEW" } }, new Set(), now)).includes("PACK_ELIGIBILITY"));
  assert.equal(evaluatePilotReadiness({ ...full(), pack: { ...pack, geography: "OTHER" } }, new Set(), now).ready, false);
});

test("single-campus scope needs a documented exception; contact details are refused", () => {
  const one = full(); one.schoolScope = { ...one.schoolScope, campusRefs: ["CAMPUS-1"] };
  assert.ok(blockers(evaluatePilotReadiness(one, new Set(), now)).includes("SCHOOL_SCOPE"));
  one.schoolScope.scopeException = "School operates a single campus.";
  assert.equal(evaluatePilotReadiness(one, new Set(), now).ready, true);
  assert.equal(evaluatePilotReadiness({ ...full(), schoolScope: { ...full().schoolScope, academicLead: "lead@example.com" } }, new Set(), now).ready, false);
});
