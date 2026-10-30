"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import type { ExamPulse } from "@/lib/school-ai/exam-pulse";

/**
 * SKO-500: Live Pulse in the Control room. Shares only (answered, skipped), stalled counts and section
 * progress, refreshed every 20 seconds while open; never a response. "Skipped" is labelled inferred.
 */
const REFRESH_MS = 20_000;
type PulseView = { checkedAt: string; sections: Array<{ id: string; title: string }>; pulse: ExamPulse };

export function PulsePanel({ language, examId, onDraft }: { language: Language; examId: string; onDraft?: (questionId: string, number: number) => void }) {
  const t = studioHomeCopy(language);
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const time = (value: string) => new Intl.DateTimeFormat(language, { timeStyle: "short" }).format(new Date(value));
  const [view, setView] = useState<PulseView | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/pulse`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setFailed(true); return; }
    setFailed(false); setView(await response.json());
  }, [examId]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  if (failed && !view) return <Alert tone="info" compact>{t.pulseFailed}</Alert>;
  if (!view) return null;
  const { pulse } = view;
  return <section className="sk-panel space-y-3 p-4 sm:p-5" aria-labelledby={`pulse-${examId}`} data-live-pulse>
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id={`pulse-${examId}`} className="flex items-center gap-2 text-base font-bold"><Activity aria-hidden="true" className="size-4 text-primary" />{t.pulseTitle}</h3>
      <p className="text-xs text-ink-subtle">{fillStudioCopy(t.pulseChecked, [time(view.checkedAt)])}</p>
    </header>
    <p className="text-sm text-ink-muted">{t.pulseIntro}</p>
    {pulse.live === 0 ? <p className="text-sm">{t.pulseNone}</p> : <>
      <p className="text-sm font-semibold">{fillStudioCopy(t.pulseLive, [number(pulse.live)])}</p>
      {pulse.stalled.length ? <Alert tone="warning" compact>{fillStudioCopy(t.pulseStalled, [number(pulse.stalled.length)])}</Alert> : null}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label={t.pulseTitle}>
        {pulse.questions.map(row => <li key={row.questionId} className="space-y-1 rounded-xl border border-border-subtle p-2 text-xs" data-pulse-question>
          <p className="font-bold">{fillStudioCopy(t.pulseQuestion, [number(row.number)])}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${row.answeredShare}%` }} /></div>
          <p>{fillStudioCopy(t.pulseAnswered, [number(row.answeredShare)])}</p>
          {row.skippedShare > 0 ? <p className="text-status-warning-text">{fillStudioCopy(t.pulseSkipped, [number(row.skippedShare)])}</p> : null}
          {/* SKO-502: a question many skip becomes one clarification for the room. */}
          {onDraft && row.skippedShare >= 25 ? <Button type="button" size="sm" variant="ghost" className="h-auto min-h-0 px-1 py-0.5 text-2xs" onClick={() => onDraft(row.questionId, row.number)} data-pulse-draft>{t.pulseDraft}</Button> : null}
        </li>)}
      </ol>
      <p className="text-xs text-ink-subtle">{t.pulseSkippedNote}</p>
    </>}
  </section>;
}
