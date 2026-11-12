/**
 * SKAI-217: pure plan for the synthetic approved curricula the J03 objective-map QA needs (no DB access).
 * Two boards per school, with an identically titled objective, so QA can record a cross-board mapping.
 */
import type { CurriculumData } from "../../src/lib/school-ai/assessment";

export const CURRICULUM_BOARDS = [
  { key: "a", board: "Synthetic Board A", title: "QA Synthetic Board A mathematics" },
  { key: "b", board: "Synthetic Board B", title: "QA Synthetic Board B mathematics" },
] as const;

/** Boards to seed per QA school: two in qa-alpha (the mapping flow), one elsewhere (isolation checks). */
export function boardsFor(slug: string) {
  return slug === "qa-alpha" ? CURRICULUM_BOARDS : CURRICULUM_BOARDS.slice(0, 1);
}

export function curriculumFor(board: (typeof CURRICULUM_BOARDS)[number], subjectId: string, classId: string, academicYear: number): CurriculumData {
  const prefix = board.key.toUpperCase();
  return {
    subjectId, classId, academicYear: String(academicYear), board: board.board,
    pack: { packId: `qa-synthetic-board-${board.key}-maths`, version: 1, authority: board.board, edition: String(academicYear), language: "en", rights: "APPROVED" },
    sources: [{ id: "source-1", title: `${board.board} synthetic mathematics syllabus`, kind: "SYLLABUS", reference: "Synthetic test-only document page 1", excerpt: "Addition combines numbers. Subtraction finds the difference.", approved: true, url: "https://example.invalid/qa-synthetic-syllabus.pdf", checksum: "a".repeat(64), rightsScope: "Synthetic QA-only syllabus", reviewedAt: "2026-09-01T00:00:00.000Z" }],
    outcomes: [
      { id: `${board.key}-add`, code: `SB${prefix}.M.1`, title: "Add whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true },
      { id: `${board.key}-sub`, code: `SB${prefix}.M.2`, title: "Subtract whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: false, prerequisiteIds: [`${board.key}-add`] },
    ],
    sectionCoverage: [{ section: "Week 1", outcomeIds: [`${board.key}-add`], taughtOn: `${academicYear}-10-05`, confirmed: true }],
  };
}
