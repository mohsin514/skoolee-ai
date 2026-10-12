"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Eye, FileCheck2, Loader2, Play, Plus, RefreshCw, School, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TaskStatus } from "@/components/ui/task-patterns";
import type { Language } from "@/lib/locale/package";
import { interpolateAI, schoolAICopy } from "@/lib/school-ai/copy";
import { academicSetupProposalSchema, type AcademicSetupExecutionReceipt, type AcademicSetupPreview, type AcademicSetupProposal } from "@/lib/school-ai/academic-setup";
import type { AiWorkspaceRecord, WorkspaceCapabilities, WorkflowData } from "@/lib/school-ai/types";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { workspaceErrorText, workspaceRequest, type RecordAction } from "./workspace-client";
import styles from "./school-ai.module.css";

export function isAcademicSetupPlan(record: AiWorkspaceRecord): record is AiWorkspaceRecord<"WORKFLOW"> {
  return record.kind === "WORKFLOW" && (record.data.proposal as { operation?: string } | undefined)?.operation === "academics.setup_year";
}

interface AcademicPanelProps {
  language: Language;
  records: AiWorkspaceRecord[];
  campuses: WorkspaceCapabilities["campuses"];
  campusId?: string | null;
  initialRecordId?: string | null;
  canCreate: boolean;
  canApprove: boolean;
  canApply: boolean;
  onRecord: (record: AiWorkspaceRecord) => void;
  onAction: RecordAction;
}

export function AcademicSetupPanel(props: AcademicPanelProps) {
  const { language, records, canCreate } = props;
  const c = schoolAICopy(language);
  const guard = useWorkspaceDraftNavigation();
  const plans = records.filter(isAcademicSetupPlan).filter(record => record.status !== "ARCHIVED");
  const [selection, setSelection] = useState<string | null>(() => plans.find(record => record.id === props.initialRecordId)?.id || plans[0]?.id || null);
  const [newDraft, setNewDraft] = useState(0);
  const selected = plans.find(record => record.id === selection);
  return <section className={`sk-panel ${styles.panel}`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl"><h2 className={styles.sectionTitle}>{c.academicSetupTitle}</h2><p className={styles.description}>{c.academicSetupHint}</p></div>
      {canCreate && <Button variant="outline" onClick={() => guard(() => { setNewDraft(value => value + 1); setSelection("new"); })}><Plus aria-hidden="true" />{c.newAcademicPlan}</Button>}
    </div>
    <div className={styles.sourceGrid}>
      <aside className={styles.recordList} aria-label={c.savedPlans}>
        {!plans.length && <div className={styles.empty}><School aria-hidden="true" className="mx-auto mb-3 size-8 text-primary" /><p className="text-sm leading-relaxed text-ink-muted">{c.academicPlanEmpty}</p></div>}
        {plans.map(record => <Button key={record.id} variant="choice" aria-pressed={selection === record.id} className="justify-start text-start" onClick={() => { if (selection !== record.id) guard(() => setSelection(record.id)); }}>
          <span className="min-w-0"><span className="block break-words">{record.title}</span><span className="mt-1 block text-xs font-medium">{record.status === "APPROVED" ? c.approvedPlan : c[record.status]} · {interpolateAI(c.version, { version: record.version })}</span></span>
        </Button>)}
      </aside>
      {selected || selection === "new" ? <AcademicSetupEditor key={selected ? `${selected.id}:${selected.version}` : `new:${newDraft}`} {...props} record={selected} onSaved={record => { props.onRecord(record); setSelection(record.id); }} /> : <div className={`${styles.notice} self-start`}><FileCheck2 aria-hidden="true" className="mt-1 size-5 shrink-0" /><p>{c.planApprovalHint}</p></div>}
    </div>
  </section>;
}

type ClassDraft = AcademicSetupProposal["classes"][number];
interface AcademicForm { campusId: string; academicYear: string; label: string; startDate: string; endDate: string; classes: ClassDraft[] }
interface ExistingCycle { id: string; label: string; academicYear: number; startDate: string | null; endDate: string | null; status: string }

function AcademicSetupEditor({ language, record, campuses, campusId: defaultCampusId, canCreate, canApprove, canApply, onAction, onSaved }: Omit<AcademicPanelProps, "records"> & { record?: AiWorkspaceRecord<"WORKFLOW">; onSaved: (record: AiWorkspaceRecord) => void }) {
  const c = schoolAICopy(language);
  const existing = record?.data.proposal?.operation === "academics.setup_year" ? record.data.proposal : undefined;
  const [form, setForm] = useState<AcademicForm>(() => ({
    campusId: record?.campusId || defaultCampusId || (campuses.length === 1 ? campuses[0].id : ""),
    academicYear: String(existing?.academicYear || new Date().getFullYear()), label: existing?.label || "",
    startDate: existing?.startDate || "", endDate: existing?.endDate || "",
    classes: existing?.classes || [{ id: crypto.randomUUID(), name: "", section: null, teachingMode: "SINGLE" }],
  }));
  const [initial] = useState(() => JSON.stringify(form));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "review" | "approve" | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [cycles, setCycles] = useState<ExistingCycle[]>([]);
  const [cycleState, setCycleState] = useState<"loading" | "ready" | "failed">("loading");
  const [cycleReload, setCycleReload] = useState(0);
  const [saveKey] = useState(() => crypto.randomUUID());
  const editorRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(form) !== initial;
  const blocked = Boolean(record?.data.missingInformation.length || record?.data.steps.some(step => step.status === "blocked"));
  useWorkspaceDraft(dirty || Boolean(busy));

  useEffect(() => {
    if (!form.campusId) return;
    const controller = new AbortController();
    void workspaceRequest<{ data: ExistingCycle[] }>(`/api/academic-cycle?campusId=${encodeURIComponent(form.campusId)}`, { signal: controller.signal })
      .then(result => { setCycles(result.data.filter(cycle => cycle.status === "DRAFT" || cycle.status === "ACTIVE")); setCycleState("ready"); })
      .catch(() => { if (!controller.signal.aborted) setCycleState("failed"); });
    return () => controller.abort();
  }, [form.campusId, cycleReload]);

  const update = <K extends keyof AcademicForm>(key: K, value: AcademicForm[K]) => {
    setForm(previous => ({ ...previous, [key]: value })); setReviewed(false);
    setErrors(previous => Object.fromEntries(Object.entries(previous).filter(([path]) => path !== key && !path.startsWith(`${key}.`))));
  };
  const updateClass = (id: string, changes: Partial<ClassDraft>) => update("classes", form.classes.map(item => item.id === id ? { ...item, ...changes } : item));
  const selectCycle = (id: string) => {
    const cycle = cycles.find(item => item.id === id);
    if (!cycle) return;
    setForm(previous => ({ ...previous, academicYear: String(cycle.academicYear), label: cycle.label, startDate: cycle.startDate?.slice(0, 10) || "", endDate: cycle.endDate?.slice(0, 10) || "" }));
    setReviewed(false); setErrors({});
  };
  const selectedCycle = cycles.find(cycle => String(cycle.academicYear) === form.academicYear && cycle.label === form.label && (cycle.startDate?.slice(0, 10) || "") === form.startDate && (cycle.endDate?.slice(0, 10) || "") === form.endDate);
  const save = async () => {
    const proposal = academicSetupProposalSchema.safeParse({ operation: "academics.setup_year", academicYear: Number(form.academicYear), label: form.label, startDate: form.startDate || null, endDate: form.endDate || null, classes: form.classes.map(item => ({ ...item, section: item.section?.trim() || null })) });
    if (!proposal.success || !form.campusId) {
      setError(c.academicCheckProposal);
      setErrors({ ...(!form.campusId ? { campusId: c.chooseCampus } : {}), ...Object.fromEntries(proposal.success ? [] : proposal.error.issues.map(issue => [issue.path.join("."), c.academicInvalidField])) });
      requestAnimationFrame(() => editorRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy("save"); setError(""); setErrors({});
    const data: WorkflowData = { ...(record?.data || { goal: c.academicProposalGoal, steps: [{ id: "academic-setup", title: c.academicProposalStep, status: "ready", module: "academics" }], sourceIds: [], missingInformation: [] }), proposal: proposal.data };
    try {
      const result = await workspaceRequest<{ record: AiWorkspaceRecord }>(record ? `/api/school-ai/workspace/${encodeURIComponent(record.id)}` : "/api/school-ai/workspace", {
        method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record ? { version: record.version, title: proposal.data.label, data, action: "save" } : { kind: "WORKFLOW", title: proposal.data.label, campusId: form.campusId, data, idempotencyKey: saveKey }),
      });
      onSaved(result.record);
    } catch (cause) { setError(workspaceErrorText(cause, c)); }
    finally { setBusy(null); }
  };
  const changeStatus = async (action: "review" | "approve") => {
    if (!record || dirty || !reviewed || busy || blocked) return;
    setBusy(action); setError("");
    try { onSaved(await onAction(record, action)); }
    catch (cause) { setError(workspaceErrorText(cause, c)); }
    finally { setBusy(null); }
  };
  const disabled = !canCreate || Boolean(busy);
  return <div ref={editorRef} className="min-w-0 space-y-5" aria-busy={Boolean(busy)}>
    <div className={styles.notice}><FileCheck2 aria-hidden="true" className="mt-1 size-5 shrink-0" /><div><p className="font-bold">{record?.status === "APPROVED" ? c.approvedPlan : record ? c[record.status] : c.DRAFT}{record && ` · ${interpolateAI(c.version, { version: record.version })}`}</p><p>{c.planApprovalHint}</p>{dirty && <p className="mt-2 font-semibold">{c.unsavedAcademicEdits}</p>}</div></div>
    <FormField name="academic-campus" label={c.campus} required hint={record ? c.campusFixed : undefined} error={errors.campusId}><Select value={form.campusId} disabled={disabled || Boolean(record)} onChange={event => { setCycles([]); setCycleState("loading"); update("campusId", event.target.value); }}><option value="">{c.chooseCampus}</option>{campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select></FormField>
    {form.campusId && <div className="space-y-3">
      {cycleState === "loading" ? <p role="status" className="text-sm text-ink-muted">{c.loading}</p> : cycleState === "failed" ? <div className={styles.notice}><p className="flex-1">{c.academicCyclesUnavailable}</p><Button variant="ghost" size="icon" aria-label={c.retry} onClick={() => { setCycleState("loading"); setCycleReload(value => value + 1); }}><RefreshCw aria-hidden="true" /></Button></div> : cycles.length > 0 && <FormField name="existing-academic-year" label={c.existingAcademicCycle} hint={c.existingCycleHint}><Select value={selectedCycle?.id || ""} disabled={disabled} onChange={event => selectCycle(event.target.value)}><option value="">{c.enterAcademicYear}</option>{cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.label} · {cycle.status === "ACTIVE" ? c.activeAcademicCycle : c.DRAFT}</option>)}</Select></FormField>}
    </div>}
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <FormField name="academic-year-number" label={c.academicYearNumber} required error={errors.academicYear}><Input type="number" min={2000} max={2100} step={1} value={form.academicYear} disabled={disabled} onChange={event => update("academicYear", event.target.value)} /></FormField>
      <FormField name="academic-year-name" label={c.academicYearLabel} required error={errors.label}><Input value={form.label} maxLength={120} disabled={disabled} onChange={event => update("label", event.target.value)} /></FormField>
      <FormField name="academic-start-date" label={c.plannedStartDate} error={errors.startDate}><Input type="date" value={form.startDate} disabled={disabled} onChange={event => update("startDate", event.target.value)} /></FormField>
      <FormField name="academic-end-date" label={c.plannedEndDate} error={errors.endDate}><Input type="date" value={form.endDate} disabled={disabled} onChange={event => update("endDate", event.target.value)} /></FormField>
    </div>
    <p className="text-xs leading-relaxed text-ink-muted">{c.academicDateHint}</p>
    <fieldset className="min-w-0 space-y-4"><legend className="mb-3 font-bold">{c.academicClasses}</legend>
      {form.classes.map((item, index) => <div key={item.id} className="sk-panel min-w-0 space-y-3 p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{interpolateAI(c.classNumber, { number: index + 1 })}</h3><Button variant="ghost" size="icon" disabled={disabled || form.classes.length === 1} aria-label={interpolateAI(c.removeClass, { number: index + 1 })} onClick={() => update("classes", form.classes.filter(row => row.id !== item.id))}><Trash2 aria-hidden="true" /></Button></div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <FormField name={`class-name-${item.id}`} label={c.className} required error={errors[`classes.${index}.name`] || (index === 0 ? errors.classes : undefined)}><Input value={item.name} maxLength={80} disabled={disabled} onChange={event => updateClass(item.id, { name: event.target.value })} /></FormField>
          <FormField name={`class-section-${item.id}`} label={c.classSection} error={errors[`classes.${index}.section`]}><Input value={item.section || ""} maxLength={40} disabled={disabled} onChange={event => updateClass(item.id, { section: event.target.value || null })} /></FormField>
        </div>
        <FormField name={`class-mode-${item.id}`} label={c.teachingMode}><Select value={item.teachingMode} disabled={disabled} onChange={event => updateClass(item.id, { teachingMode: event.target.value as ClassDraft["teachingMode"] })}><option value="SINGLE">{c.singleTeaching}</option><option value="SUBJECT">{c.subjectTeaching}</option></Select></FormField>
      </div>)}
      {errors.classes && <p role="alert" className="text-sm text-destructive">{errors.classes}</p>}
      {canCreate && <Button variant="outline" disabled={disabled || form.classes.length >= 50} onClick={() => update("classes", [...form.classes, { id: crypto.randomUUID(), name: "", section: null, teachingMode: "SINGLE" }])}><Plus aria-hidden="true" />{c.addClass}</Button>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button disabled={disabled || !dirty && Boolean(record)} onClick={() => void save()}>{busy === "save" && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}{busy === "save" ? c.saving : c.save}</Button>
    {record && record.status !== "APPROVED" && <section className="space-y-3 border-t border-border-subtle pt-5">
      {dirty && <p className="text-sm text-ink-muted">{c.reviewBeforeApproval}</p>}
      {blocked && <p className="text-sm text-destructive">{c.resolveBeforeApproval}</p>}
      <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"><Checkbox className="mt-1" checked={reviewed} disabled={Boolean(busy) || dirty || blocked || !canApprove && !canCreate} onChange={event => setReviewed(event.target.checked)} /><span>{c.academicReviewConfirm}</span></label>
      {canApprove ? <Button variant="outline" disabled={Boolean(busy) || dirty || !reviewed || blocked} onClick={() => void changeStatus("approve")}><CheckCircle2 aria-hidden="true" />{c.approveAcademicPlan}</Button> : canCreate && <Button variant="outline" disabled={Boolean(busy) || dirty || !reviewed || blocked || record.status !== "DRAFT"} onClick={() => void changeStatus("review")}>{c.submitReview}</Button>}
    </section>}
    {record && <AcademicExecution record={record} language={language} dirty={dirty} campusName={campuses.find(item => item.id === record.campusId)?.name || c.unknown} canApply={canApply} />}
  </div>;
}

function AcademicExecution({ record, language, dirty, campusName, canApply }: { record: AiWorkspaceRecord<"WORKFLOW">; language: Language; dirty: boolean; campusName: string; canApply: boolean }) {
  const c = schoolAICopy(language);
  const [preview, setPreview] = useState<AcademicSetupPreview | null>(null);
  const [history, setHistory] = useState<AcademicSetupExecutionReceipt[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "failed">("loading");
  const [historyReload, setHistoryReload] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const key = useRef<string | null>(null);
  const url = `/api/school-ai/workspace/${encodeURIComponent(record.id)}/execute`;
  const receipt = history.find(item => item.version === record.version);
  useWorkspaceDraft(busy === "apply");
  useEffect(() => {
    const controller = new AbortController();
    void workspaceRequest<{ executions: { operation: string }[] }>(`${url}?history=1`, { signal: controller.signal }).then(result => {
      setHistory(result.executions.filter(item => item.operation === "academics.setup_year") as AcademicSetupExecutionReceipt[]); setHistoryState("ready");
    }).catch(() => { if (!controller.signal.aborted) setHistoryState("failed"); });
    return () => controller.abort();
  }, [url, historyReload]);
  const loadPreview = async () => {
    setBusy("preview"); setError(""); setPreviewError(false); setConfirmed(false); setPreview(null);
    try {
      const result = await workspaceRequest<{ preview: AcademicSetupPreview }>(`${url}?operation=academics.setup_year&version=${record.version}`);
      setPreview(result.preview); key.current = crypto.randomUUID();
    } catch (cause) { setError(workspaceErrorText(cause, c)); setPreviewError(true); }
    finally { setBusy(null); }
  };
  const apply = async () => {
    if (!preview || !confirmed || !key.current || busy || dirty) return;
    setBusy("apply"); setError("");
    try {
      const result = await workspaceRequest<{ execution: AcademicSetupExecutionReceipt }>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "academics.setup_year", version: record.version, previewHash: preview.previewHash, idempotencyKey: key.current }) });
      setHistory(previous => [result.execution, ...previous.filter(item => item.id !== result.execution.id)]); setHistoryState("ready"); setConfirmed(false);
    } catch (cause) { setError(workspaceErrorText(cause, c)); }
    finally { setBusy(null); }
  };
  return <section className="space-y-4 border-t border-border-subtle pt-5" aria-busy={Boolean(busy)}>
    {historyState === "loading" && <p role="status" className="text-sm text-ink-muted">{c.loading}</p>}
    {historyState === "failed" && <div className={styles.notice}><p className="flex-1">{c.applicationUnknown}</p><Button variant="ghost" size="icon" aria-label={c.retry} onClick={() => { setHistoryState("loading"); setHistoryReload(value => value + 1); }}><RefreshCw aria-hidden="true" /></Button></div>}
    {!receipt && history.length > 0 && <p className={styles.notice}>{c.previousVersionApplied}</p>}
    {receipt ? <div role="status" className={styles.notice}><CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0" /><div><h3 className="font-bold">{c.appliedToSchool}</h3><p>{c.academicAppliedHint}</p><p className="mt-2">{interpolateAI(c.classesCreated, { count: receipt.createdCount })} · {interpolateAI(c.classesKept, { count: receipt.keptCount })}</p><p className="mt-2 text-xs">{interpolateAI(c.appliedVersion, { version: receipt.version, date: new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(receipt.completedAt)) })}</p><p className="mt-1 break-all text-xs">{c.executionReceipt}: {receipt.id}</p></div></div> : record.status === "APPROVED" && canApply && <>
      <p className="text-sm leading-relaxed text-ink-muted">{c.academicExecutionLimits}</p>
      <Button variant="outline" disabled={Boolean(busy) || dirty || historyState !== "ready"} onClick={() => void loadPreview()}>{busy === "preview" ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <Eye aria-hidden="true" />}{c.previewChanges}</Button>
      {dirty && <p className="text-sm text-ink-muted">{c.reviewBeforeApproval}</p>}
      {preview && !dirty && <div className="space-y-4">
        <h3 className="font-bold">{c.academicPreviewTitle}</h3>
        <div className={styles.notice}><CalendarDays aria-hidden="true" className="mt-1 size-5 shrink-0" /><div><p className="font-bold">{preview.cycle.action === "CREATE" ? c.createAcademicCycle : c.keepAcademicCycle}</p><p className="break-words">{campusName} · {preview.cycle.label} · {preview.academicYear}</p><p>{preview.cycle.status === "ACTIVE" ? c.activeAcademicCycle : c.DRAFT}</p><p className="mt-2">{c.plannedStartDate}: {preview.cycle.startDate || c.unknown}<br />{c.plannedEndDate}: {preview.cycle.endDate || c.unknown}</p></div></div>
        <ClassPreview rows={preview.willCreate} language={language} retained={false} />
        <ClassPreview rows={preview.willKeep} language={language} retained />
        <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"><Checkbox className="mt-1" checked={confirmed} disabled={Boolean(busy)} onChange={event => setConfirmed(event.target.checked)} /><span>{c.confirmAcademicApply}</span></label>
        <Button disabled={!confirmed || Boolean(busy)} onClick={() => void apply()}>{busy === "apply" ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <Play aria-hidden="true" />}{busy === "apply" ? c.applyingAcademicPlan : c.applyAcademicPlan}</Button>
      </div>}
    </>}
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{previewError && <p className="text-xs leading-relaxed">{c.existingCycleHint}</p>}</div>}
  </section>;
}

function ClassPreview({ rows, language, retained }: { rows: AcademicSetupPreview["willCreate"]; language: Language; retained: boolean }) {
  const c = schoolAICopy(language);
  return <section className="sk-panel min-w-0 p-4"><h4 className="text-sm font-bold">{interpolateAI(retained ? c.classesToKeep : c.classesToCreate, { count: rows.length })}</h4>{retained && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{c.retainedClassHint}</p>}
    {rows.length > 0 && <ul className="mt-2 divide-y divide-border-subtle">{rows.map(item => <li key={item.proposalClassId} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="min-w-0 break-words text-sm font-semibold">{item.name}{item.section ? ` · ${item.section}` : ""}</span><TaskStatus>{item.teachingMode === "SINGLE" ? c.singleTeaching : c.subjectTeaching}</TaskStatus></li>)}</ul>}
  </section>;
}
