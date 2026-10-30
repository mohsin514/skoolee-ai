"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { DeskPill, DeskRowIcon, DeskSection, deskRow, type DeskTone } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { Clock, CloudOff, GitCompare, RefreshCw, TriangleAlert, User, Wifi } from "lucide-react";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { deviceId, load, pending, save, type Op, type OpState, type Snapshot } from "@/lib/offline/store";

// SKO-448: offline class register. Marks are saved on this device first and labelled as such until the server
// accepts them — never shown as recorded before that. Sync revalidates the session and each change; a newer
// server entry is shown beside yours for a decision. Only attendance marking works offline.

type Ui = ReturnType<typeof useUiText>;
const STATUSES = ["PRESENT", "ABSENT", "LATE", "LEAVE"] as const;
const statusLabel = (ui: Ui, s: string | null | undefined) => s ? ({ PRESENT: ui("Present"), ABSENT: ui("Absent"), LATE: ui("Late"), LEAVE: ui("Leave"), EXCUSED: ui("Excused"), PARTIAL: ui("Part day") } as Record<string, string>)[s] ?? s : ui("Not marked");
const stateLabel = (ui: Ui, s: OpState) => ({ LOCAL: ui("Saved on this device · not yet synced"), SYNCING: ui("Syncing…"), ACCEPTED: ui("Accepted by the server"), CONFLICT: ui("A newer entry needs your review"), REJECTED_ACCESS: ui("Your access changed; queued work needs an authorised reviewer"), EXPIRED: ui("Too old to sync"), INVALID: ui("Not a supported offline change"), RESOLVED_SERVER: ui("Kept the server value"), RESOLVED_LOCAL: ui("Your value applied"), CORRECTION_REQUESTED: ui("Correction requested") } as Record<string, string>)[s] ?? s;
// Row colour follows where the mark is: waiting on this device, in conflict, or confirmed by the server.
const STATE_TONES: Partial<Record<OpState, DeskTone>> = { LOCAL: "info", SYNCING: "info", CONFLICT: "warning", ACCEPTED: "success", RESOLVED_LOCAL: "success", RESOLVED_SERVER: "neutral", REJECTED_ACCESS: "danger", EXPIRED: "danger", INVALID: "danger" };
const todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };

export function OfflineRegister({ classes }: { classes: { id: string; label: string }[] }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [me, setMe] = useState<{ id: string; schoolId: string } | null>(null), [online, setOnline] = useState(true);
  const [bucket, setBucket] = useState<ReturnType<typeof load> | null>(null), [classId, setClassId] = useState(classes[0]?.id ?? ""), [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false), [late, setLate] = useState<{ studentId: string; time: string } | null>(null), [resolving, setResolving] = useState<Op | null>(null), [authLost, setAuthLost] = useState(false);
  const caps = { offline: [ui("Mark attendance for a class you prepared on this device")], online: [ui("Submit the register"), ui("Corrections to a submitted register"), ui("Review family explanations"), ui("Grades and report cards"), ui("Fees and payments"), ui("Pickup"), ui("Assignments")] };
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(r => r.json()).then(j => { if (j.user) { setMe({ id: j.user.id, schoolId: j.user.schoolId }); setBucket(load(j.user.id, j.user.schoolId)); } }).catch(() => undefined);
    const on = () => setOnline(navigator.onLine); on();
    window.addEventListener("online", on); window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);
  const persist = useCallback((next: ReturnType<typeof load>) => { if (!me) return; save(me.id, me.schoolId, next); setBucket({ ...next }); }, [me]);
  const key = `${classId}:${date}`;
  const snap: Snapshot | undefined = bucket?.snapshots[key];
  const prepare = async () => {
    if (!me || !bucket) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/offline?view=prepare&classId=${encodeURIComponent(classId)}&date=${date}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Cannot verify the current register.");
      persist({ ...bucket, snapshots: { ...bucket.snapshots, [key]: j.data } });
      toast.success(ui("Register ready on this device until {0}.", [dateTime(j.data.expiresAt)]));
    } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); }
  };
  const mark = (studentId: string, status: string, arrivalTime?: string) => {
    if (!bucket || !snap) return;
    const entry = snap.entries.find(e => e.studentId === studentId)!;
    const ops = bucket.ops.filter(o => !(o.state === "LOCAL" && o.classId === classId && o.date === date && o.studentId === studentId));
    const prior = bucket.ops.find(o => o.state === "LOCAL" && o.classId === classId && o.date === date && o.studentId === studentId);
    ops.push({ operationId: prior?.operationId ?? crypto.randomUUID(), kind: "ATTENDANCE_MARK", classId, date, studentId, capturedAt: new Date().toISOString(), base: { status: entry.status, version: entry.version }, payload: { status, arrivalTime: arrivalTime ?? null }, state: "LOCAL" });
    persist({ ...bucket, ops });
  };
  const sync = useCallback(async () => {
    if (!me || !bucket) return;
    const queue = bucket.ops.filter(o => o.state === "LOCAL");
    if (!queue.length) return;
    setBusy(true);
    persist({ ...bucket, ops: bucket.ops.map(o => o.state === "LOCAL" ? { ...o, state: "SYNCING" as OpState } : o) });
    try {
      const r = await fetch("/api/offline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync", deviceId: deviceId(), operations: queue.map(({ state: _s, message: _m, server: _v, confirmedAt: _c, ...op }) => op) }) });
      if (r.status === 401 || r.status === 403) { setAuthLost(true); persist({ ...bucket, ops: bucket.ops.map(o => o.state === "SYNCING" || o.state === "LOCAL" ? { ...o, state: "LOCAL" as OpState } : o) }); return; }
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Sync failed");
      const outcomes = new Map<string, { status: OpState; message?: string; server?: Op["server"] }>(j.data.outcomes.map((o: { operationId: string; status: OpState; message?: string; server?: Op["server"] }) => [o.operationId, o]));
      const confirmedAt = new Date().toISOString();
      const ops = bucket.ops.map(o => { const res = outcomes.get(o.operationId); return res ? { ...o, state: res.status, message: res.message ?? null, server: res.server ?? null, confirmedAt } : o.state === "SYNCING" ? { ...o, state: "LOCAL" as OpState } : o; });
      // Accepted marks become the device's new base so a later change is checked against them.
      const snapshots = { ...bucket.snapshots };
      for (const o of ops) if (o.state === "ACCEPTED" && o.server && snapshots[`${o.classId}:${o.date}`]) { const s = snapshots[`${o.classId}:${o.date}`]; s.entries = s.entries.map(e => e.studentId === o.studentId ? { ...e, status: o.server!.status ?? e.status, version: o.server!.version ?? e.version } : e); }
      persist({ ...bucket, ops, snapshots, lastConfirmedAt: confirmedAt });
      setAuthLost(false);
      const conflicts = ops.filter(o => o.state === "CONFLICT").length;
      toast[conflicts ? "warning" : "success"](conflicts ? ui("One change conflicts with a newer office entry. Review it before completion.") : ui("All permitted changes accepted by the server."));
    } catch {
      persist({ ...bucket, ops: bucket.ops.map(o => o.state === "SYNCING" ? { ...o, state: "LOCAL" as OpState } : o) });
      toast.warning(ui("No connection. Your changes stay on this device until the server accepts them."));
    } finally { setBusy(false); }
  }, [me, bucket, persist, ui]);
  useEffect(() => { if (online && bucket && bucket.ops.some(o => o.state === "LOCAL")) void sync(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (decision: string) => {
    if (!resolving || !bucket) return;
    setBusy(true);
    try {
      const r = await fetch("/api/offline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve", operationId: resolving.operationId, decision }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "The change was not saved.");
      persist({ ...bucket, ops: bucket.ops.map(o => o.operationId === resolving.operationId ? { ...o, state: j.data.status } : o) });
      setResolving(null);
      toast.success(ui("Decision recorded. Both observations stay in the history."));
    } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); }
  };
  const opsHere = useMemo(() => new Map((bucket?.ops ?? []).filter(o => o.classId === classId && o.date === date).map(o => [o.studentId, o])), [bucket, classId, date]);
  if (!me || !bucket) return <SkeletonList rows={4} label={ui("Loading the latest register…")} />;
  const count = pending(bucket), conflicts = bucket.ops.filter(o => o.state === "CONFLICT");
  return <section className="min-w-0 space-y-4" data-offline-register>
    <div className={cn("sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3", online ? "border-status-success-border bg-status-success-surface" : "border-status-warning-border bg-status-warning-surface")} data-offline-status={online ? "online" : "offline"}>
      <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm font-semibold text-ink-strong">{online ? <Wifi className="size-4 shrink-0 text-status-success-text" aria-hidden="true" /> : <CloudOff className="size-4 shrink-0 text-status-warning-text" aria-hidden="true" />}{online ? ui("Connected") : ui("Offline")} · <span data-offline-pending={count}>{ui("Saved on this device · not yet synced: {0}", [String(count)])}</span></p>
      <p className="text-xs">{bucket.lastConfirmedAt ? ui("Last server confirmation {0}", [dateTime(bucket.lastConfirmedAt)]) : ui("No server confirmation yet")}</p>
      <Button size="sm" loading={busy} disabled={busy || !online || !count} onClick={() => void sync()} data-offline-sync><RefreshCw aria-hidden="true" />{ui("Sync now")}</Button>
    </div>
    {authLost ? <Alert tone="danger" data-offline-auth>{ui("Your access changed. Sign in again to sync; your changes stay on this device for your account only.")}</Alert> : null}
    <div className="grid gap-2 sm:grid-cols-2" data-offline-capabilities>
      <div className="sk-panel p-3 text-sm"><p className="font-semibold text-ink-strong">{ui("Works without a connection")}</p><ul className="list-disc ps-5">{caps.offline.map(c => <li key={c}>{c}</li>)}</ul><p className="mt-1 text-xs text-ink-muted">{ui("Open this page and prepare the register before you lose connection.")}</p></div>
      <div className="sk-panel p-3 text-sm"><p className="font-semibold text-ink-strong">{ui("Needs a connection")}</p><ul className="list-disc ps-5">{caps.online.map(c => <li key={c}>{c}</li>)}</ul></div>
    </div>
    <div className="grid gap-2 sm:grid-cols-3">
      <FormField name="off-class" label={ui("Class")}><Select value={classId} onChange={e => setClassId(e.target.value)} data-offline-class>{classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></FormField>
      <FormField name="off-date" label={ui("Date")}><Input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr" data-offline-date /></FormField>
      <div className="flex items-end"><Button variant="outline" disabled={busy || !online || !classId} onClick={() => void prepare()} data-offline-prepare>{snap ? ui("Refresh for offline use") : ui("Prepare for offline use")}</Button></div>
    </div>
    {conflicts.length ? <DeskSection tone="warning" icon={TriangleAlert} title={ui("A newer office entry needs your review")} className="space-y-2" data-offline-conflicts>{conflicts.map(o => <Button key={o.operationId} variant="outline" className="w-full justify-start" onClick={() => setResolving(o)} data-offline-conflict={o.studentId}><bdi>{bucket.snapshots[`${o.classId}:${o.date}`]?.entries.find(e => e.studentId === o.studentId)?.name ?? o.studentId}</bdi> · <bdi>{o.date}</bdi></Button>)}</DeskSection> : null}
    {snap ? <div className="space-y-2" data-offline-roster>
      <p className="text-xs text-ink-muted"><bdi>{snap.class.name}</bdi> · <bdi>{snap.date}</bdi> · {ui("Prepared {0}, available until {1}", [dateTime(snap.preparedAt), dateTime(snap.expiresAt)])}{snap.registerStatus === "SUBMITTED" ? <> · {ui("This register is submitted; changes are corrections and need a connection.")}</> : null}</p>
      <ul className="space-y-2">{snap.entries.map(e => { const op = opsHere.get(e.studentId); const shown = op && ["LOCAL", "SYNCING", "CONFLICT"].includes(op.state) ? op.payload.status : e.status; const tone = op ? STATE_TONES[op.state] ?? "neutral" : "neutral"; return <li key={e.studentId} data-tone={tone} className={cn(deskRow, "flex flex-wrap items-center justify-between gap-3")} data-offline-row={e.studentId} data-offline-state={op?.state ?? "SERVER"}>
        <div className="flex min-w-0 flex-1 items-start gap-3"><DeskRowIcon icon={User} /><div className="min-w-0 space-y-1"><p className="font-semibold text-ink-strong"><bdi>{e.name}</bdi> <span className="text-xs text-ink-muted">· <bdi dir="ltr">{e.rollNo}</bdi></span></p><p className="flex flex-wrap items-center gap-1.5 text-xs"><span>{statusLabel(ui, shown)}{op?.payload.arrivalTime && ["LOCAL", "SYNCING", "CONFLICT"].includes(op.state) ? <> · <bdi dir="ltr">{op.payload.arrivalTime}</bdi></> : null}</span><DeskPill tone={tone}>{op ? stateLabel(ui, op.state) : ui("Recorded on the server")}</DeskPill></p></div></div>
        <div className="flex flex-wrap gap-1">{STATUSES.map(s => <Button key={s} size="sm" variant={shown === s ? "default" : "outline"} disabled={snap.registerStatus === "SUBMITTED"} onClick={() => s === "LATE" ? setLate({ studentId: e.studentId, time: "" }) : mark(e.studentId, s)} data-offline-mark={s}>{statusLabel(ui, s)}</Button>)}</div>
      </li>; })}</ul>
    </div> : <div data-offline-empty><EmptyState size="sm" icon={CloudOff} title={bucket.ops.length ? ui("Prepare this class to see its register on this device.") : ui("No pending offline changes on this device.")} description={ui("Open this page and prepare the register before you lose connection.")} /></div>}
    {late ? <ModalFrame title={ui("Late arrival")} icon={Clock} tone="amber" size="sm" onClose={() => setLate(null)} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setLate(null)}>{ui("Back")}</Button><Button disabled={!late.time} onClick={() => { mark(late.studentId, "LATE", late.time); setLate(null); }} data-offline-late-save>{ui("Save on this device")}</Button></div>}><div className="space-y-3"><FormField name="off-late" label={ui("Arrival time")}><Input type="time" value={late.time} onChange={e => setLate({ ...late, time: e.target.value })} dir="ltr" data-offline-late-time /></FormField></div></ModalFrame> : null}
    {resolving ? <ModalFrame title={ui("Sync conflict review")} icon={GitCompare} tone="amber" subtitle={ui("Both observations remain in the history. Nothing is overwritten without your decision.")} onClose={() => setResolving(null)} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => void decide("REQUEST_CORRECTION")} data-offline-correction>{ui("Request correction")}</Button><Button variant="outline" disabled={busy} onClick={() => void decide("APPLY_LOCAL")} data-offline-apply>{ui("Apply mine")}</Button><Button disabled={busy} onClick={() => void decide("KEEP_SERVER")} data-offline-keep>{ui("Keep reviewed server value")}</Button></div>}><div className="space-y-3" data-offline-resolve>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-status-info-border bg-status-info-surface p-3 text-sm" data-offline-local><p className="font-semibold text-ink-strong">{ui("Yours (this device)")}</p><p>{statusLabel(ui, resolving.payload.status)}{resolving.payload.arrivalTime ? <> · <bdi dir="ltr">{resolving.payload.arrivalTime}</bdi></> : null}</p><p className="text-xs text-ink-muted">{ui("Captured {0}", [dateTime(resolving.capturedAt)])}</p></div>
        <div className="rounded-xl border border-edge bg-surface-subtle p-3 text-sm" data-offline-server><p className="font-semibold text-ink-strong">{ui("On the server")}</p><p>{statusLabel(ui, resolving.server?.status)}{resolving.server?.arrivalTime ? <> · <bdi dir="ltr">{resolving.server.arrivalTime}</bdi></> : null}</p><p className="text-xs text-ink-muted">{resolving.server?.markedBy ? ui("Recorded by {0}", [resolving.server.markedBy]) : null}{resolving.server?.markedAt ? <> · <bdi>{dateTime(resolving.server.markedAt)}</bdi></> : null}</p></div>
      </div>
    </div></ModalFrame> : null}
  </section>;
}
