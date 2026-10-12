"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssessmentLocale, PaperData } from "@/lib/school-ai/assessment";
import type { ExamResponses, ExamReview, ScoreProposal } from "@/lib/school-ai/exam";
import { examCopy } from "./exam-copy";
import { ExamAccommodations } from "./exam-accommodations";
import { ExamGradebook } from "./exam-gradebook";

type Attempt = { id: string; status: string; submittedAt: string | null; responses: ExamResponses; scoreProposal: ScoreProposal | null; review: (ExamReview & { total: number }) | null; student: { fullName: string; rollNo: string } | null };
export function ExamReviewDesk({ id, locale }: { id: string; locale: AssessmentLocale }) {
  const t = examCopy(locale);
  const [paper, setPaper] = useState<PaperData | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected = attempts.find((attempt) => attempt.id === selectedId);
  const select = (attempt: Attempt) => {
    setSelectedId(attempt.id); setMarks(Object.fromEntries(attempt.scoreProposal?.questions.map((question) => [question.questionId, question.marks === null ? "" : String(question.marks)]) ?? [])); setFeedback({}); setNote(attempt.review?.note ?? ""); setMessage("");
    if (attempt.review) { setMarks(Object.fromEntries(attempt.review.marks.map((mark) => [mark.questionId, String(mark.marks)]))); setFeedback(Object.fromEntries(attempt.review.marks.map((mark) => [mark.questionId, mark.feedback]))); }
  };
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}/attempts`, { cache: "no-store" }); const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      setPaper(payload.paper); setAttempts(payload.attempts); setSelectedId("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setLoading(false); }
  }, [id, t.failure]);
  useEffect(() => { void load(); }, [load]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || !paper) return;
    setBusy(true); setError("");
    try {
      const review: ExamReview = { note, marks: paper.questions.filter((question) => selected.responses[question.id]?.trim()).map((question) => ({ questionId: question.id, marks: Number(marks[question.id]), feedback: feedback[question.id] ?? "" })) };
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}/attempts`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: selected.id, review }) }); const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      await load(); setMessage(t.reviewedHint);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  return <section dir={locale === "en" ? "ltr" : "rtl"} className="mx-auto max-w-5xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{t.review}</h1><Button variant="outline" disabled={busy || loading} onClick={load}>{t.refresh}</Button></div><p className="text-sm text-ink-subtle">{t.reviewedHint}</p><ExamAccommodations id={id} locale={locale} />{error && <p role="alert" className="sk-panel p-4 text-status-error-text">{error}</p>}{message && <p role="status" className="sk-panel p-4">{message}</p>}{loading ? <Skeleton className="h-64 w-full" /> : <><FormField name="mark-attempt" label={t.students}><Select value={selectedId} disabled={busy} onChange={(event) => { const attempt = attempts.find((item) => item.id === event.target.value); if (attempt) select(attempt); }}><option value="">{t.choose}</option>{attempts.map((attempt) => <option key={attempt.id} value={attempt.id}>{attempt.student?.fullName ?? attempt.id} · {attempt.student?.rollNo} · {attempt.status === "REVIEWED" ? t.reviewedState : attempt.status === "SUBMITTED" ? t.needsReview : t.inProgress}</option>)}</Select></FormField>{!attempts.length && <p className="sk-panel p-6 text-center text-ink-subtle">{t.noAttempts}</p>}{selected && paper && <form onSubmit={save} className="space-y-5"><div className="sk-panel space-y-2 p-5"><h2 className="text-xl font-bold">{selected.student?.fullName}</h2><p>{paper.blueprint.title}</p><p>{t.proposed}: {selected.scoreProposal?.totalObjectiveMarks ?? 0} / {paper.blueprint.totalMarks}</p><p className="text-sm text-ink-subtle">{t.unreviewed}</p>{selected.review && <p>{t.total}: {selected.review.total}</p>}</div><fieldset disabled={busy || selected.status !== "SUBMITTED"} className="space-y-5">{paper.questions.map((question, index) => {
    const response = selected.responses[question.id];
    return <div key={question.id} className="sk-panel space-y-4 p-5"><h3 className="whitespace-pre-wrap font-bold">{t.question} {index + 1}: {question.prompt}</h3><div><p className="text-sm font-semibold">{t.original}</p><p className="mt-1 whitespace-pre-wrap">{response ? question.type === "SINGLE_CHOICE" ? question.options.find((option) => option.id === response)?.text ?? response : response : t.noAnswer}</p></div><details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-semibold">{t.model}</summary><p className="mt-3 whitespace-pre-wrap">{question.modelAnswer}</p><ul className="mt-2 list-disc ps-5 text-sm">{question.rubric.map((criterion) => <li key={criterion.id}>{criterion.criterion}: {criterion.marks}</li>)}</ul></details>{response?.trim() && <><FormField name={`review-mark-${question.id}`} label={`${t.marks} · ${t.maximum}: ${question.marks}`}><Input type="number" required min={0} max={question.marks} step={0.25} value={marks[question.id] ?? ""} onChange={(event) => setMarks((previous) => ({ ...previous, [question.id]: event.target.value }))} /></FormField><FormField name={`review-feedback-${question.id}`} label={t.feedback}><Textarea required maxLength={4000} value={feedback[question.id] ?? ""} onChange={(event) => setFeedback((previous) => ({ ...previous, [question.id]: event.target.value }))} /></FormField></>}</div>;
  })}<FormField name="review-note" label={t.note}><Textarea required maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} /></FormField><Button type="submit">{t.finalize}</Button></fieldset>{selected.status === "REVIEWED" && <p className="text-sm text-ink-subtle">{t.already}</p>}</form>}</>}
    {!loading && <ExamGradebook id={id} locale={locale} refreshKey={attempts.map(attempt => `${attempt.id}:${attempt.status}`).join("|")} />}
  </section>;
}
