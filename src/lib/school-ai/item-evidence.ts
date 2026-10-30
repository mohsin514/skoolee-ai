import { createHash } from "node:crypto";
import type { PaperData } from "./assessment";

/**
 * SKO-422 question-level learning evidence (distinct from SKO-408 `item-review.ts`, which is the
 * authoring review state of a question).  Pure: the service supplies the roster, the paper version each
 * assignment used and every attempt; this decides, per item and learner, what the evidence is.
 *
 * - A learner with no submitted attempt is NOT_ATTEMPTED, an alternative left in an "answer N of M"
 *   section is NOT_CHOSEN, a submitted attempt awaiting review is
 *   AWAITING_REVIEW, an invalid reviewed attempt is EXCLUDED and an empty answer is UNANSWERED. None
 *   of these is an incorrect answer, and none enters the denominator.
 * - Paper versions are never combined: an item is (paper, version, question).
 * - Below MIN_SAMPLE reviewed answers no percentage is given, only counts and a caution.
 * - The fingerprint covers every learner's state, answer and marks, so a re-review or answer-key
 *   correction makes any teacher interpretation of the item stale.
 */

export const MIN_SAMPLE = 5;
export const RESPONSE_STATES = ["CORRECT", "PARTIAL", "INCORRECT", "UNANSWERED", "NOT_CHOSEN", "AWAITING_REVIEW", "NOT_ATTEMPTED", "EXCLUDED"] as const;
export type ResponseState = (typeof RESPONSE_STATES)[number];

export type AttemptInput = {
  attemptId: string; studentId: string; assignmentId: string; status: string;
  /** Present only for a reviewed attempt whose paper, responses and review all validated. */
  reviewed: { marks: Array<{ questionId: string; marks: number }>; responses: Record<string, string> } | null;
};
export type AssignmentInput = { id: string; title: string; paperId: string; paperVersion: number; paper: PaperData; audience: string[] };

export type ItemResponse = { studentId: string; attemptId: string | null; assignmentId: string; state: ResponseState; answer: string | null; answerLabel: string | null; marks: number | null; maxMarks: number };

export type ItemSummary = {
  key: string; paperId: string; paperVersion: number; questionId: string; prompt: string; type: string; outcomeIds: string[]; maxMarks: number;
  assignments: string[];
  counts: Record<ResponseState, number> & { expected: number; answered: number };
  percentCorrect: number | null; caution: string | null;
  choices: { optionId: string; label: string; count: number; correct: boolean }[];
  evidenceHash: string;
};

export const itemKey = (paperId: string, paperVersion: number, questionId: string) => `${paperId}:${paperVersion}:${questionId}`;

function answerLabel(question: PaperData["questions"][number], answer: string): string {
  if (question.type === "SINGLE_CHOICE") return question.options.find((o) => o.id === answer)?.text ?? answer;
  if (question.type === "MULTIPLE_CHOICE") {
    try { const ids: unknown = JSON.parse(answer); if (Array.isArray(ids)) return question.options.filter((o) => ids.includes(o.id)).map((o) => o.text).join(", "); } catch { /* shown raw */ }
  }
  return answer;
}

/** Every learner's evidence for every item, by paper version. */
export function itemResponses(assignments: AssignmentInput[], attempts: AttemptInput[]): Map<string, { assignment: AssignmentInput; question: PaperData["questions"][number]; responses: ItemResponse[] }[]> {
  const out = new Map<string, { assignment: AssignmentInput; question: PaperData["questions"][number]; responses: ItemResponse[] }[]>();
  for (const assignment of assignments) {
    const mine = attempts.filter((a) => a.assignmentId === assignment.id);
    for (const question of assignment.paper.questions) {
      const responses: ItemResponse[] = assignment.audience.map((studentId) => {
        // The most decisive attempt counts: a reviewed one over a submitted one over anything else.
        const candidates = mine.filter((a) => a.studentId === studentId);
        const attempt = candidates.find((a) => a.status === "REVIEWED") ?? candidates.find((a) => a.status === "SUBMITTED") ?? null;
        const base = { studentId, attemptId: attempt?.attemptId ?? null, assignmentId: assignment.id, answer: null, answerLabel: null, marks: null, maxMarks: question.marks };
        if (!attempt) return { ...base, state: "NOT_ATTEMPTED" as const };
        if (attempt.status === "SUBMITTED") return { ...base, state: "AWAITING_REVIEW" as const };
        if (!attempt.reviewed) return { ...base, state: "EXCLUDED" as const };
        const answer = attempt.reviewed.responses[question.id]?.trim() || null;
        const mark = attempt.reviewed.marks.find((m) => m.questionId === question.id)?.marks ?? null;
        if (!answer) {
          // In an "answer N of M" section, an unanswered alternative was simply not chosen.
          const section = assignment.paper.blueprint.sections.find((s) => s.id === question.sectionId);
          const answeredInSection = assignment.paper.questions.filter((q) => q.sectionId === question.sectionId && attempt.reviewed!.responses[q.id]?.trim()).length;
          if (section && section.answerCount < section.questionCount && answeredInSection >= section.answerCount) return { ...base, state: "NOT_CHOSEN" as const };
          return { ...base, state: "UNANSWERED" as const };
        }
        if (mark == null || !Number.isFinite(mark) || mark < 0 || mark > question.marks) return { ...base, answer, answerLabel: answerLabel(question, answer), state: "EXCLUDED" as const };
        const state: ResponseState = mark === question.marks ? "CORRECT" : mark === 0 ? "INCORRECT" : "PARTIAL";
        return { ...base, answer, answerLabel: answerLabel(question, answer), marks: mark, state };
      });
      const key = itemKey(assignment.paperId, assignment.paperVersion, question.id);
      out.set(key, [...(out.get(key) ?? []), { assignment, question, responses }]);
    }
  }
  return out;
}

export function fingerprint(responses: ItemResponse[]): string {
  const rows = responses.map((r) => [r.assignmentId, r.studentId, r.attemptId, r.state, r.answer, r.marks]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function summarizeItems(assignments: AssignmentInput[], attempts: AttemptInput[]): ItemSummary[] {
  const grouped = itemResponses(assignments, attempts);
  return [...grouped.entries()].map(([key, parts]) => {
    const { question, assignment } = parts[0];
    const responses = parts.flatMap((p) => p.responses);
    const counts = Object.fromEntries(RESPONSE_STATES.map((s) => [s, responses.filter((r) => r.state === s).length])) as Record<ResponseState, number>;
    const answered = counts.CORRECT + counts.PARTIAL + counts.INCORRECT;
    const choiceCount = (optionId: string) => responses.filter((r) => r.answer && ["CORRECT", "PARTIAL", "INCORRECT"].includes(r.state) && (r.answer === optionId || (question.type === "MULTIPLE_CHOICE" && (() => { try { const ids: unknown = JSON.parse(r.answer!); return Array.isArray(ids) && ids.includes(optionId); } catch { return false; } })()))).length;
    const correctIds = new Set<string>([...(question.correctOptionId ? [question.correctOptionId] : []), ...(question.correctOptionIds ?? [])]);
    return {
      key, paperId: assignment.paperId, paperVersion: assignment.paperVersion, questionId: question.id, prompt: question.prompt, type: question.type,
      outcomeIds: question.outcomeIds ?? [], maxMarks: question.marks, assignments: parts.map((p) => p.assignment.title),
      counts: { ...counts, expected: responses.length, answered },
      percentCorrect: answered >= MIN_SAMPLE ? Math.round((counts.CORRECT / answered) * 1000) / 10 : null,
      caution: answered === 0 ? "No reviewed answers yet." : answered < MIN_SAMPLE ? `Only ${answered} reviewed answers: interpretation is limited.` : null,
      choices: question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE" ? question.options.map((o) => ({ optionId: o.id, label: o.text, count: choiceCount(o.id), correct: correctIds.has(o.id) })) : [],
      evidenceHash: fingerprint(responses),
    };
  });
}

/** A misconception hypothesis must cite reviewed answers that lost marks on this item. */
export function citableAttempts(responses: ItemResponse[]): Set<string> {
  return new Set(responses.filter((r) => (r.state === "INCORRECT" || r.state === "PARTIAL") && r.attemptId).map((r) => r.attemptId!));
}
