"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, History, Loader2, RefreshCw, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import { SETUP_ANSWER_KEYS, type SetupAnswerKey } from "@/lib/school-ai/onboarding";
import type { SetupTask, SetupTaskDetail, SetupTaskList, SetupTaskOptions } from "@/lib/school-ai/setup-tasks";
import { setupTaskCopy } from "@/lib/school-ai/setup-task-copy";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { workspaceErrorText, workspaceRequest } from "./workspace-client";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";

export interface SetupTasksPanelProps { language: Language; campusId?: string | null; records: AiWorkspaceRecord[]; canManage: boolean; onRecord: (record: AiWorkspaceRecord) => void }
export function SetupTasksPanel(props: SetupTasksPanelProps) { return <ScopedSetupTasks key={props.campusId ?? "school"} {...props} />; }
function ScopedSetupTasks({ language, campusId, records, canManage, onRecord }: SetupTasksPanelProps) {
  const c = setupTaskCopy(language), general = useMemo(() => schoolAICopy(language), [language]), guard = useWorkspaceDraftNavigation();
  const drafts = records.filter(record => record.kind === "ONBOARDING" && record.campusId === campusId && record.status !== "ARCHIVED");
  const [tasks, setTasks] = useState<SetupTask[]>([]), [nextCursor, setNextCursor] = useState<string | null>(null), [detail, setDetail] = useState<SetupTaskDetail | null>(null);
  const [recordId, setRecordId] = useState(""), [fieldKey, setFieldKey] = useState<SetupAnswerKey>("schoolName"), [assigneeId, setAssigneeId] = useState(""), [instructions, setInstructions] = useState(""), [answer, setAnswer] = useState("");
  const [staff, setStaff] = useState<SetupTaskOptions["staff"]>([]), [optionsLoading, setOptionsLoading] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const createKey = useRef<{ content: string; key: string } | null>(null), mounted = useRef(true), selection = useRef(0), assignmentScope = useRef("");
  const dirty = Boolean(instructions.trim() || answer !== (detail?.task.answer ?? "")) || busy;
  useWorkspaceDraft(dirty);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selection.current++; }; }, []);
  const outcomes = ["exams", "timetable", "fees", "records", "complete"] as const;
  const displayAnswer = (field: SetupAnswerKey, value: string | null) => field === "firstOutcome" && outcomes.includes(value as typeof outcomes[number]) ? general[value as typeof outcomes[number]] : value || c.unset;
  const label = (field: SetupAnswerKey) => general[field === "curriculum" ? "curriculumQuestion" : field];
  const query = useCallback((before?: string) => { const params = new URLSearchParams(); if (campusId) params.set("campusId", campusId); if (before) params.set("before", before); return params; }, [campusId]);
  const refresh = async (more = false) => {
    setLoading(true); setError("");
    try { const result = await workspaceRequest<SetupTaskList>(`/api/school-ai/setup-tasks?${query(more ? nextCursor ?? undefined : undefined)}`); if (mounted.current) { setTasks(previous => more ? [...previous, ...result.tasks.filter(item => !previous.some(existing => existing.id === item.id))] : result.tasks); setNextCursor(result.nextCursor); } }
    catch (error) { if (mounted.current) setError(workspaceErrorText(error, general)); }
    finally { if (mounted.current) setLoading(false); }
  };
  useEffect(() => { const abort = new AbortController(); setLoading(true); void workspaceRequest<SetupTaskList>(`/api/school-ai/setup-tasks?${query()}`, { signal: abort.signal }).then(result => { if (!abort.signal.aborted) { setTasks(result.tasks); setNextCursor(result.nextCursor); } }).catch(error => { if (!abort.signal.aborted) setError(workspaceErrorText(error, general)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); }); return () => abort.abort(); }, [query, general]);
  useEffect(() => {
    const abort = new AbortController(); setStaff([]);
    const scope = JSON.stringify([recordId, fieldKey]);
    if (assignmentScope.current !== scope) { assignmentScope.current = scope; setAssigneeId(""); }
    if (!canManage || !recordId) { setOptionsLoading(false); return () => abort.abort(); }
    setOptionsLoading(true);
    void workspaceRequest<SetupTaskOptions>(`/api/school-ai/setup-tasks/options?${new URLSearchParams({ recordId, fieldKey })}`, { signal: abort.signal }).then(result => { if (!abort.signal.aborted) setStaff(result.staff); }).catch(error => { if (!abort.signal.aborted) setError(workspaceErrorText(error, general)); }).finally(() => { if (!abort.signal.aborted) setOptionsLoading(false); });
    return () => abort.abort();
  }, [canManage, recordId, fieldKey, general]);
  const open = async (id: string, beforeVersion?: number) => {
    const current = ++selection.current; setLoading(true); setError(""); setNotice("");
    try { const result = await workspaceRequest<SetupTaskDetail>(`/api/school-ai/setup-tasks/${id}${beforeVersion ? `?beforeVersion=${beforeVersion}` : ""}`); if (mounted.current && current === selection.current) { setDetail(previous => beforeVersion && previous?.task.id === id ? { ...result, revisions: [...previous.revisions, ...result.revisions.filter(item => !previous.revisions.some(existing => existing.version === item.version))] } : result); if (!beforeVersion) setAnswer(result.task.answer ?? ""); } }
    catch (error) { if (mounted.current && current === selection.current) { setDetail(null); setAnswer(""); setError(workspaceErrorText(error, general)); } }
    finally { if (mounted.current && current === selection.current) setLoading(false); }
  };
  const create = async () => {
    const payload = { recordId, fieldKey, assigneeId, instructions: instructions.trim() }, content = JSON.stringify(payload);
    if (createKey.current?.content !== content) createKey.current = { content, key: crypto.randomUUID() };
    setBusy(true); setError(""); setNotice("");
    try { const result = await workspaceRequest<{ task: SetupTask }>("/api/school-ai/setup-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: createKey.current.key }) }); if (!mounted.current) return; createKey.current = null; setInstructions(""); await refresh(); await open(result.task.id); setNotice(c.saved); }
    catch (error) { if (mounted.current) setError(workspaceErrorText(error, general)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const update = async (action: "answer" | "accept" | "cancel") => {
    if (!detail) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await workspaceRequest<{ task: SetupTask; record?: AiWorkspaceRecord }>(`/api/school-ai/setup-tasks/${detail.task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, version: detail.task.version, ...(action === "answer" ? { answer: answer.trim() } : action === "accept" ? { recordVersion: detail.currentFact?.recordVersion } : {}) }) });
      if (!mounted.current) return; if (result.record) onRecord(result.record); setAnswer(result.task.answer ?? ""); await refresh(); await open(result.task.id); setNotice(c.saved);
    } catch (error) { if (mounted.current) setError(workspaceErrorText(error, general)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section dir={language === "en" ? "ltr" : "rtl"} aria-label={c.title} aria-busy={busy || loading} className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{c.title}</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{c.hint}</p></div><Button variant="outline" disabled={busy || loading} onClick={() => guard(() => { setDetail(null); setAnswer(""); void refresh(); })}><RefreshCw aria-hidden="true" />{c.refresh}</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    {canManage && <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6"><h3 className="flex items-center gap-2 font-semibold"><UserRoundPlus aria-hidden="true" className="size-5" />{c.delegate}</h3>{!drafts.length ? <p className="mt-3 text-sm text-ink-muted">{c.noDraft}</p> : <div className="mt-4 space-y-4"><div className="grid gap-4 md:grid-cols-2"><FormField name="setup-task-record" label={c.record}><Select value={recordId} disabled={busy} onChange={event => setRecordId(event.target.value)}><option value="">{c.choose}</option>{drafts.map(record => <option key={record.id} value={record.id}>{record.title}</option>)}</Select></FormField><FormField name="setup-task-field" label={c.field}><Select value={fieldKey} disabled={busy} onChange={event => setFieldKey(event.target.value as SetupAnswerKey)}>{SETUP_ANSWER_KEYS.map(field => <option key={field} value={field}>{label(field)}</option>)}</Select></FormField></div><FormField name="setup-task-assignee" label={c.assignee}><Select value={assigneeId} disabled={busy || optionsLoading || !recordId} onChange={event => setAssigneeId(event.target.value)}><option value="">{c.choose}</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></FormField>{recordId && !optionsLoading && !staff.length && <p className="text-sm text-ink-muted">{c.noStaff}</p>}<FormField name="setup-task-instructions" label={c.instructions} hint={c.privacy}><Textarea value={instructions} maxLength={2000} disabled={busy} onChange={event => setInstructions(event.target.value)} /></FormField><Button disabled={busy || optionsLoading || !recordId || !assigneeId} onClick={() => void create()}>{c.send}</Button></div>}</div>}
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />{c.loading}</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)]"><div className="space-y-3"><h3 className="font-semibold">{c.list}</h3>{!loading && !tasks.length && <p className="text-sm text-ink-muted">{c.empty}</p>}{tasks.map(task => <Button key={task.id} variant={detail?.task.id === task.id ? "secondary" : "outline"} className="h-auto w-full justify-start whitespace-normal py-3 text-start" disabled={busy || loading} onClick={() => guard(() => void open(task.id))}><span className="min-w-0"><span className="block font-semibold">{label(task.fieldKey)}</span><span className="mt-1 block text-xs text-ink-muted">{task.assigneeName} · {c[task.status]}</span></span></Button>)}{nextCursor && <Button variant="ghost" disabled={busy || loading} onClick={() => void refresh(true)}>{c.more}</Button>}</div>
    {detail && <article className="min-w-0 space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6"><div><h3 className="text-lg font-semibold">{label(detail.task.fieldKey)}</h3><p className="mt-1 text-sm text-ink-muted">{detail.task.assigneeName} · {c[detail.task.status]} · {c.version} {detail.task.version}</p></div>{detail.task.instructions && <p className="whitespace-pre-wrap break-words text-sm">{detail.task.instructions}</p>}
    {detail.task.canAnswer && ["OPEN", "ANSWERED"].includes(detail.task.status) ? <><FormField name="setup-task-answer" label={c.answer}>{detail.task.fieldKey === "firstOutcome" ? <Select value={answer} disabled={busy} onChange={event => setAnswer(event.target.value)}><option value="">{c.choose}</option>{outcomes.map(outcome => <option key={outcome} value={outcome}>{general[outcome]}</option>)}</Select> : ["startDate", "endDate"].includes(detail.task.fieldKey) ? <Input type="date" value={answer} disabled={busy} onChange={event => setAnswer(event.target.value)} /> : <Textarea value={answer} maxLength={4000} disabled={busy} onChange={event => setAnswer(event.target.value)} />}</FormField><Button disabled={busy || !answer.trim() || answer.trim() === detail.task.answer} onClick={() => void update("answer")}>{c.save}</Button></> : <div><h4 className="text-sm font-semibold">{c.answer}</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm">{displayAnswer(detail.task.fieldKey, detail.task.answer)}</p></div>}
    {detail.task.canManage && detail.currentFact && <div className="space-y-3 rounded-xl border border-border p-4"><h4 className="text-sm font-semibold">{c.current}</h4><p className="whitespace-pre-wrap break-words text-sm">{displayAnswer(detail.task.fieldKey, detail.currentFact.value)}</p><p className="text-xs text-ink-muted">{c.version} {detail.currentFact.recordVersion}</p>{detail.task.status === "ANSWERED" && <><p className="text-sm leading-relaxed text-ink-muted">{c.review}</p><Button disabled={busy || loading} onClick={() => void update("accept")}><Check aria-hidden="true" />{c.accept}</Button></>}{["OPEN", "ANSWERED"].includes(detail.task.status) && <Button variant="ghost" disabled={busy || loading} onClick={() => void update("cancel")}>{c.cancel}</Button>}</div>}
    {["ACCEPTED", "CANCELLED"].includes(detail.task.status) && <p className="text-sm text-ink-muted">{c.closed}</p>}<div className="border-t border-border pt-4"><h4 className="flex items-center gap-2 text-sm font-semibold"><History aria-hidden="true" className="size-4" />{c.history}</h4><ol className="mt-3 space-y-3">{detail.revisions.map(item => <li key={item.version} className="text-sm"><p>{c[item.action as "CREATE" | "ANSWER" | "ACCEPT" | "CANCEL"] ?? item.action} · {item.actorName} · {c.version} {item.version}</p><time dateTime={item.createdAt} className="text-xs text-ink-muted">{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time>{item.answer && <p className="mt-1 whitespace-pre-wrap break-words text-ink-muted">{displayAnswer(detail.task.fieldKey, item.answer)}</p>}</li>)}</ol>{detail.nextVersion && <Button variant="ghost" disabled={busy || loading} onClick={() => void open(detail.task.id, detail.nextVersion!)}>{c.earlier}</Button>}</div></article>}
    </div>
  </section>;
}
