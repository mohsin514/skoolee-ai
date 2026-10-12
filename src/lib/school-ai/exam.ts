import { z } from "zod";
import type { PaperData } from "./assessment";

const id = z.string().trim().min(1).max(120);
export const examAssignmentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  paperId: id,
  title: z.string().trim().min(1).max(240),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  studentIds: z.array(id).min(1).max(500),
  mode: z.enum(["STANDARD", "SECURE_BROWSER", "PROCTORED"]),
}).strict();

export const responsesSchema = z.record(id, z.string().max(20000)).refine((value) => Object.keys(value).length <= 100, "At most 100 answers are allowed.");
export const saveExamSchema = z.object({
  sequence: z.number().int().min(1).max(1000000),
  responses: responsesSchema,
  submit: z.boolean().optional(),
}).strict();

export const examReviewSchema = z.object({
  marks: z.array(z.object({ questionId: id, marks: z.number().min(0).max(100), feedback: z.string().trim().min(1).max(4000) }).strict()).max(100),
  note: z.string().trim().min(1).max(4000),
}).strict();

export const startExamSchema = z.object({ version: z.number().int().positive() }).strict();
export const examAccommodationSchema = z.object({
  extraMinutes: z.number().int().min(0).max(240),
  reason: z.string().trim().min(1).max(1000),
  approvedById: id,
  approvedAt: z.string().datetime(),
}).strict();
export const examAccommodationsSchema = z.record(id, examAccommodationSchema)
  .refine((value) => Object.keys(value).length <= 500, "At most 500 student accommodations are allowed.");
export const approveExamAccommodationSchema = z.object({
  version: z.number().int().positive(), studentId: id,
  extraMinutes: z.number().int().min(0).max(240),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export type ExamResponses = z.infer<typeof responsesSchema>;
export type ExamReview = z.infer<typeof examReviewSchema>;
export type ScoreProposal = { totalObjectiveMarks: number; pendingReviewCount: number; questions: Array<{ questionId: string; marks: number | null; maximum: number; state: "UNANSWERED" | "OBJECTIVE" | "NEEDS_REVIEW" }> };

export function validateExamWindow(startsAt: Date, endsAt: Date, now: Date): string | null {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) return "Exam end must be after its start.";
  if (endsAt <= now) return "The exam window has already ended.";
  if (endsAt.getTime() - startsAt.getTime() > 7 * 24 * 60 * 60 * 1000) return "The exam availability window cannot exceed seven days.";
  return null;
}

export function attemptDeadline(startedAt: Date, endsAt: Date, durationMinutes: number): Date {
  return new Date(Math.min(endsAt.getTime(), startedAt.getTime() + durationMinutes * 60000));
}

export function validateResponses(paper: PaperData, responses: ExamResponses): string[] {
  const errors: string[] = [];
  for (const [questionId, answer] of Object.entries(responses)) {
    const question = paper.questions.find((item) => item.id === questionId);
    if (!question) errors.push("An answer refers to an unknown question.");
    else if (question.type === "SINGLE_CHOICE" && answer && !question.options.some((option) => option.id === answer)) errors.push(`Invalid choice for question ${questionId}.`);
  }
  for (const section of paper.blueprint.sections) {
    const answered = paper.questions.filter((question) => question.sectionId === section.id && responses[question.id]?.trim());
    if (answered.length > section.answerCount) errors.push(`${section.title}: answer at most ${section.answerCount} questions; clear an answer to change your selection.`);
  }
  return errors;
}

/** Written responses remain ungraded proposals. Empty/missing answers never become invented work. */
export function scoreObjectiveResponses(paper: PaperData, responses: ExamResponses): ScoreProposal {
  const questions: ScoreProposal["questions"] = paper.questions.map((question) => {
    const response = responses[question.id]?.trim();
    if (!response) return { questionId: question.id, marks: 0, maximum: question.marks, state: "UNANSWERED" };
    if (question.type === "SINGLE_CHOICE") return { questionId: question.id, marks: response === question.correctOptionId ? question.marks : 0, maximum: question.marks, state: "OBJECTIVE" };
    return { questionId: question.id, marks: null, maximum: question.marks, state: "NEEDS_REVIEW" };
  });
  return { questions, totalObjectiveMarks: questions.reduce((sum, question) => sum + (question.marks ?? 0), 0), pendingReviewCount: questions.filter((question) => question.state === "NEEDS_REVIEW").length };
}

export function validateExamReview(paper: PaperData, responses: ExamResponses, review: ExamReview): string[] {
  const errors: string[] = [];
  if (new Set(review.marks.map((mark) => mark.questionId)).size !== review.marks.length) errors.push("A question can be reviewed only once.");
  for (const mark of review.marks) {
    const question = paper.questions.find((item) => item.id === mark.questionId);
    if (!question || mark.marks > question.marks) errors.push(`Invalid marks for ${mark.questionId}.`);
    if (!responses[mark.questionId]?.trim() && mark.marks !== 0) errors.push(`Unanswered question ${mark.questionId} cannot receive marks.`);
  }
  if (paper.questions.some((question) => responses[question.id]?.trim() && !review.marks.some((mark) => mark.questionId === question.id))) errors.push("Review every answered question before finalizing.");
  if (review.marks.reduce((sum, mark) => sum + mark.marks, 0) > paper.blueprint.totalMarks) errors.push("Reviewed marks exceed the paper total.");
  return errors;
}

export function assertSupportedExamMode(mode: "STANDARD" | "SECURE_BROWSER" | "PROCTORED"): void {
  if (mode !== "STANDARD") throw new Error("Secure browser and recorded proctoring require a configured, tested integration and are not enabled. Use a standard browser exam or supervised classroom assessment.");
}

export type SaveDecision = "SAVE" | "REPLAY" | "STALE" | "EXPIRED" | "FINISHED";
export function examSaveDecision(input: { status: string; sequence: number; currentSequence: number; deadlineAt: Date; now: Date; submit: boolean }): SaveDecision {
  if (input.status !== "IN_PROGRESS") return "FINISHED";
  if (input.now.getTime() >= input.deadlineAt.getTime()) return "EXPIRED";
  if (input.sequence < input.currentSequence) return "STALE";
  if (input.sequence === input.currentSequence) return "REPLAY";
  return "SAVE";
}
