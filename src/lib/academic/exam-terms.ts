/**
 * SKO-500: the one list of exam terms. Reports and the academic model match these human labels, so
 * they are the stored values; any spelling a planner or import produces ("TERM_1", "term 1") maps here.
 */
export const EXAM_TERM_LABELS = ["Term 1", "Term 2", "Term 3", "Annual"] as const;
export type ExamTermLabel = (typeof EXAM_TERM_LABELS)[number];
export function normaliseExamTerm(value: string): ExamTermLabel | null {
  const folded = value.trim().toLowerCase().replace(/[_\s-]+/g, " ");
  if (folded === "annual" || folded === "year" || folded === "full year") return "Annual";
  const match = /^term ?([123])$/.exec(folded);
  return match ? (`Term ${match[1]}` as ExamTermLabel) : null;
}
