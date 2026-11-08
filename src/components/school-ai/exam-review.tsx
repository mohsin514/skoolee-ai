"use client";

import { CandidateFigures } from "./candidate-figures";
import { examReleaseCopy } from "./exam-release-copy";
import { candidateFigure } from "@/lib/school-ai/paper-figures";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssessmentLocale, PaperData } from "@/lib/school-ai/assessment";
import type { ExamResponses, ExamReview, ExamReviewCapabilities, ScoreProposal } from "@/lib/school-ai/exam";
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
import { studioResultsCopy } from "@/lib/school-ai/exam-studio-copy-results";

type Attempt = { id: string; reviewVersion: number; status: string; submittedAt: string | null; responses: ExamResponses; scoreProposal: ScoreProposal | null; review: (ExamReview & { total: number }) | null; student: { fullName: string; rollNo: string } | null };
export function ExamReviewDesk({ id, locale }: { id: string; locale: AssessmentLocale }) {
  const t = examCopy(locale), extension = assessmentExtensionCopy(locale), results = studioResultsCopy(locale);
  const [keyCorrections, setKeyCorrections] = useState<ExamReview["keyCorrections"]>();
  const [revising, setRevising] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [paper, setPaper] = useState<PaperData | null>(null);
  const [capabilities, setCapabilities] = useState<ExamReviewCapabilities | null>(null);
  const [resultsReleased, setResultsReleased] = useState(false);
  const requests = useRef(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [evidence, setEvidence] = useState<Record<string, ExamReview["marks"][number]["evidence"]>>({});
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected = attempts.find((attempt) => attempt.id === selectedId);
  const select = (attempt: Attempt) => {
    setKeyCorrections(attempt.review?.keyCorrections); setEvidence(Object.fromEntries(attempt.review?.marks.map(mark => [mark.questionId, mark.evidence]) ?? [])); setRevising(false); setRevisionReason(""); setSelectedId(attempt.id); setMarks(Object.fromEntries(attempt.scoreProposal?.questions.map((question) => [question.questionId, question.marks === null ? "" : String(question.marks)]) ?? [])); setFeedback({}); setOverrides(Object.fromEntries(attempt.review?.marks.flatMap(mark => mark.override ? [[mark.questionId, mark.override.reason]] : []) ?? [])); setNote(attempt.review?.note ?? ""); setMessage("");
    if (attempt.review) { setMarks(Object.fromEntries(attempt.review.marks.map((mark) => [mark.questionId, String(mark.marks)]))); setFeedback(Object.fromEntries(attempt.review.marks.map((mark) => [mark.questionId, mark.feedback]))); }
  };
  const load = useCallback(async () => {
    const request = ++requests.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}/attempts`, { cache: "no-store" }); const payload = await response.json();
      if (request !== requests.current) return;
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      setPaper(payload.paper); setAttempts(payload.attempts); setCapabilities(payload.capabilities ?? null); setResultsReleased(Boolean(payload.resultsReleasedAt)); setSelectedId("");
    } catch (cause) { if (request === requests.current) { setPaper(null); setAttempts([]); setCapabilities(null); setSelectedId(""); setError(cause instanceof Error ? cause.message : t.failure); } }
    finally { if (request === requests.current) setLoading(false); }
  }, [id, t.failure]);
  useEffect(() => { void load(); return () => { requests.current++; }; }, [load]);
  // SKAI-1014: an auto-scored objective mark changed by hand needs a recorded reason.
  const autoMark = (questionId: string) => { const row = selected?.scoreProposal?.questions.find(item => item.questionId === questionId); return row?.state === "OBJECTIVE" ? row.marks ?? 0 : null; };
  const departsFromAuto = (questionId: string) => { const auto = autoMark(questionId); return auto !== null && !keyCorrections?.length && marks[questionId] !== undefined && marks[questionId] !== "" && Math.abs(Number(marks[questionId]) - auto) > 0.00001; };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || !paper || !(revising ? capabilities?.canRevise : capabilities?.canMark)) return;
    setBusy(true); setError("");
    try {
      const review: ExamReview = { note, ...(keyCorrections ? { keyCorrections } : {}), marks: paper.questions.filter((question) => selected.responses[question.id]?.trim()).map((question) => ({ questionId: question.id, marks: Number(marks[question.id]), feedback: feedback[question.id] ?? "", ...(evidence[question.id] ? { evidence: evidence[question.id] } : {}), ...(departsFromAuto(question.id) && overrides[question.id]?.trim() ? { override: { reason: overrides[question.id].trim() } } : {}) })) };
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}/${revising ? "results" : "attempts"}`, { method: revising ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(revising ? { action: "revise", data: { attemptId: selected.id, version: selected.reviewVersion, reason: revisionReason, review } } : { attemptId: selected.id, review }) }); const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      await load(); setMessage(payload.result?.pendingCorrection ? results.correctionPending : t.reviewedHint);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  return <section dir={locale === "en" ? "ltr" : "rtl"} className="mx-auto max-w-5xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{t.review}</h1><Button variant="outline" disabled={busy || loading} onClick={load}>{t.refresh}</Button></div><p className="text-sm text-ink-subtle">{t.reviewedHint}</p>{!loading && capabilities?.canApproveAccommodation && <ExamAccommodations id={id} locale={locale} />}{!loading && capabilities?.canRelease && <ReleaseResults key={`${id}:${resultsReleased}`} id={id} locale={locale} released={resultsReleased} />}{error && <p role="alert" className="sk-panel p-4 text-status-error-text">{error}</p>}{message && <p role="status" className="sk-panel p-4">{message}</p>}{loading ? <Skeleton className="h-64 w-full" /> : <><FormField name="mark-attempt" label={t.students}><Select value={selectedId} disabled={busy} onChange={(event) => { const attempt = attempts.find((item) => item.id === event.target.value); if (attempt) select(attempt); }}><option value="">{t.choose}</option>{attempts.map((attempt) => <option key={attempt.id} value={attempt.id}>{attempt.student?.fullName ?? attempt.id} · {attempt.student?.rollNo} · {attempt.status === "REVIEWED" ? t.reviewedState : attempt.status === "SUBMITTED" ? t.needsReview : t.inProgress}</option>)}</Select></FormField>{!attempts.length && <p className="sk-panel p-6 text-center text-ink-subtle">{t.noAttempts}</p>}{selected && paper && <form onSubmit={save} className="space-y-5"><div className="sk-panel space-y-2 p-5"><h2 className="text-xl font-bold">{selected.student?.fullName}</h2><p>{paper.blueprint.title}</p><p>{t.proposed}: {selected.scoreProposal?.totalObjectiveMarks ?? 0} / {paper.blueprint.totalMarks}</p><p className="text-sm text-ink-subtle">{t.unreviewed}</p>{selected.review && <p>{t.total}: {selected.review.total}</p>}</div><fieldset disabled={busy || !(revising ? capabilities?.canRevise : capabilities?.canMark) || (selected.status !== "SUBMITTED" && !revising)} className="space-y-5">{paper.questions.map((question, index) => {
    const response = selected.responses[question.id];
    return <div key={question.id} className="sk-panel space-y-4 p-5"><h3 className="whitespace-pre-wrap font-bold">{t.question} {index + 1}: {question.prompt}</h3><CandidateFigures figures={question.figures?.map(candidateFigure)}/><div><p className="text-sm font-semibold">{t.original}</p><p className="mt-1 whitespace-pre-wrap">{response ? displayExamResponse(question, response) : t.noAnswer}</p></div><details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-semibold">{t.model}</summary><p className="mt-3 whitespace-pre-wrap">{question.modelAnswer}</p><ul className="mt-2 list-disc ps-5 text-sm">{question.rubric.map((criterion) => <li key={criterion.id}>{criterion.criterion}: {criterion.marks}</li>)}</ul></details>{response?.trim() && <>{!["SINGLE_CHOICE", "MULTIPLE_CHOICE", "NUMERIC"].includes(question.type) && <WrittenMarking key={`${selected.id}:${question.id}:${selected.reviewVersion}`} assignmentId={id} attemptId={selected.id} version={selected.reviewVersion ?? 0} paper={paper} question={question} response={response} locale={locale} onApply={proposal => { setMarks(previous => ({ ...previous, [question.id]: String(proposal.marks) })); setFeedback(previous => ({ ...previous, [question.id]: proposal.feedback })); setEvidence(previous => ({ ...previous, [question.id]: proposal.evidence })); }} />}<FormField name={`review-mark-${question.id}`} label={`${t.marks} · ${t.maximum}: ${question.marks}`}><Input type="number" required min={0} max={question.marks} step={0.25} value={marks[question.id] ?? ""} onChange={(event) => { setMarks((previous) => ({ ...previous, [question.id]: event.target.value })); setEvidence(previous => ({ ...previous, [question.id]: undefined })); }} /></FormField>{autoMark(question.id) !== null && <p className="text-xs text-ink-subtle" data-objective-auto={question.id}>{t.objectiveAuto.replace("{0}", String(autoMark(question.id)))}</p>}{departsFromAuto(question.id) && <FormField name={`review-override-${question.id}`} label={t.overrideReason}><Textarea required minLength={3} maxLength={1000} value={overrides[question.id] ?? ""} onChange={(event) => setOverrides((previous) => ({ ...previous, [question.id]: event.target.value }))} data-objective-override={question.id} /></FormField>}<FormField name={`review-feedback-${question.id}`} label={t.feedback}><Textarea required maxLength={4000} value={feedback[question.id] ?? ""} onChange={(event) => setFeedback((previous) => ({ ...previous, [question.id]: event.target.value }))} /></FormField></>}</div>;
  })}<FormField name="review-note" label={t.note}><Textarea required maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} /></FormField>{revising && <FormField name="result-revision-reason" label={extension.reason}><Textarea required maxLength={4000} value={revisionReason} onChange={event => setRevisionReason(event.target.value)} /></FormField>}<Button type="submit">{revising ? extension.saveRevision : t.finalize}</Button></fieldset>{selected.status === "REVIEWED" && <div className="space-y-3"><p className="text-sm text-ink-subtle">{extension.reviewNote}</p>{!revising && capabilities?.canRevise && <Button type="button" variant="outline" onClick={() => setRevising(true)}>{extension.regrade}</Button>}{capabilities?.canManage && <ExamKeyCorrection key={`${selected.id}:${selected.reviewVersion}`} id={id} attemptId={selected.id} version={selected.reviewVersion} paper={paper} locale={locale} onApply={review => { setKeyCorrections(review.keyCorrections); setMarks(Object.fromEntries(review.marks.map(row => [row.questionId, String(row.marks)]))); setFeedback(Object.fromEntries(review.marks.map(row => [row.questionId,row.feedback]))); setEvidence(Object.fromEntries(review.marks.map(row => [row.questionId,row.evidence]))); setRevising(true); }} />}<ExamResults key={`${selected.id}:${selected.reviewVersion}`} id={id} attemptId={selected.id} locale={locale} refreshKey={String(selected.reviewVersion)} /></div>}</form>}</>}
    {!loading && capabilities && <ExamProctorConsole id={id} locale={locale} canManage={capabilities.canManage} />}
    {!loading && capabilities && <ExamIntegrityDesk id={id} locale={locale} showPolicy={capabilities.canApproveAccommodation} />}
    {!loading && paper && capabilities?.canManage && <ExamScripts id={id} paper={paper} locale={locale} onImported={async () => { await load(); setMessage(extension.scriptSaved); }} />}
    {!loading && capabilities?.canSendGradebook && <ExamGradebook id={id} locale={locale} refreshKey={attempts.map(attempt => `${attempt.id}:${attempt.status}:${attempt.reviewVersion}`).join("|")} />}
  </section>;
}

/** SKO-408: moderated results reach learners only after this explicit release. */
function ReleaseResults({ id, locale, released }: { id: string; locale: AssessmentLocale; released: boolean }) {
  const r = examReleaseCopy(locale);
  const [state, setState] = useState<{ released: boolean; error: string; busy: boolean }>({ released, error: "", busy: false });
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
