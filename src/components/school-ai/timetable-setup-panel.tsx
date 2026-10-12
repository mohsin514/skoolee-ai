"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import type { Language } from "@/lib/locale/package";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { timetableSetupProposalSchema, timetableSlotTypes, type TimetableSetupExecutionReceipt, type TimetableSetupOptions, type TimetableSetupPreview, type TimetableSetupProposal } from "@/lib/school-ai/timetable-setup";
import type { AiWorkspaceRecord, WorkspaceCapabilities, WorkflowData } from "@/lib/school-ai/types";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { WorkspaceRequestError, workspaceErrorText, workspaceRequest, type RecordAction } from "./workspace-client";
import { timetableSetupCopy } from "./timetable-setup-copy";
import { TimetableSolverPanel } from "./timetable-solver-panel";
import styles from "./school-ai.module.css";

export function isTimetableSetupPlan(record: AiWorkspaceRecord): record is AiWorkspaceRecord<"WORKFLOW"> {
  return record.kind === "WORKFLOW" && (record.data.proposal as { operation?: string } | undefined)?.operation === "timetable.create_draft";
}
interface Props {
  language: Language; records: AiWorkspaceRecord[]; campuses: WorkspaceCapabilities["campuses"]; campusId?: string | null; initialRecordId?: string | null;
  canCreate: boolean; canApprove: boolean; canApply: boolean; onRecord: (record: AiWorkspaceRecord) => void; onAction: RecordAction;
}
type Slot = TimetableSetupProposal["slots"][number];
const blankSlot = (dayOfWeek = 1, periodNumber = 1): Slot => ({ id: crypto.randomUUID(), dayOfWeek, periodNumber, startTime: "", endTime: "", slotType: "CLASS", subjectId: null, teacherId: null, roomId: null });

export function TimetableSetupPanel(props: Props) {
  const t = timetableSetupCopy(props.language), c = schoolAICopy(props.language), guard = useWorkspaceDraftNavigation();
  const plans = props.records.filter(isTimetableSetupPlan).filter(item => item.status !== "ARCHIVED");
  const [selected, setSelected] = useState<string | null>(() => plans.find(item => item.id === props.initialRecordId)?.id || plans[0]?.id || null);
  const [generation, setGeneration] = useState(0);
  const record = plans.find(item => item.id === selected);
  return <section className={`sk-panel ${styles.panel}`}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><h2 className={styles.sectionTitle}>{t.title}</h2><p className={styles.description}>{t.hint}</p></div>{props.canCreate && <Button variant="outline" onClick={() => guard(() => { setGeneration(value => value + 1); setSelected("new"); })}><Plus aria-hidden="true" />{t.newPlan}</Button>}</div>
    <div className={styles.sourceGrid}><aside className={styles.recordList} aria-label={c.savedPlans}>{!plans.length && <p className={styles.empty}>{t.empty}</p>}{plans.map(item => <Button key={item.id} variant="choice" className="justify-start text-start" aria-pressed={selected === item.id} onClick={() => guard(() => setSelected(item.id))}><span className="min-w-0 break-words">{item.title}<span className="mt-1 block text-xs">{c[item.status]} · {item.version}</span></span></Button>)}</aside>
      {record || selected === "new" ? <TimetableEditor key={record ? `${record.id}:${record.version}` : `new:${generation}`} {...props} record={record} onSaved={item => { props.onRecord(item); setSelected(item.id); }} /> : <p className={styles.notice}>{c.selectRecord}</p>}
    </div>
  </section>;
}

function TimetableEditor({ language, record, campuses, campusId, canCreate, canApprove, canApply, onAction, onSaved }: Props & { record?: AiWorkspaceRecord<"WORKFLOW">; onSaved: (record: AiWorkspaceRecord) => void }) {
  const c = schoolAICopy(language), t = timetableSetupCopy(language);
  const existing = record?.data.proposal?.operation === "timetable.create_draft" ? record.data.proposal : undefined;
  const [form, setForm] = useState(() => ({ campusId: record?.campusId || campusId || (campuses.length === 1 ? campuses[0].id : ""), title: record?.title || "", classId: existing?.classId || "", term: existing?.term || "ANNUAL" as TimetableSetupProposal["term"], slots: existing?.slots || [blankSlot()] }));
  const [initial] = useState(() => JSON.stringify(form));
  const [options, setOptions] = useState<TimetableSetupOptions | null>(null);
  const [optionState, setOptionState] = useState<"loading" | "ready" | "failed">("loading"), [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false), [reviewed, setReviewed] = useState(false), [error, setError] = useState("");
  const [invalid, setInvalid] = useState<string[]>([]), [addDay, setAddDay] = useState(1);
  const [saveKey] = useState(() => crypto.randomUUID());
  const root = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(form) !== initial;
  const disabled = !canCreate || busy;
  useWorkspaceDraft(dirty || busy);
  useEffect(() => {
    if (!form.campusId) return;
    const controller = new AbortController();
    void workspaceRequest<{ options: TimetableSetupOptions }>(`/api/school-ai/timetable/options?campusId=${encodeURIComponent(form.campusId)}`, { signal: controller.signal }).then(result => { setOptions(result.options); setOptionState("ready"); }).catch(() => { if (!controller.signal.aborted) setOptionState("failed"); });
    return () => controller.abort();
  }, [form.campusId, reload]);
  const cls = options?.classes.find(item => item.id === form.classId);
  const subjects = options?.subjects.filter(item => item.classId === form.classId) || [];
  const errorText = (cause: unknown) => cause instanceof WorkspaceRequestError && cause.code && cause.code in t ? String(t[cause.code as keyof typeof t]) : workspaceErrorText(cause, c);
  const update = (patch: Partial<typeof form>) => { setForm(previous => ({ ...previous, ...patch })); setReviewed(false); setInvalid([]); };
  const updateSlot = (id: string, patch: Partial<Slot>) => update({ slots: form.slots.map(slot => slot.id === id ? { ...slot, ...patch } : slot) });
  const assignment = (subjectId: string | null) => cls?.teachingMode === "SINGLE" ? cls.classTeacherId : subjects.find(item => item.id === subjectId)?.teacherId || null;
  const checkField = (path: string) => invalid.some(item => item === path || item.startsWith(path + ".")) ? t.invalid : undefined;
  const save = async () => {
    const parsed = timetableSetupProposalSchema.safeParse({ operation: "timetable.create_draft", classId: form.classId, academicYear: cls?.academicYear ?? existing?.academicYear, term: form.term, slots: form.slots });
    if (!parsed.success || !form.title.trim() || !form.campusId || optionState !== "ready") {
      setError(!parsed.success && parsed.error.issues.some(issue => issue.code === "custom" && issue.params?.code === "TIMETABLE_PERIOD_INCONSISTENT") ? t.TIMETABLE_PERIOD_INCONSISTENT : t.invalid); setInvalid([...(parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join("."))), ...(!form.title.trim() ? ["title"] : []), ...(!form.campusId ? ["campusId"] : [])]);
      requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return;
    }
    setBusy(true); setError("");
    const data: WorkflowData = { ...(record?.data || { goal: t.title, steps: [{ id: "timetable", title: t.preview, status: "ready", module: "timetable" }], sourceIds: [], missingInformation: [] }), proposal: parsed.data };
    try {
      const result = await workspaceRequest<{ record: AiWorkspaceRecord }>(record ? `/api/school-ai/workspace/${record.id}` : "/api/school-ai/workspace", { method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record ? { version: record.version, title: form.title, data, action: "save" } : { kind: "WORKFLOW", title: form.title, campusId: form.campusId, data, idempotencyKey: saveKey }) });
      onSaved(result.record);
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  const approve = async () => {
    if (!record || dirty || !reviewed) return;
    setBusy(true); setError("");
    try { onSaved(await onAction(record, canApprove ? "approve" : "review")); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  return <div ref={root} className="min-w-0 space-y-5" aria-busy={busy}>
    <div className={styles.notice}><CalendarDays aria-hidden="true" className="mt-1 size-5 shrink-0" /><div><p className="font-semibold">{record ? c[record.status] : c.DRAFT}{record && ` · ${record.version}`}</p><p>{t.rules}</p>{dirty && <p className="mt-2 font-semibold">{t.changed}</p>}</div></div>
    <FormField name="timetable-campus" label={c.campus} required error={checkField("campusId")}><Select disabled={disabled || Boolean(record)} value={form.campusId} onChange={event => { setOptionState("loading"); setOptions(null); update({ campusId: event.target.value, classId: "", slots: [blankSlot()] }); }}><option value="">{c.chooseCampus}</option>{campuses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>
    {form.campusId && <div className="flex flex-wrap items-center gap-2">{optionState === "loading" ? <p role="status">{c.loading}</p> : optionState === "failed" ? <p role="alert" className="text-sm text-destructive">{t.optionsFailed}</p> : null}<Button variant="ghost" disabled={busy || optionState === "loading"} onClick={() => { setOptionState("loading"); setReload(value => value + 1); }}><RefreshCw aria-hidden="true" />{c.retry}</Button></div>}
    <FormField name="timetable-title" label={t.planName} required error={checkField("title")}><Input value={form.title} maxLength={180} disabled={disabled} onChange={event => update({ title: event.target.value })} /></FormField>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2"><FormField name="timetable-class" label={t.class} required error={checkField("classId")}><Select disabled={disabled || optionState !== "ready"} value={form.classId} onChange={event => update({ classId: event.target.value, slots: form.slots.map(slot => ({ ...slot, subjectId: null, teacherId: null })) })}><option value="">{t.choose}</option>{options?.classes.map(item => <option key={item.id} value={item.id}>{[item.name, item.section, item.academicYear].filter(Boolean).join(" · ")}</option>)}</Select></FormField><FormField name="timetable-term" label={t.term}><Select disabled={disabled} value={form.term} onChange={event => update({ term: event.target.value as TimetableSetupProposal["term"] })}>{(["ANNUAL", "TERM_1", "TERM_2", "TERM_3"] as const).map(term => <option key={term} value={term}>{t[term]}</option>)}</Select></FormField></div>
    {cls && options && <TimetableSolverPanel key={`${form.campusId}:${form.classId}:${form.term}:${reload}`} language={language} options={options} classId={cls.id} term={form.term} disabled={disabled} onBusyChange={setBusy} onUse={slots => update({ slots })} />}
    <fieldset className="min-w-0 space-y-4"><legend className="mb-2 font-semibold">{t.slots}</legend><p className="text-sm text-ink-muted">{options?.periods.length ? t.configured : t.noDefinitions}</p>
      {form.slots.map((slot, index) => <div key={slot.id} className="min-w-0 space-y-3 rounded-2xl border border-border-subtle p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{t.slot} {new Intl.NumberFormat(language).format(index + 1)}</h3><Button variant="ghost" size="icon" aria-label={`${t.remove} ${index + 1}`} disabled={disabled || form.slots.length === 1} onClick={() => update({ slots: form.slots.filter(item => item.id !== slot.id) })}><Trash2 aria-hidden="true" /></Button></div>
        {checkField(`slots.${index}`) && <p role="alert" className="text-sm text-destructive">{t.invalid}</p>}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2"><FormField name={`day-${slot.id}`} label={t.day}><Select value={slot.dayOfWeek} disabled={disabled} onChange={event => updateSlot(slot.id, { dayOfWeek: Number(event.target.value) })}>{t.days.map((day, number) => <option key={day} value={number + 1} disabled={options?.weekendDays.includes(number + 1)}>{day}{options?.weekendDays.includes(number + 1) ? ` · ${t.offDay}` : ""}</option>)}</Select></FormField>
          <FormField name={`period-${slot.id}`} label={t.period} error={checkField(`slots.${index}.periodNumber`)}>{options?.periods.length ? <Select value={options.periods.some(period => period.periodNumber === slot.periodNumber && period.startTime === slot.startTime && period.endTime === slot.endTime) ? slot.periodNumber : ""} disabled={disabled} onChange={event => { const period = options.periods.find(item => item.periodNumber === Number(event.target.value)); if (period) updateSlot(slot.id, period); }}><option value="">{t.choose}</option>{options.periods.map(period => <option key={period.periodNumber} value={period.periodNumber}>{period.periodNumber} · {period.startTime}–{period.endTime}</option>)}</Select> : <Input type="number" min={1} max={30} value={slot.periodNumber} disabled={disabled} onChange={event => updateSlot(slot.id, { periodNumber: Number(event.target.value) })} />}</FormField>
          <FormField name={`start-${slot.id}`} label={t.start} error={checkField(`slots.${index}.startTime`)}><Input type="time" dir="ltr" value={slot.startTime} disabled={disabled || Boolean(options?.periods.length)} onChange={event => updateSlot(slot.id, { startTime: event.target.value })} /></FormField><FormField name={`end-${slot.id}`} label={t.end} error={checkField(`slots.${index}.endTime`)}><Input type="time" dir="ltr" value={slot.endTime} disabled={disabled || Boolean(options?.periods.length)} onChange={event => updateSlot(slot.id, { endTime: event.target.value })} /></FormField>
          <FormField name={`type-${slot.id}`} label={t.type}><Select value={slot.slotType} disabled={disabled} onChange={event => updateSlot(slot.id, { slotType: event.target.value as Slot["slotType"], subjectId: null, teacherId: null, roomId: null })}>{timetableSlotTypes.map(type => <option key={type} value={type}>{t[type]}</option>)}</Select></FormField>
          {slot.slotType === "CLASS" && <><FormField name={`subject-${slot.id}`} label={t.subject} required error={checkField(`slots.${index}.subjectId`)}><Select value={slot.subjectId || ""} disabled={disabled || !cls} onChange={event => updateSlot(slot.id, { subjectId: event.target.value || null, teacherId: assignment(event.target.value || null) })}><option value="">{t.choose}</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField><FormField name={`teacher-${slot.id}`} label={t.teacher}><Input value={options?.teachers.find(item => item.id === slot.teacherId)?.fullName || t.noTeacher} readOnly /></FormField><FormField name={`room-${slot.id}`} label={t.room} required><Select value={slot.roomId || ""} disabled={disabled} onChange={event => updateSlot(slot.id, { roomId: event.target.value || null })}><option value="">{t.choose}</option>{options?.rooms.map(item => <option key={item.id} value={item.id}>{item.roomNumber} · {item.capacity ? `${item.capacity} ${t.seats}` : t.unknownCapacity}</option>)}</Select></FormField></>}
        </div>
      </div>)}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled || form.slots.length >= 140} onClick={() => update({ slots: [...form.slots, blankSlot()] })}><Plus aria-hidden="true" />{t.add}</Button></div>
      {Boolean(options?.periods.length) && <div className="space-y-2"><FormField name="timetable-add-day" label={t.dayToAdd}><Select value={addDay} disabled={disabled} onChange={event => setAddDay(Number(event.target.value))}>{t.days.map((day, index) => <option key={day} value={index + 1} disabled={options?.weekendDays.includes(index + 1)}>{day}{options?.weekendDays.includes(index + 1) ? ` · ${t.offDay}` : ""}</option>)}</Select></FormField><Button variant="outline" disabled={disabled || options?.weekendDays.includes(addDay) || form.slots.some(slot => slot.dayOfWeek === addDay) || form.slots.length + (options?.periods.length || 0) > 140} onClick={() => update({ slots: [...form.slots, ...options!.periods.map(period => ({ ...blankSlot(addDay, period.periodNumber), ...period }))] })}>{t.copyDay}</Button></div>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={disabled || optionState !== "ready" || Boolean(record) && !dirty} onClick={() => void save()}>{busy ? c.saving : c.save}</Button>
    {record && record.status !== "APPROVED" && <section className="space-y-3 border-t border-border-subtle pt-4"><label className="flex min-h-11 items-start gap-3 text-sm"><Checkbox checked={reviewed} className="mt-1" disabled={busy || dirty} onChange={event => setReviewed(event.target.checked)} /><span>{t.review}</span></label><Button variant="outline" disabled={busy || dirty || !reviewed || !canApprove && (!canCreate || record.status !== "DRAFT")} onClick={() => void approve()}><CheckCircle2 aria-hidden="true" />{canApprove ? t.approve : c.submitReview}</Button></section>}
    {record && <TimetableExecution language={language} record={record} canApply={canApply} dirty={dirty} />}
  </div>;
}

function TimetableExecution({ language, record, canApply, dirty }: { language: Language; record: AiWorkspaceRecord<"WORKFLOW">; canApply: boolean; dirty: boolean }) {
  const t = timetableSetupCopy(language), c = schoolAICopy(language);
  const [preview, setPreview] = useState<TimetableSetupPreview | null>(null), [receipt, setReceipt] = useState<TimetableSetupExecutionReceipt | null>(null);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "failed">("loading"), [reload, setReload] = useState(0), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [error, setError] = useState("");
  const key = useRef<string | null>(null), url = `/api/school-ai/workspace/${record.id}/execute`;
  useWorkspaceDraft(busy);
  useEffect(() => {
    const controller = new AbortController();
    void workspaceRequest<{ executions: TimetableSetupExecutionReceipt[] }>(`${url}?history=1`, { signal: controller.signal }).then(result => { setReceipt(result.executions.find(item => item.operation === "timetable.create_draft" && item.version === record.version) || null); setHistoryState("ready"); }).catch(() => { if (!controller.signal.aborted) setHistoryState("failed"); });
    return () => controller.abort();
  }, [url, record.version, reload]);
  const errorText = (cause: unknown) => cause instanceof WorkspaceRequestError && cause.code && cause.code in t ? String(t[cause.code as keyof typeof t]) : workspaceErrorText(cause, c);
  const loadPreview = async () => {
    setBusy(true); setError(""); setConfirmed(false); setPreview(null);
    try { const result = await workspaceRequest<{ preview: TimetableSetupPreview }>(`${url}?operation=timetable.create_draft&version=${record.version}`); setPreview(result.preview); key.current = crypto.randomUUID(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview || !confirmed || !key.current || dirty) return;
    setBusy(true); setError("");
    try { const result = await workspaceRequest<{ execution: TimetableSetupExecutionReceipt }>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "timetable.create_draft", version: record.version, previewHash: preview.previewHash, idempotencyKey: key.current }) }); setReceipt(result.execution); setConfirmed(false); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  return <section className="min-w-0 space-y-4 border-t border-border-subtle pt-5" aria-busy={busy}>
    {historyState === "loading" && <p role="status">{c.loading}</p>}{historyState === "failed" && <div className={styles.notice}><p>{t.historyFailed}</p><Button variant="ghost" onClick={() => { setHistoryState("loading"); setReload(value => value + 1); }}>{c.retry}</Button></div>}
    {receipt ? <div role="status" className={styles.notice}><CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0" /><div className="min-w-0"><h3 className="font-bold">{t.receipt}</h3><p>{t.receiptHint}</p><p className="mt-2">{t.savedSlots}: {new Intl.NumberFormat(language).format(receipt.slotCount)}</p><p className="mt-2 break-all text-xs">{receipt.timetableId} · {receipt.id}</p></div></div> : canApply && record.status === "APPROVED" && historyState === "ready" && <Button variant="outline" disabled={busy || dirty} onClick={() => void loadPreview()}>{t.preview}</Button>}
    {!receipt && preview && <div className="space-y-4"><h3 className="font-bold">{t.previewTitle}</h3><p>{preview.className} · {preview.academicYear} · {t[preview.term]}</p><div className="space-y-2">{preview.slots.map(slot => <div key={slot.id} className="rounded-xl border border-border-subtle p-3 text-sm"><p className="font-semibold">{t.days[slot.dayOfWeek - 1]} · {t.period} {slot.periodNumber} · <bdi>{slot.startTime}–{slot.endTime}</bdi></p><p className="mt-1 break-words">{[t[slot.slotType], slot.subjectName, slot.teacherName, slot.roomNumber].filter(Boolean).join(" · ")}</p></div>)}</div>
      {preview.warnings.map((warning, index) => <p key={index} className={styles.notice}>{warning.code === "ROOM_CAPACITY" ? t.capacity : t.unknownCapacity}: {warning.roomNumber} · {t.days[warning.dayOfWeek - 1]} · {warning.periodNumber} · {warning.capacity} {t.seats} / {warning.classSize} {t.students}</p>)}
      <label className="flex min-h-11 items-start gap-3 text-sm"><Checkbox className="mt-1" checked={confirmed} disabled={busy || dirty} onChange={event => setConfirmed(event.target.checked)} /><span>{t.applyConfirm}</span></label><Button disabled={busy || dirty || !confirmed || !canApply} onClick={() => void apply()}>{t.apply}</Button>
    </div>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
