import type { PaperData } from "./assessment";
import type { ExamReview } from "./exam";

// SKO-408 R18: the learning-recovery reading of a released result. Every statement is arithmetic over
// moderated marks or the teacher's own feedback text, tied to the item that produced it (R18.2), so
// nothing here infers diagnosis, ability, behaviour or teacher quality (R18.3, R18.10, R18.11).

export type OutcomeStatus = "ADDRESSED" | "PARTIAL" | "MISSED" | "NOT_ANSWERED";
export interface FeedbackEvidence { questionId: string; number: number; awarded: number; maximum: number; answered: boolean; feedback: string | null }
export interface OutcomeFeedback { outcomeId: string; title: string | null; status: OutcomeStatus; awarded: number; possible: number; evidence: FeedbackEvidence[] }

/** R18.1: the outcomes this learner addressed and missed, with the item and awarded marks as evidence. */
export function deriveFeedback(paper: PaperData, review: Pick<ExamReview, "marks">, responses: Record<string, string>, outcomeTitles: ReadonlyMap<string, string>): OutcomeFeedback[] {
  const marks = new Map(review.marks.map(row => [row.questionId, row]));
  const byOutcome = new Map<string, FeedbackEvidence[]>();
  paper.questions.forEach((question, index) => {
    const answered = Boolean(responses[question.id]?.trim());
    const mark = marks.get(question.id);
    const evidence: FeedbackEvidence = { questionId: question.id, number: index + 1, awarded: answered ? mark?.marks ?? 0 : 0, maximum: question.marks, answered, feedback: mark?.feedback ?? null };
    for (const outcomeId of question.outcomeIds) byOutcome.set(outcomeId, [...(byOutcome.get(outcomeId) ?? []), evidence]);
  });
  return [...byOutcome.entries()].map(([outcomeId, evidence]) => {
    const awarded = evidence.reduce((sum, row) => sum + row.awarded, 0), possible = evidence.reduce((sum, row) => sum + row.maximum, 0);
    // An outcome the learner never attempted is not evidence that they missed it.
    const status: OutcomeStatus = evidence.every(row => !row.answered) ? "NOT_ANSWERED" : awarded >= possible ? "ADDRESSED" : awarded === 0 ? "MISSED" : "PARTIAL";
    return { outcomeId, title: outcomeTitles.get(outcomeId) ?? null, status, awarded, possible, evidence };
  });
}

/**
 * The supplement's rule before any teaching recommendation: separate what is learning evidence from
 * what is an item or marking question, and from what is simply too little evidence to read.
 */
export type ItemReading = "LEARNING_EVIDENCE" | "CHECK_ITEM" | "INSUFFICIENT_EVIDENCE";
export const MINIMUM_ITEM_RESPONSES = 3;

export interface ItemAnalysis { questionId: string; number: number; prompt: string; maximum: number; answered: number; unanswered: number; percentage: number | null; fullCreditPercentage: number | null; reading: ItemReading; reasons: Array<"FEW_RESPONSES" | "NOBODY_FULL_CREDIT" | "DISTRACTOR_PREFERRED">; choices: Array<{ label: string; count: number; key: boolean }> }

export function analyseItems(paper: PaperData, rows: ReadonlyArray<{ review: Pick<ExamReview, "marks">; responses: Record<string, string> }>): ItemAnalysis[] {
  return paper.questions.map((question, index) => {
    let answered = 0, unanswered = 0, awarded = 0, full = 0;
    const counts = new Map<string, number>();
    for (const row of rows) {
      const answer = row.responses[question.id]?.trim();
      if (!answer) { unanswered++; continue; }
      const mark = row.review.marks.find(entry => entry.questionId === question.id)?.marks ?? 0;
      answered++; awarded += mark; if (mark >= question.marks) full++;
      const chosen = question.type === "MULTIPLE_CHOICE" ? (() => { try { const value: unknown = JSON.parse(answer); return Array.isArray(value) ? value.map(String) : []; } catch { return []; } })() : [answer];
      for (const option of question.options) if (chosen.includes(option.id)) counts.set(option.id, (counts.get(option.id) ?? 0) + 1);
    }
    const keys = new Set([question.correctOptionId, ...(question.correctOptionIds ?? [])].filter(Boolean) as string[]);
    const choices = question.options.map(option => ({ label: option.text, count: counts.get(option.id) ?? 0, key: keys.has(option.id) }));
    const keyCount = Math.max(0, ...choices.filter(choice => choice.key).map(choice => choice.count));
    const reasons: ItemAnalysis["reasons"] = [];
    if (answered < MINIMUM_ITEM_RESPONSES) reasons.push("FEW_RESPONSES");
    else {
      if (full === 0) reasons.push("NOBODY_FULL_CREDIT");
      if (keys.size && choices.some(choice => !choice.key && choice.count > keyCount)) reasons.push("DISTRACTOR_PREFERRED");
    }
    return {
      questionId: question.id, number: index + 1, prompt: question.prompt, maximum: question.marks, answered, unanswered,
      percentage: answered ? Math.round(awarded / (answered * question.marks) * 1000) / 10 : null,
      fullCreditPercentage: answered ? Math.round(full / answered * 1000) / 10 : null,
      reading: reasons.includes("FEW_RESPONSES") ? "INSUFFICIENT_EVIDENCE" : reasons.length ? "CHECK_ITEM" : "LEARNING_EVIDENCE",
      reasons, choices,
    };
  });
}
