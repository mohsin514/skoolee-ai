"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-424: moderation queue for one exam — pending corrections (original beside proposed, approval by
// someone else), learners' review requests, and second-marking samples with blind marking and a
// visible discrepancy threshold. A proposal never changes the published result.

type Correction = { id: string; attemptId: string; fromVersion: number; previousTotal: number; proposedTotal: number; reason: string; source: string; status: string; decisionNote: string | null; version: number; canDecide: boolean };
type Appeal = { id: string; attemptId: string; resultVersion: number; status: string; reason: string; disputedQuestionIds: string[]; requestedOutcome: string | null; resolution: string | null };
type Item = { attemptId: string; originalTotal: number | null; secondTotal: number | null; discrepancy: number | null; flagged: boolean; outcome: string | null; note: string | null; secondMarks: { questionId: string; marks: number }[] | null };
type Sample = { id: string; method: string; size: number; threshold: number; blind: boolean; reviewerId: string; status: string; version: number; items: Item[] };
type Overview = { released: boolean; userId: string; reviewers: { id: string; fullName: string }[]; questions: { id: string; number: number; marks: number }[]; corrections: Correction[]; appeals: Appeal[]; samples: Sample[] };

const STATUS_LABEL: Record<string, string> = { PENDING: "Awaiting approval", APPROVED: "Approved", REJECTED: "Rejected", SUPERSEDED: "Superseded", OPEN: "Open", UPHELD: "Upheld", DISMISSED: "Dismissed", RESOLVED: "Resolved", COMPLETE: "Complete" };
const SOURCE_LABEL: Record<string, string> = { REGRADE: "Regrade", APPEAL: "Review request", MODERATION: "Moderation", KEY_CORRECTION: "Answer key correction" };
const METHOD_LABEL: Record<string, string> = { RANDOM: "Random", LOWEST: "Lowest totals", HIGHEST: "Highest totals" };
const OUTCOME_LABEL: Record<string, string> = { ORIGINAL_CONFIRMED: "Original confirmed", CORRECTED: "Corrected", CORRECTION_PROPOSED: "Correction awaiting approval" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok) throw new Error(json?.error || "Request failed");
  return json.result;
}

export function ExamModerationPanel({ examId }: { examId: string }) {
  const ui = useUiText();
  const { number } = useLocaleFormat();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sampleForm, setSampleForm] = useState({ method: "RANDOM", size: "5", threshold: "1", blind: true, reviewerId: "" });
  const base = `/api/school-ai/exams/${encodeURIComponent(examId)}/moderation`;
  const load = useCallback(async () => {
    try { setData(await call(base)); setError(null); } catch (e) { setError(ui((e as Error).message)); }
  }, [base, ui]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object, success: string) => {
    try { await call(base, { method: "POST", body: JSON.stringify(body) }); setNotice(ui(success)); setError(null); await load(); return true; }
    catch (e) { setError(ui((e as Error).message)); setNotice(null); return false; }
  };
  if (!data) return <section className="sk-panel p-4"><p role="status" className="text-sm text-ink-subtle">{error ?? ui("Loading moderation…")}</p></section>;
  const n = (v: number | null) => (v == null ? "—" : number(v));
  return (
    <section aria-labelledby="moderation-heading" className="sk-panel space-y-4 p-4">
      <h3 id="moderation-heading" className="font-semibold">{ui("Moderation and corrections")}</h3>
      <p className="text-sm text-ink-subtle">{ui(data.released ? "Results are released: any change needs a correction approved by a different reviewer. A request or proposal does not change the published result." : "Results are not released yet: reviewers can revise marks directly.")}</p>
      <div aria-live="polite">
        {error ? <p role="alert" className="text-sm font-semibold text-status-error-text">{error}</p> : null}
        {notice ? <p role="status" className="text-sm font-semibold text-emerald-800">{notice}</p> : null}
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold">{ui("Corrections")}</h4>
        {data.corrections.length === 0 ? <p className="text-sm text-ink-subtle">{ui("No corrections have been proposed.")}</p> : data.corrections.map((c) => (
          <div key={c.id} className="space-y-2 rounded-xl border border-border p-3 text-sm">
            <p className="font-semibold">{ui(SOURCE_LABEL[c.source] ?? c.source)} · {ui(STATUS_LABEL[c.status] ?? c.status)}</p>
            <dl className="grid grid-cols-2 gap-2 sm:max-w-sm">
              <div><dt className="text-xs text-ink-subtle">{ui("Original")}</dt><dd className="font-semibold">{number(c.previousTotal)}</dd></div>
              <div><dt className="text-xs text-ink-subtle">{ui("Proposed")}</dt><dd className="font-semibold">{number(c.proposedTotal)}</dd></div>
            </dl>
            <p>{ui("Reason")}: <bdi>{c.reason}</bdi></p>
            {c.decisionNote ? <p className="text-ink-subtle">{ui("Decision note")}: <bdi>{c.decisionNote}</bdi></p> : null}
            {c.status === "PENDING" && !c.canDecide ? <p className="text-xs text-ink-subtle">{ui("An independent reviewer must approve this correction.")}</p> : null}
            {c.canDecide ? (
              <div className="flex flex-wrap items-end gap-2">
                <FormField name={`decision-${c.id}`} label={ui("Decision note")} className="min-w-[14rem] flex-1"><Input value={notes[c.id] ?? ""} onChange={(e) => setNotes((x) => ({ ...x, [c.id]: e.target.value }))} /></FormField>
                <Button size="sm" onClick={() => post({ action: "decide", data: { correctionId: c.id, version: c.version, decision: "APPROVE", note: notes[c.id] ?? "" } }, "Correction approved and recorded as a new result version.")}>{ui("Approve correction")}</Button>
                <Button size="sm" variant="outline" onClick={() => post({ action: "decide", data: { correctionId: c.id, version: c.version, decision: "REJECT", note: notes[c.id] ?? "" } }, "Correction rejected; its evidence and reason are kept.")}>{ui("Reject")}</Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold">{ui("Review requests from learners")}</h4>
        {data.appeals.length === 0 ? <p className="text-sm text-ink-subtle">{ui("No review requests.")}</p> : data.appeals.map((a) => (
          <div key={a.id} className="rounded-xl border border-border p-3 text-sm">
            <p className="font-semibold">{ui(STATUS_LABEL[a.status] ?? a.status)} · {ui("Result version {0}", [a.resultVersion])}</p>
            <p><bdi>{a.reason}</bdi></p>
            {a.disputedQuestionIds.length ? <p className="text-ink-subtle">{ui("Disputed questions")}: {a.disputedQuestionIds.map((qid) => data.questions.find((q) => q.id === qid)?.number ?? qid).join(", ")}</p> : null}
            {a.requestedOutcome ? <p className="text-ink-subtle">{ui("Requested outcome")}: <bdi>{a.requestedOutcome}</bdi></p> : null}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold">{ui("Second-marking samples")}</h4>
        <form className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={async (e) => {
          e.preventDefault();
          await post({ action: "sample", data: { method: sampleForm.method, size: Number(sampleForm.size), threshold: Number(sampleForm.threshold), blind: sampleForm.blind, reviewerId: sampleForm.reviewerId } }, "Sample created and assigned.");
        }}>
          <FormField name="sample-method" label={ui("Selection rule")}><Select value={sampleForm.method} onChange={(e) => setSampleForm((f) => ({ ...f, method: e.target.value }))}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
          <FormField name="sample-size" label={ui("Scripts")}><Input inputMode="numeric" dir="ltr" value={sampleForm.size} onChange={(e) => setSampleForm((f) => ({ ...f, size: e.target.value }))} /></FormField>
          <FormField name="sample-threshold" label={ui("Flag a difference above (marks)")}><Input inputMode="decimal" dir="ltr" value={sampleForm.threshold} onChange={(e) => setSampleForm((f) => ({ ...f, threshold: e.target.value }))} /></FormField>
          <FormField name="sample-reviewer" label={ui("Second marker")}><Select value={sampleForm.reviewerId} onChange={(e) => setSampleForm((f) => ({ ...f, reviewerId: e.target.value }))}><option value="">{ui("Choose a reviewer")}</option>{data.reviewers.map((r) => <option key={r.id} value={r.id}>{r.fullName}</option>)}</Select></FormField>
          <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={sampleForm.blind} onChange={(e) => setSampleForm((f) => ({ ...f, blind: e.target.checked }))} /> {ui("Blind: hide original marks from the second marker")}</label>
          <div className="sm:col-span-2 lg:col-span-5"><Button type="submit" size="sm" disabled={!sampleForm.reviewerId}>{ui("Create sample")}</Button></div>
        </form>
        {data.samples.map((s) => <SampleCard key={s.id} sample={s} data={data} post={post} n={n} />)}
      </div>
    </section>
  );
}

function SampleCard({ sample, data, post, n }: { sample: Sample; data: Overview; post: (body: object, success: string) => Promise<boolean>; n: (v: number | null) => string }) {
  const ui = useUiText();
  const [marks, setMarks] = useState<Record<string, Record<string, string>>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const reviewer = sample.reviewerId === data.userId;
  return (
    <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
      <p className="font-medium tabular-nums text-ink">{ui(METHOD_LABEL[sample.method] ?? sample.method)} · {ui("{0} scripts", [sample.size])} · {ui("threshold {0}", [sample.threshold])} · {ui(STATUS_LABEL[sample.status] ?? sample.status)}{sample.blind ? ` · ${ui("Blind")}` : ""}</p>
      <ul className="space-y-2">
        {sample.items.map((item, index) => (
          <li key={item.attemptId} className={`rounded-lg border p-2 ${item.flagged && !item.outcome ? "border-status-warning-border bg-status-warning-surface" : "border-border"}`}>
            <p>{ui("Script {0}", [index + 1])} · {ui("Original")}: {item.originalTotal == null ? ui("hidden until you mark") : n(item.originalTotal)} · {ui("Second mark")}: {n(item.secondTotal)}{item.discrepancy != null ? ` · ${ui("Difference")}: ${n(item.discrepancy)}` : ""}</p>
            {item.flagged ? <p className="text-xs font-semibold text-status-warning-text">{ui(item.outcome ? OUTCOME_LABEL[item.outcome] ?? item.outcome : "Difference above the threshold: a lead must decide.")}</p> : null}
            {reviewer && item.secondTotal == null ? (
              <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => {
                e.preventDefault();
                const entries = data.questions.map((q) => ({ questionId: q.id, marks: Number(marks[item.attemptId]?.[q.id] ?? "") })).filter((m) => Number.isFinite(m.marks) && (marks[item.attemptId]?.[m.questionId] ?? "") !== "");
                await post({ action: "second-mark", sampleId: sample.id, data: { attemptId: item.attemptId, version: sample.version, marks: entries } }, "Second mark recorded.");
              }}>
                {data.questions.map((q) => <FormField key={q.id} name={`sm-${item.attemptId}-${q.id}`} label={ui("Q{0} (of {1})", [q.number, q.marks])} className="w-24"><Input inputMode="decimal" dir="ltr" value={marks[item.attemptId]?.[q.id] ?? ""} onChange={(e) => setMarks((m) => ({ ...m, [item.attemptId]: { ...(m[item.attemptId] ?? {}), [q.id]: e.target.value } }))} /></FormField>)}
                <Button type="submit" size="sm">{ui("Record second mark")}</Button>
              </form>
            ) : null}
            {!reviewer && item.flagged && !item.outcome ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <FormField name={`resolve-${item.attemptId}`} label={ui("Reason")} className="min-w-[14rem] flex-1"><Input value={reasons[item.attemptId] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [item.attemptId]: e.target.value }))} /></FormField>
                <Button size="sm" variant="outline" onClick={() => post({ action: "resolve", sampleId: sample.id, data: { attemptId: item.attemptId, version: sample.version, outcome: "CONFIRM_ORIGINAL", reason: reasons[item.attemptId] ?? "" } }, "Original mark confirmed.")}>{ui("Keep original")}</Button>
                {item.secondMarks ? <Button size="sm" onClick={() => post({ action: "resolve", sampleId: sample.id, data: { attemptId: item.attemptId, version: sample.version, outcome: "PROPOSE_CORRECTION", reason: reasons[item.attemptId] ?? "",
                  review: { note: reasons[item.attemptId] || "Moderated", marks: item.secondMarks!.map((m) => ({ questionId: m.questionId, marks: m.marks, feedback: "Moderated mark" })) } } }, data.released ? "Correction proposed; it needs approval by another reviewer." : "Mark corrected from the second marking.")}>{ui("Use the second mark")}</Button> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
