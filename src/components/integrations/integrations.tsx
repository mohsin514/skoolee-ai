"use client";
import { useFetch } from "@/hooks";
import { checkedJson, readRequest } from "@/lib/http/request-state";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DeskFilterStatus, DeskPill, DeskQuickFilter, DeskRowButton, DeskRowIcon, DeskStats, RelativeTime, StatTile, deskRow, deskTimeline, type DeskTone } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { AlertTriangle, CirclePause, KeyRound, PlugZap, Send, Webhook } from "lucide-react";
import { usePanelCommand } from "@/components/fees/fee-utils";

// SKO-445: integration connections. Lists never show keys or secrets — they are shown once, on creation or
// rotation. Health is recent delivery evidence; a delivery is "accepted by the destination", which is not the
// same as processed. Failed deliveries open a redacted payload with the attempt log, and replay reuses the event id.

type Ui = ReturnType<typeof useUiText>;
/** A refused or failed request, with its HTTP status: 401/403 is "no access", anything else is a load failure (R4). */
class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  if (method === "GET") return (await checkedJson(await readRequest(url))).data;
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new RequestError(json.error || "The change was not saved.", response.status);
  return json.data;
}
type Key = { keyId: string; status: string; expiresAt: string | null; lastUsedAt: string | null; createdAt: string; live: boolean };
type Conn = { id: string; name: string; campusIds: string[]; scopes: string[]; topics: string[]; contractVersion: string; status: string; webhookHost: string | null; rateLimitPerMinute: number; dailyQuota: number; signingRotating: boolean; keys: Key[]; deliveries: Record<string, number> };
type Data = { campuses: { id: string; name: string }[]; scopes: string[]; topics: string[]; contract: { version: string; status: string }; connections: Conn[] };
type Delivery = { id: string; eventId: string; topic: string; occurredAt: string; status: string; attempts: number; lastStatusCode: number | null; lastError: string | null; deliveredAt: string | null; replayCount: number };
type Detail = { id: string; eventId: string; topic: string; status: string; payload: unknown; attemptLog: { attempt: number; replay: number; host: string; statusCode: number | null; outcome: string; error: string | null; durationMs: number | null; signedWith: number; createdAt: string }[] };
const statusTone = (s: string): DeskTone => s === "ACTIVE" || s === "DELIVERED" ? "success" : s === "PAUSED" || s === "PENDING" || s === "DELIVERING" ? "warning" : s === "FAILED" || s === "BLOCKED" ? "danger" : "neutral";
const failing = (c: Conn) => (c.deliveries.FAILED ?? 0) + (c.deliveries.BLOCKED ?? 0);
type Focus = "active" | "paused" | "failing";
const FOCUS: Record<Focus, (c: Conn) => boolean> = { active: c => c.status === "ACTIVE", paused: c => c.status === "PAUSED", failing: c => c.status !== "REVOKED" && failing(c) > 0 };
const statusLabel = (ui: Ui, s: string) => ({ ACTIVE: ui("Active"), PAUSED: ui("Paused"), REVOKED: ui("Revoked"), PENDING: ui("Waiting to send"), DELIVERING: ui("Sending"), DELIVERED: ui("Accepted by destination"), FAILED: ui("Failed after retries"), BLOCKED: ui("Blocked destination") } as Record<string, string>)[s] ?? s;

function Secrets({ value, onClose }: { value: { apiKey?: string; signingSecret?: string | null; previousValidUntil?: string | null }; onClose: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  return <Modal title={ui("Copy these now")} icon={KeyRound} tone="amber" subtitle={ui("They are shown once and cannot be read back. Store them in the other system's secret store.")} size="sm" onClose={onClose} footer={<div className="flex justify-end"><Button onClick={onClose}>{ui("I stored them")}</Button></div>}><div className="space-y-3" data-secrets>
    {value.apiKey ? <FormField name="sec-key" label={ui("API key")}><Input readOnly value={value.apiKey} dir="ltr" className="font-mono text-xs" data-secret-key /></FormField> : null}
    {value.signingSecret ? <FormField name="sec-sign" label={ui("Webhook signing secret")}><Input readOnly value={value.signingSecret} dir="ltr" className="font-mono text-xs" data-secret-signing /></FormField> : null}
    {value.previousValidUntil ? <Alert tone="info" compact live="off">{ui("The previous key keeps working until {0}.", [dateTime(value.previousValidUntil)])}</Alert> : null}
  </div></Modal>;
}

/**
 * Shared settings-save contract (the console's per-tab Save, §4.4): the save here is creating the connection drafted
 * in the "Add connection" form. `hideSave` drops that form's own "Create connection" button; a new `command`
 * `{ id: "save" }` creates it (or points at what is missing), `{ id: "add" }` opens the form. `onDirtyChange(dirty,
 * saving)` reports an open form with something entered, and whether a request is running.
 */
export function Integrations({ hideSave = false, command, onDirtyChange }: {
  hideSave?: boolean;
  command?: { id: string; nonce: number } | null;
  onDirtyChange?: (dirty: boolean, saving: boolean) => void;
} = {}) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const { data, failure, isLoading, refetch: load } = useFetch<Data>("/api/integrations?view=connections");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", campusIds: [] as string[], scopes: ["roster.read"] as string[], topics: [] as string[], webhookUrl: "" }), [adding, setAdding] = useState(false);
  const [secrets, setSecrets] = useState<{ apiKey?: string; signingSecret?: string | null; previousValidUntil?: string | null } | null>(null);
  const [open, setOpen] = useState<string | null>(null), [filter, setFilter] = useState(""), [detail, setDetail] = useState<Detail | null>(null), [confirmReplay, setConfirmReplay] = useState(false);
  const deliveries = useFetch<Delivery[]>(`/api/integrations?view=deliveries&connectionId=${encodeURIComponent(open ?? "")}${filter ? `&status=${encodeURIComponent(filter)}` : ""}`, { immediate: !!open, collection:true });
  const list = deliveries.data ?? [];
  // §8.1 R3: revoking a connection or a key stops a running system, so it is confirmed first.
  const [revoking, setRevoking] = useState<{ conn: Conn; keyId?: string } | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null), [query, setQuery] = useState("");
  // Shown when a console Save is pressed before the form is complete (its own button is disabled instead).
  const [formHint, setFormHint] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  // Set by the console's "add" command: the name field takes focus once the form has mounted.
  const focusName = useRef(false);
  const formReady = form.name.trim().length >= 3 && form.campusIds.length > 0;
  const formDirty = adding && (form.name.trim() !== "" || form.campusIds.length > 0 || form.topics.length > 0 || form.webhookUrl.trim() !== "");
  const reportDirty = useRef(onDirtyChange);
  useEffect(() => { reportDirty.current = onDirtyChange; });
  useEffect(() => { reportDirty.current?.(formDirty, busy); }, [formDirty, busy]);
  useEffect(() => () => reportDirty.current?.(false, false), []);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await load(); if (open) await deliveries.refetch(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  const createConnection = () => {
    if (busy) return;
    if (!formReady) { setFormHint(true); nameRef.current?.focus(); return; }
    setFormHint(false);
    void run(async () => { setSecrets(await call("/api/integrations", "POST", { action: "create", ...form, webhookUrl: form.webhookUrl || undefined })); setAdding(false); setForm({ name: "", campusIds: [], scopes: ["roster.read"], topics: [], webhookUrl: "" }); }, "Connection created.");
  };
  usePanelCommand(command, {
    save: () => { if (adding) createConnection(); },
    add: () => { if (adding) nameRef.current?.focus(); else { focusName.current = true; setAdding(true); } },
  }, Boolean(data));
  if (failure) return <ErrorState error={failure} onRetry={load} />;
  if (isLoading || !data) return <SkeletonList rows={3} label={ui("Loading delivery receipts and contract health.")} />;
  const toggle = (k: "campusIds" | "scopes" | "topics", v: string, on: boolean) => setForm({ ...form, [k]: on ? [...form[k], v] : form[k].filter(x => x !== v) });
  const needle = query.trim().toLocaleLowerCase();
  const shown = data.connections.filter(c => (!focus || FOCUS[focus](c)) && (!needle || [c.name, c.webhookHost ?? "", ...c.scopes].some(v => v.toLocaleLowerCase().includes(needle))));
  const tile = (id: Focus, index: number, icon: typeof PlugZap, tone: DeskTone, label: string) => <StatTile index={index} icon={icon} tone={tone} value={data.connections.filter(FOCUS[id]).length} label={ui(label)} onSelect={() => setFocus(focus === id ? null : id)} selected={focus === id} data-integration-focus={id} />;
  const openForm = () => { setAdding(!adding); setFormHint(false); };
  return <div className="min-w-0 space-y-5" data-integrations>
    <div className="flex flex-wrap items-start justify-between gap-3"><PageHeader className="min-w-0 flex-1" headingLevel={2} icon={PlugZap} title="Integration connections" description={<>{ui("Public contract {0} · {1}", [data.contract.version, data.contract.status === "CURRENT" ? ui("Current") : ui("Deprecated")])} · <a className="sk-link" href="/api/public/v1/contract" target="_blank" rel="noreferrer" dir="ltr">/api/public/v1/contract</a></>} /><Button className="w-full sm:w-auto" onClick={openForm} data-add-connection>{ui("Add connection")}</Button></div>
    {data.connections.length ? <DeskStats data-integration-pulse>
      {tile("active", 0, PlugZap, "success", "Active")}
      {tile("paused", 1, CirclePause, data.connections.some(FOCUS.paused) ? "warning" : "neutral", "Paused")}
      {tile("failing", 2, AlertTriangle, data.connections.some(FOCUS.failing) ? "danger" : "success", "Failed after retries")}
    </DeskStats> : null}
    {data.connections.length > 8 ? <DeskQuickFilter value={query} onChange={setQuery} label={ui("Filter this list")} /> : null}
    <DeskFilterStatus shown={shown.length} total={data.connections.length} onClear={() => { setFocus(null); setQuery(""); }} />
    {adding ? <section className="sk-panel space-y-3 p-4 sm:p-5" data-connection-form>
      <FormField name="ic-name" label={ui("Connected system")}><Input ref={(node) => { nameRef.current = node; if (node && focusName.current) { focusName.current = false; node.focus(); } }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} dir="auto" data-connection-name /></FormField>
      <fieldset><legend className="text-sm font-bold">{ui("Campuses it may see")}</legend><div className="flex flex-wrap gap-3">{data.campuses.map(c => <label key={c.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.campusIds.includes(c.id)} onChange={e => toggle("campusIds", c.id, e.target.checked)} data-connection-campus={c.name} /><bdi>{c.name}</bdi></label>)}</div></fieldset>
      <fieldset><legend className="text-sm font-bold">{ui("Permissions")}</legend><div className="flex flex-wrap gap-3">{data.scopes.map(s => <label key={s} className="flex items-center gap-2 text-sm"><Checkbox checked={form.scopes.includes(s)} onChange={e => toggle("scopes", s, e.target.checked)} data-connection-scope={s} /><bdi dir="ltr">{s}</bdi></label>)}</div><p className="text-xs text-ink-muted">{ui("A connection never inherits your own access.")}</p></fieldset>
      <FormField name="ic-url" label={ui("Webhook URL (optional)")}><Input value={form.webhookUrl} onChange={e => setForm({ ...form, webhookUrl: e.target.value })} dir="ltr" placeholder="https://example.org/hooks/skoolee" data-connection-url /></FormField>
      <fieldset><legend className="text-sm font-bold">{ui("Events")}</legend><div className="flex flex-wrap gap-3">{data.topics.map(t => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox checked={form.topics.includes(t)} onChange={e => toggle("topics", t, e.target.checked)} data-connection-topic={t} /><bdi dir="ltr">{t}</bdi></label>)}</div></fieldset>
      {formHint && !formReady ? <Alert tone="warning" compact>{ui("Name the connected system (at least 3 characters) and choose at least one campus.")}</Alert> : null}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { setAdding(false); setFormHint(false); }}>{ui("Back")}</Button>{hideSave ? null : <Button disabled={busy || !formReady} onClick={createConnection} data-connection-create>{ui("Create connection")}</Button>}</div>
    </section> : null}
    {data.connections.length ? <ul className="space-y-3">{shown.map(c => <li key={c.id} className={`${deskRow} space-y-3`} data-tone={c.status === "REVOKED" ? "muted" : FOCUS.failing(c) ? "danger" : c.status === "PAUSED" ? "warning" : undefined} data-connection={c.name} data-connection-status={c.status}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-1 basis-64 items-start gap-3"><DeskRowIcon icon={c.webhookHost ? Webhook : PlugZap} /><div className="min-w-0 space-y-1"><p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-strong"><bdi>{c.name}</bdi> <DeskPill tone={statusTone(c.status)}>{statusLabel(ui, c.status)}</DeskPill></p><p className="text-xs text-ink-muted">{ui("Campuses: {0}", [c.campusIds.map(id => data.campuses.find(x => x.id === id)?.name ?? "").join(", ")])} · <bdi dir="ltr">{c.scopes.join(", ")}</bdi> · <bdi dir="ltr">{c.contractVersion}</bdi>{c.webhookHost ? <> · <bdi dir="ltr">{c.webhookHost}</bdi></> : null}</p>
        <p className="text-xs" data-connection-health>{ui("Last 7 days: {0} accepted, {1} waiting, {2} failed, {3} blocked", [String(c.deliveries.DELIVERED ?? 0), String((c.deliveries.PENDING ?? 0) + (c.deliveries.DELIVERING ?? 0)), String(c.deliveries.FAILED ?? 0), String(c.deliveries.BLOCKED ?? 0)])}</p></div></div>
        {c.status !== "REVOKED" ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => setSecrets(await call("/api/integrations", "POST", { action: "rotate-key", id: c.id, overlapMinutes: 60 })), "New key created. The old key keeps working for an hour.")} data-rotate-key>{ui("Rotate key")}</Button>{c.webhookHost ? <><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => setSecrets(await call("/api/integrations", "POST", { action: "rotate-signing", id: c.id, overlapMinutes: 60 })), "New signing secret created.")} data-rotate-signing>{ui("Rotate signing secret")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const r = await call("/api/integrations", "POST", { action: "test", id: c.id }); if (!r.ok) throw new Error(r.reason); }, "Test event queued.")} data-test-destination>{ui("Test destination")}</Button></> : null}<Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => call("/api/integrations", "POST", { action: "status", id: c.id, status: c.status === "PAUSED" ? "ACTIVE" : "PAUSED" }), c.status === "PAUSED" ? "Connection resumed." : "Connection paused.")} data-pause>{c.status === "PAUSED" ? ui("Resume connection") : ui("Pause connection")}</Button><Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setRevoking({ conn: c })} data-revoke>{ui("Revoke")}</Button></div> : null}
      </div>
      <details className="text-sm"><summary className="cursor-pointer">{ui("Keys")}</summary><ul className="mt-1 space-y-1">{c.keys.map(k => <li key={k.keyId} className="flex flex-wrap items-center justify-between gap-2" data-key={k.keyId} data-key-live={k.live}><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><bdi dir="ltr" className="font-mono text-xs">{k.keyId}…</bdi> <DeskPill tone={k.live ? "success" : "neutral"}>{k.live ? ui("Active") : ui("Not accepted")}</DeskPill>{k.expiresAt && k.live ? <span className="text-xs text-ink-muted">{ui("until {0}", [dateTime(k.expiresAt)])}</span> : null}{k.lastUsedAt ? <span className="text-xs text-ink-muted">{ui("last used {0}", [dateTime(k.lastUsedAt)])}</span> : null}</span>{k.live && c.status !== "REVOKED" ? <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setRevoking({ conn: c, keyId: k.keyId })} data-revoke-key>{ui("Revoke key")}</Button> : null}</li>)}</ul></details>
      {c.webhookHost ? <div><Button size="sm" variant="ghost" onClick={() => { setOpen(open === c.id ? null : c.id); setFilter(""); }} data-open-deliveries>{open === c.id ? ui("Hide deliveries") : ui("Deliveries")}</Button>
        {open === c.id ? <div className="mt-2 space-y-2" data-deliveries>
          <div className="flex flex-wrap items-center justify-between gap-2"><Select className="w-auto" value={filter} onChange={e => setFilter(e.target.value)} aria-label={ui("Status")} data-delivery-filter><option value="">{ui("All")}</option><option value="FAILED">{ui("Failed after retries")}</option><option value="BLOCKED">{ui("Blocked destination")}</option><option value="PENDING">{ui("Waiting to send")}</option><option value="DELIVERED">{ui("Accepted by destination")}</option></Select><p className="text-xs text-ink-muted">{ui("Delivered is different from processed: it means the destination accepted the request.")}</p></div>
          {deliveries.isLoading ? <SkeletonList rows={3} label={ui("Loading…")} /> : deliveries.failure ? <ErrorState error={deliveries.failure} onRetry={deliveries.refetch} /> : list.length ? <ul className="space-y-2">{list.map(d => <li key={d.id}><DeskRowButton icon={Send} tone={d.status === "FAILED" || d.status === "BLOCKED" ? "danger" : d.status === "DELIVERED" ? "success" : undefined} trailing={<DeskPill tone={statusTone(d.status)}>{statusLabel(ui, d.status)}</DeskPill>} className="text-start" onClick={async () => { setConfirmReplay(false); try { setDetail(await call(`/api/integrations?view=delivery&id=${d.id}`)); } catch (failure) { setDetail(null); toast.error(failure); } }} data-delivery={d.eventId} data-delivery-status={d.status}><span className="block text-sm font-semibold text-ink-strong"><bdi dir="ltr">{d.topic}</bdi> · <bdi dir="ltr" className="font-mono text-xs">{d.eventId.slice(0, 8)}</bdi></span><span className="block text-xs text-ink-subtle tabular-nums">{ui("{0} attempts", [String(d.attempts)])}{d.replayCount ? <> · {ui("replayed {0}×", [String(d.replayCount)])}</> : null} · <bdi><RelativeTime iso={d.occurredAt} full={dateTime(d.occurredAt)} /></bdi></span></DeskRowButton></li>)}</ul> : <div role="status" data-resource-state={filter ? "no-match" : "no-data"}><EmptyState size="sm" icon={Send} title={ui(filter ? "No matching records" : "No deliveries yet.")} description={ui(filter ? "Change or clear your search to see more records." : "Deliveries appear here when an event is sent to this connection's webhook.")} action={filter ? <Button size="sm" variant="outline" onClick={() => setFilter("")}>{ui("Clear filters")}</Button> : undefined} /></div>}
        </div> : null}
      </div> : null}
    </li>)}</ul> : adding ? null : <div className="sk-panel" data-integrations-empty><EmptyState size="sm" icon={PlugZap} title={ui("No external connections configured.")} description={ui("A connection never inherits your own access.")} primaryAction={{ id: "add-connection", label: "Add connection", onClick: openForm }} /></div>}
    {secrets ? <Secrets value={secrets} onClose={() => setSecrets(null)} /> : null}
    <ConfirmAction
      open={Boolean(revoking)}
      tone="danger"
      title={revoking?.keyId ? ui("Revoke this key?") : ui("Revoke {0}?", [revoking?.conn.name ?? ""])}
      description={revoking?.keyId
        ? ui("Any system still using this key is refused straight away. Other keys keep working.")
        : ui("Its keys stop working now and it receives no more events. This cannot be undone; a new connection needs new keys.")}
      confirmLabel={revoking?.keyId ? ui("Revoke key") : ui("Revoke connection")}
      cancelLabel={ui("Keep editing")}
      busy={busy}
      onCancel={() => setRevoking(null)}
      onConfirm={async () => {
        const target = revoking;
        if (!target) return;
        const ok = await run(() => call("/api/integrations", "POST", target.keyId ? { action: "revoke-key", id: target.conn.id, keyId: target.keyId } : { action: "status", id: target.conn.id, status: "REVOKED" }), target.keyId ? "Key revoked." : "Connection revoked. Its keys stop working now.");
        if (ok) setRevoking(null);
      }}
    />
    {detail ? <Modal title={ui("Delivery {0}", [detail.eventId.slice(0, 8)])} icon={Send} tone={detail.status === "FAILED" || detail.status === "BLOCKED" ? "rose" : detail.status === "DELIVERED" ? "emerald" : "sky"} subtitle={<bdi dir="ltr">{detail.topic}</bdi>} chips={<DeskPill tone={statusTone(detail.status)}>{statusLabel(ui, detail.status)}</DeskPill>} size="sm" onClose={() => setDetail(null)}
      footer={!confirmReplay ? <div className="flex justify-end"><Button disabled={detail.status === "DELIVERING"} onClick={() => setConfirmReplay(true)} data-replay>{ui("Replay the original event")}</Button></div>
        : <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirmReplay(false)}>{ui("Back")}</Button><Button disabled={busy} onClick={() => void run(async () => { await call("/api/integrations", "POST", { action: "replay", id: detail.id }); setDetail(null); }, "Replay queued with the original event ID; awaiting acknowledgment.")} data-replay-confirm-button>{ui("Replay")}</Button></div>}><div className="space-y-3" data-delivery-detail>
      <p className="text-sm">{ui("Event id")} <bdi dir="ltr" className="break-all font-mono text-xs">{detail.eventId}</bdi></p>
      <ol className={`${deskTimeline} text-xs`} data-attempts>{detail.attemptLog.map(a => <li key={`${a.replay}-${a.attempt}`} data-tone={a.statusCode !== null && a.statusCode < 300 ? "success" : a.error ? "danger" : "neutral"}>{ui("Attempt {0}", [String(a.attempt)])}{a.replay ? <> · {ui("replay {0}", [String(a.replay)])}</> : null} · <bdi dir="ltr">{a.outcome}{a.statusCode ? ` ${a.statusCode}` : ""}</bdi> · <bdi dir="ltr">{a.host}</bdi>{a.error ? <> · <span dir="auto">{a.error}</span></> : null} · <bdi>{dateTime(a.createdAt)}</bdi></li>)}</ol>
      <details open><summary className="cursor-pointer text-sm font-bold">{ui("Payload (redacted)")}</summary><pre dir="ltr" className="max-h-64 overflow-auto rounded-xl bg-ink-strong p-3 text-xs text-white" data-payload>{JSON.stringify(detail.payload, null, 2)}</pre></details>
      {confirmReplay ? <Alert tone="warning" compact data-replay-confirm>{ui("The destination receives the same event id again. If it already processed this event, it should ignore the repeat.")}</Alert> : null}
    </div></Modal> : null}
  </div>;
}
