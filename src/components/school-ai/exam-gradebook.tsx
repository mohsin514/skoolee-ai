"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import type { GradebookConversion, GradebookOptions, GradebookPreview, GradebookPublication } from "@/lib/school-ai/exam-gradebook";
import { examGradebookCopy } from "./exam-gradebook-copy";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioResultsCopy } from "@/lib/school-ai/exam-studio-copy-results";

export function ExamGradebook({ id, locale, refreshKey }: { id: string; locale: AssessmentLocale; refreshKey: string }) {
  const d = studioResultsCopy(locale);
  const t = examGradebookCopy(locale), url = `/api/school-ai/exams/${encodeURIComponent(id)}/gradebook`;
  const [options, setOptions] = useState<GradebookOptions | null>(null), [preview, setPreview] = useState<GradebookPreview | null>(null), [publication, setPublication] = useState<GradebookPublication | null>(null);
  const [examId, setExamId] = useState(""), [conversion, setConversion] = useState<GradebookConversion>("EXACT"), [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [allowed, setAllowed] = useState(true), [error, setError] = useState("");
  const requestKey = useRef<string | null>(null), mounted = useRef(true), inFlight = useRef(false);
  useUnsavedGuard(busy);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const read = useCallback(async <T,>(response: Response): Promise<T> => {
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.code === "string" && body.code in t ? t[body.code as keyof typeof t] : t.failure);
    return body as T;
  }, [t]);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(""); setPreview(null); setChecked(false);
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      if (response.status === 403) { if (!signal?.aborted && mounted.current) setAllowed(false); return; }
      const body = await read<{ options: GradebookOptions }>(response);
      if (signal?.aborted || !mounted.current) return;
      setAllowed(true); setOptions(body.options); setPublication(body.options.publication);
    } catch (cause) { if (!signal?.aborted && mounted.current) setError(cause instanceof Error ? cause.message : t.failure); }
    finally { if (!signal?.aborted && mounted.current) setLoading(false); }
  }, [url, read, t.failure]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, refreshKey]);
  const review = async () => {
    if (inFlight.current || !examId) return;
    inFlight.current = true; setBusy(true); setError(""); setPreview(null); setChecked(false);
    try {
      const response = await fetch(`${url}?examId=${encodeURIComponent(examId)}&conversion=${conversion}`, { cache: "no-store" });
      const body = await read<{ preview: GradebookPreview }>(response);
      if (mounted.current) { setPreview(body.preview); requestKey.current = crypto.randomUUID(); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : t.failure); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const send = async () => {
    if (inFlight.current || !preview || !checked || preview.blockers.length || !requestKey.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId: preview.exam.id, conversion: preview.conversion, version: preview.assignmentVersion, previewHash: preview.previewHash, idempotencyKey: requestKey.current }) });
      const body = await read<{ publication: GradebookPublication }>(response);
      if (mounted.current) { setPublication(body.publication); setChecked(false); setPreview(null); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : t.failure); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  if (!allowed) return null;
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
  const outcomes = preview?.outcomes ?? options?.outcomes ?? [], counts = preview?.counts ?? options?.counts;
  return <section aria-label={t.title} aria-busy={busy || loading} dir={locale === "en" ? "ltr" : "rtl"} className="sk-panel space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="max-w-2xl"><h2 className="text-lg font-bold">{t.title}</h2><p className="mt-2 text-sm text-ink-muted">{t.hint}</p></div><Button variant="ghost" disabled={busy || loading} onClick={() => void load()}><RefreshCw aria-hidden="true" />{t.refresh}</Button></div>
    {error && <p role="alert" className="rounded-xl bg-status-error-surface p-4 text-sm text-status-error-text">{error}</p>}
    {loading ? <Skeleton className="h-32 w-full" /> : publication ? <div role="status" className="space-y-3 rounded-xl border border-border p-4"><h3 className="flex items-center gap-2 font-bold"><CheckCircle2 aria-hidden="true" />{t.receipt}</h3><p>{publication.examTitle} · {publication.academicYear} · {publication.subjectName}</p><p>{t.saved}: {number(publication.rows.length)} · {t.notStarted}: {number(publication.unenteredStudentIds.length)}</p><p className="text-sm text-ink-muted">{t.receiptHint}</p><p className="break-all text-xs">{t.receiptId}: {publication.id}</p><div className="space-y-2 border-t border-border pt-3" data-gradebook-drift={options?.drift?.length ?? 0}><h4 className="text-sm font-semibold">{d.driftTitle}</h4>{!options?.drift?.length ? <p className="text-sm text-ink-muted">{d.driftNone}</p> : <ul className="space-y-1 text-sm">{options.drift.map(row => <li key={row.studentId} className="flex items-start gap-2 rounded-xl bg-status-warning-surface p-2 text-status-warning-text" data-drift-kind={row.kind}><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{fillStudioCopy(row.kind === "RESULT_CORRECTED" ? d.driftCorrected : row.kind === "MARK_EDITED" ? d.driftEdited : d.driftMissing, [`\u2068${row.fullName ?? t.unknown}\u2069`, number(row.sent), row.current === null ? "—" : number(row.current)])}</span></li>)}</ul>}</div></div> : options && <>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">{(["assigned", "reviewed", "submitted", "inProgress", "notStarted", "unavailable"] as const).map(key => <div key={key} className="rounded-xl border border-border p-3"><dt className="text-ink-muted">{t[key]}</dt><dd className="mt-1 text-lg font-bold">{number(counts?.[key] ?? 0)}</dd></div>)}</dl>
      <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer font-semibold">{t.outcomes}</summary><ul className="mt-3 space-y-2 text-sm">{outcomes.map(outcome => <li key={outcome.studentId} className="flex flex-wrap justify-between gap-2"><span>{outcome.fullName ?? t.unknown} {outcome.rollNo && `· ${outcome.rollNo}`}</span><span>{t[outcome.state]}</span></li>)}</ul></details>
      <p className="text-sm text-ink-muted">{t.notEntered}</p>{(preview ? preview.blockers.includes("WINDOW_OPEN") : !options.windowClosed) && <p role="status" className="rounded-xl bg-status-warning-surface p-3 text-sm text-status-warning-text">{t.window} {t.closes}: <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(options.endsAt))}</bdi></p>}
      {!options.exams.length ? <p className="text-sm">{t.noExams}</p> : <><FormField name="gradebook-destination" label={t.exam}><Select value={examId} disabled={busy} onChange={event => { setExamId(event.target.value); setPreview(null); setChecked(false); }}><option value="">{t.choose}</option>{options.exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {exam.academicYear} · {exam.term}</option>)}</Select></FormField><FormField name="gradebook-conversion" label={t.conversion}><Select value={conversion} disabled={busy} onChange={event => { setConversion(event.target.value as GradebookConversion); setPreview(null); setChecked(false); }}><option value="EXACT">{t.EXACT}</option><option value="PROPORTIONAL_WHOLE">{t.PROPORTIONAL_WHOLE}</option></Select></FormField><p className="text-xs leading-relaxed text-ink-muted">{t.conversionHint}</p><Button variant="outline" disabled={busy || !examId} onClick={() => void review()}>{t.preview}</Button></>}
      {preview && <div className="space-y-4 border-t border-border pt-4"><h3 className="font-bold">{preview.exam.title} · {preview.subject.name}</h3><p className="text-sm">{t.maximum}: {number(preview.sourceMaximum)} → {number(preview.targetMaximum)}</p><p className="text-xs text-ink-muted">{t.rounding}: {t[preview.resultRoundingRule]}. {t.roundingHint}</p>{preview.blockers.length > 0 && <ul role="alert" className="list-inside list-disc space-y-2 rounded-xl bg-status-warning-surface p-4 text-sm text-status-warning-text">{preview.blockers.map(blocker => <li key={blocker}>{t[blocker]}</li>)}</ul>}
        <div className="space-y-2">{preview.rows.map(row => <div key={row.attemptId} className="grid gap-2 rounded-xl border border-border p-3 text-sm sm:grid-cols-3"><span className="font-semibold">{row.fullName} · {row.rollNo}</span><span>{t.original}: {number(row.rawTotal)} / {number(preview.sourceMaximum)}</span><span>{t.converted}: {number(row.targetMark)} / {number(preview.targetMaximum)} · {t.grade}: {row.grade}</span></div>)}</div>
        <label className="flex items-start gap-3 text-sm leading-relaxed"><Checkbox checked={checked} disabled={busy || preview.blockers.length > 0} className="mt-1" onChange={event => setChecked(event.target.checked)} /><span>{t.confirm}</span></label><Button disabled={busy || !checked || preview.blockers.length > 0} onClick={() => void send()}>{busy ? t.sending : t.send}</Button>
      </div>}
    </>}
  </section>;
}
