"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  // SKAI-1521: a failed load is its own state with Retry; only a successful empty list hides the section.
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  // SKAI-1715: results arrive newest first in pages; "Show older results" follows nextCursor.
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false), [olderFailed, setOlderFailed] = useState(false);
  const request = useRef(0);
  const url = (cursor?: string) => {
    const query = new URLSearchParams();
    if (studentId) query.set("studentId", studentId);
    if (cursor) query.set("cursor", cursor);
    const text = query.toString();
    return `/api/parent/exam-results${text ? `?${text}` : ""}`;
  };
  useEffect(() => {
    const id = ++request.current;
    setResults(null); setFailed(false); setNextCursor(null); setOlderFailed(false); setLoadingOlder(false);
    void fetch(url(), { cache: "no-store" })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (id !== request.current) return;
        if (response.ok && Array.isArray(payload.data)) { setResults(payload.data); setNextCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null); } else setFailed(true);
      })
      .catch(() => { if (id === request.current) setFailed(true); });
    return () => { request.current++; };
  }, [studentId, attempt]);
  const showOlder = async () => {
    if (!nextCursor || loadingOlder) return;
    const id = request.current;
    setLoadingOlder(true); setOlderFailed(false);
    try {
      const response = await fetch(url(nextCursor), { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (id !== request.current) return;
      if (!response.ok || !Array.isArray(payload.data)) throw new Error("older page failed");
      setResults(current => {
        const seen = new Set((current ?? []).map(row => row.id));
        return [...(current ?? []), ...(payload.data as Result[]).filter(row => !seen.has(row.id))];
      });
      setNextCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
    } catch {
      if (id === request.current) setOlderFailed(true);
    } finally {
      if (id === request.current) setLoadingOlder(false);
    }
  };
  if (failed) return <section aria-labelledby="family-exam-results" className="sk-panel space-y-3 p-4" data-family-exam-results-error>
    <h2 id="family-exam-results" className="flex items-center gap-2 text-base font-bold text-ink-strong"><MonitorCheck aria-hidden="true" className="size-4" />{ui("Online exam results")}</h2>
    <p role="alert" className="text-sm text-status-error-text">{ui("Online exam results could not be loaded. Try again.")}</p>
    <Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>{ui("Try again")}</Button>
  </section>;
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
    {olderFailed ? <p role="alert" className="text-sm text-status-danger-text">{ui("Older exam results could not be loaded. Try again.")}</p> : null}
    {nextCursor ? <Button size="sm" variant="outline" loading={loadingOlder} onClick={() => void showOlder()}>{ui(olderFailed ? "Try again" : "Show older results")}</Button> : null}
  </section>;
}
