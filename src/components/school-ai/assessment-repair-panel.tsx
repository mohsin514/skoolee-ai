"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-472: repair a flawed released question. The impact list comes from stored records only; the
// proposer submits the exact previewed plan; a different academic leader confirms and it runs step by
// step with a receipt that survives interruption.
type Group = "CHANGED" | "NEEDS_REVIEW" | "UNCHANGED" | "ALREADY_DELIVERED" | "UNTRACKED";
type ImpactRow = { group: Group; kind: string; recordId: string | null; studentId: string | null; label: string; before: string | null; after: string | null; note: string | null };
type Step = { key: string; type: "RESULT" | "MARK" | "REPORT" | "ACTION_STALE" | "NOTICE"; recipientIds?: string[]; beforeTotal?: number; afterTotal?: number; before?: number; after?: number };
type Receipt = { key: string; status: "APPLIED" | "FAILED"; at: string; detail: string };
type Evidence = { number: number; prompt: string; options: { id: string; text: string }[]; approvedKey: string; proposedKey: string };
type Preview = { fingerprint: string; counts: Record<Group, number>; impact: ImpactRow[]; steps: Step[]; evidence: Evidence };
type Repair = { id: string; status: string; version: number; reason: string; publicExplanation: string; proposedById: string; impact: { counts: Record<Group, number>; rows: ImpactRow[]; evidence: Evidence }; plan: Step[]; receipt: Receipt[]; remaining: string[]; decisionNote: string | null; createdAt: string };
type Question = { id: string; number: number; type: string; prompt: string; options: { id: string; text: string }[] };
type Data = { released: boolean; me: string; canApprove: boolean; questions: Question[]; repairs: Repair[] };

const GROUPS: Group[] = ["CHANGED", "NEEDS_REVIEW", "ALREADY_DELIVERED", "UNCHANGED", "UNTRACKED"];
const GROUP_LABEL: Record<Group, string> = { CHANGED: "Changed", NEEDS_REVIEW: "Needs review", ALREADY_DELIVERED: "Already delivered", UNCHANGED: "Unchanged", UNTRACKED: "Not tracked" };
const KIND_LABEL: Record<string, string> = { RESULT: "Result", RELEASED_RESULT: "Released result", MARK: "Gradebook mark", REPORT: "Report card", LEARNING_ACTION: "Learning action", ITEM_EVIDENCE: "Item evidence decision", PRACTICE: "Practice set", FORMATIVE_CHECK: "Formative check", NOTICE: "Family correction notice", GRADEBOOK: "Gradebook", EXTERNAL: "Outside Skoolee" };
const STEP_LABEL: Record<Step["type"], string> = { RESULT: "Result revision", MARK: "Gradebook mark", REPORT: "Report successor", ACTION_STALE: "Learning action review", NOTICE: "Family correction notice" };
const STATUS_LABEL: Record<string, string> = { PENDING_REVIEW: "Awaiting review", APPLYING: "Applying", APPLIED: "Applied", PARTIAL: "Partly applied", REJECTED: "Rejected", STALE: "Stale — preview again" };

export function AssessmentRepairPanel({ examId }: { examId: string }) {
  const ui = useUiText();
  const { number } = useLocaleFormat();
  const api = `/api/school-ai/exams/${encodeURIComponent(examId)}/repairs`;
  const fid = useId();
  const [data, setData] = useState<Data | null>(null);
  const [questionId, setQuestionId] = useState("");
  const [single, setSingle] = useState("");
  const [multiple, setMultiple] = useState<string[]>([]);
  const [numeric, setNumeric] = useState({ value: "", tolerance: "0" });
  const [reason, setReason] = useState("");
  const [explanation, setExplanation] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Repair | null>(null);
  // F16 / R3: a rejection records its reason in a dialog (was window.prompt).
  const [rejecting, setRejecting] = useState<Repair | null>(null);
  const load = useCallback(async () => { const response = await fetch(api, { cache: "no-store" }).catch(() => null); if (response?.ok) setData(await response.json()); }, [api]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const question = data?.questions.find(entry => entry.id === questionId);
  const correction = useMemo(() => {
    if (!question) return null;
    if (question.type === "SINGLE_CHOICE") return single ? { questionId, correctOptionId: single } : null;
    if (question.type === "MULTIPLE_CHOICE") return multiple.length ? { questionId, correctOptionIds: multiple } : null;
    const value = Number(numeric.value), tolerance = Number(numeric.tolerance);
    return numeric.value !== "" && Number.isFinite(value) && Number.isFinite(tolerance) ? { questionId, numericKey: { value, tolerance } } : null;
  }, [question, questionId, single, multiple, numeric]);
  if (!data) return null;
  if (!data.released) return null;
  const post = async (action: string, body: unknown) => {
    setBusy(true); setError("");
    const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data: body }) }).catch(() => null);
    const payload = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!response?.ok) { setError(typeof payload.error === "string" ? payload.error : ui("The repair could not be saved. Try again.")); await load(); return null; }
    return payload.result;
  };
  const reset = () => { setPreview(null); setError(""); };
  const stepOutcome = (step: Step) => step.type === "RESULT" ? `${number(step.beforeTotal ?? 0)} → ${number(step.afterTotal ?? 0)}`
    : step.type === "MARK" ? `${number(step.before ?? 0)} → ${number(step.after ?? 0)}`
    : step.type === "REPORT" ? ui("Successor prepared for report approval")
    : step.type === "ACTION_STALE" ? ui("Marked for review")
    : ui("Notices to {0} people", [number(step.recipientIds?.length ?? 0)]);
  const recipients = (repair: Repair) => repair.plan.reduce((sum, step) => sum + (step.recipientIds?.length ?? 0), 0);

  return <section aria-labelledby="repair-title" className="sk-panel min-w-0 space-y-3 p-4" data-repair-panel>
    <h3 id="repair-title" className="font-semibold">{ui("Repair a released question")}</h3>
    <p className="text-sm text-ink-subtle">{ui("Preview every score, report, learning action and family notice that depends on a question before anything changes.")}</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="grid min-w-0 gap-1 text-sm font-semibold"><label htmlFor={`${fid}-q`}>{ui("Question")}</label><Select id={`${fid}-q`} value={questionId} onChange={event => { setQuestionId(event.target.value); setSingle(""); setMultiple([]); setNumeric({ value: "", tolerance: "0" }); reset(); }}>
        <option value="">—</option>{data.questions.map(entry => <option key={entry.id} value={entry.id}>{ui("Question {0}", [number(entry.number)])}</option>)}</Select></div>
      {question?.type === "SINGLE_CHOICE" ? <div className="grid min-w-0 gap-1 text-sm font-semibold"><label htmlFor={`${fid}-a`}>{ui("Corrected answer")}</label><Select id={`${fid}-a`} value={single} onChange={event => { setSingle(event.target.value); reset(); }}><option value="">—</option>{question.options.map(option => <option key={option.id} value={option.id}>{option.text}</option>)}</Select></div> : null}
      {question?.type === "NUMERIC" ? <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1 text-sm font-semibold"><label htmlFor={`${fid}-v`}>{ui("Corrected value")}</label><Input id={`${fid}-v`} inputMode="decimal" dir="ltr" value={numeric.value} onChange={event => { setNumeric(v => ({ ...v, value: event.target.value })); reset(); }} /></div>
        <div className="grid gap-1 text-sm font-semibold"><label htmlFor={`${fid}-t`}>{ui("Tolerance")}</label><Input id={`${fid}-t`} inputMode="decimal" dir="ltr" value={numeric.tolerance} onChange={event => { setNumeric(v => ({ ...v, tolerance: event.target.value })); reset(); }} /></div>
      </div> : null}
    </div>
    {question?.type === "MULTIPLE_CHOICE" ? <fieldset className="space-y-1 text-sm"><legend className="font-semibold">{ui("Corrected answers")}</legend>{question.options.map(option => <label key={option.id} className="flex items-center gap-2"><Checkbox checked={multiple.includes(option.id)} onChange={event => { setMultiple(list => event.target.checked ? [...list, option.id] : list.filter(x => x !== option.id)); reset(); }} /><bdi>{option.text}</bdi></label>)}</fieldset> : null}
    <div className="grid gap-1 text-sm font-semibold"><label htmlFor={`${fid}-r`}>{ui("Reason (staff only)")}</label><Textarea id={`${fid}-r`} value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} /></div>
    <div className="grid gap-1 text-sm font-semibold"><label htmlFor={`${fid}-e`}>{ui("Explanation for the family")}</label><Textarea id={`${fid}-e`} value={explanation} onChange={event => setExplanation(event.target.value)} maxLength={1000} /><span className="text-xs font-normal text-ink-muted">{ui("Families see only this explanation and the corrected result.")}</span></div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !correction} onClick={async () => { const result = await post("preview", { correction }); if (result) setPreview(result); }}>{ui("Preview impact")}</Button>
    </div>
    {error ? <p role="alert" className="text-sm font-semibold text-status-error-text">{error}</p> : null}
    {preview ? <div className="space-y-3" data-repair-preview>
      <details className="rounded-xl border border-border p-3 text-sm" data-repair-evidence>
        <summary className="cursor-pointer font-semibold">{ui("Question {0}: approved key and proposed correction", [number(preview.evidence.number)])}</summary>
        <p className="mt-2"><bdi>{preview.evidence.prompt}</bdi></p>
        <ul className="ms-4 list-disc">{preview.evidence.options.map(option => <li key={option.id}><bdi>{option.text}</bdi></li>)}</ul>
        <p className="mt-2">{ui("Approved key")}: <bdi>{preview.evidence.approvedKey}</bdi> → {ui("Proposed key")}: <bdi>{preview.evidence.proposedKey}</bdi></p>
      </details>
      <ImpactMap counts={preview.counts} rows={preview.impact} />
      <Button disabled={busy || !reason.trim() || !explanation.trim() || !preview.steps.some(step => step.type === "RESULT")} onClick={async () => {
        const result = await post("propose", { correction, fingerprint: preview.fingerprint, reason, publicExplanation: explanation, idempotencyKey: crypto.randomUUID() });
        if (result) { setPreview(null); setReason(""); setExplanation(""); await load(); }
      }}>{ui("Submit repair for review")}</Button>
      {!preview.steps.some(step => step.type === "RESULT") ? <p className="text-sm text-ink-muted">{ui("No released result changes with this key.")}</p> : null}
    </div> : null}

    {data.repairs.length ? <ul className="space-y-2" aria-label={ui("Repairs for this exam")}>{data.repairs.map(repair => <li key={repair.id} className="min-w-0 space-y-2 rounded-xl border border-border p-3 text-sm" data-repair={repair.id} data-repair-status={repair.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 font-semibold">{ui("Question {0}", [number(repair.impact.evidence.number)])} · <bdi>{repair.impact.evidence.approvedKey}</bdi> → <bdi>{repair.impact.evidence.proposedKey}</bdi></p>
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold">{ui(STATUS_LABEL[repair.status] ?? repair.status)}</span>
      </div>
      <p className="text-xs text-ink-muted"><bdi>{repair.reason}</bdi></p>
      <details className="min-w-0 rounded-xl border border-border p-2" data-repair-impact>
        <summary className="cursor-pointer text-xs font-semibold">{ui("Affected records")}</summary>
        <div className="mt-2"><ImpactMap counts={repair.impact.counts} rows={repair.impact.rows} /></div>
      </details>
      {repair.receipt.length ? <ol className="space-y-1" aria-label={ui("Repair receipt")} data-repair-receipt>{repair.plan.map(step => { const entry = repair.receipt.find(row => row.key === step.key); return <li key={step.key} className="flex flex-wrap gap-2 text-xs" data-step={step.key} data-step-status={entry?.status ?? "WAITING"}>
        <span className="font-semibold">{ui(STEP_LABEL[step.type])}</span><span>{entry ? (entry.status === "APPLIED" ? ui("Applied") : ui("Failed")) : ui("Waiting")}</span>{entry ? <bdi className="text-ink-muted" dir={entry.status === "APPLIED" && (step.type === "RESULT" || step.type === "MARK") ? "ltr" : undefined}>{entry.status === "FAILED" ? entry.detail : stepOutcome(step)}</bdi> : null}</li>; })}</ol> : null}
      <div className="flex flex-wrap gap-2">
        {repair.status === "PENDING_REVIEW" && data.canApprove && repair.proposedById !== data.me ? <>
          <Button size="sm" disabled={busy} onClick={() => setConfirming(repair)}>{ui("Review and apply")}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(repair)}>{ui("Reject")}</Button>
        </> : null}
        {repair.status === "PENDING_REVIEW" && repair.proposedById === data.me ? <p className="text-xs text-ink-muted">{ui("Another academic leader reviews this repair.")}</p> : null}
        {["APPLYING", "PARTIAL"].includes(repair.status) && data.canApprove ? <Button size="sm" disabled={busy} onClick={async () => { await post("resume", { repairId: repair.id, version: repair.version }); await load(); }}>{ui("Continue unfinished steps")}</Button> : null}
      </div>
    </li>)}</ul> : null}

    <ConfirmAction open={!!confirming} busy={busy} tone="warning" title={ui("Apply this repair?")}
      description={ui("These changes run in order. Results and marks change, reports get a successor for approval, and family notices are sent; sent notices cannot be recalled.")}
      confirmLabel={ui("Apply repair")} cancelLabel={ui("Cancel")}
      detail={confirming ? <div className="space-y-2 text-sm">
        <ul className="list-disc ps-4">{(["RESULT", "MARK", "REPORT", "ACTION_STALE", "NOTICE"] as const).map(type => { const count = confirming.plan.filter(step => step.type === type).length; return count ? <li key={type}>{ui(STEP_LABEL[type])}: {number(count)}</li> : null; })}</ul>
        <ImpactMap counts={confirming.impact.counts} rows={confirming.impact.rows} />
        <p>{ui("Notices to {0} people", [number(recipients(confirming))])}:</p>
        <ul className="list-disc ps-4">{confirming.impact.rows.filter(row => row.kind === "NOTICE" && row.group === "CHANGED").map(row => <li key={row.studentId ?? row.label}><bdi>{row.label}</bdi>{row.note ? <> · {ui("Guardians")}: <bdi>{row.note}</bdi></> : null}</li>)}</ul>
        <p className="font-semibold">{ui("Family explanation")}: <bdi className="font-normal">{confirming.publicExplanation}</bdi></p>
      </div> : null}
      // §4.5.5 / R3 / R4: the shared typed-reason field — Confirm stays disabled until the note is written (inline,
      // never a toast or a page-level error).
      requireReason={{ label: ui("Approval note"), minLength: 1 }}
      onCancel={() => setConfirming(null)}
      onConfirm={async (approvalNote) => { if (!confirming || !approvalNote) return; const target = confirming; setConfirming(null); await post("decide", { repairId: target.id, version: target.version, decision: "APPROVE", note: approvalNote }); await load(); }} />

    <ConfirmAction open={!!rejecting} busy={busy} tone="danger" title={ui("Reject this repair?")}
      description={ui("The answer key and released results stay as they are. The person who proposed the repair sees your reason.")}
      confirmLabel={ui("Reject")} cancelLabel={ui("Keep editing")}
      requireReason={{ label: ui("Why is this repair rejected?"), minLength: 10, placeholder: ui("At least 10 characters. The person who proposed the repair sees it.") }}
      onCancel={() => setRejecting(null)}
      onConfirm={async (rejection) => { if (!rejecting || !rejection) return; const target = rejecting; setRejecting(null); await post("decide", { repairId: target.id, version: target.version, decision: "REJECT", note: rejection }); await load(); }} />
  </section>;
}

/** The accessible impact list: counts first, then every record by group with its before and after. */
function ImpactMap({ counts, rows }: { counts: Record<Group, number>; rows: ImpactRow[] }) {
  const ui = useUiText();
  const { number } = useLocaleFormat();
  return <div className="min-w-0 space-y-2" data-impact-map>
    <ul className="flex flex-wrap gap-2" aria-label={ui("Impact summary")}>{GROUPS.map(group => <li key={group} className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold" data-impact-count={group}>{ui(GROUP_LABEL[group])}: {number(counts[group] ?? 0)}</li>)}</ul>
    {GROUPS.map(group => { const list = rows.filter(row => row.group === group); return list.length ? <section key={group} aria-label={ui(GROUP_LABEL[group])} className="min-w-0" data-impact-group={group}>
      <h4 className="text-sm font-bold">{ui(GROUP_LABEL[group])} ({number(list.length)})</h4>
      <ul className="divide-y divide-border rounded-xl border border-border">{list.map((row, index) => <li key={`${row.kind}-${row.recordId ?? index}-${row.studentId ?? ""}`} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-2 text-sm" data-impact-kind={row.kind}>
        <span className="min-w-0"><span className="font-semibold">{ui(KIND_LABEL[row.kind] ?? row.kind)}</span> · <bdi>{row.label}</bdi>{row.note ? <span className="block text-xs text-ink-muted [overflow-wrap:anywhere]"><bdi>{ui(row.note)}</bdi></span> : null}</span>
        {row.before !== null || row.after !== null ? <span className="shrink-0 font-mono text-xs" dir="ltr">{row.before ?? "—"} → {row.after ?? "—"}</span> : null}
      </li>)}</ul>
    </section> : null; })}
  </div>;
}
