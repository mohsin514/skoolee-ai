import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePilotEligibility } from "../../src/lib/school-ai/pilot-eligibility";

const base = { board: "BISE Lahore", grade: "9", subject: "Math", examYear: "2027", academicYear: "2026-27", term: "Annual", tier: "Core", language: "en" as const, approvalStatus: "APPROVED" as const, approvedAt: "2026-10-28", reviewDueAt: "2027-10-28" };
test("allows an approved Lahore capability", () => assert.deepEqual(evaluatePilotEligibility({ ...base, geography: "PAKISTAN_LAHORE" }, new Date("2026-11-01")), { eligible: true }));
test("denies unsupported geography without inferring support from country", () => assert.equal(evaluatePilotEligibility({ ...base, geography: "OTHER" }).eligible, false));
test("denies stale and unreviewed records with next actions", () => {
  assert.match((evaluatePilotEligibility({ ...base, geography: "PAKISTAN_LAHORE", reviewDueAt: "2026-01-01" }, new Date("2026-11-01")) as Exclude<ReturnType<typeof evaluatePilotEligibility>, { eligible: true }>).reason, /stale/);
  assert.match((evaluatePilotEligibility({ ...base, geography: "PAKISTAN_LAHORE", approvalStatus: "IN_REVIEW" }) as Exclude<ReturnType<typeof evaluatePilotEligibility>, { eligible: true }>).nextAction, /review/);
});
test("requires a local budget approver for KSA and Dubai", () => {
  assert.equal(evaluatePilotEligibility({ ...base, geography: "KSA_RIYADH" }).eligible, false);
  assert.deepEqual(evaluatePilotEligibility({ ...base, geography: "UAE_DUBAI", localBudgetApprover: true }), { eligible: true });
});
test("keeps tenant and campus evaluation independent", () => {
  const schoolOneCampusA = evaluatePilotEligibility({ ...base, geography: "PAKISTAN_LAHORE" });
  const schoolTwoCampusB = evaluatePilotEligibility({ ...base, geography: "UAE_DUBAI" });
  assert.equal(schoolOneCampusA.eligible, true);
  assert.equal(schoolTwoCampusB.eligible, false);
});
