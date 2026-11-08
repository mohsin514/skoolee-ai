/** Recorded restrictions only. Absence of a conflict is not permission for practice or sharing. */
export const BANK_REUSE_REASONS = ["SOURCE_ARCHIVED", "FUTURE_EXPOSURE", "SEALED_FORM", "ACTIVE_EXAM", "HISTORY_LIMIT"] as const;
export type BankReuseReason = (typeof BANK_REUSE_REASONS)[number];
export type BankReuseEligibility = {
  reuse: "BLOCKED" | "NO_RECORDED_CONFLICT";
  reasons: BankReuseReason[];
  checkedAt: string;
  recordedExposureCount: number;
  lastExposureAt: string | null;
  nextExposureAt: string | null;
  /** The existing records have no approved practice-use/retirement policy. Never infer it. */
  practice: "NOT_EVALUATED";
};
export type BankExposureFact = { paperId: string; questionId: string; itemGroupId: string; examDate: Date };
export type BankExposureIdentity = { paperId: string; questionId: string; explicitItemGroupId?: string };

/** Bare question ids (often q1) are local to a paper; only explicit groups join different papers. */
export function exposureMatches(identity: BankExposureIdentity, fact: BankExposureFact): boolean {
  return fact.paperId === identity.paperId && fact.questionId === identity.questionId
    || Boolean(identity.explicitItemGroupId && fact.itemGroupId === identity.explicitItemGroupId);
}

export function bankReuseEligibility(input: {
  identity: BankExposureIdentity;
  sourceArchived: boolean;
  sealedForm: boolean;
  activeExam: boolean;
  exposures: readonly BankExposureFact[];
  historyLimited: boolean;
  now: Date;
}): BankReuseEligibility {
  const dates = input.exposures.filter(fact => exposureMatches(input.identity, fact)).map(fact => fact.examDate.getTime()).sort((a, b) => a - b);
  const past = dates.filter(date => date <= input.now.getTime()), future = dates.filter(date => date > input.now.getTime());
  const reasons: BankReuseReason[] = [];
  if (input.sourceArchived) reasons.push("SOURCE_ARCHIVED");
  if (future.length) reasons.push("FUTURE_EXPOSURE");
  if (input.sealedForm) reasons.push("SEALED_FORM");
  if (input.activeExam) reasons.push("ACTIVE_EXAM");
  if (input.historyLimited) reasons.push("HISTORY_LIMIT");
  return {
    reuse: reasons.length ? "BLOCKED" : "NO_RECORDED_CONFLICT", reasons, checkedAt: input.now.toISOString(),
    recordedExposureCount: dates.length,
    lastExposureAt: past.length ? new Date(past.at(-1)!).toISOString() : null,
    nextExposureAt: future.length ? new Date(future[0]).toISOString() : null,
    practice: "NOT_EVALUATED",
  };
}

/** A copy cannot shed a restriction by pointing at an intermediate approved copy. */
export function mergeBankReuseEligibility(own: BankReuseEligibility, origin: BankReuseEligibility): BankReuseEligibility {
  const reasons = BANK_REUSE_REASONS.filter(reason => own.reasons.includes(reason) || origin.reasons.includes(reason));
  const last = [own.lastExposureAt, origin.lastExposureAt].filter((value): value is string => value !== null).sort();
  const next = [own.nextExposureAt, origin.nextExposureAt].filter((value): value is string => value !== null).sort();
  return { ...own, reuse: reasons.length ? "BLOCKED" : "NO_RECORDED_CONFLICT", reasons,
    // Counts across lineage can overlap; report the local count only, never a fabricated total.
    lastExposureAt: last.at(-1) ?? null, nextExposureAt: next[0] ?? null };
}
