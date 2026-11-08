import type { PaperData } from "./assessment";
import type { ExamReview } from "./exam";
import { deriveFeedback, MINIMUM_ITEM_RESPONSES, type ItemAnalysis, type OutcomeStatus } from "./recovery";

/**
 * SKO-504 Mistake Map: outcome × learner, read from moderated marks only (deterministic, no AI).
 * - An item that reads as CHECK_ITEM (nobody earned full credit, or a distractor beat the key) is first
 *   a question about the item or its marking, so it is left out of every outcome cell and listed apart.
 * - An outcome is NOT_MEASURED when fewer than the minimum learners answered any counted item for it.
 * - Outcomes are ranked by the marks the class lost on them, with the evidence count beside each.
 */
export const MAP_MINIMUM_LEARNERS = MINIMUM_ITEM_RESPONSES;
/** A wrong option is a cluster when at least this many learners and this share of those answering chose it. */
export const DISTRACTOR_MINIMUM = 2;
export const DISTRACTOR_SHARE = 0.25;

export interface MapCell { attemptId: string; status: OutcomeStatus; awarded: number; possible: number }
export interface MapOutcome {
  outcomeId: string; title: string | null; reading: "MEASURED" | "NOT_MEASURED";
  learners: number; itemIds: string[]; awarded: number; possible: number; lost: number; percentage: number | null; cells: MapCell[];
}
export interface MistakeMap {
  learners: Array<{ attemptId: string; name: string | null }>;
  outcomes: MapOutcome[];
  excluded: Array<{ questionId: string; number: number; reasons: ItemAnalysis["reasons"] }>;
  distractors: Array<{ questionId: string; number: number; option: string; count: number; answered: number; outcomeIds: string[] }>;
}

export function buildMistakeMap(paper: PaperData, rows: ReadonlyArray<{ attemptId: string; name: string | null; review: Pick<ExamReview, "marks">; responses: Record<string, string> }>, items: readonly ItemAnalysis[], titles: ReadonlyMap<string, string>): MistakeMap {
  const checkItems = new Set(items.filter(item => item.reading === "CHECK_ITEM").map(item => item.questionId));
  const counted: PaperData = { ...paper, questions: paper.questions.filter(question => !checkItems.has(question.id)) };
  const feedback = rows.map(row => ({ attemptId: row.attemptId, outcomes: new Map(deriveFeedback(counted, row.review, row.responses, titles).map(outcome => [outcome.outcomeId, outcome])) }));
  const outcomeIds = [...new Set(paper.questions.flatMap(question => question.outcomeIds))];
  const outcomes = outcomeIds.map((outcomeId): MapOutcome => {
    const itemIds = counted.questions.filter(question => question.outcomeIds.includes(outcomeId)).map(question => question.id);
    const cells = feedback.flatMap(row => { const outcome = row.outcomes.get(outcomeId); return outcome ? [{ attemptId: row.attemptId, status: outcome.status, awarded: outcome.awarded, possible: outcome.possible }] : []; });
    // Unanswered work is absence of evidence, not a mistake: it counts toward neither marks nor learners.
    const answered = cells.filter(cell => cell.status !== "NOT_ANSWERED");
    const awarded = answered.reduce((sum, cell) => sum + cell.awarded, 0), possible = answered.reduce((sum, cell) => sum + cell.possible, 0);
    const measured = itemIds.length > 0 && answered.length >= MAP_MINIMUM_LEARNERS;
    return { outcomeId, title: titles.get(outcomeId) ?? null, reading: measured ? "MEASURED" : "NOT_MEASURED", learners: answered.length, itemIds, awarded, possible, lost: possible - awarded, percentage: measured && possible ? Math.round(awarded / possible * 1000) / 10 : null, cells };
  }).sort((a, b) => (a.reading === b.reading ? 0 : a.reading === "MEASURED" ? -1 : 1) || b.lost - a.lost || a.outcomeId.localeCompare(b.outcomeId));
  const distractors = items.flatMap(item => {
    const question = paper.questions.find(entry => entry.id === item.questionId);
    if (!question || item.answered < MAP_MINIMUM_LEARNERS) return [];
    return item.choices.filter(choice => !choice.key && choice.count >= DISTRACTOR_MINIMUM && choice.count / item.answered >= DISTRACTOR_SHARE)
      .map(choice => ({ questionId: item.questionId, number: item.number, option: choice.label, count: choice.count, answered: item.answered, outcomeIds: question.outcomeIds }));
  }).sort((a, b) => b.count - a.count || a.number - b.number);
  return {
    learners: rows.map(row => ({ attemptId: row.attemptId, name: row.name })),
    outcomes,
    excluded: items.filter(item => item.reading === "CHECK_ITEM").map(item => ({ questionId: item.questionId, number: item.number, reasons: item.reasons })),
    distractors,
  };
}

/** The ten-minute remediation shape for one outcome: what to reteach, three practice items, one formative check. */
export const NEXT_TEN_MINUTES = [{ step: "RETEACH", minutes: 3 }, { step: "PRACTISE", minutes: 5 }, { step: "CHECK", minutes: 2 }] as const;

/**
 * Up to three released items for an outcome, hardest first, never a CHECK_ITEM (its key or marking is
 * in question), and the item the class did best on held back as the formative check.
 */
export function practiceProposals(candidates: ReadonlyArray<{ sourceAssignmentId: string; questionId: string; outcomeIds: readonly string[]; percentage: number | null; reading: ItemAnalysis["reading"] }>, outcomeId: string) {
  const usable = candidates.filter(item => item.outcomeIds.includes(outcomeId) && item.reading !== "CHECK_ITEM")
    .sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101) || a.questionId.localeCompare(b.questionId));
  const check = usable.length > 3 ? usable[usable.length - 1] : null;
  return { practice: usable.filter(item => item !== check).slice(0, 3), check };
}
