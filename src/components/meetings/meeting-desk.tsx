"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { readApiError } from "@/lib/api/envelope-client";

// SKO-420: the teacher's meeting desk — open windows, see each slot's state, handle bookings, record whether
// a meeting took place, then write the shared summary and a few owned actions. Staff notes are a separate,
// clearly marked area that the family never sees.

type Slot = { startsAt: string; endsAt: string; start: string; end: string; state: "OPEN" | "TAKEN" | "BLOCKED" | "PAST" };
type Window = { id: string; localDate: string; startTime: string; endTime: string; slotMinutes: number; bufferMinutes: number; maxBookings: number | null; mode: string; location: string | null; cancellationPolicy: string; slots: Slot[] };
type Action = { id: string; text: string; ownerRole: string; dueDate: string; status: string };
type Booking = { id: string; status: string; conflictReason: string | null; version: number; startsAt: string; endsAt: string; local: { date: string; time: string; end: string }; mode: string; location: string | null; agenda: string | null; accessNeeds: string | null; studentName: string; guardianName: string; followUp: { summary: string; sharedAt: string | null } | null; actions: Action[]; notes: { id: string; body: string; createdAt: string; author: string }[]; events: { version: number; action: string; createdAt: string }[] };
type Desk = { timezone: string; today: string; windows: Window[]; bookings: Booking[] };
type Draft = { text: string; ownerRole: "FAMILY" | "STAFF"; dueDate: string };

async function call(url: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error || json.success === false) throw new Error(readApiError(json, "The change was not saved."));
  return json.data;
}
const LIVE = ["CONFIRMED", "RESCHEDULE_NEEDED"];

/**
 * `offerOpen`/`onOfferOpenChange` let the page put "Offer meeting slots" in its PageHeader (the
 * screen's primary action, §4.4b); without them the desk shows its own button. `onReadyChange` tells the page
 * when the desk has loaded, so the header action is disabled (with its reason) instead of doing nothing while
 * the desk loads or after a load error (G21).
 */
export function MeetingDesk({ offerOpen, onOfferOpenChange, onReadyChange }: { offerOpen?: boolean; onOfferOpenChange?: (open: boolean) => void; onReadyChange?: (ready: boolean) => void } = {}) {
  const ui = useUiText();
  const [localOfferOpen, setLocalOfferOpen] = useState(false);
  const controlled = typeof offerOpen === "boolean";
  const offering = controlled ? Boolean(offerOpen) : localOfferOpen;
  const setOffering = (next: boolean) => { if (controlled) onOfferOpenChange?.(next); else setLocalOfferOpen(next); };
  const [confirm, setConfirm] = useState<null | { kind: "withdraw"; window: Window } | { kind: "cancel"; booking: Booking }>(null);
  const { date, dateTime } = useLocaleFormat();
  const [desk, setDesk] = useState<Desk | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ localDate: "", startTime: "14:00", endTime: "15:00", slotMinutes: "15", bufferMinutes: "5", maxBookings: "", mode: "IN_PERSON", location: "", cancellationPolicy: "" });
  const [open, setOpen] = useState<Booking | null>(null), [summary, setSummary] = useState(""), [drafts, setDrafts] = useState<Draft[]>([]), [note, setNote] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { const next = await call("/api/meetings", "GET") as Desk; setDesk(next); setForm(f => f.localDate ? f : { ...f, localDate: next.today }); setOpen(o => o ? next.bookings.find(b => b.id === o.id) ?? null : null); }
    catch (e) { setError(ui(e instanceof Error ? e.message : "Meetings could not be loaded.")); }
  }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const ready = Boolean(desk) && !error;
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  const run = async (work: () => Promise<unknown>, done?: string) => { setBusy(true); try { await work(); if (done) toast.success(ui(done)); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); await load(); return false; } finally { setBusy(false); } };
  const openBooking = (b: Booking) => { setOpen(b); setSummary(b.followUp?.summary ?? ""); setDrafts(b.actions.map(a => ({ text: a.text, ownerRole: a.ownerRole as Draft["ownerRole"], dueDate: a.dueDate }))); setNote(""); };

  const createWindow = () => run(async () => { await call("/api/meetings", "POST", { action: "window", ...form, slotMinutes: Number(form.slotMinutes), bufferMinutes: Number(form.bufferMinutes || 0), maxBookings: form.maxBookings ? Number(form.maxBookings) : null }); setOffering(false); }, "Meeting times opened.");
  const act = (body: Record<string, unknown>, done: string) => run(() => call("/api/meetings", "POST", body), done);

  if (error) return <section className="sk-panel" data-meeting-desk><ErrorState title={ui("Couldn't load your meetings")} description={error} onRetry={() => void load()} /></section>;
  if (!desk) return <section className="sk-panel p-5" data-meeting-desk aria-busy="true"><SkeletonList rows={3} label={ui("Refreshing available times…")} /></section>;
  const upcoming = desk.bookings.filter(b => LIVE.includes(b.status)), recent = desk.bookings.filter(b => !LIVE.includes(b.status));
  const when = (b: Booking) => ui("{0}, {1}–{2} in the school's timezone", [date(b.local.date), b.local.time, b.local.end]);
  const stateLabel: Record<Slot["state"], string> = { OPEN: ui("Open"), TAKEN: ui("Booked"), BLOCKED: ui("Not available"), PAST: ui("Past") };
  const status = (b: Booking) => b.status === "RESCHEDULE_NEEDED" ? ui("Needs a new time") : b.status === "CONFIRMED" ? ui("Confirmed") : b.status === "HELD" ? ui("Took place") : b.status === "NOT_HELD" ? ui("Did not take place") : ui("Cancelled");

  return <section className="sk-panel space-y-5 p-5" data-meeting-desk>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-bold text-ink-strong">{ui("Parent meetings")}</h2><p className="text-xs text-ink-muted">{ui("Times are in the school's timezone: {0}.", [desk.timezone])} {ui("Times when you teach or are on approved leave are not offered.")}</p></div>
      {!controlled ? <Button size="sm" onClick={() => setOffering(true)} data-window-offer><CalendarPlus aria-hidden="true" /> {ui("Offer meeting slots")}</Button> : null}
    </header>

    {!desk.windows.length && !desk.bookings.length ? <EmptyState size="sm" icon={CalendarClock} title={ui("No meeting times offered yet")} description={ui("Offer a few slots and families can book one with you.")} action={<Button size="sm" onClick={() => setOffering(true)}><CalendarPlus aria-hidden="true" /> {ui("Offer meeting slots")}</Button>} /> : null}

    {desk.windows.length ? <ul className="space-y-2" data-meeting-windows>{desk.windows.map(w => <li key={w.id} className="rounded-xl border border-edge/40 p-3" data-window={w.id}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink-strong"><bdi>{date(w.localDate)}</bdi> <bdi>{w.startTime}–{w.endTime}</bdi> · {w.mode === "REMOTE" ? ui("Remote meeting") : w.mode === "EITHER" ? ui("In person or remote") : ui("In person")}{w.location ? <> · <bdi>{w.location}</bdi></> : null}</p>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm({ kind: "withdraw", window: w })} data-window-withdraw>{ui("Withdraw these times")}</Button></div>
      <ul className="mt-2 flex flex-wrap gap-1.5">{w.slots.map(s => <li key={s.startsAt} className={cn("rounded-lg border px-2 py-1 text-xs", s.state === "OPEN" ? "border-status-success-border bg-status-success-surface" : s.state === "TAKEN" ? "border-status-brand-border bg-status-brand-surface font-semibold" : "border-border-subtle bg-surface-subtle text-ink-muted")} data-slot-state={s.state}><bdi>{s.start}–{s.end}</bdi> · {stateLabel[s.state]}</li>)}</ul>
    </li>)}</ul> : null}

    <div className="space-y-2" data-meeting-bookings>
      <p className="sk-eyebrow">{ui("Booked meetings")}</p>
      {!upcoming.length && !recent.length ? <p className="text-sm text-ink-muted">{ui("No meetings booked yet.")}</p> : null}
      {[...upcoming, ...recent].map(b => <div key={b.id} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3", b.status === "RESCHEDULE_NEEDED" ? "border-status-warning-border bg-status-warning-surface" : "border-edge/40")} data-booking={b.id} data-booking-status={b.status}>
        <div><p className="text-sm font-semibold text-ink-strong"><bdi>{b.studentName}</bdi> · <bdi>{b.guardianName}</bdi></p><p className="text-xs text-ink-muted"><bdi>{when(b)}</bdi> · {status(b)}{b.status === "RESCHEDULE_NEEDED" ? <> · {b.conflictReason === "LEAVE" ? ui("You are on leave at this time.") : b.conflictReason === "TIMETABLE" ? ui("You now teach at this time.") : ui("You withdrew this time.")}</> : null}</p></div>
        <Button size="sm" variant="outline" onClick={() => openBooking(b)} data-booking-open>{ui("Open")}</Button>
      </div>)}
    </div>

    {offering ? <Modal size="lg" title={ui("Offer meeting slots")} eyebrow={ui("Parent meetings")} subtitle={ui("Families see these times and the policy before they book.")} onClose={() => setOffering(false)}
      footer={<ModalActions busy={busy} busyLabel={ui("Opening…")} actionLabel={ui("Open these times")} onCancel={() => setOffering(false)} onAction={() => void createWindow()} blockedReason={!form.localDate ? ui("Choose a day.") : null} />}>
    <div className="space-y-3" data-meeting-window-form>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="w-date" label={ui("Day")}><Input type="date" value={form.localDate} min={desk.today} onChange={e => setForm({ ...form, localDate: e.target.value })} /></FormField>
        <FormField name="w-start" label={ui("From")}><Input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} dir="ltr" /></FormField>
        <FormField name="w-end" label={ui("Until")}><Input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} dir="ltr" /></FormField>
        <FormField name="w-slot" label={ui("Minutes per meeting")}><Input type="number" min={5} max={120} value={form.slotMinutes} onChange={e => setForm({ ...form, slotMinutes: e.target.value })} /></FormField>
        <FormField name="w-buffer" label={ui("Gap between meetings")}><Input type="number" min={0} max={60} value={form.bufferMinutes} onChange={e => setForm({ ...form, bufferMinutes: e.target.value })} /></FormField>
        <FormField name="w-max" label={ui("Booking limit (optional)")}><Input type="number" min={1} value={form.maxBookings} onChange={e => setForm({ ...form, maxBookings: e.target.value })} /></FormField>
        <FormField name="w-mode" label={ui("Meeting type")}><Select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}><option value="IN_PERSON">{ui("In person")}</option><option value="REMOTE">{ui("Remote meeting")}</option><option value="EITHER">{ui("In person or remote")}</option></Select></FormField>
        <FormField name="w-location" label={ui("Location")}><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></FormField>
      </div>
      <FormField name="w-policy" label={ui("Changing or cancelling")} hint={ui("Shown to families before they book.")}><Textarea rows={2} value={form.cancellationPolicy} onChange={e => setForm({ ...form, cancellationPolicy: e.target.value })} /></FormField>
    </div>

    </Modal> : null}

    <ConfirmAction
      open={confirm?.kind === "withdraw"}
      tone="danger"
      title={ui("Withdraw these times?")}
      description={ui("Families who booked one of these slots are told and asked to choose another time. This cannot be undone.")}
      confirmLabel={ui("Withdraw times")}
      cancelLabel={ui("Keep times")}
      busy={busy}
      onCancel={() => setConfirm(null)}
      onConfirm={async () => { const w = confirm?.kind === "withdraw" ? confirm.window : null; if (w && await act({ action: "withdraw", windowId: w.id }, "Times withdrawn. Families with bookings were asked to choose again.")) setConfirm(null); }}
    />
    <ConfirmAction
      open={confirm?.kind === "cancel"}
      tone="danger"
      title={ui("Cancel this meeting?")}
      description={ui("The family is told straight away and the slot opens again. This cannot be undone.")}
      confirmLabel={ui("Cancel meeting")}
      cancelLabel={ui("Keep meeting")}
      busy={busy}
      onCancel={() => setConfirm(null)}
      onConfirm={async () => { const b = confirm?.kind === "cancel" ? confirm.booking : null; if (b && await act({ action: "cancel", bookingId: b.id, knownVersion: b.version }, "Meeting cancelled. The family has been told.")) setConfirm(null); }}
    />

    {open ? <Modal size="lg" title={open.studentName} eyebrow={status(open)} subtitle={when(open)} onClose={() => setOpen(null)}>
      <div className="space-y-4" data-booking-dialog>
        <div className="text-sm"><p>{ui("Guardian")}: <bdi>{open.guardianName}</bdi> · {open.mode === "REMOTE" ? ui("Remote meeting") : ui("In person")}{open.location ? <> · <bdi>{open.location}</bdi></> : null}</p>
          {open.agenda ? <p className="mt-1">{ui("Agenda")}: <bdi>{open.agenda}</bdi></p> : null}{open.accessNeeds ? <p className="mt-1 font-bold">{ui("Access needs")}: <bdi>{open.accessNeeds}</bdi></p> : null}</div>
        {LIVE.includes(open.status) ? <div className="flex flex-wrap gap-2">
          {new Date(open.startsAt) <= new Date() && open.status === "CONFIRMED" ? <><Button size="sm" disabled={busy} onClick={() => void act({ action: "outcome", bookingId: open.id, outcome: "HELD" }, "Recorded.")} data-outcome-held>{ui("It took place")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "outcome", bookingId: open.id, outcome: "NOT_HELD" }, "Recorded.")} data-outcome-not-held>{ui("It did not take place")}</Button></> : null}
          <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setConfirm({ kind: "cancel", booking: open })} data-booking-cancel>{ui("Cancel meeting")}</Button>
        </div> : null}
        {open.status === "HELD" ? <div className="space-y-2 rounded-xl border border-status-success-border bg-status-success-surface p-3" data-followup>
          <p className="text-xs font-semibold text-ink-strong">{ui("Shared with the family")}{open.followUp?.sharedAt ? <> · {ui("Shared")} <bdi>{dateTime(open.followUp.sharedAt)}</bdi></> : <> · {ui("Draft — the family sees nothing until you share it")}</>}</p>
          <FormField name="f-summary" label={ui("Summary")}><Textarea rows={3} value={summary} disabled={Boolean(open.followUp?.sharedAt)} onChange={e => setSummary(e.target.value)} /></FormField>
          {drafts.map((d, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_140px_160px_auto]" data-followup-action={i}>
            <Input aria-label={ui("Action")} value={d.text} disabled={Boolean(open.followUp?.sharedAt)} onChange={e => setDrafts(drafts.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
            <Select aria-label={ui("Owner")} value={d.ownerRole} disabled={Boolean(open.followUp?.sharedAt)} onChange={e => setDrafts(drafts.map((x, j) => j === i ? { ...x, ownerRole: e.target.value as Draft["ownerRole"] } : x))}><option value="FAMILY">{ui("Family")}</option><option value="STAFF">{ui("School")}</option></Select>
            <Input type="date" aria-label={ui("Due")} value={d.dueDate} disabled={Boolean(open.followUp?.sharedAt)} onChange={e => setDrafts(drafts.map((x, j) => j === i ? { ...x, dueDate: e.target.value } : x))} />
            {!open.followUp?.sharedAt ? <Button size="sm" variant="secondary" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>{ui("Remove")}</Button> : <span className="text-xs">{open.actions[i]?.status === "DONE" ? ui("Done") : open.actions[i] && open.actions[i].ownerRole === "STAFF" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "action-done", actionId: open.actions[i].id }, "Marked as done.")}>{ui("Mark done")}</Button> : ui("Open")}</span>}
          </div>)}
          {!open.followUp?.sharedAt ? <div className="flex flex-wrap justify-end gap-2">
            {drafts.length < 5 ? <Button size="sm" variant="secondary" onClick={() => setDrafts([...drafts, { text: "", ownerRole: "FAMILY", dueDate: desk.today }])} data-followup-add>{ui("Add an action")}</Button> : null}
            <Button size="sm" variant="outline" disabled={busy || !summary.trim()} onClick={() => void act({ action: "followup", bookingId: open.id, summary, actions: drafts }, "Draft saved.")} data-followup-save>{ui("Save draft")}</Button>
            <Button size="sm" disabled={busy || !open.followUp || open.followUp.summary !== summary} onClick={() => void act({ action: "share", bookingId: open.id }, "Shared with the family.")} data-followup-share>{ui("Share with the family")}</Button>
          </div> : null}
        </div> : null}
        <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-subtle p-3" data-staff-notes>
          <p className="text-xs font-semibold text-ink-strong">{ui("Staff notes — never shown to the family")}</p>
          {open.notes.map(n => <p key={n.id} className="text-sm"><bdi>{n.body}</bdi> <span className="text-xs text-ink-muted">· <bdi>{n.author}</bdi> · <bdi>{dateTime(n.createdAt)}</bdi></span></p>)}
          <div className="flex gap-2"><Textarea rows={2} aria-label={ui("Staff note")} value={note} onChange={e => setNote(e.target.value)} /><Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => void act({ action: "note", bookingId: open.id, body: note }, "Note saved.").then(() => setNote(""))} data-note-add>{ui("Add note")}</Button></div>
        </div>
        <details className="text-xs"><summary className="cursor-pointer font-bold">{ui("History")}</summary><ul className="mt-1 space-y-0.5">{open.events.map(e => <li key={e.version}>v<bdi>{e.version}</bdi> · {({ BOOKED: ui("Booked"), RESCHEDULED: ui("Moved"), CANCELLED: ui("Cancelled"), CONFLICT: ui("Needs a new time"), HELD: ui("Took place"), NOT_HELD: ui("Did not take place") } as Record<string, string>)[e.action] ?? e.action} · <bdi>{dateTime(e.createdAt)}</bdi></li>)}</ul></details>
      </div>
    </Modal> : null}
  </section>;
}
