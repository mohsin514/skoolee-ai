"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-422: question-level evidence with denominators first, then the teacher's interpretation:
// a hypothesis citing real answers, a flag on the question, or a temporary practice group that
// becomes draft learning actions. No mark or grade changes here.

type State = "CORRECT" | "PARTIAL" | "INCORRECT" | "UNANSWERED" | "NOT_CHOSEN" | "AWAITING_REVIEW" | "NOT_ATTEMPTED" | "EXCLUDED";
type Decision = { id: string; kind: "HYPOTHESIS" | "FLAG"; flagCategory: string | null; statement: string; reason: string; status: string; stale: boolean; version: number; citedAttemptIds: string[]; groupStudentIds: string[]; actionPlanIds: string[] };
type Item = { key: string; paperVersion: number; prompt: string; assignments: string[]; outcomes: { id: string; title: string }[]; maxMarks: number;
  counts: Record<State, number> & { expected: number; answered: number }; percentCorrect: number | null; caution: string | null;
  choices: { optionId: string; label: string; count: number; correct: boolean }[]; evidenceHash: string; decisions: Decision[] };
type Evidence = { minSample: number; rules: string[]; items: Item[] };
type Response = { studentId: string; attemptId: string | null; state: State; answerLabel: string | null; marks: number | null; maxMarks: number; fullName: string; rollNo: string };

const STATE_LABEL: Record<State, string> = { CORRECT: "Full marks", PARTIAL: "Part marks", INCORRECT: "No marks", UNANSWERED: "Left blank", NOT_CHOSEN: "Chose another question", AWAITING_REVIEW: "Awaiting review", NOT_ATTEMPTED: "Not attempted", EXCLUDED: "Excluded" };
const FLAG_LABEL: Record<string, string> = { AMBIGUOUS: "Ambiguous wording", KEY_ERROR: "Answer key may be wrong", CURRICULUM_MISMATCH: "Not taught or off-curriculum", OTHER: "Other question problem" };
const KIND_LABEL: Record<string, string> = { HYPOTHESIS: "Possible misconception", FLAG: "Question flag" };
const STATEMENT_LABEL: Record<string, string> = { HYPOTHESIS: "Skill to revisit (describe the skill, not the learner)", FLAG: "Describe the problem" };
const SAVED_NOTICE: Record<string, string> = { HYPOTHESIS: "Hypothesis recorded with its cited answers.", FLAG: "Question flagged for moderation." };
const STATUS_LABEL: Record<string, string> = { OPEN: "Open", DISMISSED: "Dismissed", RESOLVED: "Resolved", GROUP_APPROVED: "Practice group approved" };

/** The server's caution as a catalog key; its count is re-inserted as {0}. */
const cautionCopy = (caution: string | null) => (caution?.startsWith("Only") ? LIMITED : NONE_YET);
const LIMITED = "Only {0} reviewed answers: interpretation is limited.";
const NONE_YET = "No reviewed answers yet.";

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok) throw new Error(json?.error || "Request failed");
  return json.result;
}

export function ItemEvidencePanel({ recordId, disabled }: { recordId: string; disabled: boolean }) {
  const ui = useUiText();
  const [data, setData] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await call(`/api/school-ai/item-evidence?recordId=${encodeURIComponent(recordId)}`)); setError(null); }
    catch (e) { setError(ui((e as Error).message)); }
  }, [recordId, ui]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object, success: string) => {
    try { const result = await call("/api/school-ai/item-evidence", { method: "POST", body: JSON.stringify(body) }); setNotice(ui(success)); setError(null); await load(); return result; }
    catch (e) { setError(ui((e as Error).message)); setNotice(null); return null; }
  };
  if (!data) return <p role="status" className="text-sm text-ink-subtle">{error ?? ui("Loading question evidence…")}</p>;
  return (
    <section className="space-y-3" aria-labelledby="item-evidence-heading">
      <h4 id="item-evidence-heading" className="font-semibold">{ui("Question-level evidence")}</h4>
      <details className="text-sm text-ink-subtle"><summary className="cursor-pointer">{ui("How these numbers are calculated")}</summary><ul className="mt-2 list-disc space-y-1 ps-5">{data.rules.map((rule) => <li key={rule}>{ui(rule, [data.minSample])}</li>)}</ul></details>
      <div aria-live="polite">
        {error ? <p role="alert" className="text-sm font-semibold text-status-error-text">{error}</p> : null}
        {notice ? <p role="status" className="text-sm font-semibold text-emerald-800">{notice}</p> : null}
      </div>
      {data.items.length === 0 ? <p className="text-sm">{ui("Question-level evidence is needed before suggesting skills to revisit.")}</p> : null}
      {data.items.map((item) => <ItemCard key={item.key} item={item} recordId={recordId} disabled={disabled} post={post} />)}
    </section>
  );
}

function ItemCard({ item, recordId, disabled, post }: { item: Item; recordId: string; disabled: boolean; post: (body: object, success: string) => Promise<unknown> }) {
  const ui = useUiText();
  const { number } = useLocaleFormat();
  const [responses, setResponses] = useState<Response[] | null>(null);
  const [cited, setCited] = useState<string[]>([]);
  const [mode, setMode] = useState<"none" | "HYPOTHESIS" | "FLAG">("none");
  const [statement, setStatement] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("AMBIGUOUS");
  const openFlag = item.decisions.some((d) => d.kind === "FLAG" && d.status === "OPEN");
  const loadResponses = async () => {
    try { setResponses((await call(`/api/school-ai/item-evidence?recordId=${encodeURIComponent(recordId)}&item=${encodeURIComponent(item.key)}`)).responses); } catch { setResponses([]); }
  };
  const lost = (r: Response) => r.state === "INCORRECT" || r.state === "PARTIAL";
  const c = item.counts;
  return (
    <details className="rounded-xl border border-border p-3">
      <summary className="cursor-pointer break-words text-sm font-semibold"><bdi>{item.prompt}</bdi> · {ui("Version {0}", [item.paperVersion])}{openFlag ? <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{ui("Question flagged")}</span> : null}</summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-ink-subtle">{item.outcomes.length ? <>{ui("Objectives")}: <bdi>{item.outcomes.map((o) => o.title).join(", ")}</bdi></> : ui("Not mapped to an objective: there is not enough evidence to interpret this question.")}</p>
        <table className="w-full text-start text-sm">
          <caption className="sr-only">{ui("Responses to this question")}</caption>
          <tbody>
            <tr><th scope="row" className="text-start font-semibold">{ui("Reviewed answers")}</th><td>{ui("{0} of {1} learners", [c.answered, c.expected])}</td></tr>
            <tr><th scope="row" className="text-start font-normal">{ui(STATE_LABEL.CORRECT)} / {ui(STATE_LABEL.PARTIAL)} / {ui(STATE_LABEL.INCORRECT)}</th><td dir="ltr" className="text-start">{c.CORRECT} / {c.PARTIAL} / {c.INCORRECT}</td></tr>
            <tr><th scope="row" className="text-start font-normal">{ui("Not counted")}</th><td>{ui("Left blank {0} · Chose another question {1} · Awaiting review {2} · Not attempted {3} · Excluded {4}", [c.UNANSWERED, c.NOT_CHOSEN, c.AWAITING_REVIEW, c.NOT_ATTEMPTED, c.EXCLUDED])}</td></tr>
            <tr><th scope="row" className="text-start font-normal">{ui("Full marks")}</th><td>{item.percentCorrect == null ? <span className="text-amber-900">{ui(cautionCopy(item.caution), [c.answered])}</span> : <bdi dir="ltr">{number(item.percentCorrect)}% ({c.CORRECT}/{c.answered})</bdi>}</td></tr>
          </tbody>
        </table>
        {item.choices.length ? <ul className="space-y-1">{item.choices.map((choice) => <li key={choice.optionId}><bdi>{choice.label}</bdi>{choice.correct ? ` (${ui("key")})` : ""}: {choice.count}</li>)}</ul> : null}

        {item.decisions.map((d) => <DecisionRow key={d.id} decision={d} responses={responses} post={post} disabled={disabled} />)}

        <Button type="button" variant="outline" size="sm" onClick={loadResponses}>{ui("Show the answers")}</Button>
        {responses ? (
          <fieldset className="space-y-1">
            <legend className="font-semibold">{ui("Answers (cite the ones your interpretation rests on)")}</legend>
            {responses.map((r) => (
              <label key={`${r.studentId}:${r.attemptId}`} className="flex min-h-9 items-center gap-2">
                <Checkbox disabled={!lost(r) || !r.attemptId} checked={!!r.attemptId && cited.includes(r.attemptId)} onChange={(e) => setCited((cur) => e.target.checked ? [...cur, r.attemptId!] : cur.filter((id) => id !== r.attemptId))} />
                <span><bdi>{r.fullName}</bdi> · {ui(STATE_LABEL[r.state])}{r.answerLabel ? <> · <bdi>{r.answerLabel}</bdi></> : null}{r.marks != null ? <> · <bdi dir="ltr">{r.marks}/{r.maxMarks}</bdi></> : null}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {!disabled ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={mode === "HYPOTHESIS" ? "default" : "outline"} disabled={openFlag || !item.outcomes.length} onClick={() => setMode("HYPOTHESIS")}>{ui("Record a possible misconception")}</Button>
            <Button type="button" size="sm" variant={mode === "FLAG" ? "default" : "outline"} onClick={() => setMode("FLAG")}>{ui("Flag the question instead")}</Button>
          </div>
        ) : null}
        {mode !== "none" ? (
          <form className="space-y-2 rounded-xl border border-border p-3" onSubmit={async (e) => {
            e.preventDefault();
            const body = mode === "HYPOTHESIS"
              ? { action: "decide", recordId, data: { kind: "HYPOTHESIS", key: item.key, statement, reason, citedAttemptIds: cited, evidenceHash: item.evidenceHash } }
              : { action: "decide", recordId, data: { kind: "FLAG", key: item.key, flagCategory: category, statement, reason, evidenceHash: item.evidenceHash } };
            if (await post(body, SAVED_NOTICE[mode])) { setMode("none"); setStatement(""); setReason(""); setCited([]); }
          }}>
            {mode === "FLAG" ? <FormField name={`flag-${item.key}`} label={ui("What is wrong with the question")}><Select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(FLAG_LABEL).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField> : null}
            <FormField name={`statement-${item.key}`} label={ui(STATEMENT_LABEL[mode])}><Textarea value={statement} onChange={(e) => setStatement(e.target.value)} /></FormField>
            <FormField name={`reason-${item.key}`} label={ui("Why you think so")}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
            {mode === "HYPOTHESIS" ? <p className="text-xs text-ink-subtle">{ui("{0} answers cited. This may indicate a skill to revisit. Review the responses first.", [cited.length])}</p> : null}
            <Button type="submit" size="sm">{ui("Save")}</Button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

function DecisionRow({ decision, responses, post, disabled }: { decision: Decision; responses: Response[] | null; post: (body: object, success: string) => Promise<unknown>; disabled: boolean }) {
  const ui = useUiText();
  const [reason, setReason] = useState("");
  const [members, setMembers] = useState<string[] | null>(null);
  const defaultMembers = () => (responses ?? []).filter((r) => r.attemptId && decision.citedAttemptIds.includes(r.attemptId)).map((r) => r.studentId);
  const open = decision.status === "OPEN";
  const review = (action: string, success: string) => post({ action: "review", decisionId: decision.id, data: { action, version: decision.version, reason } }, success);
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${decision.stale ? "border-amber-400 bg-amber-50" : "border-border"}`}>
      <p className="font-semibold">{ui(KIND_LABEL[decision.kind])}{decision.flagCategory ? ` · ${ui(FLAG_LABEL[decision.flagCategory] ?? decision.flagCategory)}` : ""} · {ui(STATUS_LABEL[decision.status] ?? decision.status)}</p>
      <p><bdi>{decision.statement}</bdi></p>
      {decision.kind === "HYPOTHESIS" ? <p className="text-xs text-ink-subtle">{ui("{0} cited answers", [decision.citedAttemptIds.length])}{decision.actionPlanIds.length ? ` · ${ui("{0} draft learning actions", [decision.actionPlanIds.length])}` : ""}</p> : null}
      {decision.stale ? <p className="text-xs font-semibold text-amber-900">{ui("The answers or marks changed after this was recorded. Re-confirm or dismiss it before acting.")}</p> : null}
      {open && !disabled ? (
        <div className="space-y-2">
          <FormField name={`review-${decision.id}`} label={ui("Reason")}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
          <div className="flex flex-wrap gap-2">
            {decision.stale ? <Button type="button" size="sm" variant="outline" onClick={() => review("RECONFIRM", "Interpretation re-confirmed on the current evidence.")}>{ui("Re-confirm")}</Button> : null}
            {decision.kind === "HYPOTHESIS" ? <Button type="button" size="sm" variant="outline" onClick={() => review("DISMISS", "Hypothesis dismissed.")}>{ui("Dismiss")}</Button>
              : <Button type="button" size="sm" variant="outline" onClick={() => review("RESOLVE", "Flag resolved.")}>{ui("Resolve flag")}</Button>}
            {decision.kind === "HYPOTHESIS" && !decision.stale ? <Button type="button" size="sm" onClick={() => setMembers(members ?? defaultMembers())}>{ui("Review practice group")}</Button> : null}
          </div>
          {members && responses ? (
            <fieldset className="space-y-1 rounded-xl border border-border p-2">
              <legend className="text-sm font-semibold">{ui("Temporary practice group (edit before approving)")}</legend>
              {responses.map((r) => <label key={r.studentId} className="flex min-h-9 items-center gap-2"><Checkbox checked={members.includes(r.studentId)} onChange={(e) => setMembers((cur) => e.target.checked ? [...(cur ?? []), r.studentId] : (cur ?? []).filter((id) => id !== r.studentId))} /><bdi>{r.fullName}</bdi> · {ui(STATE_LABEL[r.state])}</label>)}
              <Button type="button" size="sm" disabled={!members.length} onClick={async () => { if (await post({ action: "group", decisionId: decision.id, data: { version: decision.version, studentIds: members, reason } }, "Practice group approved. Draft learning actions were created for a leader to activate.")) setMembers(null); }}>{ui("Approve practice group")}</Button>
            </fieldset>
          ) : members ? <p className="text-xs text-ink-subtle">{ui("Show the answers first to choose the group.")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
