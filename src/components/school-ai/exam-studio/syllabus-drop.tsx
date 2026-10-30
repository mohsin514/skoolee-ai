"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, ListChecks, ScanText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { TaskLoading } from "@/components/ui/task-patterns";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSyllabusCopy } from "@/lib/school-ai/exam-studio-copy-syllabus";
import { Isolated } from "./space-state";
import { DocumentJobsPanel } from "../document-jobs-panel";
import { SourceImagePreview } from "../source-image-preview";
import { SourceStructureReview, type SourceStructureChange } from "../source-structure-review";
import { sourceStructureApprovalIssues, type ExtractedPage, type DocumentStructure } from "@/lib/school-ai/intake";
import type { AiWorkspaceRecord, SourceData as WorkspaceSourceData } from "@/lib/school-ai/types";
import type { DocumentJob } from "@/lib/school-ai/document-jobs";
import { SOURCE_POLL_DEADLINE_MS, SOURCE_POLL_LIMIT, sourceExtractionState } from "@/lib/school-ai/source-extraction-state";
import { syllabusSourceIssue } from "@/lib/school-ai/syllabus-source";

/**
 * SKO-500: the Syllabus Drop. Shown in place of the Syllabus Map while a class has no approved
 * syllabus. One path, resumable at every step because each step is saved on the server:
 * upload or paste → check the text → find units and outcomes → keep the right rows → approve
 * (classroom tier) or send to the head of department. Approving the syllabus also approves the file.
 */
type Page = ExtractedPage;
type SourceData = WorkspaceSourceData & Record<string, unknown>;
type Suggestion = { id: string; unit: string; title: string; code?: string; page: string; excerpt: string };
type Proposal = { model: string; suggestions: Suggestion[] };
type Rec<T> = Omit<AiWorkspaceRecord, "data"> & { data: T };
type CurriculumData = { subjectId: string; classId: string; outcomes: Array<{ id: string; unit?: string }>; sources: Array<{ sourceRecordId?: string }> };
type Step =
  | { kind: "loading" }
  | { kind: "drop" }
  | { kind: "busy"; label: string }
  | { kind: "reading"; source: Rec<SourceData> }
  | { kind: "extraction"; source: Rec<SourceData> }
  | { kind: "check"; source: Rec<SourceData> }
  | { kind: "review"; source: Rec<SourceData>; proposal: Proposal; dropped: number }
  | { kind: "draft"; curriculum: Rec<CurriculumData>; canApprove: boolean };

const RULES_MODEL = "skoolee-outline-rules-v1";
const academicYearNow = () => { const now = new Date(); const start = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1; return `${start}-${String((start + 1) % 100).padStart(2, "0")}`; };

const key = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9_-]/g, "");

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init.headers } : init?.headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "");
  return payload as T;
}

export function SyllabusDrop({ language, subjectId, classId, subjectLabel, onApproved }: { language: Language; subjectId: string; classId: string; subjectLabel: string; onApproved: () => void }) {
  const t = studioSyllabusCopy(language);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const number = useCallback((value: number) => new Intl.NumberFormat(language).format(value), [language]);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [extractionBusy, setExtractionBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [text, setText] = useState("");
  const [structure, setStructure] = useState<DocumentStructure>({});
  const [rows, setRows] = useState<Record<string, { keep: boolean; title: string }>>({});
  const [year, setYear] = useState(academicYearNow);
  const [board, setBoard] = useState("");
  const fail = useCallback((reason: unknown) => setError(reason instanceof Error && reason.message ? reason.message : t.failedStep), [t.failedStep]);

  const toDraft = useCallback(async (curriculum: Rec<CurriculumData>) => {
    if (curriculum.status === "APPROVED") { if (mounted.current) onApproved(); return; }
    const summary = await call<{ historyAccess?: { canApprove?: boolean } }>(`/api/school-ai/workspace/${encodeURIComponent(curriculum.id)}?history=summary`).catch(() => ({ historyAccess: { canApprove: false } }));
    if (!mounted.current) return;
    setStep({ kind: "draft", curriculum, canApprove: Boolean(summary.historyAccess?.canApprove) });
  }, [onApproved]);

  const openCheck = useCallback((source: Rec<SourceData>) => {
    setPages(source.data.sourcePages?.map(page => ({ ...page })) ?? []);
    setText(source.data.extractedText);
    const scanned = source.data.mimeType.startsWith("image/") || source.data.mimeType === "application/pdf";
    setStructure({ expectedPageCount: source.data.expectedPageCount ?? (scanned ? (source.data.mimeType.startsWith("image/") ? 1 : null) : undefined), missingPages: source.data.missingPages, structureReviewed: source.data.structureReviewed ?? (scanned ? false : undefined) });
    setStep({ kind: "check", source });
  }, []);

  const openReview = useCallback((source: Rec<SourceData>, proposal: Proposal, dropped: number) => {
    setRows(Object.fromEntries(proposal.suggestions.map(row => [row.id, { keep: true, title: row.title }])));
    setStep({ kind: "review", source, proposal, dropped });
  }, []);

  const propose = useCallback(async (source: Rec<SourceData>) => {
    setError(null); setStep({ kind: "busy", label: t.proposing });
    try {
      const result = await call<{ proposal: Proposal; dropped: number }>(`/api/school-ai/workspace/${encodeURIComponent(source.id)}/outcomes/propose`, { method: "POST", body: JSON.stringify({ idempotencyKey: key() }) });
      openReview(source, result.proposal, result.dropped);
    } catch (reason) { fail(reason); openCheck(source); }
  }, [fail, openCheck, openReview, t.proposing]);

  const toSource = useCallback((source: Rec<SourceData>, processing = false) => {
    const hasText = Boolean(source.data.extractedText.trim() || source.data.sourcePages?.some(page => page.text.trim()));
    if (processing || !hasText) {
      // Duplicate intakes omit processing: saved original + empty text still needs its job checked.
      if (source.data.storageKey) setStep({ kind: "reading", source });
      else openCheck(source);
      return;
    }
    if (syllabusSourceIssue(source.data)) { openCheck(source); return; }
    // The server verifies the proposal's source-version hash before replaying it.
    void propose(source);
  }, [openCheck, propose]);

  const readingSource = step.kind === "reading" ? step.source : null;
  useEffect(() => {
    if (!readingSource) return;
    const source = readingSource;
    let active = true, polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const deadline = Date.now() + SOURCE_POLL_DEADLINE_MS;
    const tick = async () => {
      polls += 1;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), Math.min(15_000, Math.max(1, deadline - Date.now())));
      try {
        const [{ record }, { jobs }] = await Promise.all([
          call<{ record: Rec<SourceData> }>(`/api/school-ai/workspace/${encodeURIComponent(source.id)}`, { signal: controller.signal }),
          call<{ jobs: DocumentJob[] }>(`/api/school-ai/sources/${encodeURIComponent(source.id)}/jobs`, { signal: controller.signal }),
        ]);
        if (!active) return;
        if (record.data.extractedText.trim() || record.data.sourcePages?.some(page => page.text.trim())) { openCheck(record); return; }
        if (sourceExtractionState(record.version, jobs, polls) !== "waiting" || Date.now() >= deadline) { setStep({ kind: "extraction", source: record }); return; }
      } catch {
        if (!active) return;
        if (polls >= SOURCE_POLL_LIMIT || Date.now() >= deadline) { setStep({ kind: "extraction", source }); return; }
      } finally { clearTimeout(timeout); }
      if (active) timer = setTimeout(() => void tick(), 4000);
    };
    void tick();
    return () => { active = false; clearTimeout(timer); controller?.abort(); };
  }, [readingSource, openCheck]);

  const resume = useCallback(async (isActive: () => boolean) => {
    setError(null);
    try {
      const [curricula, sources] = await Promise.all([
        call<{ records: Rec<CurriculumData>[] }>("/api/school-ai/workspace?kind=CURRICULUM&activeOnly=1&limit=100"),
        call<{ records: Rec<SourceData>[] }>("/api/school-ai/workspace?kind=SOURCE&activeOnly=1&limit=100"),
      ]);
      if (!isActive()) return;
      const draft = curricula.records.filter(row => row.data.subjectId === subjectId && row.data.classId === classId && row.status !== "APPROVED" && row.data.sources?.some(source => source.sourceRecordId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (draft) { await toDraft(draft); return; }
      const source = sources.records.filter(row => row.data.documentKind === "syllabus" && row.data.subjectId === subjectId && row.data.classId === classId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (source) { toSource(source); return; }
      setStep({ kind: "drop" });
    } catch { if (isActive()) setStep({ kind: "drop" }); }
  }, [classId, subjectId, toDraft, toSource]);
  useEffect(() => { let active = true; void resume(() => active); return () => { active = false; }; }, [resume]);

  const upload = async () => {
    if (!file) return;
    setError(null); setStep({ kind: "busy", label: t.uploading });
    try {
      const form = new FormData();
      form.set("file", file); form.set("documentKind", "syllabus"); form.set("subjectId", subjectId); form.set("classId", classId); form.set("language", language);
      if (file.type.startsWith("image/")) form.set("origin", "camera");
      const result = await call<{ record: Rec<SourceData>; processing?: boolean }>("/api/school-ai/intake", { method: "POST", body: form });
      toSource(result.record, result.processing);
    } catch (reason) { fail(reason); setStep({ kind: "drop" }); }
  };

  const savePastedSource = async () => {
    if (!pasted.trim()) return;
    setError(null); setStep({ kind: "busy", label: t.uploading });
    try {
      const result = await call<{ record: Rec<SourceData> }>("/api/school-ai/workspace", { method: "POST", body: JSON.stringify({ kind: "SOURCE", title: `${subjectLabel} — ${t.textLabel}`.slice(0, 180), idempotencyKey: key(), data: { extractedText: pasted.trim(), documentKind: "syllabus", fileName: "typed-syllabus.txt", mimeType: "text/plain", subjectId, classId, origin: "manual", extractionStatus: "manual" } }) });
      toSource(result.record);
    } catch (reason) { fail(reason); setStep({ kind: "drop" }); }
  };

  const confirmText = async (source: Rec<SourceData>) => {
    setError(null); setStep({ kind: "busy", label: t.proposing });
    const structured = Boolean(pages.length || structure.expectedPageCount !== undefined || structure.structureReviewed !== undefined);
    const data: SourceData = {
      ...source.data,
      ...(structured ? { ...structure, sourcePages: pages } : {}),
      extractedText: text, extractionStatus: "extracted", uncertainties: [],
    };
    if (sourceStructureApprovalIssues(data).length) { setError(t.structureRequired); setStep({ kind: "check", source }); return; }
    try {
      const { record } = await call<{ record: Rec<SourceData> }>(`/api/school-ai/workspace/${encodeURIComponent(source.id)}`, { method: "PATCH", body: JSON.stringify({ version: source.version, action: "save", data }) });
      await propose(record);
    } catch (reason) { fail(reason); setStep({ kind: "check", source }); }
  };

  const accept = async (source: Rec<SourceData>, proposal: Proposal) => {
    const accepted = proposal.suggestions.filter(row => rows[row.id]?.keep).map(row => ({ suggestionId: row.id, title: rows[row.id].title.trim() || row.title, unit: row.unit, page: row.page, ...(row.code ? { code: row.code } : {}) }));
    if (!accepted.length) return;
    setError(null); setStep({ kind: "busy", label: t.uploading });
    try {
      const { record } = await call<{ record: Rec<CurriculumData> }>(`/api/school-ai/workspace/${encodeURIComponent(source.id)}/outcomes/accept`, { method: "POST", body: JSON.stringify({ academicYear: year.trim() || academicYearNow(), ...(board.trim() ? { board: board.trim() } : {}), title: subjectLabel.slice(0, 180), accepted }) });
      await toDraft(record);
    } catch (reason) { fail(reason); openReview(source, proposal, 0); }
  };

  const decide = async (curriculum: Rec<CurriculumData>, action: "approve" | "review") => {
    setError(null); setStep({ kind: "busy", label: action === "approve" ? t.approve : t.sendForReview });
    try {
      const { record } = await call<{ record: Rec<CurriculumData> }>(`/api/school-ai/workspace/${encodeURIComponent(curriculum.id)}`, { method: "PATCH", body: JSON.stringify({ version: curriculum.version, action }) });
      if (!mounted.current) return;
      if (record.status === "APPROVED") { setNotice(t.approved); onApproved(); return; }
      await toDraft(record);
    } catch (reason) { fail(reason); await toDraft(curriculum); }
  };

  const grouped = useMemo(() => {
    if (step.kind !== "review") return [];
    const units: Array<{ unit: string; rows: Suggestion[] }> = [];
    for (const row of step.proposal.suggestions) {
      const last = units[units.length - 1];
      if (last && last.unit === row.unit) last.rows.push(row); else units.push({ unit: row.unit, rows: [row] });
    }
    return units;
  }, [step]);

  const header = (icon: React.ReactNode, title: string, intro?: React.ReactNode) => <header className="space-y-1">
    <h3 className="flex items-center gap-2 text-lg font-bold">{icon}{title}</h3>
    {intro ? <p className="text-sm text-ink-muted">{intro}</p> : null}
  </header>;

  return <section className="sk-panel space-y-4 p-4 sm:p-5" aria-live="polite" data-syllabus-drop={step.kind}>
    {error ? <Alert tone="danger" compact live="polite">{error}</Alert> : null}
    {notice ? <Alert tone="success" compact live="polite">{notice}</Alert> : null}
    {step.kind === "loading" ? <TaskLoading label={t.mapTitle} /> : null}
    {step.kind === "busy" ? <TaskLoading label={step.label} /> : null}
    {step.kind === "reading" ? <>
      <TaskLoading label={t.reading} />
      <Button type="button" variant="outline" onClick={() => setStep({ kind: "extraction", source: step.source })}>{t.reviewExtraction}</Button>
    </> : null}
    {step.kind === "extraction" ? <>
      {header(<ScanText aria-hidden="true" className="size-5 text-primary" />, t.extractionTitle, t.extractionIntro)}
      <DocumentJobsPanel language={language} record={step.source} canCreate canDelete={false} onBusyChange={setExtractionBusy} onRecord={record => openCheck(record as AiWorkspaceRecord<"SOURCE">)} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" data-drop-action="manual-review" disabled={extractionBusy} onClick={() => openCheck(step.source)}>{t.manualReview}</Button>
        <Button type="button" variant="ghost" disabled={extractionBusy} onClick={() => setStep({ kind: "drop" })}>{t.startOver}</Button>
      </div>
    </> : null}

    {step.kind === "drop" ? <>
      {header(<FileUp aria-hidden="true" className="size-5 text-primary" />, t.dropTitle, fillStudioCopy(t.dropIntro, [subjectLabel]))}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
          <FormField name="syllabusFile" label={t.uploadLabel} hint={t.uploadHint}>
            <Input type="file" accept="image/*,application/pdf,text/plain" onChange={event => setFile(event.currentTarget.files?.[0] ?? null)} />
          </FormField>
          <Button type="button" onClick={() => void upload()} disabled={!file} data-drop-action="upload"><FileUp aria-hidden="true" />{t.upload}</Button>
        </div>
        <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
          <FormField name="syllabusText" label={t.pasteLabel} hint={t.pasteHint}>
            <Textarea rows={6} dir="auto" value={pasted} maxLength={80000} onChange={event => setPasted(event.currentTarget.value)} />
          </FormField>
          <Button type="button" variant="outline" onClick={() => void savePastedSource()} disabled={!pasted.trim()} data-drop-action="paste">{t.usePasted}</Button>
        </div>
      </div>
    </> : null}

    {step.kind === "check" ? <>
      {header(<ScanText aria-hidden="true" className="size-5 text-primary" />, t.checkTitle, t.checkIntro)}
      {step.source.data.uncertainties?.length ? <Alert tone="warning"><p className="font-semibold">{t.uncertain}</p><ul className="list-disc ps-5">{step.source.data.uncertainties.map(item => <li key={item}><Isolated>{item}</Isolated></li>)}</ul></Alert> : null}
      {step.source.data.storageKey && step.source.data.mimeType.startsWith("image/") ? <SourceImagePreview recordId={step.source.id} mimeType={step.source.data.mimeType} language={language} /> : null}
      {step.source.data.storageKey ? <a href={`/api/school-ai/sources/${encodeURIComponent(step.source.id)}/file`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">{t.openOriginal}</a> : null}
      {pages.length || structure.expectedPageCount !== undefined || structure.structureReviewed !== undefined ? <SourceStructureReview language={language} pages={pages} {...structure} onChange={(changes: SourceStructureChange) => {
        if (changes.sourcePages) setPages(changes.sourcePages);
        if (changes.extractedText !== undefined) setText(changes.extractedText);
        setStructure(current => ({ ...current, ...Object.fromEntries(Object.entries(changes).filter(([name]) => name !== "sourcePages" && name !== "extractedText")) }));
      }} /> : null}
      <FormField name="syllabusCheck" label={t.textLabel}>
        <Textarea rows={10} dir="auto" value={text} maxLength={80000} onChange={event => setText(event.currentTarget.value)} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="button" data-drop-action="confirm" onClick={() => void confirmText(step.source)} disabled={!text.trim() || sourceStructureApprovalIssues({ ...structure, sourcePages: pages, extractedText: text }).length > 0}>{t.textLooksRight}</Button>
        <Button type="button" variant="ghost" onClick={() => setStep({ kind: "drop" })}>{t.startOver}</Button>
      </div>
    </> : null}

    {step.kind === "review" ? <>
      {header(<ListChecks aria-hidden="true" className="size-5 text-primary" />, t.reviewTitle, t.reviewIntro)}
      <p className="text-xs text-ink-subtle">{step.proposal.model === RULES_MODEL ? t.rulesNote : t.aiNote}</p>
      {step.dropped ? <Alert tone="info" compact>{fillStudioCopy(t.dropped, [number(step.dropped)])}</Alert> : null}
      <div className="space-y-4">
        {grouped.map(group => <fieldset key={group.unit || "none"} className="space-y-2">
          <legend className="text-sm font-bold"><Isolated>{group.unit || t.noUnit}</Isolated></legend>
          <ul className="space-y-2">
            {group.rows.map(row => <li key={row.id} className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-subtle p-3">
              <Checkbox className="mt-3" checked={rows[row.id]?.keep ?? false} aria-label={row.title} onChange={event => { const keep = event.currentTarget.checked; setRows(current => ({ ...current, [row.id]: { ...current[row.id], keep } })); }} />
              <div className="min-w-0 flex-1 space-y-1">
                <Input dir="auto" aria-label={t.titleLabel} value={rows[row.id]?.title ?? row.title} maxLength={1200} disabled={!rows[row.id]?.keep} onChange={event => { const title = event.currentTarget.value; setRows(current => ({ ...current, [row.id]: { ...current[row.id], title } })); }} />
                <p className="text-xs text-ink-subtle">{row.code ? <><Isolated>{row.code}</Isolated> · </> : null}{row.page === "text" ? t.unpaginatedText : fillStudioCopy(t.page, [row.page])}</p>
              </div>
            </li>)}
          </ul>
        </fieldset>)}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <FormField name="academicYear" label={t.academicYear} className="w-40"><Input value={year} maxLength={80} onChange={event => setYear(event.currentTarget.value)} /></FormField>
        <FormField name="board" label={t.board} hint={t.boardHint} className="min-w-56 flex-1"><Input dir="auto" value={board} maxLength={200} onChange={event => setBoard(event.currentTarget.value)} /></FormField>
        <p className="pb-3 text-sm text-ink-muted">{fillStudioCopy(t.selected, [number(Object.values(rows).filter(row => row.keep).length), number(step.proposal.suggestions.length)])}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" data-drop-action="accept" onClick={() => void accept(step.source, step.proposal)} disabled={!Object.values(rows).some(row => row.keep)}>{t.acceptOutline}</Button>
        <Button type="button" variant="ghost" onClick={() => setStep({ kind: "drop" })}>{t.startOver}</Button>
      </div>
    </> : null}

    {step.kind === "draft" ? <>
      {header(<ShieldCheck aria-hidden="true" className="size-5 text-primary" />, t.draftTitle, fillStudioCopy(t.draftIntro, [number(step.curriculum.data.outcomes.length), number(new Set(step.curriculum.data.outcomes.map(outcome => outcome.unit ?? "")).size)]))}
      <p className="text-xs text-ink-subtle"><Isolated>{step.curriculum.title}</Isolated></p>
      {step.curriculum.status === "IN_REVIEW" && !step.canApprove ? <Alert tone="info" compact>{t.inReview}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        {step.canApprove ? <Button type="button" data-drop-action="approve" onClick={() => void decide(step.curriculum, "approve")}><ShieldCheck aria-hidden="true" />{t.approve}</Button> : null}
        {!step.canApprove && step.curriculum.status === "DRAFT" ? <Button type="button" data-drop-action="review" onClick={() => void decide(step.curriculum, "review")}>{t.sendForReview}</Button> : null}
      </div>
      {step.canApprove ? <p className="text-xs text-ink-subtle">{t.approveHint}</p> : null}
    </> : null}
  </section>;
}
