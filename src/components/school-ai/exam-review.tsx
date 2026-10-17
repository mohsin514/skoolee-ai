"use client";

import { CandidateFigures } from "./candidate-figures";
import { examReleaseCopy } from "./exam-release-copy";
import { candidateFigure } from "@/lib/school-ai/paper-figures";
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
import { WrittenMarking } from "./written-marking";
import { ExamScripts } from "./exam-scripts";
import { ExamKeyCorrection } from "./exam-key-correction";
import { ExamResults } from "./exam-results";
import { assessmentExtensionCopy } from "./assessment-extension-copy";
import { displayExamResponse } from "@/lib/school-ai/exam";
import { ExamGradebook } from "./exam-gradebook";
import { ExamProctorConsole } from "./exam-proctor-console";
import { ExamIntegrityDesk } from "./exam-integrity-desk";

type Attempt = { id: string; reviewVersion: number; status: string; submittedAt: string | null; responses: ExamResponses; scoreProposal: ScoreProposal | null; review: (ExamReview & { total: number }) | null; student: { fullName: string; rollNo: string } | null };
export function ExamReviewDesk({ id, locale }: { id: string; locale: AssessmentLocale }) {
  const t = examCopy(locale), extension = assessmentExtensionCopy(locale);
  const [keyCorrections, setKeyCorrections] = useState<ExamReview["keyCorrections"]>();
  const [revising, setRevising] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [paper, setPaper] = useState<PaperData | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [evidence, setEvidence] = useState<Record<string, ExamReview["marks"][number]["evidence"]>>({});
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected = attempts.find((attempt) => attempt.id === selectedId);
  const select = (attempt: Attempt) => {
    setKeyCorrections(attempt.review?.keyCorrections); setEvidence(Object.fromEntries(attempt.review?.marks.map(mark => [mark.questionId, mark.evidence]) ?? [])); setRevising(false); setRevisionReason(""); setSelectedId(attempt.id); setMarks(Object.fromEntries(attempt.scoreProposal?.questions.map((question) => [question.questionId, question.marks === null ? "" : String(question.marks)]) ?? [])); setFeedback({}); setNote(attempt.review?.note ?? ""); setMessage("");
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
      const review: ExamReview = { note, ...(keyCorrections ? { keyCorrections } : {}), marks: paper.questions.filter((question) => selected.responses[question.id]?.trim()).map((question) => ({ questionId: question.id, marks: Number(marks[question.id]), feedback: feedback[question.id] ?? "", ...(evidence[question.id] ? { evidence: evidence[question.id] } : {}) })) };
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}/${revising ? "results" : "attempts"}`, { method: revising ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(revising ? { action: "revise", data: { attemptId: selected.id, version: selected.reviewVersion, reason: revisionReason, review } } : { attemptId: selected.id, review }) }); const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      await load(); setMessage(t.reviewedHint);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  return <section dir={locale === "en" ? "ltr" : "rtl"} className="mx-auto max-w-5xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{t.review}</h1><Button variant="outline" disabled={busy || loading} onClick={load}>{t.refresh}</Button></div><p className="text-sm text-ink-subtle">{t.reviewedHint}</p><ExamAccommodations id={id} locale={locale} /><ReleaseResults id={id} locale={locale} />{error && <p role="alert" className="sk-panel p-4 text-status-error-text">{error}</p>}{message && <p role="status" className="sk-panel p-4">{message}</p>}{loading ? <Skeleton className="h-64 w-full" /> : <><FormField name="mark-attempt" label={t.students}><Select value={selectedId} disabled={busy} onChange={(event) => { const attempt = attempts.find((item) => item.id === event.target.value); if (attempt) select(attempt); }}><option value="">{t.choose}</option>{attempts.map((attempt) => <option key={attempt.id} value={attempt.id}>{attempt.student?.fullName ?? attempt.id} · {attempt.student?.rollNo} · {attempt.status === "REVIEWED" ? t.reviewedState : attempt.status === "SUBMITTED" ? t.needsReview : t.inProgress}</option>)}</Select></FormField>{!attempts.length && <p className="sk-panel p-6 text-center text-ink-subtle">{t.noAttempts}</p>}{selected && paper && <form onSubmit={save} className="space-y-5"><div className="sk-panel space-y-2 p-5"><h2 className="text-xl font-bold">{selected.student?.fullName}</h2><p>{paper.blueprint.title}</p><p>{t.proposed}: {selected.scoreProposal?.totalObjectiveMarks ?? 0} / {paper.blueprint.totalMarks}</p><p className="text-sm text-ink-subtle">{t.unreviewed}</p>{selected.review && <p>{t.total}: {selected.review.total}</p>}</div><fieldset disabled={busy || (selected.status !== "SUBMITTED" && !revising)} className="space-y-5">{paper.questions.map((question, index) => {
    const response = selected.responses[question.id];
    return <div key={question.id} className="sk-panel space-y-4 p-5"><h3 className="whitespace-pre-wrap font-bold">{t.question} {index + 1}: {question.prompt}</h3><CandidateFigures figures={question.figures?.map(candidateFigure)}/><div><p className="text-sm font-semibold">{t.original}</p><p className="mt-1 whitespace-pre-wrap">{response ? displayExamResponse(question, response) : t.noAnswer}</p></div><details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-semibold">{t.model}</summary><p className="mt-3 whitespace-pre-wrap">{question.modelAnswer}</p><ul className="mt-2 list-disc ps-5 text-sm">{question.rubric.map((criterion) => <li key={criterion.id}>{criterion.criterion}: {criterion.marks}</li>)}</ul></details>{response?.trim() && <>{!["SINGLE_CHOICE", "MULTIPLE_CHOICE", "NUMERIC"].includes(question.type) && <WrittenMarking key={`${selected.id}:${question.id}:${selected.reviewVersion}`} assignmentId={id} attemptId={selected.id} version={selected.reviewVersion ?? 0} paper={paper} question={question} response={response} locale={locale} onApply={proposal => { setMarks(previous => ({ ...previous, [question.id]: String(proposal.marks) })); setFeedback(previous => ({ ...previous, [question.id]: proposal.feedback })); setEvidence(previous => ({ ...previous, [question.id]: proposal.evidence })); }} />}<FormField name={`review-mark-${question.id}`} label={`${t.marks} · ${t.maximum}: ${question.marks}`}><Input type="number" required min={0} max={question.marks} step={0.25} value={marks[question.id] ?? ""} onChange={(event) => { setMarks((previous) => ({ ...previous, [question.id]: event.target.value })); setEvidence(previous => ({ ...previous, [question.id]: undefined })); }} /></FormField><FormField name={`review-feedback-${question.id}`} label={t.feedback}><Textarea required maxLength={4000} value={feedback[question.id] ?? ""} onChange={(event) => setFeedback((previous) => ({ ...previous, [question.id]: event.target.value }))} /></FormField></>}</div>;
  })}<FormField name="review-note" label={t.note}><Textarea required maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} /></FormField>{revising && <FormField name="result-revision-reason" label={extension.reason}><Textarea required maxLength={4000} value={revisionReason} onChange={event => setRevisionReason(event.target.value)} /></FormField>}<Button type="submit">{revising ? extension.saveRevision : t.finalize}</Button></fieldset>{selected.status === "REVIEWED" && <div className="space-y-3"><p className="text-sm text-ink-subtle">{extension.reviewNote}</p>{!revising && <Button type="button" variant="outline" onClick={() => setRevising(true)}>{extension.regrade}</Button>}<ExamKeyCorrection key={`${selected.id}:${selected.reviewVersion}`} id={id} attemptId={selected.id} version={selected.reviewVersion} paper={paper} locale={locale} onApply={review => { setKeyCorrections(review.keyCorrections); setMarks(Object.fromEntries(review.marks.map(row => [row.questionId, String(row.marks)]))); setFeedback(Object.fromEntries(review.marks.map(row => [row.questionId,row.feedback]))); setEvidence(Object.fromEntries(review.marks.map(row => [row.questionId,row.evidence]))); setRevising(true); }} /><ExamResults key={`${selected.id}:${selected.reviewVersion}`} id={id} attemptId={selected.id} locale={locale} refreshKey={String(selected.reviewVersion)} /></div>}</form>}</>}
    <ExamProctorConsole id={id} locale={locale} />
    <ExamIntegrityDesk id={id} locale={locale} />
    {!loading && paper && <ExamScripts id={id} paper={paper} locale={locale} onImported={async () => { await load(); setMessage(extension.scriptSaved); }} />}
    {!loading && <ExamGradebook id={id} locale={locale} refreshKey={attempts.map(attempt => `${attempt.id}:${attempt.status}:${attempt.reviewVersion}`).join("|")} />}
  </section>;
}

/** SKO-408: moderated results reach learners only after this explicit release. */
function ReleaseResults({ id, locale }: { id: string; locale: AssessmentLocale }) {
  const r = examReleaseCopy(locale);
  const [state, setState] = useState<{ released: boolean; error: string; busy: boolean }>({ released: false, error: "", busy: false });
  const release = async () => {
    setState(previous => ({ ...previous, busy: true, error: "" }));
    try {
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}/results-release`, { method: "POST" }); const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : r.failed);
      setState({ released: true, error: "", busy: false });
    } catch (cause) { setState({ released: false, error: cause instanceof Error ? cause.message : r.failed, busy: false }); }
  };
  return <section aria-label={r.releaseResults} className="sk-panel space-y-2 p-5"><p className="text-sm text-ink-subtle">{r.releaseHint}</p>
    {state.released ? <p role="status" className="font-semibold">{r.released}</p> : <Button variant="outline" disabled={state.busy} onClick={() => void release()}>{r.releaseResults}</Button>}
    {state.error && <p role="alert" className="text-sm text-status-error-text">{state.error}</p>}</section>;
}
