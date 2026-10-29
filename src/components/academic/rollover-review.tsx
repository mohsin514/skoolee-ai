"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, GraduationCap, History, Scale } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-404: reviewed year-end rollover. Every learner has one explicit decision;
// missing results stay "Needs review"; approval names an exact plan version;
// batches are resumable and the reconciliation accounts for every learner.

type Readiness = { canClose: boolean; steps: { id: string; label: string; done: boolean; detail: string }[] };
type Destination = { id: string; label: string; capacity: number | null; occupancy: number; incoming: number };
type Learner = {
  studentId: string; name: string; admissionNo: string | null; sourceClassId: string; sourceClass: string; sourceRollNo: string;
  evidence: "PASSED" | "FAILED" | "MISSING"; evidenceDetail: { percentage?: number; grade?: string; note?: string } | null;
  decision: string; destinationClassId: string | null; effectiveDestination: string | null; reason: string | null;
  executionStatus: string; executionNote: string | null; newRollNo: string | null; issues: string[]; warnings: string[];
};
type Plan = { id: string; version: number; status: string; effectiveDate: string; classMap: Record<string, { promote?: string | null; retain?: string | null }>; approvedVersion: number | null; approvalCurrent: boolean; canApprove: boolean; viewerApproves?: boolean; canExecute: boolean };
type Money = { currency: string; minor: number };
type History = { attendance: number; reports: number; invoices: number };
type View = {
  years: number[]; sourceYear: number; destinationYear: number; readiness: Readiness; sourceClasses: { id: string; label: string }[]; destinations: Destination[];
  eligible: number; plan: Plan | null; blockers?: { kind: string; text: string }[]; needsDecision?: number; withIssues?: number;
  counts?: { decisions: Record<string, number>; execution: Record<string, number> }; learners?: Learner[];
  reconciliation?: { baseline: { learners: number; balances: Money[]; history: History }; now: { balances: Money[]; history: History }; learners: number; accounted: number; clean: boolean } | null;
  events?: { id: string; version: number; kind: string; at: string; detail: Record<string, unknown> | null }[];
};

const DECISION_LABEL: Record<string, string> = { PROMOTE: "Promote", RETAIN: "Retain (repeat the year)", GRADUATE: "Graduate", TRANSFER_OUT: "Transfer out", NEEDS_REVIEW: "Needs review" };
const PLAN_TONE: Record<string, "neutral" | "info" | "success" | "warning"> = { DRAFT: "neutral", APPROVED: "info", EXECUTING: "info", PAUSED: "warning", EXCEPTIONS: "warning", COMPLETED: "success" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft — not approved", APPROVED: "Approved", EXECUTING: "Running", PAUSED: "Paused — resume from the last confirmed learner", EXCEPTIONS: "Completed with exceptions", COMPLETED: "Rollover reconciled" };
const EXECUTION_LABEL: Record<string, string> = { PENDING: "Not applied yet", DONE: "Applied", BLOCKED: "Exception", REVERSED: "Corrected" };
const EVENT_LABEL: Record<string, string> = { CREATED: "Plan created", DECISIONS: "Decisions changed", DESTINATIONS: "Destinations changed", EFFECTIVE_DATE: "Effective date changed", LEARNERS_ADDED: "Learners added", APPROVED: "Plan approved", BATCH_STARTED: "Batch started", BATCH_FINISHED: "Batch finished", CORRECTED: "Learner corrected" };
const EVIDENCE_LABEL: Record<string, string> = { PASSED: "Passed {0}%", FAILED: "Not passed {0}%" };
const MAP_LABEL = { promote: "Promoted learners go to", retain: "Retained learners go to" } as const;
const todayText = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };

/**
 * `mode` (SPEC §2.2 #30, G35b): `operate` (default) — the campus operator prepares the plan, maps classes,
 * sets capacity, decides each learner, runs batches and records corrections. `approve` — the academic lead
 * (principal) reads the same plan and approves the exact version; every operator control is hidden, since
 * the server refuses those acts for the principal.
 */
export type RolloverApprovalState = { approver: boolean; canApprove: boolean; version: number | null; reason: string | null; hasPlan: boolean; /** A prepare/refresh is running (the host's "Prepare promotion" shows loading). */ preparing?: boolean };
/**
 * Host-owned header (§4.4b principal "Promotion approval": **Approve plan** (ConfirmAction) primary, Preview
 * secondary; admin "Year end & promotion": **Prepare promotion**): with `hideApprove` the panel drops its own
 * Approve button and the host's PageHeader drives it — `approveRequest` (a new number opens the approval
 * confirmation once), `previewRequest` (shows every learner and scrolls to the list), `prepareRequest` (operate
 * mode: prepares or refreshes the plan). `onApprovalState` reports whether this viewer can approve now and why not.
 * With `hidePrepare` the panel drops its own Prepare/Refresh plan button (the Effective date stays here, the host's
 * primary sends `prepareRequest`), so "Prepare promotion" is not shown twice.
 */
export function RolloverReview({ campusId, mode = "operate", hideApprove = false, hidePrepare = false, approveRequest, previewRequest, prepareRequest, onApprovalState }: {
  campusId?: string;
  mode?: "operate" | "approve";
  hideApprove?: boolean;
  hidePrepare?: boolean;
  approveRequest?: number;
  previewRequest?: number;
  prepareRequest?: number;
  onApprovalState?: (state: RolloverApprovalState) => void;
}) {
  const ui = useUiText();
  const operate = mode === "operate";
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const { money, dateTime } = useLocaleFormat();
  const scope = campusId ? `campusId=${encodeURIComponent(campusId)}&` : "";
  const [year, setYear] = useState<number | null>(null), [view, setView] = useState<View | null>(null), [error, setError] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayText()), [busy, setBusy] = useState(""), [filter, setFilter] = useState("attention");
  const [selected, setSelected] = useState<Set<string>>(new Set()), [bulkDecision, setBulkDecision] = useState("RETAIN"), [bulkReason, setBulkReason] = useState("");
  const [batchSize, setBatchSize] = useState("50"), [correcting, setCorrecting] = useState<string | null>(null), [correction, setCorrection] = useState({ reason: "", date: todayText() });
  const request = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++request.current;
    setError("");
    const response = await fetch(`/api/academic/rollover?${scope}${year ? `sourceYear=${year}` : ""}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (ticket !== request.current) return;
    if (!response?.ok || !json?.success) { setError(ui(json?.error || "The rollover plan could not be loaded.")); return; }
    setView(json.data);
    if (json.data.plan) setEffectiveDate(json.data.plan.effectiveDate);
  }, [scope, year, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const post = async (label: string, body: object, success?: string) => {
    setBusy(label);
    if (label === "approve") setApprovalError("");
    try {
      const response = await fetch("/api/academic/rollover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campusId, ...body }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        const message = ui(json.error || "The change was not saved.");
        if (label === "approve") setApprovalError(message);
        else { toast.error(message); await load(); }
        return null;
      }
      if (success) toast.success(success);
      await load();
      return json.data;
    } catch {
      const message = ui("The connection failed. Nothing was applied twice; reload and try again.");
      if (label === "approve") setApprovalError(message);
      else toast.error(message);
      return null;
    }
    finally { setBusy(""); }
  };

  const plan = view?.plan ?? null;
  const learners = useMemo(() => view?.learners ?? [], [view]);
  const visible = useMemo(() => learners.filter(l => filter === "all" ? true : filter === "attention" ? l.issues.length > 0 || l.executionStatus === "BLOCKED" : filter === "applied" ? l.executionStatus !== "PENDING" : l.sourceClassId === filter), [learners, filter]);
  const destLabel = (id: string | null) => view?.destinations.find(d => d.id === id)?.label ?? "";
  const editable = (l: Learner) => l.executionStatus === "PENDING" || l.executionStatus === "BLOCKED";
  const decideRows = (rows: { studentId: string; decision: string; destinationClassId?: string | null; reason?: string | null }[]) =>
    plan ? post("decide", { action: "decide", planId: plan.id, version: plan.version, rows }) : null;
  const evidenceText = (l: Learner) => l.evidence === "MISSING" ? ui("Results missing") : ui(EVIDENCE_LABEL[l.evidence] ?? "Not passed {0}%", [l.evidenceDetail?.percentage ?? 0]) + (l.evidenceDetail?.grade ? ` · ${l.evidenceDetail.grade}` : "");

  // Header-driven commands (each new number runs once) and the approval state the header shows.
  const earlyPlan = view?.plan ?? null;
  const viewerApproves = earlyPlan ? earlyPlan.viewerApproves ?? !operate : false;
  const approvalReason = !view ? null : !earlyPlan ? "Your campus admin has not prepared the promotion plan yet."
    : view.needsDecision ? "Some learners still need a decision before this plan can be approved."
    : view.withIssues ? "Some learners still have problems to resolve."
    : view.blockers?.length ? "The year is not ready to roll over yet."
    : !earlyPlan.canApprove ? "This version cannot be approved in its current state." : null;
  const preparing = busy === "prepare";
  const approvalKey = `${viewerApproves}:${earlyPlan?.canApprove ?? false}:${earlyPlan?.version ?? 0}:${approvalReason ?? ""}:${preparing}`;
  useEffect(() => {
    onApprovalState?.({ approver: viewerApproves, canApprove: Boolean(earlyPlan?.canApprove), version: earlyPlan?.version ?? null, reason: approvalReason, hasPlan: Boolean(earlyPlan), preparing });
    // approvalKey captures every input; the callback identity may change on each host render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalKey]);
  const seen = useRef({ approve: approveRequest, preview: previewRequest, prepare: prepareRequest });
  useEffect(() => {
    if (approveRequest === undefined || seen.current.approve === approveRequest) return;
    seen.current.approve = approveRequest;
    if (viewerApproves && earlyPlan?.canApprove && !busy) setConfirmApprove(true);
  }, [approveRequest, viewerApproves, earlyPlan, busy]);
  useEffect(() => {
    if (previewRequest === undefined || seen.current.preview === previewRequest) return;
    seen.current.preview = previewRequest;
    setFilter("all");
    requestAnimationFrame(() => document.getElementById("learners-title")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  }, [previewRequest]);
  useEffect(() => {
    if (prepareRequest === undefined || seen.current.prepare === prepareRequest) return;
    seen.current.prepare = prepareRequest;
    if (operate && view && !busy) void post("prepare", { action: "prepare", sourceYear: view.sourceYear, effectiveDate }, earlyPlan ? ui("Plan refreshed.") : ui("Plan draft created."));
    // post/effectiveDate are read at the moment of the request; only a new number re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepareRequest]);

  if (error) return <section id="year-end-rollover" tabIndex={-1} className="sk-panel p-5" data-rollover><ErrorState title={ui("Could not load the year-end plan")} description={error} onRetry={() => void load()} retryLabel={ui("Retry")} /></section>;
  if (!view) return <section id="year-end-rollover" tabIndex={-1} className="sk-panel p-5" data-rollover><p role="status" className="mb-3 text-sm text-ink-muted">{ui("Loading the year-end plan…")}</p><SkeletonList rows={4} /></section>;

  const recon = view.reconciliation;
  // Older servers omit `viewerApproves`; then only the approve mode (the principal's console) offers it.
  const approver = plan ? plan.viewerApproves ?? !operate : false;
  const pending = view.counts?.execution.PENDING ?? 0, blocked = view.counts?.execution.BLOCKED ?? 0, done = view.counts?.execution.DONE ?? 0;
  return <section id="year-end-rollover" tabIndex={-1} className="space-y-5 outline-none" aria-labelledby="rollover-title" data-rollover data-plan-status={plan?.status ?? "NONE"} data-plan-version={plan?.version ?? 0}>
    <div className="sk-panel space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="rollover-title" className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink-strong"><GraduationCap className="size-5 text-primary" aria-hidden />{ui("Year-end promotion review")}</h3>
          <p className="text-sm font-normal leading-relaxed text-ink-muted">{ui("Confirm each learner's next enrollment. Missing evidence is never treated as a pass or a fail.")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <FormField name="rollover-source-year" label={ui("Source year")}><Select value={String(view.sourceYear)} onChange={event => { setYear(Number(event.target.value)); setSelected(new Set()); }}>{view.years.map(y => <option key={y} value={y}>{y}</option>)}</Select></FormField>
          <p className="pb-2 text-sm font-bold" data-destination-year>{ui("Destination year")}: {view.destinationYear}</p>
          {operate ? <>
            <FormField name="rollover-effective-date" label={ui("Effective date")}><Input type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} /></FormField>
            {hidePrepare ? null : <Button disabled={!!busy} onClick={() => void post("prepare", { action: "prepare", sourceYear: view.sourceYear, effectiveDate }, plan ? ui("Plan refreshed.") : ui("Plan draft created."))}>{busy === "prepare" ? ui("Preparing…") : plan ? ui("Refresh plan") : ui("Prepare plan")}</Button>}
          </> : plan ? <p className="pb-2 text-sm font-bold">{ui("Effective date")}: <bdi>{plan.effectiveDate}</bdi></p> : null}
        </div>
      </div>

      <div aria-labelledby="readiness-title" className="rounded-2xl border border-border p-3">
        <h4 id="readiness-title" className="text-base font-bold text-ink-strong">{ui("Year-close readiness")}</h4>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{view.readiness.steps.map(step => <li key={step.id} className="flex items-start gap-2 text-xs" data-readiness={step.id} data-done={step.done}>
          {step.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success-text" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-status-warning-text" aria-hidden />}
          <span><span className="font-bold">{ui(step.label)}</span> — {ui(step.detail)}</span></li>)}</ul>
      </div>

      {!plan ? <div data-rollover-empty><Alert tone={view.eligible ? "info" : "neutral"} compact live="off">{!operate ? ui("Your campus admin prepares the promotion plan. It appears here for your approval once it is ready.") : view.eligible ? ui("{0} learners are eligible. Prepare a plan to review each one.", [view.eligible]) : ui("No eligible learners in this source year. Check the year and enrollment filters.")}</Alert></div>
        : <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/60 p-3 text-sm" role="status" data-plan-bar>
          <span className="font-bold">{ui("Plan version {0}", [plan.version])}</span>
          <Badge dot variant={PLAN_TONE[plan.status] ?? "neutral"} data-plan-state>{ui(STATUS_LABEL[plan.status] ?? plan.status)}</Badge>
          {plan.approvedVersion && !plan.approvalCurrent ? <span className="text-status-warning-text">{ui("Version {0} was approved; changes since then need a new approval.", [plan.approvedVersion])}</span> : null}
          <span className="text-ink-muted">{view.needsDecision ? ui("{0} learners need a decision before this plan can be approved.", [view.needsDecision]) : view.withIssues ? ui("{0} learners still have problems to resolve.", [view.withIssues]) : ui("Every learner has a decision.")}</span>
        </div>}
      {view.blockers?.length ? <ul className="space-y-1 rounded-xl bg-status-warning-surface p-3 text-xs font-medium text-status-warning-text" data-plan-blockers>{view.blockers.map(b => <li key={b.text}>{ui(b.text)}</li>)}</ul> : null}
    </div>

    {plan ? <>
      <div className="sk-panel space-y-3 p-5" aria-labelledby="destinations-title">
        <h4 id="destinations-title" className="text-base font-bold text-ink-strong">{ui("Destinations")}</h4>
        <ul className="space-y-2">{view.sourceClasses.map(source => <li key={source.id} className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-3" data-source-class={source.id}>
          <p className="text-sm font-bold"><bdi>{source.label}</bdi> <span className="block text-xs font-normal text-ink-muted">{ui("Source year")} {view.sourceYear}</span></p>
          {(["promote", "retain"] as const).map(kind => <FormField key={kind} name={`map-${kind}-${source.id}`} label={ui(MAP_LABEL[kind])}>
            <Select value={plan.classMap[source.id]?.[kind] ?? ""} disabled={!operate || !!busy} onChange={event => void post("map", { action: "map", planId: plan.id, version: plan.version, sourceClassId: source.id, ...plan.classMap[source.id], [kind]: event.target.value || null })}>
              <option value="">{ui("Not set")}</option>{view.destinations.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select></FormField>)}
        </li>)}</ul>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs" data-capacity-table>
          <caption className="sr-only">{ui("Destination capacity")}</caption>
          <thead><tr className="text-ink-subtle">{["Destination class", "Current learners", "Incoming", "Capacity"].map(h => <th key={h} scope="col" className="px-2 py-1.5 text-start">{ui(h)}</th>)}</tr></thead>
          <tbody>{view.destinations.map(d => { const over = d.capacity != null && d.occupancy + d.incoming > d.capacity; return <tr key={d.id} className="border-t border-border" data-destination={d.id} data-over={over}>
            <th scope="row" className="px-2 py-1.5 text-start font-bold"><bdi>{d.label}</bdi></th><td className="px-2">{d.occupancy}</td><td className="px-2">{d.incoming}</td>
            <td className="px-2">{operate ? <Input aria-label={ui("Capacity for {0}", [d.label])} className={`w-28 ${over ? "border-status-error-border" : ""}`} type="number" min={0} max={500} defaultValue={d.capacity ?? ""} placeholder={ui("Not set")}
              onBlur={event => { if (event.target.value !== String(d.capacity ?? "")) void post("capacity", { action: "capacity", classId: d.id, capacity: event.target.value.trim() === "" ? null : Number(event.target.value) }, ui("Capacity saved for {0}.", [d.label])); }} /> : <span className={over ? "font-bold text-status-error-text" : undefined}>{d.capacity ?? ui("Not set")}</span>}</td>
          </tr>; })}</tbody>
        </table></div>
      </div>

      <div className="sk-panel space-y-3 p-5" aria-labelledby="learners-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h4 id="learners-title" className="text-base font-bold text-ink-strong">{ui("Learners ({0})", [learners.length])}</h4>
          <FormField name="rollover-filter" label={ui("Show")}><Select value={filter} onChange={event => { setFilter(event.target.value); setSelected(new Set()); }}>
            <option value="attention">{ui("Needs attention")}</option><option value="all">{ui("All learners")}</option><option value="applied">{ui("Applied or corrected")}</option>
            {view.sourceClasses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select></FormField>
        </div>
        {operate ? <div className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/60 p-3" role="group" aria-label={ui("Bulk decision")}>
          <label className="flex items-center gap-2 pb-2 text-xs font-bold"><Checkbox checked={visible.length > 0 && visible.filter(editable).every(l => selected.has(l.studentId))} onChange={event => setSelected(event.target.checked ? new Set(visible.filter(editable).map(l => l.studentId)) : new Set())} />{ui("Select all shown")}</label>
          <FormField name="bulk-decision" label={ui("Decision")}><Select value={bulkDecision} onChange={event => setBulkDecision(event.target.value)}>{Object.keys(DECISION_LABEL).map(k => <option key={k} value={k}>{ui(DECISION_LABEL[k])}</option>)}</Select></FormField>
          <FormField name="bulk-reason" label={ui("Reason")}><Input value={bulkReason} onChange={event => setBulkReason(event.target.value)} placeholder={ui("Required when overriding the evidence")} /></FormField>
          <Button variant="secondary" disabled={!selected.size || !!busy} onClick={async () => { const ok = await decideRows([...selected].map(studentId => ({ studentId, decision: bulkDecision, reason: bulkReason || learners.find(l => l.studentId === studentId)?.reason || null }))); if (ok) { setSelected(new Set()); setBulkReason(""); } }}>{ui("Apply to {0} selected", [selected.size])}</Button>
        </div> : null}
        {!visible.length ? <div data-learners-empty><EmptyState size="sm" icon={CheckCircle2} title={filter === "attention" ? ui("Nothing needs attention.") : ui("No learners match this view.")} description={filter === "attention" ? undefined : ui("Choose another class or view to see more learners.")} /></div>
          : <ul className="space-y-2">{visible.map(l => { const issueId = `rollover-issues-${l.studentId}`; return <li key={l.studentId} className={`space-y-2 rounded-2xl border p-3 ${l.issues.length || l.executionStatus === "BLOCKED" ? "border-status-warning-border" : "border-border"}`} data-learner={l.studentId} data-decision={l.decision} data-execution={l.executionStatus}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <label className="flex items-start gap-2 text-sm">{operate ? <Checkbox disabled={!editable(l)} checked={selected.has(l.studentId)} onChange={event => setSelected(prev => { const next = new Set(prev); if (event.target.checked) next.add(l.studentId); else next.delete(l.studentId); return next; })} aria-describedby={l.issues.length ? issueId : undefined} /> : null}
                <span><bdi className="font-bold">{l.name}</bdi><span className="block text-xs text-ink-muted"><bdi>{l.sourceClass}</bdi> · {ui("Roll")} <bdi>{l.sourceRollNo}</bdi>{l.newRollNo ? <> → <bdi>{l.newRollNo}</bdi></> : null}</span></span></label>
              <span data-evidence={l.evidence}><Badge dot variant={l.evidence === "MISSING" ? "warning" : l.evidence === "PASSED" ? "success" : "danger"}>{evidenceText(l)}</Badge></span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <FormField name={`decision-${l.studentId}`} label={ui("Decision")}><Select value={l.decision} disabled={!operate || !editable(l) || !!busy} onChange={event => void decideRows([{ studentId: l.studentId, decision: event.target.value, destinationClassId: l.destinationClassId, reason: l.reason }])}>{Object.keys(DECISION_LABEL).map(k => <option key={k} value={k}>{ui(DECISION_LABEL[k])}</option>)}</Select></FormField>
              {l.decision === "PROMOTE" || l.decision === "RETAIN" ? <FormField name={`destination-${l.studentId}`} label={ui("Destination class")}><Select value={l.destinationClassId ?? ""} disabled={!operate || !editable(l) || !!busy} onChange={event => void decideRows([{ studentId: l.studentId, decision: l.decision, destinationClassId: event.target.value || null, reason: l.reason }])}>
                <option value="">{l.effectiveDestination && !l.destinationClassId ? ui("Class default: {0}", [destLabel(l.effectiveDestination)]) : ui("Class default")}</option>{view.destinations.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</Select></FormField> : <span />}
              <FormField name={`reason-${l.studentId}`} label={ui("Reason")}><Input defaultValue={l.reason ?? ""} disabled={!operate || !editable(l)} key={`${plan.version}-${l.reason}`} onBlur={event => { if (event.target.value.trim() !== (l.reason ?? "")) void decideRows([{ studentId: l.studentId, decision: l.decision, destinationClassId: l.destinationClassId, reason: event.target.value }]); }} /></FormField>
            </div>
            {l.issues.length ? <ul id={issueId} className="space-y-0.5 text-xs font-medium text-status-warning-text" data-issues>{l.issues.map(i => <li key={i}>{ui(i)}</li>)}</ul> : null}
            {l.warnings.length ? <ul className="text-xs text-ink-muted">{l.warnings.map(i => <li key={i}>{ui(i)}</li>)}</ul> : null}
            <p className="text-xs" data-execution-note>{ui(EXECUTION_LABEL[l.executionStatus] ?? l.executionStatus)}{l.executionNote ? <> — {ui(l.executionNote)}</> : null}</p>
            {operate && l.executionStatus === "DONE" && (l.decision === "PROMOTE" || l.decision === "RETAIN") ? correcting === l.studentId
              ? <div className="grid items-end gap-2 rounded-xl bg-muted/60 p-2 sm:grid-cols-[1fr_auto_auto]" data-correction-form>
                  <FormField name={`correction-reason-${l.studentId}`} label={ui("Why is this rollover being corrected?")}><Input value={correction.reason} onChange={event => setCorrection(c => ({ ...c, reason: event.target.value }))} /></FormField>
                  <FormField name={`correction-date-${l.studentId}`} label={ui("Correction date")}><Input type="date" value={correction.date} onChange={event => setCorrection(c => ({ ...c, date: event.target.value }))} /></FormField>
                  <div className="flex gap-2"><Button size="sm" disabled={!!busy} onClick={async () => { const ok = await post("reverse", { action: "reverse", planId: plan.id, studentId: l.studentId, reason: correction.reason, effectiveDate: correction.date }, ui("Correction recorded.")); if (ok) setCorrecting(null); }}>{ui("Record correction")}</Button><Button size="sm" variant="secondary" onClick={() => setCorrecting(null)}>{ui("Cancel")}</Button></div>
                </div>
              : <Button size="sm" variant="secondary" onClick={() => { setCorrecting(l.studentId); setCorrection({ reason: "", date: todayText() }); }}>{ui("Correct this rollover")}</Button> : null}
          </li>; })}</ul>}
      </div>

      <div className="sk-panel space-y-3 p-5" aria-labelledby="approve-title">
        <h4 id="approve-title" className="text-base font-bold text-ink-strong">{ui(operate ? (approver ? "Approve and run" : "Run the promotion") : "Approve the plan")}</h4>
        <div className="flex flex-wrap items-end gap-3">
          {/* G35b: only the academic lead approves (the principal, or the campus admin while no principal is
              appointed); the server says whether this viewer holds that seat. The button stays visible but disabled
              until the plan is approvable, so the lead sees what is still missing. */}
          {approver && !hideApprove ? <Button disabled={!plan.canApprove || !!busy} onClick={() => setConfirmApprove(true)} data-approve-plan>{ui("Approve version {0}", [plan.version])}</Button> : null}
          {operate ? <>
            <FormField name="rollover-batch-size" label={ui("Learners per batch")}><Input type="number" min={1} max={200} className="w-28" value={batchSize} onChange={event => setBatchSize(event.target.value)} /></FormField>
            <Button variant="secondary" disabled={!plan.canExecute || !!busy} onClick={() => void post("execute", { action: "execute", planId: plan.id, version: plan.version, limit: Math.max(1, Math.min(200, Number(batchSize) || 50)) })}>{busy === "execute" ? ui("Applying…") : plan.status === "PAUSED" ? ui("Resume from the last confirmed learner") : ui("Run next batch")}</Button>
          </> : null}
        </div>
        {!operate ? <p className="text-xs text-ink-muted">{ui("After you approve, your campus admin runs the promotion in batches.")}</p> : null}
        {operate && !approver && plan.status === "DRAFT" ? <p className="text-xs text-ink-muted" data-awaiting-approval>{ui("Your principal approves this version before you can run it.")}</p> : null}
        <p className="text-xs text-ink-muted" role="status" data-progress>{ui("Applied {0} · waiting {1} · exceptions {2}", [done, pending, blocked])}. {ui("Capacity, placement and duplicate enrollment are checked again for each learner when the batch runs.")}</p>
      </div>

      {recon ? <div className="sk-panel space-y-3 p-5" aria-labelledby="recon-title" data-reconciliation data-clean={recon.clean}>
        <h4 id="recon-title" className="flex items-center gap-2 text-base font-bold text-ink-strong"><Scale className="size-4 text-primary" aria-hidden />{ui("Rollover reconciliation")}</h4>
        <Alert tone={recon.clean ? "success" : "warning"} compact live="off"><span data-accounted>{recon.accounted === recon.learners ? (recon.clean ? ui("All {0} learners are accounted for.", [recon.learners]) : ui("All {0} learners are accounted for. Review the remaining exceptions.", [recon.learners])) : ui("{0} of {1} learners are accounted for so far.", [recon.accounted, recon.learners])}</span></Alert>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><h5 className="text-xs font-bold">{ui("Outstanding balances by currency")}</h5>
            <ul className="mt-1 space-y-0.5 text-xs" data-balances>{[...new Set([...recon.baseline.balances, ...recon.now.balances].map(b => b.currency))].map(currency => { const before = recon.baseline.balances.find(b => b.currency === currency)?.minor ?? 0, after = recon.now.balances.find(b => b.currency === currency)?.minor ?? 0; return <li key={currency} data-currency={currency}>{ui("{0}: {1} at approval, {2} now", [currency, money(before, currency), money(after, currency)])}{before !== after ? ` — ${ui("the difference comes from invoices issued or payments recorded since approval; rollover never creates or edits invoices")}` : ""}</li>; })}{!recon.baseline.balances.length && !recon.now.balances.length ? <li>{ui("No outstanding balances.")}</li> : null}</ul></div>
          <div><h5 className="text-xs font-bold">{ui("Previous-year records")}</h5>
            {(() => { const b = recon.baseline.history, n = recon.now.history, same = b.attendance === n.attendance && b.reports === n.reports && b.invoices === n.invoices; return <p className="mt-1 text-xs" data-history-same={same}>{ui("{0} attendance, {1} report and {2} invoice records stay attached to the source enrollments.", [n.attendance, n.reports, n.invoices])} {same ? ui("Unchanged since approval.") : ui("Changed since approval; check for late entries.")}</p>; })()}</div>
        </div>
      </div> : null}

      {view.events?.length ? <details className="sk-panel p-5"><summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"><History className="size-4" aria-hidden />{ui("Plan history")}</summary>
        <ol className="mt-2 space-y-1 text-xs" data-events>{view.events.map(e => <li key={e.id}>{dateTime(e.at)} · {ui("Version {0}", [e.version])} · {ui(EVENT_LABEL[e.kind] ?? e.kind)}{e.detail && "approvalWithdrawn" in e.detail ? ` — ${ui("approval withdrawn")}` : ""}</li>)}</ol></details> : null}
    </> : null}
    {plan ? <ConfirmAction
      open={confirmApprove}
      title={ui("Approve version {0} of the promotion plan?", [plan.version])}
      description={ui("The campus admin can then move learners into next year's classes exactly as this version says. Any later change to the plan withdraws this approval.")}
      confirmLabel={ui("Approve plan")}
      cancelLabel={ui("Keep editing")}
      tone="warning"
      busy={busy === "approve"}
      detail={approvalError ? <p role="alert">{approvalError}</p> : undefined}
      onCancel={() => { setConfirmApprove(false); setApprovalError(""); }}
      onConfirm={async () => { if (await post("approve", { action: "approve", planId: plan.id, version: plan.version }, ui("Version {0} approved.", [plan.version]))) setConfirmApprove(false); }}
    /> : null}
  </section>;
}
