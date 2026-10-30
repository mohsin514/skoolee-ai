"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, MessageSquareText, Search, Users } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { downloadCSV } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCards, SkeletonList } from "@/components/ui/skeleton";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { isApiOk, readApiError } from "@/lib/api/envelope-client";

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

export interface TeacherPerformancePanelProps {
  /** The teacher's own evidence (respond only). */
  self?: boolean;
  /**
   * §4.4b: the hosting page's PageHeader owns the title, "Add note" (primary) and "Export" (secondary). With
   * `hideHeading` the panel drops its own heading and export button; each change of `exportRequest` downloads
   * the visible rows and each change of `noteRequest` opens "Add a support note" (teacher picker + note).
   */
  hideHeading?: boolean;
  exportRequest?: number;
  noteRequest?: number;
}

const NOTE_MIN = 10;

export function TeacherPerformancePanel({ self = false, hideHeading = false, exportRequest, noteRequest }: TeacherPerformancePanelProps = {}) {
  const ui = useUiText();
  const { date, dateTime, number } = useLocaleFormat();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear), [query, setQuery] = useState("");
  const [data, setData] = useState<Evidence | null>(null), [error, setError] = useState<{ message: string; denied: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null), [notes, setNotes] = useState<Note[] | null>(null), [draft, setDraft] = useState(""), [saving, setSaving] = useState(false);
  // "Add note" from the page header: a dialog with its own teacher and text, independent of any open row.
  const [composer, setComposer] = useState<{ teacherId: string; body: string } | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++request.current;
    setError(null);
    const response = await fetch(`/api/teachers/performance?academicYear=${year}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (ticket !== request.current) return;
    if (!response?.ok || !isApiOk(json)) { setError({ message: ui(readApiError(json, "Teaching evidence could not be loaded.")), denied: response?.status === 403 }); return; }
    setData(json.data);
  }, [year, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const openNotes = async (teacherId: string) => {
    if (open === teacherId) { setOpen(null); return; }
    setOpen(teacherId); setNotes(null); setDraft("");
    const response = await fetch(`/api/teachers/performance/notes?teacherId=${encodeURIComponent(teacherId)}&academicYear=${year}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    setNotes(response?.ok && isApiOk(json) ? json.data : []);
  };
  // One POST for the row editor and the "Add note" composer; `draft` is the note text either one passes in.
  const postNote = async (teacherId: string, draft: string) => {
    const response = await fetch("/api/teachers/performance/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherId, academicYear: year, body: draft }) }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (!response?.ok || !isApiOk(json)) { toast.error(ui(readApiError(json, "The note was not saved."))); return false; }
    toast.success(ui("Note saved."));
    return true;
  };
  const saveNote = async (teacherId: string) => {
    setSaving(true);
    try {
      if (!(await postNote(teacherId, draft))) return;
      setDraft(""); setOpen(null); await openNotes(teacherId); await load();
    } finally { setSaving(false); }
  };
  const saveComposer = async () => {
    if (!composer) return;
    setSaving(true);
    try {
      if (!(await postNote(composer.teacherId, composer.body))) return;
      const teacherId = composer.teacherId;
      setComposer(null);
      if (open === teacherId) { setOpen(null); await openNotes(teacherId); }
      await load();
    } finally { setSaving(false); }
  };

  const visible = useMemo(() => (data?.teachers ?? []).filter(row => !query.trim() || row.fullName.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const exportCsv = useCallback(() => {
    if (!data || !visible.length) return;
    const header = ["Teacher", "Measure", "Value", "Source", "Coverage", "Freshness", "Unavailable", "Shared", "Caution"].map(h => ui(h));
    downloadCSV(`teaching-evidence-${data.period.start}-to-${data.period.end}.csv`, [header, ...visible.flatMap(row => row.measures.map(m => [row.fullName, ui(MEASURE_LABEL[m.key] ?? m.key), m.value ?? "", ui(m.source), m.coverage ? ui(m.coverage) : "", m.freshness ?? "", m.unavailable ? ui(m.unavailable) : "", m.shared ? ui("Yes") : ui("No"), m.caution ? ui(m.caution) : ""]))]);
  }, [data, visible, ui]);

  // Host-owned header actions: only a change of the counter fires, never the first render.
  const lastExport = useRef(exportRequest);
  useEffect(() => {
    if (exportRequest === undefined || exportRequest === lastExport.current) return;
    lastExport.current = exportRequest;
    exportCsv();
  }, [exportRequest, exportCsv]);
  const lastNote = useRef(noteRequest);
  useEffect(() => {
    if (noteRequest === undefined || noteRequest === lastNote.current) return;
    lastNote.current = noteRequest;
    // Pre-select the teacher whose notes are open, else the only one on screen.
    const preset = open ?? (visible.length === 1 ? visible[0].teacherId : "");
    setComposer({ teacherId: preset, body: "" });
  }, [noteRequest, open, visible]);

  if (error) return <section role="alert" data-teaching-evidence data-state={error.denied ? "denied" : "error"}>
    <ErrorState title={error.denied ? ui("You do not have access to teaching evidence for this campus.") : ui("Teaching evidence could not be loaded.")} description={error.denied ? undefined : error.message} onRetry={error.denied ? undefined : () => void load()} retryLabel={ui("Retry")} />
  </section>;

  return <section className="space-y-4" aria-labelledby={hideHeading ? undefined : "evidence-title"} aria-label={hideHeading ? ui(self ? "My teaching evidence" : "Teaching evidence") : undefined} data-teaching-evidence data-state={data ? "ready" : "loading"}>
    <div className="sk-panel space-y-3 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {hideHeading ? null : <h2 id="evidence-title" className="flex items-center gap-2 text-lg font-bold"><Users className="size-5 text-primary" aria-hidden />{self ? ui("My teaching evidence") : ui("Teaching evidence")}</h2>}
          {data ? <p className="text-xs font-bold text-ink-muted" data-period>{ui("Period: {0} to {1}", [date(data.period.start), date(data.period.end)])} · {ui(PERIOD_SOURCE[data.period.source])}</p> : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField name="evidence-year" label={ui("Academic year")}><Select value={String(year)} onChange={event => setYear(Number(event.target.value))}>{[thisYear, thisYear - 1, thisYear - 2].map(y => <option key={y} value={y}>{y}</option>)}</Select></FormField>
          {!self ? <FormField name="evidence-search" label={ui("Find a teacher")}><Input value={query} onChange={event => setQuery(event.target.value)} /></FormField> : null}
          {hideHeading ? null : <Button variant="outline" disabled={!data || !visible.length} onClick={exportCsv}><Download className="size-4" aria-hidden />{ui("Export this view")}</Button>}
        </div>
      </div>
      {data ? <details className="text-xs" data-policy><summary className="cursor-pointer font-bold">{ui("How these measures are counted")}</summary><ul className="mt-2 list-disc space-y-1 ps-5">{data.policy.map(line => <li key={line}>{ui(line)}</li>)}</ul></details> : null}
    </div>

    {!data ? <div role="status" aria-label={ui("Loading teaching evidence…")}><SkeletonCards /></div>
      : !data.teachers.length ? <div className="sk-panel" data-empty><EmptyState icon={Users} title={ui("No active teachers in this campus.")} description={ui("Teachers appear here once your campus admin invites them.")} /></div>
      : !visible.length ? <div className="sk-panel" data-empty-filter><EmptyState size="sm" icon={Search} title={ui("No teacher matches this search.")} action={<Button size="sm" variant="outline" onClick={() => setQuery("")}>{ui("Clear search")}</Button>} /></div>
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
              <th scope="row" className="px-2 py-1.5 text-start font-bold">{ui(MEASURE_LABEL[m.key] ?? m.key)}{m.shared ? <span className="ms-1 rounded bg-status-warning-surface px-1 text-2xs font-bold text-status-warning-text">{ui("Shared")}</span> : null}</th>
              <td className="px-2 py-1.5 font-bold">{m.value === null ? <span className="font-bold text-ink-muted">{ui("Unavailable")}</span> : `${number(m.value)}%`}</td>
              <td className="px-2 py-1.5"><span>{ui(m.source)}</span>{m.coverage ? <span className="block text-ink-muted">{ui(m.coverage)}</span> : null}{m.unavailable ? <span className="block text-ink-muted">{ui(m.unavailable)}</span> : null}{m.caution ? <span className="block text-status-warning-text">{ui(m.caution)}</span> : null}</td>
              <td className="px-2 py-1.5">{m.freshness ? date(m.freshness) : "—"}</td>
            </tr>)}</tbody>
          </table></div>
          {open === row.teacherId ? <div className="space-y-2 rounded-xl bg-muted/60 p-3" data-notes>
            <p className="text-xs text-ink-muted">{ui("Support notes are reviewed actions and responses. They are not employment decisions, which are made and recorded separately by an authorized person.")}</p>
            {notes === null ? <div role="status" aria-label={ui("Loading notes…")}><SkeletonList /></div> : !notes.length ? <EmptyState size="sm" icon={MessageSquareText} title={ui("No notes yet.")} description={self ? ui("Add your response below.") : ui("Record the first support action below.")} />
              : <ol className="space-y-1 text-xs">{notes.map(note => <li key={note.id} data-note-kind={note.kind}><span className="font-bold">{ui(NOTE_LABEL[note.kind] ?? note.kind)}</span> · <bdi>{note.author}</bdi> · {dateTime(note.createdAt)}<span className="block"><bdi>{note.body}</bdi></span></li>)}</ol>}
            <FormField name={`note-${row.teacherId}`} label={self ? ui("Your response") : ui("Reviewed support action")}><Textarea maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} /></FormField>
            <Button size="sm" loading={saving} disabled={saving || draft.trim().length < NOTE_MIN} onClick={() => void saveNote(row.teacherId)}>{self ? ui("Add your response") : ui("Record support action")}</Button>
          </div> : null}
        </li>)}</ul>}

    {composer ? (
      <Modal
        title={ui("Add a support note")}
        subtitle={ui("A reviewed support action for one teacher. It is not an employment decision.")}
        icon={MessageSquareText}
        size="md"
        dirty={composer.body.trim().length > 0}
        onClose={() => { if (!saving) setComposer(null); }}
        footer={
          <ModalActions
            busy={saving}
            actionLabel={ui("Save note")}
            cancelLabel={ui("Keep editing")}
            onCancel={() => setComposer(null)}
            onAction={() => void saveComposer()}
            blockedReason={!composer.teacherId ? ui("Choose a teacher.") : composer.body.trim().length < NOTE_MIN ? ui("Write at least {0} characters.", [NOTE_MIN]) : null}
          />
        }
      >
        <div className="space-y-4">
          <FormField name="note-teacher" label={ui("Teacher")}>
            <Select value={composer.teacherId} onChange={event => setComposer(c => (c ? { ...c, teacherId: event.target.value } : c))}>
              <option value="">{ui("Choose a teacher")}</option>
              {(data?.teachers ?? []).map(row => <option key={row.teacherId} value={row.teacherId}>{row.fullName}</option>)}
            </Select>
          </FormField>
          <FormField name="note-body" label={ui("Reviewed support action")} hint={ui("At least {0} characters.", [NOTE_MIN])}>
            <Textarea maxLength={2000} rows={5} value={composer.body} onChange={event => setComposer(c => (c ? { ...c, body: event.target.value } : c))} />
          </FormField>
        </div>
      </Modal>
    ) : null}
  </section>;
}
