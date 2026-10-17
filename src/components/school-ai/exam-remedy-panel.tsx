"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { examIncidentCopy, fill } from "./exam-incident-copy";

// SKO-408 R17.7-R17.12: preview a remedy per candidate, then an approver applies that exact proposal.
type Question = { id: string; number: number; type: string; marks: number; options: Array<{ id: string; text: string }> };
type Row = { attemptId: string; name: string | null; resultVersion: number; previous: number; proposed: number; previousTotal: number; proposedTotal: number };
type Outcome = { attemptId: string; outcome: "APPLIED" | "UNCHANGED" | "SKIPPED_CHANGED" | "FAILED"; version?: number };
type Remedy = { id: string; type: "KEY_CORRECTION" | "ITEM_NEUTRALIZATION"; question: number; reason: string; status: string; preview: { rows: Row[]; pending: number }; outcomes: Outcome[] | null; createdAt: string };

export function ExamRemedyPanel({ examId, locale, canAuthorize, onApplied }: { examId: string; locale: AssessmentLocale; canAuthorize: boolean; onApplied?: () => void }) {
  const t = examIncidentCopy(locale);
  const api = `/api/school-ai/exams/${encodeURIComponent(examId)}/remedies`;
  const [data, setData] = useState<{ questions: Question[]; remedies: Remedy[] } | null>(null);
  const [type, setType] = useState<Remedy["type"]>("KEY_CORRECTION");
  const [questionId, setQuestionId] = useState("");
  const [option, setOption] = useState("");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const response = await fetch(api, { cache: "no-store" }); if (response.ok) setData(await response.json()); }, [api]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return null;
  const objective = data.questions.filter(question => question.options.length > 0);
  const question = data.questions.find(entry => entry.id === questionId);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const send = async (path: string, body?: unknown) => {
    setBusy(true); setError("");
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(typeof payload.error === "string" ? payload.error : t.failed); return false; }
    await load(); return true;
  };
  const outcomeText = (outcome: Outcome) => outcome.outcome === "APPLIED" ? fill(t.outcomeApplied, [number(outcome.version ?? 0)]) : outcome.outcome === "UNCHANGED" ? t.outcomeUnchanged : outcome.outcome === "SKIPPED_CHANGED" ? t.outcomeSkipped : t.outcomeFailed;
  return <section aria-labelledby="remedy-title" className="sk-panel space-y-3 p-4" data-remedy-panel>
    <h3 id="remedy-title" className="font-semibold">{t.remedyTitle}</h3>
    <p className="text-sm text-ink-subtle">{t.remedyHint}</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-sm font-semibold">{t.type}<Select aria-label={t.type} value={type} onChange={event => setType(event.target.value as Remedy["type"])}><option value="KEY_CORRECTION">{t.keyCorrection}</option><option value="ITEM_NEUTRALIZATION">{t.neutralize}</option></Select></label>
      <label className="grid gap-1 text-sm font-semibold">{t.itemLabel}<Select aria-label={t.itemLabel} value={questionId} onChange={event => { setQuestionId(event.target.value); setOption(""); }}><option value="">—</option>{(type === "KEY_CORRECTION" ? objective : data.questions).map(entry => <option key={entry.id} value={entry.id}>{fill(t.aboutQuestion, [number(entry.number)])}</option>)}</Select></label>
      {type === "KEY_CORRECTION" && question && <label className="grid gap-1 text-sm font-semibold">{t.correctOption}<Select aria-label={t.correctOption} value={option} onChange={event => setOption(event.target.value)}><option value="">—</option>{question.options.map(entry => <option key={entry.id} value={entry.id}>{entry.text}</option>)}</Select></label>}
    </div>
    <label className="grid gap-1 text-sm font-semibold">{t.reason}<Textarea rows={2} maxLength={2000} dir="auto" value={reason} onChange={event => setReason(event.target.value)} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notify} onChange={event => setNotify(event.target.checked)} />{t.notify}</label>
    <Button variant="outline" disabled={busy || !questionId || reason.trim().length < 5 || (type === "KEY_CORRECTION" && !option)}
      onClick={() => void send(api, { type, questionId, reason, notify, ...(type === "KEY_CORRECTION" ? { correction: question?.type === "MULTIPLE_CHOICE" ? { questionId, correctOptionIds: [option] } : { questionId, correctOptionId: option } } : {}) }).then(ok => { if (ok) setReason(""); })}>{t.preview}</Button>
    {error && <p role="alert" className="text-sm text-status-error-text"><bdi dir="auto">{error}</bdi></p>}
    {data.remedies.length > 0 && <div className="space-y-3"><h4 className="text-sm font-semibold">{t.proposals}</h4>
      {data.remedies.map(remedy => <article key={remedy.id} className="space-y-2 rounded-xl border p-3 text-sm" data-remedy-status={remedy.status}>
        <p className="font-semibold">{remedy.type === "KEY_CORRECTION" ? t.keyCorrection : t.neutralize} · {fill(t.aboutQuestion, [number(remedy.question)])}{remedy.status === "APPLIED" ? ` · ${t.applied}` : ""}</p>
        <p dir="auto" className="text-ink-subtle">{remedy.reason}</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[30rem]"><thead><tr className="text-xs text-ink-subtle"><th className="p-1 text-start">{t.candidate}</th><th className="p-1 text-start">{t.before}</th><th className="p-1 text-start">{t.after}</th><th className="p-1 text-start">{t.total}</th>{remedy.outcomes && <th className="p-1 text-start">{t.applied}</th>}</tr></thead>
          <tbody>{remedy.preview.rows.map(row => <tr key={row.attemptId} className="border-t" data-remedy-row={row.proposed !== row.previous ? "changes" : "same"}><td className="p-1"><bdi dir="auto">{row.name ?? row.attemptId}</bdi></td><td className="p-1 tabular-nums">{number(row.previous)}</td><td className="p-1 tabular-nums">{number(row.proposed)}</td><td className="p-1 tabular-nums">{number(row.previousTotal)} → {number(row.proposedTotal)}</td>
            {remedy.outcomes && <td className="p-1">{outcomeText(remedy.outcomes.find(outcome => outcome.attemptId === row.attemptId) ?? { attemptId: row.attemptId, outcome: "FAILED" })}</td>}</tr>)}</tbody></table></div>
        <p className="text-xs text-ink-subtle">{fill(t.changes, [number(remedy.preview.rows.filter(row => row.proposed !== row.previous).length)])} · {fill(t.pending, [number(remedy.preview.pending)])}</p>
        {remedy.status === "PROPOSED" && canAuthorize && <Button size="sm" disabled={busy} onClick={() => void send(`${api}/${encodeURIComponent(remedy.id)}/apply`).then(ok => { if (ok) onApplied?.(); })}>{t.apply}</Button>}
      </article>)}
    </div>}
  </section>;
}
