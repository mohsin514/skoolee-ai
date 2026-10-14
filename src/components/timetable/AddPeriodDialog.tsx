"use client";

import { useId, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocale } from "@/components/locale/LocaleProvider";
import { addPeriodCopy } from "@/lib/timetable/editor-copy";
export { addPeriodCopy } from "@/lib/timetable/editor-copy";


export interface AddedTimetableSlot { id: string; dayOfWeek: number; periodNumber: number; startTime: string; endTime: string; slotType: string; subjectId: string | null; teacherId: string | null; roomId: string | null; roomNumber: string | null; subject: { id: string; name: string } | null; teacher: { id: string; fullName: string } | null; room: { id: string; roomNumber: string; capacity: number } | null }
type Slot = Pick<AddedTimetableSlot, "dayOfWeek" | "periodNumber" | "startTime" | "endTime">;
type Period = Omit<Slot, "dayOfWeek">;

export function AddPeriodDialog({ timetableId, slots, definitions, weekendDays, onAdded, onClose }: { timetableId: string; slots: Slot[]; definitions: Period[]; weekendDays: number[]; onAdded: (slot: AddedTimetableSlot) => void; onClose: () => void }) {
  const { language } = useLocale(), c = addPeriodCopy(language), id = useId();
  const days = [1, 2, 3, 4, 5, 6, 7].filter(day => !weekendDays.includes(day));
  const numbers = definitions.length ? [...definitions].sort((a, b) => a.periodNumber - b.periodNumber).map(period => period.periodNumber) : Array.from({ length: 30 }, (_, index) => index + 1);
  const first = days.flatMap(dayOfWeek => numbers.map(periodNumber => ({ dayOfWeek, periodNumber }))).find(pair => !slots.some(slot => slot.dayOfWeek === pair.dayOfWeek && slot.periodNumber === pair.periodNumber)) || { dayOfWeek: days[0] || 1, periodNumber: numbers[0] || 1 };
  const fixedTime = (number: number) => definitions.find(period => period.periodNumber === number) || slots.find(slot => slot.periodNumber === number);
  const [day, setDay] = useState(first.dayOfWeek), [period, setPeriod] = useState(first.periodNumber);
  const [start, setStart] = useState(fixedTime(first.periodNumber)?.startTime || "08:00"), [end, setEnd] = useState(fixedTime(first.periodNumber)?.endTime || "08:40");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [dirty, setDirty] = useState(false);
  const fixed = fixedTime(period), occupied = slots.some(slot => slot.dayOfWeek === day && slot.periodNumber === period);
  const allPresent = numbers.every(number => slots.some(slot => slot.dayOfWeek === day && slot.periodNumber === number));
  const changePeriod = (number: number) => { setDirty(true); setPeriod(number); const clock = fixedTime(number); if (clock) { setStart(clock.startTime); setEnd(clock.endTime); } setError(""); };
  const save = async () => {
    if (busy) return;
    const validClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!days.includes(day) || !Number.isInteger(period) || period < 1 || period > 30 || !validClock(start) || !validClock(end) || start >= end) { setError(c.TIMETABLE_SLOT_INVALID); return; }
    if (occupied) { setError(c.TIMETABLE_SLOT_EXISTS); return; }
    if (slots.some(slot => slot.dayOfWeek === day && slot.startTime < end && start < slot.endTime)) { setError(c.TIMETABLE_SLOT_OVERLAP); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/timetable/${encodeURIComponent(timetableId)}/slots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dayOfWeek: day, periodNumber: period, startTime: start, endTime: end }) });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.data?.id) { setError(typeof payload.code === "string" && payload.code in c ? c[payload.code as keyof typeof c] : c.failed); return; }
      onAdded(payload.data); onClose();
    } catch { setError(c.failed); }
    finally { setBusy(false); }
  };
  return <Modal title={c.title} subtitle={c.hint} icon={CalendarPlus} size="sm" onClose={onClose} dirty={dirty} dismissible={!busy} disableBackdropClose={busy} footer={<div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={onClose}>{c.close}</Button><Button disabled={busy || occupied || !days.length || allPresent} onClick={() => void save()}>{busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}{busy ? c.saving : c.title}</Button></div>}>
    <div className="space-y-4" aria-busy={busy}>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <FormField name={`${id}-day`} label={c.day}><Select value={day} disabled={busy || !days.length} onChange={event => { setDay(Number(event.target.value)); setDirty(true); setError(""); }}>{days.map(value => <option key={value} value={value}>{new Intl.DateTimeFormat(language, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, value)))}</option>)}</Select></FormField>
      <FormField name={`${id}-period`} label={c.period}><Select value={period} disabled={busy} onChange={event => changePeriod(Number(event.target.value))}>{numbers.map(value => { const present = slots.some(slot => slot.dayOfWeek === day && slot.periodNumber === value); return <option key={value} value={value} disabled={present}>{new Intl.NumberFormat(language).format(value)}{present ? ` · ${c.occupied}` : ""}</option>; })}</Select></FormField>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2"><FormField name={`${id}-start`} label={c.start}><Input type="time" value={start} disabled={busy} readOnly={Boolean(fixed)} onChange={event => { setStart(event.target.value); setDirty(true); }} /></FormField><FormField name={`${id}-end`} label={c.end}><Input type="time" value={end} disabled={busy} readOnly={Boolean(fixed)} onChange={event => { setEnd(event.target.value); setDirty(true); }} /></FormField></div>
      {fixed && <p className="text-xs leading-relaxed text-ink-muted">{c.fixed}</p>}{allPresent && <p role="status" className="text-sm text-ink-muted">{c.full}</p>}
    </div>
  </Modal>;
}
