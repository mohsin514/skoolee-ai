"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AssessmentLocale, PaperData } from "@/lib/school-ai/assessment";
import type { SemanticReview } from "@/lib/school-ai/learning";
import { learningCopy } from "./learning-copy";

export function PaperSemanticReview({ record, paper, locale, disabled }: { record: { id: string; version: number } | null; paper: PaperData; locale: AssessmentLocale; disabled: boolean }) {
  const t = learningCopy(locale);
  const [questions, setQuestions] = useState(paper.questions.slice(0, 20).map(row => row.id));
  const [review, setReview] = useState<SemanticReview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef<unknown>(null);
  useEffect(() => {
    if (!record) return;
    const controller = new AbortController();
    fetch(`/api/school-ai/learning?action=semantic&recordId=${encodeURIComponent(record.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : t.failure); if (!controller.signal.aborted) setReview(data.result?.review ?? null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t.failure); });
    return () => controller.abort();
  }, [record, t.failure]);
  const run = async () => {
    if (!record) return;
    setBusy(true); setError("");
    pending.current ??= { recordId: record.id, version: record.version, language: locale, questionIds: questions, idempotencyKey: crypto.randomUUID() };
    try {
      const response = await fetch("/api/school-ai/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "semantic", data: pending.current }), signal: AbortSignal.timeout(180000) });
      const data = await response.json();
      if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(typeof data.error === "string" ? data.error : t.failure); }
      setReview(data.result); pending.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  return <section className="sk-panel space-y-4 p-5" aria-label={t.semantic}>
    <h3 className="font-bold">{t.semantic}</h3><p className="text-sm text-ink-subtle">{t.semanticHint}</p>
    {error && <p role="alert" className="text-status-error-text">{error}</p>}
    <fieldset disabled={!record || disabled || busy} className="space-y-2"><legend className="text-sm font-semibold">{t.selected}</legend><p className="text-sm text-ink-subtle">{t.maxQuestions}</p>
      {paper.questions.map((question, index) => <label key={question.id} className="flex min-h-11 items-start gap-3 py-2 text-sm"><Checkbox checked={questions.includes(question.id)} disabled={!questions.includes(question.id) && questions.length >= 20} onChange={event => { setQuestions(previous => event.target.checked ? [...previous, question.id] : previous.filter(id => id !== question.id)); pending.current = null; }} /><span className="min-w-0 break-words">{index + 1}. {question.prompt}</span></label>)}
      <Button type="button" disabled={!questions.length} onClick={run}>{t.runReview}</Button>
    </fieldset>
    {!review && <p className="text-sm text-ink-subtle">{t.noReview}</p>}
    {review && <div className="space-y-4">{review.checks.map(check => <div key={check.questionId} className="space-y-2 rounded-xl border border-border p-4"><p className="break-words font-semibold">{paper.questions.find(row => row.id === check.questionId)?.prompt}</p><p className={check.consistent ? "text-status-success-text" : "text-status-warning-text"}>{check.consistent ? t.consistent : t.inconsistent}</p><p className="whitespace-pre-wrap break-words text-sm"><strong>{t.independent}: </strong>{check.independentAnswer}</p><p className="break-words text-sm"><strong>{t.reason}: </strong>{check.reason}</p></div>)}<h4 className="font-semibold">{t.findings}</h4>{!review.findings.length && <p className="text-sm text-ink-subtle">{t.noFindings}</p>}{review.findings.map((finding, index) => <div key={index} className="space-y-2 rounded-xl border border-border p-4"><p className="break-words text-sm">{finding.explanation}</p><blockquote className="whitespace-pre-wrap break-words border-s-2 border-border ps-3 text-sm">{finding.quote}</blockquote></div>)}</div>}
  </section>;
}
