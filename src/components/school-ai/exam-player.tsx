"use client";

import { CandidateFigures } from "./candidate-figures";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, RefreshCw, Save, Flag, ShieldCheck, ArrowLeft, ArrowRight, ListChecks } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ModalSurface } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssessmentLocale, CandidatePaper } from "@/lib/school-ai/assessment";
import type { ExamResponses } from "@/lib/school-ai/exam";
import { examCopy } from "./exam-copy";
import { examRoomCopy } from "./exam-room-copy";
import { ExamResults } from "./exam-results";
import { AdvancedAnswer } from "./assessment-extensions";
import { assessmentExtensionCopy } from "./assessment-extension-copy";
import { ExamPreflight, type ExamInfo, type CameraStartEvidence } from "./exam-preflight";
import { ExamProctorCapture } from "./exam-proctor-capture";
import { useExamIntegrity } from "./use-exam-integrity";
import { ExamIntegrityNotice } from "./exam-integrity-policy";
import { examCameraCopy } from "./exam-camera-copy";
import { notifyCandidateExamSession } from "@/components/providers/candidate-exam-guard";
import { answerStatus, readDraft, reconcileDraft, retryDelay, writeDraft, type DraftDecision } from "@/lib/school-ai/exam-draft";
import { examRecoveryCopy } from "./exam-recovery-copy";
import { SecureBrowserGate } from "./secure-browser";

type Attempt = { id: string; status: string; startedAt: string; deadlineAt: string; sequence: number; responses: ExamResponses; submittedAt: string | null; serverNow: string; paper: CandidatePaper; accepted?: boolean };
type PendingSave = { sequence: number; responses: ExamResponses; submit: boolean };
const same = (a: ExamResponses, b: ExamResponses) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export function ExamPlayer({ id, locale }: { id: string; locale: AssessmentLocale }) {
  const room = examRoomCopy(locale), cameraCopy = examCameraCopy(locale);
  const [focusQuestion, setFocusQuestion] = useState<string | null>(null);
  const [reviewMarks, setReviewMarks] = useState<string[]>([]);
  const t = examCopy(locale), extension = assessmentExtensionCopy(locale), recovery = examRecoveryCopy(locale);
  const [online, setOnline] = useState(true);
  const [draftDecision, setDraftDecision] = useState<DraftDecision>({ kind: "NONE" });
  const failures = useRef(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const changeCameraStream = useCallback((next: MediaStream | null) => {
    if (cameraStreamRef.current !== next) cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = next; setCameraStream(next);
  }, []);
  useEffect(() => () => { cameraStreamRef.current?.getTracks().forEach(track => track.stop()); }, []);
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
  // Elapsed time must not jump when the learner changes the device wall clock.
  const monotonicAnchor = useRef({ wall: Date.now(), elapsed: performance.now() });
  const clockNow = useCallback(() => monotonicAnchor.current.wall + performance.now() - monotonicAnchor.current.elapsed, []);
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
    setAttempt(value); attemptRef.current = value; setNow(clockNow());
    if (value) { offset.current = new Date(value.serverNow).getTime() - clockNow(); answersRef.current = value.responses; setAnswers(value.responses); }
    setDirty(false); latestDirty.current = false; pendingRef.current = null; setConflict(false); expiredRequested.current = false;
    // Unsent edits from before a refresh or crash are offered back, never applied silently.
    const storage = typeof window === "undefined" ? null : window.localStorage;
    const decision = value ? reconcileDraft(readDraft(storage, value.id), value) : { kind: "NONE" as const };
    setDraftDecision(decision);
    if (value && (decision.kind === "NONE" || value.status !== "IN_PROGRESS")) writeDraft(storage, null, value.id);
  }, [clockNow]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [infoResponse, attemptResponse] = await Promise.all([fetch(api, { cache: "no-store", signal: AbortSignal.timeout(15000) }), fetch(`${api}/attempt`, { cache: "no-store", signal: AbortSignal.timeout(15000) })]);
      const [info, saved] = await Promise.all([infoResponse.json(), attemptResponse.json()]);
      if (!infoResponse.ok || !attemptResponse.ok) throw new Error(typeof (info.error ?? saved.error) === "string" ? info.error ?? saved.error : t.failure);
      setExam(info.exam); syncAttempt(saved.attempt);
      offset.current = new Date(saved.attempt?.serverNow ?? info.exam.serverNow).getTime() - clockNow();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setLoading(false); }
  }, [api, syncAttempt, t.failure, clockNow]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const interval = window.setInterval(() => setNow(clockNow()), 1000); return () => window.clearInterval(interval); }, [clockNow]);
  useEffect(() => {
    const synchronize = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!response.ok) return;
        const payload = await response.json();
        const serverTime = new Date(payload.exam?.serverNow).getTime();
        if (Number.isFinite(serverTime)) { offset.current = serverTime - clockNow(); setNow(clockNow()); }
      } catch { /* Keep the monotonic estimate; saving still uses the server deadline. */ }
    };
    // Some platforms pause their monotonic clock during sleep. Re-anchor on return, without replacing answers.
    document.addEventListener("visibilitychange", synchronize);
    window.addEventListener("pageshow", synchronize);
    return () => { document.removeEventListener("visibilitychange", synchronize); window.removeEventListener("pageshow", synchronize); };
  }, [api, clockNow]);
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
        pendingRef.current = null; attemptRef.current = next; setAttempt(next); offset.current = new Date(next.serverNow).getTime() - clockNow();
        const remainsDirty = !same(answersRef.current, request.responses);
        setDirty(remainsDirty); latestDirty.current = remainsDirty; failures.current = 0;
        writeDraft(window.localStorage, remainsDirty ? { attemptId: next.id, baseSequence: next.sequence, responses: answersRef.current, savedAt: new Date().toISOString() } : null, next.id);
        if (next.status !== "IN_PROGRESS") { notifyCandidateExamSession(null); setLateAnswers(next.accepted === false && !same(answersRef.current, next.responses)); answersRef.current = next.responses; setAnswers(next.responses); setDirty(false); latestDirty.current = false; setConfirm(false); break; }
        if (!submit || request.submit) break;
      }
    } catch (cause) { setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : t.failure); }
    finally { savingRef.current = false; setBusy(false); }
  }, [api, conflict, t.failure, clockNow]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  // Transient failures retry automatically (sooner when the connection returns); conflicts never do.
  useEffect(() => {
    if (!error || conflict || !online || attempt?.status !== "IN_PROGRESS" || !latestDirty.current) return;
    const timeout = window.setTimeout(() => { failures.current += 1; setError(""); }, retryDelay(failures.current));
    return () => window.clearTimeout(timeout);
  }, [error, conflict, online, attempt?.status]);
  useEffect(() => { if (online && error && !conflict) { failures.current = 0; setError(""); } }, [online]);
  useEffect(() => {
    if (!dirty || conflict || busy || error || attempt?.status !== "IN_PROGRESS") return;
    const timeout = window.setTimeout(() => { void save(); }, 1200);
    return () => window.clearTimeout(timeout);
  }, [answers, dirty, conflict, busy, error, attempt?.status, save]);
  const remaining = attempt ? Math.max(0, Math.ceil((new Date(attempt.deadlineAt).getTime() - now - offset.current) / 1000)) : 0;
  const integrityClock = useCallback(() => clockNow() + offset.current, [clockNow]);
  const { report, monitoringAvailable } = useExamIntegrity({ id, policy: exam?.integrityPolicy, attemptId: attempt?.id, active: attempt?.status === "IN_PROGRESS" && remaining > 0, clockNow: integrityClock });
  useEffect(() => {
    if (attempt && (attempt.status !== "IN_PROGRESS" || remaining === 0)) changeCameraStream(null);
  }, [attempt, remaining, changeCameraStream]);
  useEffect(() => {
    if (attempt?.status === "IN_PROGRESS" && remaining === 0 && !busy && !expiredRequested.current) {
      expiredRequested.current = true; void save(true);
    }
  }, [attempt?.status, remaining, busy, save]);
  const update = (questionId: string, value: string) => {
    const next = { ...answersRef.current, [questionId]: value };
    answersRef.current = next; setAnswers(next); setDirty(true); latestDirty.current = true;
    if (attemptRef.current) writeDraft(window.localStorage, { attemptId: attemptRef.current.id, baseSequence: attemptRef.current.sequence, responses: next, savedAt: new Date().toISOString() }, attemptRef.current.id);
  };
  const start = async (version: number, camera?: CameraStartEvidence) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${api}/attempt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, ...camera }), signal: AbortSignal.timeout(15000) });
      const payload = await response.json();
      if (!response.ok) { if (response.status === 409) { await load(); } throw new Error(typeof payload.error === "string" ? payload.error : t.failure); }
      syncAttempt(payload.attempt);
      notifyCandidateExamSession(`/ai/exams/${encodeURIComponent(id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  if (loading) return <div aria-busy="true" aria-label={t.loading} className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  const finished = !!attempt && attempt.status !== "IN_PROGRESS";
  const answered = attempt?.paper.questions.filter((question) => answers[question.id]?.trim()).length ?? 0;
  const required = attempt?.paper.sections.reduce((total, section) => total + section.answerCount, 0) ?? 0;
  const completed = attempt?.paper.sections.reduce((total, section) => total + Math.min(section.answerCount, attempt.paper.questions.filter(question => question.sectionId === section.id && answers[question.id]?.trim()).length), 0) ?? 0;
  const focusIndex = attempt?.paper.questions.findIndex(question => question.id === focusQuestion) ?? -1;
  const goTo = (questionId: string) => {
    if (focusQuestion) setFocusQuestion(questionId);
    window.requestAnimationFrame(() => document.getElementById(`exam-question-${questionId}`)?.focus());
  };
  const toggleReview = (questionId: string) => setReviewMarks(previous => previous.includes(questionId) ? previous.filter(id => id !== questionId) : [...previous, questionId]);
  return <section dir={locale === "en" ? "ltr" : "rtl"} className={`mx-auto max-w-5xl space-y-5 ${exam?.assistance?.largeText ? "text-xl" : ""}`}>
    <header className="sk-panel relative overflow-hidden space-y-3 p-5 sm:p-7"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary"><ShieldCheck size={16} aria-hidden="true" />{room.room}</p><h1 className="text-2xl font-bold">{exam?.title ?? t.title}</h1><p className="text-sm text-ink-subtle">{t.browserNotice}</p>{exam && (exam.assistance?.reader || exam.assistance?.scribe || exam.breakMinutes) ? <p className="text-sm">{extension.accessibility}: {[exam.assistance?.reader ? extension.reader : "", exam.assistance?.scribe ? extension.scribe : "", exam.breakMinutes ? `${extension.breakMinutes}: ${exam.breakMinutes}` : ""].filter(Boolean).join(" · ")}</p> : null}{exam && <p className="text-sm">{t.duration}: {exam.durationMinutes} {t.minutes} · {t.marks}: {exam.totalMarks}</p>}</header>
    {error && <div role="alert" className="sk-panel space-y-3 p-4 text-status-error-text"><p>{error}</p>{conflict ? <Button variant="outline" onClick={() => setReloadConfirm(true)}>{t.reload}</Button> : <Button variant="outline" disabled={busy} onClick={() => attempt ? save(remaining === 0) : load()}><RefreshCw />{t.retry}</Button>}</div>}
    {!attempt && exam && <div className="sk-panel space-y-4 p-6"><p>{t.startHint}</p><p className="text-sm text-ink-subtle">{t.starts}: {new Date(exam.startsAt).toLocaleString(locale)} · {t.ends}: {new Date(exam.endsAt).toLocaleString(locale)}</p></div>}
    {exam?.secureBrowser && <SecureBrowserGate id={id} state={exam.secureBrowser} locale={locale} />}
    {!attempt && exam && (!exam.secureBrowser?.required || exam.secureBrowser.admitted) && <ExamPreflight key={`${id}:${exam.version}`} id={id} exam={exam} locale={locale} busy={busy} serverNow={now + offset.current} onChecked={(value) => { setExam(value); offset.current = new Date(value.serverNow).getTime() - clockNow(); }} onStart={start} cameraStream={cameraStream} onCameraStream={changeCameraStream} />}
    {finished && <div role="status" className="sk-panel space-y-2 p-6"><CheckCircle2 aria-hidden="true" className="size-7 text-status-success-text" /><h2 className="text-xl font-bold">{t.receipt}</h2><p>{t.receiptHint}</p>{lateAnswers && <p role="alert" className="text-status-error-text">{t.lateAnswers}</p>}<p className="break-all text-sm text-ink-subtle">{t.receiptId}: {attempt.id}</p>{attempt.submittedAt && <p className="text-sm">{new Date(attempt.submittedAt).toLocaleString(locale)}</p>}</div>}
    {finished && <ExamResults id={id} locale={locale} student />}
    {finished && <Link href="/student" className={buttonVariants({ variant: "outline" })}>{t.studentHome}</Link>}
    {attempt && <ExamIntegrityNotice policy={exam?.integrityPolicy} locale={locale} />}
    {attempt && <ExamProctorCapture id={id} attemptId={attempt.id} active={!finished && remaining > 0} deadlineAt={new Date(new Date(attempt.deadlineAt).getTime() - offset.current).toISOString()} locale={locale} clockNow={clockNow} initialCameraStream={cameraStream} cameraRequired={exam?.cameraRequired} onIntegrityEvent={report} />}
    {attempt && !finished && !monitoringAvailable && <p role="status" className="sk-panel p-4 text-sm text-ink-subtle">{cameraCopy.monitoringUnavailable}</p>}
    {attempt && !finished && !online && <p role="alert" className="sk-panel border-status-warning-border bg-status-warning-surface p-4 text-sm text-status-warning-text">{recovery.offline}</p>}
    {attempt && !finished && draftDecision.kind !== "NONE" && <section role="alertdialog" aria-labelledby="exam-draft-title" className="sk-panel space-y-3 border-status-warning-border p-5">
      <h2 id="exam-draft-title" className="font-bold">{recovery.restoreTitle}</h2>
      <p className="text-sm">{draftDecision.kind === "RESTORABLE" ? recovery.restoreHint : recovery.outdatedHint}</p>
      <p className="text-sm">{recovery.questions}: {draftDecision.changed.map(questionId => attempt.paper.questions.findIndex(item => item.id === questionId) + 1).filter(Boolean).join(", ")}</p>
      <div className="flex flex-wrap gap-2">
        {draftDecision.kind === "RESTORABLE" && <Button onClick={() => { const draft = readDraft(window.localStorage, attempt.id); if (draft) { answersRef.current = { ...attempt.responses, ...draft.responses }; setAnswers(answersRef.current); setDirty(true); latestDirty.current = true; } setDraftDecision({ kind: "NONE" }); }}>{recovery.restore}</Button>}
        <Button variant="outline" onClick={() => { writeDraft(window.localStorage, null, attempt.id); setDraftDecision({ kind: "NONE" }); }}>{draftDecision.kind === "RESTORABLE" ? recovery.discard : recovery.dismiss}</Button>
      </div>
    </section>}
    {attempt && !finished && <>
      <div className="sk-panel sticky top-3 z-10 flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-2" role="timer" aria-label={t.time}><Clock3 aria-hidden="true" /><span className="font-mono text-lg font-bold" dir="ltr">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span></div><p role="status" className="text-sm">{busy ? t.saving : dirty ? t.unsaved : t.saved}</p><p className="text-sm">{t.answered}: {answered} / {attempt.paper.questions.length}</p><Button variant="outline" disabled={busy || conflict} onClick={() => save(remaining === 0)}><Save />{room.saveNow}</Button></div>
      {remaining === 0 && <p role="alert" className="sk-panel p-4">{t.expired}</p>}<p className="text-sm text-ink-subtle">{t.savingHint}</p><p className="whitespace-pre-wrap">{attempt.paper.instructions}</p>
      {!!attempt.paper.resources?.length && <section className="sk-panel space-y-3 p-5"><h2 className="font-bold">{extension.resources}</h2>{attempt.paper.resources.map(resource => <details key={resource.id} className="rounded-xl border border-border p-3"><summary className="cursor-pointer font-semibold">{resource.title}</summary><p className="mt-3 whitespace-pre-wrap">{resource.content}</p></details>)}</section>}
      <section className="sk-panel space-y-5 p-5" aria-label={room.map}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{room.map}</h2><p className="mt-1 text-sm text-ink-subtle">{room.progress}: {completed} / {required}</p></div><Button variant="outline" aria-pressed={!!focusQuestion} onClick={() => setFocusQuestion(focusQuestion ? null : attempt.paper.questions[0]?.id ?? null)}><ListChecks aria-hidden="true" size={16} />{focusQuestion ? room.all : room.focus}</Button></div>
        <progress aria-label={room.progress} value={completed} max={Math.max(1, required)} className="h-2 w-full accent-primary" />
        <nav aria-label={t.viewQuestion} className="flex flex-wrap gap-2">{attempt.paper.questions.map((question, index) => <Button key={question.id} size="icon" variant={focusQuestion === question.id ? "default" : answers[question.id]?.trim() ? "secondary" : "outline"} className="relative" aria-current={focusQuestion === question.id ? "step" : undefined} aria-label={`${t.question} ${index + 1}: ${answers[question.id]?.trim() ? t.answered : t.unanswered}${reviewMarks.includes(question.id) ? ` · ${room.flagged}` : ""}`} onClick={() => goTo(question.id)}>{index + 1}{reviewMarks.includes(question.id) && <Flag aria-hidden="true" className="absolute end-0 top-0 size-3" />}</Button>)}</nav>
        <p className="text-xs text-ink-subtle">{room.focusHint}</p>
        {reviewMarks.length > 0 && <Button variant="ghost" onClick={() => { setFocusQuestion(reviewMarks[0]); window.requestAnimationFrame(() => document.getElementById(`exam-question-${reviewMarks[0]}`)?.focus()); }}><Flag aria-hidden="true" size={16} />{room.review} · {reviewMarks.length}</Button>}
      </section>
      <fieldset disabled={remaining === 0 || conflict} className="space-y-6">{attempt.paper.sections.map((section) => {
        const questions = attempt.paper.questions.filter((question) => question.sectionId === section.id);
        const count = questions.filter((question) => answers[question.id]?.trim()).length;
        if (focusQuestion && !questions.some(question => question.id === focusQuestion)) return null;
        return <section key={section.id} className="space-y-4"><h2 className="text-lg font-bold">{section.title}</h2><p className="text-sm text-ink-subtle">{t.required}: {section.answerCount} / {section.questionCount} · {t.answered}: {count}</p>{questions.filter(question => !focusQuestion || question.id === focusQuestion).map((question) => {
          const full = count >= section.answerCount && !answers[question.id]?.trim();
          return <div key={question.id} id={`exam-question-${question.id}`} tabIndex={-1} className="sk-panel scroll-mt-32 space-y-4 p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-widest text-primary">{t.question} {attempt.paper.questions.findIndex(item => item.id === question.id) + 1}</p><Button type="button" size="sm" variant="ghost" aria-pressed={reviewMarks.includes(question.id)} onClick={() => toggleReview(question.id)}><Flag aria-hidden="true" size={16} />{reviewMarks.includes(question.id) ? room.unflag : room.flag}</Button></div><h3 className="whitespace-pre-wrap text-lg font-semibold leading-relaxed"><bdi dir="auto">{question.prompt}</bdi></h3>{full && <p role="status" className="rounded-xl border border-status-warning-border bg-status-warning-surface p-3 text-sm text-status-warning-text">{room.sectionLimit}</p>}<CandidateFigures figures={question.figures}/><p className="flex flex-wrap items-center gap-3 text-sm text-ink-subtle"><span>{t.marks}: {question.marks}</span>{(() => { const status = answerStatus(answers[question.id], attempt.responses[question.id], { saving: busy, failed: !!error || !online }); return <span data-answer-status={status} className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${status === "CONFIRMED" ? "border-status-success-border text-status-success-text" : status === "FAILED" ? "border-status-error-border text-status-error-text" : ""}`}>{recovery[status]}</span>; })()}</p>{question.type === "SINGLE_CHOICE" ? <fieldset id={`exam-answer-${question.id}`} tabIndex={-1} className="space-y-2" disabled={full}><legend className="sr-only">{t.choice}: {question.prompt}</legend>{question.options.map((option) => <Button key={option.id} variant="choice" className="h-auto min-h-12 w-full justify-start whitespace-normal text-start" aria-pressed={answers[question.id] === option.id} onClick={() => update(question.id, option.id)}><bdi dir="auto">{option.text}</bdi></Button>)}</fieldset> : ["MULTIPLE_CHOICE", "NUMERIC", "MATH", "CODE"].includes(question.type) ? <AdvancedAnswer question={question} locale={locale} value={answers[question.id] ?? ""} disabled={full} onChange={value => update(question.id, value)} /> : <FormField name={`exam-answer-${question.id}`} id={`exam-answer-${question.id}`} label={t.answer}><Textarea rows={question.type === "EXTENDED_TEXT" ? 8 : 4} maxLength={20000} disabled={full} value={answers[question.id] ?? ""} onChange={(event) => update(question.id, event.target.value)} /></FormField>}<Button variant="ghost" disabled={!answers[question.id]} onClick={() => update(question.id, "")}>{t.clear}</Button></div>;
        })}</section>;
      })}</fieldset>
      {focusQuestion && <div className="flex flex-wrap justify-between gap-3"><Button variant="outline" disabled={focusIndex <= 0} onClick={() => goTo(attempt.paper.questions[focusIndex - 1].id)}><ArrowLeft className="rtl:rotate-180" aria-hidden="true" />{room.previous}</Button><Button variant="outline" disabled={focusIndex >= attempt.paper.questions.length - 1} onClick={() => goTo(attempt.paper.questions[focusIndex + 1].id)}>{room.next}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button></div>}
      <div className="sk-panel space-y-3 p-5"><h2 className="font-bold">{room.finalReview}</h2><div className="flex flex-wrap gap-4 text-sm"><p>{room.remaining}: {Math.max(0, required - completed)}</p><p>{room.marked}: {reviewMarks.length}</p></div><p className="text-xs text-ink-subtle">{room.flagsHint}</p><p className="text-sm">{t.submitHint}</p><Button disabled={busy || conflict} onClick={() => setConfirm(true)}>{t.submit}</Button></div>
    </>}
    {confirm && <ModalSurface ariaLabel={t.submit} onClose={() => setConfirm(false)} dismissible={!busy}><div className="space-y-4 p-5"><h2 className="text-lg font-bold">{room.finalReview}</h2><p>{t.confirm}</p><p>{room.remaining}: {Math.max(0, required - completed)}</p><p>{room.marked}: {reviewMarks.length}</p><p className="text-sm text-ink-subtle">{room.savedOnly}</p><p>{t.answered}: {answered} / {attempt?.paper.questions.length}</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>{t.cancel}</Button><Button disabled={busy} onClick={() => save(true)}>{t.submit}</Button></div></div></ModalSurface>}
    {reloadConfirm && <ModalSurface ariaLabel={t.reload} onClose={() => setReloadConfirm(false)}><div className="space-y-4 p-5"><p>{t.reloadWarning}</p><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setReloadConfirm(false)}>{t.cancel}</Button><Button onClick={() => { setReloadConfirm(false); void load(); }}>{t.reload}</Button></div></div></ModalSurface>}
  </section>;
}
