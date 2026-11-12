import { prisma } from "@/lib/db/prisma";
import { computeWeightedGrade, loadMarksByStudent, loadWeightedGradeContext } from "@/lib/academic/grade-calculator";

const UNFINISHED_EXAM = ["DRAFT", "ACTIVE", "MARKS_ENTRY"];

export type RolloverEvidence =
  | { evidence: "PASSED" | "FAILED"; detail: { percentage: number; grade: string } }
  | { evidence: "MISSING"; detail: { note: string } };

const noMarks: RolloverEvidence = { evidence: "MISSING", detail: { note: "No locked marks recorded for this year." } };
const failed = (error: unknown): RolloverEvidence => ({ evidence: "MISSING", detail: { note: error instanceof Error ? error.message : "The result could not be calculated." } });

/**
 * SKAI-1877: year-end evidence for every learner, a constant number of queries per class
 * (finished exams, who has marks, then the SKAI-1832 weighted-grade context and one mark read).
 * Each learner keeps its own outcome and error message, as when it was calculated one at a time.
 */
export async function rolloverEvidence(
  schoolId: string,
  campusId: string,
  year: number,
  learners: Array<{ id: string; fullName: string; classId: string }>,
): Promise<Map<string, RolloverEvidence>> {
  const result = new Map<string, RolloverEvidence>();
  const byClass = new Map<string, typeof learners>();
  for (const learner of learners) {
    const list = byClass.get(learner.classId);
    if (list) list.push(learner);
    else byClass.set(learner.classId, [learner]);
  }

  for (const [classId, roster] of byClass) {
    const exams = await prisma.exam.findMany({ where: { schoolId, campusId, classId, academicYear: year, status: { notIn: UNFINISHED_EXAM } }, select: { id: true } });
    const withMarks = exams.length
      ? new Set((await prisma.mark.groupBy({ by: ["studentId"], where: { schoolId, studentId: { in: roster.map(l => l.id) }, examId: { in: exams.map(e => e.id) } } })).map(r => r.studentId))
      : new Set<string>();
    const marked = roster.filter(l => withMarks.has(l.id));
    for (const learner of roster) if (!withMarks.has(learner.id)) result.set(learner.id, noMarks);
    if (!marked.length) continue;

    let loaded;
    try {
      const ctx = await loadWeightedGradeContext(campusId, classId, year);
      loaded = { ctx, marks: await loadMarksByStudent(ctx, campusId, marked.map(l => l.id), prisma) };
    } catch (error) {
      // Each learner used to load this itself and record the failure as its own evidence.
      for (const learner of marked) result.set(learner.id, failed(error));
      continue;
    }
    for (const learner of marked) {
      try {
        const grade = computeWeightedGrade(learner, loaded.ctx, loaded.marks.get(learner.id) ?? []);
        result.set(learner.id, { evidence: grade.passed ? "PASSED" : "FAILED", detail: { percentage: Math.round(grade.overallPercentage * 10) / 10, grade: grade.overallGrade } });
      } catch (error) {
        result.set(learner.id, failed(error));
      }
    }
  }
  return result;
}
