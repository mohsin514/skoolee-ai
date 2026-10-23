"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioResultsCopy } from "@/lib/school-ai/exam-studio-copy-results";
import type { MapOutcome, MistakeMap } from "@/lib/school-ai/mistake-map";
import { MAP_MINIMUM_LEARNERS } from "@/lib/school-ai/mistake-map";
import { Isolated } from "./space-state";

/**
 * SKO-504 Mistake Map and Next Ten Minutes. The map is arithmetic over moderated marks: one row per
 * outcome, one cell per learner, items under question left out and listed apart. Ticking an outcome
 * proposes a ten-minute remediation with three released practice items, which the teacher confirms.
 */
const CELL: Record<string, { tone: string; key: "cellAddressed" | "cellPartial" | "cellMissed" | "cellBlank"; mark: string }> = {
  ADDRESSED: { tone: "bg-status-success-surface text-status-success-text", key: "cellAddressed", mark: "✓" },
  PARTIAL: { tone: "bg-status-warning-surface text-status-warning-text", key: "cellPartial", mark: "◐" },
  MISSED: { tone: "bg-status-error-surface text-status-error-text", key: "cellMissed", mark: "✕" },
  NOT_ANSWERED: { tone: "bg-surface-muted text-ink-subtle", key: "cellBlank", mark: "·" },
};

type Proposal = { sourceAssignmentId: string; questionId: string; number: number; sittingTitle: string; prompt: string; percentage: number | null };
type Plan = { outcomeId: string; title: string | null; plan: ReadonlyArray<{ step: "RETEACH" | "PRACTISE" | "CHECK"; minutes: number }>; proposals: Proposal[]; check: Proposal | null };

async function post<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "failed");
  return payload as T;
}

export function MistakeMapPanel({ examId, map, language, canCreate, onPractice }: { examId: string; map: MistakeMap; language: Language; canCreate: boolean; onPractice: () => void }) {
  const t = studioResultsCopy(language);
  const number = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  const [ticked, setTicked] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const tick = async (outcome: MapOutcome) => {
    setTicked(outcome.outcomeId); setPlan(null); setError(""); setNotice(""); setBusy(true);
    try { setPlan((await post<{ result: Plan }>(`/api/school-ai/exams/${encodeURIComponent(examId)}/next-lesson`, { action: "propose", data: { outcomeId: outcome.outcomeId } })).result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : ""); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!plan) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { result } = await post<{ result: { id: string; version: number } }>(`/api/school-ai/exams/${encodeURIComponent(examId)}/next-lesson`, { action: "confirm", data: { outcomeId: plan.outcomeId, items: plan.proposals.map(item => ({ sourceAssignmentId: item.sourceAssignmentId, questionId: item.questionId })) } });
      // Under the classroom tier the teacher approves their own practice; otherwise it waits in review.
      const reviewed = await post<{ record: { version: number } }>(`/api/school-ai/workspace/${encodeURIComponent(result.id)}`, { version: result.version, action: "review" }, "PATCH").catch(() => null);
      const approved = reviewed ? await post(`/api/school-ai/workspace/${encodeURIComponent(result.id)}`, { version: reviewed.record?.version ?? result.version + 1, action: "approve" }, "PATCH").then(() => true).catch(() => false) : false;
      setNotice(approved ? t.planApproved : t.planSaved);
      onPractice();
    } catch (cause) { setError(cause instanceof Error ? cause.message : ""); }
    finally { setBusy(false); }
  };
  const label = (outcome: { title: string | null; outcomeId: string }) => outcome.title ?? outcome.outcomeId;
  return <section aria-labelledby="mistake-map" className="sk-panel space-y-3 p-4" data-mistake-map>
    <h3 id="mistake-map" className="font-semibold">{t.mapTitle}</h3>
    <p className="text-sm text-ink-subtle">{t.mapIntro}</p>
    {!map.learners.length ? <p className="text-sm text-ink-subtle">{t.mapEmpty}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[32rem] border-separate border-spacing-1 text-sm">
      <thead><tr><th scope="col" className="p-2 text-start text-xs text-ink-subtle">{t.mapOutcome}</th>{map.learners.map(learner => <th key={learner.attemptId} scope="col" className="max-w-24 p-1 text-start text-xs font-semibold"><Isolated className="line-clamp-2">{learner.name ?? "—"}</Isolated></th>)}</tr></thead>
      <tbody>{map.outcomes.map(outcome => <tr key={outcome.outcomeId} data-map-outcome={outcome.outcomeId} data-map-reading={outcome.reading}>
        <th scope="row" className="min-w-48 p-2 text-start align-top font-normal">
          <p className="font-semibold"><bdi dir="auto">{label(outcome)}</bdi></p>
          <p className="text-xs text-ink-subtle">{outcome.reading === "MEASURED" ? fillStudioCopy(t.mapEvidence, [number(outcome.learners), number(outcome.lost), number(outcome.possible)]) : fillStudioCopy(t.mapNotMeasured, [number(MAP_MINIMUM_LEARNERS)])}</p>
          {canCreate && outcome.reading === "MEASURED" && outcome.lost > 0 && <label className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold"><input type="radio" name="map-outcome" className="size-4" checked={ticked === outcome.outcomeId} disabled={busy} onChange={() => void tick(outcome)} data-plan-outcome />{t.planOutcome}</label>}
        </th>
        {map.learners.map(learner => { const cell = outcome.cells.find(entry => entry.attemptId === learner.attemptId); const style = CELL[cell?.status ?? "NOT_ANSWERED"];
          return <td key={learner.attemptId} className={`rounded-lg p-1 text-center align-middle ${outcome.reading === "MEASURED" ? style.tone : "bg-surface-muted text-ink-subtle"}`} title={t[style.key]}><span aria-hidden="true">{outcome.reading === "MEASURED" ? style.mark : "—"}</span><span className="sr-only">{outcome.reading === "MEASURED" ? t[style.key] : t.mapNotMeasured.replace("{0}", String(MAP_MINIMUM_LEARNERS))}</span>{cell && cell.status !== "NOT_ANSWERED" && <span className="block text-xs tabular-nums">{number(cell.awarded)}/{number(cell.possible)}</span>}</td>; })}
      </tr>)}</tbody>
    </table></div>}
    <ul className="flex flex-wrap gap-3 text-xs text-ink-subtle" aria-hidden="true">{(["ADDRESSED", "PARTIAL", "MISSED", "NOT_ANSWERED"] as const).map(key => <li key={key} className="flex items-center gap-1"><span className={`inline-flex size-5 items-center justify-center rounded ${CELL[key].tone}`}>{CELL[key].mark}</span>{t[CELL[key].key]}</li>)}</ul>
    {map.excluded.length > 0 && <div className="space-y-1" data-map-excluded><h4 className="text-sm font-semibold">{t.excludedTitle}</h4><ul className="list-inside list-disc text-sm">{map.excluded.map(item => <li key={item.questionId}>{fillStudioCopy(t.excludedItem, [number(item.number)])}</li>)}</ul></div>}
    {map.distractors.length > 0 && <div className="space-y-1" data-map-distractors><h4 className="text-sm font-semibold">{t.distractorTitle}</h4><ul className="list-inside list-disc text-sm">{map.distractors.map(row => <li key={`${row.questionId}:${row.option}`}>{fillStudioCopy(t.distractorRow, [number(row.number), number(row.count), number(row.answered), `⁨${row.option}⁩`])}</li>)}</ul></div>}
    {error && <p role="alert" className="text-sm text-status-error-text"><bdi dir="auto">{error}</bdi></p>}
    {plan && <div className="space-y-3 rounded-xl border border-border p-3" data-next-ten-minutes>
      <h4 className="font-semibold">{t.tenTitle} · <bdi dir="auto">{label(plan)}</bdi></h4>
      <ol className="list-inside list-decimal space-y-1 text-sm">{plan.plan.map(step => <li key={step.step}>{step.step === "RETEACH" ? fillStudioCopy(t.tenReteach, [`⁨${label(plan)}⁩`, number(step.minutes)]) : step.step === "PRACTISE" ? fillStudioCopy(t.tenPractise, [number(step.minutes)]) : fillStudioCopy(t.tenCheck, [number(step.minutes)])}</li>)}</ol>
      <h5 className="text-sm font-semibold">{t.proposalsTitle}</h5>
      {!plan.proposals.length ? <p className="text-sm text-ink-subtle">{t.proposalNone}</p> : <>
        {plan.proposals.length < 3 && <p className="text-sm text-ink-subtle">{fillStudioCopy(t.proposalFew, [number(plan.proposals.length)])}</p>}
        <ul className="grid gap-2">{plan.proposals.map(item => <li key={`${item.sourceAssignmentId}:${item.questionId}`} className="rounded-lg border border-border p-2 text-sm" data-proposal><p className="text-xs font-semibold text-ink-subtle">{fillStudioCopy(t.proposalItem, [number(item.number), `⁨${item.sittingTitle}⁩`])}</p><p dir="auto" className="line-clamp-3">{item.prompt}</p></li>)}</ul>
        <Button disabled={busy} onClick={() => void confirm()} data-confirm-plan>{t.confirmPlan}</Button>
      </>}
    </div>}
    {notice && <p role="status" className="text-sm text-status-success-text" data-plan-notice>{notice}</p>}
  </section>;
}

type FamilyNote = { id: string; studentId: string; name: string | null; language: string; sentence: string; status: "DRAFT" | "SENT"; version: number; gate: "OPEN" | "WAITING_FOR_REPORT_CARD"; hasGuardian: boolean };
const LANGUAGE_NAME: Record<string, string> = { en: "English", ar: "العربية", ur: "اردو" };

export function FamilyNotesPanel({ examId, language, canCreate }: { examId: string; language: Language; canCreate: boolean }) {
  const t = studioResultsCopy(language);
  const [notes, setNotes] = useState<FamilyNote[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = `/api/school-ai/exams/${encodeURIComponent(examId)}/family-notes`;
  const load = useCallback(async () => {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setNotes(payload.notes); else setError(typeof payload.error === "string" ? payload.error : "");
  }, [url]);
  useEffect(() => { void load(); }, [load]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await work(); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : ""); } finally { setBusy(false); }
  };
  return <section aria-labelledby="family-notes" className="sk-panel space-y-3 p-4" data-family-notes-desk>
    <h3 id="family-notes" className="font-semibold">{t.noteTitle}</h3>
    <p className="text-sm text-ink-subtle">{t.noteIntro}</p>
    {canCreate && <Button variant="outline" disabled={busy} onClick={() => void run(async () => setNotes((await post<{ notes: FamilyNote[] }>(url, {})).notes))} data-draft-notes>{t.noteDraft}</Button>}
    {error && <p role="alert" className="text-sm text-status-error-text"><bdi dir="auto">{error}</bdi></p>}
    {notes && notes.length > 0 && <ul className="grid gap-2">{notes.map(note => {
      const value = edits[note.id] ?? note.sentence;
      return <li key={note.id} className="space-y-2 rounded-xl border border-border p-3" data-family-note-row={note.status}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><Isolated className="font-semibold">{note.name ?? "—"}</Isolated><span className="text-xs text-ink-subtle">{fillStudioCopy(t.noteLanguage, [LANGUAGE_NAME[note.language] ?? note.language])}</span></div>
        {note.status === "SENT" ? <p lang={note.language} dir={note.language === "en" ? "ltr" : "rtl"} className="text-sm">{note.sentence}</p>
          : <Textarea aria-label={t.noteSentence} lang={note.language} dir={note.language === "en" ? "ltr" : "rtl"} rows={2} maxLength={400} value={value} disabled={busy || !canCreate} onChange={event => setEdits(previous => ({ ...previous, [note.id]: event.target.value }))} />}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {note.status === "SENT" ? <span className="font-semibold text-status-success-text">{t.noteSent}</span> : <>
            {canCreate && value !== note.sentence && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { await post(`/api/school-ai/family-notes/${encodeURIComponent(note.id)}`, { action: "save", version: note.version, sentence: value }, "PATCH"); setEdits(previous => { const next = { ...previous }; delete next[note.id]; return next; }); })}>{t.noteSave}</Button>}
            {!note.hasGuardian ? <span className="text-ink-subtle">{t.noteNoGuardian}</span> : note.gate !== "OPEN" ? <span className="text-status-warning-text">{t.noteGated}</span>
              : canCreate && value === note.sentence && <Button size="sm" disabled={busy} onClick={() => void run(() => post(`/api/school-ai/family-notes/${encodeURIComponent(note.id)}`, { action: "send", version: note.version }, "PATCH"))} data-send-note>{t.noteSend}</Button>}
          </>}
        </div>
      </li>;
    })}</ul>}
  </section>;
}
