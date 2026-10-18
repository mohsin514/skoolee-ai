"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, MessageSquareText, Users } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { downloadCSV } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-461: "Teaching evidence" — bounded to the selected period, published
// results only, every measure with its source, coverage and freshness, absent
// evidence shown as unavailable (never zero), shared class outcomes marked as
// shared. Teachers are listed by name: no ranking, no overall score, and no
// employment decision is made here.

type Measure = { key: string; value: number | null; unit: string; source: string; coverage: string | null; freshness: string | null; unavailable: string | null; shared: boolean; caution: string | null };
type Row = { teacherId: string; fullName: string; subjects: string[]; ledClasses: string[]; measures: Measure[]; notes: number };
type Evidence = { period: { start: string; end: string; source: "ACADEMIC_CYCLE" | "CALENDAR_YEAR"; label: string; academicYear: number }; policy: string[]; teachers: Row[]; self: boolean };
type Note = { id: string; kind: string; body: string; author: string; createdAt: string };

const MEASURE_LABEL: Record<string, string> = { registers: "Registers kept", marksEntry: "Marks entered", subjectResults: "Published results in own subjects", classOutcomes: "Class outcomes (shared)", staffAttendance: "Own attendance recorded" };
const NOTE_LABEL: Record<string, string> = { TEACHER_RESPONSE: "Teacher response", SUPPORT_ACTION: "Support action" };
const PERIOD_SOURCE = { ACADEMIC_CYCLE: "Dates from the campus academic year", CALENDAR_YEAR: "No academic year dates are set; the calendar year is used" } as const;

export function TeacherPerformancePanel({ self = false }: { self?: boolean } = {}) {
  const ui = useUiText();
  const { date, dateTime, number } = useLocaleFormat();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear), [query, setQuery] = useState("");
  const [data, setData] = useState<Evidence | null>(null), [error, setError] = useState<{ message: string; denied: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null), [notes, setNotes] = useState<Note[] | null>(null), [draft, setDraft] = useState(""), [saving, setSaving] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++request.current;
    setError(null);
    const response = await fetch(`/api/teachers/performance?academicYear=${year}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (ticket !== request.current) return;
    if (!response?.ok || !json?.success) { setError({ message: ui(json?.error || "Teaching evidence could not be loaded."), denied: response?.status === 403 }); return; }
    setData(json.data);
  }, [year, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const openNotes = async (teacherId: string) => {
    if (open === teacherId) { setOpen(null); return; }
    setOpen(teacherId); setNotes(null); setDraft("");
    const response = await fetch(`/api/teachers/performance/notes?teacherId=${encodeURIComponent(teacherId)}&academicYear=${year}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    setNotes(response?.ok && json?.success ? json.data : []);
  };
  const saveNote = async (teacherId: string) => {
    setSaving(true);
    try {
      const response = await fetch("/api/teachers/performance/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherId, academicYear: year, body: draft }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) { toast.error(ui(json.error || "The note was not saved.")); return; }
      toast.success(ui("Note saved."));
      setDraft(""); setOpen(null); await openNotes(teacherId); await load();
    } finally { setSaving(false); }
  };

  const visible = useMemo(() => (data?.teachers ?? []).filter(row => !query.trim() || row.fullName.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const exportCsv = () => {
    if (!data) return;
    const header = ["Teacher", "Measure", "Value", "Source", "Coverage", "Freshness", "Unavailable", "Shared", "Caution"];
    downloadCSV(`teaching-evidence-${data.period.start}-to-${data.period.end}.csv`, [header, ...visible.flatMap(row => row.measures.map(m => [row.fullName, MEASURE_LABEL[m.key] ?? m.key, m.value ?? "", m.source, m.coverage ?? "", m.freshness ?? "", m.unavailable ?? "", m.shared ? "yes" : "no", m.caution ?? ""]))]);
  };

  if (error) return <section className="sk-panel space-y-3 p-6" role="alert" data-teaching-evidence data-state={error.denied ? "denied" : "error"}>
    <p className="text-sm font-bold">{error.denied ? ui("You do not have access to teaching evidence for this campus.") : error.message}</p>
    {!error.denied ? <Button variant="secondary" size="sm" onClick={() => void load()}>{ui("Retry")}</Button> : null}
  </section>;

  return <section className="space-y-4" aria-labelledby="evidence-title" data-teaching-evidence data-state={data ? "ready" : "loading"}>
    <div className="sk-panel space-y-3 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="evidence-title" className="flex items-center gap-2 text-lg font-bold"><Users className="size-5 text-primary" aria-hidden />{self ? ui("My teaching evidence") : ui("Teaching evidence")}</h2>
          {data ? <p className="text-xs font-bold text-ink-muted" data-period>{ui("Period: {0} to {1}", [date(data.period.start), date(data.period.end)])} · {ui(PERIOD_SOURCE[data.period.source])}</p> : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField name="evidence-year" label={ui("Academic year")}><Select value={String(year)} onChange={event => setYear(Number(event.target.value))}>{[thisYear, thisYear - 1, thisYear - 2].map(y => <option key={y} value={y}>{y}</option>)}</Select></FormField>
          {!self ? <FormField name="evidence-search" label={ui("Find a teacher")}><Input value={query} onChange={event => setQuery(event.target.value)} /></FormField> : null}
          <Button variant="outline" disabled={!data || !visible.length} onClick={exportCsv}><Download className="size-4" aria-hidden />{ui("Export this view")}</Button>
        </div>
      </div>
      {data ? <details className="text-xs" data-policy><summary className="cursor-pointer font-bold">{ui("How these measures are counted")}</summary><ul className="mt-2 list-disc space-y-1 ps-5">{data.policy.map(line => <li key={line}>{ui(line)}</li>)}</ul></details> : null}
    </div>

    {!data ? <p role="status" className="sk-panel p-5 text-sm">{ui("Loading teaching evidence…")}</p>
      : !data.teachers.length ? <p className="sk-panel p-5 text-sm" data-empty>{ui("No active teachers in this campus.")}</p>
      : !visible.length ? <p className="sk-panel p-5 text-sm" data-empty-filter>{ui("No teacher matches this search.")} <Button size="sm" variant="secondary" onClick={() => setQuery("")}>{ui("Clear search")}</Button></p>
      : <ul className="space-y-3">{visible.map(row => <li key={row.teacherId} className="sk-panel space-y-3 p-4" data-teacher={row.teacherId}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-bold"><bdi>{row.fullName}</bdi></h3>
              <p className="text-xs text-ink-muted">{row.subjects.length ? <>{ui("Teaches")}: <bdi>{row.subjects.join(", ")}</bdi></> : ui("No subjects assigned this year")}{row.ledClasses.length ? <> · {ui("Class teacher")}: <bdi>{row.ledClasses.join(", ")}</bdi></> : null}</p>
            </div>
            <Button size="sm" variant="secondary" aria-expanded={open === row.teacherId} onClick={() => void openNotes(row.teacherId)}><MessageSquareText className="size-4" aria-hidden />{ui("Support notes ({0})", [row.notes])}</Button>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-xs" data-measures>
            <caption className="sr-only">{ui("Evidence for {0}", [row.fullName])}</caption>
            <thead><tr className="text-ink-subtle">{["Measure", "Value", "Source and coverage", "Latest record"].map(h => <th key={h} scope="col" className="px-2 py-1 text-start">{ui(h)}</th>)}</tr></thead>
            <tbody>{row.measures.map(m => <tr key={m.key} className="border-t border-border align-top" data-measure={m.key} data-available={m.value !== null}>
              <th scope="row" className="px-2 py-1.5 text-start font-bold">{ui(MEASURE_LABEL[m.key] ?? m.key)}{m.shared ? <span className="ms-1 rounded bg-amber-100 px-1 text-2xs font-bold text-amber-900">{ui("Shared")}</span> : null}</th>
              <td className="px-2 py-1.5 font-bold">{m.value === null ? <span className="font-bold text-ink-muted">{ui("Unavailable")}</span> : `${number(m.value)}%`}</td>
              <td className="px-2 py-1.5"><span>{ui(m.source)}</span>{m.coverage ? <span className="block text-ink-muted">{ui(m.coverage)}</span> : null}{m.unavailable ? <span className="block text-ink-muted">{ui(m.unavailable)}</span> : null}{m.caution ? <span className="block text-amber-900">{ui(m.caution)}</span> : null}</td>
              <td className="px-2 py-1.5">{m.freshness ? date(m.freshness) : "—"}</td>
            </tr>)}</tbody>
          </table></div>
          {open === row.teacherId ? <div className="space-y-2 rounded-xl bg-muted/60 p-3" data-notes>
            <p className="text-xs text-ink-muted">{ui("Support notes are reviewed actions and responses. They are not employment decisions, which are made and recorded separately by an authorized person.")}</p>
            {notes === null ? <p role="status" className="text-xs">{ui("Loading notes…")}</p> : !notes.length ? <p className="text-xs">{ui("No notes yet.")}</p>
              : <ol className="space-y-1 text-xs">{notes.map(note => <li key={note.id} data-note-kind={note.kind}><span className="font-bold">{ui(NOTE_LABEL[note.kind] ?? note.kind)}</span> · <bdi>{note.author}</bdi> · {dateTime(note.createdAt)}<span className="block"><bdi>{note.body}</bdi></span></li>)}</ol>}
            <FormField name={`note-${row.teacherId}`} label={self ? ui("Your response") : ui("Reviewed support action")}><Textarea maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} /></FormField>
            <Button size="sm" disabled={saving || draft.trim().length < 10} onClick={() => void saveNote(row.teacherId)}>{saving ? ui("Saving…") : self ? ui("Add your response") : ui("Record support action")}</Button>
          </div> : null}
        </li>)}</ul>}
  </section>;
}
