/**
 * SKAI-152 — the rules a set of assessment-category weights must satisfy, and
 * the summary the Grading Rules editor shows before a change is saved.
 *
 * Pure on purpose: the route and the editor apply the same checks, and the
 * calculation tests exercise them without a database.
 */

export const WEIGHT_KEYS = ["quizWeight", "classTestWeight", "midTermWeight", "finalWeight"] as const;
export type WeightKey = (typeof WEIGHT_KEYS)[number];
export type CategoryWeights = Record<WeightKey, number>;

export type WeightProblem =
  | { code: "not_a_number"; key: WeightKey }
  | { code: "negative"; key: WeightKey }
  | { code: "over_100"; key: WeightKey }
  | { code: "total"; total: number };

/** Weights are stored to two decimals, so a total within 0.01 of 100 is complete. */
const TOTAL_TOLERANCE = 0.01;

export function weightTotal(weights: CategoryWeights) {
  return Math.round(WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0) * 100) / 100;
}

/**
 * Every weight must be a number from 0 to 100 and together they must make
 * exactly 100%. Rounding the total first (the old check) let 99.6% through.
 */
export function validateCategoryWeights(weights: Record<WeightKey, unknown>): WeightProblem[] {
  const problems: WeightProblem[] = [];
  for (const key of WEIGHT_KEYS) {
    const value = weights[key];
    if (typeof value !== "number" || !Number.isFinite(value)) problems.push({ code: "not_a_number", key });
    else if (value < 0) problems.push({ code: "negative", key });
    else if (value > 100) problems.push({ code: "over_100", key });
  }
  if (problems.length) return problems;
  const total = weightTotal(weights as CategoryWeights);
  if (Math.abs(total - 100) > TOTAL_TOLERANCE) problems.push({ code: "total", total });
  return problems;
}

export function describeWeightProblem(problem: WeightProblem): string {
  const label: Record<WeightKey, string> = {
    quizWeight: "Quiz", classTestWeight: "Class test", midTermWeight: "Mid-term", finalWeight: "Final",
  };
  switch (problem.code) {
    case "not_a_number": return `${label[problem.key]} weight must be a number`;
    case "negative": return `${label[problem.key]} weight cannot be negative`;
    case "over_100": return `${label[problem.key]} weight cannot be more than 100%`;
    case "total": return `Weights must add up to 100% — they currently add up to ${problem.total}%`;
  }
}

export interface StudentOutcome {
  studentId: string;
  percentage: number;
  grade: string;
  passed: boolean;
}

export interface WeightImpact {
  students: number;
  /** Students whose weighted percentage moves at all. */
  changed: number;
  gradeChanged: number;
  newlyFailing: number;
  newlyPassing: number;
  /** Largest move in either direction, in percentage points. */
  largestShift: number;
  /** Students the calculation could not evaluate (e.g. a BLOCK policy). */
  skipped: number;
}

/** Compare each student's result under the saved rules with the proposed ones. */
export function summarizeWeightImpact(
  before: (StudentOutcome | null)[],
  after: (StudentOutcome | null)[],
): WeightImpact {
  const impact: WeightImpact = { students: before.length, changed: 0, gradeChanged: 0, newlyFailing: 0, newlyPassing: 0, largestShift: 0, skipped: 0 };
  before.forEach((was, i) => {
    const now = after[i];
    if (!was || !now) { impact.skipped += 1; return; }
    const shift = Math.abs(now.percentage - was.percentage);
    if (shift > 0) impact.changed += 1;
    impact.largestShift = Math.max(impact.largestShift, Math.round(shift * 100) / 100);
    if (now.grade !== was.grade) impact.gradeChanged += 1;
    if (was.passed && !now.passed) impact.newlyFailing += 1;
    if (!was.passed && now.passed) impact.newlyPassing += 1;
  });
  return impact;
}
