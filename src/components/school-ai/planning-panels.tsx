"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ClipboardList, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { TaskStatus } from "@/components/ui/task-patterns";
import { schoolAICopy, interpolateAI } from "@/lib/school-ai/copy";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord, PolicyData, WorkflowData } from "@/lib/school-ai/types";
import { workspaceErrorText, type SaveRecord, type RecordAction } from "./workspace-client";
import styles from "./school-ai.module.css";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { isAcademicSetupPlan } from "./academic-setup-panel";
import { isTimetableSetupPlan } from "./timetable-setup-panel";

interface PanelProps { language: Language; records: AiWorkspaceRecord[]; canCreate: boolean; canApprove: boolean; onSave: SaveRecord; onAction: RecordAction }
export function PolicyPanel({ language, records, canCreate, canApprove, onSave, onAction }: PanelProps) {
  const c = schoolAICopy(language);
  const guard = useWorkspaceDraftNavigation();
  const [selection, setSelection] = useState<string | null>(null);
  const policies = records.filter(record => record.kind === "POLICY" && record.status !== "ARCHIVED");
  const selected = policies.find(record => record.id === selection);
  return <section className={`sk-panel ${styles.panel}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className={styles.sectionTitle}>{c.policiesTitle}</h2><p className={styles.description}>{c.policiesHint}</p></div>{canCreate && <Button variant="outline" onClick={() => guard(() => setSelection("new"))}><Plus aria-hidden="true" />{c.addPolicy}</Button>}</div>
    <div className={styles.sourceGrid}><div className={styles.recordList}>{!policies.length && <div className={styles.empty}><ShieldCheck className="mx-auto mb-3 size-8 text-primary" aria-hidden="true" /><p>{c.noPolicies}</p></div>}{policies.map(record => <Button key={record.id} variant="choice" aria-pressed={selection === record.id} onClick={() => guard(() => setSelection(record.id))} className="justify-start text-start"><span><span className="block">{record.title}</span><span className="mt-1 block text-xs font-medium">{c[record.status]}</span></span></Button>)}</div>
      {selected || selection === "new" ? <PolicyEditor key={selected ? `${selected.id}:${selected.version}` : "new"} language={language} record={selected} canCreate={canCreate} canApprove={canApprove} onSave={onSave} onAction={onAction} onSaved={record => setSelection(record.id)} /> : <p className="p-6 text-sm text-ink-muted">{c.selectRecord}</p>}
    </div>
  </section>;
}
function PolicyEditor({ language, record, canCreate, canApprove, onSave, onAction, onSaved }: Omit<PanelProps, "records"> & { record?: AiWorkspaceRecord; onSaved: (record: AiWorkspaceRecord) => void }) {
  const c = schoolAICopy(language);
  const [title, setTitle] = useState(record?.title || "");
  const [data, setData] = useState<PolicyData>(() => record?.data as PolicyData || { scope: "school", mode: "approval_required", requiresApproval: true, instructions: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const dirty = !record || title !== record.title || JSON.stringify(data) !== JSON.stringify(record.data);
  useWorkspaceDraft(dirty && Boolean(record || title.trim() || data.instructions.trim()));
  const save = async (approve = false) => {
    if (!title.trim() || !data.instructions.trim()) { setError(c.required); return; }
    setBusy(true); setError("");
    try { const saved = dirty ? await onSave("POLICY", title, { ...data }, record, idempotencyKey) : record!; onSaved(approve ? await onAction(saved, "approve") : saved); }
    catch (error) { setError(workspaceErrorText(error, c)); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4"><FormField name="policy-title" label={c.title} required><Input maxLength={180} value={title} onChange={event => setTitle(event.target.value)} disabled={busy || !canCreate} /></FormField>
    <FormField name="policy-scope" label={c.policyScope}><Select value={data.scope} onChange={event => setData({ ...data, scope: event.target.value as PolicyData["scope"] })} disabled={busy || !canCreate}>{(["school", "academics", "finance", "communications"] as const).map(scope => <option key={scope} value={scope}>{scope === "communications" ? c.communicationLabel : c[scope]}</option>)}</Select></FormField>
    <FormField name="policy-mode" label={c.policyMode}><Select value={data.mode} onChange={event => setData({ ...data, mode: event.target.value as PolicyData["mode"] })} disabled={busy || !canCreate}>{(["draft_only", "approval_required"] as const).map(mode => <option key={mode} value={mode}>{c[mode]}</option>)}</Select></FormField>
    <FormField name="policy-instructions" label={c.instructions} hint={c.approvalAlways} required><Textarea maxLength={12000} rows={7} value={data.instructions} onChange={event => setData({ ...data, instructions: event.target.value })} disabled={busy || !canCreate} /></FormField>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap gap-2"><Button disabled={busy || !canCreate || !dirty} onClick={() => void save()}>{busy ? c.saving : c.save}</Button>{canApprove && <Button variant="outline" title={dirty ? c.reviewBeforeApproval : c.approve} disabled={busy || dirty || record?.status === "APPROVED"} onClick={() => void save(true)}><CheckCircle2 aria-hidden="true" />{c.approve}</Button>}</div>
  </div>;
}

export function WorkPanel({ language, records, canCreate, canApprove, onSave, onAction, scope, onOpenRecord, moduleHref }: PanelProps & { scope: { subjectId?: string; classId?: string }; onOpenRecord: (record: AiWorkspaceRecord) => void; moduleHref: (module: string) => string | undefined }) {
  const c = schoolAICopy(language);
  const guard = useWorkspaceDraftNavigation();
  const [selected, setSelected] = useState<string | null>(null);
  const work = records.filter(record => record.kind === "WORKFLOW" && !isAcademicSetupPlan(record) && !isTimetableSetupPlan(record) && (record.data.proposal as { operation?: string } | undefined)?.operation !== "communications.queue_announcement" && record.status !== "ARCHIVED");
  const review = records.filter(record => record.status === "IN_REVIEW");
  const current = work.find(record => record.id === selected);
  return <div className="space-y-5">
    {review.length > 0 && <section className={`sk-panel ${styles.panel}`}><h2 className={styles.sectionTitle}>{c.reviewCount}</h2>{review.map(record => <div className={styles.recordRow} key={record.id}><div><p className={styles.recordTitle}>{record.title}</p><p className="mt-1 text-xs text-ink-muted">{interpolateAI(c.version, { version: record.version })}</p></div><Button variant="outline" size="sm" onClick={() => guard(() => record.kind === "WORKFLOW" && !isAcademicSetupPlan(record) && !isTimetableSetupPlan(record) && (record.data.proposal as { operation?: string } | undefined)?.operation !== "communications.queue_announcement" ? setSelected(record.id) : onOpenRecord(record))}>{c.reviewRecord}</Button></div>)}</section>}
    <section className={`sk-panel ${styles.panel}`}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className={styles.sectionTitle}>{c.savedPlans}</h2>{canCreate && <Button variant="outline" onClick={() => guard(() => setSelected("new"))}><Plus aria-hidden="true" />{c.createBrief}</Button>}</div><p className={styles.notice}>{c.planningOnly}</p>
      <div className={`${styles.sourceGrid} mt-5`}><div className={styles.recordList}>{!work.length && <div className={styles.empty}><ClipboardList aria-hidden="true" className="mx-auto mb-3 size-8 text-primary" /><h3 className="font-bold">{c.noWork}</h3><p className={styles.description}>{c.noWorkHint}</p></div>}{work.map(record => <Button key={record.id} variant="choice" aria-pressed={selected === record.id} onClick={() => guard(() => setSelected(record.id))} className="justify-start text-start"><span><span className="block">{record.title}</span><span className="mt-1 block text-xs font-medium">{c[record.status]}</span></span></Button>)}</div>
        {current || selected === "new" ? <WorkEditor key={current ? `${current.id}:${current.version}` : "new"} language={language} record={current} scope={scope} canCreate={canCreate} canApprove={canApprove} onSave={onSave} onAction={onAction} onSaved={record => setSelected(record.id)} moduleHref={moduleHref} /> : <p className="p-6 text-sm text-ink-muted">{c.selectRecord}</p>}
      </div>
    </section>
  </div>;
}
function WorkEditor({ language, record, scope, canCreate, canApprove, onSave, onAction, onSaved, moduleHref }: Omit<PanelProps, "records"> & { record?: AiWorkspaceRecord; scope: { subjectId?: string; classId?: string }; onSaved: (record: AiWorkspaceRecord) => void; moduleHref: (module: string) => string | undefined }) {
  const c = schoolAICopy(language);
  const [title, setTitle] = useState(record?.title || "");
  const [data, setData] = useState<WorkflowData>(() => record?.data as WorkflowData || { goal: "", steps: [], sourceIds: [], missingInformation: [], ...scope });
  const [missingText, setMissingText] = useState(() => (record?.data as WorkflowData | undefined)?.missingInformation.join("\n") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const plannedData = { ...data, missingInformation: missingText.split("\n").map(line => line.trim()).filter(Boolean) };
  const dirty = !record || title !== record.title || JSON.stringify(plannedData) !== JSON.stringify(record.data);
  useWorkspaceDraft(dirty && Boolean(record || title.trim() || data.goal.trim()));
  const save = async (approve = false, review = false) => {
    if (!title.trim() || !data.goal.trim() || data.steps.some(step => !step.title.trim())) { setError(c.required); return; }
    if ((approve || review) && (plannedData.missingInformation.length || !data.steps.length || data.steps.some(step => step.status === "blocked"))) { setError(c.resolveBeforeApproval); return; }
    setBusy(true); setError("");
    try { const saved = dirty ? await onSave("WORKFLOW", title, plannedData, record, idempotencyKey) : record!; onSaved(approve || review ? await onAction(saved, approve ? "approve" : "review") : saved); }
    catch (error) { setError(workspaceErrorText(error, c)); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4"><FormField name="workflow-title" label={c.title} required><Input value={title} maxLength={180} disabled={busy || !canCreate} onChange={event => setTitle(event.target.value)} /></FormField><FormField name="workflow-goal" label={c.goal} required><Textarea value={data.goal} maxLength={4000} rows={4} disabled={busy || !canCreate} onChange={event => setData({ ...data, goal: event.target.value })} /></FormField>
    {data.steps.map((step, index) => { const href = step.module ? moduleHref(step.module) : undefined; return <div className="sk-panel space-y-3 p-4" key={step.id}><FormField name={`step-${step.id}`} label={`${index + 1}. ${c.title}`}><Input value={step.title} maxLength={500} disabled={busy || !canCreate} onChange={event => setData({ ...data, steps: data.steps.map((item, position) => position === index ? { ...item, title: event.target.value } : item) })} /></FormField><FormField name={`step-status-${step.id}`} label={c.stepStatus}><Select value={step.status} disabled={busy || !canCreate} onChange={event => setData({ ...data, steps: data.steps.map((item, position) => position === index ? { ...item, status: event.target.value as WorkflowData["steps"][number]["status"] } : item) })}>{(["proposed", "blocked", "ready"] as const).map(status => <option key={status} value={status}>{c[status]}</option>)}</Select></FormField><div className="flex flex-wrap items-center justify-between gap-2"><TaskStatus attention={step.status === "blocked"}>{c[step.status]}</TaskStatus><Button variant="ghost" size="sm" disabled={busy || !canCreate} onClick={() => setData({ ...data, steps: data.steps.filter(item => item.id !== step.id) })}><Trash2 aria-hidden="true" />{c.removeStep}</Button>{href && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href}>{c.openModule}<ArrowUpRight aria-hidden="true" /></Link>}</div></div>; })}
    {canCreate && <Button variant="outline" disabled={busy || data.steps.length >= 30} onClick={() => setData({ ...data, steps: [...data.steps, { id: crypto.randomUUID(), title: "", status: "proposed" }] })}><Plus aria-hidden="true" />{c.addStep}</Button>}
    <FormField name="workflow-missing" label={c.missing} hint={c.resolveInformation}><Textarea value={missingText} maxLength={50000} rows={3} disabled={busy || !canCreate} onChange={event => setMissingText(event.target.value)} /></FormField>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap gap-2"><Button disabled={busy || !canCreate || !dirty} onClick={() => void save()}>{busy ? c.saving : c.save}</Button>{canApprove && <Button variant="outline" title={dirty ? c.reviewBeforeApproval : c.approve} disabled={busy || dirty || record?.status === "APPROVED"} onClick={() => void save(true)}><CheckCircle2 aria-hidden="true" />{c.approve}</Button>}{canCreate && !canApprove && <Button variant="outline" disabled={busy || dirty || record?.status !== "DRAFT"} onClick={() => void save(false, true)}>{c.submitReview}</Button>}</div>
  </div>;
}
