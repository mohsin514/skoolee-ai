import assert from "node:assert/strict";
import test from "node:test";
import { classifyStage, paymentReadiness, PAYMENT_PATHS, validateProposal, type PilotProposal } from "../../src/lib/school-ai/pilot-offer";

const proposal: PilotProposal = {
  version: 1, market: "KSA", city: "Riyadh", pack: "KSA MoE Math G8 T1 (pending edition)", academicYear: "1448/2026-27",
  campuses: 2, users: 4, startsOn: "2027-01-10", endsOn: "2027-03-31", amount: null, currency: "SAR",
  budgetApprover: "role:bursar", academicChampion: "role:head-of-maths", dataProcessingApprover: "role:principal",
  baselineCriteria: "marking time per paper, two cycles", exitExport: "CSV + PDF export of pilot artifacts", claims: ["Runs alongside your existing systems"],
};

test("Gulf payment rails are unavailable and Pakistan is not sandbox-verified", () => {
  assert.equal(paymentReadiness("KSA").label, "UNAVAILABLE");
  assert.equal(paymentReadiness("UAE_DUBAI").label, "UNAVAILABLE");
  assert.equal(paymentReadiness("PAKISTAN").label, "SANDBOX_INCOMPLETE");
  assert.equal(paymentReadiness("PAKISTAN", { PAKISTAN: { provider: "SafePay", sandboxTested: [...PAYMENT_PATHS] }, KSA: { provider: null, sandboxTested: [] }, UAE_DUBAI: { provider: null, sandboxTested: [] } }).label, "SANDBOX_VERIFIED");
});
test("stages need references, not intentions", () => {
  assert.equal(classifyStage({}), "UNDECIDED");
  assert.equal(classifyStage({ demoAttended: true }), "DEMO_INTEREST");
  assert.equal(classifyStage({ demoAttended: true, declinedToPay: true }), "DECLINED_PAYMENT");
  assert.equal(classifyStage({ signedAgreementRef: "restricted/agr-1" }), "CONSENTED_PILOT");
  assert.equal(classifyStage({ settlementRef: "restricted/pay-1" }), "UNDECIDED");
  assert.equal(classifyStage({ signedAgreementRef: "restricted/agr-1", settlementRef: "restricted/pay-1" }), "PAID_COMMITMENT");
});
test("a complete undecided-price proposal is valid", () => assert.deepEqual(validateProposal(proposal), []));
test("rejects wrong currency, oversized scope and untruthful claims", () => {
  const problems = validateProposal({ ...proposal, currency: "AED", campuses: 5, claims: ["Guaranteed 50% time savings", "Live Noor integration", "Replaces your ERP replacement"] });
  assert.ok(problems.some((p) => p.includes("SAR")));
  assert.ok(problems.some((p) => p.includes("two campuses")));
  assert.ok(problems.some((p) => p.includes("guaranteed")));
  assert.ok(problems.some((p) => p.includes("connector")));
});
test("missing approvers are reported", () => assert.ok(validateProposal({ ...proposal, budgetApprover: "" }).some((p) => p.includes("budget approver"))));
