import type { CurriculumContract } from "../curriculum-contract";

/**
 * SKAI-1010 (D2-04): BISE Lahore SSC Part-I (Class IX) Mathematics, Annual Examination 2027.
 *
 * Exam year 2027 and teaching year 2026-27 are the values PR #159 pinned for this pack. The
 * #159 objective-map record (`assessment.ts` pack checks) links here by `packId`/`version`
 * (see `biseLahoreObjectiveMapPack`), so the facts below are not duplicated there.
 *
 * Retrieved from the official BISE Lahore site on 2026-10-29 (SHA-256 recorded below):
 * - "Syllabi and courses of reading, 9th & 10th (2025-27)": Science-group Mathematics Part-I (Class IX)
 *   is 75 marks, 2:30 hours. That booklet is the 2025-27 session, whose Part-I examination is the Annual
 *   Examination 2026. #159 treats 2026 rules as historical, so the 75 marks are NOT carried into 2027.
 * - PECTAA No. PECTAA/C&C Unit/2025/134 (14 Jul 2025): a single Mathematics textbook for Grade 9 Science
 *   and Humanities groups from session 2025-26. Issued to BISE Gujranwala; republished by BISE Lahore.
 *
 * Everything else is in `unverified`, so the pack stays DRAFT and cannot activate.
 */
export const BISE_LAHORE_G9_MATHEMATICS_PACK_ID = "bise-lahore-ssc1-mathematics-2027";

export const biseLahoreGrade9MathematicsPack: CurriculumContract = {
  packId: BISE_LAHORE_G9_MATHEMATICS_PACK_ID,
  version: 1,
  status: "DRAFT",
  board: "BISE_LAHORE",
  qualification: "SSC Part-I (Class IX)",
  examSession: "Annual Examination",
  examYear: "2027",
  teachingYear: "2026-27",
  gradeMapping: { boardLevel: "SSC Part-I", schoolGrade: "9" },
  term: "Annual",
  subject: "Mathematics",
  tier: "Science group",
  language: "ur",
  outcomes: [],
  paper: { sections: [], calculator: "UNVERIFIED", rules: [] },
  sources: [
    {
      id: "bise-lhr-syllabus-9-10-2025-27",
      kind: "SYLLABUS",
      authority: "Board of Intermediate & Secondary Education, Lahore",
      reference: "Syllabi and Courses of Reading, 9th & 10th (2025-27)",
      edition: "Session 2025-27",
      url: "https://data.biselahore.com/dt/downloads/notifications/misc/Syllabus_9th&10th_(2025_27).pdf",
      retrievedOn: "2026-10-29",
      checksumSha256: "cea7298f97d72494572bc933416e4014b29151babaffc50163a322bf25f431cc",
      applicability: "Session 2025-27 only (Part-I sat in the Annual Examination 2026): Mathematics Part-I 75 marks, 2:30 hours. Historical for this 2027 pack; not a 2027 paper specification.",
    },
    {
      id: "pectaa-cc-2025-134",
      kind: "NOTICE",
      authority: "Punjab Education, Curriculum, Training and Assessment Authority (PECTAA), Lahore",
      reference: "No. PECTAA/C&C Unit/2025/134",
      issuedOn: "2025-07-14",
      edition: "Scheme of Studies Grades 9-10 from session 2025 (Notification No. M-49-03/PCTB/2024)",
      url: "https://data.biselahore.com/dt/downloads/notifications/misc/PCTB_MathBook.pdf",
      retrievedOn: "2026-10-29",
      checksumSha256: "5e45c3bcdcc8d7762320a00bd1441d99c1273a87c690bbec41b2ffdf65b4da27",
      applicability: "Grade 9 Science and Humanities groups study one Mathematics textbook from session 2025-26. Textbook identity only; not paper rules.",
    },
  ],
  register: { reviewTrigger: "Any new BISE Lahore or PBCC notice, syllabus booklet, scheme of studies or model paper for SSC Part-I Mathematics; or the school's exam year changes." },
  unverified: [
    { field: "outcomes", evidenceRequest: "Obtain the BISE Lahore SSC Part-I Mathematics syllabus that applies to the Annual Examination 2027 (session 2026-28). The 9th_Booklet_Reg_Sess2026-28.pdf is a scanned registration booklet and was not verified." },
    { field: "paper.totalMarks", evidenceRequest: "Confirm Part-I Mathematics theory marks for the Annual Examination 2027. The 75 marks in the 2025-27 booklet are historical (2026)." },
    { field: "paper.durationMinutes", evidenceRequest: "Confirm the 2027 paper duration from the session 2026-28 syllabus or model paper." },
    { field: "paper.sections", evidenceRequest: "Confirm objective/subjective sections, question counts and internal choice from the 2027 BISE Lahore model paper (structural reference only)." },
    { field: "paper.calculator", evidenceRequest: "Confirm the calculator rule in the 2027 paper instructions." },
    { field: "tier", evidenceRequest: "Confirm with the school whether the Science or Humanities group is taught (both use one Mathematics textbook per PECTAA/C&C Unit/2025/134)." },
    { field: "language", evidenceRequest: "Confirm the school's paper language (Urdu or English medium)." },
    { field: "rights", evidenceRequest: "Record permission/rights scope for using BISE Lahore and PECTAA documents as reference material for each pilot school." },
    { field: "educatorApprover", evidenceRequest: "A qualified BISE Lahore mathematics educator approves the synthetic paper, rubric and coverage report and sets the review date." },
  ],
};

/** Pilot geography for this pack: a Lahore campus only. Other Punjab boards cannot borrow it. */
export const BISE_LAHORE_G9_MATHEMATICS_GEOGRAPHIES = ["PAKISTAN_LAHORE"] as const;

/** The #159 objective-map `pack` identity, read from this contract rather than re-typed. */
export function biseLahoreObjectiveMapPack(contract: CurriculumContract = biseLahoreGrade9MathematicsPack) {
  return {
    packId: contract.packId, version: contract.version, authority: "BISE Lahore", edition: `${contract.examYear}-annual`,
    language: contract.language, examYear: contract.examYear, teachingYear: contract.teachingYear,
    grade: contract.gradeMapping.schoolGrade, term: contract.term,
  };
}
