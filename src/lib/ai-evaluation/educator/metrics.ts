import { z } from "zod";

/**
 * SKAI-1053 (D5-04) metric math, pre-registered in docs/evaluation/D5-preregistration.md:
 * alignment at least 90%, zero critical errors, AI marking agreement at least 85%, and Cohen's
 * kappa at least 0.6 between the two independent reviewers on the "curriculum-aligned" judgement
 * (below it the run is repeated and no pass/fail is recorded).
 */
export const D5_THRESHOLDS = { minAlignment: 0.9, maxCriticalErrors: 0, minMarkingAgreement: 0.85, minKappa: 0.6 } as const;

export const reviewEntrySchema = z.object({ id: z.string(), aligned: z.boolean(), critical: z.boolean(), mark: z.number().int().nonnegative() }).strict();
export const reviewFileSchema = z.object({
  /** Pseudonymous reviewer code (e.g. "UR-R1"); never a name or contact detail. */
  reviewer: z.string().regex(/^[A-Z]{2}-(R1|R2|ADJ)$/),
  itemSetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(reviewEntrySchema),
}).strict();
export type ReviewEntry = z.infer<typeof reviewEntrySchema>;
export type ReviewFile = z.infer<typeof reviewFileSchema>;

/** Cohen's kappa for two raters over the same items. Perfect expected agreement gives 1 if observed is perfect, else 0. */
export function cohensKappa<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length !== b.length || !a.length) throw new Error("Kappa needs two equal, non-empty rating lists.");
  const n = a.length;
  const categories = [...new Set([...a, ...b])];
  const observed = a.filter((value, index) => value === b[index]).length / n;
  const expected = categories.reduce((sum, category) => sum + (a.filter(v => v === category).length / n) * (b.filter(v => v === category).length / n), 0);
  if (expected === 1) return observed === 1 ? 1 : 0;
  return (observed - expected) / (1 - expected);
}

export type Verdict = "PASSED" | "FAILED" | "REPEAT";
export type EvalMetrics = { items: number; alignment: number; criticalErrors: number; markingAgreement: number; kappa: number; disputed: number };
export type EvalOutcome = { verdict: Verdict; metrics: EvalMetrics; failures: string[] };

/**
 * Combines two reviewer files and an adjudication into final judgements, then scores the AI marks.
 * An item is disputed when the reviewers differ on any field; disputed items must be adjudicated.
 */
export function evaluateReviews(input: { itemIds: string[]; itemSetSha256: string; reviewerA: ReviewFile; reviewerB: ReviewFile; adjudication: ReviewFile | null; aiMarks: Record<string, number> }): EvalOutcome {
  const { itemIds } = input;
  for (const file of [input.reviewerA, input.reviewerB, input.adjudication]) {
    if (file && file.itemSetSha256 !== input.itemSetSha256) throw new Error(`Review ${file.reviewer} was made against a different item set.`);
  }
  if (input.reviewerA.reviewer === input.reviewerB.reviewer) throw new Error("The two reviews must come from different reviewers.");
  const index = (file: ReviewFile) => new Map(file.items.map(entry => [entry.id, entry]));
  const a = index(input.reviewerA), b = index(input.reviewerB);
  const adj = input.adjudication ? index(input.adjudication) : new Map<string, ReviewEntry>();
  const finals: ReviewEntry[] = [];
  let disputed = 0;
  for (const id of itemIds) {
    const ra = a.get(id), rb = b.get(id);
    if (!ra || !rb) throw new Error(`Item ${id} is missing from a reviewer file.`);
    if (ra.aligned === rb.aligned && ra.critical === rb.critical && ra.mark === rb.mark) { finals.push(ra); continue; }
    disputed++;
    const decided = adj.get(id);
    if (!decided) throw new Error(`Item ${id} is disputed and has no adjudication.`);
    finals.push(decided);
  }
  const n = itemIds.length;
  const metrics: EvalMetrics = {
    items: n,
    alignment: finals.filter(entry => entry.aligned).length / n,
    criticalErrors: finals.filter(entry => entry.critical).length,
    markingAgreement: finals.filter(entry => input.aiMarks[entry.id] === entry.mark).length / n,
    kappa: cohensKappa(itemIds.map(id => a.get(id)!.aligned), itemIds.map(id => b.get(id)!.aligned)),
    disputed,
  };
  if (metrics.kappa < D5_THRESHOLDS.minKappa) return { verdict: "REPEAT", metrics, failures: [`Inter-rater kappa ${metrics.kappa.toFixed(2)} is below ${D5_THRESHOLDS.minKappa}; repeat the run.`] };
  const failures: string[] = [];
  if (metrics.alignment < D5_THRESHOLDS.minAlignment) failures.push(`Alignment ${(metrics.alignment * 100).toFixed(1)}% is below 90%.`);
  if (metrics.criticalErrors > D5_THRESHOLDS.maxCriticalErrors) failures.push(`${metrics.criticalErrors} critical error(s); zero allowed.`);
  if (metrics.markingAgreement < D5_THRESHOLDS.minMarkingAgreement) failures.push(`Marking agreement ${(metrics.markingAgreement * 100).toFixed(1)}% is below 85%.`);
  return { verdict: failures.length ? "FAILED" : "PASSED", metrics, failures };
}
