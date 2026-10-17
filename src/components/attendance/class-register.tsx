"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame } from "@/components/shared-admin";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { cn } from "@/lib/utils";

// SKO-405: the class register. Unmarked is shown as its own state and nothing is assumed from it;
// "Mark unmarked present" fills only the pupils nobody has marked. Submitting goes through a review of the
// counts, and is refused while anyone is unmarked. A submitted register changes only with a reason. If
// someone else changed a pupil after this register was loaded, the save returns those pupils for review
// instead of overwriting them.

type Ui = ReturnType<typeof useUiText>;
export type Status = "PRESENT" | "LATE" | "PARTIAL" | "ABSENT" | "EXCUSED" | "LEAVE";
const STATUSES: Status[] = ["PRESENT", "LATE", "PARTIAL", "ABSENT", "EXCUSED", "LEAVE"];
type Entry = { studentId: string; name: string; rollNo: string; movedSince: boolean; status: Status | null; arrivalTime: string | null; departureTime: string | null; note: string | null; version: number; markedBy: string | null; openExplanation: string | null };
type Register = { class: { id: string; name: string }; date: string; today: string; register: { status: "OPEN" | "SUBMITTED"; submittedAt: string | null }; entries: Entry[]; rule: { version: number } };
type Draft = { status: Status | null; arrivalTime: string; departureTime: string };
type Conflict = { studentId: string; name: string; current: string | null; yours: string; seen: string | null; markedBy: string | null };

export const statusLabel = (ui: Ui, status: string | null) => status ? ({ PRESENT: ui("Present"), LATE: ui("Late"), PARTIAL: ui("Part day"), ABSENT: ui("Absent"), EXCUSED: ui("Excused absence"), LEAVE: ui("Leave"), UNMARKED: ui("Unmarked") } as Record<string, string>)[status] ?? status : ui("Unmarked");
const tone: Record<Status, string> = { PRESENT: "aria-checked:bg-emerald-50 aria-checked:text-emerald-700 aria-checked:border-emerald-300", LATE: "aria-checked:bg-amber-50 aria-checked:text-amber-700 aria-checked:border-amber-300", PARTIAL: "aria-checked:bg-sky-50 aria-checked:text-sky-700 aria-checked:border-sky-300", ABSENT: "aria-checked:bg-rose-50 aria-checked:text-rose-700 aria-checked:border-rose-300", EXCUSED: "aria-checked:bg-violet-50 aria-checked:text-violet-700 aria-checked:border-violet-300", LEAVE: "aria-checked:bg-amber-50 aria-checked:text-amber-800 aria-checked:border-amber-300" };

export function ClassRegister({ classes, initialClassId }: { classes: { id: string; label: string }[]; initialClassId?: string }) {
  const ui = useUiText();
  const locale = useLocale();
  const { date: formatDate } = useLocaleFormat();
  const [classId, setClassId] = useState(initialClassId || classes[0]?.id || "");
  const [date, setDate] = useState("");
  const [data, setData] = useState<Register | null>(null), [loadError, setLoadError] = useState(""), [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reviewOpen, setReviewOpen] = useState(false), [conflicts, setConflicts] = useState<Conflict[]>([]), [saving, setSaving] = useState(false);

  useEffect(() => { if (!classId && classes[0]) setClassId(classes[0].id); }, [classes, classId]);
  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true); setLoadError("");
    try {
      const params = new URLSearchParams({ classId }); if (date) params.set("date", date);
      const response = await fetch(`/api/attendance/register?${params}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The register could not be loaded.");
      setData(json.data); if (!date) setDate(json.data.date);
      setDrafts(Object.fromEntries((json.data.entries as Entry[]).map(entry => [entry.studentId, { status: entry.status, arrivalTime: entry.arrivalTime ?? "", departureTime: entry.departureTime ?? "" }])));
    } catch (failure) { setLoadError(ui(failure instanceof Error ? failure.message : "The register could not be loaded.")); } finally { setLoading(false); }
  }, [classId, date, ui]);
  useEffect(() => { void load(); }, [load]);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const changed = entries.filter(entry => { const d = drafts[entry.studentId]; return d && (d.status !== entry.status || (d.arrivalTime || null) !== entry.arrivalTime || (d.departureTime || null) !== entry.departureTime); });
  const counts = useMemo(() => { const out: Record<string, number> = { UNMARKED: 0 }; for (const entry of entries) { const key = drafts[entry.studentId]?.status ?? "UNMARKED"; out[key] = (out[key] ?? 0) + 1; } return out; }, [entries, drafts]);
  const submitted = data?.register.status === "SUBMITTED";
  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts(current => ({ ...current, [id]: { ...current[id], ...patch } }));
  const fillPresent = () => setDrafts(current => Object.fromEntries(Object.entries(current).map(([id, d]) => [id, d.status ? d : { ...d, status: "PRESENT" }])));
  const missingTime = changed.find(entry => { const d = drafts[entry.studentId]; return d.status === "LATE" && !d.arrivalTime || d.status === "PARTIAL" && !d.arrivalTime && !d.departureTime; });

  const save = async (options: { submit: boolean; reason?: string; reviewed?: Set<string> }) => {
    if (!data) return;
    setSaving(true);
    try {
      const rows = (options.reviewed ? entries.filter(entry => options.reviewed!.has(entry.studentId)) : changed).filter(entry => drafts[entry.studentId]?.status);
      const response = await fetch("/api/attendance/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId: data.class.id, date: data.date, submit: options.submit, reason: options.reason || undefined, entries: rows.map(entry => { const d = drafts[entry.studentId]; return { studentId: entry.studentId, status: d.status, knownStatus: entry.status, arrivalTime: d.arrivalTime || null, departureTime: d.departureTime || null, reviewedConflict: options.reviewed?.has(entry.studentId) || undefined }; }) }) });
      const json = await response.json().catch(() => ({}));
      if (response.status === 409 && json.data?.conflicts?.length) { setConflicts(json.data.conflicts); setReviewOpen(false); return; }
      if (!response.ok || !json.success) throw new Error(json.error || "The register was not saved.");
      setReviewOpen(false); setConflicts([]);
      if (options.submit && json.data.unmarked.length) toast.error(ui("{0} pupils are still unmarked.", [String(json.data.unmarked.length)]));
      else toast.success(json.data.submitted && options.submit ? ui("Register submitted") : ui("Register saved"));
      await load();
    } catch (failure) { toast.error(ui(failure instanceof Error ? failure.message : "The register was not saved.")); } finally { setSaving(false); }
  };

  return <div className="sk-panel space-y-4 p-5" data-class-register data-register-status={data?.register.status ?? ""}>
    <div className="flex flex-wrap items-end gap-3">
      <FormField name="register-class" label={ui("Class")}><Select value={classId} onChange={event => { setClassId(event.target.value); setData(null); }} className="min-w-[220px]">{classes.map(cls => <option key={cls.id} value={cls.id}>{cls.label}</option>)}</Select></FormField>
      <FormField name="register-date" label={ui("Date")}><Input type="date" value={date} max={data?.today} onChange={event => setDate(event.target.value)} /></FormField>
      {data ? <span className={cn("rounded-full px-3 py-1 text-xs font-bold", submitted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")} data-register-state>{submitted ? ui("Submitted") : ui("Not submitted")}</span> : null}
    </div>
    {loadError ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{loadError}</p> : null}
    {loading && !data ? <p className="text-sm text-ink-muted">{ui("Loading register…")}</p> : null}
    {data ? <>
      <div className="flex flex-wrap gap-2 text-xs font-bold" data-register-counts>
        {["UNMARKED", ...STATUSES].map(key => <span key={key} className={cn("rounded-full border px-3 py-1", key === "UNMARKED" && counts.UNMARKED ? "border-amber-300 bg-amber-50 text-amber-800" : "border-[#cfc2d6]/30")} data-count={key}>{statusLabel(ui, key)}: <bdi>{counts[key] ?? 0}</bdi></span>)}
      </div>
      {entries.length === 0 ? <p className="text-sm text-ink-muted">{ui("No pupils were enrolled in this class on that day.")}</p> : <ul className="divide-y divide-[#cfc2d6]/20" data-register-rows>
        {entries.map(entry => { const d = drafts[entry.studentId] ?? { status: null, arrivalTime: "", departureTime: "" }; return <li key={entry.studentId} className="flex flex-wrap items-center gap-3 py-2" data-register-row={entry.studentId} data-status={d.status ?? "UNMARKED"}>
          <div className="min-w-[180px] flex-1"><p className="text-sm font-bold"><bdi>{entry.name}</bdi></p><p className="text-xs text-ink-muted">{ui("Roll {0}", [entry.rollNo])}{entry.movedSince ? <> · {ui("Moved to another class since")}</> : null}{entry.openExplanation ? <> · {ui("Explanation waiting")}</> : null}</p></div>
          <div role="radiogroup" aria-label={ui("Attendance for {0}", [entry.name])} className="flex flex-wrap gap-1">
            {STATUSES.map(status => <button key={status} type="button" role="radio" aria-checked={d.status === status} onClick={() => setDraft(entry.studentId, { status })} className={cn("rounded-lg border border-[#cfc2d6]/40 px-2 py-1 text-xs font-bold", tone[status])} data-mark={status}>{statusLabel(ui, status)}</button>)}
          </div>
          {d.status === "LATE" || d.status === "PARTIAL" ? <div className="flex gap-2">
            <FormField name={`arrive-${entry.studentId}`} label={ui("Arrived")}><Input type="time" value={d.arrivalTime} onChange={event => setDraft(entry.studentId, { arrivalTime: event.target.value })} className="w-28" /></FormField>
            {d.status === "PARTIAL" ? <FormField name={`depart-${entry.studentId}`} label={ui("Left")}><Input type="time" value={d.departureTime} onChange={event => setDraft(entry.studentId, { departureTime: event.target.value })} className="w-28" /></FormField> : null}
          </div> : null}
        </li>; })}
      </ul>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {missingTime ? <p className="me-auto text-xs font-bold text-rose-700" role="alert">{ui("Add the time for {0}.", [missingTime.name])}</p> : null}
        {!submitted && counts.UNMARKED ? <Button variant="secondary" onClick={fillPresent} data-fill-present>{ui("Mark unmarked present")}</Button> : null}
        {!submitted ? <Button variant="outline" disabled={!changed.length || saving || Boolean(missingTime)} onClick={() => void save({ submit: false })} data-save-register>{ui("Save")}</Button> : null}
        <Button disabled={saving || Boolean(missingTime) || (submitted && !changed.length)} onClick={() => setReviewOpen(true)} data-review-register>{submitted ? ui("Review correction") : ui("Review and submit")}</Button>
      </div>
    </> : null}
    {reviewOpen && data ? <ReviewDialog ui={ui} listNames={names => new Intl.ListFormat(localeTag(locale), { type: "conjunction" }).formatToParts(names).map((part, index) => part.type === "element" ? <bdi key={index}>{part.value}</bdi> : part.value)} submitted={submitted} counts={counts} unmarked={entries.filter(entry => !drafts[entry.studentId]?.status)} changed={changed.map(entry => ({ name: entry.name, from: entry.status, to: drafts[entry.studentId].status }))} className={data.class.name} date={formatDate(data.date)} saving={saving} onClose={() => setReviewOpen(false)} onConfirm={reason => void save({ submit: !submitted, reason })} /> : null}
    {conflicts.length ? <ConflictDialog ui={ui} conflicts={conflicts} saving={saving} onClose={() => { setConflicts([]); void load(); }} onKeepMine={ids => void (async () => { await save({ submit: false, reviewed: new Set(ids), reason: submitted ? ui("Conflicting change reviewed") : undefined }); })()} /> : null}
  </div>;
}

function ReviewDialog({ ui, listNames, submitted, counts, unmarked, changed, className, date, saving, onClose, onConfirm }: { ui: Ui; listNames: (names: string[]) => ReactNode; submitted: boolean; counts: Record<string, number>; unmarked: Entry[]; changed: { name: string; from: string | null; to: string | null }[]; className: string; date: string; saving: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const blocked = !submitted && unmarked.length > 0;
  return <ModalFrame title={submitted ? ui("Correct a submitted register") : ui("Review the register")} eyebrow={ui("Attendance")} subtitle={ui("{0} on {1}", [className, date])} onClose={onClose}>
    <div className="space-y-3" data-register-review>
      <ul className="grid grid-cols-2 gap-1 text-sm">{["UNMARKED", ...STATUSES].map(key => <li key={key} data-review-count={key}>{statusLabel(ui, key)}: <bdi>{counts[key] ?? 0}</bdi></li>)}</ul>
      {blocked ? <div role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" data-review-unmarked><p className="font-bold">{ui("These pupils are unmarked. Mark each one before submitting:")}</p><p>{listNames(unmarked.map(entry => entry.name))}</p></div> : null}
      {submitted ? <>
        <ul className="space-y-1 text-sm" data-review-changes>{changed.map(row => <li key={row.name}><bdi>{row.name}</bdi>: {statusLabel(ui, row.from)} → {statusLabel(ui, row.to)}</li>)}</ul>
        <FormField name="correction-reason" label={ui("Reason for the correction")} hint={ui("Kept with the record's history.")}><Textarea value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField>
      </> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{ui("Back to the register")}</Button>
        <Button disabled={saving || blocked || (submitted && reason.trim().length < 5)} onClick={() => onConfirm(reason.trim())} data-confirm-register>{submitted ? ui("Save correction") : ui("Submit register")}</Button>
      </div>
    </div>
  </ModalFrame>;
}

function ConflictDialog({ ui, conflicts, saving, onClose, onKeepMine }: { ui: Ui; conflicts: Conflict[]; saving: boolean; onClose: () => void; onKeepMine: (ids: string[]) => void }) {
  return <ModalFrame title={ui("Someone else changed these pupils")} eyebrow={ui("Attendance")} subtitle={ui("Your marks for them were not saved. Choose which to keep.")} onClose={onClose}>
    <div className="space-y-3" data-register-conflicts>
      <ul className="space-y-2 text-sm">{conflicts.map(row => <li key={row.studentId} data-conflict={row.studentId}><p className="font-bold"><bdi>{row.name}</bdi></p><p>{ui("Now: {0} (by {1}). Yours: {2}.", [statusLabel(ui, row.current), row.markedBy ?? ui("unknown"), statusLabel(ui, row.yours)])}</p></li>)}</ul>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} data-keep-theirs>{ui("Keep their marks")}</Button>
        <Button disabled={saving} onClick={() => onKeepMine(conflicts.map(row => row.studentId))} data-keep-mine>{ui("Use my marks")}</Button>
      </div>
    </div>
  </ModalFrame>;
}

type QueueData = { unexplainedAbsences: { attendanceId: string; date: string; studentName: string; className: string }[]; explanations: { id: string; status: string; reason: string; proposedStatus: string; arrivalTime: string | null; reviewNote: string | null; date: string; currentStatus: string; version: number; studentName: string; className: string }[]; openRegisters: { id: string; date: string; classId: string }[] };

/** Attendance work waiting for a person. */
export function AttendanceExceptions() {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [data, setData] = useState<QueueData | null>(null), [error, setError] = useState("");
  const [deciding, setDeciding] = useState<{ id: string; action: "accept" | "reject" | "clarify"; version: number } | null>(null), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/attendance/register?queue=1", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) setError(ui(json.error || "Attendance exceptions could not be loaded.")); else setData(json.data);
  }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    try {
      const response = await fetch("/api/attendance/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review: { id: deciding.id, action: deciding.action, note: note.trim() || undefined, knownVersion: deciding.version } }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The decision was not saved.");
      toast.success(ui("Decision recorded")); setDeciding(null); setNote(""); await load();
    } catch (failure) { toast.error(ui(failure instanceof Error ? failure.message : "The decision was not saved.")); } finally { setBusy(false); }
  };
  return <div className="sk-panel space-y-4 p-5" data-attendance-exceptions>
    <h3 className="text-base font-black">{ui("Attendance exceptions")}</h3>
    {error ? <p role="alert" className="text-sm font-bold text-rose-700">{error}</p> : null}
    {data ? <>
      <section data-queue-explanations><h4 className="text-sm font-bold">{ui("Explanations to decide ({0})", [String(data.explanations.length)])}</h4>
        {data.explanations.length ? <ul className="divide-y divide-[#cfc2d6]/20">{data.explanations.map(row => <li key={row.id} className="space-y-1 py-2" data-explanation={row.id} data-explanation-status={row.status}>
          <p className="text-sm"><bdi>{row.studentName}</bdi> · <bdi>{row.className}</bdi> · <bdi>{formatDate(row.date)}</bdi> · {statusLabel(ui, row.currentStatus)}</p>
          <p className="text-sm text-ink-muted">{ui("Family says: {0}", [row.reason])}</p>
          <p className="text-xs">{ui("Asks to record: {0}", [statusLabel(ui, row.proposedStatus)])}{row.arrivalTime ? <> · <bdi>{row.arrivalTime}</bdi></> : null}{row.status === "CLARIFICATION" ? <> · {ui("Waiting for the family to clarify")}</> : null}</p>
          <div className="flex gap-2"><Button size="sm" onClick={() => setDeciding({ id: row.id, action: "accept", version: row.version })} data-accept>{ui("Accept")}</Button><Button size="sm" variant="outline" onClick={() => setDeciding({ id: row.id, action: "clarify", version: row.version })} data-clarify>{ui("Ask for clarification")}</Button><Button size="sm" variant="outline" onClick={() => setDeciding({ id: row.id, action: "reject", version: row.version })} data-reject>{ui("Do not accept")}</Button></div>
        </li>)}</ul> : <p className="text-sm text-ink-muted">{ui("Nothing waiting.")}</p>}
      </section>
      <section data-queue-absences><h4 className="text-sm font-bold">{ui("Absences with no explanation ({0})", [String(data.unexplainedAbsences.length)])}</h4>
        <ul className="text-sm">{data.unexplainedAbsences.map(row => <li key={row.attendanceId} data-unexplained={row.attendanceId}><bdi>{row.studentName}</bdi> · <bdi>{row.className}</bdi> · <bdi>{formatDate(row.date)}</bdi></li>)}</ul>
      </section>
      <section data-queue-open><h4 className="text-sm font-bold">{ui("Registers not submitted ({0})", [String(data.openRegisters.length)])}</h4></section>
    </> : null}
    {deciding ? <ModalFrame title={deciding.action === "accept" ? ui("Accept the explanation") : deciding.action === "reject" ? ui("Do not accept the explanation") : ui("Ask for clarification")} eyebrow={ui("Attendance")} subtitle={deciding.action === "accept" ? ui("The day's mark is corrected and the change is kept in its history.") : ui("The day's mark stays as it is.")} onClose={() => setDeciding(null)}>
      <div className="space-y-3" data-decide-dialog>
        <FormField name="decision-note" label={deciding.action === "accept" ? ui("Note (optional)") : ui("Message to the family")}><Textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></FormField>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDeciding(null)}>{ui("Cancel")}</Button><Button disabled={busy || deciding.action !== "accept" && note.trim().length < 2} onClick={() => void decide()} data-confirm-decision>{ui("Confirm")}</Button></div>
      </div>
    </ModalFrame> : null}
  </div>;
}

type GuardianRow = { attendanceId: string; date: string; status: string; arrivalTime: string | null; explanation: { status: string; reviewNote: string | null; proposedStatus: string } | null; closed?: boolean };

/** A guardian explains a child's absence or late arrival; the school decides. */
export function GuardianAttendanceExplanations({ studentId }: { studentId: string }) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const [rows, setRows] = useState<GuardianRow[] | null>(null), [open, setOpen] = useState<GuardianRow | null>(null);
  const [form, setForm] = useState({ reason: "", proposedStatus: "EXCUSED", arrivalTime: "" }), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/parent/attendance?studentId=${encodeURIComponent(studentId)}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    setRows(response.ok && json.success ? json.data : []);
  }, [studentId]);
  useEffect(() => { void load(); }, [load]);
  const explanationLabel = (status: string) => ({ PENDING: ui("Waiting for the school"), CLARIFICATION: ui("The school asked for more detail"), ACCEPTED: ui("Accepted"), REJECTED: ui("Not accepted") } as Record<string, string>)[status] ?? status;
  const send = async () => {
    if (!open) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/parent/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attendanceId: open.attendanceId, reason: form.reason, proposedStatus: form.proposedStatus, arrivalTime: form.proposedStatus === "LATE" ? form.arrivalTime : undefined }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The explanation was not sent.");
      toast.success(ui("Explanation sent to the school")); setOpen(null); setForm({ reason: "", proposedStatus: "EXCUSED", arrivalTime: "" }); await load();
    } catch (failure) { setError(ui(failure instanceof Error ? failure.message : "The explanation was not sent.")); } finally { setBusy(false); }
  };
  if (!rows || !rows.length) return null;
  return <div className="sk-panel space-y-3 p-5" data-guardian-absences>
    <h3 className="text-base font-black">{ui("Absences and late arrivals")}</h3>
    <ul className="divide-y divide-[#cfc2d6]/20">{rows.map(row => { const canExplain = !row.closed && (!row.explanation || row.explanation.status === "CLARIFICATION" || row.explanation.status === "REJECTED"); return <li key={row.attendanceId} className="flex flex-wrap items-center gap-2 py-2" data-guardian-absence={row.attendanceId}>
      <span className="flex-1 text-sm"><bdi>{formatDate(row.date)}</bdi> · {statusLabel(ui, row.status)}{row.arrivalTime ? <> · <bdi>{row.arrivalTime}</bdi></> : null}</span>
      {row.explanation ? <span className="text-xs font-bold" data-explanation-state={row.explanation.status}>{explanationLabel(row.explanation.status)}{row.explanation.reviewNote ? <>: {row.explanation.reviewNote}</> : null}</span> : null}
      {canExplain ? <Button size="sm" variant="outline" onClick={() => setOpen(row)} data-explain>{ui("Explain")}</Button> : null}
    </li>; })}</ul>
    {open ? <ModalFrame title={ui("Explain this day")} eyebrow={ui("Attendance")} subtitle={ui("The school reviews your explanation before the record changes.")} onClose={() => setOpen(null)}>
      <div className="space-y-3" data-explain-dialog>
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
        <FormField name="explain-kind" label={ui("What happened")}><Select value={form.proposedStatus} onChange={event => setForm({ ...form, proposedStatus: event.target.value })}><option value="EXCUSED">{ui("My child was absent for a reason")}</option><option value="LATE">{ui("My child arrived late")}</option></Select></FormField>
        {form.proposedStatus === "LATE" ? <FormField name="explain-time" label={ui("Arrival time")}><Input type="time" value={form.arrivalTime} onChange={event => setForm({ ...form, arrivalTime: event.target.value })} /></FormField> : null}
        <FormField name="explain-reason" label={ui("Explanation")}><Textarea value={form.reason} maxLength={1000} onChange={event => setForm({ ...form, reason: event.target.value })} /></FormField>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(null)}>{ui("Cancel")}</Button><Button disabled={busy || form.reason.trim().length < 5 || form.proposedStatus === "LATE" && !form.arrivalTime} onClick={() => void send()} data-send-explanation>{ui("Send")}</Button></div>
      </div>
    </ModalFrame> : null}
  </div>;
}

type RuleChoice = "attended" | "excluded" | "against";
const RULE_STATUSES: Status[] = ["LATE", "PARTIAL", "EXCUSED", "LEAVE"];

/** School leaders publish how each status counts towards the attendance rate. Each change is a new version. */
export function AttendanceRulePanel() {
  const ui = useUiText();
  const [rule, setRule] = useState<{ version: number; attended: string[]; excluded: string[] } | null>(null);
  const [choice, setChoice] = useState<Record<string, RuleChoice>>({}), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const json = await fetch("/api/attendance/register?rule=1", { cache: "no-store" }).then(r => r.json()).catch(() => ({}));
    if (json.success) { setRule(json.data); setChoice(Object.fromEntries(RULE_STATUSES.map(status => [status, json.data.attended.includes(status) ? "attended" : json.data.excluded.includes(status) ? "excluded" : "against"]))); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!rule) return null;
  const publish = async () => {
    setBusy(true);
    try {
      const attended = ["PRESENT", ...RULE_STATUSES.filter(status => choice[status] === "attended")], excluded = RULE_STATUSES.filter(status => choice[status] === "excluded");
      const response = await fetch("/api/attendance/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rule: { attended, excluded, note } }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The rule was not published.");
      toast.success(ui("Attendance rule published")); setNote(""); await load();
    } catch (failure) { toast.error(ui(failure instanceof Error ? failure.message : "The rule was not published.")); } finally { setBusy(false); }
  };
  return <div className="sk-panel space-y-3 p-5" data-attendance-rule data-rule-version={rule.version}>
    <h3 className="text-base font-black">{ui("How attendance is counted")}</h3>
    <p className="text-xs text-ink-muted">{rule.version ? ui("Version {0} is in force. Present always counts as attended; absent always counts against.", [String(rule.version)]) : ui("The default rule is in force. Present always counts as attended; absent always counts against.")}</p>
    <ul className="space-y-2">{RULE_STATUSES.map(status => <li key={status} className="flex flex-wrap items-center gap-2 text-sm" data-rule-status={status}>
      <span className="w-32 font-bold">{statusLabel(ui, status)}</span>
      <Select value={choice[status]} onChange={event => setChoice({ ...choice, [status]: event.target.value as RuleChoice })} aria-label={ui("How {0} counts", [statusLabel(ui, status)])}>
        <option value="attended">{ui("Counts as attended")}</option><option value="excluded">{ui("Left out of the rate")}</option><option value="against">{ui("Counts against attendance")}</option>
      </Select>
    </li>)}</ul>
    <FormField name="rule-note" label={ui("Reason for the change")}><Textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></FormField>
    <div className="flex justify-end"><Button disabled={busy || note.trim().length < 5} onClick={() => void publish()} data-publish-rule>{ui("Publish new version")}</Button></div>
  </div>;
}
