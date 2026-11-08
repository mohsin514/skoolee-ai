/**
 * SKO-500 (SKO-408 slice 1): Live Pulse, the read model.
 *
 * Which question a sitting is stuck on, without reading a single answer. Built only from whether a
 * response key is present and non-blank in each live attempt's autosaved responses, and from each
 * attempt's last save time. The output type carries no response text, so a role without the right
 * to read responses (an invigilator) can be shown it. "Skipped" is inferred (blank while a later item
 * in the same section is answered) and labelled so on screen. Pure; `now` is an argument.
 */
export interface PulseQuestion { id: string; sectionId: string }
export interface PulseAttempt { id: string; status: string; responses: Readonly<Record<string, string | undefined>>; updatedAt: string; pausedAt: string | null }

export interface ExamPulse {
  live: number;
  questions: Array<{ questionId: string; number: number; answered: number; blank: number; skippedInferred: number; answeredShare: number; skippedShare: number }>;
  sections: Array<{ sectionId: string; answeredShare: number }>;
  stalled: Array<{ attemptId: string; minutes: number }>;
}

/** No save for this long while in progress and not paused reads as stalled. */
export const STALL_MINUTES = 5;
const pct = (part: number, whole: number) => whole > 0 ? Math.round((part / whole) * 100) : 0;
const answered = (value: string | undefined) => typeof value === "string" && value.trim().length > 0;

export function pulseFromAttempts(questions: readonly PulseQuestion[], attempts: readonly PulseAttempt[], now: string): ExamPulse {
  const live = attempts.filter(attempt => attempt.status === "IN_PROGRESS");
  const nowMs = Date.parse(now);
  const perQuestion = questions.map((question, index) => {
    const later = questions.slice(index + 1).filter(other => other.sectionId === question.sectionId);
    let yes = 0, skipped = 0;
    for (const attempt of live) {
      if (answered(attempt.responses[question.id])) yes += 1;
      else if (later.some(other => answered(attempt.responses[other.id]))) skipped += 1;
    }
    return { questionId: question.id, number: index + 1, answered: yes, blank: live.length - yes, skippedInferred: skipped, answeredShare: pct(yes, live.length), skippedShare: pct(skipped, live.length) };
  });
  const sectionIds = [...new Set(questions.map(question => question.sectionId))];
  const sections = sectionIds.map(sectionId => {
    const rows = perQuestion.filter((_row, index) => questions[index].sectionId === sectionId);
    const total = rows.length * live.length;
    return { sectionId, answeredShare: pct(rows.reduce((sum, row) => sum + row.answered, 0), total) };
  });
  const stalled = live.filter(attempt => !attempt.pausedAt).map(attempt => ({ attemptId: attempt.id, minutes: Math.floor((nowMs - Date.parse(attempt.updatedAt)) / 60_000) })).filter(row => row.minutes >= STALL_MINUTES).sort((a, b) => b.minutes - a.minutes);
  return { live: live.length, questions: perQuestion, sections, stalled };
}
