import { z } from "zod";
import type { PaperData } from "./assessment";
import { gradebookConversionSchema, type GradebookConversion } from "./exam-gradebook";

export const paperGradebookSendSchema = z.strictObject({ conversion: gradebookConversionSchema, previewHash: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: z.string().uuid() });
const receiptRow = z.object({ studentId: z.string(), fullName: z.string(), rollNo: z.string().nullable(), scriptId: z.string().nullable(), scriptVersion: z.number().int().nullable(), markId: z.string(), rawTotal: z.number().nullable(), targetMark: z.number().int(), isAbsent: z.boolean(), grade: z.string().nullable() });
const outcomeEvidence = z.object({ id: z.string(), title: z.string(), earned: z.number(), possible: z.number(), scoredShare: z.number(), candidates: z.number().int() });
export const paperGradebookReceiptSchema = z.object({ id: z.string().uuid(), slotId: z.string(), scheduleId: z.string(), examId: z.string(), examTitle: z.string(), subjectId: z.string(), subjectName: z.string(), paperId: z.string(), paperVersion: z.number().int(), curriculumId: z.string(), curriculumVersion: z.number().int(), sealHash: z.string(), sourceMaximum: z.number(), targetMaximum: z.number(), conversion: gradebookConversionSchema, previewHash: z.string(), idempotencyKey: z.string().uuid(), createdAt: z.string(), createdById: z.string(), rows: z.array(receiptRow), outcomes: z.array(outcomeEvidence) });
export type PaperGradebookReceipt = z.infer<typeof paperGradebookReceiptSchema>;
export const PAPER_GRADEBOOK_BLOCKERS = ["ATTENDANCE_INCOMPLETE", "MARKS_INCOMPLETE", "INVALID_SCRIPT", "CONVERSION_REQUIRED", "MARKS_EXIST", "TARGET_LOCKED", "REPORTS_EXIST", "EMPTY_ROSTER"] as const;
export type PaperGradebookBlocker = (typeof PAPER_GRADEBOOK_BLOCKERS)[number];
export interface PaperOutcomeEvidence { id: string; title: string; earned: number; possible: number; scoredShare: number; candidates: number }
export interface PaperGradebookPreview {
  slotId: string; scheduleId: string; examId: string; examTitle: string; subjectName: string;
  sourceMaximum: number; targetMaximum: number; conversion: GradebookConversion; previewHash: string;
  rows: Array<{ studentId: string; fullName: string; rollNo: string | null; scriptId: string | null; scriptVersion: number | null; rawTotal: number | null; targetMark: number | null; isAbsent: boolean; grade: string | null }>;
  blockers: PaperGradebookBlocker[]; outcomes: PaperOutcomeEvidence[]; receipt: PaperGradebookReceipt | null;
  drift: Array<{ studentId: string; fullName: string; sent: number; current: number | null }>;
}

/** Score evidence only: a selected question contributes to each outcome it explicitly maps to.
 * Optional questions left blank and absent pupils contribute neither marks nor candidates. */
export function paperOutcomeEvidence(paper: PaperData, scripts: ReadonlyArray<{ marks: Record<string, number> }>, titles: ReadonlyMap<string, string>): PaperOutcomeEvidence[] {
  const byOutcome = new Map<string, { earned: number; possible: number; candidates: Set<number> }>();
  scripts.forEach((script, index) => {
    for (const question of paper.questions) {
      if (!Object.hasOwn(script.marks, question.id)) continue;
      for (const id of new Set(question.outcomeIds)) {
        const row = byOutcome.get(id) ?? { earned: 0, possible: 0, candidates: new Set<number>() };
        row.earned += script.marks[question.id]; row.possible += question.marks; row.candidates.add(index);
        byOutcome.set(id, row);
      }
    }
  });
  return [...byOutcome].map(([id, row]) => ({ id, title: titles.get(id) ?? id, earned: row.earned, possible: row.possible, scoredShare: row.possible ? Math.round(row.earned / row.possible * 100) : 0, candidates: row.candidates.size }));
}
