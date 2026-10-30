import assert from "node:assert/strict";
import test from "node:test";
import { contractMismatches, contractPilotEligibility, pinContract, transitionContract, validateContractForPublication, type CurriculumContract } from "../../src/lib/school-ai/curriculum-contract";
import { ksaIntermediateMathematicsPack, ksaMathTextErrors, ksaPackErrors, ksaSemesters } from "../../src/lib/school-ai/packs/ksa-intermediate-mathematics";
import { sanitizeMultiline } from "../../src/lib/validators/sanitize";

const now = new Date("2026-11-01T00:00:00Z");
const approver = { userId: "u-approver", schoolId: "school-a", canApproveCurriculum: true };
const teacher = { userId: "u-teacher", schoolId: "school-a", canApproveCurriculum: false };
const pack = ksaIntermediateMathematicsPack("8", ksaSemesters[0]);
const school = { curriculum: "NATIONAL" as const, academicYearHijri: "1448/1449", schoolGrade: "8", term: ksaSemesters[0] };

// Placeholder evidence used only to exercise the rules. These are not MoE facts.
const evidenced = (): CurriculumContract => ({
  ...pack, unverified: [],
  outcomes: [{ code: "SYN-1", statement: "ناتج تعليمي تجريبي", assessed: true }],
  paper: { ...pack.paper, totalMarks: 40, durationMinutes: 90, calculator: "NOT_ALLOWED", sections: [{ id: "A", format: "MCQ", marks: 20, questionCount: 20, attempt: 20 }, { id: "B", format: "LONG", marks: 20, questionCount: 5, attempt: 4 }] },
  sources: [...pack.sources, { id: "syn-textbook", kind: "TEXTBOOK" as const, authority: "Synthetic", reference: "Synthetic", edition: "Synthetic 1448 edition", url: "https://example.test/book", retrievedOn: "2026-10-29", checksumSha256: "0".repeat(64), applicability: "Synthetic" }]
    .map(source => ({ ...source, rightsScope: "Synthetic reference-only scope", permissionEvidence: "Synthetic permission record" })),
  register: { ...pack.register, educatorApprover: "Synthetic educator", approvedOn: "2026-10-30", reviewDueOn: "2027-06-30" },
});

test("the shipped KSA pack is DRAFT, names its evidence requests and stays gated off in Riyadh", () => {
  const errors = validateContractForPublication(pack, now).join(" ");
  for (const field of ["textbook", "gradeMapping", "outcomes", "assessmentPolicy", "notation", "rights", "educatorApprover"]) assert.ok(errors.includes(`Unverified ${field}:`), field);
  assert.match(ksaPackErrors(pack, school).join(" "), /No MoE textbook edition/);
  assert.equal(contractPilotEligibility(pack, "KSA_RIYADH", true, now).eligible, false);
  assert.equal(pack.language, "ar");
  for (const source of pack.sources) { assert.match(source.url, /^https:\/\/www\.moe\.gov\.sa\//); assert.match(source.checksumSha256, /^[a-f0-9]{64}$/); }
  assert.match(pack.sources.find(source => source.id === "moe-ain-textbooks-1440")!.applicability, /Does not prove the 1448 edition/);
});

test("evidenced pack needs a curriculum approver, then is eligible with a local budget approver and pinned", () => {
  const c = { ...evidenced(), status: "IN_REVIEW" as const };
  assert.deepEqual([...validateContractForPublication(c, now), ...ksaPackErrors(c, school)], []);
  assert.equal(transitionContract(c, "APPROVED", teacher, now).ok, false);
  const approved = transitionContract(c, "APPROVED", approver, now);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(contractPilotEligibility(approved.contract, "KSA_RIYADH", false, now).eligible, false);
  assert.deepEqual(contractPilotEligibility(approved.contract, "KSA_RIYADH", true, now), { eligible: true });
  assert.equal(pinContract(approved.contract).packId, "ksa-moe-g8-mathematics-1448-s1");
});

test("wrong grade, term, year, foreign curriculum, old textbook edition and denied rights are rejected", () => {
  const c = evidenced();
  assert.match(ksaPackErrors(c, { ...school, schoolGrade: "9" }).join(" "), /grade 8, not 9/);
  assert.match(ksaPackErrors(c, { ...school, term: ksaSemesters[1] }).join(" "), /not الفصل الدراسي الثاني/);
  assert.match(ksaPackErrors(c, { ...school, academicYearHijri: "1447/1448" }).join(" "), /not 1447\/1448/);
  assert.match(ksaPackErrors(c, { ...school, curriculum: "FOREIGN" }).join(" "), /Foreign-curriculum/);
  assert.match(ksaPackErrors({ ...c, term: "الفصل الدراسي الثالث" }, { ...school, term: "الفصل الدراسي الثالث" }).join(" "), /two semesters/);
  assert.match(ksaPackErrors({ ...c, sources: c.sources.map(s => s.kind === "TEXTBOOK" ? { ...s, edition: "1445 edition" } : s) }, school).join(" "), /not shown to be the 1448/);
  assert.match(validateContractForPublication({ ...c, sources: c.sources.map(s => ({ ...s, rightsScope: undefined })) }, now).join(" "), /no verified rights scope/);
  const request = { board: "KSA_MOE" as const, schoolGrade: "8", subject: "Mathematics", examYear: "2027", language: "ar" as const };
  assert.deepEqual(contractMismatches(c, request), []);
  assert.equal(contractMismatches(c, { ...request, board: "CAMBRIDGE" }).length, 1);
  assert.equal(contractMismatches(c, { ...request, language: "en" }).length, 1);
  assert.throws(() => ksaIntermediateMathematicsPack("10" as never, ksaSemesters[0]).gradeMapping.boardLevel.length);
});

test("mixed-direction mathematics survives sanitising and bidi controls are rejected", () => {
  const text = "حل المعادلة: 2x + 3 = 11، ثم احسب س² − ٤ = ٠";
  assert.equal(sanitizeMultiline(text), text);
  assert.deepEqual(ksaMathTextErrors(text), []);
  assert.equal(ksaMathTextErrors("احسب ⁦x + 1⁩").length, 1);
});
