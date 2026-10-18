"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

// SKO-437: route riders and stops, dated trips with a frozen manifest, and the crew's trip desk.
// The desk shows unresolved riders first and uses large actions; every event carries the time it happened
// and a device id, so events recorded without a connection wait on this device and replay safely later.
// Families see only their child's status today — no live location and no crew contact.

type Ui = ReturnType<typeof useUiText>;
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw Object.assign(new Error(json.error || "Cannot verify the current manifest. Follow the school's documented fallback."), { status: response.status });
  return json.data;
}
const todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const eventId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const statusLabel = (ui: Ui, s: string) => ({ EXPECTED: ui("Expected"), ABSENT: ui("Not travelling"), BOARDED: ui("On board"), HANDED_OVER: ui("Handed over"), REMOVED: ui("Removed by amendment"), TRANSFERRED: ui("Moved to another trip"), PUBLISHED: ui("Published"), DEPARTED: ui("Departed"), CLOSED: ui("Closed"), CLOSED_EMERGENCY: ui("Closed in an emergency") } as Record<string, string>)[s] ?? s;
const kindLabel = (ui: Ui, k: string) => ({ UNLISTED_PASSENGER: ui("Unlisted passenger"), CAPACITY_OVERFLOW: ui("Over capacity"), MISSING_CHILD: ui("Missing child"), MISSING_RECIPIENT: ui("No one to receive the student"), DOUBLE_BOARDING: ui("Already on another vehicle"), LATE_CHANGE: ui("Late change") } as Record<string, string>)[k] ?? k;
const receiverLabel = (ui: Ui, r: string) => ({ STAFF: ui("School staff"), GUARDIAN: ui("Guardian"), AUTHORIZED_ADULT: ui("Authorised adult") } as Record<string, string>)[r] ?? r;
const direction = (ui: Ui, d: string) => d === "AM" ? ui("Morning run") : ui("Afternoon run");

// ─── Offline queue (per device) ──────────────────────────────────────────

type Queued = { body: Record<string, unknown>; label: string };
const QUEUE = "sk-transport-queue";
const readQueue = (): Queued[] => { try { return JSON.parse(localStorage.getItem(QUEUE) || "[]"); } catch { return []; } };
const writeQueue = (q: Queued[]) => { try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch { /* storage unavailable */ } };

// ─── Trip view (crew and coordinator) ────────────────────────────────────

type Passenger = { id: string; studentId: string; name: string; stop: string | null; source: string; status: string; boardedAt: string | null; boardedBy: string | null; handedOverAt: string | null; receiverType: string | null; receiverName: string | null; note: string | null };
type TripData = {
  trip: { id: string; label: string; serviceDate: string; direction: string; routeTitle: string; vehicleNumber: string; vehicleCapacity: number; driverName: string | null; status: string; attendant: string; coordinator: string; vehicleCheckAt: string | null; vehicleCheckBy: string | null; closedAt: string | null; emergencyReason: string | null };
  lead: boolean;
  counts: { expected: number; boarded: number; handedOver: number; absent: number; onBoard: number; unresolved: number; openExceptions: number };
  passengers: Passenger[];
  exceptions: { id: string; kind: string; studentId: string | null; note: string; owner: string; status: string; resolution: string | null; createdAt: string }[];
  events: { id: string; kind: string; occurredAt: string; recordedAt: string; actor: string; studentId: string | null }[];
};

export function TripView({ tripId, onBack }: { tripId: string; onBack?: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<TripData | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [hand, setHand] = useState<Passenger | null>(null), [receivers, setReceivers] = useState<{ guardians: { id: string; name: string; relationship: string }[]; staff: { id: string; name: string }[] } | null>(null);
  const [handForm, setHandForm] = useState({ receiverType: "GUARDIAN", receiverUserId: "", receiverName: "", identityChecked: false });
  const [report, setReport] = useState<{ kind: string; studentId?: string; note: string } | null>(null), [absent, setAbsent] = useState<Passenger | null>(null), [absentReason, setAbsentReason] = useState("");
  const [check, setCheck] = useState({ empty: false, signature: "" }), [stop, setStop] = useState("");
  const [amendForm, setAmendForm] = useState<{ change: string; studentId: string; reason: string } | null>(null), [emergency, setEmergency] = useState(""), [resolve, setResolve] = useState<Record<string, { resolution: string; outcome: string; receiverName: string }>>({});
  const [students, setStudents] = useState<{ id: string; fullName: string }[]>([]), [q, setQ] = useState("");
  const load = useCallback(async () => { try { setData(await call(`/api/transport/trips?id=${tripId}`)); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Cannot verify the current manifest. Follow the school's documented fallback."); } }, [tripId]);
  useEffect(() => { setQueue(readQueue().filter(x => x.body.tripId === tripId)); void load(); }, [load, tripId]);
  const flush = useCallback(async () => {
    const all = readQueue(); let left = [...all], sent = 0;
    for (const item of all.filter(x => x.body.tripId === tripId)) {
      try { await call("/api/transport/trips", "POST", item.body); sent++; left = left.filter(x => x !== item && x.body.clientEventId !== item.body.clientEventId); }
      catch (e) { if ((e as { status?: number }).status) { left = left.filter(x => x.body.clientEventId !== item.body.clientEventId); toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } else break; }
    }
    writeQueue(left); setQueue(left.filter(x => x.body.tripId === tripId));
    if (sent) { toast.success(ui("{0} events from this device were confirmed by the server.", [String(sent)])); await load(); }
  }, [tripId, load, ui]);
  useEffect(() => { const on = () => void flush(); window.addEventListener("online", on); return () => window.removeEventListener("online", on); }, [flush]);
  /** Sends a crew event; on a lost connection it waits on this device with its original time. */
  const send = async (body: Record<string, unknown>, label: string, done: string) => {
    const full = { ...body, tripId, clientEventId: eventId(), occurredAt: new Date().toISOString() };
    setBusy(true);
    try { const r = await call("/api/transport/trips", "POST", full); toast.success(ui(r?.repeated ? "Already recorded." : done)); await load(); return true; }
    catch (e) {
      if ((e as { status?: number }).status === undefined) { const next = [...readQueue(), { body: full, label }]; writeQueue(next); setQueue(next.filter(x => x.body.tripId === tripId)); toast.warning(ui("No connection. Saved on this device only — not yet confirmed by the server.")); return true; }
      toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); await load(); return false;
    } finally { setBusy(false); }
  };
  const lead = async (body: Record<string, unknown>, done: string) => { setBusy(true); try { await call("/api/transport/trips", "POST", { ...body, tripId }); toast.success(ui(done)); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  useEffect(() => { if (!hand) return; setReceivers(null); call(`/api/transport/trips?id=${tripId}&receiversFor=${hand.studentId}`).then(setReceivers).catch(() => setReceivers({ guardians: [], staff: [] })); }, [hand, tripId]);
  useEffect(() => { if (!amendForm || amendForm.change !== "add" || q.trim().length < 2) { setStudents([]); return; } const t = setTimeout(() => call(`/api/transport/riders?q=${encodeURIComponent(q.trim())}`).then(setStudents).catch(() => setStudents([])), 250); return () => clearTimeout(t); }, [q, amendForm]);
  if (error && !data) return <section className="sk-panel space-y-2 p-4" data-trip-error><p className="text-sm">{ui(error)}</p>{onBack ? <Button variant="secondary" onClick={onBack}>{ui("Back")}</Button> : null}</section>;
  if (!data) return <p className="text-sm text-ink-muted" data-trip-loading>{ui("Loading the latest manifest; boarding actions are unavailable.")}</p>;
  const t = data.trip, open = t.status === "PUBLISHED" || t.status === "DEPARTED";
  const ordered = [...data.passengers].sort((a, b) => Number(["EXPECTED", "BOARDED"].includes(b.status)) - Number(["EXPECTED", "BOARDED"].includes(a.status)));
  const canClose = open && !data.counts.unresolved && !data.counts.openExceptions && !!t.vehicleCheckAt && !queue.length;
  const pendingFor = (studentId: string) => queue.filter(x => x.body.studentId === studentId).map(x => x.label);
  return <section className="min-w-0 space-y-4" data-trip={t.id} data-trip-status={t.status}>
    <header className="sk-panel sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 p-3" data-trip-header>
      <div className="min-w-0"><h2 className="text-lg font-bold"><bdi>{t.label}</bdi> · <bdi dir="ltr">{t.vehicleNumber}</bdi></h2><p className="text-xs text-ink-muted">{direction(ui, t.direction)} · <bdi>{t.serviceDate}</bdi> · {statusLabel(ui, t.status)} · {ui("Coordinator: {0}", [t.coordinator])}</p></div>
      {onBack ? <Button variant="secondary" onClick={onBack}>{ui("Back")}</Button> : null}
    </header>
    <p className="text-xs text-ink-muted">{ui("Record events only while the vehicle is safely stopped. This is a manifest, not live location.")}</p>
    {queue.length ? <div className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30" data-trip-pending={queue.length}><p className="font-bold">{ui("{0} events saved on this device only — not yet confirmed by the server.", [String(queue.length)])}</p><Button size="sm" className="mt-2" onClick={() => void flush()} data-trip-flush>{ui("Send now")}</Button></div> : null}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-trip-counts>
      <div className="sk-panel p-3"><p className="text-2xl font-bold" data-count="unresolved">{data.counts.unresolved}</p><p className="text-xs">{ui("Unresolved")}</p></div>
      <div className="sk-panel p-3"><p className="text-2xl font-bold" data-count="boarded">{data.counts.boarded}/{data.counts.expected}</p><p className="text-xs">{ui("{0} of {1} expected students boarded", [String(data.counts.boarded), String(data.counts.expected)])}</p></div>
      <div className="sk-panel p-3"><p className="text-2xl font-bold" data-count="handedOver">{data.counts.handedOver}</p><p className="text-xs">{ui("Handed over")}</p></div>
      <div className="sk-panel p-3"><p className="text-2xl font-bold" data-count="absent">{data.counts.absent}</p><p className="text-xs">{ui("Not travelling")}</p></div>
    </div>
    {data.exceptions.some(e => e.status === "OPEN") ? <div className="sk-panel space-y-2 border-amber-400 p-3" data-trip-exceptions>
      <h3 className="font-bold">{data.exceptions.filter(e => e.status === "OPEN").length === 1 ? ui("One exception needs attention") : ui("{0} exceptions need attention", [String(data.exceptions.filter(e => e.status === "OPEN").length)])}</h3>
      {data.exceptions.filter(e => e.status === "OPEN").map(e => <div key={e.id} className="rounded-xl border px-3 py-2 text-sm" data-trip-exception={e.kind}>
        <p className="font-bold">{kindLabel(ui, e.kind)}{e.studentId ? <> · <bdi>{data.passengers.find(p => p.studentId === e.studentId)?.name ?? ""}</bdi></> : null}</p>
        <p dir="auto">{e.note}</p><p className="text-xs text-ink-muted">{ui("Owner: {0}", [e.owner])} · <bdi>{dateTime(e.createdAt)}</bdi></p>
        {data.lead ? <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input value={resolve[e.id]?.resolution ?? ""} onChange={ev => setResolve({ ...resolve, [e.id]: { ...(resolve[e.id] ?? { outcome: "", receiverName: "" }), resolution: ev.target.value } })} placeholder={ui("How was this resolved?")} aria-label={ui("How was this resolved?")} dir="auto" data-exception-resolution />
          {e.studentId ? <Select value={resolve[e.id]?.outcome ?? ""} onChange={ev => setResolve({ ...resolve, [e.id]: { ...(resolve[e.id] ?? { resolution: "", receiverName: "" }), outcome: ev.target.value } })} aria-label={ui("Outcome for the student")} data-exception-outcome><option value="">{ui("No change to the student")}</option>{e.kind === "DOUBLE_BOARDING" ? <option value="RELEASE_OTHER_TRIP">{ui("Confirmed on this vehicle")}</option> : null}<option value="ABSENT">{ui("Not travelling")}</option><option value="HANDED_OVER_CONFIRMED">{ui("Handover confirmed")}</option></Select> : null}
          <Button size="sm" disabled={busy || !(resolve[e.id]?.resolution ?? "").trim()} onClick={() => void lead({ action: "resolve", id: e.id, ...resolve[e.id] }, "Exception resolved.")} data-exception-resolve>{ui("Resolve")}</Button>
          {resolve[e.id]?.outcome === "HANDED_OVER_CONFIRMED" ? <Input value={resolve[e.id]?.receiverName ?? ""} onChange={ev => setResolve({ ...resolve, [e.id]: { ...resolve[e.id], receiverName: ev.target.value } })} placeholder={ui("Who received the student?")} aria-label={ui("Who received the student?")} dir="auto" className="sm:col-span-3" /> : null}
        </div> : null}
      </div>)}
    </div> : null}
    <ul className="space-y-2" data-trip-manifest>{ordered.map(p => {
      const pending = pendingFor(p.studentId);
      return <li key={p.id} className={cn("sk-panel flex flex-wrap items-center justify-between gap-3 p-3", !["EXPECTED", "BOARDED"].includes(p.status) && "opacity-80")} data-passenger={p.studentId} data-passenger-status={p.status}>
        <div className="min-w-0"><p className="text-base font-bold"><bdi>{p.name}</bdi></p><p className="text-xs text-ink-muted">{p.stop ? <><bdi>{p.stop}</bdi> · </> : null}{statusLabel(ui, p.status)}{p.source === "AMENDMENT" ? <> · {ui("Added by amendment")}</> : null}{p.boardedAt ? <> · {ui("Boarded {0}", [dateTime(p.boardedAt)])}</> : null}{p.receiverName ? <> · {ui("To {0} ({1})", [p.receiverName, receiverLabel(ui, p.receiverType ?? "")])}</> : null}</p>{pending.length ? <p className="text-xs text-amber-700 dark:text-amber-300" data-passenger-pending>{ui("On this device only: {0}", [pending.map(x => ui(x)).join(", ")])}</p> : null}</div>
        {open ? <div className="flex flex-wrap gap-2">
          {p.status === "EXPECTED" ? <><Button size="lg" disabled={busy} onClick={() => void send({ action: "board", studentId: p.studentId }, "Boarding", "Boarding recorded.")} data-board>{ui("Mark boarded")}</Button><Button variant="outline" disabled={busy} onClick={() => { setAbsent(p); setAbsentReason(""); }} data-absent>{ui("Not travelling")}</Button><Button variant="secondary" disabled={busy} onClick={() => setReport({ kind: "MISSING_CHILD", studentId: p.studentId, note: "" })} data-missing>{ui("Report exception")}</Button></> : null}
          {p.status === "BOARDED" ? <><Button size="lg" disabled={busy} onClick={() => { setHand(p); setHandForm({ receiverType: t.direction === "AM" ? "STAFF" : "GUARDIAN", receiverUserId: "", receiverName: "", identityChecked: false }); }} data-handover>{ui("Hand over")}</Button><Button variant="secondary" disabled={busy} onClick={() => setReport({ kind: "MISSING_RECIPIENT", studentId: p.studentId, note: "" })} data-no-recipient>{ui("No one to receive")}</Button></> : null}
          {data.lead && ["EXPECTED", "ABSENT"].includes(p.status) ? <Button size="sm" variant="ghost" onClick={() => setAmendForm({ change: "remove", studentId: p.studentId, reason: "" })} data-amend-remove>{ui("Remove by amendment")}</Button> : null}
        </div> : null}
      </li>;
    })}</ul>
    {open ? <div className="sk-panel space-y-3 p-4" data-trip-actions>
      <div className="flex flex-wrap gap-2">{t.status === "PUBLISHED" ? <Button variant="outline" disabled={busy} onClick={() => void send({ action: "depart" }, "Departure", "Departure recorded.")} data-depart>{ui("Record departure")}</Button> : null}<Button variant="secondary" disabled={busy} onClick={() => setReport({ kind: "UNLISTED_PASSENGER", note: "" })} data-unlisted>{ui("Report unlisted passenger")}</Button>{data.lead ? <Button variant="outline" onClick={() => { setAmendForm({ change: "add", studentId: "", reason: "" }); setQ(""); }} data-amend-add>{ui("Add student by amendment")}</Button> : null}</div>
      <div className="flex flex-col gap-2 sm:flex-row"><Input value={stop} onChange={e => setStop(e.target.value)} placeholder={ui("Stop reached")} aria-label={ui("Stop reached")} dir="auto" data-stop-name /><Button variant="outline" disabled={busy || !stop.trim()} onClick={() => void send({ action: "stop", stop }, "Stop arrival", "Stop arrival recorded.").then(ok => ok && setStop(""))} data-stop>{ui("Record stop arrival")}</Button></div>
      <div className="space-y-2 rounded-xl border p-3" data-vehicle-check>
        <h3 className="font-bold">{ui("Empty-vehicle check")}</h3>
        {t.vehicleCheckAt ? <p className="text-sm" data-vehicle-check-done>{ui("Checked empty by {0} at {1}", [t.vehicleCheckBy ?? "", dateTime(t.vehicleCheckAt)])}</p> : <>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={check.empty} onChange={e => setCheck({ ...check, empty: e.target.checked })} data-check-empty /><span>{ui("I walked the whole vehicle, including every seat, and no student is on board.")}</span></label>
          <FormField name="vc-sign" label={ui("Sign with your full name")}><Input value={check.signature} onChange={e => setCheck({ ...check, signature: e.target.value })} dir="auto" data-check-signature /></FormField>
          <Button disabled={busy || !check.empty || !check.signature.trim()} onClick={() => void send({ action: "vehicle-check", empty: true, signature: check.signature }, "Vehicle check", "Vehicle check recorded.")} data-check-save>{ui("Record vehicle check")}</Button>
        </>}
      </div>
      <div className="space-y-1" data-trip-close>
        <Button size="lg" disabled={busy || !canClose} onClick={() => void lead({ action: "close" }, "Trip reconciled and vehicle check recorded.")} data-close>{ui("Close trip")}</Button>
        {!canClose ? <p className="text-xs text-ink-muted" data-close-blocked>{queue.length ? ui("Send the events saved on this device first.") : data.counts.unresolved ? ui("{0} students still need a handover or an absence.", [String(data.counts.unresolved)]) : data.counts.openExceptions ? ui("Resolve the open exceptions first.") : ui("Record the empty-vehicle check first.")}</p> : null}
      </div>
      {data.lead ? <div className="space-y-2 rounded-xl border border-red-300 p-3" data-emergency-close><h3 className="font-bold">{ui("Emergency closure")}</h3><p className="text-xs text-ink-muted">{ui("Only after escalation. Every unresolved student becomes an exception you own.")}</p><Input value={emergency} onChange={e => setEmergency(e.target.value)} placeholder={ui("Escalation and reason")} aria-label={ui("Escalation and reason")} dir="auto" data-emergency-reason /><Button variant="destructive" disabled={busy || !emergency.trim()} onClick={() => void lead({ action: "emergency-close", reason: emergency }, "Trip closed in an emergency. Exceptions remain open.")} data-emergency-submit>{ui("Close in an emergency")}</Button></div> : null}
    </div> : <div className="sk-panel p-4 text-sm" data-trip-closed>{t.status === "CLOSED" ? ui("Trip reconciled and vehicle check recorded.") : ui("Closed in an emergency: {0}", [t.emergencyReason ?? ""])}</div>}
    {data.lead && data.events.length ? <details className="sk-panel p-4 text-sm" data-trip-history><summary className="cursor-pointer font-bold">{ui("Event history")}</summary><ol className="mt-2 space-y-1">{data.events.map(e => <li key={e.id} data-trip-event={e.kind}><bdi>{dateTime(e.occurredAt)}</bdi> · {e.kind} · <bdi>{e.actor}</bdi>{e.studentId ? <> · <bdi>{data.passengers.find(p => p.studentId === e.studentId)?.name ?? ""}</bdi></> : null}{Math.abs(new Date(e.recordedAt).getTime() - new Date(e.occurredAt).getTime()) > 120_000 ? <> · {ui("received {0}", [dateTime(e.recordedAt)])}</> : null}</li>)}</ol></details> : null}
    {hand ? <ModalFrame title={ui("Hand over {0}", [hand.name])} onClose={() => setHand(null)}>
      <div className="space-y-3" data-handover-form>
        <p className="text-sm"><bdi>{hand.name}</bdi> · <bdi>{t.label}</bdi></p>
        <FormField name="ho-type" label={ui("Received by")}><Select value={handForm.receiverType} onChange={e => setHandForm({ ...handForm, receiverType: e.target.value, receiverUserId: "" })} data-handover-type><option value="GUARDIAN">{ui("Guardian")}</option><option value="STAFF">{ui("School staff")}</option><option value="AUTHORIZED_ADULT">{ui("Authorised adult")}</option></Select></FormField>
        {handForm.receiverType === "AUTHORIZED_ADULT" ? <FormField name="ho-name" label={ui("Their full name")}><Input value={handForm.receiverName} onChange={e => setHandForm({ ...handForm, receiverName: e.target.value })} dir="auto" data-handover-name /></FormField>
          : <FormField name="ho-who" label={handForm.receiverType === "STAFF" ? ui("Staff member") : ui("Guardian")}><Select value={handForm.receiverUserId} onChange={e => setHandForm({ ...handForm, receiverUserId: e.target.value })} data-handover-who><option value="">{receivers ? ui("Choose") : ui("Loading…")}</option>{(handForm.receiverType === "STAFF" ? receivers?.staff ?? [] : receivers?.guardians ?? []).map(r => <option key={r.id} value={r.id}>{r.name}{"relationship" in r ? ` · ${(r as { relationship: string }).relationship}` : ""}</option>)}</Select></FormField>}
        {handForm.receiverType !== "STAFF" ? <label className="flex items-start gap-2 text-sm"><Checkbox checked={handForm.identityChecked} onChange={e => setHandForm({ ...handForm, identityChecked: e.target.checked })} data-handover-identity /><span>{ui("I checked their identity in line with the school's procedure.")}</span></label> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setHand(null)}>{ui("Back")}</Button><Button disabled={busy || (handForm.receiverType === "AUTHORIZED_ADULT" ? !handForm.receiverName.trim() : !handForm.receiverUserId) || (handForm.receiverType !== "STAFF" && !handForm.identityChecked)} onClick={() => void send({ action: "handover", studentId: hand.studentId, ...handForm }, "Handover", "Handover recorded.").then(ok => ok && setHand(null))} data-handover-save>{ui("Confirm handover")}</Button></div>
      </div>
    </ModalFrame> : null}
    {absent ? <ModalFrame title={ui("{0} is not travelling", [absent.name])} onClose={() => setAbsent(null)}><div className="space-y-3" data-absent-form><FormField name="ab-reason" label={ui("Reason")}><Input value={absentReason} onChange={e => setAbsentReason(e.target.value)} dir="auto" data-absent-reason /></FormField><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAbsent(null)}>{ui("Back")}</Button><Button disabled={busy || !absentReason.trim()} onClick={() => void send({ action: "absent", studentId: absent.studentId, reason: absentReason }, "Not travelling", "Recorded as not travelling.").then(ok => ok && setAbsent(null))} data-absent-save>{ui("Save")}</Button></div></div></ModalFrame> : null}
    {report ? <ModalFrame title={kindLabel(ui, report.kind)} onClose={() => setReport(null)}><div className="space-y-3" data-report-form>{report.kind === "MISSING_CHILD" ? <Select value={report.kind} onChange={e => setReport({ ...report, kind: e.target.value })} aria-label={ui("What happened?")}><option value="MISSING_CHILD">{ui("Missing child")}</option></Select> : null}<FormField name="rp-note" label={ui("What happened?")}><Input value={report.note} onChange={e => setReport({ ...report, note: e.target.value })} dir="auto" data-report-note /></FormField><p className="text-xs text-ink-muted">{ui("The coordinator owns this exception until it is resolved.")}</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setReport(null)}>{ui("Back")}</Button><Button disabled={busy || !report.note.trim()} onClick={() => void send({ action: "exception", ...report }, "Exception", "Exception reported to the coordinator.").then(ok => ok && setReport(null))} data-report-save>{ui("Report exception")}</Button></div></div></ModalFrame> : null}
    {amendForm ? <ModalFrame title={amendForm.change === "add" ? ui("Add student by amendment") : ui("Remove by amendment")} onClose={() => setAmendForm(null)}><div className="space-y-3" data-amend-form>
      {amendForm.change === "add" ? <><FormField name="am-q" label={ui("Student")}><Input value={q} onChange={e => setQ(e.target.value)} placeholder={ui("Type at least two letters of a name or roll number")} data-amend-search /></FormField>{students.length ? <Select value={amendForm.studentId} onChange={e => setAmendForm({ ...amendForm, studentId: e.target.value })} aria-label={ui("Student")} data-amend-student><option value="">{ui("Choose")}</option>{students.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select> : null}</> : <p className="text-sm"><bdi>{data.passengers.find(p => p.studentId === amendForm.studentId)?.name}</bdi></p>}
      <FormField name="am-reason" label={ui("Reason")} hint={ui("The original manifest is kept; this change is recorded with your name.")}><Input value={amendForm.reason} onChange={e => setAmendForm({ ...amendForm, reason: e.target.value })} dir="auto" data-amend-reason /></FormField>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAmendForm(null)}>{ui("Back")}</Button><Button disabled={busy || !amendForm.studentId || !amendForm.reason.trim()} onClick={() => void lead({ action: "amend", ...amendForm }, "Amendment recorded.").then(ok => ok && setAmendForm(null))} data-amend-save>{ui("Record amendment")}</Button></div>
    </div></ModalFrame> : null}
  </section>;
}

// ─── Trip lists ──────────────────────────────────────────────────────────

type TripRow = { id: string; label: string; direction: string; vehicleNumber: string; status: string; expected: number; boarded: number; handedOver: number; unresolved: number; openExceptions: number };
function TripList({ rows, onOpen }: { rows: TripRow[]; onOpen: (id: string) => void }) {
  const ui = useUiText();
  return <ul className="space-y-2">{rows.map(r => <li key={r.id}><Button variant="outline" className="h-auto w-full flex-wrap justify-between gap-2 py-3 text-start" onClick={() => onOpen(r.id)} data-trip-row={r.label}>
    <span className="font-bold"><bdi>{r.label}</bdi> · <bdi dir="ltr">{r.vehicleNumber}</bdi></span>
    <span className="text-xs">{statusLabel(ui, r.status)} · {r.unresolved ? ui("{0} unresolved", [String(r.unresolved)]) : ui("All reconciled")} · {ui("{0} of {1} expected students boarded", [String(r.boarded), String(r.expected)])}{r.openExceptions ? <> · {ui("{0} exceptions", [String(r.openExceptions)])}</> : null}</span>
  </Button></li>)}</ul>;
}

/** Crew desk at /transport: today's trips assigned to this person (coordinators see the campus). */
export function TripDesk() {
  const ui = useUiText();
  const [data, setData] = useState<{ serviceDate: string; lead: boolean; trips: TripRow[] } | null>(null), [error, setError] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => call("/api/transport/trips").then(d => { setData(d); setError(null); }).catch(e => setError(e.message)), []);
  useEffect(() => { if (!open) void load(); }, [load, open]);
  if (open) return <TripView tripId={open} onBack={() => setOpen(null)} />;
  if (error) return <p className="sk-panel p-4 text-sm" data-trip-desk-error>{ui(error)}</p>;
  if (!data) return <p className="text-sm text-ink-muted">{ui("Loading the latest manifest; boarding actions are unavailable.")}</p>;
  return <section className="min-w-0 space-y-3" data-trip-desk>
    <header><h1 className="text-xl font-bold">{ui("Today's trips")}</h1><p className="text-sm text-ink-muted"><bdi>{data.serviceDate}</bdi></p></header>
    {data.trips.length ? <TripList rows={data.trips} onOpen={setOpen} /> : <p className="sk-panel p-4 text-sm" data-trip-empty>{ui("No trip assigned for today. Contact the transport coordinator.")}</p>}
  </section>;
}

// ─── Coordinator: riders, stops, trips ───────────────────────────────────

type RouteDetail = { id: string; title: string; active: boolean; seats: number; stops: { id: string; name: string; sequence: number; active: boolean }[]; vehicles: { id: string; number: string; capacity: number | null; active: boolean; driverName: string | null }[]; riders: { id: string; fullName: string; rollNo: string | null; className: string; stopId: string | null }[] };

export function RidersPlanner() {
  const ui = useUiText();
  const [routes, setRoutes] = useState<{ id: string; title: string }[]>([]), [vehicles, setVehicles] = useState<{ id: string; number: string; capacity: number | null; active: boolean }[]>([]);
  const [routeId, setRouteId] = useState(""), [detail, setDetail] = useState<RouteDetail | null>(null), [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]), [stop, setStop] = useState({ name: "", sequence: "1" }), [q, setQ] = useState(""), [found, setFound] = useState<{ id: string; fullName: string; transportRouteId: string | null; class?: { name: string; section: string | null } | null }[]>([]), [newStop, setNewStop] = useState("");
  const [cap, setCap] = useState<Record<string, string>>({});
  const loadLists = useCallback(async () => { const [r, v] = await Promise.all([call("/api/transport/routes"), call("/api/transport/vehicles")]); setRoutes(r); setVehicles(v); setCap(Object.fromEntries(v.map((x: { id: string; capacity: number | null }) => [x.id, x.capacity ? String(x.capacity) : ""]))); setRouteId(id => id || r[0]?.id || ""); }, []);
  const loadDetail = useCallback(async () => { if (!routeId) return; const d = await call(`/api/transport/riders?routeId=${routeId}`); setDetail(d); setPicked(d.vehicles.map((v: { id: string }) => v.id)); }, [routeId]);
  useEffect(() => { void loadLists().catch(() => undefined); }, [loadLists]);
  useEffect(() => { void loadDetail().catch(() => setDetail(null)); }, [loadDetail]);
  useEffect(() => { if (q.trim().length < 2) { setFound([]); return; } const t = setTimeout(() => call(`/api/transport/riders?q=${encodeURIComponent(q.trim())}`).then(setFound).catch(() => setFound([])), 250); return () => clearTimeout(t); }, [q]);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await loadLists(); await loadDetail(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } };
  if (!routes.length) return <p className="text-sm text-ink-muted" data-riders-empty>{ui("Add a route first.")}</p>;
  return <div className="min-w-0 space-y-4" data-riders-planner>
    <FormField name="rp-route" label={ui("Route")}><Select value={routeId} onChange={e => setRouteId(e.target.value)} data-riders-route>{routes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</Select></FormField>
    {detail ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3" data-route-summary><p className="text-sm font-bold"><bdi>{detail.title}</bdi> · {detail.active ? ui("Active") : ui("Inactive")} · {ui("{0} of {1} seats", [String(detail.riders.length), String(detail.seats)])}</p><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => call("/api/transport/routes", "PATCH", { id: detail.id, active: !detail.active }), detail.active ? "Route deactivated." : "Route activated.")} data-route-active>{detail.active ? ui("Deactivate route") : ui("Activate route")}</Button></div>
      <div className="space-y-2 rounded-xl border p-3" data-route-vehicles>
        <h3 className="text-sm font-bold">{ui("Vehicles on this route")}</h3>
        {vehicles.map(v => <div key={v.id} className="flex flex-wrap items-center gap-2 text-sm"><label className="flex items-center gap-2"><Checkbox checked={picked.includes(v.id)} onChange={e => setPicked(e.target.checked ? [...picked, v.id] : picked.filter(x => x !== v.id))} data-route-vehicle={v.number} /><bdi dir="ltr">{v.number}</bdi></label><Input className="w-24" type="number" min={1} max={200} value={cap[v.id] ?? ""} onChange={e => setCap({ ...cap, [v.id]: e.target.value })} aria-label={ui("Capacity of {0}", [v.number])} dir="ltr" data-vehicle-capacity={v.number} /><Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => call("/api/transport/vehicles", "PATCH", { id: v.id, capacity: cap[v.id] === "" ? undefined : Number(cap[v.id]) }), "Vehicle updated.")} data-vehicle-save={v.number}>{ui("Save capacity")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => call("/api/transport/vehicles", "PATCH", { id: v.id, active: !v.active }), "Vehicle updated.")}>{v.active ? ui("Deactivate") : ui("Activate")}</Button></div>)}
        <Button size="sm" disabled={busy} onClick={() => void run(() => call("/api/transport/riders", "POST", { action: "vehicles", routeId: detail.id, vehicleIds: picked }), "Vehicles saved.")} data-route-vehicles-save>{ui("Save vehicles")}</Button>
      </div>
      <div className="space-y-2 rounded-xl border p-3" data-route-stops>
        <h3 className="text-sm font-bold">{ui("Stops")}</h3>
        {detail.stops.length ? <ol className="space-y-1 text-sm">{detail.stops.map(s => <li key={s.id} data-route-stop={s.name}>{s.sequence}. <bdi>{s.name}</bdi>{s.active ? "" : ` · ${ui("Inactive")}`}</li>)}</ol> : <p className="text-sm text-ink-muted">{ui("No stops yet.")}</p>}
        <div className="flex flex-col gap-2 sm:flex-row"><Input value={stop.name} onChange={e => setStop({ ...stop, name: e.target.value })} placeholder={ui("Stop name")} aria-label={ui("Stop name")} dir="auto" data-stop-input /><Input className="sm:w-24" type="number" min={0} value={stop.sequence} onChange={e => setStop({ ...stop, sequence: e.target.value })} aria-label={ui("Order")} dir="ltr" /><Button size="sm" disabled={busy || !stop.name.trim()} onClick={() => void run(async () => { await call("/api/transport/riders", "POST", { action: "stop", routeId: detail.id, name: stop.name, sequence: Number(stop.sequence) }); setStop({ name: "", sequence: String(Number(stop.sequence) + 1) }); }, "Stop saved.")} data-stop-add>{ui("Add stop")}</Button></div>
      </div>
      <div className="space-y-2 rounded-xl border p-3" data-route-riders>
        <h3 className="text-sm font-bold">{ui("Riders")}</h3>
        {detail.riders.length ? <ul className="space-y-1">{detail.riders.map(r => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-route-rider={r.id}><span><bdi>{r.fullName}</bdi>{r.className ? <> · <bdi>{r.className}</bdi></> : null}</span><span className="flex gap-2"><Select className="w-auto" value={r.stopId ?? ""} onChange={e => void run(() => call("/api/transport/riders", "POST", { action: "assign", routeId: detail.id, studentId: r.id, stopId: e.target.value || undefined }), "Stop saved.")} aria-label={ui("Stop for {0}", [r.fullName])}><option value="">{ui("No stop")}</option>{detail.stops.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select><Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => call("/api/transport/riders", "POST", { action: "unassign", studentId: r.id }), "Rider removed from future trips. Published trips keep their manifest.")} data-rider-remove>{ui("Remove")}</Button></span></li>)}</ul> : <p className="text-sm text-ink-muted">{ui("No riders yet.")}</p>}
        <FormField name="rp-find" label={ui("Add rider")}><Input value={q} onChange={e => setQ(e.target.value)} placeholder={ui("Type at least two letters of a name or roll number")} data-rider-search /></FormField>
        {found.length ? <div className="flex flex-col gap-2 sm:flex-row"><Select value={newStop} onChange={e => setNewStop(e.target.value)} aria-label={ui("Stop")} className="sm:w-48"><option value="">{ui("No stop")}</option>{detail.stops.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select><ul className="flex-1 space-y-1">{found.map(s => <li key={s.id}><Button variant="ghost" className="w-full justify-start" disabled={busy} onClick={() => void run(async () => { await call("/api/transport/riders", "POST", { action: "assign", routeId: detail.id, studentId: s.id, stopId: newStop || undefined }); setQ(""); }, "Rider assigned.")} data-rider-pick={s.id}><bdi>{s.fullName}</bdi>{s.transportRouteId && s.transportRouteId !== detail.id ? <span className="text-ink-muted"> · {ui("moves from another route")}</span> : null}</Button></li>)}</ul></div> : null}
      </div>
    </> : null}
  </div>;
}

export function TripsPlanner() {
  const ui = useUiText();
  const [date, setDate] = useState(todayLocal()), [data, setData] = useState<{ trips: TripRow[] } | null>(null), [open, setOpen] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [routes, setRoutes] = useState<{ id: string; title: string; vehicles: { vehicle: { id: string; number: string; active: boolean } }[] }[]>([]), [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]);
  const [form, setForm] = useState({ routeId: "", vehicleId: "", direction: "PM", attendantId: "", label: "" });
  const load = useCallback(() => call(`/api/transport/trips?date=${date}`).then(setData).catch(() => setData({ trips: [] })), [date]);
  useEffect(() => { if (!open) void load(); }, [load, open]);
  useEffect(() => { call("/api/transport/routes").then(setRoutes).catch(() => setRoutes([])); call("/api/transport/trips?view=staff").then(setStaff).catch(() => setStaff([])); }, []);
  const route = useMemo(() => routes.find(r => r.id === form.routeId), [routes, form.routeId]);
  if (open) return <TripView tripId={open} onBack={() => setOpen(null)} />;
  const publish = async () => { setBusy(true); try { const r = await call("/api/transport/trips", "POST", { action: "publish", serviceDate: date, ...form }); toast.success(ui(r.exceptions ? "Trip published with an exception to resolve." : "Trip published. Its manifest is now fixed; later changes are amendments.")); await load(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } };
  return <div className="min-w-0 space-y-4" data-trips-planner>
    <FormField name="tp-date" label={ui("Day")}><Input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr" data-trips-date /></FormField>
    <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2" data-trip-publish>
      <FormField name="tp-route" label={ui("Route")}><Select value={form.routeId} onChange={e => setForm({ ...form, routeId: e.target.value, vehicleId: "" })} data-publish-route><option value="">{ui("Choose")}</option>{routes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</Select></FormField>
      <FormField name="tp-vehicle" label={ui("Vehicle")}><Select value={form.vehicleId} onChange={e => setForm({ ...form, vehicleId: e.target.value })} data-publish-vehicle><option value="">{ui("Choose")}</option>{(route?.vehicles ?? []).filter(v => v.vehicle.active).map(v => <option key={v.vehicle.id} value={v.vehicle.id}>{v.vehicle.number}</option>)}</Select></FormField>
      <FormField name="tp-dir" label={ui("Run")}><Select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })} data-publish-direction><option value="AM">{ui("Morning run")}</option><option value="PM">{ui("Afternoon run")}</option></Select></FormField>
      <FormField name="tp-att" label={ui("Attendant")}><Select value={form.attendantId} onChange={e => setForm({ ...form, attendantId: e.target.value })} data-publish-attendant><option value="">{ui("Choose")}</option>{staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></FormField>
      <FormField name="tp-label" label={ui("Trip label (optional)")}><Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="North · PM-12" dir="auto" data-publish-label /></FormField>
      <div className="flex items-end justify-end"><Button disabled={busy || !form.routeId || !form.vehicleId || !form.attendantId} onClick={() => void publish()} data-publish>{ui("Publish trip")}</Button></div>
    </div>
    {data?.trips.length ? <TripList rows={data.trips} onOpen={setOpen} /> : <p className="text-sm text-ink-muted">{ui("No trips for this day.")}</p>}
  </div>;
}

// ─── Family ──────────────────────────────────────────────────────────────

/** Today's journey for one child. Renders nothing when the child has no trip today. */
export function FamilyJourney({ studentId }: { studentId: string }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<{ journeys: { id: string; label: string; direction: string; vehicleNumber: string; stop: string | null; status: string; boardedAt: string | null; handedOverAt: string | null; receiverType: string | null }[] } | null>(null);
  useEffect(() => { call(`/api/family/transport?studentId=${encodeURIComponent(studentId)}`).then(setData).catch(() => setData(null)); }, [studentId]);
  if (!data?.journeys.length) return null;
  return <section className="sk-panel space-y-2 p-4 sm:p-5" data-family-journey>
    <h3 className="text-base font-bold">{ui("School transport today")}</h3>
    <p className="text-xs text-ink-muted">{ui("Recorded by the school's bus attendant. This is not live location.")}</p>
    <ul className="space-y-2">{data.journeys.map(j => <li key={j.id} className="rounded-xl border px-3 py-2 text-sm" data-family-journey-row={j.status}><p className="font-bold">{direction(ui, j.direction)} · <bdi>{j.label}</bdi> · <bdi dir="ltr">{j.vehicleNumber}</bdi></p><p>{statusLabel(ui, j.status)}{j.boardedAt ? <> · {ui("Boarded {0}", [dateTime(j.boardedAt)])}</> : null}{j.handedOverAt ? <> · {ui("Handed over {0} to {1}", [dateTime(j.handedOverAt), receiverLabel(ui, j.receiverType ?? "")])}</> : null}</p></li>)}</ul>
  </section>;
}
