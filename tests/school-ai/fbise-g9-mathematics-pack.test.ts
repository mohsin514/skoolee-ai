import assert from "node:assert/strict";
import test from "node:test";
import { contractMismatches, contractPilotEligibility, transitionContract, validateContractForPublication, type CurriculumContract } from "../../src/lib/school-ai/curriculum-contract";
import { fbiseGrade9MathematicsPack as pack, fbisePatternErrors } from "../../src/lib/school-ai/packs/fbise-g9-mathematics";

const now = new Date("2026-11-01T00:00:00Z");
const approver = { userId: "u-approver", schoolId: "school-a", canApproveCurriculum: true };

// Placeholder evidence used only to exercise the rules. These are not FBISE facts.
const evidenced = (): CurriculumContract => ({
  ...pack, unverified: [],
  outcomes: [{ code: "SYN-SLO-1", statement: "Synthetic summative SLO", assessed: true }],
  paper: { ...pack.paper, totalMarks: 60, durationMinutes: 150, calculator: "NOT_ALLOWED", sections: [{ id: "A", format: "MCQ", marks: 30, questionCount: 30, attempt: 30 }, { id: "B", format: "LONG", marks: 30, questionCount: 5, attempt: 3 }] },
  sources: pack.sources.map(source => ({ ...source, rightsScope: "Synthetic reference-only scope", permissionEvidence: "Synthetic permission record" })),
  register: { ...pack.register, educatorApprover: "Synthetic educator", approvedOn: "2026-10-30", reviewDueOn: "2027-08-31" },
});

test("the shipped FBISE pack is pending, names its evidence requests and stays gated off", () => {
  const errors = validateContractForPublication(pack, now).join(" ");
  for (const field of ["outcomes", "paper.totalMarks", "paper.durationMinutes", "paper.sections", "rights", "educatorApprover"]) assert.ok(errors.includes(`Unverified ${field}:`), field);
  assert.equal(transitionContract({ ...pack, status: "IN_REVIEW" }, "APPROVED", approver, now).ok, false);
  assert.equal(contractPilotEligibility(pack, "PAKISTAN_ISLAMABAD_RAWALPINDI", false, now).eligible, false);
});

test("verified source metadata is pinned: authority, date, URL, checksum and Grade 9 applicability", () => {
  assert.equal(pack.examYear, "2027");
  assert.equal(pack.gradeMapping.boardLevel, "SSC-I");
  for (const source of pack.sources) {
    assert.match(source.url, /^https:\/\/www\.fbise\.edu\.pk\//);
    assert.match(source.checksumSha256, /^[a-f0-9]{64}$/);
    assert.equal(source.retrievedOn, "2026-10-29");
  }
  assert.match(pack.sources.find(source => source.id === "fbise-res-415-2025")!.applicability, /not Grade 9 content/);
});

test("once evidenced, the pack can be approved and activated for Islamabad/Rawalpindi", () => {
  const c = { ...evidenced(), status: "IN_REVIEW" as const };
  assert.deepEqual([...validateContractForPublication(c, now), ...fbisePatternErrors(c)], []);
  const approved = transitionContract(c, "APPROVED", approver, now);
  assert.equal(approved.ok, true);
  if (approved.ok) assert.deepEqual(contractPilotEligibility(approved.contract, "PAKISTAN_ISLAMABAD_RAWALPINDI", false, now), { eligible: true });
});

test("wrong year, wrong board, omitted outcome, marks total, disallowed choice and stale review are rejected", () => {
  const c = evidenced();
  const request = { board: "FBISE" as const, schoolGrade: "9", subject: "Mathematics", examYear: "2027", language: "en" as const };
  assert.deepEqual(contractMismatches(c, request), []);
  assert.equal(contractMismatches(c, { ...request, examYear: "2026" }).length, 1);
  assert.equal(contractMismatches(c, { ...request, board: "BISE_LAHORE" }).length, 1);
  assert.match(validateContractForPublication({ ...c, outcomes: [] }, now).join(" "), /assessed learning outcome/);
  assert.match(validateContractForPublication({ ...c, paper: { ...c.paper, totalMarks: 75 } }, now).join(" "), /do not equal/);
  assert.match(validateContractForPublication({ ...c, paper: { ...c.paper, sections: [c.paper.sections[0], { ...c.paper.sections[1], attempt: 6 }] } }, now).join(" "), /more answers/);
  assert.match(fbisePatternErrors({ ...c, paper: { ...c.paper, sections: [{ ...c.paper.sections[0], marks: 20 }, { ...c.paper.sections[1], marks: 40 }] } }).join(" "), /50% MCQ/);
  assert.match(validateContractForPublication({ ...c, register: { ...c.register, reviewDueOn: "2026-10-31" } }, now).join(" "), /stale/);
});
