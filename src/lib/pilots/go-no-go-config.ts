/**
 * SKAI-1102 pilot go/no-go thresholds — the only place they live.
 *
 * Each criterion reads an existing metric or record; nothing is written. Numeric thresholds come from the
 * SKAI-1005 validation plan (docs/product-review-2026-10/SKAI-1005-cohort-validation.md §8); the gate,
 * decision and commercial criteria come from SKAI-1018/1017 (d2-12-pilot-readiness.md). Changing a
 * threshold here changes the dashboard and the unit tests that pin it, nothing else.
 */

export type Rag = "GREEN" | "AMBER" | "RED";

/** A numeric criterion: GREEN at or past `green`, RED past `red`, AMBER between or when unmeasured. */
export type NumericThreshold = { direction: "higher" | "lower"; green: number; red: number; unit: "%" };

export const GO_NO_GO_CRITERIA = {
  /** SKAI-1018 activation gate re-evaluated now (readiness checklist + market trust). */
  READINESS_GATE: { source: "SKAI-1018 activation gate", metric: "pilotActivationGate" },
  /** Latest signed go/no-go record outcome. */
  DECISION: { source: "SKAI-1018 signed decision", metric: "pilotReadinessRecord.outcome", green: ["GO"], red: ["STOP"] },
  /** Latest SKAI-1017 commercial stage (refusal to pay is negative evidence). */
  COMMERCIAL_STAGE: { source: "SKAI-1017 commercial stage", metric: "pilotCommercialEvent.stage", green: ["PAID_COMMITMENT", "CONSENTED_PILOT"], red: ["DECLINED_PAYMENT"] },
  /**
   * SKAI-1005 §8 "teachers generating ≥ 2 papers in 4 weeks": share of the school's active teachers
   * with at least `minPapers` PAPER records in the first `windowDays` of the pilot (SKAI-1174).
   */
  TEACHER_USAGE: { source: "SKAI-1005 §8 pilot usage", metric: "Teachers with ≥ 2 papers in 4 weeks", minPapers: 2, windowDays: 28, threshold: { direction: "higher", green: 50, red: 20, unit: "%" } },
  /** SKAI-1005 §8 "papers accepted with ≤ 20% edits" (CORRECTNESS_FINAL measured rate). */
  PAPER_ACCEPTANCE: { source: "SKAI-1005 §8 accepted papers", metric: "CORRECTNESS_FINAL rate", threshold: { direction: "higher", green: 60, red: 30, unit: "%" } },
  /** SKO-430 paired task time change, worst workflow; negative is faster. */
  TASK_TIME_CHANGE: { source: "SKO-430 paired task time", metric: "TIME changePercent (worst workflow)", threshold: { direction: "lower", green: -20, red: 0, unit: "%" } },
} as const satisfies Record<string, { source: string; metric: string; threshold?: NumericThreshold; minPapers?: number; windowDays?: number; green?: readonly string[]; red?: readonly string[] }>;

export type CriterionKey = keyof typeof GO_NO_GO_CRITERIA;
export const CRITERION_KEYS = Object.keys(GO_NO_GO_CRITERIA) as CriterionKey[];

/**
 * Verdict rule, mirroring SKAI-1005 ("GO when 4 of the 6 metrics hit Go and no veto metric hits No-go")
 * and SKAI-1018 (fail-closed: no GO without a passing gate and a signed GO).
 */
export const VERDICT_RULE = {
  minGreen: 4,
  requiredGreen: ["READINESS_GATE", "DECISION"] as CriterionKey[],
  /** Any of these RED makes the verdict NO_GO. */
  vetoOnRed: ["DECISION", "COMMERCIAL_STAGE", "TEACHER_USAGE", "PAPER_ACCEPTANCE", "TASK_TIME_CHANGE"] as CriterionKey[],
} as const;
