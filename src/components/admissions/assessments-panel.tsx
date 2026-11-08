"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { CalendarClock, CalendarPlus, ClipboardCheck, MapPinned, MessagesSquare, School } from "lucide-react";
import { DeskPill, DeskRowIcon, RelativeTime, deskRow, type DeskTone } from "@/components/ui/desk";
import { cn } from "@/lib/utils";

// SKAI-1142: interviews, entrance assessments, tours and taster days on an application. Booking and recording
// the outcome are front-desk work (admissions.edit); the recommendation informs the campus admin's decision.

type Ui = ReturnType<typeof useUiText>;
export type Assessment = { id: string; kind: string; scheduledAt: string; durationMin: number; location: string | null; status: string; recommendation: string | null; score: number | null; outcomeNote: string | null; staff: { id: string; fullName: string } | null };
type Person = { id: string; fullName: string };
type Run = (body: Record<string, unknown>, message: string) => Promise<void>;

export const kindLabel = (ui: Ui, kind: string) => ({ INTERVIEW: ui("Interview"), ASSESSMENT: ui("Entrance assessment"), TOUR: ui("School tour"), TASTER_DAY: ui("Taster day") } as Record<string, string>)[kind] ?? kind;
const recommendationLabel = (ui: Ui, value: string) => ({ RECOMMEND: ui("Recommend"), CONSIDER: ui("Consider"), NOT_RECOMMENDED: ui("Not recommended") } as Record<string, string>)[value] ?? value;
const statusTone = (value: string): DeskTone => ({ SCHEDULED: "info", COMPLETED: "success", NO_SHOW: "warning", CANCELLED: "neutral" } as Record<string, DeskTone>)[value] ?? "neutral";
const recommendationTone = (value: string): DeskTone => ({ RECOMMEND: "success", CONSIDER: "warning", NOT_RECOMMENDED: "danger" } as Record<string, DeskTone>)[value] ?? "neutral";
const kindIcon = (kind: string) => ({ INTERVIEW: MessagesSquare, ASSESSMENT: ClipboardCheck, TOUR: MapPinned, TASTER_DAY: School } as Record<string, typeof School>)[kind] ?? CalendarClock;
const statusText = (ui: Ui, value: string) => ({ SCHEDULED: ui("Booked"), COMPLETED: ui("Completed"), NO_SHOW: ui("Did not attend"), CANCELLED: ui("Cancelled") } as Record<string, string>)[value] ?? value;

export function AssessmentsPanel({ assessments, staff, canBook, busy, officeNote, run }: { assessments: Assessment[]; staff: Person[]; canBook: boolean; busy: boolean; officeNote: string; run: Run }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [kind, setKind] = useState("INTERVIEW"), [when, setWhen] = useState(""), [duration, setDuration] = useState("30"), [location, setLocation] = useState(""), [staffId, setStaffId] = useState("");
  const [recording, setRecording] = useState(""), [recommendation, setRecommendation] = useState("RECOMMEND"), [score, setScore] = useState(""), [outcome, setOutcome] = useState("");
  const book = () => run({ action: "schedule-assessment", kind, scheduledAt: new Date(when).toISOString(), durationMin: Number(duration), location: location || undefined, staffId: staffId || undefined, officeNote: officeNote || undefined }, ui("Booked.")).then(() => { setWhen(""); setLocation(""); });
  const record = (id: string, attended: boolean) => run({ action: "record-assessment", assessmentId: id, attended, recommendation: attended ? recommendation : undefined, score: attended && score ? Number(score) : undefined, outcomeNote: outcome || undefined }, ui("Outcome saved.")).then(() => { setRecording(""); setScore(""); setOutcome(""); });

  return <section className="sk-desk-section gap-2 text-sm" aria-label={ui("Interviews and assessments")} data-assessments>
    <p className="sk-eyebrow">{ui("Interviews and assessments")}</p>
    {assessments.length ? <ul className="space-y-2">{assessments.map(item => <li key={item.id} data-tone={item.status === "CANCELLED" ? "muted" : item.status === "NO_SHOW" ? "warning" : undefined} className={cn(deskRow, "space-y-1")} data-assessment={item.kind} data-assessment-status={item.status}>
      <p className="flex flex-wrap items-center gap-2 font-bold text-ink-strong"><DeskRowIcon icon={kindIcon(item.kind)} className="size-8" />{kindLabel(ui, item.kind)} · <bdi>{item.status === "SCHEDULED" ? <RelativeTime iso={item.scheduledAt} full={dateTime(item.scheduledAt)} /> : dateTime(item.scheduledAt)}</bdi> · {ui("{0} min", [item.durationMin])} <DeskPill tone={statusTone(item.status)}>{statusText(ui, item.status)}</DeskPill></p>
      <p className="text-xs text-ink-muted">{item.staff ? <>{ui("With")} <bdi>{item.staff.fullName}</bdi></> : ui("No staff member set")}{item.location ? <> · <bdi>{item.location}</bdi></> : null}</p>
      {item.recommendation ? <p className="text-xs" data-recommendation={item.recommendation}><DeskPill tone={recommendationTone(item.recommendation)}>{recommendationLabel(ui, item.recommendation)}</DeskPill>{item.score !== null ? <> · {ui("Score {0}/100", [item.score])}</> : null}{item.outcomeNote ? <> · <bdi>{item.outcomeNote}</bdi></> : null}</p> : null}
      {item.status === "SCHEDULED" && recording !== item.id ? <div className="mt-1 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRecording(item.id)}>{ui("Record outcome")}</Button>
        <Button size="sm" variant="ghost" disabled={busy || officeNote.trim().length < 2} onClick={() => void run({ action: "cancel-assessment", assessmentId: item.id, officeNote }, ui("Booking cancelled."))}>{ui("Cancel (needs office note)")}</Button>
      </div> : null}
      {recording === item.id ? <div className="mt-2 grid items-end gap-2 sm:grid-cols-3" data-record-form>
        <FormField name="assessment-recommendation" label={ui("Recommendation")}><Select value={recommendation} onChange={event => setRecommendation(event.target.value)}>{["RECOMMEND", "CONSIDER", "NOT_RECOMMENDED"].map(value => <option key={value} value={value}>{recommendationLabel(ui, value)}</option>)}</Select></FormField>
        <FormField name="assessment-score" label={ui("Score (0–100, optional)")}><Input type="number" min={0} max={100} dir="ltr" value={score} onChange={event => setScore(event.target.value)} /></FormField>
        <FormField name="assessment-outcome" label={ui("Outcome note")}><Input value={outcome} maxLength={2000} onChange={event => setOutcome(event.target.value)} /></FormField>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button size="sm" disabled={busy} onClick={() => void record(item.id, true)}>{ui("Save outcome")}</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void record(item.id, false)}>{ui("Did not attend")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRecording("")}>{ui("Back")}</Button>
        </div>
      </div> : null}
    </li>)}</ul> : <p className="flex items-center gap-2 rounded-xl border border-dashed border-border-subtle px-3 py-2.5 text-xs text-ink-muted"><CalendarPlus aria-hidden="true" className="size-4 text-ink-faint" />{ui("Nothing booked yet.")}</p>}
    {canBook ? <div className="grid items-end gap-2 rounded-xl bg-surface-subtle p-3 sm:grid-cols-3" data-book-form>
      <FormField name="assessment-kind" label={ui("Type")}><Select value={kind} onChange={event => setKind(event.target.value)}>{["INTERVIEW", "ASSESSMENT", "TOUR", "TASTER_DAY"].map(value => <option key={value} value={value}>{kindLabel(ui, value)}</option>)}</Select></FormField>
      <FormField name="assessment-when" label={ui("Date and time")}><Input type="datetime-local" value={when} onChange={event => setWhen(event.target.value)} /></FormField>
      <FormField name="assessment-duration" label={ui("Minutes")}><Input type="number" min={5} max={480} dir="ltr" value={duration} onChange={event => setDuration(event.target.value)} /></FormField>
      <FormField name="assessment-staff" label={ui("Run by")}><Select value={staffId} onChange={event => setStaffId(event.target.value)}><option value="">{ui("Not set")}</option>{staff.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
      <FormField name="assessment-location" label={ui("Room or link")}><Input value={location} maxLength={200} onChange={event => setLocation(event.target.value)} /></FormField>
      <Button variant="secondary" disabled={busy || !when} onClick={() => void book()}>{ui("Book")}</Button>
    </div> : null}
  </section>;
}
