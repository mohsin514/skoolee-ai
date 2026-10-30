"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, CheckCircle2, FileText, Inbox, Lock, MessageSquare, Plus, UserX } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { DeskFilterStatus, DeskPill, DeskRowIcon, DeskSection, DeskStats, RelativeTime, StatTile, deskRow, deskTimeline, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { PanelTitle } from "@/components/shared-admin";
import { Modal } from "@/components/ui/modal";
import { usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";
import { downloadCSV } from "@/lib/csv";

import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";

// SKO-467: intake (routine or confidential), a queue with owner and due date, and a case view where the
// original report stays fixed and every assignment, note, resolution and reopening is appended.

type Row = { id: string; referenceCode: string; type: string; complainantName: string; confidential: boolean; status: Status; date: string; dueDate: string | null; reopenedCount: number; version: number; owner: { id: string; fullName: string } | null; overdue: boolean };
type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED";
type Event = { id: string; kind: string; fromStatus: string | null; toStatus: string | null; note: string | null; ownerName: string | null; dueDate: string | null; actorName: string | null; createdAt: string };
type Detail = Row & { description: string | null; phone: string | null; publicResponse: string | null; resolution: string | null; resolvedAt: string | null; events: Event[] };
type Owner = { id: string; fullName: string; role?: string };
// role-ux G40: only the front desk and campus admins own front-office work; the server refuses anyone else.
const OWNER_ROLES = new Set(["CAMPUS_ADMIN", "ADMIN", "RECEPTIONIST"]);
const STATUS_LABEL: Record<Status, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved" };
const EVENT_LABEL: Record<string, string> = { CREATED: "Received", ASSIGNED: "Owner and due date set", NOTE: "Internal note", STATUS: "Work started", RESOLVED: "Resolved", REOPENED: "Reopened" };
const EVENT_TONE: Record<string, DeskTone> = { CREATED: "info", ASSIGNED: "brand", NOTE: "neutral", STATUS: "brand", RESOLVED: "success", REOPENED: "warning" };
const rowTone = (row: Row): DeskTone | "muted" | undefined => row.overdue ? "danger" : row.status === "RESOLVED" ? "success" : !row.owner ? "warning" : undefined;
const rowRank = (row: Row) => row.overdue ? 0 : row.status !== "RESOLVED" && !row.owner ? 1 : row.status === "OPEN" ? 2 : row.status === "IN_PROGRESS" ? 3 : 4;
const todayText = () => new Date().toISOString().slice(0, 10);
const EMPTY = { complainantName: "", anonymous: false, type: "", description: "", date: todayText(), phone: "", confidential: false, ownerId: "", dueDate: "" };

async function call(method: string, body: Record<string, unknown>) {
  const response = await fetch("/api/front-desk/complaints", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "The change was not saved.");
  return json;
}

/**
 * `hideHeader` hands the title and "Record complaint" to the console's PageHeader; `command` "record-complaint"
 * opens intake and "export" saves the complaints the filters show as CSV (§4.4b Front desk · Export), once loaded.
 */
export function ComplaintsDesk({ hideHeader = false, command }: { hideHeader?: boolean; command?: PanelCommand | null } = {}) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [rows, setRows] = useState<Row[]>([]), [counts, setCounts] = useState({ active: 0, unassigned: 0, overdue: 0 }), [leader, setLeader] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [status, setStatus] = useState("active"), [owner, setOwner] = useState(""), [q, setQ] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false), [openId, setOpenId] = useState<string | null>(null);
  // A pressed counter narrows the loaded queue to its cases; pressing it again shows everything.
  const [focus, setFocus] = useState<"unassigned" | "overdue" | null>(null);
  const toggle = (next: "unassigned" | "overdue") => setFocus(current => current === next ? null : next);
  const shown = urgencyFirst(rows.filter(row => focus === "unassigned" ? !row.owner && row.status !== "RESOLVED" : focus === "overdue" ? row.overdue : true), rowRank);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (owner === "overdue") params.set("overdue", "1"); else if (owner) params.set("owner", owner);
      if (q.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/front-desk/complaints?${params}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(response.status === 403 ? ui("You do not have access to complaints for this campus.") : json.error || ui("Complaints could not be loaded."));
      setRows(json.data); setCounts(json.counts); setLeader(json.canSeeConfidential);
    } catch (failure) { setLoadError(failure instanceof Error ? ui(failure.message) : ui("Complaints could not be loaded.")); } finally { setLoading(false); }
  }, [status, owner, q, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(timer); }, [load, q]);
  // Owner candidates (G40, F13): the campus's admins — including a single school's admin — and receptionists. The
  // complaints route's older `?owners=1` list still names the principal and omits ADMIN, so the candidates come from
  // the front-desk list that serves them (the smallest one: callbacks the viewer owns).
  useEffect(() => { void fetch("/api/front-desk/phone-calls?view=mine", { cache: "no-store" }).then(r => r.json()).then(json => json.success && Array.isArray(json.owners) && setOwners((json.owners as Owner[]).filter(person => !person.role || OWNER_ROLES.has(person.role)))).catch(() => undefined); }, []);
  usePanelCommand(command, { "record-complaint": () => setIntakeOpen(true) });
  usePanelCommand(command, {
    export: () => {
      if (loadError) return;
      if (!rows.length) { toast.info(ui("Nothing to export yet.")); return; }
      downloadCSV(`complaints-${todayText()}`, [
        ["Reference", "Category", "Complainant", "Confidential", "Status", "Received", "Owner", "Response due", "Past response date"],
        ...rows.map(row => [row.referenceCode, row.type, row.complainantName, row.confidential ? "Yes" : "No", STATUS_LABEL[row.status], row.date.slice(0, 10), row.owner?.fullName ?? "", row.dueDate?.slice(0, 10) ?? "", row.overdue ? "Yes" : "No"]),
      ]);
    },
  }, !loading);

  return <div className={hideHeader ? "space-y-4" : "sk-panel space-y-4 p-5"} data-complaints-desk>
    {hideHeader ? null : <div className="flex flex-wrap items-center justify-between gap-3">
      <PanelTitle icon={MessageSquare} title={ui("Complaints")} />
      <Button onClick={() => setIntakeOpen(true)}><Plus className="size-4" aria-hidden="true" />{ui("Record complaint")}</Button>
    </div>}
    <DeskStats aria-live="polite" data-complaint-counts>
      <StatTile index={0} icon={Inbox} tone="brand" value={counts.active} label={<><span aria-hidden="true">{ui("Open and in progress")}</span><span className="sr-only">{ui("Active: {0}", [counts.active])}</span></>} />
      <StatTile index={1} icon={UserX} tone={counts.unassigned ? "warning" : "neutral"} value={counts.unassigned} valueProps={{ "data-unassigned": counts.unassigned }} onSelect={counts.unassigned || focus === "unassigned" ? () => toggle("unassigned") : undefined} selected={focus === "unassigned"} label={<><span aria-hidden="true">{ui("Unassigned")}</span><span className="sr-only">{ui("Unassigned: {0}", [counts.unassigned])}</span></>} />
      <StatTile index={2} icon={AlarmClock} tone={counts.overdue ? "danger" : "success"} value={counts.overdue} valueProps={{ "data-overdue": counts.overdue }} onSelect={counts.overdue || focus === "overdue" ? () => toggle("overdue") : undefined} selected={focus === "overdue"} label={<><span aria-hidden="true">{ui("Past response date")}</span><span className="sr-only">{ui("Past response date: {0}", [counts.overdue])}</span></>} />
    </DeskStats>
    <div className="grid gap-3 sm:grid-cols-3">
      <FormField name="complaint-filter-status" label={ui("Status")}><Select value={status} onChange={event => setStatus(event.target.value)}><option value="active">{ui("Open and in progress")}</option><option value="OPEN">{ui("Open")}</option><option value="IN_PROGRESS">{ui("In progress")}</option><option value="RESOLVED">{ui("Resolved")}</option><option value="all">{ui("All complaints")}</option></Select></FormField>
      <FormField name="complaint-filter-owner" label={ui("Owner")}><Select value={owner} onChange={event => setOwner(event.target.value)}><option value="">{ui("Anyone")}</option><option value="me">{ui("Assigned to me")}</option><option value="unassigned">{ui("Unassigned")}</option><option value="overdue">{ui("Past response date")}</option></Select></FormField>
      <FormField name="complaint-filter-q" label={ui("Search reference, category or name")}><Input value={q} onChange={event => setQ(event.target.value)} /></FormField>
    </div>

    {loading && !rows.length ? <SkeletonList rows={3} label={ui("Loading complaints…")} />
      : loadError ? <ErrorState description={loadError} onRetry={() => void load()} retryLabel={ui("Retry")} />
      : !rows.length ? <EmptyState size="sm" icon={MessageSquare} title={status !== "active" || owner || q ? ui("No complaints match these filters.") : ui("No open complaints. Record a complaint when one is received.")} action={status !== "active" || owner || q ? undefined : <Button size="sm" onClick={() => setIntakeOpen(true)}><Plus className="size-4" aria-hidden="true" />{ui("Record complaint")}</Button>} />
      : <div className="space-y-2.5"><DeskFilterStatus shown={shown.length} total={rows.length} onClear={() => setFocus(null)} /><ul className="space-y-2.5" aria-label={ui("Complaints")}>{shown.map(row => <li key={row.id} data-tone={rowTone(row)} className={`${deskRow} flex flex-wrap items-center gap-3 text-sm`} data-complaint={row.referenceCode} data-complaint-status={row.status} data-confidential={row.confidential}>
        <DeskRowIcon icon={row.confidential ? Lock : row.status === "RESOLVED" ? CheckCircle2 : MessageSquare} />
        <div className="min-w-0 flex-1 basis-48 space-y-0.5">
          <p className="font-semibold text-ink-strong"><bdi className="font-mono text-xs font-semibold text-primary">{row.referenceCode}</bdi> <span className="text-ink-faint">·</span> <bdi>{row.type}</bdi>{row.confidential ? <DeskPill tone="info" className="ms-2"><Lock className="size-3" aria-hidden="true" />{ui("Confidential")}</DeskPill> : null}</p>
          <p className="text-xs text-ink-muted"><bdi>{row.complainantName}</bdi> · {ui("Received {0}", [formatDate(row.date)])}{row.reopenedCount ? ` · ${ui("Reopened {0} time(s)", [row.reopenedCount])}` : ""}</p>
          <p className="text-xs text-ink-muted">{row.owner ? ui("Owner: {0}", [row.owner.fullName]) : <span className="font-bold text-status-warning-text">{ui("Unassigned")}</span>}{row.dueDate ? ` · ${ui("Response due {0}", [formatDate(row.dueDate)])}` : ""}</p>
        </div>
        <DeskPill tone={row.overdue ? "danger" : row.status === "RESOLVED" ? "success" : row.status === "IN_PROGRESS" ? "brand" : "info"}>{row.overdue ? ui("Past response date") : ui(STATUS_LABEL[row.status])}</DeskPill>
        {row.dueDate && row.status !== "RESOLVED" ? <span className={`text-xs font-semibold tabular-nums ${row.overdue ? "text-status-error-text" : "text-ink-muted"}`}><RelativeTime iso={row.dueDate} full={formatDate(row.dueDate)} /></span> : null}
        <Button size="sm" variant="secondary" onClick={() => setOpenId(row.id)} aria-label={ui("Open complaint {0}", [row.referenceCode])}>{ui("Open")}</Button>
      </li>)}</ul></div>}

    {intakeOpen ? <IntakeDialog owners={owners} leader={leader} onClose={() => setIntakeOpen(false)} onDone={() => { setIntakeOpen(false); void load(); }} /> : null}
    {openId ? <CaseDialog id={openId} owners={owners} leader={leader} onClose={() => setOpenId(null)} onChanged={() => void load()} /> : null}
  </div>;
}

function IntakeDialog({ owners, leader, onClose, onDone }: { owners: Owner[]; leader: boolean; onClose: () => void; onDone: () => void }) {
  const ui = useUiText();
  const [form, setForm] = useState(EMPTY), [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState<string | null>(null);
  const draft = useFormDraft({ record: "reception:complaint-intake", schema: 1, values: form, baseline: EMPTY, fields: ["complainantName", "anonymous", "type", "description", "date", "phone", "ownerId", "dueDate"] as const, enabled: !form.confidential, apply: values => setForm(current => ({ ...current, complainantName: String(values.complainantName ?? ""), anonymous: Boolean(values.anonymous), type: String(values.type ?? ""), description: String(values.description ?? ""), date: String(values.date ?? current.date), phone: String(values.phone ?? ""), ownerId: String(values.ownerId ?? ""), dueDate: String(values.dueDate ?? "") })) });
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const set = (field: keyof typeof EMPTY) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [field]: event.target.value }));
  const submit = async () => {
    if ((!form.anonymous && form.complainantName.trim().length < 2) || form.type.trim().length < 2 || form.description.trim().length < 10 || !form.date) { setError(ui("Enter who complained (or mark it anonymous), a category, what happened (at least 10 characters) and the date received.")); return; }
    const payload = { ...form, ownerId: form.ownerId || undefined, dueDate: form.dueDate || undefined };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const json = await call("POST", { ...payload, idempotencyKey: attempt.current.key });
      draft.markSaved();
      setReceipt(json.data.referenceCode);
      toast.success(json.replayed ? ui("This complaint was already recorded; nothing was added twice.") : ui("Complaint {0} recorded.", [json.data.referenceCode]));
    } catch (failure) {
      setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Your details are kept; retrying will not record the complaint twice.") : ui(failure instanceof Error ? failure.message : "The change was not saved."));
    } finally { setBusy(false); }
  };
  if (receipt) return <Modal title={ui("Complaint recorded")} eyebrow={ui("Complaints")} onClose={onDone}>
    <div className="space-y-3" data-complaint-receipt={receipt}>
      <p className="text-sm">{ui("Give the complainant this reference: {0}", [receipt])}</p>
      {form.confidential ? <Alert tone="info" compact live="off">{ui("This confidential concern has gone to your campus admin. It will not appear in the reception queue.")}</Alert> : null}
      <div className="flex justify-end"><Button onClick={onDone}>{ui("Done")}</Button></div>
    </div>
  </Modal>;
  return <Modal title={ui("Record complaint")} eyebrow={ui("Complaints")} subtitle={ui("Write down what was reported. The original report cannot be edited later; follow-up is added as notes.")} onClose={onClose} dirty={Boolean(form.description || form.complainantName)}>
    <div className="space-y-3" data-complaint-intake>
      <DraftRecovery recordLabel={ui("Complaint")} draft={draft} saving={busy} excluded={ui("Confidential complaints are excluded from browser drafts.")} />
      {error ? <Alert tone="danger" compact data-complaint-error>{error}</Alert> : null}
      <fieldset className="space-y-2 rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-semibold">{ui("Kind of concern")}</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="complaint-kind" checked={!form.confidential} onChange={() => setForm(current => ({ ...current, confidential: false }))} />{ui("Routine issue (service, facilities, fees, transport)")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="complaint-kind" checked={form.confidential} onChange={() => setForm(current => ({ ...current, confidential: true, ownerId: leader ? current.ownerId : "" }))} />{ui("Confidential concern (about a child's safety or a member of staff)")}</label>
        {form.confidential ? <p className="text-xs text-ink-muted">{ui("Only campus leaders and the person they assign can see a confidential concern. Record what was said, without judging it.")}</p> : null}
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.anonymous} onChange={event => setForm(current => ({ ...current, anonymous: event.target.checked }))} />{ui("The complainant wants to stay anonymous")}</label>
      {!form.anonymous ? <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="complaint-name" label={ui("Complainant name")}><Input value={form.complainantName} maxLength={120} onChange={set("complainantName")} /></FormField>
        <FormField name="complaint-phone" label={ui("Phone (optional)")}><Input value={form.phone} inputMode="tel" maxLength={30} onChange={set("phone")} /></FormField>
      </div> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="complaint-type" label={ui("Category")}><Input value={form.type} maxLength={60} onChange={set("type")} /></FormField>
        <FormField name="complaint-date" label={ui("Date received")}><Input type="date" value={form.date} max={todayText()} onChange={set("date")} /></FormField>
      </div>
      <FormField name="complaint-description" label={ui("What happened")}><Textarea value={form.description} maxLength={5000} rows={4} onChange={set("description")} /></FormField>
      {!form.confidential || leader ? <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="complaint-owner" label={ui("Owner (optional)")}><Select value={form.ownerId} onChange={set("ownerId")}><option value="">{ui("Unassigned")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
        <FormField name="complaint-due" label={ui("Response due (optional)")}><Input type="date" value={form.dueDate} min={form.date} onChange={set("dueDate")} /></FormField>
      </div> : null}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void submit()} loading={busy} disabled={busy}>{ui("Record complaint")}</Button></div>
    </div>
  </Modal>;
}

function CaseDialog({ id, owners, leader, onClose, onChanged }: { id: string; owners: Owner[]; leader: boolean; onClose: () => void; onChanged: () => void }) {
  const ui = useUiText();
  const { date: formatDate, dateTime } = useLocaleFormat();
  const [detail, setDetail] = useState<Detail | null>(null), [loadError, setLoadError] = useState("");
  const [ownerId, setOwnerId] = useState(""), [dueDate, setDueDate] = useState(""), [note, setNote] = useState(""), [publicResponse, setPublicResponse] = useState(""), [resolution, setResolution] = useState(""), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/front-desk/complaints?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) { setLoadError(ui(json.error || "This complaint could not be loaded.")); return; }
    setDetail(json.data); setOwnerId(json.data.owner?.id ?? ""); setDueDate(json.data.dueDate?.slice(0, 10) ?? ""); setPublicResponse(json.data.publicResponse ?? "");
  }, [id, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const run = async (body: Record<string, unknown>, message: string) => {
    if (!detail) return;
    setBusy(true); setError("");
    try { await call("PATCH", { id, version: detail.version, ...body }); toast.success(ui(message)); setNote(""); setResolution(""); setReason(""); await load(); onChanged(); }
    catch (failure) { setError(ui(failure instanceof Error ? failure.message : "The change was not saved.")); }
    finally { setBusy(false); }
  };
  const canAssign = detail && (!detail.confidential || leader);
  return <Modal title={detail ? ui("Complaint {0}", [detail.referenceCode]) : ui("Complaint")} eyebrow={ui("Complaints")} size="lg" onClose={onClose} dirty={Boolean(note || resolution || reason)}>
    {loadError ? <ErrorState description={loadError} onRetry={() => { setLoadError(""); void load(); }} retryLabel={ui("Retry")} /> : !detail ? <SkeletonList rows={3} label={ui("Loading complaints…")} /> : <div className="space-y-4" data-complaint-case={detail.referenceCode}>
      {error ? <Alert tone="danger" compact data-case-error>{error}</Alert> : null}
      <DeskSection title={ui("Original report")} icon={FileText} tone={detail.confidential ? "info" : "brand"} className="text-sm" aria-label={ui("Original report")} action={<span className="text-xs text-ink-muted">{ui("Received {0}", [formatDate(detail.date)])}</span>}>
        <p className="font-semibold text-ink-strong"><bdi>{detail.type}</bdi> · <bdi>{detail.complainantName}</bdi>{detail.phone ? <> · <bdi>{detail.phone}</bdi></> : null}</p>
        <p className="whitespace-pre-wrap"><bdi>{detail.description}</bdi></p>
      </DeskSection>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink-strong" data-case-status={detail.status}><DeskPill tone={detail.overdue ? "danger" : detail.status === "RESOLVED" ? "success" : detail.status === "IN_PROGRESS" ? "brand" : "info"}>{ui(STATUS_LABEL[detail.status])}</DeskPill>{detail.owner ? ` · ${ui("Owner: {0}", [detail.owner.fullName])}` : ` · ${ui("Unassigned")}`}{detail.dueDate ? ` · ${ui("Response due {0}", [formatDate(detail.dueDate)])}` : ""}{detail.overdue ? ` · ${ui("Past response date")}` : ""}</p>
      {detail.status !== "RESOLVED" && canAssign ? <div className="grid items-end gap-3 sm:grid-cols-3">
        <FormField name="case-owner" label={ui("Owner")}><Select value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">{ui("Unassigned")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
        <FormField name="case-due" label={ui("Response due")}><Input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></FormField>
        <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "assign", ownerId: ownerId || null, dueDate: dueDate || null }, "Owner and due date saved.")}>{ui("Save owner and due date")}</Button>
      </div> : null}
      {detail.status !== "RESOLVED" ? <div className="space-y-2">
        <FormField name="case-note" label={ui("Internal note (staff only)")}><Textarea value={note} rows={2} maxLength={2000} onChange={event => setNote(event.target.value)} /></FormField>
        <FormField name="case-public" label={ui("Response for the complainant")}><Textarea value={publicResponse} rows={2} maxLength={2000} onChange={event => setPublicResponse(event.target.value)} /></FormField>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy || note.trim().length < 2} onClick={() => void run({ action: "note", note, publicResponse }, "Note added.")}>{ui("Add note")}</Button>
          {detail.status === "OPEN" ? <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "start" }, "Marked in progress.")}>{ui("Mark in progress")}</Button> : null}
        </div>
        <FormField name="case-resolution" label={ui("Resolution (required to resolve)")}><Textarea value={resolution} rows={2} maxLength={2000} onChange={event => setResolution(event.target.value)} /></FormField>
        <Button disabled={busy} onClick={() => { if (resolution.trim().length < 5) { setError(ui("Describe the resolution (at least 5 characters).")); return; } void run({ action: "resolve", resolution, publicResponse }, "Complaint resolved."); }}>{ui("Resolve")}</Button>
      </div> : <div className="space-y-2">
        <Alert tone="success" compact live="off" data-case-resolution><bdi>{detail.resolution}</bdi></Alert>
        <FormField name="case-reopen" label={ui("Reason for reopening")}><Input value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></FormField>
        <Button variant="secondary" disabled={busy} onClick={() => { if (reason.trim().length < 5) { setError(ui("Explain why the complaint is reopened (at least 5 characters).")); return; } void run({ action: "reopen", reason }, "Complaint reopened."); }}>{ui("Reopen")}</Button>
      </div>}
      <section aria-label={ui("History")}>
        <p className="sk-eyebrow mb-3">{ui("History")}</p>
        <ol className={`${deskTimeline} text-xs`} data-case-history>{detail.events.map(event => <li key={event.id} data-tone={EVENT_TONE[event.kind] ?? "brand"} className={event.kind === "NOTE" ? "rounded-xl bg-surface-subtle p-2.5" : undefined} data-event={event.kind}>
          <p className="font-semibold text-ink-strong">{ui(EVENT_LABEL[event.kind] ?? event.kind)} · {dateTime(event.createdAt)}{event.actorName ? ` · ${event.actorName}` : ""}</p>
          {event.kind === "ASSIGNED" ? <p>{event.ownerName ? ui("Owner: {0}", [event.ownerName]) : ui("Unassigned")}{event.dueDate ? ` · ${ui("Response due {0}", [formatDate(event.dueDate)])}` : ""}</p> : null}
          {event.note ? <p className="whitespace-pre-wrap"><bdi>{event.note}</bdi></p> : null}
        </li>)}</ol>
      </section>
    </div>}
  </Modal>;
}
