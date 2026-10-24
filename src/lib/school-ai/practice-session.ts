/**
 * SKO-426 practice sessions: pure rules (no I/O), so they can be tested and explained.
 *
 * - Hints come in a fixed ladder: the teacher's hints for the item first, then generic, non-revealing
 *   prompts. Any hint makes that response ASSISTED; only unassisted correct answers are independent.
 * - Revisits follow one transparent rule, are bounded, and record why they were set.
 * - Wording about progress reflects how much independent evidence there is and how recent it is;
 *   one correct answer never reads as mastery.
 */

export const MAX_HINTS = 3;
export const MAX_REVISITS = 3;
export const LEARNER_RESCHEDULE_DAYS = 3;

/** Generic prompts used when the teacher wrote fewer than MAX_HINTS hints. They never reveal an answer. */
export const GENERIC_HINTS = [
  "Read the question again and underline what it asks you to find.",
  "Think about the skill this question practises. What is the first step you would take?",
  "Try one small step on paper, then check whether your answer makes sense.",
] as const;

export function hintLadder(teacherHints: string[] | undefined): string[] {
  const own = (teacherHints ?? []).map((h) => h.trim()).filter(Boolean).slice(0, MAX_HINTS);
  return [...own, ...GENERIC_HINTS].slice(0, MAX_HINTS);
}

export type ResponseSummary = { correct: boolean | null; assisted: boolean };

/** Independent and assisted results are always reported separately. */
export function sessionSummary(responses: ResponseSummary[]) {
  const checked = responses.filter((r) => r.correct !== null);
  const independent = checked.filter((r) => !r.assisted), assisted = checked.filter((r) => r.assisted);
  return {
    answered: responses.length,
    checked: checked.length,
    independentCorrect: independent.filter((r) => r.correct).length, independentTotal: independent.length,
    assistedCorrect: assisted.filter((r) => r.correct).length, assistedTotal: assisted.length,
  };
}

const DAY = 86_400_000;
const addDays = (from: Date, days: number) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) + days * DAY);

/**
 * The revisit rule, in words a learner and teacher can read:
 * - mostly independent and correct (at least 80% of checked answers): come back in 7 days, then 14;
 * - otherwise: come back in 2 days;
 * - at most MAX_REVISITS automatic revisits; after that the teacher decides.
 */
export function nextRevisit(summary: ReturnType<typeof sessionSummary>, completedRevisits: number, completedOn: Date): { dueOn: Date; days: number; reason: string } | null {
  if (completedRevisits >= MAX_REVISITS) return null;
  const strong = summary.checked > 0 && summary.independentTotal > 0 && summary.independentCorrect / summary.checked >= 0.8;
  const days = strong ? (completedRevisits >= 1 ? 14 : 7) : 2;
  const reason = strong
    ? `Most answers were correct without hints, so the next check is in ${days} days.`
    : "Some answers needed hints or were not correct yet, so a short revisit comes in 2 days.";
  return { dueOn: addDays(completedOn, days), days, reason };
}

/** Two completed sessions in a row with under half independent-correct answers: a person should help. */
export function needsSupport(history: ReturnType<typeof sessionSummary>[]): boolean {
  const lastTwo = history.slice(-2);
  return lastTwo.length === 2 && lastTwo.every((s) => s.checked > 0 && s.independentCorrect / s.checked < 0.5);
}

/**
 * Progress wording. "Secure for now" needs independent correct work on at least two different days
 * within the last 30 days; anything less is "Building" or "Just started". It never says "mastered".
 */
export function progressLabel(sessions: { completedAt: Date; summary: ReturnType<typeof sessionSummary> }[], now: Date): "JUST_STARTED" | "BUILDING" | "SECURE_FOR_NOW" {
  const recent = sessions.filter((s) => now.getTime() - s.completedAt.getTime() <= 30 * DAY && s.summary.independentTotal > 0 && s.summary.independentCorrect / Math.max(1, s.summary.checked) >= 0.8);
  const days = new Set(recent.map((s) => s.completedAt.toISOString().slice(0, 10)));
  if (days.size >= 2) return "SECURE_FOR_NOW";
  return sessions.length ? "BUILDING" : "JUST_STARTED";
}

/** A learner may move a revisit by up to LEARNER_RESCHEDULE_DAYS from the date it was set for. */
export function learnerMayReschedule(originalDue: Date, requested: Date, today: Date): boolean {
  const diff = Math.round((addDays(requested, 0).getTime() - addDays(originalDue, 0).getTime()) / DAY);
  return Math.abs(diff) <= LEARNER_RESCHEDULE_DAYS && addDays(requested, 0).getTime() >= addDays(today, 0).getTime();
}
