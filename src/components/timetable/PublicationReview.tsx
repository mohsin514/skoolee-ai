"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-403: review before publishing. Shows the hard conflicts that block publication (each with the other
// booking it collides with), soft warnings, the lessons that change against the latest published version
// and who will be told. Publishing names the exact draft revision reviewed and a date it takes effect;
// families keep seeing the version in force until then.

type Ui = ReturnType<typeof useUiText>;
type Conflict = { identity?: string; type: string; severity: "CRITICAL" | "WARNING"; message: string; dayOfWeek: number; periodNumber: number; teacherName?: string; roomNumber?: string; otherClass?: string; otherTime?: string; otherCampus?: string; time?: string };
// Values are bidi-isolated so Latin names and clock times keep their order inside Arabic and Urdu sentences.
const iso = (value: string) => `\u2068${value}\u2069`;
/** A localized sentence for a clash with another booking; other conflicts fall back to the server text. */
const describe = (ui: Ui, c: Conflict) => {
  const where = c.otherCampus ? ui("{0} at {1}", [iso(c.otherClass ?? ""), iso(c.otherCampus)]) : iso(c.otherClass ?? "");
  if (c.type === "TEACHER_DOUBLE_BOOKED" && c.otherClass && c.otherTime && c.time) return ui("{0} already teaches {1} at {2}, overlapping this lesson at {3}.", [iso(c.teacherName ?? ui("This teacher")), where, iso(c.otherTime), iso(c.time)]);
  if (c.type === "ROOM_DOUBLE_BOOKED" && c.otherClass && c.otherTime && c.time) return ui("Room {0} is booked for {1} at {2}, overlapping this lesson at {3}.", [iso(c.roomNumber ?? ""), where, iso(c.otherTime), iso(c.time)]);
  return ui(c.message);
};
type Snap = { subjectName: string | null; teacherName: string | null; roomNumber: string | null; startTime: string; endTime: string; slotType: string } | null;
type Change = { slotId: string; dayOfWeek: number; periodNumber: number; before: Snap; after: Snap };
type Version = { version: number; effectiveFrom: string } | null;
type Preview = { draftRevision: number; status: string; today: string; inForce: Version; upcoming: Version; latest: Version; unpublishedChanges: boolean; validation: { conflicts: Conflict[]; counts: { critical: number; warning: number } }; changes: Change[]; affected: { teachers: { id: string; fullName: string }[]; students: number } };

export const dayName = (ui: Ui, day: number) => [ui("Monday"), ui("Tuesday"), ui("Wednesday"), ui("Thursday"), ui("Friday"), ui("Saturday"), ui("Sunday")][day - 1] ?? String(day);
const lesson = (ui: Ui, slot: Snap) => !slot ? ui("Nothing") : slot.slotType !== "CLASS" ? ui("Break or activity") : [slot.subjectName ?? ui("No subject"), slot.teacherName ?? ui("No teacher"), slot.roomNumber ? ui("Room {0}", [slot.roomNumber]) : ui("No room")].join(" · ");

/** A one-line status: what is being edited and what everyone else sees. */
export function PublicationStatus({ timetableId, refreshKey }: { timetableId: string; refreshKey: unknown }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [data, setData] = useState<Preview | null>(null);
  useEffect(() => { let live = true; fetch(`/api/timetable/${timetableId}?publication=1`, { cache: "no-store" }).then(r => r.json()).then(json => { if (live && json.success) setData(json.data); }).catch(() => undefined); return () => { live = false; }; }, [timetableId, refreshKey]);
  if (!data) return null;
  return <Badge variant="neutral" size="sm" className="max-w-full whitespace-normal" data-publication-status data-draft-revision={data.draftRevision} data-in-force={data.inForce?.version ?? ""}>
    {ui("Draft revision {0}", [String(data.draftRevision)])} · {data.inForce ? ui("everyone sees version {0} (from {1})", [String(data.inForce.version), date(data.inForce.effectiveFrom)]) : ui("not published yet")}
    {data.upcoming ? <> · {ui("version {0} from {1}", [String(data.upcoming.version), date(data.upcoming.effectiveFrom)])}</> : null}
    {data.inForce && data.unpublishedChanges ? <> · {ui("unpublished changes")}</> : null}
  </Badge>;
}

export function PublicationReview({ timetableId, className, onClose, onPublished }: { timetableId: string; className: string; onClose: () => void; onPublished: () => void }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [data, setData] = useState<Preview | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(""), [note, setNote] = useState("");
  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/timetable/${timetableId}?publication=1`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) { setError(ui(json.error || "The publication review could not be loaded.")); return; }
    setData(json.data); setEffectiveFrom(current => current || json.data.today);
  }, [timetableId, ui]);
  useEffect(() => { void load(); }, [load]);
  const hard = data?.validation.conflicts.filter(c => c.severity === "CRITICAL") ?? [], soft = data?.validation.conflicts.filter(c => c.severity === "WARNING") ?? [];
  const publish = async () => {
    if (!data) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/timetable/${timetableId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", draftRevision: data.draftRevision, effectiveFrom, note: note.trim() || undefined }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) { setError(ui(json.error || "The timetable was not published.")); if (response.status === 409) await load(); return; }
      toast.success(ui("Version {0} published from {1}.", [String(json.version.version), date(json.version.effectiveFrom)]));
      onPublished();
    } finally { setBusy(false); }
  };
  return <ModalFrame title={ui("Review and publish")} eyebrow={ui("Timetable")} subtitle={className} onClose={onClose} wide>
    <div className="space-y-4" data-publication-review>
      {error ? <div data-publication-error><Alert tone="danger" compact live="assertive">{error}</Alert></div> : null}
      {!data ? <p className="text-sm text-ink-muted">{ui("Checking actual times, rooms and teachers…")}</p> : <>
        <p className="text-sm" data-publication-current>{data.inForce ? ui("Everyone sees version {0}, in force from {1}. Publishing creates version {2}.", [String(data.inForce.version), date(data.inForce.effectiveFrom), String((data.latest?.version ?? 0) + 1)]) : ui("Nothing is published yet. Publishing creates version {0}.", [String((data.latest?.version ?? 0) + 1)])}</p>
        <section data-publication-hard={hard.length}>
          <h4 className="text-sm font-bold">{hard.length ? ui("Hard conflicts that prevent publication: {0}", [String(hard.length)]) : ui("No hard conflicts")}</h4>
          <ul className="mt-1 space-y-1 text-sm">{hard.map((c, i) => <li key={c.identity ?? i} className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800" data-hard-conflict={c.type}><bdi>{dayName(ui, c.dayOfWeek)}</bdi> · {describe(ui, c)}</li>)}</ul>
        </section>
        {soft.length ? <section data-publication-soft={soft.length}><h4 className="text-sm font-bold">{ui("Warnings that do not block: {0}", [String(soft.length)])}</h4><ul className="mt-1 space-y-1 text-xs text-amber-900">{soft.slice(0, 12).map((c, i) => <li key={i}><bdi>{dayName(ui, c.dayOfWeek)}</bdi> · {describe(ui, c)}</li>)}</ul></section> : null}
        <section data-publication-changes={data.changes.length}>
          <h4 className="text-sm font-bold">{ui("Lessons that change: {0}", [String(data.changes.length)])}</h4>
          <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-xs">{data.changes.slice(0, 60).map(change => <li key={change.slotId}><bdi>{dayName(ui, change.dayOfWeek)}</bdi> <bdi>{change.after?.startTime ?? change.before?.startTime}</bdi>: {lesson(ui, change.before)} → {lesson(ui, change.after)}</li>)}</ul>
        </section>
        <p className="text-sm" data-publication-affected>{ui("Will be told — teachers: {0}; pupils and their families: {1}.", [String(data.affected.teachers.length), String(data.affected.students)])}{data.affected.teachers.length ? <> (<bdi>{data.affected.teachers.map(t => t.fullName).join(", ")}</bdi>)</> : null}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="publication-effective" label={ui("Takes effect from")}><Input type="date" value={effectiveFrom} min={data.today} onChange={event => setEffectiveFrom(event.target.value)} /></FormField>
          <FormField name="publication-note" label={ui("Note (optional)")}><Textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{ui("Cancel")}</Button>
          <Button disabled={busy || hard.length > 0 || !effectiveFrom} onClick={() => void publish()} data-confirm-publish>{ui("Publish version {0}", [String((data.latest?.version ?? 0) + 1)])}</Button>
        </div>
      </>}
    </div>
  </ModalFrame>;
}
