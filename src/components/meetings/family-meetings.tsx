"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

// SKO-420: a guardian books a meeting with one of the child's teachers. Every time is shown in the school's
// timezone (named), with the guardian's own clock alongside when it differs. Nothing is booked until the
// server confirms; a slot someone else took is reported as such and the list refreshes.

type Slot = { startsAt: string; endsAt: string; start: string; end: string };
type Window = { id: string; teacherId: string; localDate: string; mode: string; location: string | null; slotMinutes: number; cancellationPolicy: string; slots: Slot[] };
type Booking = { id: string; status: string; conflictReason: string | null; version: number; teacherId: string; teacherName: string; startsAt: string; endsAt: string; local: { date: string; time: string; end: string }; mode: string; location: string | null; cancellationPolicy: string; agenda: string | null; accessNeeds: string | null; mine: boolean; lastChange: { version: number; action: string; at: string } | null; followUp: { summary: string; sharedAt: string } | null; actions: { id: string; text: string; ownerRole: string; dueDate: string; status: string; completedAt: string | null }[] };
type Data = { timezone: string; child: { id: string; name: string }; teachers: { id: string; name: string; classTeacher: boolean; subjects: string[] }[]; windows: Window[]; bookings: Booking[] };

async function call(url: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}
const key = () => `meet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const LIVE = ["CONFIRMED", "RESCHEDULE_NEEDED"];

export function FamilyMeetings({ studentId }: { studentId: string }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [teacherId, setTeacherId] = useState(""), [picked, setPicked] = useState<{ window: Window; slot: Slot } | null>(null);
  const [mode, setMode] = useState(""), [agenda, setAgenda] = useState(""), [accessNeeds, setAccessNeeds] = useState(""), [requestKey, setRequestKey] = useState(key);
  const [moving, setMoving] = useState<Booking | null>(null), [cancelling, setCancelling] = useState<Booking | null>(null);
  const viewerZone = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } }, []);
  const load = useCallback(async () => {
    setError("");
    try { const next = await call(`/api/family/meetings?studentId=${encodeURIComponent(studentId)}`, "GET") as Data; setData(next); setTeacherId(t => t && next.teachers.some(x => x.id === t) ? t : next.teachers[0]?.id ?? ""); }
    catch (e) { setError(ui(e instanceof Error ? e.message : "Meetings could not be loaded.")); }
  }, [studentId, ui]);
  useEffect(() => { void load(); }, [load]);
  const theirClock = (iso: string) => !data || !viewerZone || viewerZone === data.timezone ? null : new Intl.DateTimeFormat(undefined, { timeZone: viewerZone, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const run = async (work: () => Promise<unknown>, done?: string) => { setBusy(true); try { await work(); if (done) toast.success(ui(done)); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); await load(); } finally { setBusy(false); } };
  const teacherName = (id: string) => data?.teachers.find(t => t.id === id)?.name ?? "";

  const confirm = () => run(async () => {
    if (!picked) return;
    if (moving) await call("/api/family/meetings", "POST", { action: "reschedule", bookingId: moving.id, knownVersion: moving.version, windowId: picked.window.id, startsAt: picked.slot.startsAt, mode: mode || undefined });
    else await call("/api/family/meetings", "POST", { action: "book", studentId, windowId: picked.window.id, startsAt: picked.slot.startsAt, mode: mode || undefined, agenda, accessNeeds, requestKey });
    setPicked(null); setMoving(null); setAgenda(""); setAccessNeeds(""); setRequestKey(key()); await load();
  }, moving ? "Meeting moved. The teacher has been told." : "Meeting confirmed. The date, time and location are saved.");
  const cancel = () => run(async () => { if (!cancelling) return; await call("/api/family/meetings", "POST", { action: "cancel", bookingId: cancelling.id, knownVersion: cancelling.version }); setCancelling(null); await load(); }, "Meeting cancelled. The teacher has been told.");
  const done = (actionId: string) => run(async () => { await call("/api/family/meetings", "POST", { action: "action-done", actionId }); await load(); }, "Marked as done.");

  if (error) return <section className="sk-panel" data-family-meetings><ErrorState title={ui("Couldn't load meeting times")} description={error} onRetry={() => void load()} retryLabel={ui("Try again")} /></section>;
  if (!data) return <section className="sk-panel p-5" data-family-meetings aria-busy="true"><SkeletonList rows={3} label={ui("Refreshing available times…")} /></section>;
  const activeTeacher = moving?.teacherId ?? teacherId;
  const windows = data.windows.filter(w => w.teacherId === activeTeacher);
  const upcoming = data.bookings.filter(b => LIVE.includes(b.status)), past = data.bookings.filter(b => !LIVE.includes(b.status));
  const slotLabel = (w: { localDate: string }, s: { start: string; end: string }) => ui("{0}, {1}–{2} in the school's timezone", [date(w.localDate), s.start, s.end]);

  return <section className="sk-panel space-y-4 p-5" data-family-meetings>
    <header><h3 className="text-base font-bold text-ink-strong">{ui("Meet a teacher")}</h3><p className="text-xs text-ink-muted">{ui("Times are in the school's timezone: {0}.", [data.timezone])}{viewerZone && viewerZone !== data.timezone ? <> {ui("Your device uses {0}; its time is shown in brackets.", [viewerZone])}</> : null}</p></header>

    {upcoming.length ? <div className="space-y-2" data-meetings-upcoming>
      <p className="sk-eyebrow">{ui("Booked meetings")}</p>
      {upcoming.map(b => <div key={b.id} className={cn("rounded-xl border p-3", b.status === "RESCHEDULE_NEEDED" ? "border-status-warning-border bg-status-warning-surface" : "border-border-subtle bg-card")} data-meeting={b.id} data-meeting-status={b.status}>
        <p className="text-sm font-semibold text-ink-strong"><bdi>{b.teacherName}</bdi> · <bdi>{slotLabel({ localDate: b.local.date }, { start: b.local.time, end: b.local.end })}</bdi>{theirClock(b.startsAt) ? <span className="text-xs font-normal text-ink-muted"> (<bdi>{theirClock(b.startsAt)}</bdi>)</span> : null}</p>
        <p className="text-xs text-ink-muted">{b.mode === "REMOTE" ? ui("Remote meeting") : <>{ui("In person")}{b.location ? <> · <bdi>{b.location}</bdi></> : null}</>}{b.lastChange ? <> · {ui("Receipt v{0}", [String(b.lastChange.version)])}</> : null}</p>
        {b.status === "RESCHEDULE_NEEDED" ? <p className="mt-1 text-xs font-bold text-status-warning-text" data-meeting-conflict>{b.conflictReason === "LEAVE" ? ui("The teacher is on leave at this time. Choose a new time.") : b.conflictReason === "TIMETABLE" ? ui("The teacher now teaches at this time. Choose a new time.") : ui("The teacher withdrew this time. Choose a new time.")}</p> : null}
        {b.mine ? <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant={b.status === "RESCHEDULE_NEEDED" ? "default" : "outline"} disabled={busy} onClick={() => { setMoving(b); setPicked(null); }} data-meeting-move>{ui("Choose a new time")}</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => setCancelling(b)} data-meeting-cancel>{ui("Cancel meeting")}</Button></div> : <p className="mt-1 text-xs text-ink-muted">{ui("Booked by another guardian.")}</p>}
      </div>)}
    </div> : null}

    <div id="book-a-meeting" className="scroll-mt-4 space-y-3" data-meetings-book>
      <p className="sk-eyebrow">{moving ? ui("Choose a new time with {0}", [moving.teacherName]) : ui("Book a meeting")}</p>
      {!data.teachers.length ? <p className="text-sm text-ink-muted">{ui("No teachers are linked to this child's class yet.")}</p> : <>
        {!moving ? <FormField name="meeting-teacher" label={ui("Teacher")}><Select value={teacherId} onChange={e => { setTeacherId(e.target.value); setPicked(null); }}>{data.teachers.map(t => <option key={t.id} value={t.id}>{t.name}{t.classTeacher ? ` · ${ui("Class teacher")}` : t.subjects.length ? ` · ${t.subjects.join(", ")}` : ""}</option>)}</Select></FormField> : <Button size="sm" variant="secondary" onClick={() => setMoving(null)}>{ui("Keep the current time")}</Button>}
        {windows.length ? <ul className="space-y-3">{windows.map(w => <li key={w.id} data-meeting-window={w.id}>
          <p className="text-sm font-semibold text-ink-strong"><bdi>{date(w.localDate)}</bdi> · {w.mode === "REMOTE" ? ui("Remote meeting") : w.mode === "EITHER" ? ui("In person or remote") : ui("In person")}{w.location ? <> · <bdi>{w.location}</bdi></> : null}</p>
          <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label={ui("Available times on {0}", [date(w.localDate)])}>{w.slots.map(s => <Button key={s.startsAt} size="sm" variant={picked?.slot.startsAt === s.startsAt ? "default" : "outline"} aria-pressed={picked?.slot.startsAt === s.startsAt} onClick={() => { setPicked({ window: w, slot: s }); setMode(w.mode === "EITHER" ? "" : w.mode); }} data-meeting-slot={s.startsAt}><bdi>{s.start}–{s.end}</bdi>{theirClock(s.startsAt) ? <span className="ms-1 text-2xs opacity-70">(<bdi>{theirClock(s.startsAt)}</bdi>)</span> : null}</Button>)}</div>
        </li>)}</ul> : <p className="rounded-xl border border-dashed p-3 text-sm text-ink-muted" data-meetings-empty>{ui("No slots are available. Request another time from the school.")}</p>}
      </>}
    </div>

    {past.length ? <div className="space-y-2" data-meetings-past>
      <p className="sk-eyebrow">{ui("Earlier meetings")}</p>
      {past.map(b => <div key={b.id} className="rounded-xl border border-edge/30 p-3" data-meeting={b.id} data-meeting-status={b.status}>
        <p className="text-sm font-semibold text-ink-strong"><bdi>{b.teacherName}</bdi> · <bdi>{date(b.local.date)}</bdi> <bdi>{b.local.time}</bdi> · {b.status === "CANCELLED" ? ui("Cancelled") : b.status === "HELD" ? ui("Took place") : b.status === "NOT_HELD" ? ui("Did not take place") : b.status}</p>
        {b.followUp ? <div className="mt-2 space-y-2" data-meeting-followup>
          <p className="text-sm"><bdi>{b.followUp.summary}</bdi></p>
          {b.actions.length ? <><p className="text-xs font-semibold text-ink-strong">{ui("{0} actions were agreed. Each has an owner and due date.", [String(b.actions.length)])}</p>
            <ul className="space-y-1">{b.actions.map(a => <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm" data-meeting-action={a.id} data-action-status={a.status}><span className={cn(a.status === "DONE" && "line-through opacity-70")}><bdi>{a.text}</bdi></span><span className="text-xs text-ink-muted">{a.ownerRole === "FAMILY" ? ui("Family") : ui("School")} · {ui("Due")} <bdi>{date(a.dueDate)}</bdi></span>{a.ownerRole === "FAMILY" && a.status === "OPEN" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void done(a.id)} data-action-done>{ui("Mark done")}</Button> : a.status === "DONE" ? <span className="text-xs font-bold text-status-success-text">{ui("Done")}</span> : null}</li>)}</ul></> : null}
        </div> : null}
      </div>)}
    </div> : null}

    {picked ? <Modal size="sm" title={ui("Review booking")} eyebrow={data.child.name} subtitle={teacherName(picked.window.teacherId)} onClose={() => setPicked(null)}>
      <div className="space-y-3" data-meeting-confirm>
        <p className="text-sm font-semibold text-ink-strong"><bdi>{slotLabel(picked.window, picked.slot)}</bdi></p>
        {theirClock(picked.slot.startsAt) ? <p className="text-xs text-ink-muted">{ui("On your device: {0}", [theirClock(picked.slot.startsAt) ?? ""])}</p> : null}
        {picked.window.mode === "EITHER" ? <fieldset className="flex gap-4 text-sm"><legend className="mb-1 text-xs font-semibold">{ui("How will you meet?")}</legend>
          <label><input type="radio" name="meeting-mode" checked={mode === "IN_PERSON"} onChange={() => setMode("IN_PERSON")} data-mode="IN_PERSON" /> {ui("In person")}</label>
          <label><input type="radio" name="meeting-mode" checked={mode === "REMOTE"} onChange={() => setMode("REMOTE")} data-mode="REMOTE" /> {ui("Remote meeting")}</label></fieldset>
          : <p className="text-sm">{picked.window.mode === "REMOTE" ? ui("Remote meeting") : <>{ui("In person")}{picked.window.location ? <> · <bdi>{picked.window.location}</bdi></> : null}</>}</p>}
        {!moving ? <>
          <FormField name="meeting-agenda" label={ui("What would you like to discuss? (optional)")}><Textarea value={agenda} onChange={e => setAgenda(e.target.value)} maxLength={1000} rows={2} /></FormField>
          <FormField name="meeting-access" label={ui("Tell the school about access needs (optional)")} hint={ui("For example an interpreter, step-free access or a phone call instead.")}><Textarea value={accessNeeds} onChange={e => setAccessNeeds(e.target.value)} maxLength={500} rows={2} /></FormField>
        </> : null}
        <div data-meeting-policy><Alert tone="neutral" compact live="off" title={ui("Changing or cancelling")}><bdi>{picked.window.cancellationPolicy}</bdi></Alert></div>
        <p className="text-xs text-ink-muted">{ui("The slot is confirmed only after booking.")}</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPicked(null)}>{ui("Back")}</Button><Button loading={busy} disabled={busy || !mode} onClick={() => void confirm()} data-meeting-book>{moving ? ui("Move meeting") : ui("Confirm booking")}</Button></div>
      </div>
    </Modal> : null}

    {/* Cancelling is destructive (§8.1 R3): one ConfirmAction naming the teacher, the slot and the school's policy. */}
    <ConfirmAction
      open={Boolean(cancelling)}
      busy={busy}
      tone="danger"
      title={ui("Cancel this meeting?")}
      description={cancelling ? ui("{0} is told straight away. You can book another time afterwards.", [cancelling.teacherName]) : ""}
      detail={cancelling ? <div className="space-y-1" data-meeting-cancel-dialog>
        <p className="text-sm font-semibold text-ink-strong"><bdi>{cancelling.teacherName}</bdi> · <bdi>{slotLabel({ localDate: cancelling.local.date }, { start: cancelling.local.time, end: cancelling.local.end })}</bdi></p>
        {cancelling.cancellationPolicy ? <p className="text-xs leading-relaxed text-ink-muted"><span className="font-semibold text-ink">{ui("Changing or cancelling")}</span> · <bdi>{cancelling.cancellationPolicy}</bdi></p> : null}
      </div> : null}
      confirmLabel={ui("Cancel meeting")}
      cancelLabel={ui("Keep the meeting")}
      onConfirm={() => cancel()}
      onCancel={() => setCancelling(null)}
    />
  </section>;
}
