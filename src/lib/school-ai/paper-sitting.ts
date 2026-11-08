import { ApiError } from "@/lib/api/scope";
import type { PaperData } from "./assessment";

export const PAPER_GRADEBOOK_AUDIT_TABLE = "exam_paper_gradebook_transfers";

/** A completed hand-marked script includes the required answers in every section.
 * Zero is an explicit unattempted answer; omitted optional questions are not scored. */
export function totalScriptMarks(paper: PaperData, marks: Record<string, number>): number {
  const questions = new Map(paper.questions.map(question => [question.id, question]));
  for (const [id, value] of Object.entries(marks)) {
    const question = questions.get(id);
    if (!question) throw new ApiError("A mark names a question that is not in the paper.", 422);
    if (!Number.isFinite(value) || value < 0 || value > question.marks) throw new ApiError(`Question ${id} is out of ${question.marks}.`, 422);
  }
  for (const section of paper.blueprint.sections) {
    const marked = paper.questions.filter(question => question.sectionId === section.id && Object.hasOwn(marks, question.id));
    if (marked.length !== section.answerCount) throw new ApiError(`${section.title}: enter marks for exactly ${section.answerCount} answers. Enter 0 for an unanswered question and leave unused choices blank.`, 422);
  }
  const total = Object.values(marks).reduce((sum, value) => sum + value, 0);
  if (total > paper.blueprint.totalMarks + 1e-8) throw new ApiError("The marks exceed the paper's total.", 422);
  return Math.round(total * 10000) / 10000;
}

/** Every roster member needs attendance; only present candidates need a completed script. */
export function paperSittingCompletion(sections: ReadonlyArray<ReadonlyArray<{ attendance: string | null; marked: boolean }>>) {
  const attendanceComplete = sections.length > 0 && sections.every(pupils => pupils.length > 0 && pupils.every(pupil => pupil.attendance === "PRESENT" || pupil.attendance === "ABSENT"));
  return { attendanceComplete, marksComplete: attendanceComplete && sections.every(pupils => pupils.every(pupil => pupil.attendance === "ABSENT" || pupil.marked)) };
}
