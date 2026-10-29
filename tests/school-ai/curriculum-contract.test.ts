import assert from "node:assert/strict";
import test from "node:test";
import { contractMismatches, contractPilotEligibility, pinContract, pinMatches, transitionContract, validateContractForPublication, type CurriculumContract } from "../../src/lib/school-ai/curriculum-contract";

// Synthetic contract: values are test fixtures, not curriculum facts.
const synthetic = (): CurriculumContract => ({
  packId: "synthetic-board-g9-maths", version: 1, status: "DRAFT", board: "BISE_LAHORE", qualification: "Synthetic SSC", examSession: "First Annual",
  examYear: "2027", teachingYear: "2026-27", gradeMapping: { boardLevel: "SSC-I", schoolGrade: "9" }, term: "Annual", subject: "Mathematics", tier: "Core", language: "en",
  outcomes: [{ code: "SYN-1", statement: "Synthetic outcome", assessed: true }],
  paper: { totalMarks: 60, durationMinutes: 120, sections: [{ id: "A", format: "MCQ", marks: 20, questionCount: 20, attempt: 20 }, { id: "B", format: "LONG", marks: 40, questionCount: 6, attempt: 4 }], calculator: "NOT_ALLOWED", rules: ["Synthetic rule"] },
  sources: [{ id: "s1", kind: "SYLLABUS", authority: "Synthetic Board", reference: "SYN/1", edition: "2027", url: "https://example.test/syllabus.pdf", retrievedOn: "2026-10-29", checksumSha256: "a".repeat(64), applicability: "QA schools", rightsScope: "Reference only", permissionEvidence: "Synthetic permission" }],
  register: { educatorApprover: "Synthetic educator", approvedOn: "2026-10-29", reviewDueOn: "2027-10-29", reviewTrigger: "New board notice" },
  unverified: [],
});
const now = new Date("2026-11-01T00:00:00Z");
const approver = { userId: "u-approver", schoolId: "school-a", canApproveCurriculum: true };

test("a complete synthetic contract is publishable", () => assert.deepEqual(validateContractForPublication(synthetic(), now), []));

test("missing rights, stale editions, source conflicts and past-paper-only sources block publication", () => {
  const c = synthetic();
  assert.match(validateContractForPublication({ ...c, sources: [{ ...c.sources[0], rightsScope: undefined }] }, now).join(" "), /rights scope/);
  assert.match(validateContractForPublication({ ...c, register: { ...c.register, reviewDueOn: "2026-10-31" } }, now).join(" "), /stale/);
  assert.match(validateContractForPublication({ ...c, sources: [c.sources[0], { ...c.sources[0], id: "s2", edition: "2025" }] }, now).join(" "), /Conflicting/);
  assert.match(validateContractForPublication({ ...c, sources: [{ ...c.sources[0], kind: "PAST_PAPER" }] }, now).join(" "), /structural references only/);
  assert.match(validateContractForPublication({ ...c, unverified: [{ field: "totalMarks", evidenceRequest: "Obtain ToS" }] }, now).join(" "), /Unverified totalMarks/);
});

test("marks totals, choices and board-specific rules are enforced", () => {
  const c = synthetic();
  assert.match(validateContractForPublication({ ...c, paper: { ...c.paper, totalMarks: 75 } }, now).join(" "), /do not equal/);
  assert.match(validateContractForPublication({ ...c, paper: { ...c.paper, sections: [c.paper.sections[0], { ...c.paper.sections[1], attempt: 7 }] } }, now).join(" "), /more answers/);
  assert.match(validateContractForPublication({ ...c, board: "CAMBRIDGE", tier: "Any" }, now).join(" "), /Core or Extended/);
  assert.match(validateContractForPublication({ ...c, board: "KSA_MOE", term: "Annual" }, now).join(" "), /semester/);
  assert.match(validateContractForPublication({ ...c, examYear: "2025" }, now).join(" "), /precede/);
});

test("lifecycle is authorized, auditable and terminal on revoke", () => {
  const review = transitionContract(synthetic(), "IN_REVIEW", { ...approver, canApproveCurriculum: false }, now);
  assert.equal(review.ok, true);
  if (!review.ok) return;
  assert.equal(transitionContract(review.contract, "APPROVED", { ...approver, canApproveCurriculum: false }, now).ok, false);
  const approved = transitionContract(review.contract, "APPROVED", approver, now);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.deepEqual({ from: approved.audit.from, to: approved.audit.to, actorId: approved.audit.actorId, schoolId: approved.audit.schoolId }, { from: "IN_REVIEW", to: "APPROVED", actorId: "u-approver", schoolId: "school-a" });
  assert.equal(transitionContract(approved.contract, "DRAFT", approver, now).ok, false);
  const revoked = transitionContract(approved.contract, "REVOKED", approver, now);
  assert.equal(revoked.ok && transitionContract(revoked.contract, "APPROVED", approver, now).ok, false);
  assert.equal(transitionContract({ ...synthetic(), status: "IN_REVIEW", unverified: [{ field: "marks", evidenceRequest: "ToS" }] }, "APPROVED", approver, now).ok, false);
});

test("pinned output stays bound to its approved version", () => {
  const v1 = { ...synthetic(), status: "APPROVED" as const };
  const pin = pinContract(v1);
  assert.equal(pinMatches(pin, v1), true);
  assert.equal(pinMatches(pin, { ...v1, paper: { ...v1.paper, durationMinutes: 150 } }), false);
  assert.equal(pinMatches(pin, { ...v1, version: 2 }), false);
  assert.throws(() => pinContract(synthetic()), /approved/);
});

test("requests are never silently mapped across board, grade, year or language", () => {
  const request = { board: "BISE_LAHORE" as const, schoolGrade: "9", subject: "Mathematics", examYear: "2027", language: "en" as const };
  assert.deepEqual(contractMismatches(synthetic(), request), []);
  assert.equal(contractMismatches(synthetic(), { ...request, board: "FBISE" }).length, 1);
  assert.equal(contractMismatches(synthetic(), { ...request, examYear: "2028", schoolGrade: "10", language: "ur" }).length, 3);
});

test("eligibility is evaluated per school/campus geography and stays off for unverified evidence", () => {
  const approved = { ...synthetic(), status: "APPROVED" as const };
  assert.deepEqual(contractPilotEligibility(approved, "PAKISTAN_LAHORE", false, now), { eligible: true });
  assert.equal(contractPilotEligibility(approved, "UAE_DUBAI", false, now).eligible, false);
  assert.equal(contractPilotEligibility({ ...approved, unverified: [{ field: "rights", evidenceRequest: "Permission" }] }, "PAKISTAN_LAHORE", false, now).eligible, false);
});
