"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { TaskLoading } from "@/components/ui/task-patterns";
import { useLocale } from "@/components/locale/LocaleProvider";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";
import { sourceStructureApprovalIssues } from "@/lib/school-ai/intake";
import type { AiWorkspaceRecord, SourceData } from "@/lib/school-ai/types";
import { DocumentJobsPanel } from "../document-jobs-panel";
import { SourceStructureReview } from "../source-structure-review";

type Warning = { code: string; values: Array<string | number> };
const newRequestKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "");
const isPhysicalSource = (data: SourceData) => Boolean(data.storageKey && (data.mimeType === "application/pdf" || data.mimeType.startsWith("image/")));
const reviewData = (data: SourceData): SourceData => isPhysicalSource(data) ? { ...data, expectedPageCount: data.expectedPageCount ?? (data.mimeType.startsWith("image/") ? 1 : null), structureReviewed: data.structureReviewed ?? false } : data;
const sourceReady = (record: AiWorkspaceRecord<"SOURCE">) => record.status !== "ARCHIVED" && Boolean(record.data.extractedText.trim()) && ["manual", "extracted"].includes(record.data.extractionStatus ?? "") && !record.data.uncertainties?.length && (!isPhysicalSource(record.data) || Boolean(record.data.sourcePages?.length && record.data.structureReviewed)) && !sourceStructureApprovalIssues(record.data).length;

/** Retain the saved source through asynchronous extraction, explicit review and paper creation. */
type UploadPaperProps = { slotId: string; subjectId: string | null; classId: string | null; onDone: () => void };
export function UploadPaper(props: UploadPaperProps) {
  return <ScopedUploadPaper key={`${props.slotId}:${props.subjectId}:${props.classId}`} {...props} />;
}
function ScopedUploadPaper({ slotId, subjectId, classId, onDone }: UploadPaperProps) {
  const { language } = useLocale();
  const t = studioSlotsCopy(language);
  const storageKey = `exam-studio:paper-upload:${slotId}:${subjectId}:${classId}`;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [source, setSource] = useState<AiWorkspaceRecord<"SOURCE"> | null>(null);
  const [draft, setDraft] = useState<SourceData | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [jobBusy, setJobBusy] = useState(false);
  const locked = busy || jobBusy;
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ questions: number; warnings: Warning[] } | null>(null);
  const acceptSource = (record: AiWorkspaceRecord) => {
    if (!mounted.current) return;
    if (record.kind !== "SOURCE" || record.data.documentKind !== "paper" || subjectId && record.data.subjectId !== subjectId || classId && record.data.classId !== classId) throw new Error(t.failed);
    const saved = record as AiWorkspaceRecord<"SOURCE">;
    setSource(saved); setDraft(reviewData(saved.data)); setReviewed(sourceReady(saved));
    // Only the reference is retained; text and original files stay behind authenticated APIs.
    try { sessionStorage.setItem(storageKey, saved.id); } catch { /* The saved source remains in the source library. */ }
  };
  useEffect(() => {
    let active = true;
    let savedId: string | null = null;
    try { savedId = sessionStorage.getItem(storageKey); } catch { /* Storage is optional. */ }
    if (!savedId) { setRestoring(false); return; }
    void fetch(`/api/school-ai/workspace/${encodeURIComponent(savedId)}`, { cache: "no-store" }).then(async response => {
      const payload = await response.json();
      if (!active) return;
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
        throw new Error(typeof payload.error === "string" ? payload.error : t.failed);
      }
      acceptSource(payload.record);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : t.failed); }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
    // A saved reference belongs to this slot. Source edits update state without restarting restoration.
  }, [storageKey]);

  const call = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failed);
    return payload;
  };
  const finish = async (saved: AiWorkspaceRecord<"SOURCE">) => {
    if (!mounted.current) return;
    if (!sourceReady(saved)) throw new Error(t.uploadReviewHint);
    const payload = await call(`/api/school-ai/workspace/${encodeURIComponent(saved.id)}/paper-from-upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotId, expectedSourceVersion: saved.version }) });
    if (!mounted.current) return;
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
    setResult({ questions: payload.questions, warnings: payload.warnings ?? [] }); onDone();
  };
  const run = async () => {
    setBusy(true); setError(null);
    try {
      if (source) { await finish(source); return; }
      if (file) {
        const form = new FormData();
        form.set("file", file); form.set("documentKind", "paper"); form.set("language", language);
        if (subjectId && classId) { form.set("subjectId", subjectId); form.set("classId", classId); }
        const payload = await call("/api/school-ai/intake", { method: "POST", body: form });
        // A duplicate intake may omit processing. Every saved file enters the same resumable review.
        acceptSource(payload.record);
      } else {
        const payload = await call("/api/school-ai/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "SOURCE", title: t.uploadPaper, idempotencyKey: newRequestKey(), data: { extractedText: text.trim(), documentKind: "paper", fileName: "typed-paper.txt", mimeType: "text/plain", ...(subjectId && classId ? { subjectId, classId } : {}), origin: "manual", extractionStatus: "manual" } }) });
        acceptSource(payload.record);
        await finish(payload.record);
      }
    } catch (reason) { setError(reason instanceof Error && reason.message ? reason.message : t.failed); }
    finally { setBusy(false); }
  };
  const structureIssues = draft ? sourceStructureApprovalIssues(draft) : [];
  const changed = Boolean(source && draft && JSON.stringify(reviewData(source.data)) !== JSON.stringify(draft));
  const needsReviewSave = Boolean(source && reviewed && !sourceReady(source));
  const saveReview = async () => {
    if (!source || !draft || !reviewed || !draft.extractedText.trim() || structureIssues.length) return;
    setBusy(true); setError(null);
    try {
      const payload = await call(`/api/school-ai/workspace/${encodeURIComponent(source.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: source.version, data: { ...draft, extractionStatus: draft.origin === "manual" ? "manual" : "extracted", uncertainties: [] } }) });
      acceptSource(payload.record);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.failed); }
    finally { setBusy(false); }
  };

  if (result) return <div className="space-y-3" data-upload-result>
    <Alert tone="success" compact live="polite">{fillStudioCopy(t.uploadDone, [new Intl.NumberFormat(language).format(result.questions)])}</Alert>
    {result.warnings.filter(warning => warning.code !== "NO_QUESTIONS").map((warning, index) => <Alert key={index} tone="warning" compact>{fillStudioCopy(warning.code === "MARKS_NOT_STATED" ? t.uploadWarnMarks : t.uploadWarnKey, warning.values.map(String))}</Alert>)}
    <a href="#space=review" className="text-sm font-semibold text-primary underline">{t.openReview}</a>
  </div>;
  return <div className="space-y-4" data-upload-paper>
    <p className="text-sm text-ink-muted">{t.uploadIntro}</p>
    {error ? <Alert tone="danger" compact live="polite">{error}</Alert> : null}
    {busy || restoring ? <TaskLoading label={t.uploadReading} /> : null}
    {source && draft ? <div className="space-y-4" data-upload-source={source.id}>
      <Alert tone="info" compact>{t.uploadSavedSource}</Alert>
      <p className="break-words text-sm font-semibold"><bdi>{source.title}</bdi></p>
      {source.data.storageKey ? <><a className="text-sm font-semibold text-primary underline" href={`/api/school-ai/sources/${encodeURIComponent(source.id)}/file`} target="_blank" rel="noopener noreferrer">{t.uploadOriginal}</a><p className="text-sm text-ink-muted">{t.uploadProcessingHint}</p><DocumentJobsPanel key={`${source.id}:${source.version}`} language={language} record={source} canCreate={!busy && !changed && source.status !== "ARCHIVED"} canDelete={false} onRecord={acceptSource} onBusyChange={setJobBusy} /></> : null}
      <FormField name="paper-source-text" label={t.uploadSourceText} hint={t.uploadReviewHint}><Textarea rows={10} dir="auto" value={draft.extractedText} maxLength={80000} disabled={locked || source.status === "ARCHIVED"} onChange={event => { setDraft({ ...draft, extractedText: event.currentTarget.value }); setReviewed(false); }} /></FormField>
      {(draft.sourcePages?.length || draft.expectedPageCount !== undefined || draft.structureReviewed !== undefined) ? <SourceStructureReview language={language} pages={draft.sourcePages ?? []} expectedPageCount={draft.expectedPageCount} missingPages={draft.missingPages} structureReviewed={draft.structureReviewed} disabled={locked || source.status === "ARCHIVED"} onChange={changes => { setDraft({ ...draft, ...changes }); setReviewed(false); }} /> : null}
      {structureIssues.length ? <Alert tone="warning" compact>{t.uploadStructureRequired}</Alert> : null}
      {draft.uncertainties?.length ? <ul className="list-disc ps-5 text-sm">{draft.uncertainties.map((uncertainty, index) => <li key={index}>{uncertainty}</li>)}</ul> : null}
      <label className="flex items-start gap-3 text-sm"><Checkbox checked={reviewed} disabled={locked || !draft.extractedText.trim() || structureIssues.length > 0 || source.status === "ARCHIVED"} onChange={event => setReviewed(event.target.checked)} data-upload-reviewed />{t.uploadReviewed}</label>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={locked || !reviewed || (!changed && !needsReviewSave) || source.status === "ARCHIVED"} onClick={() => void saveReview()} data-upload-save-review>{t.uploadSaveReview}</Button><Button type="button" disabled={locked || changed || !reviewed || !sourceReady(source)} onClick={() => void run()} data-upload-continue>{t.uploadContinue}</Button><Button type="button" variant="ghost" disabled={locked} onClick={() => { try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ } setSource(null); setDraft(null); setFile(null); setText(""); setError(null); }} data-upload-start-over>{t.uploadStartOver}</Button></div>
    </div> : <>
      <FormField name="paperFile" label={t.uploadFile}><Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv" disabled={busy || restoring} onChange={event => setFile(event.currentTarget.files?.[0] ?? null)} /></FormField>
      <FormField name="paperText" label={t.pasteText}><Textarea rows={8} dir="auto" value={text} maxLength={80000} disabled={busy || restoring} onChange={event => setText(event.currentTarget.value)} /></FormField>
      <Button type="button" disabled={busy || restoring || (!file && !text.trim())} onClick={() => void run()} data-upload-read><FileUp aria-hidden="true" />{t.uploadDo}</Button>
    </>}
  </div>;
}
