"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mail, Plus } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { ModalFrame, PanelTitle } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-464: the postal and courier register. The queue opens on items still awaiting a handoff; closing an
// item names who it was handed to, and a delivery also says how it was confirmed. Corrections need a reason
// and the history keeps the values they replaced.

type Ui = ReturnType<typeof useUiText>;
type Owner = { id: string; fullName: string };
type Status = "RECEIVED" | "ASSIGNED" | "COLLECTED" | "PREPARED" | "DISPATCHED" | "DELIVERED";
type Item = { id: string; itemCode: string; direction: "RECEIVE" | "DISPATCH"; status: Status; date: string; fromName: string | null; toName: string | null; courier: string | null; referenceNo: string | null; note: string | null; owner: Owner | null; ownerId: string | null; handedTo: string | null; closedAt: string | null; version: number };
type HistoryEvent = { id: string; kind: string; changes: Record<string, unknown> | null; note: string | null; createdAt: string; actorName: string | null; ownerName: string | null };
const CLOSED: Status[] = ["COLLECTED", "DELIVERED"];
const statusLabel = (ui: Ui, status: Status) => ({ RECEIVED: ui("Awaiting an owner"), ASSIGNED: ui("Awaiting collection"), COLLECTED: ui("Collected"), PREPARED: ui("To dispatch"), DISPATCHED: ui("In transit"), DELIVERED: ui("Delivered") })[status];
const eventLabel = (ui: Ui, kind: string) => ({ CREATED: ui("Recorded"), ASSIGNED: ui("Owner changed"), DISPATCHED: ui("Dispatched"), COLLECTED: ui("Collected"), DELIVERED: ui("Delivered"), CORRECTED: ui("Corrected") } as Record<string, string>)[kind] ?? kind;
const fieldLabel = (ui: Ui, field: string) => ({ fromName: ui("Sender"), toName: ui("Recipient"), courier: ui("Courier"), referenceNo: ui("Tracking or reference number"), note: ui("Note"), handedTo: ui("Handed to") } as Record<string, string>)[field] ?? field;
const todayText = () => new Date().toISOString().slice(0, 10);

async function send(method: string, body: Record<string, unknown>) {
  const response = await fetch("/api/front-desk/postal", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "The change was not saved.");
  return json;
}

export function PostalRegister() {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [rows, setRows] = useState<Item[]>([]), [counts, setCounts] = useState({ awaitingCollection: 0, toDispatch: 0, inTransit: 0, unassigned: 0, mine: 0 });
  const [owners, setOwners] = useState<Owner[]>([]);
  const [view, setView] = useState("active"), [direction, setDirection] = useState(""), [q, setQ] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false), [openItem, setOpenItem] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const params = new URLSearchParams({ view });
      if (direction) params.set("direction", direction);
      if (q.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/front-desk/postal?${params}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(response.status === 403 ? ui("You do not have access to the postal register for this campus.") : json.error || ui("Postal items could not be loaded."));
      setRows(json.data); setCounts(json.counts);
    } catch (failure) { setLoadError(failure instanceof Error ? ui(failure.message) : ui("Postal items could not be loaded.")); } finally { setLoading(false); }
  }, [view, direction, q, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(timer); }, [load, q]);
  useEffect(() => { void fetch("/api/front-desk/postal?owners=1", { cache: "no-store" }).then(r => r.json()).then(json => json.success && setOwners(json.data)).catch(() => undefined); }, []);

  return <div className="sk-panel space-y-4 p-5" data-postal-register>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <PanelTitle icon={Mail} title={ui("Post and couriers")} />
      <Button onClick={() => setIntakeOpen(true)}><Plus className="size-4" aria-hidden="true" />{ui("Record item")}</Button>
    </div>
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold tabular-nums text-ink-strong" aria-live="polite" data-postal-counts>
      <span>{ui("Awaiting collection: {0}", [counts.awaitingCollection])}</span>
      <span>{ui("To dispatch: {0}", [counts.toDispatch])}</span>
      <span>{ui("In transit: {0}", [counts.inTransit])}</span>
      <span className={counts.unassigned ? "text-status-warning-text" : ""} data-unassigned={counts.unassigned}>{ui("Without an owner: {0}", [counts.unassigned])}</span>
    </p>
    <div className="grid gap-3 sm:grid-cols-3">
      <FormField name="postal-filter-view" label={ui("Show")}><Select value={view} onChange={event => setView(event.target.value)}><option value="active">{ui("Awaiting handoff")}</option><option value="mine">{ui("My items")}</option><option value="closed">{ui("Handed over")}</option><option value="all">{ui("All items")}</option></Select></FormField>
      <FormField name="postal-filter-direction" label={ui("Direction")}><Select value={direction} onChange={event => setDirection(event.target.value)}><option value="">{ui("Incoming and outgoing")}</option><option value="RECEIVE">{ui("Incoming")}</option><option value="DISPATCH">{ui("Outgoing")}</option></Select></FormField>
      <FormField name="postal-filter-q" label={ui("Search code, reference, name or courier")}><Input value={q} onChange={event => setQ(event.target.value)} /></FormField>
    </div>

    {loading && !rows.length ? <SkeletonList rows={4} label={ui("Loading postal items…")} />
      : loadError ? <ErrorState title={ui("Postal items could not be loaded.")} description={loadError} onRetry={() => void load()} retryLabel={ui("Retry")} />
      : !rows.length ? <div data-postal-empty>{view !== "active" || direction || q ? <EmptyState size="sm" icon={Mail} title={ui("No items match these filters.")} /> : <EmptyState size="sm" icon={Mail} title={ui("Nothing is waiting to be handed over. Record an item when post arrives or leaves.")} action={<Button size="sm" onClick={() => setIntakeOpen(true)}><Plus className="size-4" aria-hidden="true" />{ui("Record item")}</Button>} />}</div>
      : <ul className="space-y-2" aria-label={ui("Post and couriers")}>{rows.map(row => <li key={row.id} className="sk-row-interactive flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3 text-sm" data-postal={row.itemCode} data-postal-status={row.status}>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-semibold text-ink-strong"><bdi>{row.itemCode}</bdi> · {row.direction === "RECEIVE" ? ui("Incoming") : ui("Outgoing")} · <bdi>{row.toName}</bdi></p>
          <p className="text-xs text-ink-muted">{formatDate(row.date)}{row.fromName ? <> · {ui("From")} <bdi>{row.fromName}</bdi></> : null}{row.courier ? <> · <bdi>{row.courier}</bdi></> : null}</p>
          {row.referenceNo ? <p className="break-all text-xs" data-postal-reference><bdi dir="ltr">{row.referenceNo}</bdi></p> : <p className="text-xs text-ink-muted">{ui("No tracking reference")}</p>}
          <p className="text-xs text-ink-muted">{row.owner ? ui("Owner: {0}", [row.owner.fullName]) : CLOSED.includes(row.status) ? null : <span className="font-semibold text-status-warning-text">{ui("No owner yet")}</span>}{row.handedTo ? <> · {ui("Handed to")} <bdi>{row.handedTo}</bdi></> : null}</p>
        </div>
        <Badge size="sm" dot variant={CLOSED.includes(row.status) ? "success" : "neutral"}>{statusLabel(ui, row.status)}</Badge>
        <Button size="sm" variant="secondary" onClick={() => setOpenItem(row)} aria-label={ui("Open postal item {0}", [row.itemCode])}>{ui("Open")}</Button>
      </li>)}</ul>}

    {intakeOpen ? <IntakeDialog owners={owners} onClose={() => setIntakeOpen(false)} onDone={() => { setIntakeOpen(false); void load(); }} /> : null}
    {openItem ? <ItemDialog item={openItem} owners={owners} onClose={() => setOpenItem(null)} onChanged={() => { setOpenItem(null); void load(); }} /> : null}
  </div>;
}

function IntakeDialog({ owners, onClose, onDone }: { owners: Owner[]; onClose: () => void; onDone: () => void }) {
  const ui = useUiText();
  const [form, setForm] = useState({ direction: "RECEIVE", date: todayText(), fromName: "", toName: "", courier: "", referenceNo: "", note: "", ownerId: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState<string | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [field]: event.target.value }));
  const submit = async () => {
    if (form.toName.trim().length < 2 || !form.date) { setError(form.direction === "RECEIVE" ? ui("Enter who the item is for and the date it arrived.") : ui("Enter who the item is addressed to and the date.")); return; }
    const payload = { ...form, ownerId: form.ownerId || undefined };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const json = await send("POST", { ...payload, idempotencyKey: attempt.current.key });
      setReceipt(json.data.itemCode);
      toast.success(json.replayed ? ui("This item was already recorded; nothing was added twice.") : ui("Item {0} recorded.", [json.data.itemCode]));
    } catch (failure) {
      setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Your details are kept; retrying will not record the item twice.") : ui(failure instanceof Error ? failure.message : "The change was not saved."));
    } finally { setBusy(false); }
  };
  if (receipt) return <ModalFrame title={ui("Item recorded")} eyebrow={ui("Post and couriers")} onClose={onDone}>
    <div className="space-y-3" data-postal-receipt={receipt}>
      <p className="text-sm">{ui("Write this code on the item: {0}", [receipt])}</p>
      <p className="text-xs text-ink-muted">{form.direction === "RECEIVE" ? ui("It stays in the queue until someone collects it.") : ui("It stays in the queue until it is dispatched and delivery is confirmed.")}</p>
      <div className="flex justify-end"><Button onClick={onDone}>{ui("Done")}</Button></div>
    </div>
  </ModalFrame>;
  return <ModalFrame title={ui("Record item")} eyebrow={ui("Post and couriers")} subtitle={ui("Record only what is needed to hand the item over.")} onClose={onClose} dirty={Boolean(form.toName || form.referenceNo || form.note)}>
    <div className="space-y-3" data-postal-intake>
      {error ? <Alert tone="danger" compact data-postal-error>{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="postal-direction" label={ui("Direction")}><Select value={form.direction} onChange={set("direction")}><option value="RECEIVE">{ui("Incoming")}</option><option value="DISPATCH">{ui("Outgoing")}</option></Select></FormField>
        <FormField name="postal-date" label={ui("Date")}><Input type="date" value={form.date} max={todayText()} onChange={set("date")} /></FormField>
        <FormField name="postal-to" label={form.direction === "RECEIVE" ? ui("For (recipient)") : ui("Addressed to")}><Input value={form.toName} maxLength={120} onChange={set("toName")} /></FormField>
        <FormField name="postal-from" label={ui("Sender (optional)")}><Input value={form.fromName} maxLength={120} onChange={set("fromName")} /></FormField>
        <FormField name="postal-courier" label={ui("Courier (optional)")}><Input value={form.courier} maxLength={60} onChange={set("courier")} /></FormField>
        <FormField name="postal-reference" label={ui("Tracking or reference number (optional)")}><Input value={form.referenceNo} maxLength={80} dir="ltr" onChange={set("referenceNo")} /></FormField>
      </div>
      <FormField name="postal-note" label={ui("Note (optional)")}><Textarea value={form.note} rows={2} maxLength={500} onChange={set("note")} /></FormField>
      <FormField name="postal-owner" label={ui("Owner responsible for the handoff (optional)")}><Select value={form.ownerId} onChange={set("ownerId")}><option value="">{ui("No owner yet")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void submit()} loading={busy}>{ui("Record item")}</Button></div>
    </div>
  </ModalFrame>;
}

function ItemDialog({ item, owners, onClose, onChanged }: { item: Item; owners: Owner[]; onClose: () => void; onChanged: () => void }) {
  const ui = useUiText();
  const { date: formatDate, dateTime } = useLocaleFormat();
  const [history, setHistory] = useState<HistoryEvent[] | null>(null), [historyError, setHistoryError] = useState("");
  const [ownerId, setOwnerId] = useState(item.ownerId ?? ""), [handedTo, setHandedTo] = useState(""), [note, setNote] = useState(""), [courier, setCourier] = useState(item.courier ?? ""), [referenceNo, setReferenceNo] = useState("");
  const [correcting, setCorrecting] = useState(false), [fields, setFields] = useState({ fromName: item.fromName ?? "", toName: item.toName ?? "", courier: item.courier ?? "", referenceNo: item.referenceNo ?? "", note: item.note ?? "", handedTo: item.handedTo ?? "" }), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const closed = CLOSED.includes(item.status);
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/front-desk/postal?history=${encodeURIComponent(item.id)}`, { cache: "no-store" }).then(r => r.json()).then(json => { if (!cancelled) { if (json.success) setHistory(json.data); else setHistoryError(ui(json.error || "History could not be loaded.")); } }).catch(() => !cancelled && setHistoryError(ui("History could not be loaded.")));
    return () => { cancelled = true; };
  }, [item.id, ui]);
  const run = async (body: Record<string, unknown>, message: string) => {
    setBusy(true); setError("");
    try { await send("PATCH", { id: item.id, version: item.version, ...body }); toast.success(message); onChanged(); }
    catch (failure) { setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Nothing is lost; try again.") : ui(failure instanceof Error ? failure.message : "The change was not saved.")); }
    finally { setBusy(false); }
  };
  const correction = () => {
    const original: Record<string, string> = { fromName: item.fromName ?? "", toName: item.toName ?? "", courier: item.courier ?? "", referenceNo: item.referenceNo ?? "", note: item.note ?? "", handedTo: item.handedTo ?? "" };
    const changed = Object.fromEntries(Object.entries(fields).filter(([field, value]) => value !== original[field] && (field !== "handedTo" || closed)));
    if (!Object.keys(changed).length) { setError(ui("Nothing changed. Edit a value before saving the correction.")); return; }
    if (reason.trim().length < 5) { setError(ui("Give a reason for the correction (at least 5 characters).")); return; }
    void run({ action: "correct", fields: changed, reason }, ui("Correction saved. The original values stay in the history."));
  };
  return <ModalFrame title={ui("Postal item {0}", [item.itemCode])} eyebrow={ui("Post and couriers")} size="lg" onClose={onClose} dirty={Boolean(note || handedTo || reason)}>
    <div className="space-y-4" data-postal-item={item.itemCode}>
      {error ? <Alert tone="danger" compact data-postal-item-error>{error}</Alert> : null}
      <section className="space-y-1 rounded-xl border border-border p-3 text-sm" aria-label={ui("Item details")}>
        <p className="sk-eyebrow">{item.direction === "RECEIVE" ? ui("Incoming") : ui("Outgoing")} · {formatDate(item.date)} · {statusLabel(ui, item.status)}</p>
        <p className="font-semibold text-ink-strong"><bdi>{item.toName}</bdi>{item.fromName ? <> · {ui("From")} <bdi>{item.fromName}</bdi></> : null}{item.courier ? <> · <bdi>{item.courier}</bdi></> : null}</p>
        {item.referenceNo ? <p className="break-all text-xs"><bdi dir="ltr">{item.referenceNo}</bdi></p> : null}
        {item.handedTo ? <p className="text-xs">{ui("Handed to")} <bdi>{item.handedTo}</bdi>{item.closedAt ? <> · <bdi>{dateTime(item.closedAt)}</bdi></> : null}</p> : null}
      </section>
      {!closed ? <>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <FormField name="postal-item-owner" label={ui("Owner responsible for the handoff")}><Select value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">{ui("No owner yet")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
          <Button variant="secondary" disabled={busy || ownerId === (item.ownerId ?? "")} onClick={() => void run({ action: "assign", ownerId: ownerId || null }, ui("Owner saved."))}>{ui("Save owner")}</Button>
        </div>
        {item.direction === "DISPATCH" && item.status === "PREPARED" ? <fieldset className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-bold">{ui("Dispatch")}</legend>
          <FormField name="postal-dispatch-courier" label={ui("Courier")}><Input value={courier} maxLength={60} onChange={event => setCourier(event.target.value)} /></FormField>
          <FormField name="postal-dispatch-reference" label={ui("Tracking or reference number (optional)")}><Input value={referenceNo} maxLength={80} dir="ltr" onChange={event => setReferenceNo(event.target.value)} /></FormField>
          <Button disabled={busy} onClick={() => { if (courier.trim().length < 2) { setError(ui("Enter the courier before dispatching.")); return; } void run({ action: "dispatch", courier, referenceNo: referenceNo || undefined }, ui("Marked dispatched. It stays open until delivery is confirmed.")); }}>{ui("Mark dispatched")}</Button>
        </fieldset> : null}
        {item.direction === "RECEIVE" || item.status === "DISPATCHED" ? <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-xs font-bold">{item.direction === "RECEIVE" ? ui("Hand over") : ui("Confirm delivery")}</legend>
          <FormField name="postal-handed-to" label={item.direction === "RECEIVE" ? ui("Collected by (name)") : ui("Received by (name)")}><Input value={handedTo} maxLength={120} onChange={event => setHandedTo(event.target.value)} /></FormField>
          <FormField name="postal-handoff-note" label={item.direction === "RECEIVE" ? ui("Acknowledgement note (optional)") : ui("How delivery was confirmed (required)")}><Input value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></FormField>
          <Button disabled={busy} onClick={() => {
            if (handedTo.trim().length < 2) { setError(ui("Enter the name of the person the item was handed to.")); return; }
            if (item.direction === "DISPATCH" && note.trim().length < 5) { setError(ui("Say how delivery was confirmed (for example a signature or the courier's proof of delivery). A tracking number alone is not delivery.")); return; }
            void run({ action: item.direction === "RECEIVE" ? "collect" : "deliver", handedTo, note: note || undefined }, item.direction === "RECEIVE" ? ui("Handed over.") : ui("Delivery confirmed."));
          }}>{item.direction === "RECEIVE" ? ui("Record collection") : ui("Confirm delivery")}</Button>
        </fieldset> : null}
      </> : null}
      {correcting ? <fieldset className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3" data-postal-correction>
        <legend className="px-1 text-xs font-bold">{ui("Correct this item")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["toName", "fromName", "courier", "referenceNo", ...(closed ? ["handedTo"] : [])] as (keyof typeof fields)[]).map(field => <FormField key={field} name={`postal-correct-${field}`} label={fieldLabel(ui, field)}><Input value={fields[field]} dir={field === "referenceNo" ? "ltr" : undefined} onChange={event => setFields(current => ({ ...current, [field]: event.target.value }))} /></FormField>)}
        </div>
        <FormField name="postal-correct-note" label={fieldLabel(ui, "note")}><Textarea value={fields.note} rows={2} onChange={event => setFields(current => ({ ...current, note: event.target.value }))} /></FormField>
        <FormField name="postal-correct-reason" label={ui("Reason for the correction")}><Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField>
        <div className="flex gap-2"><Button disabled={busy} onClick={correction}>{ui("Save correction")}</Button><Button variant="ghost" onClick={() => setCorrecting(false)}>{ui("Cancel")}</Button></div>
      </fieldset> : <Button variant="ghost" onClick={() => setCorrecting(true)}>{ui("Correct a mistake")}</Button>}
      <section aria-label={ui("History")}>
        <p className="sk-eyebrow mb-2">{ui("History")}</p>
        {historyError ? <Alert tone="danger" compact>{historyError}</Alert> : !history ? <p role="status" className="text-xs">{ui("Loading history…")}</p>
          : <ol className="space-y-1.5 text-xs" data-postal-history>{history.map(event => <li key={event.id} className="rounded-lg bg-muted/60 px-3 py-2" data-event={event.kind}>
            <p className="font-semibold text-ink-strong">{eventLabel(ui, event.kind)} · <bdi>{dateTime(event.createdAt)}</bdi>{event.actorName ? <> · <bdi>{event.actorName}</bdi></> : null}</p>
            {event.kind === "ASSIGNED" ? <p>{event.ownerName ? ui("Owner: {0}", [event.ownerName]) : ui("No owner yet")}</p> : null}
            {event.kind === "CORRECTED" && event.changes ? <ul className="mt-1 space-y-0.5">{Object.entries(event.changes as Record<string, { from: string | null; to: string | null }>).map(([field, change]) => <li key={field} className="break-all" data-correction-field={field}>{fieldLabel(ui, field)}: <s><bdi dir="auto">{change.from ?? "—"}</bdi></s> → <bdi dir="auto">{change.to ?? "—"}</bdi></li>)}</ul> : null}
            {event.note ? <p className="whitespace-pre-wrap"><bdi>{event.note}</bdi></p> : null}
          </li>)}</ol>}
      </section>
    </div>
  </ModalFrame>;
}
