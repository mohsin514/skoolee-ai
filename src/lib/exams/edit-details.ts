import { z } from "zod";

/**
 * SKAI-1120: exam detail edits (title, term, examType). Dates and max marks live on the
 * exam schedule and are edited there, so they are deliberately not accepted here.
 */
export const examDetailsEditSchema = z
  .object({
    id: z.string().min(1, "Exam id required"),
    title: z.string().trim().min(1, "Exam title required").max(200, "Exam title is too long (max 200 characters)").optional(),
    term: z.string().trim().min(1, "Term required").max(100, "Term is too long (max 100 characters)").optional(),
    examType: z.enum(["QUIZ", "CLASS_TEST", "MID_TERM", "FINAL", "CUSTOM"]).optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.term !== undefined || v.examType !== undefined, {
    message: "Nothing to update",
  });

export type ExamDetailsEdit = z.infer<typeof examDetailsEditSchema>;

/** A PATCH body without `status` but with any detail field is a details edit. */
export function isExamDetailsEdit(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return b.status === undefined && (b.title !== undefined || b.term !== undefined || b.examType !== undefined);
}

type ExamDetails = { title: string; term: string; examType: string };

/** Returns only the fields that actually change, as before/after snapshots for the audit log. */
export function diffExamDetails(current: ExamDetails, edit: ExamDetailsEdit) {
  const before: Partial<ExamDetails> = {};
  const after: Partial<ExamDetails> = {};
  for (const key of ["title", "term", "examType"] as const) {
    const next = edit[key];
    if (next !== undefined && next !== current[key]) {
      before[key] = current[key];
      after[key] = next;
    }
  }
  return { before, after, changed: Object.keys(after).length > 0 };
}
