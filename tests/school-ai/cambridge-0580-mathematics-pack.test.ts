import assert from "node:assert/strict";
import test from "node:test";
import { contractMismatches, contractPilotEligibility, pinContract, pinMatches, transitionContract, validateContractForPublication, type CurriculumContract } from "../../src/lib/school-ai/curriculum-contract";
import { buildCambridge0580Pack, cambridge0580Availability, cambridge0580Editions, cambridge0580Errors, cambridge0580Topics, type Cambridge0580Request } from "../../src/lib/school-ai/packs/cambridge-0580-mathematics";

const now = new Date("2026-11-01T00:00:00Z");
const approver = { userId: "u-approver", schoolId: "school-dxb", canApproveCurriculum: true };
const base: Cambridge0580Request = { examYear: "2027", teachingYear: "2026-27", tier: "Extended", component: "P2", schoolGradeLabel: "Year 11", series: "June" };

// Placeholder evidence used only to exercise the rules. These are not Cambridge facts.
const evidenced = (contract: CurriculumContract): CurriculumContract => ({
  ...contract, unverified: [], status: "IN_REVIEW",
  paper: { ...contract.paper, sections: [{ id: "SYN", format: "LONG", marks: contract.paper.totalMarks!, questionCount: 20, attempt: 20 }] },
  sources: contract.sources.map(source => ({ ...source, rightsScope: "Synthetic reference-only scope", permissionEvidence: "Synthetic permission record" })),
  register: { ...contract.register, educatorApprover: "Synthetic educator", approvedOn: "2026-10-30", reviewDueOn: "2027-06-30" },
});

test("shipped packs are DRAFT, name human evidence requests and stay gated off in Dubai", () => {
  const pack = buildCambridge0580Pack(base);
  const errors = validateContractForPublication(pack, now).join(" ");
  for (const field of ["paper.sections", "rights", "gradeMapping", "localRequirements", "educatorApprover"]) assert.ok(errors.includes(`Unverified ${field}:`), field);
  assert.equal(contractPilotEligibility(pack, "UAE_DUBAI", true, now).eligible, false);
  assert.deepEqual(cambridge0580Errors(pack, "P2"), []);
});

test("component facts are verified per tier and paper", () => {
  const cases = [["Core", "P1", 80, 90, "NOT_ALLOWED"], ["Core", "P3", 80, 90, "ALLOWED"], ["Extended", "P2", 100, 120, "NOT_ALLOWED"], ["Extended", "P4", 100, 120, "ALLOWED"]] as const;
  for (const [tier, component, marks, minutes, calculator] of cases) {
    const pack = buildCambridge0580Pack({ ...base, tier, component });
    assert.equal(pack.paper.totalMarks, marks);
    assert.equal(pack.paper.durationMinutes, minutes);
    assert.equal(pack.paper.calculator, calculator);
    assert.ok(pack.outcomes.every(outcome => outcome.code.startsWith(tier === "Core" ? "C" : "E")));
  }
  assert.equal(cambridge0580Topics("Core").length, 53);
  assert.equal(cambridge0580Topics("Extended").length, 71);
});

test("exam-year boundary: 2027 and 2028 use different editions, no rollover, unknown years unavailable", () => {
  assert.equal(buildCambridge0580Pack(base).sources[0].id, "cie-0580-syllabus-2025-2027");
  assert.equal(buildCambridge0580Pack({ ...base, examYear: "2028", teachingYear: "2027-28" }).sources[0].id, "cie-0580-syllabus-2028-2030");
  for (const year of ["2024", "2031"]) assert.equal(cambridge0580Availability({ ...base, examYear: year }).available, false);
  assert.throws(() => buildCambridge0580Pack({ ...base, examYear: "2031" }), /No verified 0580/);
  const mixed = { ...buildCambridge0580Pack(base), sources: cambridge0580Editions[1].sources };
  assert.match(cambridge0580Errors(mixed, "P2").join(" "), /mixed or wrong edition/);
});

test("wrong tier, paper, calculator, marks, outcome and stale source are rejected", () => {
  const pack = buildCambridge0580Pack(base);
  assert.equal(cambridge0580Availability({ ...base, tier: "Core", component: "P2" }).available, false);
  assert.match(cambridge0580Errors(pack, "P1").join(" "), /not a Extended paper/);
  assert.match(cambridge0580Errors({ ...pack, paper: { ...pack.paper, calculator: "ALLOWED" } }, "P2").join(" "), /calculator rule/);
  assert.match(cambridge0580Errors({ ...pack, paper: { ...pack.paper, totalMarks: 80 } }, "P2").join(" "), /100 marks/);
  assert.match(cambridge0580Errors({ ...buildCambridge0580Pack({ ...base, tier: "Core", component: "P1" }), outcomes: [{ code: "E2.12", statement: "Differentiation", assessed: true }] }, "P1").join(" "), /not Core content/);
  const stale = { ...pack, sources: pack.sources.map(source => ({ ...source, checksumSha256: "0".repeat(64) })) };
  assert.match(cambridge0580Errors(stale, "P2").join(" "), /stale or altered/);
  assert.equal(contractMismatches(pack, { board: "CAMBRIDGE", schoolGrade: "Year 11", subject: "Mathematics", examYear: "2028", tier: "Extended", language: "en" }).length, 1);
  assert.equal(contractMismatches(pack, { board: "CAMBRIDGE", schoolGrade: "Year 11", subject: "Mathematics", examYear: "2027", tier: "Core", language: "en" }).length, 1);
});

test("once evidenced, approval pins version and provenance, and the pin survives later versions", () => {
  const c = evidenced(buildCambridge0580Pack(base));
  assert.deepEqual(validateContractForPublication(c, now), []);
  const approved = transitionContract(c, "APPROVED", approver, now);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.deepEqual(contractPilotEligibility(approved.contract, "UAE_DUBAI", true, now), { eligible: true });
  assert.equal(contractPilotEligibility(approved.contract, "UAE_DUBAI", false, now).eligible, false);
  const pin = pinContract(approved.contract);
  assert.equal(pinMatches(pin, approved.contract), true);
  assert.equal(pinMatches(pin, { ...approved.contract, version: 2 }), false);
});
