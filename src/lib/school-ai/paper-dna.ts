/**
 * SKO-500 (SKO-408 slice 1): Paper DNA, the deterministic strands.
 *
 * What a paper tests, how its marks are spread, whether it fits its time, what the school has tagged
 * its difficulty as, and how heavy its language is. Computed from the stored paper and its curriculum
 * only: no provider, no estimate of difficulty (recorded tags only). The time budget is a labelled
 * estimate from per-type reading and answering allowances, overridden by a teacher-confirmed
 * per-item minutes value when one exists (slice 8 adds AI-proposed minutes).
 */
import type { CurriculumData, PaperData, Question } from "./assessment";

type QuestionType = Question["type"];

/** Minutes per item: a base for reading plus a per-mark allowance. Defaults a school can change later. */
export const MINUTES_ALLOWANCE: Readonly<Record<QuestionType, { base: number; perMark: number }>> = Object.freeze({
  SINGLE_CHOICE: { base: 0.5, perMark: 0.5 },
  MULTIPLE_CHOICE: { base: 0.75, perMark: 0.5 },
  NUMERIC: { base: 0.5, perMark: 1 },
  SHORT_TEXT: { base: 0.5, perMark: 1.25 },
  MATH: { base: 0.5, perMark: 1.5 },
  EXTENDED_TEXT: { base: 1, perMark: 1.5 },
  CODE: { base: 1, perMark: 2 },
});

export type DnaAdvisory = "MARKS_DO_NOT_ADD_UP" | "OVER_TIME" | "UNDER_TIME" | "ASSESSES_UNTAUGHT" | "MIXED_NUMERALS" | "NO_ITEMS";

export interface PaperDna {
  marks: { blueprint: number; items: number; bySection: Array<{ sectionId: string; title: string; marks: number; share: number }>; byType: Array<{ type: QuestionType; marks: number; share: number }> };
  coverage: { assessed: Array<{ outcomeId: string; title: string; marks: number }>; taughtNotAssessed: string[]; assessedNotTaught: string[] };
  time: { durationMinutes: number; estimatedMinutes: number; ratio: number; estimate: true };
  difficulty: { EASY: number; MEDIUM: number; HARD: number; UNSPECIFIED: number };
  language: { charactersPerMark: number; mixedNumeralItems: number[] };
  advisories: DnaAdvisory[];
}

const ARABIC_INDIC = /[٠-٩۰-۹]/;
const ASCII_DIGIT = /[0-9]/;
const share = (part: number, whole: number) => whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
const minutesFor = (question: Question) => {
  const confirmed = (question as Question & { profile?: { minutes?: number; confirmed?: boolean } }).profile;
  if (confirmed?.confirmed && typeof confirmed.minutes === "number") return confirmed.minutes;
  const allowance = MINUTES_ALLOWANCE[question.type];
  return allowance.base + allowance.perMark * question.marks;
};

export function paperDna(paper: Pick<PaperData, "blueprint" | "questions">, curriculum: Pick<CurriculumData, "outcomes"> | null, taughtOutcomeIds: ReadonlySet<string> | null): PaperDna {
  const questions = paper.questions;
  // A choice section ("answer 1 of 2") counts only the items a candidate answers: the highest-mark
  // `answerCount` items, which is the most a candidate can score and the time they must spend.
  const answered = paper.blueprint.sections.flatMap(section => questions.filter(question => question.sectionId === section.id).sort((a, b) => b.marks - a.marks).slice(0, section.answerCount));
  const unsectioned = questions.filter(question => !paper.blueprint.sections.some(section => section.id === question.sectionId));
  const counted = [...answered, ...unsectioned];
  const itemMarks = counted.reduce((sum, question) => sum + question.marks, 0);
  const sections = paper.blueprint.sections.map(section => {
    const marks = answered.filter(question => question.sectionId === section.id).reduce((sum, question) => sum + question.marks, 0);
    return { sectionId: section.id, title: section.title, marks, share: share(marks, itemMarks) };
  });
  const typeMarks = new Map<QuestionType, number>();
  for (const question of counted) typeMarks.set(question.type, (typeMarks.get(question.type) ?? 0) + question.marks);
  const byType = [...typeMarks].map(([type, marks]) => ({ type, marks, share: share(marks, itemMarks) })).sort((a, b) => b.marks - a.marks);

  const titles = new Map((curriculum?.outcomes ?? []).map(outcome => [outcome.id, outcome.title]));
  const outcomeMarks = new Map<string, number>();
  for (const question of questions) {
    const ids = [...new Set(question.outcomeIds)];
    for (const id of ids) outcomeMarks.set(id, (outcomeMarks.get(id) ?? 0) + question.marks / Math.max(1, ids.length));
  }
  const assessed = [...outcomeMarks].map(([outcomeId, marks]) => ({ outcomeId, title: titles.get(outcomeId) ?? outcomeId, marks: Math.round(marks * 100) / 100 }));
  const assessedIds = new Set(outcomeMarks.keys());
  const taught = taughtOutcomeIds ?? new Set((curriculum?.outcomes ?? []).filter(outcome => outcome.included && outcome.taught).map(outcome => outcome.id));
  const taughtNotAssessed = [...taught].filter(id => !assessedIds.has(id));
  const assessedNotTaught = [...assessedIds].filter(id => !taught.has(id));

  const estimatedMinutes = Math.round(counted.reduce((sum, question) => sum + minutesFor(question), 0));
  const duration = paper.blueprint.durationMinutes;
  const ratio = duration > 0 ? Math.round((estimatedMinutes / duration) * 100) / 100 : 0;

  const difficulty = { EASY: 0, MEDIUM: 0, HARD: 0, UNSPECIFIED: 0 };
  for (const question of questions) difficulty[question.bankMetadata?.difficulty ?? "UNSPECIFIED"] += 1;

  const characters = questions.reduce((sum, question) => sum + question.prompt.length + question.options.reduce((total, option) => total + option.text.length, 0), 0);
  const mixedNumeralItems = questions.flatMap((question, index) => {
    const text = [question.prompt, ...question.options.map(option => option.text)].join(" ");
    return ARABIC_INDIC.test(text) && ASCII_DIGIT.test(text) ? [index + 1] : [];
  });

  const advisories: DnaAdvisory[] = [];
  if (!questions.length) advisories.push("NO_ITEMS");
  if (questions.length && Math.abs(itemMarks - paper.blueprint.totalMarks) > 0.001) advisories.push("MARKS_DO_NOT_ADD_UP");
  if (questions.length && ratio > 1.1) advisories.push("OVER_TIME");
  if (questions.length && ratio > 0 && ratio < 0.5) advisories.push("UNDER_TIME");
  if (assessedNotTaught.length) advisories.push("ASSESSES_UNTAUGHT");
  if (mixedNumeralItems.length) advisories.push("MIXED_NUMERALS");

  return {
    marks: { blueprint: paper.blueprint.totalMarks, items: Math.round(itemMarks * 100) / 100, bySection: sections, byType },
    coverage: { assessed, taughtNotAssessed, assessedNotTaught },
    time: { durationMinutes: duration, estimatedMinutes, ratio, estimate: true },
    difficulty,
    language: { charactersPerMark: itemMarks > 0 ? Math.round(characters / itemMarks) : 0, mixedNumeralItems },
    advisories,
  };
}
