import assert from "node:assert/strict";
import test from "node:test";
import { validateCurriculumApproval, type CurriculumData } from "../../src/lib/school-ai/assessment";
import { contractMismatches, contractPilotEligibility, curriculumContractSchema, transitionContract, validateContractForPublication, type ContractRequest, type CurriculumContract } from "../../src/lib/school-ai/curriculum-contract";
import { activationBlockers, catalogueRow, shippedCurriculumPacks, type ActivationSnapshot } from "../../src/lib/school-ai/curriculum-pack-registry";
import { BISE_LAHORE_G9_MATHEMATICS_PACK_ID, biseLahoreGrade9MathematicsPack as pack, biseLahoreObjectiveMapPack } from "../../src/lib/school-ai/packs/bise-lahore-g9-mathematics";

const now = new Date("2026-11-01T00:00:00Z");
const approver = { userId: "u-approver", schoolId: "school-a", canApproveCurriculum: true };

// Placeholder evidence used only to exercise the rules. These are not BISE Lahore facts.
const evidenced = (): CurriculumContract => ({
  ...pack, unverified: [],
  outcomes: [{ code: "SYN-1", statement: "Synthetic outcome", assessed: true }],
  paper: { ...pack.paper, totalMarks: 60, durationMinutes: 120, calculator: "NOT_ALLOWED", sections: [{ id: "A", format: "MCQ", marks: 20, questionCount: 20, attempt: 20 }, { id: "B", format: "LONG", marks: 40, questionCount: 6, attempt: 4 }] },
  sources: pack.sources.map(source => ({ ...source, rightsScope: "Synthetic reference-only scope", permissionEvidence: "Synthetic permission record" })),
  register: { ...pack.register, educatorApprover: "Synthetic educator", approvedOn: "2026-10-30", reviewDueOn: "2027-08-31" },
});

test("the shipped BISE Lahore pack is a DRAFT in the catalogue and stays gated off", () => {
  assert.equal(pack.status, "DRAFT");
  assert.ok(shippedCurriculumPacks().some(item => item.packId === BISE_LAHORE_G9_MATHEMATICS_PACK_ID && item.board === "BISE_LAHORE"));
  const errors = validateContractForPublication(pack, now).join(" ");
  for (const field of ["outcomes", "paper.totalMarks", "paper.durationMinutes", "paper.sections", "paper.calculator", "rights", "educatorApprover"]) assert.ok(errors.includes(`Unverified ${field}:`), field);
  assert.equal(transitionContract({ ...pack, status: "IN_REVIEW" }, "APPROVED", approver, now).ok, false);
  assert.equal(contractPilotEligibility(pack, "PAKISTAN_LAHORE", false, now).eligible, false);
});

test("source metadata is pinned and the historical 2026 paper rules are not carried into 2027", () => {
  assert.equal(pack.examYear, "2027");
  assert.equal(pack.teachingYear, "2026-27");
  assert.equal(pack.gradeMapping.schoolGrade, "9");
  for (const source of pack.sources) {
    assert.match(source.url, /^https:\/\/data\.biselahore\.com\//);
    assert.match(source.checksumSha256, /^[a-f0-9]{64}$/);
    assert.equal(source.retrievedOn, "2026-10-29");
  }
  assert.equal(pack.paper.totalMarks, undefined);
  assert.match(pack.sources.find(source => source.id === "bise-lhr-syllabus-9-10-2025-27")!.applicability, /Historical/);
});

test("wrong board, year, grade and other Punjab boards are rejected", () => {
  const c = evidenced();
  const request: ContractRequest = { board: "BISE_LAHORE", schoolGrade: "9", subject: "Mathematics", examYear: "2027", language: "ur" };
  assert.deepEqual(contractMismatches(c, request), []);
  assert.equal(contractMismatches(c, { ...request, board: "FBISE" }).length, 1);
  assert.equal(contractMismatches(c, { ...request, examYear: "2026" }).length, 1);
  assert.equal(contractMismatches(c, { ...request, schoolGrade: "10" }).length, 1);
  assert.equal(contractMismatches(c, { ...request, board: "BISE_GUJRANWALA" as ContractRequest["board"] }).length, 1);
  assert.equal(curriculumContractSchema.safeParse({ ...c, board: "BISE_RAWALPINDI" }).success, false);
});

test("once evidenced, it can be approved and activated for a Lahore campus only", () => {
  const c = { ...evidenced(), status: "IN_REVIEW" as const };
  assert.deepEqual(validateContractForPublication(c, now), []);
  const approved = transitionContract(c, "APPROVED", approver, now);
  assert.equal(approved.ok, true);
  if (approved.ok) assert.deepEqual(contractPilotEligibility(approved.contract, "PAKISTAN_LAHORE", false, now), { eligible: true });

  const row = catalogueRow({ ...evidenced(), status: "DRAFT" });
  const activation = (geography: string): ActivationSnapshot => ({
    schoolId: "school-a", campusId: "campus-lhr", status: "APPROVED", geography, schoolGrade: "9", localBudgetApprover: null,
    sourceEvidence: pack.sources.map(source => ({ sourceId: source.id, rightsScope: "Synthetic scope", permissionEvidence: "Synthetic record" })),
    educatorApprover: "Synthetic educator", educatorApproverId: "u-edu", approvedOn: new Date("2026-10-30"), reviewDueOn: new Date("2027-08-31"), requestedById: "u-admin", contentSha256: row.contentSha256,
  });
  assert.deepEqual(activationBlockers(row, activation("PAKISTAN_LAHORE"), now), []);
  assert.match(activationBlockers(row, activation("PAKISTAN_ISLAMABAD_RAWALPINDI"), now).join(" "), /limited to PAKISTAN_LAHORE/);
  // The shipped DRAFT pack itself stays blocked even for a fully evidenced Lahore campus.
  const shipped = catalogueRow(pack);
  assert.ok(activationBlockers(shipped, { ...activation("PAKISTAN_LAHORE"), contentSha256: shipped.contentSha256 }, now).some(item => item.startsWith("Unverified")));
});

test("the #159 objective-map pack reads its identity from the contract", () => {
  const link = biseLahoreObjectiveMapPack();
  assert.equal(link.packId, BISE_LAHORE_G9_MATHEMATICS_PACK_ID);
  const data: CurriculumData = {
    title: "BISE Lahore Grade 9 maths", subject: "Mathematics", grade: "9", academicYear: "2026-27", board: "BISE Lahore", outcomes: [], sectionCoverage: [], sources: [],
    pack: { ...link, rights: "UNDER_REVIEW" },
  } as unknown as CurriculumData;
  const errors = validateCurriculumApproval(data).join(" ");
  assert.doesNotMatch(errors, /immutable pack ID/);
  assert.match(errors, /marks, duration and choice/);
});
