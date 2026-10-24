"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/components/ui/view-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";

type DeskTab = "mine" | "new" | "queue";
/** Deep links from the Help menu: `?tab=new` (Report a problem) and `?tab=queue` (service agents). */
function tabFromUrl(): DeskTab | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "new" || value === "queue" || value === "mine" ? value : null;
}
function writeTab(tab: DeskTab) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") === tab) return;
  params.set("tab", tab);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
}

// SKO-441: the staff service desk. Report a problem in plain words (place, type, optional photo), follow its
// owner and updates, confirm the work or reopen it. Service teams see their queue — unassigned and overdue
// first — and a timeline where internal notes are marked and never shown to the requester.

type Ui = ReturnType<typeof useUiText>;
type Summary = { id: string; reference: string; title: string; location: string; category: string; team: string; safety: boolean; priority: string; status: string; blockedReason: string | null; owner: string | null; ownerId: string | null; requester: string; createdAt: string; resolveDueAt: string | null; responseDueAt: string | null; firstResponseAt: string | null; resolvedAt: string | null; reopenedCount: number; version: number; overdue: boolean; responseOverdue: boolean };
type Detail = Summary & { description: string; agent: boolean; watchers: { id: string; name: string }[]; events: { id: string; kind: string; visibility: string; actor: string | null; body: string | null; detail: Record<string, unknown>; attachment: string | null; createdAt: string }[] };
type Form = { campusId: string; categories: { id: string; name: string; kind: string; team: string; safety: boolean; responseHours: number | null; resolveHours: number | null }[]; rooms: { id: string; roomNumber: string }[]; suggestion: { categoryId: string; matches: number } | null };

async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "Your update was not saved. Try again.");
  return json.data;
}
const key = () => `sd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const readPhoto = (file: File) => new Promise<{ data: string; contentType: string }>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve({ data: String(r.result).split(",")[1] ?? "", contentType: file.type }); r.onerror = reject; r.readAsDataURL(file); });
const statusLabel = (ui: Ui, s: string, owned = false) => ({ OPEN: owned ? ui("Assigned · not started yet") : ui("Waiting for the team"), IN_PROGRESS: ui("In progress"), BLOCKED: ui("Waiting"), RESOLVED: ui("Work completed · awaiting your confirmation"), CLOSED: ui("Closed") } as Record<string, string>)[s] ?? s;
const priorityLabel = (ui: Ui, p: string) => ({ LOW: ui("Low"), NORMAL: ui("Normal"), HIGH: ui("High"), URGENT: ui("Urgent") } as Record<string, string>)[p] ?? p;

export function ServiceDesk() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [tab, setTabState] = useState<DeskTab>("mine");
  const setTab = useCallback((next: DeskTab) => { setTabState(next); writeTab(next); }, []);
  useEffect(() => { const wanted = tabFromUrl(); if (wanted) setTabState(wanted); }, []);
  const [mine, setMine] = useState<Summary[] | null>(null), [q, setQ] = useState<{ agent: boolean; lead?: boolean; requests: Summary[]; staff?: { id: string; name: string }[] } | null>(null);
  const [form, setForm] = useState<Form | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [draft, setDraft] = useState({ title: "", description: "", location: "", roomId: "", categoryId: "" }), [photo, setPhoto] = useState<{ data: string; contentType: string } | null>(null), [requestKey, setRequestKey] = useState(key);
  const [open, setOpen] = useState<Detail | null>(null), [message, setMessage] = useState(""), [reason, setReason] = useState(""), [assignee, setAssignee] = useState(""), [work, setWork] = useState(""), [due, setDue] = useState(""), [prio, setPrio] = useState("");
  const loadMine = useCallback(async () => { try { setMine(await call("/api/service-desk?view=mine")); setError(""); } catch (e) { setError(ui(e instanceof Error ? e.message : "Requests could not be loaded.")); } }, [ui]);
  const loadQueue = useCallback(async () => { try { setQ(await call("/api/service-desk?view=queue")); } catch { setQ({ agent: false, requests: [] }); } }, []);
  useEffect(() => { void loadMine(); void loadQueue(); }, [loadMine, loadQueue]);
  useEffect(() => { if (tab !== "new") return; const t = setTimeout(() => { void call(`/api/service-desk?view=form&text=${encodeURIComponent(`${draft.title} ${draft.description}`)}`).then((f: Form) => { setForm(f); if (f.suggestion && !draft.categoryId) setDraft(d => ({ ...d, categoryId: f.suggestion!.categoryId })); }).catch(() => undefined); }, 350); return () => clearTimeout(t); }, [tab, draft.title, draft.description, draft.categoryId]);
  const openRequest = async (id: string) => { try { const d = await call(`/api/service-desk/${id}`); setOpen(d); setMessage(""); setReason(""); setWork(""); setAssignee(d.ownerId ?? ""); setPrio(d.priority); setDue(d.resolveDueAt ? new Date(d.resolveDueAt).toISOString().slice(0, 16) : ""); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "This request is outside your service scope.")); } };
  const act = async (body: Record<string, unknown>, done: string) => {
    if (!open) return; setBusy(true);
    try { await call(`/api/service-desk/${open.id}`, "POST", { ...body, knownVersion: open.version }); toast.success(ui(done)); await openRequest(open.id); void loadMine(); void loadQueue(); }
    catch (e) { toast.error(ui(e instanceof Error ? e.message : "Your update was not saved. Try again.")); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true);
    try {
      const created = await call("/api/service-desk", "POST", { action: "request", ...draft, roomId: draft.roomId || undefined, photo: photo ?? undefined, idempotencyKey: requestKey });
      toast.success(ui("Request {0} received. You can track its status here.", [created.reference]));
      setDraft({ title: "", description: "", location: "", roomId: "", categoryId: "" }); setPhoto(null); setRequestKey(key()); setTab("mine"); await loadMine();
    } catch (e) { toast.error(ui(e instanceof Error ? e.message : "Your update was not saved. Try again.")); } finally { setBusy(false); }
  };
  const chosen = useMemo(() => form?.categories.find(c => c.id === draft.categoryId) ?? null, [form, draft.categoryId]);
  const list = (rows: Summary[], showRequester: boolean) => rows.length ? <ul className="space-y-2">{rows.map(r => <li key={r.id}>
    <Button type="button" variant="ghost" className={cn("block h-auto w-full whitespace-normal rounded-xl border p-3 text-start font-normal", r.overdue ? "border-status-error-border bg-status-error-surface" : !r.ownerId && ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(r.status) ? "border-status-warning-border bg-status-warning-surface" : "border-edge/40 bg-card")} onClick={() => void openRequest(r.id)} data-sd-row={r.reference} data-sd-status={r.status}>
      <p className="text-sm font-bold"><bdi>{r.reference}</bdi> · <span dir="auto">{r.title}</span>{r.safety ? <span className="ms-2 rounded bg-status-error-surface px-1.5 text-2xs font-bold text-status-error-text">{ui("Safety")}</span> : null}</p>
      <p className="text-xs text-ink-muted"><span dir="auto">{r.location}</span> · <span dir="auto">{r.category}</span> · {priorityLabel(ui, r.priority)} · {statusLabel(ui, r.status, Boolean(r.ownerId))}{r.status === "BLOCKED" && r.blockedReason ? <>: <span dir="auto">{r.blockedReason}</span></> : null}</p>
      <p className="text-xs">{r.owner ? <>{ui("Owner")}: <bdi>{r.owner}</bdi></> : <span className="font-bold text-status-warning-text">{ui("Unassigned")}</span>}{showRequester ? <> · {ui("Requested by {0}", [r.requester])}</> : null}{r.resolveDueAt ? <> · {ui("Due")} <bdi>{dateTime(r.resolveDueAt)}</bdi></> : null}{r.overdue ? <> · <span className="font-bold text-status-error-text">{ui("Overdue")}</span></> : null}{r.reopenedCount ? <> · {ui("Reopened {0}×", [String(r.reopenedCount)])}</> : null}</p>
    </Button></li>)}</ul> : <p className="rounded-xl border border-dashed p-4 text-sm text-ink-muted">{ui("No open requests match these filters.")}</p>;

  // The framed route's one page card (RoleFrame) is the surface; the desk draws no card of its own (addendum item 2).
  return <section className="min-w-0 max-w-full space-y-4" data-service-desk>
    <PageHeader
      title="Service desk"
      description="Report repairs, access, supplies or questions. Each request gets a reference and an owner."
      tabs={<ViewTabs ariaLabel="Service desk sections" value={tab === "queue" && !q?.agent ? "mine" : tab} onChange={(id) => setTab(id as DeskTab)} items={[{ id: "mine", label: "My requests" }, { id: "new", label: "New request" }, { id: "queue", label: "Service queue", hidden: !q?.agent }]} />}
    />

    {tab === "mine" || (tab === "queue" && q && !q.agent) ? (error && !mine ? <ErrorState description={error} onRetry={() => void loadMine()} retryLabel={ui("Try again")} /> : mine ? list(mine, false) : <SkeletonList rows={3} label={ui("Loading assignments and latest updates.")} />) : null}
    {tab === "queue" && q ? <div data-sd-queue><p className="mb-2 text-xs text-ink-muted">{ui("Unassigned and overdue requests are listed first.")}</p>{list(q.requests, true)}</div> : null}
    {tab === "new" ? <div className="min-w-0 space-y-3" data-sd-new>
      <p className="rounded-lg bg-status-warning-surface p-2 text-xs text-status-warning-text">{ui("Safety concerns follow the school's escalation procedure. Confidential or safeguarding concerns use the restricted workflow, not this desk.")}</p>
      <FormField name="sd-title" label={ui("What is the problem?")}><Input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} maxLength={120} /></FormField>
      <FormField name="sd-description" label={ui("Describe it")}><Textarea rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></FormField>
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField name="sd-location" label={ui("Where is it?")}><Input value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} maxLength={160} /></FormField>
        <FormField name="sd-room" label={ui("Room (optional)")}><Select className="w-full min-w-0" value={draft.roomId} onChange={e => setDraft({ ...draft, roomId: e.target.value, location: draft.location || (form?.rooms.find(r => r.id === e.target.value)?.roomNumber ?? "") })}><option value="">—</option>{form?.rooms.map(r => <option key={r.id} value={r.id}>{r.roomNumber}</option>)}</Select></FormField>
      </div>
      <FormField name="sd-category" label={ui("Who should handle this request?")} hint={form?.suggestion && form.suggestion.categoryId === draft.categoryId ? ui("Suggested from your description. Change it if it is wrong.") : undefined}>
        <Select className="w-full min-w-0" value={draft.categoryId} onChange={e => setDraft({ ...draft, categoryId: e.target.value })} data-sd-category><option value="">{ui("Choose a type")}</option>{form?.categories.map(c => <option key={c.id} value={c.id}>{c.name} · {c.team}{c.safety ? ` · ${ui("Safety")}` : ""}</option>)}</Select></FormField>
      {chosen ? <p className="text-xs text-ink-muted" data-sd-target>{chosen.resolveHours ? ui("The school aims to resolve this within {0} hours.", [String(chosen.resolveHours)]) : ui("The school has not set a target time for this type.")}</p> : null}
      <FormField name="sd-photo" label={ui("Photo (optional)")}><input className="block w-full max-w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={async e => { const f = e.target.files?.[0]; setPhoto(f ? await readPhoto(f) : null); }} data-sd-photo /></FormField>
      <div className="flex justify-end"><Button disabled={busy || !draft.title.trim() || !draft.description.trim() || !draft.location.trim() || !draft.categoryId} onClick={() => void submit()} data-sd-submit>{ui("Send request")}</Button></div>
    </div> : null}

    {open ? <Modal title={open.title} eyebrow={open.reference} subtitle={`${open.location} · ${open.category} · ${open.team}`} onClose={() => setOpen(null)} wide>
      <div className="space-y-4" data-sd-detail data-sd-agent={open.agent ? "true" : "false"}>
        <p className="text-sm" dir="auto">{open.description}</p>
        <p className="text-xs">{statusLabel(ui, open.status, Boolean(open.ownerId))} · {priorityLabel(ui, open.priority)} · {open.owner ? <>{ui("Owner")}: <bdi>{open.owner}</bdi></> : <span className="font-bold text-status-warning-text">{ui("Unassigned")}</span>}{open.resolveDueAt ? <> · {ui("Due")} <bdi>{dateTime(open.resolveDueAt)}</bdi></> : null}{open.firstResponseAt ? <> · {ui("First response")} <bdi>{dateTime(open.firstResponseAt)}</bdi></> : null}</p>
        <ol className="space-y-2 border-s-2 border-edge/50 ps-3" data-sd-timeline>{open.events.map(e => <li key={e.id} className={cn("text-sm", e.visibility === "INTERNAL" && "rounded-lg bg-surface-subtle p-2")} data-sd-event={e.kind} data-sd-visibility={e.visibility}>
          <p className="text-xs text-ink-muted"><bdi>{dateTime(e.createdAt)}</bdi>{e.actor ? <> · <bdi>{e.actor}</bdi></> : null} · {kindLabel(ui, e.kind, e.detail)}{e.visibility === "INTERNAL" ? <span className="ms-2 rounded bg-muted px-1 text-2xs font-bold">{ui("Internal — not shown to the requester")}</span> : null}</p>
          {e.body ? <p dir="auto">{e.body}</p> : null}{e.attachment ? <a className="text-xs underline" href={e.attachment} target="_blank" rel="noreferrer">{ui("Photo")}</a> : null}
        </li>)}</ol>

        {open.agent && ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(open.status) ? <div className="space-y-2 rounded-xl border p-3" data-sd-agent-actions>
          <div className="flex flex-wrap items-end gap-2">
            <FormField name="sd-owner" label={ui("Owner")}><Select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">{ui("Unassigned")}</option>{q?.staff?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField>
            <Button size="sm" variant="outline" disabled={busy || assignee === (open.ownerId ?? "")} onClick={() => void act({ action: "assign", ownerId: assignee || null, reason }, "Request assigned; the requester can track its status.")} data-sd-assign>{ui("Assign")}</Button>
            {open.status !== "IN_PROGRESS" ? <Button size="sm" disabled={busy} onClick={() => void act({ action: "start" }, "Work started.")} data-sd-start>{ui("Start work")}</Button> : null}
          </div>
          <FormField name="sd-reason" label={ui("Reason (needed for priority, due date or blocking)")}><Input value={reason} onChange={e => setReason(e.target.value)} /></FormField>
          <div className="flex flex-wrap items-end gap-2">
            <FormField name="sd-priority" label={ui("Priority")}><Select value={prio} onChange={e => setPrio(e.target.value)}>{["LOW", "NORMAL", "HIGH", "URGENT"].map(p => <option key={p} value={p}>{priorityLabel(ui, p)}</option>)}</Select></FormField>
            <Button size="sm" variant="outline" disabled={busy || prio === open.priority || !reason.trim()} onClick={() => void act({ action: "priority", priority: prio, reason }, "Priority changed.")} data-sd-priority>{ui("Change priority")}</Button>
            <FormField name="sd-due" label={ui("Due")}><Input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></FormField>
            <Button size="sm" variant="outline" disabled={busy || !due || !reason.trim()} onClick={() => void act({ action: "due", resolveDueAt: new Date(due).toISOString(), reason }, "Due time changed.")} data-sd-due>{ui("Change due time")}</Button>
            <Button size="sm" variant="secondary" disabled={busy || !reason.trim()} onClick={() => void act({ action: "block", reason }, "Marked as waiting.")} data-sd-block>{ui("Mark as waiting")}</Button>
          </div>
          <FormField name="sd-message" label={ui("Message")}><Textarea rows={2} value={message} onChange={e => setMessage(e.target.value)} /></FormField>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={busy || !message.trim()} onClick={() => void act({ action: "note", body: message }, "Internal note saved.")} data-sd-note>{ui("Save internal note")}</Button>
            <Button size="sm" variant="outline" disabled={busy || !message.trim()} onClick={() => void act({ action: "update", body: message }, "Update sent to the requester.")} data-sd-update>{ui("Send update to requester")}</Button>
          </div>
          <FormField name="sd-work" label={ui("Work performed")}><Textarea rows={2} value={work} onChange={e => setWork(e.target.value)} /></FormField>
          <div className="flex justify-end"><Button size="sm" disabled={busy || !work.trim()} onClick={() => void act({ action: "resolve", workPerformed: work }, "Marked as resolved; the requester will confirm.")} data-sd-resolve>{ui("Mark resolved")}</Button></div>
        </div> : null}

        {!open.agent || open.status === "RESOLVED" || open.status === "CLOSED" ? <div className="space-y-2 rounded-xl border p-3" data-sd-requester-actions>
          {open.status === "RESOLVED" ? <p className="text-sm font-bold">{ui("Repair completed · awaiting your confirmation")}</p> : null}
          <FormField name="sd-reply" label={ui("Message")}><Textarea rows={2} value={message} onChange={e => setMessage(e.target.value)} /></FormField>
          <div className="flex flex-wrap justify-end gap-2">
            {["OPEN", "IN_PROGRESS", "BLOCKED"].includes(open.status) && !open.agent ? <Button size="sm" variant="outline" disabled={busy || !message.trim()} onClick={() => void act({ action: "comment", body: message }, "Message sent.")} data-sd-comment>{ui("Send message")}</Button> : null}
            {open.status === "RESOLVED" && !open.agent ? <Button size="sm" disabled={busy} onClick={() => void act({ action: "confirm", body: message }, "Thank you. The request is closed.")} data-sd-confirm>{ui("Confirm resolved")}</Button> : null}
            {["RESOLVED", "CLOSED"].includes(open.status) ? <Button size="sm" variant="secondary" disabled={busy || !message.trim()} onClick={() => void act({ action: "reopen", reason: message }, "Request reopened.")} data-sd-reopen>{ui("Reopen request")}</Button> : null}
          </div>
        </div> : null}
      </div>
    </Modal> : null}
  </section>;
}

const kindLabel = (ui: Ui, kind: string, detail: Record<string, unknown>) => ({
  CREATED: ui("Request received"), ASSIGNED: detail.owner !== undefined ? (detail.owner ? ui("Assigned to {0}", [String(detail.owner)]) : ui("Unassigned")) : ui("Owner changed"), PRIORITY: ui("Priority changed"), DUE: ui("Due time changed"),
  STATUS: ui("Work started"), BLOCKED: ui("Waiting"), NOTE: ui("Internal note"), UPDATE: detail.fromRequester ? ui("Message from the requester") : ui("Update"), RESOLVED: ui("Work completed"), CONFIRMED: ui("Confirmed resolved"), REOPENED: ui("Reopened"), ESCALATED: ui("Escalated: past its due time"),
} as Record<string, string>)[kind] ?? kind;
