"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { examIncidentCopy, fill } from "../../exam-incident-copy";
import type { StudioSpaceProps } from "../studio-space-registry";
import { SpaceStateRegion, type SpaceState } from "../space-state";

/**
 * SKO-408 Control room (R17.1-R17.6). Human decisions about a live sitting, with scope, reason and
 * audit: a versioned clarification to everyone sitting or to named candidates, each reading counted.
 * The paper, its key and every timer stay exactly as released.
 */
type Exam = { id: string; title: string; classId: string; campusId: string; startsAt: string; endsAt: string; status: string };
type Notice = { id: string; version: number; revisesId: string | null; current: boolean; text: string; question: number | null; audience: { kind: "SITTING" } | { kind: "ATTEMPTS"; attemptIds: string[] }; audienceSize: number; acknowledged: number; issuedBy: string | null; createdAt: string };
type Board = { questions: Array<{ id: string; number: number }>; attempts: Array<{ id: string; status: string; name: string | null }>; notices: Notice[] };

export default function ControlRoomSpace({ language, scope }: StudioSpaceProps) {
  const t = examIncidentCopy(language);
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<SpaceState<Board>>({ kind: "loading" });
  const [text, setText] = useState("");
  const [everyone, setEveryone] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [revising, setRevising] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/school-ai/exams", { cache: "no-store" }).then(response => response.json()).then(payload => {
      const now = Date.now();
      setExams(((payload.exams ?? []) as Exam[]).filter(exam => exam.status === "ACTIVE" && new Date(exam.endsAt).getTime() > now - 3_600_000 && (!scope.campusId || exam.campusId === scope.campusId) && (!scope.classId || exam.classId === scope.classId)));
    }).catch(() => setExams([]));
  }, [scope.campusId, scope.classId]);
  const examId = selected || exams?.[0]?.id || "";
  const api = `/api/school-ai/exams/${encodeURIComponent(examId)}/clarifications`;
  const load = useCallback(async () => {
    if (!examId) return;
    const response = await fetch(api, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setState(response.ok ? { kind: "ready", data: payload as Board } : { kind: "error", reason: typeof payload.error === "string" ? payload.error : t.failed, retry: () => void load() });
  }, [api, examId, t.failed]);
  useEffect(() => { void load(); }, [load]);
  if (exams && !exams.length) return <TaskFeedback kind="empty" title={t.noExams}><p>{t.composeHint}</p></TaskFeedback>;
  const send = async () => {
    setBusy(true); setNotice(null);
    const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, audience: everyone ? { kind: "SITTING" } : { kind: "ATTEMPTS", attemptIds: chosen }, ...(question ? { questionId: question } : {}), ...(revising ? { revisesId: revising.id } : {}) }) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setNotice({ tone: "error", text: typeof payload.error === "string" ? payload.error : t.failed }); return; }
    setText(""); setChosen([]); setQuestion(""); setRevising(null); setNotice({ tone: "ok", text: t.sent }); void load();
  };
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  return <div className="space-y-4" data-control-room>
    {exams && <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-64 flex-1 gap-1 text-sm font-semibold">{t.exam}<Select aria-label={t.exam} value={examId} onChange={event => { setSelected(event.target.value); setRevising(null); }}>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</Select></label>
      {examId && <Link href={`/ai/exams/${encodeURIComponent(examId)}`} className={buttonVariants({ variant: "outline" })}>{t.openExam}</Link>}
    </div>}
    <SpaceStateRegion state={state} language={language}>{board => {
      const live = board.attempts.filter(attempt => attempt.status === "IN_PROGRESS");
      return <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="compose-title" className="sk-panel space-y-3 p-5">
          <h3 id="compose-title" className="font-semibold">{revising ? fill(t.revising, [number(revising.version)]) : t.composeTitle}</h3>
          <p className="text-sm text-ink-subtle">{t.composeHint}</p>
          {!live.length ? <p role="status" className="rounded-xl border p-3 text-sm">{t.noLive}</p> : <>
            <label className="grid gap-1 text-sm font-semibold">{t.text}<Textarea value={text} maxLength={2000} rows={3} dir="auto" onChange={event => setText(event.target.value)} /></label>
            <fieldset className="space-y-2"><legend className="text-sm font-semibold">{t.audience}</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="notice-audience" checked={everyone} onChange={() => setEveryone(true)} />{t.everyone} ({number(live.length)})</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="notice-audience" checked={!everyone} onChange={() => setEveryone(false)} />{t.chosen}</label>
              {!everyone && <div className="grid gap-1 ps-6">{live.map(attempt => <label key={attempt.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chosen.includes(attempt.id)} onChange={event => setChosen(previous => event.target.checked ? [...previous, attempt.id] : previous.filter(entry => entry !== attempt.id))} /><bdi dir="auto">{attempt.name ?? attempt.id}</bdi></label>)}</div>}
            </fieldset>
            {board.questions.length > 0 && <label className="grid max-w-xs gap-1 text-sm font-semibold">{t.question}<Select aria-label={t.question} value={question} onChange={event => setQuestion(event.target.value)}><option value="">{t.none}</option>{board.questions.map(entry => <option key={entry.id} value={entry.id}>{fill(t.aboutQuestion, [number(entry.number)])}</option>)}</Select></label>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !text.trim() || (!everyone && !chosen.length)} onClick={() => void send()}>{t.send}</Button>
              {revising && <Button variant="ghost" onClick={() => setRevising(null)}>{t.cancel}</Button>}
            </div>
          </>}
          {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-status-error-border bg-status-error-surface text-status-error-text"}`}><bdi dir="auto">{notice.text}</bdi></p>}
        </section>
        <section aria-labelledby="issued-title" className="sk-panel space-y-2 p-5">
          <h3 id="issued-title" className="font-semibold">{t.issued}</h3>
          {!board.notices.length ? <p className="text-sm text-ink-subtle">{t.noNotices}</p> : <ol className="grid gap-2">{[...board.notices].reverse().map(row => <li key={row.id} className={`rounded-xl border p-3 text-sm ${row.current ? "" : "opacity-70"}`} data-notice-version={row.version}>
            <p className="text-xs font-semibold text-ink-subtle">{fill(t.notice, [number(row.version)])}{row.question ? ` · ${fill(t.aboutQuestion, [number(row.question)])}` : ""} · {row.audience.kind === "SITTING" ? t.everyone : t.chosen} · {new Intl.DateTimeFormat(language, { timeStyle: "short" }).format(new Date(row.createdAt))}{row.issuedBy ? <> · <bdi dir="auto">{row.issuedBy}</bdi></> : null}</p>
            <p dir="auto" className="mt-1 whitespace-pre-wrap">{row.text}</p>
            <p className="mt-1 text-xs" data-notice-reads>{fill(t.readBy, [number(row.acknowledged), number(row.audienceSize)])}{!row.current ? ` · ${t.superseded}` : ""}</p>
            {row.current && live.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setRevising(row); setText(row.text); setEveryone(row.audience.kind === "SITTING"); setChosen(row.audience.kind === "ATTEMPTS" ? row.audience.attemptIds : []); }}>{t.revise}</Button>}
          </li>)}</ol>}
        </section>
      </div>;
    }}</SpaceStateRegion>
  </div>;
}
