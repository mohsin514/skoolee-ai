import { z } from "zod";
import { roundConfigured } from "@/lib/academic/model-config";
import type { GradeThresholds } from "@/lib/academic/grade-calculator";

const id = z.string().min(1).max(128);
export const gradebookConversionSchema = z.enum(["EXACT", "PROPORTIONAL_WHOLE"]);
export type GradebookConversion = z.infer<typeof gradebookConversionSchema>;
export const gradebookPublicationInputSchema = z.strictObject({
  examId: id, conversion: gradebookConversionSchema, version: z.number().int().positive(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: z.string().uuid(),
});
export const gradebookRowSchema = z.strictObject({
  attemptId: id, studentId: id, reviewedAt: z.string().datetime(), reviewedById: id,
  reviewHash: z.string().regex(/^[a-f0-9]{64}$/), rawTotal: z.number().finite().min(0),
  targetMark: z.number().int().min(0), grade: z.string().max(40), markId: id,
});
export const gradebookPublicationSchema = z.strictObject({
  id: z.string().uuid(), assignmentId: id, assignmentVersion: z.number().int().positive(),
  paperId: id, paperVersion: z.number().int().positive(), examId: id, subjectId: id,
  conversion: gradebookConversionSchema, previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/), createdById: id, idempotencyKey: z.string().uuid(),
  createdAt: z.string().datetime(), sourceMaximum: z.number().positive(), targetMaximum: z.number().int().positive(),
  academicYear: z.number().int(), examTitle: z.string().max(240), subjectName: z.string().max(240),
  rows: z.array(gradebookRowSchema).min(1).max(500), unenteredStudentIds: z.array(id).max(500),
  thresholds: z.strictObject({ aplus: z.number(), a: z.number(), b: z.number(), c: z.number(), d: z.number() }),
  resultRoundingRule: z.enum(["WHOLE", "ONE_DECIMAL", "TWO_DECIMALS"]),
});
export type GradebookPublication = z.infer<typeof gradebookPublicationSchema>;
export type GradebookOutcomeState = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "REVIEWED" | "UNAVAILABLE";
export interface GradebookOutcome { studentId: string; fullName: string | null; rollNo: string | null; state: GradebookOutcomeState }
export interface GradebookCounts { assigned: number; notStarted: number; inProgress: number; submitted: number; reviewed: number; unavailable: number }
export interface GradebookOptions {
  assignmentVersion: number; assignmentTitle: string; windowClosed: boolean; endsAt: string;
  subject: { id: string; name: string; totalMarks: number }; counts: GradebookCounts; outcomes: GradebookOutcome[];
  exams: Array<{ id: string; title: string; term: string; academicYear: number; status: string }>;
  publication: GradebookPublication | null;
  /** SKO-504: sent marks that no longer match their result or were changed in the gradebook. */
  drift: GradebookDrift[];
}
export interface GradebookDrift { studentId: string; fullName: string | null; kind: "RESULT_CORRECTED" | "MARK_EDITED" | "MARK_MISSING"; sent: number; current: number | null }

/** SKO-504: compare each sent row with its result now and with the gradebook mark now. */
export function gradebookDrift(publication: GradebookPublication, attempts: ReadonlyArray<{ id: string; review: unknown }>, marks: ReadonlyArray<{ id: string; marksObtained: number }>, names: ReadonlyMap<string, string>): GradebookDrift[] {
  return publication.rows.flatMap((row): GradebookDrift[] => {
    const fullName = names.get(row.studentId) ?? null;
    const mark = marks.find(entry => entry.id === row.markId);
    const total = (attempts.find(entry => entry.id === row.attemptId)?.review as { total?: unknown } | null)?.total;
    const current = typeof total === "number" ? convertGradebookMark(total, publication.sourceMaximum, publication.targetMaximum, publication.conversion) : null;
    if (current !== null && current !== row.targetMark) return [{ studentId: row.studentId, fullName, kind: "RESULT_CORRECTED", sent: row.targetMark, current }];
    if (!mark) return [{ studentId: row.studentId, fullName, kind: "MARK_MISSING", sent: row.targetMark, current: null }];
    if (mark.marksObtained !== row.targetMark) return [{ studentId: row.studentId, fullName, kind: "MARK_EDITED", sent: row.targetMark, current: mark.marksObtained }];
    return [];
  });
}
export type GradebookBlocker = "WINDOW_OPEN" | "PENDING_MODERATION" | "NO_REVIEWED_ATTEMPTS" | "STUDENT_SCOPE_CHANGED" | "MARKS_EXIST" | "REPORTS_EXIST" | "CONVERSION_REQUIRED" | "INVALID_REVIEW";
export interface GradebookPreview {
  assignmentId: string; assignmentVersion: number; assignmentTitle: string; paperVersion: number;
  exam: GradebookOptions["exams"][number]; subject: GradebookOptions["subject"];
  conversion: GradebookConversion; sourceMaximum: number; targetMaximum: number;
  counts: GradebookCounts; outcomes: GradebookOutcome[]; blockers: GradebookBlocker[];
  rows: Array<Omit<z.infer<typeof gradebookRowSchema>, "markId"> & { fullName: string; rollNo: string }>;
  unenteredStudentIds: string[]; thresholds: GradeThresholds; resultRoundingRule: "WHOLE" | "ONE_DECIMAL" | "TWO_DECIMALS";
  sourceHash: string; previewHash: string;
}

/** Mark.marksObtained is an integer. Scaling/rounding must be explicitly selected and previewed. */
export function convertGradebookMark(raw: number, sourceMaximum: number, targetMaximum: number, conversion: GradebookConversion): number | null {
  if (![raw, sourceMaximum, targetMaximum].every(Number.isFinite) || sourceMaximum <= 0 || !Number.isSafeInteger(targetMaximum) || targetMaximum <= 0 || raw < 0 || raw > sourceMaximum) return null;
  if (conversion === "EXACT") return sourceMaximum === targetMaximum && Number.isSafeInteger(raw) ? raw : null;
  return Math.min(targetMaximum, roundConfigured(raw / sourceMaximum * targetMaximum, "WHOLE"));
}

export function countGradebookOutcomes(outcomes: GradebookOutcome[]): GradebookCounts {
  const count = (state: GradebookOutcomeState) => outcomes.filter(item => item.state === state).length;
  return { assigned: outcomes.length, notStarted: count("NOT_STARTED"), inProgress: count("IN_PROGRESS"), submitted: count("SUBMITTED"), reviewed: count("REVIEWED"), unavailable: count("UNAVAILABLE") };
}
