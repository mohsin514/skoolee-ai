/**
 * Which package to recommend for a school's expected size, and why.
 *
 * Rule: the cheapest package whose limits cover BOTH the expected campuses and
 * the expected students (a limit of -1 is unlimited; a custom package — price
 * null — ranks after every priced one). If nothing priced fits, the custom
 * package is recommended. Pure and shared, so the chooser, the wizard's package
 * step and tests agree.
 */
export type SizedPlan = {
  type: string;
  price: number | null;
  maxCampuses: number;
  maxStudents: number;
};

/** `students: null` = not answered yet: only campuses decide (never invent a student count). */
export type PlanSize = { campuses: number; students: number | null };

/** How much of a limit the expected size uses: 0..1 (capped), or null for an unlimited limit. */
export function usage(expected: number, limit: number): number | null {
  if (limit < 0) return null;
  if (limit === 0) return expected > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, expected / limit));
}

export function fits(plan: SizedPlan, size: PlanSize): boolean {
  return (plan.maxCampuses < 0 || size.campuses <= plan.maxCampuses)
    && (size.students == null || plan.maxStudents < 0 || size.students <= plan.maxStudents);
}

/** The limits a plan falls short on (empty when it fits). */
export function shortfalls(plan: SizedPlan, size: PlanSize): ("campuses" | "students")[] {
  const out: ("campuses" | "students")[] = [];
  if (plan.maxCampuses >= 0 && size.campuses > plan.maxCampuses) out.push("campuses");
  if (size.students != null && plan.maxStudents >= 0 && size.students > plan.maxStudents) out.push("students");
  return out;
}

export function recommendPlan<T extends SizedPlan>(plans: readonly T[], size: PlanSize): T | null {
  if (!plans.length) return null;
  const rank = (plan: T) => (plan.price == null ? Number.POSITIVE_INFINITY : plan.price);
  const fitting = plans.filter((plan) => fits(plan, size));
  const pool = fitting.length ? fitting : plans.filter((plan) => plan.price == null);
  if (!pool.length) return null;
  // Stable: equal prices keep catalogue order.
  return pool.reduce((best, plan) => (rank(plan) < rank(best) ? plan : best), pool[0]);
}

/** At or above this share of a package's student limit the fit is "tight". Product sign-off pending. */
export const TIGHT = 0.9;

export type Verdict<T> = {
  plan: T;
  /** First match wins: nothing priced fits → students unanswered → near the limit → already current → comfortable. */
  kind: "beyond" | "campusesOnly" | "tight" | "current" | "roomy";
  /** When tight: the next package with comfortable room (a quiet tag; the highlight never moves to it). */
  roomToGrow: T | null;
  /** The package just below the recommendation and the limit it misses (only when the cheapest fit was chosen). */
  whyNot: { plan: T; limit: "campuses" | "students"; value: number } | null;
};

/**
 * The recommendation with its explanation. Rule: the cheapest package covering
 * both campuses and students (custom last); a paid current package that still
 * fits is kept (setup never nudges a downgrade), and nothing is upsold past the
 * cheapest fit. `plans` must be in catalogue order (cheapest first).
 */
export function explainRecommendation<T extends SizedPlan>(plans: readonly T[], size: PlanSize, currentPlan: string): Verdict<T> | null {
  const sized: PlanSize = { campuses: Math.max(1, size.campuses), students: size.students };
  const cheapest = recommendPlan(plans, sized);
  if (!cheapest) return null;
  const rank = (plan: T) => (plan.price == null ? Number.POSITIVE_INFINITY : plan.price);
  const current = plans.find((plan) => plan.type === currentPlan);
  const keepCurrent = current && current.price !== 0 && fits(current, sized) && rank(current) > rank(cheapest);
  const plan = keepCurrent ? current : cheapest;
  const students = sized.students;

  const beyond = !plans.some((candidate) => candidate.price != null && fits(candidate, sized));
  const share = (candidate: T) => (students == null || candidate.maxStudents <= 0 ? 0 : students / candidate.maxStudents);
  const tight = students != null && plan.maxStudents > 0 && share(plan) >= TIGHT;
  const index = plans.indexOf(plan);
  const roomToGrow = tight
    ? plans.slice(index + 1).find((candidate) => fits(candidate, sized) && (candidate.maxStudents < 0 || share(candidate) < TIGHT)) ?? null
    : null;

  let whyNot: Verdict<T>["whyNot"] = null;
  if (plan === cheapest && index > 0) {
    const below = plans[index - 1];
    const missing = shortfalls(below, sized)[0];
    if (missing) whyNot = { plan: below, limit: missing, value: missing === "campuses" ? below.maxCampuses : below.maxStudents };
  }

  const kind: Verdict<T>["kind"] = beyond ? "beyond"
    : students == null ? "campusesOnly"
    : tight ? "tight"
    : plan.type === currentPlan ? "current"
    : "roomy";
  return { plan, kind, roomToGrow, whyNot };
}
