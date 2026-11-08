import type { CurriculumContract } from "../../../src/lib/school-ai/curriculum-contract";

/**
 * SKAI-1106: a synthetic second-market curriculum fixture (IB Diploma, UAE campus). Every value is a
 * test fixture, not a curriculum fact: it proves a new board travels the contract → catalogue →
 * activation → gate path as data, with no board-specific code beyond its one rule-table entry.
 */
export const ibDpMathematicsAaSlFixture: CurriculumContract = {
  packId: "synthetic-ib-dp-maths-aa-sl-2027",
  version: 1,
  status: "DRAFT",
  board: "IB",
  qualification: "Synthetic IB Diploma Programme",
  examSession: "May",
  examYear: "2027",
  teachingYear: "2025-26",
  gradeMapping: { boardLevel: "DP2", schoolGrade: "Grade 12" },
  term: "Two-year course",
  subject: "Mathematics: Analysis and Approaches",
  tier: "SL",
  language: "en",
  outcomes: [
    { code: "SYN-AA-1", statement: "Synthetic outcome: number and algebra", assessed: true },
    { code: "SYN-AA-2", statement: "Synthetic outcome: internal assessment exploration", assessed: false },
  ],
  paper: {
    totalMarks: 80,
    durationMinutes: 90,
    sections: [{ id: "A", format: "SHORT", marks: 40, questionCount: 8, attempt: 8 }, { id: "B", format: "LONG", marks: 40, questionCount: 3, attempt: 3 }],
    calculator: "NOT_ALLOWED",
    rules: ["Synthetic rule: answer every question."],
  },
  sources: [{ id: "syn-ib-guide", kind: "SYLLABUS", authority: "Synthetic Awarding Body", reference: "SYN/IB/1", edition: "2027", url: "https://example.test/ib-guide.pdf", retrievedOn: "2026-10-29", checksumSha256: "c".repeat(64), applicability: "QA schools only" }],
  register: { reviewTrigger: "A new subject guide edition." },
  unverified: [],
};
