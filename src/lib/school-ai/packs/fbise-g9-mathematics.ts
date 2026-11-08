import type { CurriculumContract } from "../curriculum-contract";

/**
 * SKAI-1009 (D2-03): FBISE Grade 9 (SSC-I) Mathematics, First Annual Examination 2027.
 *
 * Verified (official FBISE PDFs, retrieved 2026-10-29, SHA-256 recorded below):
 * - No.1-10/FBISE/RES/242 dated 07 August 2026: Mathematics papers use the restructured pattern
 *   (50% MCQ and 50% descriptive). This applies to all SSC-I students sitting the First Annual
 *   Examination 2027 under the Inclusive Scheme of Studies 2024 (1200 marks).
 * - No.1-10/FBISE/RES/415 dated 05 May 2025: examinations are based on Assessment Framework SLOs,
 *   not textbooks, and only summative SLOs appear in board papers. Its NCP 2022-23 framework list
 *   is for SSC-II/HSSC-II, so it is cited for the SLO principle only and never for Grade 9 content.
 *
 * Everything else is listed in `unverified`. The pack stays DRAFT and the pilot gate stays off
 * until an educator records the evidence. No question bank or model-paper content is copied.
 */
export const fbiseGrade9MathematicsPack: CurriculumContract = {
  packId: "fbise-ssc1-mathematics-2027",
  version: 1,
  status: "DRAFT",
  board: "FBISE",
  qualification: "SSC-I (Inclusive Scheme of Studies 2024, 1200 marks)",
  examSession: "First Annual Examination",
  examYear: "2027",
  teachingYear: "2026-27",
  gradeMapping: { boardLevel: "SSC-I", schoolGrade: "9" },
  term: "Annual",
  subject: "Mathematics",
  tier: "Science group",
  language: "en",
  outcomes: [],
  paper: {
    sections: [],
    calculator: "UNVERIFIED",
    rules: ["50% of marks are MCQs and 50% descriptive questions (FBISE No.1-10/FBISE/RES/242, 07 Aug 2026)."],
  },
  sources: [
    {
      id: "fbise-res-242-2026",
      kind: "NOTICE",
      authority: "Federal Board of Intermediate and Secondary Education, Islamabad",
      reference: "No.1-10/FBISE/RES/242",
      issuedOn: "2026-08-07",
      edition: "Restructured pattern 2026 (BoG 124th meeting, 28 July 2026)",
      url: "https://www.fbise.edu.pk/notifications/Notification_of_50_percent_Pattern_2026.pdf",
      retrievedOn: "2026-10-29",
      checksumSha256: "a6e536a95436af7dab6d21b80ccc26ad6825e9b79f19815a19b1101155f217b7",
      applicability: "SSC-I Mathematics, all students in the First Annual Examination 2027 (Inclusive Scheme of Studies 2024).",
    },
    {
      id: "fbise-res-415-2025",
      kind: "NOTICE",
      authority: "Federal Board of Intermediate and Secondary Education, Islamabad",
      reference: "No.1-10/FBISE/RES/415",
      issuedOn: "2025-05-05",
      edition: "NCP 2022-23 assessment frameworks implementation",
      url: "https://www.fbise.edu.pk/notifications/NOTIFICATION%20of%20Implementation%20of%20Assessment%20Frameworks.pdf",
      retrievedOn: "2026-10-29",
      checksumSha256: "5f7397ec3bc40bfe730e4e4e29292dfac43121417a848f69d76e46feda125e26",
      applicability: "SLO-based examination principle only. Its framework list is SSC-II/HSSC-II and is not Grade 9 content.",
    },
  ],
  register: { reviewTrigger: "Any new FBISE notice, assessment framework, ToS or model paper for SSC-I Mathematics; or the school's exam year changes." },
  unverified: [
    { field: "outcomes", evidenceRequest: "Obtain the SSC-I Mathematics Assessment Framework (summative SLOs) for the 2027 pattern from fbise.edu.pk/curriculum_model_paper.php (HTTP 403 to automated retrieval on 2026-10-29)." },
    { field: "paper.totalMarks", evidenceRequest: "Confirm theory marks for SSC-I Mathematics from the Inclusive Scheme of Studies 2024 / 2027 Table of Specification." },
    { field: "paper.durationMinutes", evidenceRequest: "Confirm paper duration from the 2027 model paper or ToS." },
    { field: "paper.sections", evidenceRequest: "Confirm MCQ count, descriptive sections and internal choice rules from the 2027 ToS/model paper (structural reference only)." },
    { field: "paper.calculator", evidenceRequest: "Confirm the calculator rule in the 2027 model paper instructions." },
    { field: "tier", evidenceRequest: "Confirm with the school whether Science-group Mathematics or Humanities Functional Mathematics (notified 10 Aug 2026) is taught." },
    { field: "language", evidenceRequest: "Confirm the school's paper language (English or Urdu medium)." },
    { field: "rights", evidenceRequest: "Record permission/rights scope for using FBISE frameworks as reference material for each pilot school." },
    { field: "educatorApprover", evidenceRequest: "A qualified FBISE mathematics educator approves the synthetic paper, rubric and coverage report and sets the review date." },
  ],
};

/** Verified FBISE 2027 rule: MCQ marks equal half the paper total. Applied alongside the contract checks. */
export function fbisePatternErrors(contract: CurriculumContract): string[] {
  if (contract.board !== "FBISE" || Number(contract.examYear) < 2027) return [];
  const total = contract.paper.sections.reduce((sum, section) => sum + section.marks, 0);
  const mcq = contract.paper.sections.filter(section => section.format === "MCQ").reduce((sum, section) => sum + section.marks, 0);
  return total > 0 && mcq * 2 !== total ? [`FBISE 2027 papers need 50% MCQ marks (found ${mcq} of ${total}).`] : [];
}
