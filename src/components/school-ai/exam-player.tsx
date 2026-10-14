"use client";

import { CandidateFigures } from "./candidate-figures";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, RefreshCw, Save } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ModalSurface } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssessmentLocale, CandidatePaper } from "@/lib/school-ai/assessment";
import type { ExamResponses } from "@/lib/school-ai/exam";
import { examCopy } from "./exam-copy";
import { ExamResults } from "./exam-results";
import { AdvancedAnswer } from "./assessment-extensions";
import { assessmentExtensionCopy } from "./assessment-extension-copy";
import { ExamPreflight, type ExamInfo } from "./exam-preflight";
import { ExamProctorCapture } from "./exam-proctor-capture";

type Attempt = { id: string; status: string; startedAt: string; deadlineAt: string; sequence: number; responses: ExamResponses; submittedAt: string | null; serverNow: string; paper: CandidatePaper; accepted?: boolean };
type PendingSave = { sequence: number; responses: ExamResponses; submit: boolean };
const same = (a: ExamResponses, b: ExamResponses) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export function ExamPlayer({ id, locale }: { id: string; locale: AssessmentLocale }) {
  const t = examCopy(locale), extension = assessmentExtensionCopy(locale);
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<ExamResponses>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [lateAnswers, setLateAnswers] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const answersRef = useRef<ExamResponses>({});
  const attemptRef = useRef<Attempt | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef<PendingSave | null>(null);
  const latestDirty = useRef(false);
  const expiredRequested = useRef(false);
  const api = `/api/school-ai/exams/${encodeURIComponent(id)}`;
  const syncAttempt = useCallback((value: Attempt | null) => {
    setAttempt(value); attemptRef.current = value;
    if (value) { offset.current = new Date(value.serverNow).getTime() - Date.now(); answersRef.current = value.responses; setAnswers(value.responses); }
    setDirty(false); latestDirty.current = false; pendingRef.current = null; setConflict(false); expiredRequested.current = false;
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [infoResponse, attemptResponse] = await Promise.all([fetch(api, { cache: "no-store" }), fetch(`${api}/attempt`, { cache: "no-store" })]);
      const [info, saved] = await Promise.all([infoResponse.json(), attemptResponse.json()]);
      if (!infoResponse.ok || !attemptResponse.ok) throw new Error(typeof (info.error ?? saved.error) === "string" ? info.error ?? saved.error : t.failure);
      setExam(info.exam); syncAttempt(saved.attempt);
      offset.current = new Date(saved.attempt?.serverNow ?? info.exam.serverNow).getTime() - Date.now();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setLoading(false); }
  }, [api, syncAttempt, t.failure]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (latestDirty.current || savingRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const save = useCallback(async (submit = false) => {
    if (!attemptRef.current || attemptRef.current.status !== "IN_PROGRESS" || savingRef.current || conflict) return;
    savingRef.current = true; setBusy(true); setError("");
    try {
      // Retry an uncertain request with its exact sequence and payload before sending newer edits.
      for (;;) {
        const current = attemptRef.current!;
        const request = pendingRef.current ?? { sequence: current.sequence + 1, responses: { ...answersRef.current }, submit };
        pendingRef.current = request;
        const response = await fetch(`${api}/attempt`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(15000) });
        const payload = await response.json();
        if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(typeof payload.error === "string" ? payload.error : t.failure); }
        const next = payload.attempt as Attempt;
        pendingRef.current = null; attemptRef.current = next; setAttempt(next); offset.current = new Date(next.serverNow).getTime() - Date.now();
        const remainsDirty = !same(answersRef.current, request.responses);
        setDirty(remainsDirty); latestDirty.current = remainsDirty;
        if (next.status !== "IN_PROGRESS") { setLateAnswers(next.accepted === false && !same(answersRef.current, next.responses)); answersRef.current = next.responses; setAnswers(next.responses); setDirty(false); latestDirty.current = false; setConfirm(false); break; }
        if (!submit || request.submit) break;
      }
    } catch (cause) { setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : t.failure); }
    finally { savingRef.current = false; setBusy(false); }
  }, [api, conflict, t.failure]);
  useEffect(() => {
    if (!dirty || conflict || busy || error || attempt?.status !== "IN_PROGRESS") return;
    const timeout = window.setTimeout(() => { void save(); }, 1200);
    return () => window.clearTimeout(timeout);
  }, [answers, dirty, conflict, busy, error, attempt?.status, save]);
  const remaining = attempt ? Math.max(0, Math.ceil((new Date(attempt.deadlineAt).getTime() - now - offset.current) / 1000)) : 0;
  useEffect(() => {
    if (attempt?.status === "IN_PROGRESS" && remaining === 0 && !busy && !expiredRequested.current) {
      expiredRequested.current = true; void save(true);
    }
  }, [attempt?.status, remaining, busy, save]);
  const update = (questionId: string, value: string) => {
    const next = { ...answersRef.current, [questionId]: value };
    answersRef.current = next; setAnswers(next); setDirty(true); latestDirty.current = true;
  };
  const start = async (version: number) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${api}/attempt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }), signal: AbortSignal.timeout(15000) });
      const payload = await response.json();
      if (!response.ok) { if (response.status === 409) { await load(); } throw new Error(typeof payload.error === "string" ? payload.error : t.failure); }
      syncAttempt(payload.attempt);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  if (loading) return <div aria-busy="true" aria-label={t.loading} className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  const finished = !!attempt && attempt.status !== "IN_PROGRESS";
  const answered = attempt?.paper.questions.filter((question) => answers[question.id]?.trim()).length ?? 0;
  return <section dir={locale === "en" ? "ltr" : "rtl"} className={`mx-auto max-w-5xl space-y-5 ${exam?.assistance?.largeText ? "text-xl" : ""}`}>
    <header className="sk-panel space-y-3 p-5"><h1 className="text-2xl font-bold">{exam?.title ?? t.title}</h1><p className="text-sm text-ink-subtle">{t.browserNotice}</p>{exam && (exam.assistance?.reader || exam.assistance?.scribe || exam.breakMinutes) ? <p className="text-sm">{extension.accessibility}: {[exam.assistance?.reader ? extension.reader : "", exam.assistance?.scribe ? extension.scribe : "", exam.breakMinutes ? `${extension.breakMinutes}: ${exam.breakMinutes}` : ""].filter(Boolean).join(" · ")}</p> : null}{exam && <p className="text-sm">{t.duration}: {exam.durationMinutes} {t.minutes} · {t.marks}: {exam.totalMarks}</p>}</header>
    {error && <div role="alert" className="sk-panel space-y-3 p-4 text-status-error-text"><p>{error}</p>{conflict ? <Button variant="outline" onClick={() => setReloadConfirm(true)}>{t.reload}</Button> : <Button variant="outline" disabled={busy} onClick={() => attempt ? save(remaining === 0) : load()}><RefreshCw />{t.retry}</Button>}</div>}
    {!attempt && exam && <div className="sk-panel space-y-4 p-6"><p>{t.startHint}</p><p className="text-sm text-ink-subtle">{t.starts}: {new Date(exam.startsAt).toLocaleString(locale)} · {t.ends}: {new Date(exam.endsAt).toLocaleString(locale)}</p></div>}
    {!attempt && exam && <ExamPreflight key={`${id}:${exam.version}`} id={id} exam={exam} locale={locale} busy={busy} serverNow={now + offset.current} onChecked={(value) => { setExam(value); offset.current = new Date(value.serverNow).getTime() - Date.now(); }} onStart={start} />}
    {finished && <div role="status" className="sk-panel space-y-2 p-6"><CheckCircle2 aria-hidden="true" className="size-7 text-status-success-text" /><h2 className="text-xl font-bold">{t.receipt}</h2><p>{t.receiptHint}</p>{lateAnswers && <p role="alert" className="text-status-error-text">{t.lateAnswers}</p>}<p className="break-all text-sm text-ink-subtle">{t.receiptId}: {attempt.id}</p>{attempt.submittedAt && <p className="text-sm">{new Date(attempt.submittedAt).toLocaleString(locale)}</p>}</div>}
    {finished && <ExamResults id={id} locale={locale} student />}
    {finished && <Link href="/student" className={buttonVariants({ variant: "outline" })}>{t.studentHome}</Link>}
    {attempt && <ExamProctorCapture id={id} attemptId={attempt.id} active={!finished && remaining > 0} deadlineAt={attempt.deadlineAt} locale={locale} />}
    {attempt && !finished && <>
      <div className="sk-panel sticky top-3 z-10 flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-2" role="timer" aria-label={t.time}><Clock3 aria-hidden="true" /><span className="font-mono text-lg font-bold" dir="ltr">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span></div><p role="status" className="text-sm">{busy ? t.saving : dirty ? t.unsaved : t.saved}</p><p className="text-sm">{t.answered}: {answered} / {attempt.paper.questions.length}</p><Button variant="outline" disabled={busy || conflict} onClick={() => save(remaining === 0)}><Save />{t.retry}</Button></div>
      {remaining === 0 && <p role="alert" className="sk-panel p-4">{t.expired}</p>}<p className="text-sm text-ink-subtle">{t.savingHint}</p><p className="whitespace-pre-wrap">{attempt.paper.instructions}</p>
      {!!attempt.paper.resources?.length && <section className="sk-panel space-y-3 p-5"><h2 className="font-bold">{extension.resources}</h2>{attempt.paper.resources.map(resource => <details key={resource.id} className="rounded-xl border border-border p-3"><summary className="cursor-pointer font-semibold">{resource.title}</summary><p className="mt-3 whitespace-pre-wrap">{resource.content}</p></details>)}</section>}
      <nav aria-label={t.viewQuestion} className="flex flex-wrap gap-2">{attempt.paper.questions.map((question, index) => <Button key={question.id} size="icon" variant={answers[question.id]?.trim() ? "secondary" : "outline"} aria-label={`${t.question} ${index + 1}: ${answers[question.id]?.trim() ? t.answered : t.unanswered}`} onClick={() => document.getElementById(`exam-answer-${question.id}`)?.focus()}>{index + 1}</Button>)}</nav>
      <fieldset disabled={remaining === 0 || conflict} className="space-y-6">{attempt.paper.sections.map((section) => {
        const questions = attempt.paper.questions.filter((question) => question.sectionId === section.id);
        const count = questions.filter((question) => answers[question.id]?.trim()).length;
        return <section key={section.id} className="space-y-4"><h2 className="text-lg font-bold">{section.title}</h2><p className="text-sm text-ink-subtle">{t.required}: {section.answerCount} / {section.questionCount} · {t.answered}: {count}</p>{questions.map((question) => {
          const full = count >= section.answerCount && !answers[question.id]?.trim();
          return <div key={question.id} className="sk-panel space-y-4 p-5"><h3 className="whitespace-pre-wrap font-semibold">{question.prompt}</h3><CandidateFigures figures={question.figures}/><p className="text-sm text-ink-subtle">{t.marks}: {question.marks}</p>{question.type === "SINGLE_CHOICE" ? <fieldset id={`exam-answer-${question.id}`} tabIndex={-1} className="space-y-2" disabled={full}><legend className="sr-only">{t.choice}: {question.prompt}</legend>{question.options.map((option) => <Button key={option.id} variant="choice" className="h-auto min-h-12 w-full justify-start whitespace-normal text-start" aria-pressed={answers[question.id] === option.id} onClick={() => update(question.id, option.id)}>{option.text}</Button>)}</fieldset> : ["MULTIPLE_CHOICE", "NUMERIC", "MATH", "CODE"].includes(question.type) ? <AdvancedAnswer question={question} locale={locale} value={answers[question.id] ?? ""} disabled={full} onChange={value => update(question.id, value)} /> : <FormField name={`exam-answer-${question.id}`} id={`exam-answer-${question.id}`} label={t.answer}><Textarea rows={question.type === "EXTENDED_TEXT" ? 8 : 4} maxLength={20000} disabled={full} value={answers[question.id] ?? ""} onChange={(event) => update(question.id, event.target.value)} /></FormField>}<Button variant="ghost" disabled={!answers[question.id]} onClick={() => update(question.id, "")}>{t.clear}</Button></div>;
        })}</section>;
      })}</fieldset>
      <div className="sk-panel space-y-3 p-5"><p className="text-sm">{t.submitHint}</p><Button disabled={busy || conflict} onClick={() => setConfirm(true)}>{t.submit}</Button></div>
    </>}
    {confirm && <ModalSurface ariaLabel={t.submit} onClose={() => setConfirm(false)} dismissible={!busy}><div className="space-y-4 p-5"><p>{t.confirm}</p><p>{t.answered}: {answered} / {attempt?.paper.questions.length}</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>{t.cancel}</Button><Button disabled={busy} onClick={() => save(true)}>{t.submit}</Button></div></div></ModalSurface>}
    {reloadConfirm && <ModalSurface ariaLabel={t.reload} onClose={() => setReloadConfirm(false)}><div className="space-y-4 p-5"><p>{t.reloadWarning}</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setReloadConfirm(false)}>{t.cancel}</Button><Button onClick={() => { setReloadConfirm(false); void load(); }}>{t.reload}</Button></div></div></ModalSurface>}
  </section>;
}
