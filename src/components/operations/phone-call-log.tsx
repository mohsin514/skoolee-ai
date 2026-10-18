"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Phone, Plus } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame, PanelTitle } from "@/components/shared-admin";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";

// SKO-465: the reception call log. Calls are recorded once; a promised callback is an owned task that
// stays open through attempts and reschedules until an outcome is recorded. Notes marked sensitive are
// withheld from anyone who may not read them, and the queue defaults to open callbacks.

type Owner = { id: string; fullName: string };
type Callback = { id: string; ownerId: string | null; owner: Owner | null; dueAt: string; status: "OPEN" | "DONE"; attempts: number; outcome: string | null; completedAt: string | null; previousId: string | null; version: number; overdue: boolean };
type Call = { id: string; name: string; phone: string; direction: "IN" | "OUT"; date: string; purpose: string | null; note: string | null; noteWithheld: boolean; sensitive: boolean; callbacks: Callback[] };
type HistoryEvent = { id: string; kind: string; dueAt: string | null; createdAt: string; note: string | null; actorName: string | null; ownerName: string | null };
type Ui = ReturnType<typeof useUiText>;
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

export function PhoneCallLog() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [rows, setRows] = useState<Call[]>([]), [counts, setCounts] = useState({ open: 0, overdue: 0, unassigned: 0, mine: 0 });
  const [owners, setOwners] = useState<Owner[]>([]);
  const [view, setView] = useState("open"), [direction, setDirection] = useState(""), [q, setQ] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [logOpen, setLogOpen] = useState(false), [active, setActive] = useState<{ call: Call; callback: Callback } | null>(null);

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
    } catch (failure) { setLoadError(failure instanceof Error ? ui(failure.message) : ui("Calls could not be loaded.")); } finally { setLoading(false); }
  }, [view, direction, q, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(timer); }, [load, q]);
  useEffect(() => { void fetch("/api/front-desk/phone-calls?owners=1", { cache: "no-store" }).then(r => r.json()).then(json => json.success && setOwners(json.data)).catch(() => undefined); }, []);

  return <div className="sk-panel space-y-4 p-5" data-phone-log>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <PanelTitle icon={Phone} title={ui("Phone calls")} />
      <Button onClick={() => setLogOpen(true)}><Plus className="size-4" aria-hidden="true" />{ui("Log call")}</Button>
    </div>
    <p className="flex flex-wrap gap-3 text-sm font-bold" aria-live="polite" data-callback-counts>
      <span>{ui("Open callbacks: {0}", [counts.open])}</span>
      <span className={counts.overdue ? "text-rose-700" : ""} data-overdue={counts.overdue}>{ui("Overdue: {0}", [counts.overdue])}</span>
      <span className={counts.unassigned ? "text-amber-800" : ""} data-unassigned={counts.unassigned}>{ui("Unassigned: {0}", [counts.unassigned])}</span>
      <span>{ui("Assigned to me: {0}", [counts.mine])}</span>
    </p>
    <div className="grid gap-3 sm:grid-cols-3">
      <FormField name="call-filter-view" label={ui("Show")}><Select value={view} onChange={event => setView(event.target.value)}><option value="open">{ui("Open callbacks")}</option><option value="mine">{ui("Assigned to me")}</option><option value="overdue">{ui("Overdue callbacks")}</option><option value="unassigned">{ui("Unassigned callbacks")}</option><option value="all">{ui("All calls")}</option></Select></FormField>
      <FormField name="call-filter-direction" label={ui("Direction")}><Select value={direction} onChange={event => setDirection(event.target.value)}><option value="">{ui("Both directions")}</option><option value="IN">{ui("Incoming")}</option><option value="OUT">{ui("Outgoing")}</option></Select></FormField>
      <FormField name="call-filter-q" label={ui("Search name, purpose or phone")}><Input value={q} onChange={event => setQ(event.target.value)} /></FormField>
    </div>

    {loading && !rows.length ? <p role="status" className="text-sm text-ink-muted">{ui("Loading calls…")}</p>
      : loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"><span>{loadError}</span><Button size="sm" variant="secondary" onClick={() => void load()}>{ui("Retry")}</Button></div>
      : !rows.length ? <p className="rounded-2xl bg-muted p-4 text-sm" data-call-empty>{view !== "open" || direction || q ? ui("No calls match these filters.") : ui("No callbacks are waiting. Log a call when one comes in.")}</p>
      : <ul className="space-y-2" aria-label={ui("Phone calls")}>{rows.map(row => <li key={row.id} className="space-y-2 rounded-2xl border border-border p-3 text-sm" data-call={row.id}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${row.direction === "IN" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>{row.direction === "IN" ? ui("Incoming") : ui("Outgoing")}</span>
          <p className="font-bold"><bdi>{row.name}</bdi> · <bdi dir="ltr" className="whitespace-nowrap">{row.phone}</bdi></p>
          <span className="text-xs text-ink-muted"><bdi>{dateTime(row.date)}</bdi></span>
        </div>
        {row.purpose ? <p className="text-xs"><span className="font-bold">{ui("Purpose")}:</span> <bdi>{row.purpose}</bdi></p> : null}
        {row.noteWithheld ? <p className="inline-flex items-center gap-1 text-xs text-ink-muted" data-note-withheld><Lock className="size-3" aria-hidden="true" />{ui("Sensitive note — visible to campus leaders, the person who logged the call and the callback owner.")}</p>
          : row.note ? <p className="whitespace-pre-wrap text-xs" data-call-note>{row.sensitive ? <Lock className="me-1 inline size-3" aria-label={ui("Sensitive")} /> : null}<bdi>{row.note}</bdi></p> : null}
        {row.callbacks.length ? <ul className="space-y-1">{row.callbacks.map(callback => <li key={callback.id} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs ${callback.status === "DONE" ? "bg-emerald-50/60" : callback.overdue ? "bg-rose-50" : "bg-muted/60"}`} data-callback={callback.id} data-callback-status={callback.status} data-callback-overdue={callback.overdue}>
          <span className="min-w-0 flex-1">
            {callback.status === "DONE" ? ui("Completed {0}", [callback.completedAt ? dateTime(callback.completedAt) : ""]) : callback.overdue ? <span className="font-bold text-rose-800">{ui("Overdue since {0}", [dateTime(callback.dueAt)])}</span> : ui("Callback due {0}", [dateTime(callback.dueAt)])}
            {" · "}{callback.owner ? ui("Owner: {0}", [callback.owner.fullName]) : <span className="font-bold text-amber-800">{ui("Unassigned")}</span>}
            {callback.attempts ? ` · ${ui("{0} attempt(s)", [callback.attempts])}` : ""}
            {callback.previousId ? ` · ${ui("Follow-up")}` : ""}
          </span>
          <Button size="sm" variant="secondary" onClick={() => setActive({ call: row, callback })} aria-label={ui("Open callback for {0}", [row.name])}>{callback.status === "OPEN" ? ui("Update") : ui("History")}</Button>
        </li>)}</ul> : null}
      </li>)}</ul>}

    {logOpen ? <LogCallDialog owners={owners} onClose={() => setLogOpen(false)} onDone={() => { setLogOpen(false); void load(); }} /> : null}
    {active ? <CallbackDialog call={active.call} callback={active.callback} owners={owners} onClose={() => setActive(null)} onChanged={() => { setActive(null); void load(); }} /> : null}
  </div>;
}

function LogCallDialog({ owners, onClose, onDone }: { owners: Owner[]; onClose: () => void; onDone: () => void }) {
  const ui = useUiText();
  const { timezone } = useLocale();
  const [form, setForm] = useState(() => ({ name: "", phone: "", direction: "IN", date: localNow(timezone), purpose: "", note: "", sensitive: false, callbackDue: "", callbackOwnerId: "" }));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [field]: event.target.value }));
  const submit = async () => {
    if (form.name.trim().length < 2 || form.phone.replace(/\D/g, "").length < 6 || form.purpose.trim().length < 2 || !form.date) { setError(ui("Enter the caller's name, a phone number with at least 6 digits, the call time and the purpose.")); return; }
    if (form.callbackOwnerId && !form.callbackDue) { setError(ui("Choose when the callback is due, or leave the owner empty.")); return; }
    const payload = { ...form, callbackDue: form.callbackDue || undefined, callbackOwnerId: form.callbackOwnerId || undefined };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const json = await call("POST", { ...payload, idempotencyKey: attempt.current.key });
      toast.success(json.replayed ? ui("This call was already logged; nothing was added twice.") : ui("Call logged."));
      onDone();
    } catch (failure) {
      setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Your details are kept; retrying will not log the call twice.") : ui(failure instanceof Error ? failure.message : "The change was not saved."));
    } finally { setBusy(false); }
  };
  return <ModalFrame title={ui("Log call")} eyebrow={ui("Phone calls")} subtitle={ui("Keep it short: who called, why, and whether someone owes them a callback.")} onClose={onClose} dirty={Boolean(form.name || form.phone || form.note || form.purpose)}>
    <div className="space-y-3" data-call-form>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" data-call-error>{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="call-name" label={ui("Caller name")}><Input value={form.name} maxLength={120} onChange={set("name")} /></FormField>
        <FormField name="call-phone" label={ui("Phone")}><Input value={form.phone} inputMode="tel" dir="ltr" maxLength={30} onChange={set("phone")} /></FormField>
        <FormField name="call-direction" label={ui("Direction")}><Select value={form.direction} onChange={set("direction")}><option value="IN">{ui("Incoming")}</option><option value="OUT">{ui("Outgoing")}</option></Select></FormField>
        <FormField name="call-date" label={ui("Call time (school time)")}><Input type="datetime-local" value={form.date} onChange={set("date")} /></FormField>
      </div>
      <FormField name="call-purpose" label={ui("Purpose")}><Input value={form.purpose} maxLength={120} onChange={set("purpose")} /></FormField>
      <FormField name="call-note" label={ui("Note (optional)")}><Textarea value={form.note} rows={2} maxLength={1000} onChange={set("note")} /></FormField>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.sensitive} onChange={event => setForm(current => ({ ...current, sensitive: event.target.checked }))} data-call-sensitive />{ui("Sensitive note (health, safeguarding, family matters) — only leaders, you and the callback owner can read it")}</label>
      <fieldset className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
        <legend className="px-1 text-xs font-bold">{ui("Callback (optional)")}</legend>
        <FormField name="call-callback-due" label={ui("Call back by (school time)")}><Input type="datetime-local" value={form.callbackDue} min={form.date} onChange={set("callbackDue")} /></FormField>
        <FormField name="call-callback-owner" label={ui("Owner")}><Select value={form.callbackOwnerId} onChange={set("callbackOwnerId")}><option value="">{ui("Unassigned")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
      </fieldset>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void submit()} disabled={busy} aria-busy={busy}>{busy ? ui("Saving…") : ui("Log call")}</Button></div>
    </div>
  </ModalFrame>;
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
  return <ModalFrame title={ui("Callback for {0}", [phoneCall.name])} eyebrow={ui("Phone calls")} size="lg" onClose={onClose} dirty={Boolean(note || outcome)}>
    <div className="space-y-4" data-callback-dialog={callback.id}>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" data-callback-error>{error}</p> : null}
      <section className="space-y-1 rounded-xl border border-border p-3 text-sm" aria-label={ui("Original call")}>
        <p className="text-xs font-semibold uppercase text-ink-subtle">{ui("Original call")} · <bdi>{dateTime(phoneCall.date)}</bdi></p>
        <p className="font-bold"><bdi>{phoneCall.name}</bdi> · <bdi dir="ltr" className="whitespace-nowrap">{phoneCall.phone}</bdi>{phoneCall.purpose ? <> · <bdi>{phoneCall.purpose}</bdi></> : null}</p>
        {phoneCall.note ? <p className="whitespace-pre-wrap text-xs"><bdi>{phoneCall.note}</bdi></p> : phoneCall.noteWithheld ? <p className="text-xs text-ink-muted">{ui("Sensitive note withheld.")}</p> : null}
      </section>
      <p className="text-sm font-bold" data-callback-state={callback.status}>{open ? (callback.overdue ? ui("Overdue since {0}", [dateTime(callback.dueAt)]) : ui("Callback due {0}", [dateTime(callback.dueAt)])) : ui("Completed {0}", [callback.completedAt ? dateTime(callback.completedAt) : ""])} · {callback.owner ? ui("Owner: {0}", [callback.owner.fullName]) : ui("Unassigned")}</p>
      {!open && callback.outcome ? <p className="rounded-xl bg-emerald-50 p-3 text-sm" data-callback-outcome><bdi>{callback.outcome}</bdi></p> : null}
      {open ? <>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <FormField name="callback-owner" label={ui("Owner")}><Select value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">{ui("Unassigned")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
          <Button variant="secondary" disabled={busy || ownerId === (callback.ownerId ?? "")} onClick={() => void run({ action: "reassign", ownerId: ownerId || null }, ui("Owner changed. The due time is unchanged."))}>{ui("Change owner")}</Button>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <FormField name="callback-due" label={ui("New due time (school time)")}><Input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></FormField>
          <Button variant="secondary" disabled={busy || !dueAt} onClick={() => void run({ action: "reschedule", dueAt }, ui("Due time changed."))}>{ui("Reschedule")}</Button>
        </div>
        <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-xs font-bold">{ui("Tried but no outcome")}</legend>
          <FormField name="callback-attempt-note" label={ui("What happened (e.g. no answer)")}><Input value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></FormField>
          <FormField name="callback-next-attempt" label={ui("Try again by (optional)")}><Input type="datetime-local" value={nextAttempt} onChange={event => setNextAttempt(event.target.value)} /></FormField>
          <Button variant="secondary" disabled={busy} onClick={() => { if (note.trim().length < 2) { setError(ui("Describe the attempt (at least 2 characters).")); return; } void run({ action: "attempt", note, dueAt: nextAttempt || undefined }, ui("Attempt recorded. The callback stays open.")); }}>{ui("Record attempt")}</Button>
        </fieldset>
        <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-xs font-bold">{ui("Complete with outcome")}</legend>
          <FormField name="callback-outcome" label={ui("Outcome (required)")}><Textarea value={outcome} rows={2} maxLength={1000} onChange={event => setOutcome(event.target.value)} /></FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField name="callback-next-due" label={ui("Another callback by (optional)")}><Input type="datetime-local" value={nextDue} onChange={event => setNextDue(event.target.value)} /></FormField>
            <FormField name="callback-next-owner" label={ui("Owner of the next callback")}><Select value={nextOwnerId} onChange={event => setNextOwnerId(event.target.value)}><option value="">{ui("Unassigned")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
          </div>
          <Button disabled={busy} onClick={() => { if (outcome.trim().length < 5) { setError(ui("Record the outcome (at least 5 characters) before completing.")); return; } void run({ action: "complete", outcome, nextDue: nextDue || undefined, nextOwnerId: nextOwnerId || undefined }, nextDue ? ui("Callback completed; the next callback is scheduled.") : ui("Callback completed.")); }}>{ui("Complete callback")}</Button>
        </fieldset>
      </> : null}
      <section aria-label={ui("History")}>
        <p className="mb-2 text-xs font-semibold uppercase text-ink-subtle">{ui("History")}</p>
        {historyError ? <p role="alert" className="text-xs text-rose-700">{historyError}</p> : !history ? <p role="status" className="text-xs">{ui("Loading history…")}</p>
          : <ol className="space-y-1.5 text-xs" data-callback-history>{history.map(event => <li key={event.id} className="rounded-lg bg-muted/60 px-3 py-2" data-event={event.kind}>
            <p className="font-bold">{eventLabel(ui, event.kind)} · <bdi>{dateTime(event.createdAt)}</bdi>{event.actorName ? <> · <bdi>{event.actorName}</bdi></> : null}</p>
            {event.kind === "REASSIGNED" || event.kind === "CREATED" ? <p>{event.ownerName ? ui("Owner: {0}", [event.ownerName]) : ui("Unassigned")}{event.dueAt ? ` · ${ui("Due {0}", [dateTime(event.dueAt)])}` : ""}</p> : event.dueAt ? <p>{ui("Due {0}", [dateTime(event.dueAt)])}</p> : null}
            {event.note ? <p className="whitespace-pre-wrap"><bdi>{event.note}</bdi></p> : null}
          </li>)}</ol>}
      </section>
    </div>
  </ModalFrame>;
}
