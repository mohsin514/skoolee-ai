"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, UserCheck } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable, SkeletonList } from "@/components/ui/skeleton";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-399: workload for a named week (definition shown), and absence cover with each candidate's reasons.
// Choosing a candidate creates a proposal for the existing reviewed substitution workflow; no timetable
// changes until that proposal is approved and executed there, with availability rechecked.

type Row = { id: string; name: string; rank: string | null; department: string | null; teaching: number; coverDuties: number; invigilations: number; leaveDays: number; capacity: number | null; load: number; percent: number | null; overCapacity: boolean };
type Candidate = { id: string; name: string; eligible: boolean; reasons: string[]; conflicts: string[]; warnings: string[] };
type Lesson = { slotId: string; startTime: string; endTime: string; period: number; className: string; subject: string | null; absentTeacher: string | null; candidates: Candidate[] };
const monday = (date = new Date()) => { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const todayText = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };

export function WorkloadCover({ campusId }: { campusId?: string }) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const scope = campusId ? `campusId=${encodeURIComponent(campusId)}&` : "";
  const [week, setWeek] = useState(monday()), [rows, setRows] = useState<Row[] | null>(null), [definition, setDefinition] = useState(""), [weekError, setWeekError] = useState("");
  const [day, setDay] = useState(todayText()), [lessons, setLessons] = useState<Lesson[] | null>(null), [scopeNote, setScopeNote] = useState(""), [coverError, setCoverError] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [proposal, setProposal] = useState<{ duties: number } | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const loadWeek = useCallback(async () => {
    setWeekError("");
    const response = await fetch(`/api/staff/workload?${scope}weekStart=${week}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (!response?.ok || !json?.success) { setWeekError(ui(json?.error || "Workload could not be loaded.")); return; }
    setRows(json.data.rows); setDefinition(json.data.definition);
  }, [scope, week, ui]);
  const loadCover = useCallback(async () => {
    setCoverError(""); setProposal(null);
    const response = await fetch(`/api/staff/cover?${scope}date=${day}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (!response?.ok || !json?.success) { setCoverError(ui(json?.error || "Cover could not be loaded.")); return; }
    setLessons(json.data.lessons); setScopeNote(json.data.scopeNote); setChoice({});
  }, [scope, day, ui]);
  useEffect(() => { const timer = setTimeout(() => void loadWeek(), 0); return () => clearTimeout(timer); }, [loadWeek]);
  useEffect(() => { const timer = setTimeout(() => void loadCover(), 0); return () => clearTimeout(timer); }, [loadCover]);

  const saveCapacity = async (row: Row, raw: string) => {
    const capacity = raw.trim() === "" ? null : Number(raw);
    const response = await fetch("/api/staff/workload", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campusId, staffId: row.id, capacity }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) { toast.error(ui(json.error || "Capacity was not saved.")); return; }
    toast.success(ui("Capacity saved for {0}.", [row.name])); void loadWeek(); void loadCover();
  };
  const propose = async () => {
    const duties = Object.entries(choice).filter(([, teacherId]) => teacherId).map(([slotId, teacherId]) => ({ slotId, teacherId }));
    if (!duties.length) { setCoverError(ui("Choose a cover teacher for at least one lesson.")); return; }
    const fingerprint = JSON.stringify({ day, duties });
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setCoverError("");
    try {
      const response = await fetch("/api/staff/cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campusId, date: day, duties, idempotencyKey: attempt.current.key }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) { const message: string = typeof json.error === "string" ? json.error : "The proposal was not created."; setCoverError(ui(message)); return; }
      setProposal({ duties: json.data.duties }); attempt.current = null;
    } catch { setCoverError(ui("The connection failed. Retrying will not create a second proposal.")); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6" data-workload-cover>
    <section className="sk-panel space-y-3 p-5" aria-labelledby="workload-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 id="workload-title" className="flex items-center gap-2 text-base font-semibold text-ink-strong"><CalendarClock className="size-4 text-primary" aria-hidden />{ui("Teaching workload")}</h3>
        <FormField name="workload-week" label={ui("Week starting")}><Input type="date" value={week} onChange={event => setWeek(event.target.value)} /></FormField>
      </div>
      <p className="text-xs text-ink-muted" data-workload-definition>{ui(definition)}</p>
      <p className="text-xs font-medium text-ink-muted">{ui("Rank and appointments do not change what anyone can access; permissions are managed separately.")}</p>
      {weekError ? <ErrorState variant="panel" description={weekError} onRetry={() => void loadWeek()} retryLabel={ui("Retry")} />
        : !rows ? <div role="status" aria-label={ui("Loading workload…")}><SkeletonTable /></div>
        : !rows.length ? <EmptyState size="sm" icon={CalendarClock} title={ui("No teachers in this campus yet.")} />
        : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs" data-workload-table>
          <caption className="sr-only">{ui("Teaching workload")}</caption>
          <thead><tr className="text-ink-subtle">{["Teacher", "Teaching periods", "Cover duties", "Invigilation", "Leave days", "Capacity", "Load"].map(head => <th key={head} scope="col" className="px-2 py-1.5 text-start">{ui(head)}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id} className="border-t border-border" data-workload-row={row.id} data-over={row.overCapacity}>
            <th scope="row" className="px-2 py-1.5 text-start font-bold"><bdi>{row.name}</bdi>{row.rank ? <span className="block font-normal text-ink-muted"><bdi>{row.rank}</bdi>{row.department ? <> · <bdi>{row.department}</bdi></> : null}</span> : null}</th>
            <td className="px-2 tabular-nums">{row.teaching}</td><td className="px-2 tabular-nums">{row.coverDuties}</td><td className="px-2 tabular-nums">{row.invigilations}</td><td className="px-2 tabular-nums">{row.leaveDays}</td>
            <td className="px-2"><Input aria-label={ui("Contracted periods per week for {0}", [row.name])} className="h-8 w-28" type="number" min={0} max={80} defaultValue={row.capacity ?? ""} placeholder={ui("Unknown")} onBlur={event => { if (event.target.value !== String(row.capacity ?? "")) void saveCapacity(row, event.target.value); }} /></td>
            <td className={`px-2 font-semibold tabular-nums ${row.overCapacity ? "text-rose-700" : ""}`}>{row.percent === null ? ui("{0} periods (capacity unknown)", [row.load]) : ui("{0} of {1} ({2}%)", [row.load, row.capacity!, row.percent])}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="sk-panel space-y-3 p-5" aria-labelledby="cover-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 id="cover-title" className="flex items-center gap-2 text-base font-semibold text-ink-strong"><UserCheck className="size-4 text-primary" aria-hidden />{ui("Absence cover")}</h3>
        <FormField name="cover-date" label={ui("Date")}><Input type="date" value={day} onChange={event => setDay(event.target.value)} /></FormField>
      </div>
      <p className="text-xs text-ink-muted">{ui(scopeNote)} {ui("A free period alone is not availability: leave, cover, invigilation and capacity are checked, and again at approval.")}</p>
      {coverError ? <div data-cover-error><Alert tone="danger" compact live="polite">{coverError}</Alert></div> : null}
      {proposal ? <div role="status" className="rounded-xl border border-status-success-border bg-status-success-surface px-3 py-2 text-xs font-medium text-status-success-text" data-cover-proposal>{ui("Cover proposal for {0} lesson(s) submitted for approval. Nothing changes in the timetable until it is approved in the School AI workspace.", [proposal.duties])} <Link className="sk-link font-semibold" href="/ai">{ui("Open the workspace")}</Link></div> : null}
      {!lessons ? <div role="status" aria-label={ui("Loading cover…")}><SkeletonList /></div>
        : !lessons.length ? <div data-cover-empty><EmptyState size="sm" icon={UserCheck} title={ui("No staffing gaps on {0}.", [formatDate(day)])} /></div>
        : <ul className="space-y-3">{lessons.map(lesson => <li key={lesson.slotId} className="space-y-2 rounded-2xl border border-edge bg-surface-subtle/40 p-3" data-cover-lesson={lesson.slotId}>
          <p className="text-sm font-semibold text-ink-strong"><bdi>{lesson.className}</bdi> · <bdi>{lesson.subject ?? ""}</bdi> · {lesson.startTime}–{lesson.endTime}</p>
          <p className="text-xs text-ink-muted">{ui("{0} is on approved leave; no cover is assigned.", [lesson.absentTeacher ?? ""])}</p>
          <fieldset className="space-y-1.5"><legend className="text-xs font-semibold">{ui("Candidates")}</legend>
            {lesson.candidates.map(candidate => <label key={candidate.id} className={`flex items-start gap-2 rounded-xl px-2 py-1.5 text-xs ${candidate.eligible ? "" : "opacity-70"}`} data-candidate={candidate.id} data-eligible={candidate.eligible}>
              <input type="radio" name={`cover-${lesson.slotId}`} disabled={!candidate.eligible} checked={choice[lesson.slotId] === candidate.id} onChange={() => setChoice(prev => ({ ...prev, [lesson.slotId]: candidate.id }))} />
              <span className="min-w-0"><span className="font-semibold"><bdi>{candidate.name}</bdi></span>
                {candidate.reasons.map(reason => <span key={reason} className="ms-1 text-emerald-700">· {ui(reason)}</span>)}
                {candidate.conflicts.map(reason => <span key={reason} className="ms-1 text-rose-700">· {ui(reason)}</span>)}
                {candidate.warnings.map(reason => <span key={reason} className="ms-1 text-amber-800">· {ui(reason)}</span>)}</span>
            </label>)}
          </fieldset>
        </li>)}</ul>}
      {lessons?.length ? <Button onClick={() => void propose()} disabled={busy} loading={busy}>{ui("Submit cover proposal")}</Button> : null}
    </section>
  </div>;
}
