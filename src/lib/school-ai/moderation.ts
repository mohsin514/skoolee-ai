/**
 * SKO-501 (plan F6): the moderator's conformance report. Pure and deterministic: every check reads the
 * paper, the office's request (slot) and what is taught; nothing calls a provider. A check is BLOCKING
 * unless marked ADVISORY; the Seal needs a SIGNED decision on the current content, and a moderator
 * normally returns a paper that fails a blocking check.
 */
import type { CurriculumData, PaperData } from "./assessment";
import { itemStateFor } from "./item-review";
import { paperDna } from "./paper-dna";

export const MODERATION_DECISIONS = ["SIGNED", "RETURNED"] as const;
export type ModerationDecision = (typeof MODERATION_DECISIONS)[number];

export type ConformanceCode = "MARKS_MATCH_REQUEST" | "MARKS_ADD_UP" | "DURATION_MATCHES_REQUEST" | "TIME_FITS" | "WITHIN_TAUGHT" | "ITEMS_REVIEWED" | "LANGUAGE_REQUESTED" | "HAS_ITEMS";
export interface ConformanceCheck { code: ConformanceCode; ok: boolean; severity: "BLOCKING" | "ADVISORY"; values: Array<string | number> }

export function conformanceReport(input: {
  paper: Pick<PaperData, "blueprint" | "questions" | "language">;
  request: { totalMarks: number; durationMinutes: number; languages: readonly string[] };
  /** The curriculum as taught (Teaching Line overlay applied), or null when unavailable. */
  curriculum: Pick<CurriculumData, "outcomes"> | null;
}): ConformanceCheck[] {
  const { paper, request } = input;
  const dna = paperDna(paper, input.curriculum, null);
  const states = paper.questions.map(itemStateFor);
  const unreviewed = states.filter(state => state !== "READY_FOR_REVIEW" && state !== "APPROVED").length;
  return [
    { code: "HAS_ITEMS", ok: paper.questions.length > 0, severity: "BLOCKING", values: [paper.questions.length] },
    { code: "MARKS_MATCH_REQUEST", ok: paper.blueprint.totalMarks === request.totalMarks, severity: "BLOCKING", values: [paper.blueprint.totalMarks, request.totalMarks] },
    { code: "MARKS_ADD_UP", ok: Math.abs(dna.marks.items - dna.marks.blueprint) < 0.001, severity: "BLOCKING", values: [dna.marks.items, dna.marks.blueprint] },
    { code: "DURATION_MATCHES_REQUEST", ok: paper.blueprint.durationMinutes === request.durationMinutes, severity: "BLOCKING", values: [paper.blueprint.durationMinutes, request.durationMinutes] },
    { code: "TIME_FITS", ok: dna.time.ratio <= 1.1, severity: "ADVISORY", values: [dna.time.estimatedMinutes, dna.time.durationMinutes] },
    { code: "WITHIN_TAUGHT", ok: dna.coverage.assessedNotTaught.length === 0, severity: "BLOCKING", values: [dna.coverage.assessedNotTaught.length] },
    { code: "ITEMS_REVIEWED", ok: unreviewed === 0 && paper.questions.length > 0, severity: "BLOCKING", values: [paper.questions.length - unreviewed, paper.questions.length] },
    { code: "LANGUAGE_REQUESTED", ok: request.languages.includes(paper.language), severity: "BLOCKING", values: [paper.language] },
  ];
}

export const conformanceBlocking = (checks: readonly ConformanceCheck[]) => checks.filter(check => !check.ok && check.severity === "BLOCKING");

/** A signature counts only for the exact content it was given on. */
export function signatureHolds(latest: { decision: string; contentHash: string } | null, currentHash: string | null): boolean {
  return Boolean(latest && currentHash && latest.decision === "SIGNED" && latest.contentHash === currentHash);
}
