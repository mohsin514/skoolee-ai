"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BedDouble, History, MoveRight, Settings2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-463: occupancy on a chosen date, dated allocations, moves that keep history, and room changes that
// show their impact before saving. Residents show only name, roll number and class.

type Room = { id: string; number: string; roomType: string; capacity: number; status: string; statusReason: string | null; occupied: number; upcoming: number; available: number };
type Stay = { id: string; roomId: string; roomNumber: string; student: { id: string; fullName: string; rollNo: string; className: string | null }; startDate: string; endDate: string | null; status: string; reason: string; endReason: string | null; previousId: string | null; movedOn: boolean; state: "CURRENT" | "UPCOMING" | "ENDED" | "CANCELLED" };
type StudentOption = { id: string; fullName: string; rollNo: string; class: { name: string } | null; dormRoom: { number: string } | null };
type Dialog = { kind: "allocate" } | { kind: "move" | "end" | "cancel"; stay: Stay } | { kind: "room"; room: Room } | { kind: "history"; student: Stay["student"] } | null;

const STATE_LABEL: Record<Stay["state"], string> = { CURRENT: "Current", UPCOMING: "Upcoming", ENDED: "Ended", CANCELLED: "Cancelled" };

async function send(body: Record<string, unknown>) {
  const response = await fetch("/api/dormitory/allocations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "The change was not saved.");
  return json as { data: { id: string }; replayed: boolean };
}

export function DormitoryAllocations({ canManage = true }: { canManage?: boolean }) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [date, setDate] = useState("");
  const [data, setData] = useState<{ date: string; today: string; rooms: Room[]; stays: Stay[] } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/dormitory/allocations${date ? `?date=${date}` : ""}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(response.status === 403 ? ui("You do not have access to hostel allocations for this campus.") : json.error || ui("Allocations could not be loaded."));
      setData(json.data);
      if (!date) setDate(json.data.date);
    } catch (failure) { setError(failure instanceof Error ? ui(failure.message) : ui("Allocations could not be loaded.")); } finally { setLoading(false); }
  }, [date, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const done = (message: string) => { toast.success(message); setDialog(null); void load(); };
  const rooms = data?.rooms ?? [];
  const totals = rooms.reduce((sum, room) => ({ capacity: sum.capacity + (room.status === "AVAILABLE" ? room.capacity : 0), occupied: sum.occupied + room.occupied, out: sum.out + (room.status === "AVAILABLE" ? 0 : 1) }), { capacity: 0, occupied: 0, out: 0 });

  return <div className="space-y-4" data-dorm-allocations>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <FormField name="dorm-occupancy-date" label={ui("Occupancy on")}><Input type="date" value={date} onChange={event => setDate(event.target.value)} /></FormField>
      {data ? <p className="text-sm font-bold" data-dorm-summary aria-live="polite">{ui("{0} of {1} places taken on {2}", [totals.occupied, totals.capacity, formatDate(data.date)])}{totals.out ? ` · ${ui("{0} room(s) out of service", [totals.out])}` : ""}</p> : null}
      {canManage ? <Button onClick={() => setDialog({ kind: "allocate" })} disabled={!rooms.length}><UserPlus className="size-4" aria-hidden="true" />{ui("Allocate student")}</Button> : null}
    </div>

    {loading && !data ? <p role="status" className="text-sm text-ink-muted">{ui("Loading allocations…")}</p>
      : error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>{ui("Retry")}</Button></div>
      : !rooms.length ? <p className="rounded-2xl bg-muted p-4 text-sm">{ui("No rooms yet. Add room types and rooms first, then allocate students.")}</p>
      : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={ui("Rooms")}>
        {rooms.map(room => {
          const residents = (data?.stays ?? []).filter(stay => stay.roomId === room.id && (stay.state === "CURRENT" || stay.state === "UPCOMING"));
          return <li key={room.id} className="space-y-2 rounded-2xl border border-border p-4" data-dorm-room={room.number} data-room-status={room.status} data-room-occupied={room.occupied}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="flex items-center gap-1.5 text-sm font-black"><BedDouble className="size-4 text-primary" aria-hidden="true" /><bdi>{room.number}</bdi></p><p className="text-xs text-ink-muted"><bdi>{room.roomType}</bdi></p></div>
              <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${room.status !== "AVAILABLE" ? "bg-amber-50 text-amber-800" : room.available === 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                {room.status !== "AVAILABLE" ? ui("Out of service") : room.available === 0 ? ui("Full") : ui("{0} free", [room.available])}
              </span>
            </div>
            <p className="text-xs font-bold">{ui("{0} of {1} places taken", [room.occupied, room.capacity])}{room.upcoming ? ` · ${ui("{0} upcoming", [room.upcoming])}` : ""}</p>
            {room.statusReason ? <p className="text-xs text-amber-800"><bdi>{room.statusReason}</bdi></p> : null}
            {residents.length ? <ul className="space-y-1.5">{residents.map(stay => <li key={stay.id} className="rounded-xl bg-muted/60 px-3 py-2 text-xs" data-dorm-stay={stay.id} data-stay-state={stay.state}>
              <p className="font-bold"><bdi>{stay.student.fullName}</bdi> · <bdi>{stay.student.rollNo}</bdi>{stay.student.className ? <> · <bdi>{stay.student.className}</bdi></> : null}</p>
              <p className="text-ink-muted">{ui(STATE_LABEL[stay.state])} · {formatDate(stay.startDate)} – {stay.endDate ? formatDate(stay.endDate) : ui("no end date")}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {canManage && stay.state === "CURRENT" ? <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "move", stay })} aria-label={ui("Move {0}", [stay.student.fullName])}><MoveRight className="size-3.5" aria-hidden="true" />{ui("Move")}</Button> : null}
                {canManage && stay.state === "CURRENT" ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "end", stay })}>{ui("End stay")}</Button> : null}
                {canManage && stay.state === "UPCOMING" ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "cancel", stay })}>{ui("Cancel reservation")}</Button> : null}
                <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "history", student: stay.student })} aria-label={ui("Room history for {0}", [stay.student.fullName])}><History className="size-3.5" aria-hidden="true" />{ui("History")}</Button>
              </div>
            </li>)}</ul> : <p className="text-xs text-ink-subtle">{ui("Nobody is allocated on this date.")}</p>}
            {canManage ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "room", room })}><Settings2 className="size-3.5" aria-hidden="true" />{ui("Capacity and status")}</Button> : null}
          </li>;
        })}
      </ul>}

    {dialog?.kind === "allocate" && data ? <AllocateDialog rooms={rooms} today={data.today} onClose={() => setDialog(null)} onDone={done} /> : null}
    {dialog?.kind === "move" ? <MoveDialog stay={dialog.stay} rooms={rooms} today={data?.today ?? ""} onClose={() => setDialog(null)} onDone={done} /> : null}
    {dialog?.kind === "end" ? <EndDialog stay={dialog.stay} today={data?.today ?? ""} onClose={() => setDialog(null)} onDone={done} /> : null}
    {dialog?.kind === "cancel" ? <CancelDialog stay={dialog.stay} onClose={() => setDialog(null)} onDone={done} /> : null}
    {dialog?.kind === "room" ? <RoomDialog room={dialog.room} onClose={() => setDialog(null)} onDone={done} /> : null}
    {dialog?.kind === "history" ? <HistoryDialog student={dialog.student} onClose={() => setDialog(null)} /> : null}
  </div>;
}

function useSubmit(onDone: (message: string) => void) {
  const ui = useUiText();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = async (body: Record<string, unknown>, message: string, replayedMessage = message) => {
    setBusy(true); setError("");
    try { const json = await send(body); onDone(json.replayed ? ui(replayedMessage) : ui(message)); }
    catch (failure) { setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Your details are kept; retrying is safe.") : ui(failure instanceof Error ? failure.message : "The change was not saved.")); }
    finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}
const ErrorLine = ({ error }: { error: string }) => error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" data-dorm-error>{error}</p> : null;
function Actions({ busy, label, onClose, onSave, disabled }: { busy: boolean; label: string; onClose: () => void; onSave: () => void; disabled?: boolean }) {
  const ui = useUiText();
  return <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={onSave} disabled={busy || disabled} aria-busy={busy}>{busy ? ui("Saving…") : label}</Button></div>;
}

function AllocateDialog({ rooms, today, onClose, onDone }: { rooms: Room[]; today: string; onClose: () => void; onDone: (message: string) => void }) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [query, setQuery] = useState(""), [options, setOptions] = useState<StudentOption[]>([]), [student, setStudent] = useState<StudentOption | null>(null);
  const [roomId, setRoomId] = useState(""), [start, setStart] = useState(today), [end, setEnd] = useState(""), [reason, setReason] = useState("");
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const { busy, error, setError, run } = useSubmit(onDone);
  useEffect(() => {
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/dormitory/allocations?lookup=students&q=${encodeURIComponent(query)}`, { cache: "no-store" }).catch(() => null);
      const json = await response?.json().catch(() => ({}));
      if (json?.success) setOptions(json.data);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);
  const open = rooms.filter(room => room.status === "AVAILABLE");
  const room = rooms.find(item => item.id === roomId);
  const submit = () => {
    if (!student || !roomId || !start || reason.trim().length < 3) { setError(ui("Choose a student and a room, a start date and a reason.")); return; }
    const payload = { action: "allocate", studentId: student.id, roomId, startDate: start, endDate: end || undefined, reason: reason.trim() };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    void run({ ...payload, idempotencyKey: attempt.current.key }, "Student allocated. Occupancy and history are updated.", "This allocation was already saved; nothing was added twice.");
  };
  return <ModalFrame title={ui("Allocate student")} eyebrow={ui("Hostel")} subtitle={ui("A stay runs from the start date up to, not including, the end date.")} onClose={onClose} dirty={Boolean(student || reason)}>
    <div className="space-y-3" data-dorm-allocate>
      <ErrorLine error={error} />
      <FormField name="dorm-student-search" label={ui("Find student by name or roll number")}><Input value={query} onChange={event => setQuery(event.target.value)} /></FormField>
      <fieldset className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
        <legend className="px-1 text-xs font-bold">{ui("Student")}</legend>
        {options.length ? options.map(option => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
          <input type="radio" name="dorm-student" checked={student?.id === option.id} onChange={() => setStudent(option)} />
          <span><bdi>{option.fullName}</bdi> · <bdi>{option.rollNo}</bdi>{option.class ? <> · <bdi>{option.class.name}</bdi></> : null}{option.dormRoom ? <span className="text-xs text-ink-muted"> · {ui("now in {0}", [option.dormRoom.number])}</span> : null}</span>
        </label>) : <p className="px-2 py-1 text-xs text-ink-muted">{ui("No matching students.")}</p>}
      </fieldset>
      <FormField name="dorm-room" label={ui("Room")}><Select value={roomId} onChange={event => setRoomId(event.target.value)}><option value="">{ui("Choose a room")}</option>{open.map(item => <option key={item.id} value={item.id}>{item.number} · {ui("{0} free", [item.available])}</option>)}</Select></FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="dorm-start" label={ui("Start date")}><Input type="date" value={start} onChange={event => setStart(event.target.value)} /></FormField>
        <FormField name="dorm-end" label={ui("End date (optional)")}><Input type="date" value={end} min={start} onChange={event => setEnd(event.target.value)} /></FormField>
      </div>
      <FormField name="dorm-reason" label={ui("Reason")}><Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField>
      {student && room ? <p className="rounded-xl bg-muted p-3 text-xs" data-dorm-preview>{ui("{0} will stay in room {1} from {2}{3}. The server checks every night of the stay for a free place.", [student.fullName, room.number, formatDate(start), end ? ` ${ui("until {0}", [formatDate(end)])}` : ` ${ui("with no end date")}`])}</p> : null}
      <Actions busy={busy} label={ui("Allocate")} onClose={onClose} onSave={submit} />
    </div>
  </ModalFrame>;
}

function MoveDialog({ stay, rooms, today, onClose, onDone }: { stay: Stay; rooms: Room[]; today: string; onClose: () => void; onDone: (message: string) => void }) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [toRoomId, setToRoomId] = useState(""), [moveDate, setMoveDate] = useState(today > stay.startDate ? today : ""), [reason, setReason] = useState("");
  const { busy, error, setError, run } = useSubmit(onDone);
  const target = rooms.find(room => room.id === toRoomId);
  const submit = () => {
    if (!toRoomId || !moveDate || reason.trim().length < 3) { setError(ui("Choose the new room, the move date and a reason.")); return; }
    void run({ action: "move", id: stay.id, toRoomId, moveDate, reason: reason.trim() }, "Move saved. The earlier stay is kept in history.", "This move was already saved.");
  };
  return <ModalFrame title={ui("Move {0}", [stay.student.fullName])} eyebrow={ui("Hostel")} subtitle={ui("Currently in room {0} since {1}.", [stay.roomNumber, formatDate(stay.startDate)])} onClose={onClose} dirty={Boolean(reason)}>
    <div className="space-y-3" data-dorm-move>
      <ErrorLine error={error} />
      <FormField name="dorm-move-room" label={ui("New room")}><Select value={toRoomId} onChange={event => setToRoomId(event.target.value)}><option value="">{ui("Choose a room")}</option>{rooms.filter(room => room.id !== stay.roomId && room.status === "AVAILABLE").map(room => <option key={room.id} value={room.id}>{room.number} · {ui("{0} free", [room.available])}</option>)}</Select></FormField>
      <FormField name="dorm-move-date" label={ui("Move date")}><Input type="date" value={moveDate} min={stay.startDate} onChange={event => setMoveDate(event.target.value)} /></FormField>
      <FormField name="dorm-move-reason" label={ui("Reason")}><Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField>
      {target && moveDate ? <p className="rounded-xl bg-muted p-3 text-xs" data-dorm-preview>{ui("Room {0}: stay ends on {1}. Room {2}: stay starts on {1} and runs {3}.", [stay.roomNumber, formatDate(moveDate), target.number, stay.endDate ? ui("until {0}", [formatDate(stay.endDate)]) : ui("with no end date")])}</p> : null}
      <Actions busy={busy} label={ui("Save move")} onClose={onClose} onSave={submit} />
    </div>
  </ModalFrame>;
}

function EndDialog({ stay, today, onClose, onDone }: { stay: Stay; today: string; onClose: () => void; onDone: (message: string) => void }) {
  const ui = useUiText();
  const [endDate, setEndDate] = useState(today), [reason, setReason] = useState("");
  const { busy, error, setError, run } = useSubmit(onDone);
  const submit = () => {
    if (!endDate || reason.trim().length < 3) { setError(ui("Choose the end date and give a reason.")); return; }
    void run({ action: "end", id: stay.id, endDate, reason: reason.trim() }, "Stay ended. It stays in the room history.");
  };
  return <ModalFrame title={ui("End stay for {0}", [stay.student.fullName])} eyebrow={ui("Hostel")} subtitle={ui("The end date is the first night the student is no longer in room {0}.", [stay.roomNumber])} onClose={onClose} dirty={Boolean(reason)}>
    <div className="space-y-3"><ErrorLine error={error} />
      <FormField name="dorm-end-date" label={ui("End date")}><Input type="date" value={endDate} min={stay.startDate} onChange={event => setEndDate(event.target.value)} /></FormField>
      <FormField name="dorm-end-reason" label={ui("Reason")}><Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField>
      <Actions busy={busy} label={ui("End stay")} onClose={onClose} onSave={submit} />
    </div>
  </ModalFrame>;
}

function CancelDialog({ stay, onClose, onDone }: { stay: Stay; onClose: () => void; onDone: (message: string) => void }) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [reason, setReason] = useState("");
  const { busy, error, setError, run } = useSubmit(onDone);
  return <ConfirmAction open title={ui("Cancel this reservation?")} tone="warning" busy={busy} confirmLabel={ui("Cancel reservation")} cancelLabel={ui("Keep it")}
    description={ui("{0} will no longer be expected in room {1} from {2}. The cancelled reservation stays in history.", [stay.student.fullName, stay.roomNumber, formatDate(stay.startDate)])}
    detail={<div className="space-y-2"><label htmlFor="dorm-cancel-reason" className="block text-xs font-bold">{ui("Reason")}</label><Input id="dorm-cancel-reason" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /><ErrorLine error={error} /></div>}
    onConfirm={() => { if (reason.trim().length < 3) { setError(ui("Give a reason for cancelling.")); return; } void run({ action: "cancel", id: stay.id, reason: reason.trim() }, "Reservation cancelled."); }}
    onCancel={onClose} />;
}

function RoomDialog({ room, onClose, onDone }: { room: Room; onClose: () => void; onDone: (message: string) => void }) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [capacity, setCapacity] = useState(String(room.capacity)), [status, setStatus] = useState(room.status), [reason, setReason] = useState(room.statusReason ?? "");
  const [impact, setImpact] = useState<{ blocked: boolean; message: string; peak: number; affected: { id: string; studentName: string; startDate: string; endDate: string | null }[] } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const body = (dryRun: boolean) => ({ id: room.id, capacity: Number(capacity), status, statusReason: reason, dryRun });
  const call = async (dryRun: boolean) => {
    const response = await fetch("/api/dormitory/rooms", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(dryRun)) });
    const json = await response.json().catch(() => ({}));
    if (json.impact) setImpact(json.impact);
    if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "The room was not updated.");
    return json;
  };
  useEffect(() => {
    if (!capacity || Number(capacity) < 1) return;
    const timer = setTimeout(() => { void call(true).then(json => setImpact(json.data)).catch(() => undefined); }, 250);
    return () => clearTimeout(timer);
  }, [capacity, status]);
  const save = async () => {
    setBusy(true); setError("");
    try { await call(false); onDone(ui("Room {0} updated.", [room.number])); }
    catch (failure) { setError(ui(failure instanceof Error ? failure.message : "The room was not updated.")); }
    finally { setBusy(false); }
  };
  return <ModalFrame title={ui("Room {0}: capacity and status", [room.number])} eyebrow={ui("Hostel")} onClose={onClose}>
    <div className="space-y-3" data-dorm-room-dialog>
      <ErrorLine error={error} />
      <FormField name="dorm-capacity" label={ui("Capacity")}><Input type="number" min={1} max={50} value={capacity} onChange={event => setCapacity(event.target.value)} /></FormField>
      <FormField name="dorm-status" label={ui("Status")}><Select value={status} onChange={event => setStatus(event.target.value)}><option value="AVAILABLE">{ui("Available")}</option><option value="OUT_OF_SERVICE">{ui("Out of service")}</option></Select></FormField>
      {status === "OUT_OF_SERVICE" ? <FormField name="dorm-status-reason" label={ui("Why is it out of service?")}><Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField> : null}
      {impact ? <div className={`rounded-xl p-3 text-xs ${impact.blocked ? "bg-amber-50 text-amber-900" : "bg-muted"}`} data-dorm-impact={impact.blocked ? "blocked" : "clear"} role={impact.blocked ? "alert" : undefined}>
        <p className="font-bold">{impact.blocked ? ui(impact.message) : ui("Up to {0} student(s) are allocated from today; this change fits.", [impact.peak])}</p>
        {impact.blocked && impact.affected.length ? <ul className="mt-1 list-disc ps-4">{impact.affected.map(stay => <li key={stay.id}><bdi>{stay.studentName}</bdi> · {formatDate(stay.startDate)} – {stay.endDate ? formatDate(stay.endDate) : ui("no end date")}</li>)}</ul> : null}
      </div> : null}
      <Actions busy={busy} label={ui("Save room")} onClose={onClose} onSave={() => void save()} disabled={impact?.blocked} />
    </div>
  </ModalFrame>;
}

function HistoryDialog({ student, onClose }: { student: Stay["student"]; onClose: () => void }) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [stays, setStays] = useState<Stay[] | null>(null);
  useEffect(() => { void fetch(`/api/dormitory/allocations?studentId=${encodeURIComponent(student.id)}`, { cache: "no-store" }).then(r => r.json()).then(json => setStays(json.success ? json.data.stays : [])).catch(() => setStays([])); }, [student.id]);
  return <ModalFrame title={ui("Room history for {0}", [student.fullName])} eyebrow={ui("Hostel")} onClose={onClose}>
    {!stays ? <p role="status" className="text-sm">{ui("Loading allocations…")}</p> : <ol className="space-y-2" data-dorm-history>{stays.map(stay => <li key={stay.id} className="rounded-xl border border-border p-3 text-xs" data-history-state={stay.state}>
      <p className="font-bold">{ui("Room {0}", [stay.roomNumber])} · {ui(STATE_LABEL[stay.state])}</p>
      <p>{formatDate(stay.startDate)} – {stay.endDate ? formatDate(stay.endDate) : ui("no end date")}</p>
      <p className="text-ink-muted"><bdi>{stay.reason}</bdi>{stay.endReason ? <> · <bdi>{stay.endReason}</bdi></> : null}</p>
    </li>)}</ol>}
  </ModalFrame>;
}
