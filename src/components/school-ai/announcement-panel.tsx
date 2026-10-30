"use client";

import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonBar, SkeletonList } from "@/components/ui/skeleton";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Mail, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { TaskStatus } from "@/components/ui/task-patterns";
import type { Language } from "@/lib/locale/package";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { announcementProposalSchema, type AnnouncementProposal, type AnnouncementOptions, type AnnouncementPreview, type AnnouncementExecutionReceipt, type AnnouncementDeliveryList } from "@/lib/school-ai/announcements";
import type { AiWorkspaceRecord, WorkspaceCapabilities } from "@/lib/school-ai/types";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { WorkspaceRequestError, workspaceErrorText, workspaceRequest, type RecordAction } from "./workspace-client";
import { AnnouncementPreferencesPanel } from "./announcement-preferences-panel";
import { announcementChannelSchema } from "@/lib/school-ai/announcement-channel-contract";
import { announcementCopy } from "./announcement-copy";
import styles from "./school-ai.module.css";

const languages = ["en", "ar", "ur"] as const;
export function isAnnouncementPlan(record: AiWorkspaceRecord): record is AiWorkspaceRecord<"WORKFLOW"> { return record.kind === "WORKFLOW" && (record.data.proposal as { operation?: string } | undefined)?.operation === "communications.queue_announcement"; }
interface Props { language: Language; records: AiWorkspaceRecord[]; campuses: WorkspaceCapabilities["campuses"]; campusId?: string | null; initialRecordId?: string | null; canCreate: boolean; canApprove: boolean; canQueue: boolean; onRecord: (record: AiWorkspaceRecord) => void; onAction: RecordAction }

export function AnnouncementPanel(props: Props) {
  const t = announcementCopy(props.language), c = schoolAICopy(props.language), guard = useWorkspaceDraftNavigation();
  const plans = props.records.filter(isAnnouncementPlan).filter(record => record.status !== "ARCHIVED");
  const [selected, setSelected] = useState<string | null>(() => plans.find(record => record.id === props.initialRecordId)?.id || plans[0]?.id || null), [generation, setGeneration] = useState(0);
  const record = plans.find(item => item.id === selected);
  return <section className={`sk-panel ${styles.panel}`}><div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><h2 className={styles.sectionTitle}>{t.title}</h2><p className={styles.description}>{t.hint}</p></div>{props.canCreate && <Button variant="outline" onClick={() => guard(() => { setGeneration(value => value + 1); setSelected("new"); })}><Plus aria-hidden="true" />{t.newPlan}</Button>}</div>
    <div className={styles.sourceGrid}><aside className={styles.recordList} aria-label={c.savedPlans}>{!plans.length && <p className={styles.empty}>{t.empty}</p>}{plans.map(item => <Button key={item.id} variant="choice" className="justify-start text-start" aria-pressed={selected === item.id} onClick={() => guard(() => setSelected(item.id))}><span className="min-w-0 break-words">{item.title}<span className="mt-1 block text-xs">{c[item.status]} · {item.version}</span></span></Button>)}</aside>
      {record || selected === "new" ? <AnnouncementEditor key={record ? `${record.id}:${record.version}` : `new:${generation}`} {...props} record={record} onSaved={item => { props.onRecord(item); setSelected(item.id); }} /> : <p className={styles.notice}>{c.selectRecord}</p>}
    </div>
  </section>;
}

function AnnouncementEditor({ language, record, campusId, campuses, canCreate, canApprove, canQueue, onAction, onSaved }: Props & { record?: AiWorkspaceRecord<"WORKFLOW">; onSaved: (record: AiWorkspaceRecord) => void }) {
  const c = schoolAICopy(language), t = announcementCopy(language), existing = announcementProposalSchema.safeParse(record?.data.proposal);
  const [form, setForm] = useState(() => ({ campusId: record?.campusId || campusId || (campuses.length === 1 ? campuses[0].id : ""), title: record?.title || "", channel: existing.success ? existing.data.channel : "EMAIL" as AnnouncementProposal["channel"], templateIds: existing.success ? existing.data.templateIds ?? {} : {} as NonNullable<AnnouncementProposal["templateIds"]>, classIds: existing.success ? existing.data.classIds : [], messages: existing.success ? existing.data.messages : { [language]: { subject: "", body: "" } } as AnnouncementProposal["messages"], fallbackLanguage: existing.success ? existing.data.fallbackLanguage : null as AnnouncementProposal["fallbackLanguage"] }));
  const [initial] = useState(() => JSON.stringify(form)), [options, setOptions] = useState<AnnouncementOptions | null>(null), [optionState, setOptionState] = useState<"loading" | "ready" | "failed">("loading"), [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false), [reviewed, setReviewed] = useState(false), [error, setError] = useState("");
  const saveRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const dirty = JSON.stringify(form) !== initial, disabled = !canCreate || busy;
  useWorkspaceDraft(dirty || busy);
  useEffect(() => {
    if (!form.campusId) return;
    const controller = new AbortController();
    void workspaceRequest<{ options: AnnouncementOptions }>(`/api/school-ai/announcements/options?campusId=${encodeURIComponent(form.campusId)}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setOptions(result.options); setOptionState("ready"); } }).catch(() => { if (!controller.signal.aborted) setOptionState("failed"); });
    return () => controller.abort();
  }, [form.campusId, reload]);
  const errorText = (cause: unknown) => cause instanceof WorkspaceRequestError && cause.code && cause.code in t ? t[cause.code as keyof typeof t] : workspaceErrorText(cause, c);
  const update = (patch: Partial<typeof form>) => { setForm(previous => ({ ...previous, ...patch })); setReviewed(false); setError(""); };
  const save = async () => {
    const parsed = announcementProposalSchema.safeParse({ operation: "communications.queue_announcement", classIds: form.classIds, channel: form.channel, ...(form.channel === "WHATSAPP" ? { templateIds: form.templateIds } : {}), messages: form.messages, fallbackLanguage: form.fallbackLanguage });
    if (!parsed.success || !form.title.trim() || !form.campusId || optionState !== "ready") { setError(t.invalid); return; }
    setBusy(true); setError("");
    const data = { ...(record?.data || { goal: t.title, steps: [{ id: "announcement", title: t.preview, status: "ready", module: "communications" }], sourceIds: [], missingInformation: [] }), proposal: parsed.data };
    const fingerprint = JSON.stringify({ campusId: form.campusId, title: form.title, data });
    if (!saveRequest.current || saveRequest.current.fingerprint !== fingerprint) saveRequest.current = { fingerprint, key: crypto.randomUUID() };
    try { const result = await workspaceRequest<{ record: AiWorkspaceRecord }>(record ? `/api/school-ai/workspace/${record.id}` : "/api/school-ai/workspace", { method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record ? { version: record.version, title: form.title, data, action: "save" } : { kind: "WORKFLOW", title: form.title, campusId: form.campusId, data, idempotencyKey: saveRequest.current.key }) }); onSaved(result.record); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  const approve = async () => { if (!record || dirty || !reviewed) return; setBusy(true); setError(""); try { onSaved(await onAction(record, canApprove ? "approve" : "review")); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); } };
  return <div className="min-w-0 space-y-5" aria-busy={busy}>
    <div className={styles.notice}><Mail aria-hidden="true" className="mt-1 size-5 shrink-0" /><div><p className="font-semibold">{record ? c[record.status] : c.DRAFT}{record && ` · ${record.version}`}</p><p>{t.rules}</p>{dirty && <p className="mt-2 font-semibold">{t.changed}</p>}</div></div>
    <FormField name="announcement-campus" label={c.campus} required><Select disabled={disabled || Boolean(record)} value={form.campusId} onChange={event => { if (event.target.value === form.campusId) return; setOptions(null); setOptionState("loading"); update({ campusId: event.target.value, classIds: [] }); }}><option value="">{c.chooseCampus}</option>{campuses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>
    {form.campusId && <div className="flex flex-wrap items-center gap-2">{optionState === "loading" ? <SkeletonBar className="h-9 w-40" /> : null}{optionState === "failed" ? <Alert tone="danger" compact className="min-w-0 flex-1" actions={<Button variant="ghost" size="sm" disabled={busy} onClick={() => { setOptionState("loading"); setReload(value => value + 1); }}><RefreshCw aria-hidden="true" />{c.retry}</Button>}>{t.optionsFailed}</Alert> : <Button variant="ghost" disabled={busy || optionState === "loading"} loading={optionState === "loading"} onClick={() => { setOptionState("loading"); setReload(value => value + 1); }}><RefreshCw aria-hidden="true" />{c.retry}</Button>}</div>}
    <p className="text-xs leading-relaxed text-ink-muted">{t.operationalScope}</p>
    <FormField name="announcement-channel" label={t.channel}><Select value={form.channel} disabled={disabled} onChange={event => update({ channel: event.target.value as AnnouncementProposal["channel"], templateIds: {} })}>{announcementChannelSchema.options.map(value => <option key={value} value={value}>{t[value]}</option>)}</Select></FormField>
    {options && <p className={styles.notice}>{(options.channels?.find(item => item.channel === form.channel)?.configured ?? (form.channel === "EMAIL" && options.providerReady)) ? t.configured : t.unavailable}</p>}
    {form.channel !== "EMAIL" && <p className="text-sm">{t.templateHint}</p>}
    {form.campusId && <details className="min-w-0 space-y-3"><summary className="cursor-pointer font-semibold">{t.preferences}</summary><AnnouncementPreferencesPanel key={form.campusId} language={language} campusId={form.campusId} /></details>}
    <FormField name="announcement-title" label={t.planName} required><Input maxLength={180} disabled={disabled} value={form.title} onChange={event => update({ title: event.target.value })} /></FormField>
    <fieldset className="min-w-0 space-y-3"><legend className="font-semibold">{t.audience}</legend><p className="text-sm leading-relaxed text-ink-muted">{t.audienceHint}</p><div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-border-subtle p-3">{options?.classes.map(item => <label key={item.id} className="flex min-h-11 items-start gap-3 rounded-xl p-2 text-sm"><Checkbox className="mt-1" checked={form.classIds.includes(item.id)} disabled={disabled || !form.classIds.includes(item.id) && form.classIds.length >= 10} onChange={event => update({ classIds: event.target.checked ? [...form.classIds, item.id] : form.classIds.filter(id => id !== item.id) })} /><span className="min-w-0 break-words">{[item.name, item.section, item.academicYear].filter(Boolean).join(" · ")}</span></label>)}</div></fieldset>
    <fieldset className="min-w-0 space-y-4"><legend className="font-semibold">{t.languageVariants}</legend><p className="text-sm leading-relaxed text-ink-muted">{t.languageHint}</p>{languages.map(variant => <section key={variant} className="min-w-0 space-y-4 rounded-2xl border border-border-subtle p-4"><label className="flex min-h-11 items-center gap-3 font-semibold"><Checkbox checked={Boolean(form.messages[variant])} disabled={disabled} onChange={event => { const messages = { ...form.messages }; if (event.target.checked) messages[variant] = { subject: "", body: "" }; else delete messages[variant]; update({ messages, fallbackLanguage: !event.target.checked && form.fallbackLanguage === variant ? null : form.fallbackLanguage }); }} /><span>{t[variant]}</span></label>{form.messages[variant] && <>{form.channel === "WHATSAPP" && <FormField name={`announcement-template-${variant}`} label={`${t.template} · ${t[variant]}`}><Select disabled={disabled} value={form.templateIds[variant] ?? ""} onChange={event => { const template = options?.templates?.find(item => item.id === event.target.value && item.language === variant); update({ templateIds: { ...form.templateIds, [variant]: event.target.value }, messages: { ...form.messages, [variant]: template ? { subject: template.subject, body: template.body } : { subject: "", body: "" } } }); }}><option value="">{c.selectRecord}</option>{options?.templates?.filter(item => item.language === variant).map(item => <option key={item.id} value={item.id}>{item.subject}</option>)}</Select></FormField>}<FormField name={`announcement-subject-${variant}`} label={`${t.subject} · ${t[variant]}`} required><Input dir={variant === "en" ? "ltr" : "rtl"} lang={variant} value={form.messages[variant]!.subject} maxLength={180} disabled={disabled || form.channel === "WHATSAPP"} onChange={event => update({ messages: { ...form.messages, [variant]: { ...form.messages[variant]!, subject: event.target.value } } })} /></FormField><FormField name={`announcement-body-${variant}`} label={`${t.body} · ${t[variant]}`} required><Textarea dir={variant === "en" ? "ltr" : "rtl"} lang={variant} rows={6} maxLength={form.channel === "SMS" ? 1600 : 5000} value={form.messages[variant]!.body} disabled={disabled || form.channel === "WHATSAPP"} onChange={event => update({ messages: { ...form.messages, [variant]: { ...form.messages[variant]!, body: event.target.value } } })} /></FormField></>}</section>)}</fieldset>
    <FormField name="announcement-fallback" label={t.fallback} hint={t.fallbackHint}><Select value={form.fallbackLanguage || ""} disabled={disabled} onChange={event => update({ fallbackLanguage: event.target.value as Language || null })}><option value="">{t.noFallback}</option>{languages.filter(variant => form.messages[variant]).map(variant => <option key={variant} value={variant}>{t[variant]}</option>)}</Select></FormField>
    {error && <Alert tone="danger" compact>{error}</Alert>}<Button loading={busy} disabled={disabled || optionState !== "ready" || Boolean(record) && !dirty} onClick={() => void save()}>{c.save}</Button>
    {record && record.status !== "APPROVED" && <section className="space-y-3 border-t border-border-subtle pt-4"><label className="flex min-h-11 items-start gap-3 text-sm"><Checkbox className="mt-1" checked={reviewed} disabled={busy || dirty} onChange={event => setReviewed(event.target.checked)} /><span>{t.review}</span></label><Button variant="outline" disabled={busy || dirty || !reviewed || !canApprove && (!canCreate || record.status !== "DRAFT")} onClick={() => void approve()}><CheckCircle2 aria-hidden="true" />{canApprove ? t.approve : c.submitReview}</Button></section>}
    {record && <AnnouncementExecution language={language} record={record} canQueue={canQueue} dirty={dirty} />}
  </div>;
}

function AnnouncementExecution({ language, record, canQueue, dirty }: { language: Language; record: AiWorkspaceRecord<"WORKFLOW">; canQueue: boolean; dirty: boolean }) {
  const c = schoolAICopy(language), t = announcementCopy(language), url = `/api/school-ai/workspace/${record.id}/execute`;
  const [preview, setPreview] = useState<AnnouncementPreview | null>(null), [receipts, setReceipts] = useState<AnnouncementExecutionReceipt[]>([]), [selectedReceipt, setSelectedReceipt] = useState("");
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "failed">("loading"), [reload, setReload] = useState(0), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [error, setError] = useState("");
  const key = useRef<string | null>(null), currentReceipt = receipts.find(receipt => receipt.version === record.version), receipt = receipts.find(item => item.id === selectedReceipt) || receipts[0];
  useWorkspaceDraft(busy);
  useEffect(() => { const controller = new AbortController(); void workspaceRequest<{ executions: AnnouncementExecutionReceipt[] }>(`${url}?history=1`, { signal: controller.signal }).then(result => { setReceipts(result.executions.filter(item => item.operation === "communications.queue_announcement")); setHistoryState("ready"); }).catch(() => { if (!controller.signal.aborted) setHistoryState("failed"); }); return () => controller.abort(); }, [url, reload]);
  const errorText = (cause: unknown) => cause instanceof WorkspaceRequestError && cause.code && cause.code in t ? t[cause.code as keyof typeof t] : workspaceErrorText(cause, c);
  const loadPreview = async () => { setBusy(true); setError(""); setConfirmed(false); setPreview(null); try { const result = await workspaceRequest<{ preview: AnnouncementPreview }>(`${url}?operation=communications.queue_announcement&version=${record.version}`); setPreview(result.preview); key.current = crypto.randomUUID(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); } };
  const queue = async () => {
    if (!preview || !confirmed || !key.current || dirty || preview.blockers.length || !canQueue) return;
    setBusy(true); setError("");
    try { const result = await workspaceRequest<{ execution: AnnouncementExecutionReceipt }>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "communications.queue_announcement", version: record.version, previewHash: preview.previewHash, idempotencyKey: key.current }) }); setReceipts(previous => [result.execution, ...previous.filter(item => item.id !== result.execution.id)]); setSelectedReceipt(result.execution.id); setConfirmed(false); setPreview(null); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  return <section className="min-w-0 space-y-4 border-t border-border-subtle pt-5" aria-busy={busy}>
    {historyState === "loading" && <p role="status">{c.loading}</p>}{historyState === "failed" && <div className={styles.notice}><p>{t.historyFailed}</p><Button variant="ghost" onClick={() => { setHistoryState("loading"); setReload(value => value + 1); }}>{c.retry}</Button></div>}
    {!currentReceipt && canQueue && record.status === "APPROVED" && historyState === "ready" && <Button variant="outline" disabled={busy || dirty} onClick={() => void loadPreview()}>{t.preview}</Button>}
    {!currentReceipt && preview && <section className="min-w-0 space-y-5" aria-label={t.previewTitle}><h3 className="font-bold">{t.previewTitle}</h3><p className="font-semibold">{t.channel}: {t[preview.channel]}</p><p className="text-sm">{preview.classes.map(item => item.name).join(" · ")}</p>
      {preview.blockers.map(code => <p role="alert" key={code} className="text-sm text-destructive">{t[code]}</p>)}
      <div className="space-y-3"><h4 className="font-semibold">{t.recipients} · {new Intl.NumberFormat(language).format(preview.recipients.length)}</h4>{preview.recipients.map(item => <article key={item.guardianUserId} className="min-w-0 rounded-xl border border-border-subtle p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 break-words font-semibold">{item.name}</p><TaskStatus>{t[item.language]}</TaskStatus></div><p dir="ltr" className="mt-1 break-all text-start">{item.recipient}</p><p className="mt-1 break-words text-xs text-ink-muted">{item.studentNames.join(" · ")}</p></article>)}</div>
      <div className="space-y-3"><h4 className="font-semibold">{t.skipped} · {new Intl.NumberFormat(language).format(preview.skipped.length)}</h4>{preview.skipped.length ? preview.skipped.map((item, index) => <p key={`${item.studentId}:${index}`} className={styles.notice}><span className="min-w-0 break-words">{item.studentName} · {t[item.reason]}</span></p>) : <p className="text-sm text-ink-muted">{t.noSkipped}</p>}</div>
      {languages.filter(variant => preview.messages[variant]).map(variant => <article key={variant} className="min-w-0 space-y-3 rounded-2xl border border-border-subtle p-4"><h4 className="font-semibold">{t.messageFor} · {t[variant]}</h4><p dir={variant === "en" ? "ltr" : "rtl"} lang={variant} className="break-words font-semibold">{preview.messages[variant]!.subject}</p><p dir={variant === "en" ? "ltr" : "rtl"} lang={variant} className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{preview.messages[variant]!.body}</p></article>)}
      <label className="flex min-h-11 items-start gap-3 text-sm"><Checkbox checked={confirmed} className="mt-1" disabled={busy || dirty || Boolean(preview.blockers.length)} onChange={event => setConfirmed(event.target.checked)} /><span>{t.queueConfirm}</span></label><Button disabled={busy || dirty || !confirmed || Boolean(preview.blockers.length) || !canQueue} onClick={() => void queue()}>{t.queue}</Button>
    </section>}
    {receipt && <section className="space-y-4"><div className={styles.notice}><CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0" /><div><h3 className="font-bold">{t.queued}</h3><p>{t.receiptHint}</p></div></div><FormField name="announcement-receipt" label={t.receipts}><Select value={receipt.id} onChange={event => setSelectedReceipt(event.target.value)}>{receipts.map(item => <option key={item.id} value={item.id}>{t.receipt} · {item.version} · {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.completedAt))}</option>)}</Select></FormField><p className="text-sm">{t.queuedCount}: {new Intl.NumberFormat(language).format(receipt.queuedCount)}</p><p className="break-all text-xs text-ink-muted">{receipt.id}</p><AnnouncementDeliveryStatus key={receipt.id} language={language} recordId={record.id} receipt={receipt} /></section>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}

function AnnouncementDeliveryStatus({ language, recordId, receipt }: { language: Language; recordId: string; receipt: AnnouncementExecutionReceipt }) {
  const c = schoolAICopy(language), t = announcementCopy(language), [result, setResult] = useState<AnnouncementDeliveryList | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => { const controller = new AbortController(); void workspaceRequest<AnnouncementDeliveryList>(`/api/school-ai/workspace/${recordId}/announcements?executionId=${encodeURIComponent(receipt.id)}`, { signal: controller.signal }).then(value => { setResult(value); setError(false); setLoading(false); }).catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } }); return () => controller.abort(); }, [recordId, receipt.id, reload]);
  return <section className="min-w-0 space-y-3" aria-busy={loading}><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-base font-semibold text-ink-strong">{t.deliveryTitle}</h4><Button variant="ghost" disabled={loading} onClick={() => { setLoading(true); setReload(value => value + 1); }}><RefreshCw aria-hidden="true" />{t.refreshDelivery}</Button></div>{loading && <SkeletonList rows={3} label={c.loading} />}{error && !loading && <ErrorState description={t.deliveryFailed} retryLabel={c.retry} onRetry={() => { setLoading(true); setReload(value => value + 1); }} />}{result && <><p className="text-xs leading-relaxed text-ink-muted">{t.uncertainHint}</p>{!result.deliveries.length && <EmptyState size="sm" icon={Mail} title={t.noDeliveries} />}{result.deliveries.map(item => <div key={item.id} className="sk-panel min-w-0 space-y-2 p-3"><div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><p dir="ltr" className="min-w-0 break-all text-start text-sm">{item.recipient}</p><TaskStatus attention={["FAILED", "UNCERTAIN", "CANCELLED"].includes(item.status)}>{t[item.status]}</TaskStatus></div><p className="text-xs text-ink-muted">{t[item.language]}</p>{item.reason && <p dir="auto" className="break-words text-xs text-ink-muted">{item.reason}</p>}</div>)}</>}</section>;
}
