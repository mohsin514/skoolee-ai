"use client";

import { useEffect, useState } from "react";
import { MonitorCheck } from "lucide-react";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { OutcomeFeedbackList } from "@/components/school-ai/outcome-feedback";
import type { OutcomeFeedback } from "@/lib/school-ai/recovery";
import type { Language } from "@/lib/locale/package";

type Result = { id: string; title: string; releasedAt: string; resultVersion: number; total: number; maximum: number; note: string; feedback: OutcomeFeedback[] };

/** SKO-505: the child's released online results — marks, the teacher's note and outcome feedback. No ranking. */
export function FamilyExamResults({ studentId }: { studentId: string | null }) {
  const ui = useUiText();
  const { language } = useLocale();
  const { date } = useLocaleFormat();
  const [results, setResults] = useState<Result[] | null>(null);
  useEffect(() => {
    let live = true;
    setResults(null);
    void fetch(`/api/parent/exam-results${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`, { cache: "no-store" })
      .then(async response => { const payload = await response.json().catch(() => ({})); if (live) setResults(response.ok && Array.isArray(payload.data) ? payload.data : []); })
      .catch(() => { if (live) setResults([]); });
    return () => { live = false; };
  }, [studentId]);
  if (!results?.length) return null;
  const n = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  return <section aria-labelledby="family-exam-results" className="sk-panel space-y-3 p-4" data-family-exam-results>
    <h2 id="family-exam-results" className="flex items-center gap-2 text-base font-bold text-ink-strong"><MonitorCheck aria-hidden="true" className="size-4" />{ui("Online exam results")}</h2>
    <ul className="grid gap-2">{results.map(result => <li key={result.id} data-family-exam-result>
      <details className="rounded-xl border border-border p-3">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2"><span className="font-semibold text-ink-strong [overflow-wrap:anywhere]"><bdi>{result.title}</bdi></span><span className="text-sm font-bold tabular-nums text-primary">{ui("{0} of {1} marks", [n(result.total), n(result.maximum)])}</span></summary>
        <p className="mt-2 text-xs text-ink-muted">{ui("Released {0}", [date(result.releasedAt)])}</p>
        {result.note ? <p dir="auto" className="mt-2 text-sm [overflow-wrap:anywhere]">{result.note}</p> : null}
        <OutcomeFeedbackList feedback={result.feedback} language={language as Language} />
      </details>
    </li>)}</ul>
  </section>;
}
