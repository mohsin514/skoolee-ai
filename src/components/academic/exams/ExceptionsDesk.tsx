"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useLocale } from "@/components/locale/LocaleProvider";
import { studioOfficeCopy, type StudioOfficeCopy } from "@/lib/school-ai/exam-studio-copy-office";

type Exception = { id: string; examId: string; exam: string; student: string | null; rollNo: string | null; kind: string; note: string; status: "OPEN" | "RESOLVED"; decision: string | null; resolution: string | null; version: number };
type Desk = { exams: Array<{ id: string; label: string; students: Array<{ id: string; name: string; rollNo: string | null }> }>; exceptions: Exception[] };
const KINDS = ["ABSENT_MEDICAL", "ABSENT_LEAVE", "UNFAIR_MEANS", "EXEMPT", "RESIT"] as const;
const DECISIONS = ["RESIT_NEW_FORM", "RESIT_CAPPED", "RESIT_FULL", "RECORD_ABSENT", "EXEMPT_FROM_TOTAL", "NO_CHANGE"] as const;

/** SKO-506 exceptions desk: record, then resolve with a decision; open rows keep the exam's report cards back. */
export function ExceptionsDesk({ sessionId, onChanged }: { sessionId: string; onChanged?: () => void }) {
  const { language } = useLocale();
  const t = studioOfficeCopy(language);
  const kind = (value: string) => t[`kind${value}` as keyof StudioOfficeCopy] ?? value;
  const decision = (value: string) => t[`decision${value}` as keyof StudioOfficeCopy] ?? value;
  const url = `/api/academic/exam-sessions/${encodeURIComponent(sessionId)}/exceptions`;
  const [desk, setDesk] = useState<Desk | null>(null);
  const [form, setForm] = useState({ examId: "", studentId: "", kind: "ABSENT_MEDICAL", note: "" });
  const [resolving, setResolving] = useState<Record<string, { decision: string; resolution: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setDesk(payload.data); else setError(typeof payload.error === "string" ? payload.error : "");
  }, [url]);
  useEffect(() => { void load(); }, [load]);
  const send = async (path: string, method: string, body: unknown) => {
    setBusy(true); setError("");
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(typeof payload.error === "string" ? payload.error : ""); return false; }
    await load(); onChanged?.(); return true;
  };
  if (!desk) return null;
  const exam = desk.exams.find(row => row.id === form.examId);
  return <section aria-labelledby="exceptions-desk" className="sk-panel space-y-3 p-4" data-exceptions-desk>
    <h3 id="exceptions-desk" className="text-base font-bold text-ink-strong">{t.exceptionsTitle}</h3>
    <p className="text-sm text-ink-muted">{t.exceptionsIntro}</p>
    <form className="grid gap-2 md:grid-cols-4" onSubmit={event => { event.preventDefault(); void send(url, "POST", form).then(ok => { if (ok) setForm(previous => ({ ...previous, studentId: "", note: "" })); }); }}>
      <FormField name="exception-exam" label={t.exceptionExam}><Select value={form.examId} onChange={event => setForm(previous => ({ ...previous, examId: event.target.value, studentId: "" }))} required data-exception-exam><option value="">—</option>{desk.exams.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</Select></FormField>
      <FormField name="exception-student" label={t.exceptionStudent}><Select value={form.studentId} onChange={event => setForm(previous => ({ ...previous, studentId: event.target.value }))} required disabled={!exam} data-exception-student><option value="">—</option>{exam?.students.map(row => <option key={row.id} value={row.id}>{row.rollNo ? `${row.rollNo} · ` : ""}{row.name}</option>)}</Select></FormField>
      <FormField name="exception-kind" label={t.exceptionKind}><Select value={form.kind} onChange={event => setForm(previous => ({ ...previous, kind: event.target.value }))} data-exception-kind>{KINDS.map(value => <option key={value} value={value}>{kind(value)}</option>)}</Select></FormField>
      <FormField name="exception-note" label={t.exceptionNote}><Textarea rows={1} maxLength={2000} value={form.note} onChange={event => setForm(previous => ({ ...previous, note: event.target.value }))} required data-exception-note /></FormField>
      <div className="md:col-span-4"><Button type="submit" disabled={busy || !form.examId || !form.studentId || form.note.trim().length < 3} data-exception-add>{t.exceptionAdd}</Button></div>
    </form>
    {error && <p role="alert" className="text-sm text-status-error-text"><bdi dir="auto">{error}</bdi></p>}
    {!desk.exceptions.length ? <p className="text-sm text-ink-muted">{t.exceptionsEmpty}</p> : <ul className="grid gap-2">{desk.exceptions.map(row => {
      const draft = resolving[row.id] ?? { decision: "RECORD_ABSENT", resolution: "" };
      return <li key={row.id} className="space-y-2 rounded-xl border border-border p-3" data-exception={row.status}>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-ink-strong [overflow-wrap:anywhere]"><bdi>{row.student ?? "—"}</bdi> · <bdi>{row.exam}</bdi> · {kind(row.kind)}</p><Badge variant={row.status === "OPEN" ? "warning" : "success"} size="sm">{row.status === "OPEN" ? t.exceptionOpen : t.exceptionResolved}</Badge></div>
        <p dir="auto" className="text-sm text-ink-muted">{row.note}</p>
        {row.status === "RESOLVED" ? <p className="text-sm"><span className="font-semibold">{decision(row.decision ?? "")}</span>{row.resolution ? <> · <bdi dir="auto">{row.resolution}</bdi></> : null}</p>
          : <div className="grid gap-2 md:grid-cols-3">
            <p className="text-xs text-ink-subtle md:col-span-3" data-exception-action-note>{t.exceptionActionNote}</p>
            <FormField name={`decision-${row.id}`} label={t.exceptionDecision}><Select value={draft.decision} onChange={event => setResolving(previous => ({ ...previous, [row.id]: { ...draft, decision: event.target.value } }))}>{DECISIONS.map(value => <option key={value} value={value}>{decision(value)}</option>)}</Select></FormField>
            <FormField name={`resolution-${row.id}`} label={t.exceptionResolution}><Textarea rows={1} maxLength={2000} value={draft.resolution} onChange={event => setResolving(previous => ({ ...previous, [row.id]: { ...draft, resolution: event.target.value } }))} data-exception-resolution /></FormField>
            <div className="flex items-end"><Button type="button" variant="outline" disabled={busy || draft.resolution.trim().length < 3} onClick={() => void send(`${url}/${encodeURIComponent(row.id)}`, "PATCH", { version: row.version, ...draft })} data-exception-resolve>{t.exceptionResolve}</Button></div>
          </div>}
      </li>;
    })}</ul>}
  </section>;
}
