"use client";

import { PaperFigureEditor } from "./paper-figure-editor";
import { useRef, useState } from "react";
import { BookOpen, FileText, Plus, Printer, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { revisedDraftFrom, curriculumDataSchema, paperDataSchema, validateBlueprint, validateCurriculumApproval, validatePaperApproval, type AssessmentLocale, type Blueprint, type CurriculumData, type PaperData, type Question } from "@/lib/school-ai/assessment";
import { AdvancedQuestionOptions, AdvancedQuestionKey, CurriculumCoverage, PaperResources } from "./assessment-extensions";
import { assessmentExtensionCopy } from "./assessment-extension-copy";
import { assessmentCopy } from "./assessment-copy";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { decodeFrames } from "@/lib/school-ai/generation-stream";
import { CoverageGaps, QuestionBank, QuestionBankLabels } from "./question-bank";
import { CurriculumExecution } from "./curriculum-execution";
import { LearningPlanEditor, LearningTools } from "./learning-plans";
import { LessonPlanActions } from "./lesson-plan-actions";
import { PaperSemanticReview } from "./paper-semantic-review";
import { ExamReleasePanel } from "./exam-release-panel";
import { learningCopy } from "./learning-copy";
import { useWorkspaceDraft } from "./draft-safety";
import { prototypeCopy } from "./prototype-copy";

type RecordSummary = { id: string; kind: string; title: string; campusId: string | null; version: number; status: string; data: unknown };
type Subject = { id: string; name: string; classId: string; className: string; campusId: string };
type Props = { records: RecordSummary[]; locale: AssessmentLocale; onRefresh: () => void | Promise<void>; campusId?: string | null; subjects?: Subject[]; canCreate?: boolean; canApprove?: boolean };
const uid = () => crypto.randomUUID();
const initialBlueprint = (): Blueprint => ({ title: "", durationMinutes: 60, totalMarks: 10, instructions: "", sections: [{ id: uid(), title: "A", questionCount: 5, answerCount: 5, marksPerQuestion: 2, type: "SHORT_TEXT", outcomeIds: [] }] });
const errorMessage = (payload: { error?: unknown }, fallback: string) => typeof payload.error === "string" ? payload.error : fallback;

function TextField({ name, label, value, onChange, long = false, maxLength = 2000 }: { name: string; label: string; value: string; onChange: (value: string) => void; long?: boolean; maxLength?: number }) {
  return <FormField name={name} label={label}>{long ? <Textarea value={value} maxLength={maxLength} rows={4} onChange={(event) => onChange(event.target.value)} /> : <Input value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />}</FormField>;
}
function NumberField({ name, label, value, onChange, max = 1000, min = 1, step = 1 }: { name: string; label: string; value: number; onChange: (value: number) => void; max?: number; min?: number; step?: number }) {
  return <FormField name={name} label={label}><Input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))} /></FormField>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

export function AssessmentStudio({ records, locale, onRefresh, subjects = [], canCreate = true, canApprove = false }: Props) {
  const generationAbort = useRef<AbortController | null>(null);
  const [cancellable, setCancellable] = useState(false);
  const t = assessmentCopy(locale), extension = assessmentExtensionCopy(locale), aiCopy = schoolAICopy(locale);
  const [selected, setSelected] = useState<RecordSummary | null>(null);
  const [kind, setKind] = useState<"CURRICULUM" | "PAPER">("CURRICULUM");
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);
  const [paper, setPaper] = useState<PaperData | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useWorkspaceDraft(dirty);
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const idempotencyKey = useRef<string | null>(null);
  const paperGenerationKey = useRef<{ key: string; fingerprint: string } | null>(null);
  const readonly = !canCreate || (!!selected && selected.status !== "DRAFT");
  const curricula = records.filter((record) => record.kind === "CURRICULUM");
  const approvedCurricula = curricula.filter((record) => record.status === "APPROVED");
  const linkedRecord = paper ? curricula.find((record) => record.id === paper.curriculumId) : null;
  const linkedResult = linkedRecord ? curriculumDataSchema.safeParse(linkedRecord.data) : null;
  const linked = linkedResult?.success ? linkedResult.data : null;
  const sourceOptions = linked?.sources ?? [];
  const changeCurriculum = (next: CurriculumData) => { setCurriculum(next); setDirty(true); setIssues([]); };
  const changePaper = (next: PaperData) => { setPaper(next); setDirty(true); setIssues([]); };

  const loadRecord = (record: RecordSummary) => {
    if (dirty) { setMessage(t.switchWarning); return; }
    const parsed = record.kind === "CURRICULUM" ? curriculumDataSchema.safeParse(record.data) : paperDataSchema.safeParse(record.data);
    if (!parsed.success) { setMessage(t.failure); return; }
    setSelected(record); setKind(record.kind as "CURRICULUM" | "PAPER"); setTitle(record.title); setIssues([]); setMessage("");
    if (record.kind === "CURRICULUM") { setCurriculum(parsed.data as CurriculumData); setPaper(null); }
    else { setPaper(parsed.data as PaperData); setCurriculum(null); }
    idempotencyKey.current = null;
  };
  const newCurriculum = () => {
    if (dirty) { setMessage(t.switchWarning); return; }
    if (!subjects.length) { setMessage(t.noSubjects); return; }
    setSelected(null); setKind("CURRICULUM"); setPaper(null); setTitle(""); setMessage(""); setIssues([]); idempotencyKey.current = uid();
    setCurriculum({ subjectId: subjects[0].id, classId: subjects[0].classId, academicYear: "", board: "", sources: [], outcomes: [] });
  };
  const newPaper = (recordId?: string) => {
    if (dirty) { setMessage(t.switchWarning); return; }
    const record = approvedCurricula.find((item) => item.id === (recordId ?? (selected?.kind === "CURRICULUM" ? selected.id : undefined))) ?? approvedCurricula[0];
    const parsed = record && curriculumDataSchema.safeParse(record.data);
    if (!record || !parsed?.success) { setMessage(t.chooseCurriculum); return; }
    setSelected(null); setKind("PAPER"); setCurriculum(null); setTitle(""); setMessage(""); setIssues([]); idempotencyKey.current = uid();
    setPaper({ curriculumId: record.id, curriculumVersion: record.version, subjectId: parsed.data.subjectId, classId: parsed.data.classId, language: locale, blueprint: initialBlueprint(), questions: [], generation: { kind: "MANUAL", model: null, generatedAt: null } });
  };
  const save = async (action: "save" | "review" = "save") => {
    if (!canCreate || busy) return;
    if (action === "review" && (!selected || dirty)) { setMessage(t.saveFirst); return; }
    const data = kind === "CURRICULUM" ? curriculum : paper;
    if (!data) return;
    const schema = kind === "CURRICULUM" ? curriculumDataSchema : paperDataSchema;
    const parsed = schema.safeParse(data);
    if (!parsed.success) { setIssues(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)); return; }
    const recordTitle = kind === "PAPER" ? paper?.blueprint.title : title;
    if (!recordTitle?.trim()) { setIssues([t.paperTitle]); return; }
    setBusy(true); setMessage("");
    try {
      idempotencyKey.current ??= uid();
      const subject = subjects.find((item) => item.id === data.subjectId);
      const response = await fetch(selected ? `/api/school-ai/workspace/${selected.id}` : "/api/school-ai/workspace", { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selected ? action === "review" ? { version: selected.version, action } : { version: selected.version, title: recordTitle, data, action } : { kind, title: recordTitle, campusId: subject?.campusId ?? linkedRecord?.campusId, data, idempotencyKey: idempotencyKey.current }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, t.failure));
      const record = payload.record ?? payload.data;
      if (!record?.id) throw new Error(t.failure);
      setSelected(record); setDirty(false); setMessage(action === "review" ? t.reviewSent : t.saved); await onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : t.failure); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    if (!selected || !canApprove || busy || dirty) return;
    const errors = curriculum ? validateCurriculumApproval(curriculum) : paper && linked ? validatePaperApproval(paper, linked) : [t.chooseCurriculum];
    if (errors.length) { setIssues(errors); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/school-ai/workspace/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: selected.version, action: "approve" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, t.failure));
      setSelected(payload.record ?? payload.data); setMessage(t.approved); await onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : t.failure); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    if (!paper || !linked || readonly || busy) return;
    const errors = validateBlueprint(paper.blueprint, linked);
    if (errors.length) { setIssues(errors); return; }
    setBusy(true); setMessage(t.generating);
    // SKO-408 R5.1, R5.2, R5.12: progress frames, one per item, and a cancel that stops the provider.
    const controller = new AbortController();
    generationAbort.current = controller;
    setCancellable(true);
    // SKAI-1374: one key per identical request. A cut stream keeps it so the retry replays, never re-dispatches.
    const requestBody = { curriculumId: paper.curriculumId, curriculumVersion: paper.curriculumVersion, blueprint: paper.blueprint, language: paper.language, coverageSection: paper.coverageSection, lockedQuestions: paper.questions.filter((question) => question.locked) };
    const fingerprint = JSON.stringify(requestBody);
    if (paperGenerationKey.current?.fingerprint !== fingerprint) paperGenerationKey.current = { key: uid(), fingerprint };
    const key = paperGenerationKey.current.key;
    let started = false, settled = false;
    const recoverUnsettled = async () => {
      try {
        const response = await fetch(`/api/school-ai/generate-paper?key=${encodeURIComponent(key)}`, { cache: "no-store" });
        const payload = response.ok ? await response.json() : null;
        if (payload?.paper) { paperGenerationKey.current = null; settled = true; changePaper({ ...paperDataSchema.parse(payload.paper), coverageSection: paper.coverageSection, resources: paper.resources }); setMessage(t.draftOnly); return; }
      } catch { /* the receipt is unknown; the key is kept for a safe retry */ }
      setMessage(controller.signal.aborted ? t.generationCancelled : t.failure);
    };
    try {
      const response = await fetch("/api/school-ai/generate-paper/stream", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ idempotencyKey: key, ...requestBody }) });
      if (!response.ok || !response.body) { const payload = await response.json().catch(() => ({})); throw new Error(payload.code === "AI_QUOTA_EXHAUSTED" ? aiCopy.AI_QUOTA_EXHAUSTED : payload.code === "AI_SENSITIVE_CONTENT_BLOCKED" ? aiCopy.AI_SENSITIVE_CONTENT_BLOCKED : payload.code === "CURRICULUM_PACK_NOT_ACTIVE" ? [aiCopy.CURRICULUM_PACK_NOT_ACTIVE, ...(Array.isArray(payload.details) ? payload.details.filter((item: unknown) => typeof item === "string").slice(0, 3) : [])].join(" ") : errorMessage(payload, t.failure)); }
      started = true;
      let produced = 0;
      for await (const frame of decodeFrames(response.body)) {
        if (frame.type === "stage") setMessage(t.generatingProgress.replace("{0}", String(frame.produced)).replace("{1}", String(frame.requested)));
        else if (frame.type === "item") { produced++; setMessage(t.generatingProgress.replace("{0}", String(produced)).replace("{1}", String(paper.blueprint.sections.reduce((sum, section) => sum + section.questionCount, 0)))); }
        else if (frame.type === "complete") { settled = true; paperGenerationKey.current = null; const result = paperDataSchema.parse(frame.paper); changePaper({ ...result, coverageSection: paper.coverageSection, resources: paper.resources }); setMessage(t.draftOnly); }
        else if (frame.type === "cancelled") { settled = true; paperGenerationKey.current = null; setMessage(t.generationCancelled); }
        else if (frame.type === "error") { settled = true; paperGenerationKey.current = null; setMessage(frame.reason === "PROVIDER_UNAVAILABLE" ? prototypeCopy(locale).liveUnavailable : t.failure); }
      }
      if (!settled) await recoverUnsettled();
    } catch (error) {
      if (started && !settled) await recoverUnsettled();
      else setMessage(controller.signal.aborted ? t.generationCancelled : error instanceof Error ? error.message : t.failure);
    }
    finally { generationAbort.current = null; setCancellable(false); setBusy(false); }
  };
  const readiness = () => {
    const errors = curriculum ? validateCurriculumApproval(curriculum) : paper && linked ? validatePaperApproval(paper, linked) : [t.chooseCurriculum];
    setIssues(errors); setMessage(errors.length ? "" : t.ready);
  };
  const updateQuestion = (index: number, update: Partial<Question>) => { if (paper) changePaper({ ...paper, questions: paper.questions.map((question, i) => i === index ? { ...question, ...update } : question) }); };
  const addQuestion = (section: Blueprint["sections"][number]) => {
    if (!paper) return;
    changePaper({ ...paper, questions: [...paper.questions, { id: uid(), sectionId: section.id, type: section.type, prompt: "", marks: section.marksPerQuestion, options: ["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(section.type) ? [{ id: uid(), text: "" }, { id: uid(), text: "" }] : [], correctOptionId: null, modelAnswer: "", rubric: [{ id: uid(), criterion: "", marks: section.marksPerQuestion }], outcomeIds: [...section.outcomeIds], sourceRefs: [], locked: false }] });
  };
  const print = async () => {
    if (!paper || !selected || selected.status !== "APPROVED" || dirty || busy) return;
    // Reserve the window during the user's gesture. The server supplies only
    // the current, permission-checked approved candidate projection.
    const popup = window.open("", "_blank", "popup");
    if (!popup) { setMessage(t.printBlocked); return; }
    popup.opener = null;
    popup.document.body.textContent = t.preview;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/school-ai/workspace/${encodeURIComponent(selected.id)}/print?version=${selected.version}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(errorMessage(payload, t.failure));
      }
      const html = await response.text();
      if (popup.closed) return;
      popup.document.open(); popup.document.write(html); popup.document.close();
      await popup.document.fonts.ready;
      if (!popup.closed) { popup.focus(); popup.print(); }
    } catch (error) {
      popup.close(); setMessage(error instanceof Error && error.name !== "TimeoutError" ? error.message : t.failure);
    } finally { setBusy(false); }
  };

  return <section dir={locale === "en" ? "ltr" : "rtl"} className="space-y-5" aria-label={t.title}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{t.title}</h2><p className="mt-1 max-w-3xl text-sm text-ink-subtle">{t.intro}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !canCreate} onClick={newCurriculum}><BookOpen />{t.newCurriculum}</Button><Button variant="outline" disabled={busy || !canCreate} onClick={() => newPaper()}><FileText />{t.newPaper}</Button></div></div>
    <FormField name="assessment-record" label={t.select}><Select value={selected?.id ?? ""} disabled={busy} onChange={(event) => { const record = records.find((item) => item.id === event.target.value); if (record) loadRecord(record); }}><option value="">{t.select}</option>{records.filter((record) => ["CURRICULUM", "PAPER"].includes(record.kind)).map((record) => <option key={record.id} value={record.id}>{record.title} · v{record.version} · {record.status}</option>)}</Select></FormField>
    {message && <p role="status" className="sk-panel p-3 text-sm">{message}</p>}
    {busy && cancellable && <Button variant="outline" onClick={() => generationAbort.current?.abort()} data-cancel-generation>{t.cancelGeneration}</Button>}
    {issues.length > 0 && <div role="alert" className="rounded-xl border border-status-error-border bg-status-error-surface p-4 text-sm text-status-error-text"><p className="font-semibold">{t.invalid}</p><ul className="mt-2 list-disc space-y-1 ps-5">{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
    {!curriculum && !paper && <p className="sk-panel p-8 text-center text-ink-subtle">{records.some(record => ["CURRICULUM", "PAPER"].includes(record.kind)) ? prototypeCopy(locale).selectSaved : t.empty}</p>}
    {(curriculum || paper) && <>
      {readonly && <div className="sk-panel flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm">{t.readonly}</p><Button variant="outline" disabled={!canCreate || busy} onClick={() => { if (paper) setPaper(revisedDraftFrom(paper)); setSelected(null); setDirty(true); idempotencyKey.current = uid(); }}>{t.clone}</Button></div>}
      <fieldset disabled={readonly || busy} className="space-y-5">
        {curriculum && <>
          <div className="sk-panel grid gap-4 p-5 md:grid-cols-2"><TextField name="curriculum-title" label={t.curriculum} value={title} onChange={(value) => { setTitle(value); setDirty(true); }} /><FormField name="curriculum-subject" label={t.subject}><Select value={curriculum.subjectId} onChange={(event) => { const subject = subjects.find((item) => item.id === event.target.value); if (subject) changeCurriculum({ ...curriculum, subjectId: subject.id, classId: subject.classId }); }}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} · {subject.className}</option>)}</Select></FormField><TextField name="curriculum-year" label={t.year} value={curriculum.academicYear} onChange={(value) => changeCurriculum({ ...curriculum, academicYear: value })} /><TextField name="curriculum-board" label={t.board} value={curriculum.board} onChange={(value) => changeCurriculum({ ...curriculum, board: value })} /></div>
          <div className="sk-panel space-y-4 p-5"><h3 className="font-bold">{t.sources}</h3><p className="text-sm text-ink-subtle">{t.sourceHelp}</p>{curriculum.sources.map((source, index) => {
            const update = (next: Partial<CurriculumData["sources"][number]>) => changeCurriculum({ ...curriculum, sources: curriculum.sources.map((item, i) => i === index ? { ...item, ...next } : item) });
            return <div key={source.id} className="space-y-3 border-b border-border pb-5"><div className="grid gap-3 md:grid-cols-2"><TextField name={`source-${source.id}`} label={t.sourceTitle} value={source.title} onChange={(value) => update({ title: value, approved: false })} /><FormField name={`source-kind-${source.id}`} label={t.sourceKind}><Select value={source.kind} onChange={(event) => update({ kind: event.target.value as typeof source.kind, approved: false })}><option value="SYLLABUS">{t.syllabus}</option><option value="TEXTBOOK">{t.textbook}</option><option value="PAST_PAPER">{t.pastPaper}</option><option value="TEACHER_PLAN">{t.teacherPlan}</option></Select></FormField></div><TextField name={`edition-${source.id}`} label={extension.edition} value={source.edition ?? ""} onChange={value => update({ edition: value || undefined, approved: false })} /><FormField name={`effective-${source.id}`} label={extension.effective}><Input type="date" value={source.effectiveFrom ?? ""} onChange={event => update({ effectiveFrom: event.target.value || undefined, approved: false })} /></FormField><TextField name={`reference-${source.id}`} label={t.reference} value={source.reference} onChange={(value) => update({ reference: value, approved: false })} /><TextField name={`excerpt-${source.id}`} label={t.excerpt} value={source.excerpt} long maxLength={30000} onChange={(value) => update({ excerpt: value, approved: false })} /><div className="flex flex-wrap items-center justify-between gap-2"><Toggle label={t.sourceApproved} checked={source.approved} onChange={(value) => update({ approved: value })} /><Button variant="ghost" onClick={() => changeCurriculum({ ...curriculum, sources: curriculum.sources.filter((item) => item.id !== source.id) })}>{t.remove}</Button></div></div>;
          })}<Button variant="outline" disabled={curriculum.sources.length >= 30} onClick={() => changeCurriculum({ ...curriculum, sources: [...curriculum.sources, { id: uid(), title: "", kind: "SYLLABUS", reference: "", excerpt: "", approved: false }] })}><Plus />{t.addSource}</Button></div>
          <div className="sk-panel space-y-4 p-5"><h3 className="font-bold">{t.outcomes}</h3>{curriculum.outcomes.map((outcome, index) => {
            const update = (next: Partial<CurriculumData["outcomes"][number]>) => changeCurriculum({ ...curriculum, outcomes: curriculum.outcomes.map((item, i) => i === index ? { ...item, ...next } : item) });
            return <div key={outcome.id} className="space-y-3 border-b border-border pb-4"><TextField name={`outcome-${outcome.id}`} label={t.outcome} value={outcome.title} onChange={(value) => update({ title: value })} /><div className="grid gap-3 md:grid-cols-2"><FormField name={`outcome-source-${outcome.id}`} label={t.source}><Select value={outcome.sourceId} onChange={(event) => update({ sourceId: event.target.value })}><option value="">{t.select}</option>{curriculum.sources.map((source) => <option key={source.id} value={source.id}>{source.title || t.source}</option>)}</Select></FormField><TextField name={`outcome-page-${outcome.id}`} label={t.page} value={outcome.sourcePage} onChange={(value) => update({ sourcePage: value })} /></div><div className="flex flex-wrap gap-4"><Toggle label={t.taught} checked={outcome.taught} onChange={(value) => update({ taught: value })} /><Toggle label={t.included} checked={outcome.included} onChange={(value) => update({ included: value })} /><Button variant="ghost" onClick={() => changeCurriculum({ ...curriculum, outcomes: curriculum.outcomes.filter((item) => item.id !== outcome.id) })}>{t.remove}</Button></div></div>;
          })}<Button variant="outline" disabled={!curriculum.sources.length || curriculum.outcomes.length >= 200} onClick={() => changeCurriculum({ ...curriculum, outcomes: [...curriculum.outcomes, { id: uid(), title: "", sourceId: curriculum.sources[0]?.id ?? "", sourcePage: "", taught: false, included: true }] })}><Plus />{t.addOutcome}</Button></div>
        </>}
        {curriculum && <CurriculumCoverage value={curriculum} locale={locale} onChange={changeCurriculum} />}
        {curriculum && <LearningPlanEditor value={curriculum} locale={locale} onChange={changeCurriculum} />}
        {paper && <>
          <PaperResources value={paper} curriculum={linked} locale={locale} onChange={changePaper} />
          <div className="sk-panel space-y-4 p-5"><p className="text-sm text-ink-subtle">{linkedRecord?.title} · v{paper.curriculumVersion}</p><TextField name="paper-title" label={t.paperTitle} value={paper.blueprint.title} onChange={(value) => changePaper({ ...paper, blueprint: { ...paper.blueprint, title: value } })} /><div className="grid gap-4 md:grid-cols-3"><NumberField name="paper-duration" label={t.duration} value={paper.blueprint.durationMinutes} max={480} onChange={(value) => changePaper({ ...paper, blueprint: { ...paper.blueprint, durationMinutes: value } })} /><NumberField name="paper-marks" label={t.marks} value={paper.blueprint.totalMarks} onChange={(value) => changePaper({ ...paper, blueprint: { ...paper.blueprint, totalMarks: value } })} /><FormField name="paper-language" label={t.paperLanguage}><Select value={paper.language} onChange={(event) => changePaper({ ...paper, language: event.target.value as AssessmentLocale })}><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option></Select></FormField></div><TextField name="paper-instructions" label={t.instructions} value={paper.blueprint.instructions} long maxLength={6000} onChange={(value) => changePaper({ ...paper, blueprint: { ...paper.blueprint, instructions: value } })} /></div>
          <div className="sk-panel space-y-4 p-5"><h3 className="font-bold">{t.sections}</h3><p className="text-sm text-ink-subtle">{t.optional}</p>{paper.blueprint.sections.map((section, index) => {
            const update = (next: Partial<typeof section>) => changePaper({ ...paper, blueprint: { ...paper.blueprint, sections: paper.blueprint.sections.map((item, i) => i === index ? { ...item, ...next } : item) } });
            return <div key={section.id} className="space-y-3 border-b border-border pb-5"><div className="grid gap-3 md:grid-cols-2"><TextField name={`section-${section.id}`} label={t.section} value={section.title} onChange={(value) => update({ title: value })} /><FormField name={`type-${section.id}`} label={t.type}><Select value={section.type} onChange={(event) => update({ type: event.target.value as typeof section.type })}><option value="SINGLE_CHOICE">{t.single}</option><option value="SHORT_TEXT">{t.short}</option><option value="EXTENDED_TEXT">{t.extended}</option><AdvancedQuestionOptions locale={locale} /></Select></FormField></div><div className="grid gap-3 md:grid-cols-3"><NumberField name={`count-${section.id}`} label={t.count} value={section.questionCount} max={100} onChange={(value) => update({ questionCount: value })} /><NumberField name={`answer-count-${section.id}`} label={t.answerCount} value={section.answerCount} max={100} onChange={(value) => update({ answerCount: value })} /><NumberField name={`marks-${section.id}`} label={t.perQuestion} value={section.marksPerQuestion} min={0.25} step={0.25} max={100} onChange={(value) => update({ marksPerQuestion: value })} /></div><fieldset><legend className="mb-2 text-sm font-semibold">{t.selectOutcome}</legend>{linked?.outcomes.filter((outcome) => outcome.included && outcome.taught).map((outcome) => <Toggle key={outcome.id} label={outcome.title} checked={section.outcomeIds.includes(outcome.id)} onChange={(checked) => update({ outcomeIds: checked ? [...section.outcomeIds, outcome.id] : section.outcomeIds.filter((id) => id !== outcome.id) })} />)}</fieldset><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={paper.questions.length >= 100} onClick={() => addQuestion(section)}><Plus />{t.addQuestion}</Button><Button variant="ghost" disabled={paper.blueprint.sections.length <= 1 || paper.questions.some((question) => question.sectionId === section.id)} onClick={() => changePaper({ ...paper, blueprint: { ...paper.blueprint, sections: paper.blueprint.sections.filter((item) => item.id !== section.id) } })}>{t.remove}</Button></div></div>;
          })}<Button variant="outline" disabled={paper.blueprint.sections.length >= 20} onClick={() => changePaper({ ...paper, blueprint: { ...paper.blueprint, sections: [...paper.blueprint.sections, { id: uid(), title: "", questionCount: 1, answerCount: 1, marksPerQuestion: 1, type: "SHORT_TEXT", outcomeIds: [] }] } })}><Plus />{t.addSection}</Button><div className="border-t border-border pt-4"><Button disabled={!linked || busy} onClick={generate}><Sparkles />{busy ? t.generating : t.generate}</Button><p className="mt-2 text-sm text-ink-subtle">{t.draftOnly}</p></div></div>
          {linked && <CoverageGaps paper={paper} curriculum={linked} locale={locale} />}
          {!readonly && linked && linkedRecord?.campusId && <QuestionBank key={`${paper.curriculumId}:${selected?.id ?? "new"}`} paper={paper} curriculum={linked} campusId={linkedRecord.campusId} locale={locale} onReuse={changePaper} onBusyChange={setBusy} />}
          {paper.questions.map((question, index) => <div key={question.id} className="sk-panel space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{t.question} {index + 1} · {paper.blueprint.sections.find((section) => section.id === question.sectionId)?.title}</h3><Toggle label={t.locked} checked={question.locked} onChange={(value) => updateQuestion(index, { locked: value })} /></div><TextField name={`question-${question.id}`} label={t.prompt} value={question.prompt} long maxLength={12000} onChange={(value) => updateQuestion(index, { prompt: value })} /><PaperFigureEditor key={`figures:${selected?.id??paper.curriculumId}:${question.id}`} paper={paper} question={question} records={records} locale={locale} onChange={figures => updateQuestion(index, { figures })} /><NumberField name={`question-marks-${question.id}`} label={t.fieldMarks} value={question.marks} min={0.25} max={100} step={0.25} onChange={(value) => updateQuestion(index, { marks: value })} />
            <QuestionBankLabels key={`${selected?.id ?? "new"}:${question.id}`} question={question} locale={locale} onChange={(next) => updateQuestion(index, next)} />
            {["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(question.type) && <div className="space-y-3">{question.options.map((option, optionIndex) => <TextField key={option.id} name={`option-${option.id}`} label={`${t.options} ${optionIndex + 1}`} value={option.text} onChange={(value) => updateQuestion(index, { options: question.options.map((item) => item.id === option.id ? { ...item, text: value } : item) })} />)}<Button variant="outline" disabled={question.options.length >= 8} onClick={() => updateQuestion(index, { options: [...question.options, { id: uid(), text: "" }] })}>{t.addOption}</Button>{question.type === "SINGLE_CHOICE" && <FormField name={`answer-${question.id}`} label={t.answerKey}><Select value={question.correctOptionId ?? ""} onChange={(event) => updateQuestion(index, { correctOptionId: event.target.value || null })}><option value="">{t.select}</option>{question.options.map((option, optionIndex) => <option key={option.id} value={option.id}>{optionIndex + 1}. {option.text}</option>)}</Select></FormField>}</div>}
            <AdvancedQuestionKey question={question} locale={locale} onChange={next => updateQuestion(index, next)} />
            <TextField name={`model-${question.id}`} label={t.modelAnswer} value={question.modelAnswer} long maxLength={12000} onChange={(value) => updateQuestion(index, { modelAnswer: value })} /><fieldset><legend className="mb-2 font-semibold">{t.rubric}</legend><div className="space-y-3">{question.rubric.map((criterion, criterionIndex) => <div key={criterion.id} className="grid items-end gap-3 md:grid-cols-[1fr_8rem_auto]"><TextField name={`criterion-${criterion.id}`} label={t.criterion} value={criterion.criterion} onChange={(value) => updateQuestion(index, { rubric: question.rubric.map((item, i) => i === criterionIndex ? { ...item, criterion: value } : item) })} /><NumberField name={`criterion-marks-${criterion.id}`} label={t.fieldMarks} value={criterion.marks} min={0.25} max={100} step={0.25} onChange={(value) => updateQuestion(index, { rubric: question.rubric.map((item, i) => i === criterionIndex ? { ...item, marks: value } : item) })} /><Button variant="ghost" onClick={() => updateQuestion(index, { rubric: question.rubric.filter((item) => item.id !== criterion.id) })}>{t.remove}</Button></div>)}<Button variant="outline" disabled={question.rubric.length >= 30} onClick={() => updateQuestion(index, { rubric: [...question.rubric, { id: uid(), criterion: "", marks: 1 }] })}>{t.addCriterion}</Button></div></fieldset>
            <fieldset><legend className="mb-2 text-sm font-semibold">{t.outcomes}</legend>{linked?.outcomes.filter((outcome) => paper.blueprint.sections.find((section) => section.id === question.sectionId)?.outcomeIds.includes(outcome.id)).map((outcome) => <Toggle key={outcome.id} label={outcome.title} checked={question.outcomeIds.includes(outcome.id)} onChange={(checked) => updateQuestion(index, { outcomeIds: checked ? [...question.outcomeIds, outcome.id] : question.outcomeIds.filter((id) => id !== outcome.id) })} />)}</fieldset>
            <fieldset className="space-y-3"><legend className="mb-2 font-semibold">{t.evidence}</legend><p className="text-sm text-ink-subtle">{t.noEvidence}</p>{question.sourceRefs.map((ref, refIndex) => <div key={refIndex} className="space-y-3 border-b border-border pb-3"><div className="grid gap-3 md:grid-cols-2"><FormField name={`ref-${question.id}-${refIndex}`} label={t.source}><Select value={ref.sourceId} onChange={(event) => updateQuestion(index, { sourceRefs: question.sourceRefs.map((item, i) => i === refIndex ? { ...item, sourceId: event.target.value } : item) })}>{sourceOptions.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</Select></FormField><TextField name={`ref-page-${question.id}-${refIndex}`} label={t.page} value={ref.page} onChange={(value) => updateQuestion(index, { sourceRefs: question.sourceRefs.map((item, i) => i === refIndex ? { ...item, page: value } : item) })} /></div><TextField name={`ref-text-${question.id}-${refIndex}`} label={t.excerpt} value={ref.excerpt} long maxLength={3000} onChange={(value) => updateQuestion(index, { sourceRefs: question.sourceRefs.map((item, i) => i === refIndex ? { ...item, excerpt: value } : item) })} /><Button variant="ghost" onClick={() => updateQuestion(index, { sourceRefs: question.sourceRefs.filter((_, i) => i !== refIndex) })}>{t.remove}</Button></div>)}<Button variant="outline" disabled={!sourceOptions.length || question.sourceRefs.length >= 20} onClick={() => updateQuestion(index, { sourceRefs: [...question.sourceRefs, { sourceId: sourceOptions[0].id, page: "", excerpt: "" }] })}>{t.addSource}</Button></fieldset>
            <Button variant="ghost" onClick={() => changePaper({ ...paper, questions: paper.questions.filter((item) => item.id !== question.id) })}>{t.remove} · {t.question}</Button>
          </div>)}
        </>}
      </fieldset>
      {curriculum && <LearningTools key={`learning:${selected?.id ?? "draft"}:${selected?.version ?? 0}`} record={selected} curriculum={curriculum} locale={locale} disabled={dirty || !canCreate || busy || (curriculum.lessonPlans?.length ?? 0) >= 50} onGenerated={plan => { setSelected(null); idempotencyKey.current = uid(); changeCurriculum({ ...curriculum, lessonPlans: [...(curriculum.lessonPlans ?? []).filter(row => row.id !== plan.id), plan] }); setMessage(learningCopy(locale).newDraft); }} />}
      {/* SKO-414: groups, assignment drafts, lesson records and copying work on the saved version. */}
      {curriculum && selected?.kind === "CURRICULUM" && !dirty && <LessonPlanActions curriculumId={selected.id} planIds={(curriculum.lessonPlans ?? []).map(plan => plan.id)} titles={Object.fromEntries((curriculum.lessonPlans ?? []).map(plan => [plan.id, plan.title]))} targets={curricula.map(record => ({ id: record.id, title: record.title, version: record.version }))} />}
      {paper && selected && kind === "PAPER" && !dirty && <ExamReleasePanel key={`release:${selected.id}:${selected.version}`} recordId={selected.id} locale={locale} canApprove={canApprove} disabled={!canCreate || busy} onChanged={async () => {
        // Review decisions write a new server version; reopen it so the editor never saves over them.
        const response = await fetch(`/api/school-ai/workspace/${encodeURIComponent(selected.id)}`, { cache: "no-store" }); const payload = await response.json();
        if (response.ok) loadRecord(payload.record ?? payload.data); await onRefresh();
      }} />}
      {paper && <PaperSemanticReview key={`semantics:${selected?.id ?? "draft"}:${selected?.version ?? 0}`} record={selected} paper={paper} locale={locale} disabled={dirty || !canCreate || busy} />}
      {curriculum && selected?.status === "APPROVED" && <CurriculumExecution key={`execution:${selected.id}:${selected.version}`} record={selected} language={locale} canApply={canApprove} onApplied={onRefresh} />}
      <div className="sk-panel flex flex-wrap items-center gap-3 p-4"><Button disabled={busy || readonly} onClick={() => save()}><Save />{t.save}</Button><Button variant="outline" disabled={busy} onClick={readiness}>{t.validate}</Button><Button variant="outline" disabled={busy || readonly || dirty || !selected} onClick={() => save("review")}>{t.submitReview}</Button>{canApprove && selected?.status === "IN_REVIEW" && <Button disabled={busy || dirty} onClick={approve}>{t.approve}</Button>}{paper && <Button variant="outline" disabled={busy || selected?.status !== "APPROVED" || dirty} onClick={print}><Printer />{t.print}</Button>}{dirty && <span className="text-sm text-ink-subtle">{t.unsaved}</span>}</div>{paper && <p className="text-sm text-ink-subtle">{t.printHint}</p>}
    </>}
  </section>;
}
