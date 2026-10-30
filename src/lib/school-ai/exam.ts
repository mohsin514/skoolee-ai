import { z } from "zod";
import type { PaperData, Question } from "./assessment";

/** Live server permissions for the marking desk; mutation endpoints still recheck every action. */
export interface ExamReviewCapabilities {
  canMark: boolean;
  canManage: boolean;
  canRevise: boolean;
  canRelease: boolean;
  canApproveAccommodation: boolean;
  canSendGradebook: boolean;
}

const id = z.string().trim().min(1).max(120);
export const examAssignmentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  paperId: id,
  title: z.string().trim().min(1).max(240),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  studentIds: z.array(id).min(1).max(500),
  mode: z.enum(["STANDARD", "SECURE_BROWSER", "PROCTORED"]),
  secureProfileId: id.optional(),
  /** SKO-500: the date-sheet row this sitting delivers; links the sitting to its paper request. */
  examScheduleId: id.optional(),
}).strict();

export const responsesSchema = z.record(id, z.string().max(20000)).refine((value) => Object.keys(value).length <= 100, "At most 100 answers are allowed.");
export const saveExamSchema = z.object({
  sequence: z.number().int().min(1).max(1000000),
  responses: responsesSchema,
  submit: z.boolean().optional(),
}).strict();

export const markingEvidenceSchema = z.object({ criterionId: id, quote: z.string().max(12000), marks: z.number().min(0).max(100) }).strict();
export const examKeyCorrectionSchema = z.object({ questionId: id, correctOptionId: id.optional(), correctOptionIds: z.array(id).min(1).max(8).optional(), numericKey: z.object({ value: z.number().finite(), tolerance: z.number().finite().min(0).max(1000000) }).strict().optional() }).strict();
export const examReviewSchema = z.object({
  keyCorrections: z.array(examKeyCorrectionSchema).max(100).optional(),
  marks: z.array(z.object({ questionId: id, marks: z.number().min(0).max(100), feedback: z.string().trim().min(1).max(4000), evidence: z.array(markingEvidenceSchema).max(30).optional(),
    // SKAI-1014: a marker who departs from an auto-scored objective item records why; it is audit-logged.
    override: z.object({ reason: z.string().trim().min(3).max(1000) }).strict().optional() }).strict()).max(100),
  note: z.string().trim().min(1).max(4000),
}).strict();

export const startExamSchema = z.object({ version: z.number().int().positive(), cameraReady: z.boolean().optional(), consentVersion: z.string().max(100).optional() }).strict();
export const examAccommodationSchema = z.object({
  extraMinutes: z.number().int().min(0).max(240),
  reason: z.string().trim().min(1).max(1000),
  breakMinutes: z.number().int().min(0).max(120).optional(),
  reader: z.boolean().optional(), scribe: z.boolean().optional(), largeText: z.boolean().optional(), cameraExempt: z.boolean().optional(),
  approvedById: id,
  approvedAt: z.string().datetime(),
}).strict();
export const examAccommodationsSchema = z.record(id, examAccommodationSchema)
  .refine((value) => Object.keys(value).length <= 500, "At most 500 student accommodations are allowed.");
export const approveExamAccommodationSchema = z.object({
  version: z.number().int().positive(), studentId: id,
  extraMinutes: z.number().int().min(0).max(240),
  reason: z.string().trim().min(1).max(1000),
  breakMinutes: z.number().int().min(0).max(120).optional(),
  reader: z.boolean().optional(), scribe: z.boolean().optional(), largeText: z.boolean().optional(), cameraExempt: z.boolean().optional(),
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
    else if (question.type === "MULTIPLE_CHOICE" && answer && (!parseMultipleChoice(answer) || parseMultipleChoice(answer)!.some(optionId => !question.options.some(option => option.id === optionId)))) errors.push(`Invalid choices for question ${questionId}.`);
    else if (question.type === "NUMERIC" && answer.trim() && parseNumericAnswer(answer) === null) errors.push(`Invalid number for question ${questionId}.`);
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
    if (question.type === "MULTIPLE_CHOICE") {
      const selected = parseMultipleChoice(response);
      const key = question.correctOptionIds ?? [];
      return { questionId: question.id, marks: selected && key.length && selected.length === key.length && key.every(value => selected.includes(value)) ? question.marks : 0, maximum: question.marks, state: "OBJECTIVE" };
    }
    if (question.type === "NUMERIC") {
      const value = parseNumericAnswer(response), key = question.numericKey;
      const difference = value !== null && key ? Math.abs(value - key.value) : Infinity;
      const rounding = key ? Number.EPSILON * Math.max(1, Math.abs(key.value), Math.abs(value ?? 0)) * 4 : 0;
      return { questionId: question.id, marks: key && difference <= key.tolerance + rounding ? question.marks : 0, maximum: question.marks, state: "OBJECTIVE" };
    }
    return { questionId: question.id, marks: null, maximum: question.marks, state: "NEEDS_REVIEW" };
  });
  return { questions, totalObjectiveMarks: questions.reduce((sum, question) => sum + (question.marks ?? 0), 0), pendingReviewCount: questions.filter((question) => question.state === "NEEDS_REVIEW").length };
}

export function validateExamReview(paper: PaperData, responses: ExamResponses, review: ExamReview): string[] {
  const errors: string[] = [];
  if (review.keyCorrections) { try { correctedExamPaper(paper, review.keyCorrections); } catch (error) { errors.push(error instanceof Error ? error.message : "Invalid key correction."); } }
  if (new Set(review.marks.map((mark) => mark.questionId)).size !== review.marks.length) errors.push("A question can be reviewed only once.");
  for (const mark of review.marks) {
    const question = paper.questions.find((item) => item.id === mark.questionId);
    if (!question || mark.marks > question.marks) errors.push(`Invalid marks for ${mark.questionId}.`);
    if (question && mark.evidence) {
      if (new Set(mark.evidence.map(item => item.criterionId)).size !== mark.evidence.length) errors.push(`Question ${mark.questionId}: evidence criteria must be unique.`);
      if (mark.evidence.length !== question.rubric.length) errors.push(`Question ${mark.questionId}: review every rubric criterion.`);
      for (const item of mark.evidence) {
        const criterion = question.rubric.find(row => row.id === item.criterionId);
        if (!criterion || item.marks > criterion.marks || (item.marks > 0 && (!item.quote.trim() || !responses[mark.questionId]?.includes(item.quote))) || (item.quote && !responses[mark.questionId]?.includes(item.quote))) errors.push(`Question ${mark.questionId}: criterion marks need exact response evidence within the rubric maximum.`);
      }
      if (Math.abs(mark.evidence.reduce((sum, item) => sum + item.marks, 0) - mark.marks) > 0.00001) errors.push(`Question ${mark.questionId}: criterion evidence must total the proposed marks.`);
    }
    if (!responses[mark.questionId]?.trim() && mark.marks !== 0) errors.push(`Unanswered question ${mark.questionId} cannot receive marks.`);
  }
  if (paper.questions.some((question) => responses[question.id]?.trim() && !review.marks.some((mark) => mark.questionId === question.id))) errors.push("Review every answered question before finalizing.");
  // SKAI-1014: decimal marks (e.g. 3 × 1.1) must not trip binary rounding; same tolerance as paper validation.
  if (review.marks.reduce((sum, mark) => sum + mark.marks, 0) > paper.blueprint.totalMarks + 0.00001) errors.push("Reviewed marks exceed the paper total.");
  return errors;
}

export type ObjectiveOverride = { questionId: string; autoMarks: number; marks: number; reason: string };

/**
 * SKAI-1014 owner decision: an auto-scored objective item is never changed silently. A mark that differs
 * from the auto score (after this review's key corrections) needs an override reason; the caller audit-logs
 * each override. A key correction remains the normal path for a wrong key. A mark carried forward unchanged
 * from the previous stored review is not a new change.
 */
export function objectiveOverrides(paper: PaperData, responses: ExamResponses, review: ExamReview, previous?: { marks?: { questionId: string; marks: number }[] } | null): { errors: string[]; overrides: ObjectiveOverride[] } {
  const errors: string[] = [], overrides: ObjectiveOverride[] = [];
  let scored: PaperData;
  try { scored = review.keyCorrections?.length ? correctedExamPaper(paper, review.keyCorrections) : paper; } catch { return { errors, overrides }; }
  const auto = new Map(scoreObjectiveResponses(scored, responses).questions.filter(row => row.state === "OBJECTIVE").map(row => [row.questionId, row.marks ?? 0]));
  const before = new Map((previous?.marks ?? []).map(mark => [mark.questionId, mark.marks]));
  for (const mark of review.marks) {
    const autoMarks = auto.get(mark.questionId);
    if (autoMarks === undefined) {
      if (mark.override) errors.push(`Question ${mark.questionId} is not auto-scored; an override applies only to objective items.`);
      continue;
    }
    if (Math.abs(mark.marks - autoMarks) <= 0.00001) continue;
    const carried = !review.keyCorrections?.length && before.has(mark.questionId) && Math.abs((before.get(mark.questionId) ?? 0) - mark.marks) <= 0.00001;
    if (carried && !mark.override) continue;
    if (!mark.override) { errors.push(`Question ${mark.questionId} is auto-scored at ${autoMarks}. Correct the answer key, or record an override reason to award ${mark.marks}.`); continue; }
    overrides.push({ questionId: mark.questionId, autoMarks, marks: mark.marks, reason: mark.override.reason });
  }
  return { errors, overrides };
}

export const DELIVERED_EXAM_MODES = ["STANDARD", "SECURE_BROWSER"];
export function assertSupportedExamMode(mode: "STANDARD" | "SECURE_BROWSER" | "PROCTORED"): void {
  // SKO-449: SECURE_BROWSER is delivered only with an approved, tested Safe Exam Browser profile (checked at assignment).
  if (mode === "PROCTORED") throw new Error("Recorded proctoring mode requires a configured, tested integration and is not enabled. Use a standard browser exam or supervised classroom assessment.");
}

export type SaveDecision = "SAVE" | "REPLAY" | "STALE" | "EXPIRED" | "FINISHED";
export function examSaveDecision(input: { status: string; sequence: number; currentSequence: number; deadlineAt: Date; now: Date; submit: boolean }): SaveDecision {
  if (input.status !== "IN_PROGRESS") return "FINISHED";
  if (input.now.getTime() >= input.deadlineAt.getTime()) return "EXPIRED";
  if (input.sequence < input.currentSequence) return "STALE";
  if (input.sequence === input.currentSequence) return "REPLAY";
  return "SAVE";
}

/** Canonical string storage keeps existing sequenced autosave compatible with advanced editors. */
export function parseMultipleChoice(raw: string): string[] | null {
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) && value.length > 0 && value.length <= 8 && value.every(item => typeof item === "string" && item.length > 0 && item.length <= 120) && new Set(value).size === value.length ? value : null; } catch { return null; }
}
export function parseNumericAnswer(raw: string): number | null {
  // Bidi controls (LRM/RLM/ALM/isolates) and the Unicode minus arrive from RTL keyboards and pasted
  // typeset maths; they must not turn a correct number into a zero.
  const normalized = raw.replace(/[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g, "").trim().replace(/^[\u2212\u2013]/, "-").replace(/[٠-٩]/g, char => String(char.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, char => String(char.charCodeAt(0) - 1776)).replace(/٫/g, ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d{1,3})?$/.test(normalized)) return null;
  const value = Number(normalized); return Number.isFinite(value) ? value : null;
}
export function displayExamResponse(question: Pick<Question, "type" | "options">, raw: string): string {
  if (question.type === "SINGLE_CHOICE") return question.options.find(option => option.id === raw)?.text ?? raw;
  if (question.type === "MULTIPLE_CHOICE") return (parseMultipleChoice(raw) ?? []).map(id => question.options.find(option => option.id === id)?.text ?? id).join("; ");
  return raw;
}

export function correctedExamPaper(paper: PaperData, corrections: z.infer<typeof examKeyCorrectionSchema>[]): PaperData {
 const parsed = z.array(examKeyCorrectionSchema).min(1).max(100).parse(corrections);
 if (new Set(parsed.map(row => row.questionId)).size !== parsed.length) throw new Error("Each answer key may be corrected once.");
 const questions = paper.questions.map(question => ({ ...question }));
 for (const correction of parsed) {
  const question = questions.find(row => row.id === correction.questionId);
  if (!question) throw new Error("A corrected key refers to an unknown question.");
  if (question.type === "SINGLE_CHOICE") {
   if (!correction.correctOptionId || correction.correctOptionIds || correction.numericKey || !question.options.some(row => row.id === correction.correctOptionId)) throw new Error("Choose one valid corrected option.");
   question.correctOptionId = correction.correctOptionId;
  } else if (question.type === "MULTIPLE_CHOICE") {
   if (!correction.correctOptionIds?.length || correction.correctOptionId || correction.numericKey || new Set(correction.correctOptionIds).size !== correction.correctOptionIds.length || correction.correctOptionIds.some(id => !question.options.some(row => row.id === id))) throw new Error("Choose distinct valid corrected options.");
   question.correctOptionIds = correction.correctOptionIds;
  } else if (question.type === "NUMERIC") {
   if (!correction.numericKey || correction.correctOptionId || correction.correctOptionIds) throw new Error("Provide the corrected number and tolerance.");
   question.numericKey = correction.numericKey;
  } else throw new Error("Written questions require rubric moderation, not an objective key correction.");
 }
 return { ...paper, questions };
}
