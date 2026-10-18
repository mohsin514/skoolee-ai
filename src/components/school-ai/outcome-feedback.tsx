"use client";

import { useEffect, useState } from "react";
import { PracticeSessionPanel } from "./practice-session-panel";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSpacesCopy, type StudioSpacesCopy } from "@/lib/school-ai/exam-studio-copy-spaces";
import type { OutcomeFeedback } from "@/lib/school-ai/recovery";
import { Isolated } from "./exam-studio/space-state";

// SKO-408 R18.1/R18.2: outcome feedback built only from moderated marks and the teacher's words.
const OUTCOME_STATUS: Record<OutcomeFeedback["status"], keyof StudioSpacesCopy> = { ADDRESSED: "statusAddressed", PARTIAL: "statusPartial", MISSED: "statusMissed", NOT_ANSWERED: "statusNotAnswered" };

/** One learner's feedback: per outcome, the status and the exact items, marks and teacher words behind it. */
export function OutcomeFeedbackList({ feedback, language }: { feedback: OutcomeFeedback[]; language: Language }) {
  const t = studioSpacesCopy(language), number = (value: number) => new Intl.NumberFormat(language).format(value);
  return <ul className="mt-2 grid gap-2 text-sm" data-outcome-feedback>{feedback.map(outcome => <li key={outcome.outcomeId} className="rounded-lg border p-2" data-outcome-status={outcome.status}>
    <p className="font-semibold"><Isolated>{outcome.title ?? outcome.outcomeId}</Isolated> · {t[OUTCOME_STATUS[outcome.status]]}</p>
    <ul className="mt-1 grid gap-1">{outcome.evidence.map(row => <li key={row.questionId} className="text-ink-subtle">
      {fillStudioCopy(t.evidenceRow, [number(row.number), number(row.awarded), number(row.maximum)])}{!row.answered ? ` · ${t.statusNotAnswered}` : ""}
      {row.feedback && <span className="block">{t.teacherFeedback}: <span dir="auto" className="text-ink">{row.feedback}</span></span>}
    </li>)}</ul>
  </li>)}</ul>;
}

/** The learner's own feedback, shown only once the school has released results (R18.12, R18.13). */
export function LearnerFeedback({ id, language }: { id: string; language: Language }) {
  const t = studioSpacesCopy(language);
  const [feedback, setFeedback] = useState<OutcomeFeedback[] | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(`/api/school-ai/exams/${encodeURIComponent(id)}/improvement`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(payload => { if (live) setFeedback(payload?.improvement?.feedback ?? null); }).catch(() => undefined);
    return () => { live = false; };
  }, [id]);
  const [practice, setPractice] = useState<Array<{ id: string; title: string; items: Array<{ prompt: string; options: string[]; marks: number }> }>>([]);
  useEffect(() => {
    let live = true;
    void fetch("/api/school-ai/practice", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(payload => { if (live) setPractice(payload?.sets ?? []); }).catch(() => undefined);
    return () => { live = false; };
  }, [id]);
  if (!feedback?.length) return null;
  return <section aria-labelledby="learner-feedback" className="sk-panel space-y-1 p-5" data-learner-feedback>
    <h2 id="learner-feedback" className="text-lg font-bold">{t.learnerTitle}</h2>
    <p className="text-sm text-ink-subtle">{t.learnerIntro}</p>
    <OutcomeFeedbackList feedback={feedback} language={language} />
    {practice.length > 0 && <div className="mt-4 space-y-2" data-learner-practice>
      <h3 className="font-semibold">{t.learnerPracticeTitle}</h3>
      {/* SKO-426: practise the approved set in short sessions with hints and revisits. */}
      <PracticeSessionPanel />
    </div>}
  </section>;
}
