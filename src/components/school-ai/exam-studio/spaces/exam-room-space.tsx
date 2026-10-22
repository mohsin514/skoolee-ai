"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSpacesCopy } from "@/lib/school-ai/exam-studio-copy-spaces";
import type { Readiness } from "../../exam-release-panel";
import type { StudioSpaceProps } from "../studio-space-registry";
import { Composed } from "../space-state";
import { Checkbox } from "@/components/ui/checkbox";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import type { SlotView } from "@/lib/school-ai/paper-slot-service";

/**
 * SKO-408 Exam Room space: release an approved paper whose current version is rehearsed clean. The
 * server seals it at assignment (content hash and rehearsal), and every delivered exam shows its seal.
 */
type Exam = { id: string; title: string; classId: string; campusId: string; startsAt: string; endsAt: string; status: string; contentHash: string | null };
const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function ExamRoomSpace({ language, scope, records }: StudioSpaceProps) {
  const t = studioSpacesCopy(language);
  const approved = useMemo(() => records.filter(record => record.kind === "PAPER" && record.status === "APPROVED" && (!scope.subjectId || record.data.subjectId === scope.subjectId)), [records, scope.subjectId]);
  const [paperId, setPaperId] = useState("");
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [students, setStudents] = useState<Array<{ id: string; fullName: string }>>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(() => localInput(new Date(Date.now() + 3_600_000)));
  const [endsAt, setEndsAt] = useState(() => localInput(new Date(Date.now() + 2 * 3_600_000)));
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  // SKO-500: date-sheet sittings of requested papers this person can see; choosing one fills the window.
  const home = studioHomeCopy(language);
  const [sittings, setSittings] = useState<Array<{ scheduleId: string; classId: string; label: string; date: string; period: string | null; durationMinutes: number; paperRecordId: string | null }>>([]);
  const [scheduleId, setScheduleId] = useState("");
  useEffect(() => {
    void fetch("/api/school-ai/paper-slots/mine", { cache: "no-store" }).then(response => (response.ok ? response.json() : null)).then((payload: { slots?: SlotView[] } | null) => {
      setSittings((payload?.slots ?? []).filter(slot => slot.status !== "CANCELLED").flatMap(slot => slot.sections.map(section => ({ scheduleId: section.scheduleId, classId: section.classId, label: `${slot.subjectName} · ${section.name} · ${slot.sessionTitle}`, date: section.date, period: slot.period, durationMinutes: slot.durationMinutes, paperRecordId: slot.paperRecordId }))));
    }).catch(() => undefined);
  }, []);
  const chooseSitting = (id: string) => {
    setScheduleId(id);
    const sitting = sittings.find(row => row.scheduleId === id);
    if (!sitting) return;
    // The period's times when the date sheet has one; otherwise 09:00 for the paper's duration.
    const [from, to] = (sitting.period ?? "").split("–");
    const start = from || "09:00";
    const end = to || (() => { const minutes = 9 * 60 + sitting.durationMinutes; return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; })();
    setStartsAt(`${sitting.date}T${start}`); setEndsAt(`${sitting.date}T${end}`);
    if (!title.trim()) setTitle(sitting.label.slice(0, 160));
  };
  const current = paperId || approved[0]?.id || "";
  const loadExams = useCallback(async () => {
    const payload = await fetch("/api/school-ai/exams", { cache: "no-store" }).then(response => response.json()).catch(() => ({}));
    setExams(((payload.exams ?? []) as Exam[]).filter(exam => (!scope.campusId || exam.campusId === scope.campusId) && (!scope.classId || exam.classId === scope.classId)));
  }, [scope.campusId, scope.classId]);
  useEffect(() => { void loadExams(); }, [loadExams]);
  useEffect(() => {
    if (!current) return;
    let live = true;
    setReadiness(null); setChosen([]);
    void fetch(`/api/school-ai/workspace/${encodeURIComponent(current)}/rehearsal`, { cache: "no-store" }).then(response => response.json()).then(payload => { if (live) setReadiness(payload.readiness ?? null); }).catch(() => undefined);
    void fetch(`/api/school-ai/exams?paperId=${encodeURIComponent(current)}`, { cache: "no-store" }).then(response => response.json()).then(payload => { if (live) setStudents(payload.students ?? []); }).catch(() => undefined);
    return () => { live = false; };
  }, [current]);
  if (!approved.length) return <TaskFeedback kind="empty" title={t.roomNone}><p>{t.roomIntro}</p></TaskFeedback>;
  const blockers = readiness ? readiness.blockers.length : 0;
  const release = async () => {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/school-ai/exams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: key, paperId: current, title, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), studentIds: chosen, mode: "STANDARD", ...(scheduleId ? { examScheduleId: scheduleId } : {}) }) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage({ tone: "error", text: typeof payload.error === "string" ? payload.error : t.failed }); return; }
    setMessage({ tone: "ok", text: fillStudioCopy(t.roomReleased, [`#${String(payload.exam?.contentHash ?? readiness?.contentHashPrefix ?? "").slice(0, 16)}`]) });
    setKey(crypto.randomUUID()); setChosen([]); setTitle(""); void loadExams();
  };
  return <div className="space-y-4" data-exam-room>
    <p className="text-sm text-ink-subtle">{t.roomIntro}</p>
    <section className="sk-panel space-y-3 p-5" aria-labelledby="room-release">
      <h3 id="room-release" className="sr-only">{t.roomRelease}</h3>
      <label className="grid max-w-xl gap-1 text-sm font-semibold">{t.roomPaper}<Select aria-label={t.roomPaper} value={current} onChange={event => { setPaperId(event.target.value); setMessage(null); }}>{approved.map(record => <option key={record.id} value={record.id}>{record.title} · v{record.version}</option>)}</Select></label>
      {readiness && (blockers ? <Alert tone="warning" compact live="polite" data-room-state="blocked">{fillStudioCopy(t.roomBlocked, [new Intl.NumberFormat(language).format(blockers)])}</Alert>
        : <Alert tone="success" compact live="polite" data-room-state="ready">{t.roomReady}{readiness.contentHashPrefix ? <> · <bdi dir="ltr" className="font-mono text-xs">#{readiness.contentHashPrefix}</bdi></> : null}</Alert>)}
      {sittings.length ? <label className="grid max-w-xl gap-1 text-sm font-semibold">{home.roomSitting}<Select aria-label={home.roomSitting} value={scheduleId} onChange={event => chooseSitting(event.target.value)}><option value="">{home.roomSittingNone}</option>{sittings.filter(row => !row.paperRecordId || row.paperRecordId === current).map(row => <option key={row.scheduleId} value={row.scheduleId}>{row.label} · {row.date}</option>)}</Select><span className="text-xs font-normal text-ink-subtle">{home.roomSittingHint}</span></label> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">{t.roomTitle}<Input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">{t.roomOpens}<Input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">{t.roomCloses}<Input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} /></label>
      </div>
      <fieldset className="space-y-1"><legend className="text-sm font-semibold">{t.roomCandidates}</legend>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={students.length > 0 && chosen.length === students.length} onChange={event => setChosen(event.target.checked ? students.map(student => student.id) : [])} />{t.roomAll}</label>
        <div className="grid gap-1 sm:grid-cols-2">{students.map(student => <label key={student.id} className="flex items-center gap-2 text-sm"><Checkbox checked={chosen.includes(student.id)} onChange={event => setChosen(previous => event.target.checked ? [...previous, student.id] : previous.filter(id => id !== student.id))} /><bdi dir="auto">{student.fullName}</bdi></label>)}</div>
      </fieldset>
      <Button disabled={busy || !title.trim() || !chosen.length || !readiness || blockers > 0} onClick={() => void release()}>{t.roomRelease}</Button>
      {message && <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${message.tone === "ok" ? "border-status-success-border bg-status-success-surface text-status-success-text" : "border-status-error-border bg-status-error-surface text-status-error-text"}`} data-room-result><bdi dir="auto">{message.text}</bdi></p>}
    </section>
    <section className="sk-panel space-y-2 p-5" aria-labelledby="room-delivered">
      <h3 id="room-delivered" className="font-semibold">{t.roomDelivered}</h3>
      {!exams.length ? <p className="text-sm text-ink-subtle">{t.roomNoneDelivered}</p> : <ul className="grid gap-2">{exams.map(exam => <li key={exam.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm" data-delivered-exam>
        <span><bdi dir="auto" className="font-semibold">{exam.title}</bdi> · {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(exam.startsAt))}{exam.contentHash ? <> · <Composed template={t.roomSealed} values={[<bdi key="hash" dir="ltr" className="font-mono text-xs">#{exam.contentHash.slice(0, 16)}</bdi>]} /></> : null}</span>
        <Link href={`/ai/exams/${encodeURIComponent(exam.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>{t.openPaper}</Link>
      </li>)}</ul>}
    </section>
  </div>;
}
