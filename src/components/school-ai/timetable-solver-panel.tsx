"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import type { Language } from "@/lib/locale/package";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { timetableSolveInputSchema, type TimetableSolution } from "@/lib/school-ai/timetable-solver";
import type { TimetableSetupOptions, TimetableSetupProposal } from "@/lib/school-ai/timetable-setup";
import { useWorkspaceDraft } from "./draft-safety";
import { workspaceRequest, workspaceErrorText, WorkspaceRequestError } from "./workspace-client";
import { timetableSetupCopy } from "./timetable-setup-copy";
import { timetableSolverCopy } from "./timetable-solver-copy";

type Suggestion = TimetableSolution & { proposal: TimetableSetupProposal | null; excludedRoomIds: string[] };
export function TimetableSolverPanel({ language, options, classId, term, disabled, onUse, onBusyChange }: { language: Language; options: TimetableSetupOptions; classId: string; term: TimetableSetupProposal["term"]; disabled: boolean; onUse: (slots: TimetableSetupProposal["slots"]) => void; onBusyChange: (busy: boolean) => void }) {
  const t = timetableSolverCopy(language), c = schoolAICopy(language), setup = timetableSetupCopy(language);
  const subjects = options.subjects.filter(subject => subject.classId === classId);
  const [requirements, setRequirements] = useState<Record<string, { weekly: number; daily: number }>>({});
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7].filter(day => !options.weekendDays.includes(day)));
  const [rooms, setRooms] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null), [confirmed, setConfirmed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useWorkspaceDraft(busy);
  const invalidate = () => { setSuggestion(null); setConfirmed(false); setError(""); };
  const toggle = <T,>(values: T[], value: T) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  const solve = async () => {
    const input = timetableSolveInputSchema.safeParse({ campusId: options.campusId, classId, term, days, roomIds: rooms, requirements: subjects.filter(subject => requirements[subject.id]?.weekly > 0).map(subject => ({ subjectId: subject.id, periodsPerWeek: requirements[subject.id].weekly, maxPerDay: requirements[subject.id].daily })) });
    invalidate(); if (!input.success) { setError(t.invalid); return; }
    const controller = new AbortController(); abort.current = controller; setBusy(true); onBusyChange(true);
    try { const result = await workspaceRequest<{ suggestion: Suggestion }>("/api/school-ai/timetable/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data), signal: controller.signal }); if (!controller.signal.aborted) setSuggestion(result.suggestion); }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof WorkspaceRequestError && cause.code && cause.code in t ? t[cause.code as keyof typeof t] : cause instanceof WorkspaceRequestError && cause.code && cause.code in setup ? String(setup[cause.code as keyof typeof setup]) : workspaceErrorText(cause, c)); }
    finally { if (!controller.signal.aborted) { setBusy(false); onBusyChange(false); } }
  };
  return <details className="min-w-0 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
    <summary className="cursor-pointer rounded-lg py-2 font-semibold focus-visible:outline-2 focus-visible:outline-primary">{t.title}</summary>
    <div className="mt-4 min-w-0 space-y-4" aria-busy={busy}>
      <p className="text-sm text-ink-muted">{t.hint}</p><p className="text-xs leading-relaxed text-ink-muted">{t.bounds}</p>
      <fieldset disabled={disabled || busy} className="min-w-0 space-y-4">
        <legend className="sr-only">{t.title}</legend>
        <fieldset><legend className="mb-2 text-sm font-semibold">{t.days}</legend><div className="flex flex-wrap gap-3">{setup.days.map((day, index) => !options.weekendDays.includes(index + 1) && <label key={day} className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={days.includes(index + 1)} onChange={() => { setDays(toggle(days, index + 1)); invalidate(); }} />{day}</label>)}</div></fieldset>
        <fieldset><legend className="mb-2 text-sm font-semibold">{t.rooms}</legend><div className="flex flex-wrap gap-3">{options.rooms.map(room => <label key={room.id} className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={rooms.includes(room.id)} onChange={() => { setRooms(toggle(rooms, room.id)); invalidate(); }} />{room.roomNumber} · {room.capacity} {setup.seats}</label>)}</div></fieldset>
        {subjects.map(subject => <div key={subject.id} className="min-w-0 rounded-xl border border-border-subtle p-3"><h3 className="mb-3 font-semibold">{subject.name}</h3><div className="grid min-w-0 gap-3 sm:grid-cols-2"><FormField name={`solver-week-${subject.id}`} label={t.weekly}><Input type="number" min={0} max={35} value={requirements[subject.id]?.weekly ?? 0} onChange={event => { setRequirements(previous => ({ ...previous, [subject.id]: { daily: previous[subject.id]?.daily ?? 1, weekly: Number(event.target.value) } })); invalidate(); }} /></FormField><FormField name={`solver-day-${subject.id}`} label={t.daily}><Input type="number" min={1} max={10} value={requirements[subject.id]?.daily ?? 1} onChange={event => { setRequirements(previous => ({ ...previous, [subject.id]: { weekly: previous[subject.id]?.weekly ?? 0, daily: Number(event.target.value) } })); invalidate(); }} /></FormField></div></div>)}
      </fieldset>
      <Button variant="outline" disabled={disabled || busy} onClick={() => void solve()}><Sparkles aria-hidden="true" />{busy ? c.loading : t.solve}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {suggestion && <div role="status" className="space-y-3"><p className="font-semibold">{suggestion.status === "SOLVED" ? t.solved : suggestion.status === "SEARCH_LIMIT" ? t.limit : t.none}</p>{suggestion.excludedRoomIds.length > 0 && <p className="text-sm">{t.excluded}: {suggestion.excludedRoomIds.map(id => options.rooms.find(room => room.id === id)?.roomNumber).join(", ")}</p>}
        {suggestion.proposal && <><ul className="space-y-2 text-sm">{suggestion.proposal.slots.map(slot => <li key={slot.id} className="rounded-lg border border-border-subtle p-3">{setup.days[slot.dayOfWeek - 1]} · <bdi>{slot.startTime}–{slot.endTime}</bdi> · {subjects.find(subject => subject.id === slot.subjectId)?.name} · {options.teachers.find(teacher => teacher.id === slot.teacherId)?.fullName} · {options.rooms.find(room => room.id === slot.roomId)?.roomNumber}</li>)}</ul><label className="flex min-h-11 items-start gap-3 text-sm"><Checkbox checked={confirmed} className="mt-1" disabled={disabled} onChange={event => setConfirmed(event.target.checked)} /><span>{t.confirm}</span></label><Button disabled={disabled || !confirmed} onClick={() => { onUse(suggestion.proposal!.slots); invalidate(); }}>{t.use}</Button></>}
      </div>}
    </div>
  </details>;
}
