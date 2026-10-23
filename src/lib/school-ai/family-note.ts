import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "./exam-studio-copy";
import { studioResultsCopy } from "./exam-studio-copy-results";
import type { OutcomeFeedback } from "./recovery";

/**
 * SKO-504 Family Note: one sentence from this learner's own outcome feedback — the outcome they showed
 * most fully and the one to work on next. Deterministic; never a rank, a score comparison or a diagnosis.
 */
export const FAMILY_NOTE_LANGUAGES = ["en", "ar", "ur"] as const;
export const familyNoteLanguage = (value: string | null | undefined): Language => (FAMILY_NOTE_LANGUAGES as readonly string[]).includes(value ?? "") ? value as Language : "en";

const isolate = (value: string) => `⁨${value}⁩`;

export function familySentence(language: Language, learner: string, examTitle: string, feedback: readonly OutcomeFeedback[]): string {
  const t = studioResultsCopy(language);
  const titled = feedback.filter(outcome => outcome.title && outcome.possible > 0);
  const strong = titled.filter(outcome => outcome.status === "ADDRESSED").sort((a, b) => b.possible - a.possible || a.outcomeId.localeCompare(b.outcomeId))[0];
  const next = titled.filter(outcome => outcome.status === "MISSED" || outcome.status === "PARTIAL")
    .sort((a, b) => a.awarded / a.possible - b.awarded / b.possible || b.possible - a.possible || a.outcomeId.localeCompare(b.outcomeId))[0];
  const name = isolate(learner);
  if (strong && next) return fillStudioCopy(t.noteStrongNext, [name, isolate(strong.title!), isolate(next.title!)]);
  if (strong) return fillStudioCopy(t.noteStrong, [name, isolate(strong.title!)]);
  if (next) return fillStudioCopy(t.noteNext, [name, isolate(next.title!)]);
  return fillStudioCopy(t.noteNeither, [name, isolate(examTitle)]);
}
