"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, CheckCircle2, History, Lock, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, Plus, UserCheck, UserX } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { PanelTitle } from "@/components/shared-admin";
import { Modal } from "@/components/ui/modal";
import { usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";
import { downloadCSV } from "@/lib/csv";

import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { DeskFilterStatus, DeskPill, DeskRowIcon, DeskSection, DeskStats, RelativeTime, StatTile, deskRow, deskTimeline, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/tooltip";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";

// SKO-465: the reception call log. Calls are recorded once; a promised callback is an owned task that
// stays open through attempts and reschedules until an outcome is recorded. Notes marked sensitive are
// withheld from anyone who may not read them, and the queue defaults to open callbacks.

type Owner = { id: string; fullName: string; role?: string };
// role-ux G40: only the front desk and campus admins own front-office work; the server refuses anyone else.
const OWNER_ROLES = new Set(["CAMPUS_ADMIN", "ADMIN", "RECEPTIONIST"]);
type Callback = { id: string; ownerId: string | null; owner: Owner | null; dueAt: string; status: "OPEN" | "DONE"; attempts: number; outcome: string | null; completedAt: string | null; previousId: string | null; version: number; overdue: boolean };
type Call = { id: string; name: string; phone: string; direction: "IN" | "OUT"; date: string; purpose: string | null; note: string | null; noteWithheld: boolean; sensitive: boolean; callbacks: Callback[] };
type HistoryEvent = { id: string; kind: string; dueAt: string | null; createdAt: string; note: string | null; actorName: string | null; ownerName: string | null };
type Ui = ReturnType<typeof useUiText>;
const eventTone = (kind: string): DeskTone => ({ CREATED: "info", REASSIGNED: "brand", RESCHEDULED: "brand", ATTEMPTED: "warning", COMPLETED: "success" } as Record<string, DeskTone>)[kind] ?? "brand";
const openCallbacks = (row: Call) => row.callbacks.filter(callback => callback.status === "OPEN");
/** A call's row tone follows its most urgent open callback: overdue, then unowned. */
const callTone = (row: Call): DeskTone | undefined => openCallbacks(row).some(callback => callback.overdue) ? "danger" : openCallbacks(row).some(callback => !callback.ownerId) ? "warning" : undefined;
const callRank = (row: Call) => ({ danger: 0, warning: 1 } as Record<string, number>)[callTone(row) ?? ""] ?? (openCallbacks(row).length ? 2 : 3);
type Focus = "overdue" | "unassigned" | null;
const eventLabel = (ui: Ui, kind: string) => ({ CREATED: ui("Callback promised"), REASSIGNED: ui("Owner changed"), RESCHEDULED: ui("Due time changed"), ATTEMPTED: ui("Attempt without outcome"), COMPLETED: ui("Completed") } as Record<string, string>)[kind] ?? kind;

/** "Now" as a school-local wall time for a datetime-local input. */
function localNow(timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

async function call(method: string, body: Record<string, unknown>) {
  const response = await fetch("/api/front-desk/phone-calls", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "The change was not saved.");
  return json;
}

/**
 * `hideHeader` hands the title and "Log call" to the console's PageHeader; `command` "log-call" opens the form and
 * "export" saves the calls the filters show as CSV (§4.4b Front desk · Export), once loaded. Call notes are never
 * exported: sensitive ones are restricted to named readers.
 */
export function PhoneCallLog({ hideHeader = false, command }: { hideHeader?: boolean; command?: PanelCommand | null } = {}) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [rows, setRows] = useState<Call[]>([]), [counts, setCounts] = useState({ open: 0, overdue: 0, unassigned: 0, mine: 0 });
  const [owners, setOwners] = useState<Owner[]>([]);
  const [view, setView] = useState("open"), [direction, setDirection] = useState(""), [q, setQ] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [logOpen, setLogOpen] = useState(false), [active, setActive] = useState<{ call: Call; callback: Callback } | null>(null);
  // A pressed counter narrows the loaded list to its calls; pressing it again shows everything.
  const [focus, setFocus] = useState<Focus>(null);
  const toggle = (next: Exclude<Focus, null>) => setFocus(current => current === next ? null : next);
  const shown = urgencyFirst(rows.filter(row => focus === "overdue" ? openCallbacks(row).some(callback => callback.overdue) : focus === "unassigned" ? openCallbacks(row).some(callback => !callback.ownerId) : true), callRank);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const params = new URLSearchParams({ view });
      if (direction) params.set("direction", direction);
      if (q.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/front-desk/phone-calls?${params}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(response.status === 403 ? ui("You do not have access to the call log for this campus.") : json.error || ui("Calls could not be loaded."));
      setRows(json.data); setCounts(json.counts);
      // Owner candidates come with the list (G40: campus admins incl. a single school's admin, and receptionists).
      if (Array.isArray(json.owners)) setOwners((json.owners as Owner[]).filter(person => !person.role || OWNER_ROLES.has(person.role)));
    } catch (failure) { setLoadError(failure instanceof Error ? ui(failure.message) : ui("Calls could not be loaded.")); } finally { setLoading(false); }
  }, [view, direction, q, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(timer); }, [load, q]);
  usePanelCommand(command, { "log-call": () => setLogOpen(true) });
  usePanelCommand(command, {
    export: () => {
      if (loadError) return;
      if (!rows.length) { toast.info(ui("Nothing to export yet.")); return; }
      downloadCSV(`phone-calls-${new Date().toISOString().slice(0, 10)}`, [
        ["Name", "Phone", "Direction", "Date", "Purpose", "Callback", "Callback due", "Callback owner", "Attempts"],
        ...rows.map(row => {
          const callback = row.callbacks.find(item => item.status === "OPEN") ?? row.callbacks[0] ?? null;
          return [row.name, row.phone, row.direction === "IN" ? "Incoming" : "Outgoing", row.date, row.purpose ?? "", callback ? (callback.status === "DONE" ? "Completed" : callback.overdue ? "Overdue" : "Open") : "", callback?.dueAt ?? "", callback?.owner?.fullName ?? "", callback?.attempts ?? ""];
        }),
      ]);
    },
  }, !loading);

  return <div className={hideHeader ? "space-y-4" : "sk-panel space-y-4 p-5"} data-phone-log>
    {hideHeader ? null : <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1"><PanelTitle icon={Phone} title={ui("Phone calls")} /><InfoTip content={ui("A promised callback stays open through attempts and reschedules until an outcome is recorded.")} /></div>
      <Button onClick={() => setLogOpen(true)}><Plus className="size-4" aria-hidden="true" />{ui("Log call")}</Button>
    </div>}
    <DeskStats aria-live="polite" data-callback-counts>
      <StatTile index={0} icon={PhoneCall} tone="brand" value={counts.open} label={<><span aria-hidden="true">{ui("Open callbacks")}</span><span className="sr-only">{ui("Open callbacks: {0}", [counts.open])}</span></>} />
      <StatTile index={1} icon={AlarmClock} tone={counts.overdue ? "danger" : "success"} value={counts.overdue} valueProps={{ "data-overdue": counts.overdue }} onSelect={counts.overdue || focus === "overdue" ? () => toggle("overdue") : undefined} selected={focus === "overdue"} label={<><span aria-hidden="true">{ui("Overdue callbacks")}</span><span className="sr-only">{ui("Overdue: {0}", [counts.overdue])}</span></>} />
      <StatTile index={2} icon={UserX} tone={counts.unassigned ? "warning" : "neutral"} value={counts.unassigned} valueProps={{ "data-unassigned": counts.unassigned }} onSelect={counts.unassigned || focus === "unassigned" ? () => toggle("unassigned") : undefined} selected={focus === "unassigned"} label={<><span aria-hidden="true">{ui("Unassigned callbacks")}</span><span className="sr-only">{ui("Unassigned: {0}", [counts.unassigned])}</span></>} />
      <StatTile index={3} icon={UserCheck} tone="info" value={counts.mine} label={<><span aria-hidden="true">{ui("Assigned to me")}</span><span className="sr-only">{ui("Assigned to me: {0}", [counts.mine])}</span></>} />
    </DeskStats>
    <div className="grid gap-3 sm:grid-cols-3">
      <FormField name="call-filter-view" label={ui("Show")}><Select value={view} onChange={event => setView(event.target.value)}><option value="open">{ui("Open callbacks")}</option><option value="mine">{ui("Assigned to me")}</option><option value="overdue">{ui("Overdue callbacks")}</option><option value="unassigned">{ui("Unassigned callbacks")}</option><option value="all">{ui("All calls")}</option></Select></FormField>
      <FormField name="call-filter-direction" label={ui("Direction")}><Select value={direction} onChange={event => setDirection(event.target.value)}><option value="">{ui("Both directions")}</option><option value="IN">{ui("Incoming")}</option><option value="OUT">{ui("Outgoing")}</option></Select></FormField>
      <FormField name="call-filter-q" label={ui("Search name, purpose or phone")}><Input value={q} onChange={event => setQ(event.target.value)} /></FormField>
    </div>

    {loading && !rows.length ? <SkeletonList rows={3} label={ui("Loading calls…")} />
      : loadError ? <ErrorState description={loadError} onRetry={() => void load()} retryLabel={ui("Retry")} />
      : !rows.length ? <div data-call-empty><EmptyState size="sm" icon={Phone} title={view !== "open" || direction || q ? ui("No calls match these filters.") : ui("No callbacks are waiting. Log a call when one comes in.")} action={view !== "open" || direction || q ? undefined : <Button size="sm" onClick={() => setLogOpen(true)}><Plus className="size-4" aria-hidden="true" />{ui("Log call")}</Button>} /></div>
      : <div className="space-y-2.5"><DeskFilterStatus shown={shown.length} total={rows.length} onClear={() => setFocus(null)} /><ul className="space-y-2.5" aria-label={ui("Phone calls")}>{shown.map(row => <li key={row.id} data-tone={callTone(row)} className={`${deskRow} space-y-2 text-sm`} data-call={row.id}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <DeskRowIcon icon={row.direction === "IN" ? PhoneIncoming : PhoneOutgoing} />
          <p className="min-w-0 flex-1 basis-40 font-semibold text-ink-strong"><bdi>{row.name}</bdi> <span className="text-ink-faint">·</span> <bdi dir="ltr" className="whitespace-nowrap font-mono text-xs text-ink-muted">{row.phone}</bdi></p>
          <DeskPill tone={row.direction === "IN" ? "info" : "brand"}>{row.direction === "IN" ? ui("Incoming") : ui("Outgoing")}</DeskPill>
          <span className="text-xs text-ink-subtle tabular-nums"><RelativeTime iso={row.date} full={dateTime(row.date)} /></span>
        </div>
        {row.purpose ? <p className="text-xs text-ink-muted"><span className="font-semibold text-ink">{ui("Purpose")}:</span> <bdi>{row.purpose}</bdi></p> : null}
        {row.noteWithheld ? <p className="inline-flex items-center gap-1 text-xs text-ink-muted" data-note-withheld><Lock className="size-3" aria-hidden="true" />{ui("Sensitive note — visible to campus leaders, the person who logged the call and the callback owner.")}</p>
          : row.note ? <p className="whitespace-pre-wrap text-xs" data-call-note>{row.sensitive ? <Lock className="me-1 inline size-3" aria-label={ui("Sensitive")} /> : null}<bdi>{row.note}</bdi></p> : null}
        {row.callbacks.length ? <ul className="space-y-1.5">{row.callbacks.map(callback => <li key={callback.id} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${callback.status === "DONE" ? "border-status-success-border bg-status-success-surface" : callback.overdue ? "border-status-error-border bg-status-error-surface" : "border-border-subtle bg-surface-subtle"}`} data-callback={callback.id} data-callback-status={callback.status} data-callback-overdue={callback.overdue}>
          {callback.status === "DONE" ? <CheckCircle2 className="size-4 shrink-0 text-status-success-text" aria-hidden="true" /> : callback.overdue ? <AlarmClock className="size-4 shrink-0 text-status-error-text" aria-hidden="true" /> : <PhoneCall className="size-4 shrink-0 text-primary" aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            {callback.status === "DONE" ? ui("Completed {0}", [callback.completedAt ? dateTime(callback.completedAt) : ""]) : callback.overdue ? <span className="font-semibold text-status-error-text">{ui("Overdue since {0}", [dateTime(callback.dueAt)])}</span> : ui("Callback due {0}", [dateTime(callback.dueAt)])}
            {" · "}{callback.owner ? ui("Owner: {0}", [callback.owner.fullName]) : <span className="font-semibold text-status-warning-text">{ui("Unassigned")}</span>}
            {callback.attempts ? ` · ${ui("{0} attempt(s)", [callback.attempts])}` : ""}
            {callback.previousId ? ` · ${ui("Follow-up")}` : ""}
          </span>
          {callback.status === "OPEN" ? <span className={`text-xs font-semibold tabular-nums ${callback.overdue ? "text-status-error-text" : "text-ink-muted"}`}><RelativeTime iso={callback.dueAt} full={dateTime(callback.dueAt)} /></span> : null}
          <Button size="sm" variant="secondary" onClick={() => setActive({ call: row, callback })} aria-label={ui("Open callback for {0}", [row.name])}>{callback.status === "OPEN" ? ui("Update") : ui("History")}</Button>
        </li>)}</ul> : null}
      </li>)}</ul></div>}

    {logOpen ? <LogCallDialog owners={owners} onClose={() => setLogOpen(false)} onDone={() => { setLogOpen(false); void load(); }} /> : null}
    {active ? <CallbackDialog call={active.call} callback={active.callback} owners={owners} onClose={() => setActive(null)} onChanged={() => { setActive(null); void load(); }} /> : null}
  </div>;
}

function LogCallDialog({ owners, onClose, onDone }: { owners: Owner[]; onClose: () => void; onDone: () => void }) {
  const ui = useUiText();
  const { timezone } = useLocale();
  const [form, setForm] = useState(() => ({ name: "", phone: "", direction: "IN", date: localNow(timezone), purpose: "", note: "", sensitive: false, callbackDue: "", callbackOwnerId: "" }));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const draftValues = { ...form, note: form.sensitive ? "" : form.note };
  const draft = useFormDraft({ record: "reception:phone-call", schema: 1, values: draftValues, baseline: { ...draftValues, name: "", phone: "", purpose: "", note: "", callbackDue: "", callbackOwnerId: "" }, fields: ["name", "phone", "direction", "date", "purpose", "note", "callbackDue", "callbackOwnerId"] as const, apply: values => setForm(current => ({ ...current, name: String(values.name ?? ""), phone: String(values.phone ?? ""), direction: String(values.direction ?? "IN"), date: String(values.date ?? current.date), purpose: String(values.purpose ?? ""), note: String(values.note ?? ""), callbackDue: String(values.callbackDue ?? ""), callbackOwnerId: String(values.callbackOwnerId ?? "") })) });
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [field]: event.target.value }));
  // SKAI-1023: the callback is read from the fields themselves at save time. A value the browser shows but React
  // state never received (autofill, a picker or a scripted fill without an input event) was silently dropped, so
  // the call saved with no callback and the open/unassigned counters stayed at zero.
  const dueField = useRef<HTMLInputElement>(null), ownerField = useRef<HTMLSelectElement>(null);
  const submit = async () => {
    if (form.name.trim().length < 2 || form.phone.replace(/\D/g, "").length < 6 || form.purpose.trim().length < 2 || !form.date) { setError(ui("Enter the caller's name, a phone number with at least 6 digits, the call time and the purpose.")); return; }
    if (dueField.current?.validity.badInput) { setError(ui("Finish the callback date and time, or clear it.")); return; }
    const callbackDue = dueField.current?.value || form.callbackDue, callbackOwnerId = ownerField.current?.value ?? form.callbackOwnerId;
    if (callbackOwnerId && !callbackDue) { setError(ui("Choose when the callback is due, or leave the owner empty.")); return; }
    if (callbackDue !== form.callbackDue || callbackOwnerId !== form.callbackOwnerId) setForm(current => ({ ...current, callbackDue, callbackOwnerId }));
    const payload = { ...form, callbackDue: callbackDue || undefined, callbackOwnerId: callbackOwnerId || undefined };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const json = await call("POST", { ...payload, idempotencyKey: attempt.current.key });
      draft.markSaved();
      toast.success(json.replayed ? ui("This call was already logged; nothing was added twice.") : ui("Call logged."));
      onDone();
    } catch (failure) {
      setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Your details are kept; retrying will not log the call twice.") : ui(failure instanceof Error ? failure.message : "The change was not saved."));
    } finally { setBusy(false); }
  };
  return <Modal icon={form.direction === "OUT" ? PhoneOutgoing : PhoneIncoming} tone={form.sensitive ? "amber" : "violet"} title={ui("Log call")} eyebrow={ui("Phone calls")} subtitle={ui("Keep it short: who called, why, and whether someone owes them a callback.")} onClose={onClose} dirty={Boolean(form.name || form.phone || form.note || form.purpose)}
    footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void submit()} loading={busy}>{ui("Log call")}</Button></div>}>
    <div className="space-y-3" data-call-form>
      <DraftRecovery recordLabel={ui("Phone call")} draft={draft} saving={busy} excluded={ui("Sensitive call notes are never stored in this signed-in browser draft.")} />
      {error ? <Alert tone="danger" compact data-call-error>{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="call-name" label={ui("Caller name")}><Input value={form.name} maxLength={120} onChange={set("name")} /></FormField>
        <FormField name="call-phone" label={ui("Phone")} hint={ui("At least 6 digits.")}><Input value={form.phone} inputMode="tel" dir="ltr" maxLength={30} onChange={set("phone")} /></FormField>
        <FormField name="call-direction" label={ui("Direction")}><Select value={form.direction} onChange={set("direction")}><option value="IN">{ui("Incoming")}</option><option value="OUT">{ui("Outgoing")}</option></Select></FormField>
        <FormField name="call-date" label={ui("Call time (school time)")} tooltip={ui("Times use the school's time zone, not your device's.")}><Input type="datetime-local" value={form.date} onChange={set("date")} /></FormField>
      </div>
      <FormField name="call-purpose" label={ui("Purpose")}><Input value={form.purpose} maxLength={120} onChange={set("purpose")} /></FormField>
      <FormField name="call-note" label={ui("Note (optional)")}><Textarea value={form.note} rows={2} maxLength={1000} onChange={set("note")} /></FormField>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.sensitive} onChange={event => setForm(current => ({ ...current, sensitive: event.target.checked }))} data-call-sensitive />{ui("Sensitive note (health, safeguarding, family matters) — only leaders, you and the callback owner can read it")}</label>
      <fieldset className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
        <legend className="px-1 text-xs font-semibold text-ink-strong">{ui("Callback (optional)")}</legend>
        <FormField name="call-callback-due" label={ui("Call back by (school time)")}><Input ref={dueField} type="datetime-local" value={form.callbackDue} min={form.date} onChange={set("callbackDue")} data-call-callback-due /></FormField>
        <FormField name="call-callback-owner" label={ui("Owner")}><Select ref={ownerField} value={form.callbackOwnerId} onChange={set("callbackOwnerId")} data-call-callback-owner><option value="">{ui("Unassigned")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
      </fieldset>
    </div>
  </Modal>;
}

function CallbackDialog({ call: phoneCall, callback, owners, onClose, onChanged }: { call: Call; callback: Callback; owners: Owner[]; onClose: () => void; onChanged: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [history, setHistory] = useState<HistoryEvent[] | null>(null), [historyError, setHistoryError] = useState("");
  const [ownerId, setOwnerId] = useState(callback.ownerId ?? ""), [dueAt, setDueAt] = useState(""), [note, setNote] = useState(""), [nextAttempt, setNextAttempt] = useState("");
  const [outcome, setOutcome] = useState(""), [nextDue, setNextDue] = useState(""), [nextOwnerId, setNextOwnerId] = useState(callback.ownerId ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/front-desk/phone-calls?history=${encodeURIComponent(callback.id)}`, { cache: "no-store" }).then(r => r.json()).then(json => { if (!cancelled) { if (json.success) setHistory(json.data); else setHistoryError(ui(json.error || "History could not be loaded.")); } }).catch(() => !cancelled && setHistoryError(ui("History could not be loaded.")));
    return () => { cancelled = true; };
  }, [callback.id, ui]);
  const run = async (body: Record<string, unknown>, message: string) => {
    setBusy(true); setError("");
    try { await call("PATCH", { id: callback.id, version: callback.version, ...body }); toast.success(message); onChanged(); }
    catch (failure) { setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Nothing is lost; try again.") : ui(failure instanceof Error ? failure.message : "The change was not saved.")); }
    finally { setBusy(false); }
  };
  const open = callback.status === "OPEN";
  return <Modal icon={PhoneCall} tone={!open ? "emerald" : callback.overdue ? "rose" : "sky"} title={ui("Callback for {0}", [phoneCall.name])} eyebrow={ui("Phone calls")} size="lg" onClose={onClose} dirty={Boolean(note || outcome)}
    footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Close")}</Button>{open ? <Button disabled={busy} onClick={() => { if (outcome.trim().length < 5) { setError(ui("Record the outcome (at least 5 characters) before completing.")); return; } void run({ action: "complete", outcome, nextDue: nextDue || undefined, nextOwnerId: nextOwnerId || undefined }, nextDue ? ui("Callback completed; the next callback is scheduled.") : ui("Callback completed.")); }}>{ui("Complete callback")}</Button> : null}</div>}>
    <div className="space-y-4" data-callback-dialog={callback.id}>
      {error ? <Alert tone="danger" compact data-callback-error>{error}</Alert> : null}
      <DeskSection title={ui("Original call")} icon={phoneCall.direction === "IN" ? PhoneIncoming : PhoneOutgoing} tone="info" className="text-sm" aria-label={ui("Original call")} action={<span className="text-xs text-ink-muted"><bdi>{dateTime(phoneCall.date)}</bdi></span>}>
        <p className="font-semibold text-ink-strong"><bdi>{phoneCall.name}</bdi> · <bdi dir="ltr" className="whitespace-nowrap">{phoneCall.phone}</bdi>{phoneCall.purpose ? <> · <bdi>{phoneCall.purpose}</bdi></> : null}</p>
        {phoneCall.note ? <p className="whitespace-pre-wrap text-xs"><bdi>{phoneCall.note}</bdi></p> : phoneCall.noteWithheld ? <p className="text-xs text-ink-muted">{ui("Sensitive note withheld.")}</p> : null}
      </DeskSection>
      <p className={`text-sm font-semibold ${open && callback.overdue ? "text-status-error-text" : "text-ink-strong"}`} data-callback-state={callback.status}>{open ? (callback.overdue ? ui("Overdue since {0}", [dateTime(callback.dueAt)]) : ui("Callback due {0}", [dateTime(callback.dueAt)])) : ui("Completed {0}", [callback.completedAt ? dateTime(callback.completedAt) : ""])} · {callback.owner ? ui("Owner: {0}", [callback.owner.fullName]) : ui("Unassigned")}</p>
      {!open && callback.outcome ? <Alert tone="success" compact live="off" data-callback-outcome><bdi>{callback.outcome}</bdi></Alert> : null}
      {open ? <>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <FormField name="callback-owner" label={ui("Owner")}><Select value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">{ui("Unassigned")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
          <Button variant="secondary" disabled={busy || ownerId === (callback.ownerId ?? "")} onClick={() => void run({ action: "reassign", ownerId: ownerId || null }, ui("Owner changed. The due time is unchanged."))}>{ui("Change owner")}</Button>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <FormField name="callback-due" label={ui("New due time (school time)")}><Input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></FormField>
          <Button variant="secondary" disabled={busy || !dueAt} onClick={() => void run({ action: "reschedule", dueAt }, ui("Due time changed."))}>{ui("Reschedule")}</Button>
        </div>
        <DeskSection title={ui("Tried but no outcome")} icon={PhoneCall} tone="warning">
          <FormField name="callback-attempt-note" label={ui("What happened (e.g. no answer)")}><Input value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></FormField>
          <FormField name="callback-next-attempt" label={ui("Try again by (optional)")}><Input type="datetime-local" value={nextAttempt} onChange={event => setNextAttempt(event.target.value)} /></FormField>
          <Button className="w-full sm:w-fit" variant="secondary" disabled={busy} onClick={() => { if (note.trim().length < 2) { setError(ui("Describe the attempt (at least 2 characters).")); return; } void run({ action: "attempt", note, dueAt: nextAttempt || undefined }, ui("Attempt recorded. The callback stays open.")); }}>{ui("Record attempt")}</Button>
        </DeskSection>
        <DeskSection title={ui("Complete with outcome")} icon={CheckCircle2} tone="success">
          <FormField name="callback-outcome" label={ui("Outcome (required)")}><Textarea value={outcome} rows={2} maxLength={1000} onChange={event => setOutcome(event.target.value)} /></FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField name="callback-next-due" label={ui("Another callback by (optional)")}><Input type="datetime-local" value={nextDue} onChange={event => setNextDue(event.target.value)} /></FormField>
            <FormField name="callback-next-owner" label={ui("Owner of the next callback")}><Select value={nextOwnerId} onChange={event => setNextOwnerId(event.target.value)}><option value="">{ui("Unassigned")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
          </div>
        </DeskSection>
      </> : null}
      <section aria-label={ui("History")}>
        <p className="sk-eyebrow mb-3 inline-flex items-center gap-1.5"><History className="size-3.5" aria-hidden="true" />{ui("History")}</p>
        {historyError ? <Alert tone="danger" compact>{historyError}</Alert> : !history ? <SkeletonList rows={2} label={ui("Loading history…")} />
          : <ol className={`${deskTimeline} text-xs`} data-callback-history>{history.map(event => <li key={event.id} data-tone={eventTone(event.kind)} data-event={event.kind}>
            <p className="font-semibold text-ink-strong">{eventLabel(ui, event.kind)} · <bdi>{dateTime(event.createdAt)}</bdi>{event.actorName ? <> · <bdi>{event.actorName}</bdi></> : null}</p>
            {event.kind === "REASSIGNED" || event.kind === "CREATED" ? <p>{event.ownerName ? ui("Owner: {0}", [event.ownerName]) : ui("Unassigned")}{event.dueAt ? ` · ${ui("Due {0}", [dateTime(event.dueAt)])}` : ""}</p> : event.dueAt ? <p>{ui("Due {0}", [dateTime(event.dueAt)])}</p> : null}
            {event.note ? <p className="whitespace-pre-wrap"><bdi>{event.note}</bdi></p> : null}
          </li>)}</ol>}
      </section>
    </div>
  </Modal>;
}
