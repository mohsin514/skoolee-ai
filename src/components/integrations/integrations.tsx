"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

// SKO-445: integration connections. Lists never show keys or secrets — they are shown once, on creation or
// rotation. Health is recent delivery evidence; a delivery is "accepted by the destination", which is not the
// same as processed. Failed deliveries open a redacted payload with the attempt log, and replay reuses the event id.

type Ui = ReturnType<typeof useUiText>;
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}
type Key = { keyId: string; status: string; expiresAt: string | null; lastUsedAt: string | null; createdAt: string; live: boolean };
type Conn = { id: string; name: string; campusIds: string[]; scopes: string[]; topics: string[]; contractVersion: string; status: string; webhookHost: string | null; rateLimitPerMinute: number; dailyQuota: number; signingRotating: boolean; keys: Key[]; deliveries: Record<string, number> };
type Data = { campuses: { id: string; name: string }[]; scopes: string[]; topics: string[]; contract: { version: string; status: string }; connections: Conn[] };
type Delivery = { id: string; eventId: string; topic: string; occurredAt: string; status: string; attempts: number; lastStatusCode: number | null; lastError: string | null; deliveredAt: string | null; replayCount: number };
type Detail = { id: string; eventId: string; topic: string; status: string; payload: unknown; attemptLog: { attempt: number; replay: number; host: string; statusCode: number | null; outcome: string; error: string | null; durationMs: number | null; signedWith: number; createdAt: string }[] };
const statusLabel = (ui: Ui, s: string) => ({ ACTIVE: ui("Active"), PAUSED: ui("Paused"), REVOKED: ui("Revoked"), PENDING: ui("Waiting to send"), DELIVERING: ui("Sending"), DELIVERED: ui("Accepted by destination"), FAILED: ui("Failed after retries"), BLOCKED: ui("Blocked destination") } as Record<string, string>)[s] ?? s;

function Secrets({ value, onClose }: { value: { apiKey?: string; signingSecret?: string | null; previousValidUntil?: string | null }; onClose: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  return <ModalFrame title={ui("Copy these now")} onClose={onClose}><div className="space-y-3" data-secrets>
    <p className="text-sm">{ui("They are shown once and cannot be read back. Store them in the other system's secret store.")}</p>
    {value.apiKey ? <FormField name="sec-key" label={ui("API key")}><Input readOnly value={value.apiKey} dir="ltr" className="font-mono text-xs" data-secret-key /></FormField> : null}
    {value.signingSecret ? <FormField name="sec-sign" label={ui("Webhook signing secret")}><Input readOnly value={value.signingSecret} dir="ltr" className="font-mono text-xs" data-secret-signing /></FormField> : null}
    {value.previousValidUntil ? <p className="text-xs text-ink-muted">{ui("The previous key keeps working until {0}.", [dateTime(value.previousValidUntil)])}</p> : null}
    <div className="flex justify-end"><Button onClick={onClose}>{ui("I stored them")}</Button></div>
  </div></ModalFrame>;
}

export function Integrations() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<Data | null>(null), [denied, setDenied] = useState(false), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", campusIds: [] as string[], scopes: ["roster.read"] as string[], topics: [] as string[], webhookUrl: "" }), [adding, setAdding] = useState(false);
  const [secrets, setSecrets] = useState<{ apiKey?: string; signingSecret?: string | null; previousValidUntil?: string | null } | null>(null);
  const [open, setOpen] = useState<string | null>(null), [list, setList] = useState<Delivery[]>([]), [filter, setFilter] = useState(""), [detail, setDetail] = useState<Detail | null>(null), [confirmReplay, setConfirmReplay] = useState(false);
  const load = useCallback(async () => { try { setData(await call("/api/integrations?view=connections")); setDenied(false); } catch { setDenied(true); } }, []);
  const loadDeliveries = useCallback(async (id: string, status: string) => setList(await call(`/api/integrations?view=deliveries&connectionId=${id}${status ? `&status=${status}` : ""}`)), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (open) void loadDeliveries(open, filter).catch(() => setList([])); }, [open, filter, loadDeliveries]);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await load(); if (open) await loadDeliveries(open, filter); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  if (denied) return <p className="sk-panel p-4 text-sm" data-integrations-denied>{ui("Integration administration access is required.")}</p>;
  if (!data) return <p className="text-sm text-ink-muted">{ui("Loading delivery receipts and contract health.")}</p>;
  const toggle = (k: "campusIds" | "scopes" | "topics", v: string, on: boolean) => setForm({ ...form, [k]: on ? [...form[k], v] : form[k].filter(x => x !== v) });
  return <div className="min-w-0 space-y-5" data-integrations>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-black">{ui("Integration connections")}</h1><p className="text-sm text-ink-muted">{ui("Public contract {0} · {1}", [data.contract.version, data.contract.status === "CURRENT" ? ui("Current") : ui("Deprecated")])} · <a className="underline" href="/api/public/v1/contract" target="_blank" rel="noreferrer" dir="ltr">/api/public/v1/contract</a></p></div><Button onClick={() => setAdding(!adding)} data-add-connection>{ui("Add connection")}</Button></header>
    {adding ? <section className="sk-panel space-y-3 p-4" data-connection-form>
      <FormField name="ic-name" label={ui("Connected system")}><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} dir="auto" data-connection-name /></FormField>
      <fieldset><legend className="text-sm font-bold">{ui("Campuses it may see")}</legend><div className="flex flex-wrap gap-3">{data.campuses.map(c => <label key={c.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.campusIds.includes(c.id)} onChange={e => toggle("campusIds", c.id, e.target.checked)} data-connection-campus={c.name} /><bdi>{c.name}</bdi></label>)}</div></fieldset>
      <fieldset><legend className="text-sm font-bold">{ui("Permissions")}</legend><div className="flex flex-wrap gap-3">{data.scopes.map(s => <label key={s} className="flex items-center gap-2 text-sm"><Checkbox checked={form.scopes.includes(s)} onChange={e => toggle("scopes", s, e.target.checked)} data-connection-scope={s} /><bdi dir="ltr">{s}</bdi></label>)}</div><p className="text-xs text-ink-muted">{ui("A connection never inherits your own access.")}</p></fieldset>
      <FormField name="ic-url" label={ui("Webhook URL (optional)")}><Input value={form.webhookUrl} onChange={e => setForm({ ...form, webhookUrl: e.target.value })} dir="ltr" placeholder="https://example.org/hooks/skoolee" data-connection-url /></FormField>
      <fieldset><legend className="text-sm font-bold">{ui("Events")}</legend><div className="flex flex-wrap gap-3">{data.topics.map(t => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox checked={form.topics.includes(t)} onChange={e => toggle("topics", t, e.target.checked)} data-connection-topic={t} /><bdi dir="ltr">{t}</bdi></label>)}</div></fieldset>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAdding(false)}>{ui("Back")}</Button><Button disabled={busy || form.name.trim().length < 3 || !form.campusIds.length} onClick={() => void run(async () => { setSecrets(await call("/api/integrations", "POST", { action: "create", ...form, webhookUrl: form.webhookUrl || undefined })); setAdding(false); setForm({ name: "", campusIds: [], scopes: ["roster.read"], topics: [], webhookUrl: "" }); }, "Connection created.")} data-connection-create>{ui("Create connection")}</Button></div>
    </section> : null}
    {data.connections.length ? <ul className="space-y-3">{data.connections.map(c => <li key={c.id} className="sk-panel space-y-2 p-4" data-connection={c.name} data-connection-status={c.status}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-black"><bdi>{c.name}</bdi> · <span className="rounded-full border px-2 text-xs">{statusLabel(ui, c.status)}</span></p><p className="text-xs text-ink-muted">{ui("Campuses: {0}", [c.campusIds.map(id => data.campuses.find(x => x.id === id)?.name ?? "").join(", ")])} · <bdi dir="ltr">{c.scopes.join(", ")}</bdi> · <bdi dir="ltr">{c.contractVersion}</bdi>{c.webhookHost ? <> · <bdi dir="ltr">{c.webhookHost}</bdi></> : null}</p>
        <p className="text-xs" data-connection-health>{ui("Last 7 days: {0} accepted, {1} waiting, {2} failed, {3} blocked", [String(c.deliveries.DELIVERED ?? 0), String((c.deliveries.PENDING ?? 0) + (c.deliveries.DELIVERING ?? 0)), String(c.deliveries.FAILED ?? 0), String(c.deliveries.BLOCKED ?? 0)])}</p></div>
        {c.status !== "REVOKED" ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => setSecrets(await call("/api/integrations", "POST", { action: "rotate-key", id: c.id, overlapMinutes: 60 })), "New key created. The old key keeps working for an hour.")} data-rotate-key>{ui("Rotate key")}</Button>{c.webhookHost ? <><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => setSecrets(await call("/api/integrations", "POST", { action: "rotate-signing", id: c.id, overlapMinutes: 60 })), "New signing secret created.")} data-rotate-signing>{ui("Rotate signing secret")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const r = await call("/api/integrations", "POST", { action: "test", id: c.id }); if (!r.ok) throw new Error(r.reason); }, "Test event queued.")} data-test-destination>{ui("Test destination")}</Button></> : null}<Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => call("/api/integrations", "POST", { action: "status", id: c.id, status: c.status === "PAUSED" ? "ACTIVE" : "PAUSED" }), c.status === "PAUSED" ? "Connection resumed." : "Connection paused.")} data-pause>{c.status === "PAUSED" ? ui("Resume connection") : ui("Pause connection")}</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => void run(() => call("/api/integrations", "POST", { action: "status", id: c.id, status: "REVOKED" }), "Connection revoked. Its keys stop working now.")} data-revoke>{ui("Revoke")}</Button></div> : null}
      </div>
      <details className="text-sm"><summary className="cursor-pointer">{ui("Keys")}</summary><ul className="mt-1 space-y-1">{c.keys.map(k => <li key={k.keyId} className="flex flex-wrap items-center justify-between gap-2" data-key={k.keyId} data-key-live={k.live}><span><bdi dir="ltr">{k.keyId}…</bdi> · {k.live ? ui("Active") : ui("Not accepted")}{k.expiresAt && k.live ? <> · {ui("until {0}", [dateTime(k.expiresAt)])}</> : null}{k.lastUsedAt ? <> · {ui("last used {0}", [dateTime(k.lastUsedAt)])}</> : null}</span>{k.live && c.status !== "REVOKED" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => call("/api/integrations", "POST", { action: "revoke-key", id: c.id, keyId: k.keyId }), "Key revoked.")} data-revoke-key>{ui("Revoke key")}</Button> : null}</li>)}</ul></details>
      {c.webhookHost ? <div><Button size="sm" variant="ghost" onClick={() => { setOpen(open === c.id ? null : c.id); setFilter(""); }} data-open-deliveries>{open === c.id ? ui("Hide deliveries") : ui("Deliveries")}</Button>
        {open === c.id ? <div className="mt-2 space-y-2" data-deliveries>
          <div className="flex flex-wrap items-center justify-between gap-2"><Select className="w-auto" value={filter} onChange={e => setFilter(e.target.value)} aria-label={ui("Status")} data-delivery-filter><option value="">{ui("All")}</option><option value="FAILED">{ui("Failed after retries")}</option><option value="BLOCKED">{ui("Blocked destination")}</option><option value="PENDING">{ui("Waiting to send")}</option><option value="DELIVERED">{ui("Accepted by destination")}</option></Select><p className="text-xs text-ink-muted">{ui("Delivered is different from processed: it means the destination accepted the request.")}</p></div>
          {list.length ? <ul className="space-y-1">{list.map(d => <li key={d.id}><Button variant="ghost" className={cn("h-auto w-full flex-wrap justify-between py-2 text-start", (d.status === "FAILED" || d.status === "BLOCKED") && "text-red-700 dark:text-red-300")} onClick={async () => { setConfirmReplay(false); setDetail(await call(`/api/integrations?view=delivery&id=${d.id}`)); }} data-delivery={d.eventId} data-delivery-status={d.status}><span><bdi dir="ltr">{d.topic}</bdi> · <bdi dir="ltr">{d.eventId.slice(0, 8)}</bdi> · {statusLabel(ui, d.status)}</span><span className="text-xs">{ui("{0} attempts", [String(d.attempts)])}{d.replayCount ? <> · {ui("replayed {0}×", [String(d.replayCount)])}</> : null} · <bdi>{dateTime(d.occurredAt)}</bdi></span></Button></li>)}</ul> : <p className="text-sm text-ink-muted">{ui("No deliveries yet.")}</p>}
        </div> : null}
      </div> : null}
    </li>)}</ul> : <p className="sk-panel p-4 text-sm" data-integrations-empty>{ui("No external connections configured.")}</p>}
    {secrets ? <Secrets value={secrets} onClose={() => setSecrets(null)} /> : null}
    {detail ? <ModalFrame title={ui("Delivery {0}", [detail.eventId.slice(0, 8)])} onClose={() => setDetail(null)}><div className="space-y-3" data-delivery-detail>
      <p className="text-sm"><bdi dir="ltr">{detail.topic}</bdi> · {statusLabel(ui, detail.status)} · {ui("Event id")} <bdi dir="ltr" className="font-mono text-xs">{detail.eventId}</bdi></p>
      <ol className="space-y-1 text-xs" data-attempts>{detail.attemptLog.map(a => <li key={`${a.replay}-${a.attempt}`}>{ui("Attempt {0}", [String(a.attempt)])}{a.replay ? <> · {ui("replay {0}", [String(a.replay)])}</> : null} · <bdi dir="ltr">{a.outcome}{a.statusCode ? ` ${a.statusCode}` : ""}</bdi> · <bdi dir="ltr">{a.host}</bdi>{a.error ? <> · <span dir="auto">{a.error}</span></> : null} · <bdi>{dateTime(a.createdAt)}</bdi></li>)}</ol>
      <details open><summary className="cursor-pointer text-sm font-bold">{ui("Payload (redacted)")}</summary><pre dir="ltr" className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100" data-payload>{JSON.stringify(detail.payload, null, 2)}</pre></details>
      {!confirmReplay ? <div className="flex justify-end"><Button disabled={detail.status === "DELIVERING"} onClick={() => setConfirmReplay(true)} data-replay>{ui("Replay the original event")}</Button></div>
        : <div className="space-y-2 rounded-xl border border-amber-400 p-3 text-sm" data-replay-confirm><p>{ui("The destination receives the same event id again. If it already processed this event, it should ignore the repeat.")}</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirmReplay(false)}>{ui("Back")}</Button><Button disabled={busy} onClick={() => void run(async () => { await call("/api/integrations", "POST", { action: "replay", id: detail.id }); setDetail(null); }, "Replay queued with the original event ID; awaiting acknowledgment.")} data-replay-confirm-button>{ui("Replay")}</Button></div></div>}
    </div></ModalFrame> : null}
  </div>;
}
