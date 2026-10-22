"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-425: learning actions. The next check-in and the responsible adult come
// first; AI text is only ever a draft; activation, sharing, check-ins and the
// outcome review are stages of one record with a reason for every decision.

type Row = { id: string; version: number; status: string; origin: string; title: string; learner: string; goal: string | null; owner: string | null; reviewDate: string | null; nextCheckInDate: string | null; checkInOverdue: boolean; reviewDue: boolean; shared: boolean; staleSince?: string | null; staleReason?: string | null };
type Ctx = { actions: Row[]; learners: { id: string; name: string; rollNo: string }[]; staff: { id: string; name: string }[]; leader: boolean; canActivate?: boolean; userId: string };
type Detail = Row & { studentId: string; concern: string | null; evidenceState: string; evidenceRefs: { kind: string; refId: string; label: string }[]; baseline: { measure: string; value: number | null; denominator: number | null; takenOn: string; source: string } | null;
  ownerId: string | null; plannedActivity: string | null; minutesPerWeek: number | null; familyShare: { goal: string; action: string; sharedAt: string | null } | null; privateNotes: string | null;
  outcome: { decision: string; reason: string; limitations: string; note: string; participation: { checkIns: number; delivered: number; minutes: number; absent: number }; followUp: { measure: string; value: number | null; denominator: number | null; comparable: boolean; differences: string } | null } | null;
  checkIns: { id: string; dueOn: string; delivered: boolean; minutes: number | null; participation: string; adjustment: string | null }[]; events: { id: string; version: number; kind: string; reason: string | null; createdAt: string }[] };
const STATUS: Record<string, string> = { DRAFT: "Draft", ACTIVE: "Active", CLOSED: "Closed", ESCALATED: "Escalated", REJECTED: "Rejected" };
const PARTICIPATION: Record<string, string> = { FULL: "Took part fully", PARTIAL: "Took part partly", ABSENT: "Absent" };
const DECISION: Record<string, string> = { CLOSE: "Close: goal reviewed", EXTEND: "Extend with a new review date", ESCALATE: "Escalate to another adult", INCONCLUSIVE: "Close as inconclusive" };
const EVENT: Record<string, string> = { CREATED: "Created", EDITED: "Draft edited", EDITED_ACTIVE: "Plan changed while active", ACTIVATED: "Activated", SHARED_WITH_FAMILY: "Shared with the family", CHECK_IN: "Check-in recorded", RESCHEDULED: "Check-in rescheduled", OWNER_CHANGED: "Responsible adult changed", REVIEW_CLOSE: "Closed after review", REVIEW_EXTEND: "Extended", REVIEW_ESCALATE: "Escalated", REVIEW_INCONCLUSIVE: "Closed as inconclusive", SUGGESTION_REVIEWED: "AI suggestion reviewed", SUGGESTION_REJECTED: "AI suggestion rejected" };
const EVIDENCE_STATE: Record<string, string> = { CONFIRMED: "Confirmed by the teacher", NEEDS_OBSERVATION: "Needs more observation" };
const todayText = () => new Date().toISOString().slice(0, 10);

/**
 * `mode="author"` (default, teachers): the panel's own title and "New learning action".
 * `mode="review"` (the academic lead's queue — principal and admin "Learning actions", §4.4b): the hosting
 * PageHeader owns the title, nothing is created here, and a draft opens to Activate. Activate is offered only to
 * the academic lead (`ctx.canActivate` = canLeadAcademics, G35c), never to a leader the server would refuse.
 * There is no "Return" act on the server yet (the route is unowned; cross-package need in the P6 report), so the
 * queue offers Activate only; a lead who disagrees edits the draft or hands it back with a reason (Hand over).
 */
export function LearningActions({ mode = "author" }: { mode?: "author" | "review" } = {}) {
  const ui = useUiText();
  const review = mode === "review";
  const { date, dateTime } = useLocaleFormat();
  const [ctx, setCtx] = useState<Ctx | null>(null), [error, setError] = useState(""), [open, setOpen] = useState<string | null>(null), [creating, setCreating] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++request.current;
    const response = await fetch("/api/learning-actions", { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (ticket !== request.current) return;
    if (!response?.ok || !json?.success) { const message: string = json?.error || "Learning actions could not be loaded."; setError(ui(message)); return; }
    setCtx(json.data); setError("");
  }, [ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  // R4/R5: a load failure is an inline ErrorState with retry; loading is a layout-shaped skeleton.
  if (error) return <section className="sk-panel p-5" data-learning-actions><ErrorState title={ui("Learning actions could not be loaded")} description={error} onRetry={() => void load()} retryLabel={ui("Retry")} /></section>;
  if (!ctx) return <section className="sk-panel p-5" data-learning-actions><SkeletonList rows={3} label={ui("Loading learning actions…")} /></section>;
  return <section className="sk-panel space-y-3 p-5" aria-labelledby={review ? undefined : "learning-actions-title"} aria-label={review ? ui("Learning actions") : undefined} data-learning-actions data-mode={mode}>
    {review ? null : <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="learning-actions-title" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><ClipboardList className="size-5 text-primary" aria-hidden />{ui("Learning actions")}</h2>
      <Button size="sm" onClick={() => setCreating(v => !v)}>{creating ? ui("Close") : ui("New learning action")}</Button>
    </div>}
    <p className="text-xs text-ink-muted">{ui("Specific support with a goal, a responsible adult and a review date. Describe skills and actions, not labels.")}</p>
    {creating && !review ? <Editor ctx={ctx} onSaved={async id => { setCreating(false); await load(); setOpen(id); }} /> : null}
    {!ctx.actions.length ? <div data-empty>{review
      ? <EmptyState size="sm" icon={ClipboardList} title={ui("No learning actions are waiting")} description={ui("Support plans teachers propose for students appear here for you to activate.")} />
      : <EmptyState size="sm" icon={ClipboardList} title={ui("No learning actions yet")} description={ui("Start from a specific concern and the evidence behind it.")} action={<Button size="sm" onClick={() => setCreating(true)}>{ui("New learning action")}</Button>} />}</div>
      : <ul className="space-y-2">{ctx.actions.map(row => <li key={row.id} className={`rounded-2xl border p-3 ${row.checkInOverdue ? "border-status-warning-border" : "border-border"}`} data-action={row.id} data-status={row.status}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink-strong"><bdi>{row.learner}</bdi> · <bdi>{row.title}</bdi></p>
              <p className="text-xs">{ui("Responsible adult")}: <bdi>{row.owner ?? ui("Not set")}</bdi> · {ui("Next check-in")}: {row.nextCheckInDate ? date(row.nextCheckInDate) : "—"}{row.checkInOverdue ? <span className="ms-1 font-semibold text-status-warning-text" data-overdue>{ui("Check-in missed")}</span> : null} · {ui("Review")}: {row.reviewDate ? date(row.reviewDate) : "—"}</p>
              {row.goal ? <p className="text-xs text-ink-muted">{ui("Goal")}: <bdi>{row.goal}</bdi></p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <Badge size="sm" variant="neutral" dot>{ui(STATUS[row.status] ?? row.status)}</Badge>
              {row.origin === "AI" && row.status === "DRAFT" ? <Badge size="sm" variant="warning">{ui("AI suggestion — edit before use")}</Badge> : null}
              {row.shared ? <Badge size="sm" variant="success">{ui("Shared with family")}</Badge> : null}
              <Button size="sm" variant="secondary" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>{open === row.id ? ui("Hide") : ui("Open")}</Button>
            </div>
          </div>
          {row.staleSince ? <div role="status" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-status-warning-border bg-status-warning-surface p-2 text-xs text-status-warning-text" data-stale-action>
            <p className="min-w-0"><span className="font-bold">{ui("Needs review after an assessment repair")}</span> · <bdi>{row.staleReason ?? ""}</bdi></p>
            <Button size="sm" variant="secondary" onClick={async () => { const response = await fetch(`/api/learning-actions/${encodeURIComponent(row.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge-repair", data: {} }) }).catch(() => null); if (response?.ok) await load(); }}>{ui("Mark as reviewed")}</Button>
          </div> : null}
          {open === row.id ? <Panel id={row.id} ctx={ctx} onChanged={load} dateTime={dateTime} /> : null}
        </li>)}</ul>}
  </section>;
}

function Editor({ ctx, detail, onSaved }: { ctx: Ctx; detail?: Detail; onSaved: (id: string) => void | Promise<void> }) {
  const ui = useUiText();
  const [form, setForm] = useState({
    studentId: detail?.studentId ?? "", title: detail?.title ?? "", concern: detail?.concern ?? "", evidenceState: detail?.evidenceState ?? "NEEDS_OBSERVATION",
    observation: "", goal: detail?.goal ?? "", ownerId: detail?.ownerId ?? ctx.userId, plannedActivity: detail?.plannedActivity ?? "", minutesPerWeek: detail?.minutesPerWeek ? String(detail.minutesPerWeek) : "",
    baselineMeasure: detail?.baseline?.measure ?? "", baselineValue: detail?.baseline?.value != null ? String(detail.baseline.value) : "", baselineOf: detail?.baseline?.denominator != null ? String(detail.baseline.denominator) : "", baselineOn: detail?.baseline?.takenOn ?? todayText(),
    reviewDate: detail?.reviewDate ?? "", nextCheckInDate: detail?.nextCheckInDate ?? "", familyGoal: detail?.familyShare?.goal ?? "", familyAction: detail?.familyShare?.action ?? "", privateNotes: detail?.privateNotes ?? "",
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(prev => ({ ...prev, [key]: event.target.value }));
  const save = async () => {
    setBusy(true); setError("");
    const refs = [...(detail?.evidenceRefs ?? []), ...(form.observation.trim() ? [{ kind: "OBSERVATION", refId: `obs-${Date.now()}`, label: form.observation.trim() }] : [])];
    const body = { ...(detail ? { id: detail.id } : {}), version: detail?.version ?? 0, studentId: form.studentId, title: form.title, concern: form.concern || null, evidenceState: form.evidenceState, evidenceRefs: refs,
      baseline: form.baselineMeasure ? { measure: form.baselineMeasure, value: form.baselineValue === "" ? null : Number(form.baselineValue), denominator: form.baselineOf === "" ? null : Number(form.baselineOf), takenOn: form.baselineOn, source: "Teacher-recorded baseline" } : null,
      goal: form.goal || null, ownerId: form.ownerId || null, plannedActivity: form.plannedActivity || null, minutesPerWeek: form.minutesPerWeek ? Number(form.minutesPerWeek) : null,
      reviewDate: form.reviewDate || null, nextCheckInDate: form.nextCheckInDate || null, familyShare: form.familyGoal && form.familyAction ? { goal: form.familyGoal, action: form.familyAction } : null, privateNotes: form.privateNotes || null };
    const response = await fetch("/api/learning-actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    setBusy(false);
    if (!response?.ok || !json?.success) { const message: string = json?.error || "The learning action was not saved."; setError(ui(message)); return; }
    await onSaved(json.data.id);
  };
  return <div className="grid gap-2 rounded-xl bg-muted/60 p-3 sm:grid-cols-2" data-editor>
    {!detail ? <FormField name="la-learner" label={ui("Learner")}><Select value={form.studentId} onChange={set("studentId")}><option value="">{ui("Choose a learner")}</option>{ctx.learners.map(l => <option key={l.id} value={l.id}>{l.name} ({l.rollNo})</option>)}</Select></FormField> : null}
    <FormField name="la-title" label={ui("Skill to support")}><Input value={form.title} onChange={set("title")} /></FormField>
    <FormField name="la-concern" label={ui("What was observed")}><Textarea value={form.concern} onChange={set("concern")} /></FormField>
    <FormField name="la-evidence-state" label={ui("Evidence")}><Select value={form.evidenceState} onChange={set("evidenceState")}><option value="CONFIRMED">{ui("Confirmed by the teacher")}</option><option value="NEEDS_OBSERVATION">{ui("Needs more observation")}</option></Select></FormField>
    <FormField name="la-observation" label={ui("Add an evidence note")}><Input value={form.observation} onChange={set("observation")} placeholder={ui("e.g. Two fraction items answered by adding denominators")} /></FormField>
    <FormField name="la-baseline-measure" label={ui("Baseline measure")}><Input value={form.baselineMeasure} onChange={set("baselineMeasure")} /></FormField>
    <div className="grid grid-cols-3 gap-2"><FormField name="la-baseline-value" label={ui("Score")}><Input type="number" value={form.baselineValue} onChange={set("baselineValue")} /></FormField><FormField name="la-baseline-of" label={ui("Out of")}><Input type="number" value={form.baselineOf} onChange={set("baselineOf")} /></FormField><FormField name="la-baseline-on" label={ui("Date")}><Input type="date" value={form.baselineOn} onChange={set("baselineOn")} /></FormField></div>
    <FormField name="la-goal" label={ui("Goal")}><Textarea value={form.goal} onChange={set("goal")} placeholder={ui("e.g. Explain equivalent fractions using two examples")} /></FormField>
    <FormField name="la-owner" label={ui("Responsible adult")}><Select value={form.ownerId} onChange={set("ownerId")}>{ctx.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField>
    <FormField name="la-activity" label={ui("Planned activity")}><Textarea value={form.plannedActivity} onChange={set("plannedActivity")} /></FormField>
    <FormField name="la-minutes" label={ui("Minutes per week")}><Input type="number" value={form.minutesPerWeek} onChange={set("minutesPerWeek")} /></FormField>
    <FormField name="la-next" label={ui("Next check-in")}><Input type="date" value={form.nextCheckInDate} onChange={set("nextCheckInDate")} /></FormField>
    <FormField name="la-review" label={ui("Review date")}><Input type="date" value={form.reviewDate} onChange={set("reviewDate")} /></FormField>
    <FormField name="la-family-goal" label={ui("Goal shared with the family")}><Input value={form.familyGoal} onChange={set("familyGoal")} /></FormField>
    <FormField name="la-family-action" label={ui("Action for home")}><Input value={form.familyAction} onChange={set("familyAction")} /></FormField>
    <FormField name="la-notes" label={ui("Private staff notes (never shared)")}><Textarea value={form.privateNotes} onChange={set("privateNotes")} /></FormField>
    {error ? <p role="alert" className="text-sm text-status-error-text sm:col-span-2">{error}</p> : null}
    <div className="sm:col-span-2"><Button disabled={busy || (!detail && !form.studentId) || form.title.trim().length < 3} onClick={() => void save()}>{busy ? ui("Saving…") : ui("Save draft")}</Button></div>
  </div>;
}

function Panel({ id, ctx, onChanged, dateTime }: { id: string; ctx: Ctx; onChanged: () => Promise<void>; dateTime: (v: string) => string }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [detail, setDetail] = useState<Detail | null>(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false);
  const [check, setCheck] = useState({ dueOn: todayText(), delivered: "yes", minutes: "", participation: "FULL", adjustment: "", next: "" });
  const [review, setReview] = useState({ decision: "CLOSE", reason: "", measure: "", value: "", of: "", comparable: "yes", differences: "", limitations: "", nextReviewDate: "", nextOwnerId: "" });
  const [handoff, setHandoff] = useState({ ownerId: "", reason: "" }), [reschedule, setReschedule] = useState({ date: "", reason: "" });
  const load = useCallback(async () => {
    const response = await fetch(`/api/learning-actions/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (response?.ok && json?.success) setDetail(json.data);
  }, [id]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const act = async (action: string, data: object, success: string) => {
    if (!detail) return;
    setBusy(true); setNotice("");
    const response = await fetch(`/api/learning-actions/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data: { version: detail.version, ...data } }) }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    setBusy(false);
    if (!response?.ok || !json?.success) { const message: string = json?.error || "The change was not saved."; setNotice(ui(message)); return; }
    setNotice(success); await load(); await onChanged();
  };
  if (!detail) return <div className="mt-2"><SkeletonList rows={2} label={ui("Loading learning action…")} /></div>;
  const active = detail.status === "ACTIVE";
  return <div className="mt-3 space-y-3 text-sm" data-panel>
    {notice ? <Alert compact tone="info" live="polite" data-notice>{notice}</Alert> : null}
    <section className="grid gap-2 sm:grid-cols-2" data-stage="evidence">
      <div><h4 className="text-sm font-semibold text-ink-strong">{ui("Evidence")}</h4><p className="text-xs">{ui(EVIDENCE_STATE[detail.evidenceState] ?? detail.evidenceState)}</p>
        <ul className="list-disc ps-5 text-xs">{detail.evidenceRefs.map(ref => <li key={ref.refId}><bdi>{ref.label}</bdi></li>)}</ul>
        {detail.baseline ? <p className="text-xs" data-baseline>{ui("Baseline")}: <bdi>{detail.baseline.measure}</bdi> — {detail.baseline.value ?? "—"}{detail.baseline.denominator ? ` / ${detail.baseline.denominator}` : ""} · {date(detail.baseline.takenOn)}</p> : null}</div>
      <div><h4 className="text-sm font-semibold text-ink-strong">{ui("Plan")}</h4><p className="text-xs"><bdi>{detail.plannedActivity ?? "—"}</bdi>{detail.minutesPerWeek ? ` · ${ui("{0} minutes per week", [detail.minutesPerWeek])}` : ""}</p>
        {detail.privateNotes ? <p className="mt-1 rounded bg-muted p-2 text-xs" data-private>{ui("Private staff notes")}: <bdi>{detail.privateNotes}</bdi></p> : null}</div>
    </section>
    {["DRAFT", "ACTIVE"].includes(detail.status) ? <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setEditing(v => !v)}>{editing ? ui("Close editor") : ui("Edit")}</Button>
      {detail.status === "DRAFT" && (ctx.canActivate ?? ctx.leader) ? <Button size="sm" disabled={busy} onClick={() => void act("activate", {}, ui("Activated."))}>{ui("Activate")}</Button> : null}
      {detail.status === "DRAFT" && !(ctx.canActivate ?? ctx.leader) ? <span className="text-xs text-ink-muted">{ui("A school leader activates the plan after checking evidence, goal, owner and dates.")}</span> : null}
    </div> : null}
    {editing ? <Editor ctx={ctx} detail={detail} onSaved={async () => { setEditing(false); await load(); await onChanged(); }} /> : null}

    <section className="rounded-xl border border-border p-3" data-stage="share">
      <h4 className="text-sm font-semibold text-ink-strong">{ui("Family view")}</h4>
      {detail.familyShare ? <p className="text-xs" data-family-preview>{ui("Goal")}: <bdi>{detail.familyShare.goal}</bdi> · {ui("Action for home")}: <bdi>{detail.familyShare.action}</bdi></p> : <p className="text-xs">{ui("Nothing is prepared for the family.")}</p>}
      <p className="text-xs text-ink-muted">{detail.familyShare?.sharedAt ? ui("Shared on {0}. Only this goal and action are visible to the family.", [dateTime(detail.familyShare.sharedAt)]) : ui("Not shared. The family sees nothing until you share it.")}</p>
      {active && detail.familyShare && !detail.familyShare.sharedAt ? <Button size="sm" disabled={busy} onClick={() => void act("share", {}, ui("Shared with the family."))}>{ui("Share with the family")}</Button> : null}
    </section>

    {active ? <section className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-3" data-stage="check-in">
      <h4 className="text-sm font-semibold text-ink-strong sm:col-span-3">{ui("Check-in")}</h4>
      <FormField name={`ci-day-${id}`} label={ui("Date")}><Input type="date" max={todayText()} value={check.dueOn} onChange={e => setCheck(c => ({ ...c, dueOn: e.target.value }))} /></FormField>
      <FormField name={`ci-delivered-${id}`} label={ui("Was the activity delivered?")}><Select value={check.delivered} onChange={e => setCheck(c => ({ ...c, delivered: e.target.value }))}><option value="yes">{ui("Yes")}</option><option value="no">{ui("No")}</option></Select></FormField>
      <FormField name={`ci-part-${id}`} label={ui("Participation")}><Select value={check.participation} onChange={e => setCheck(c => ({ ...c, participation: e.target.value }))}>{Object.keys(PARTICIPATION).map(k => <option key={k} value={k}>{ui(PARTICIPATION[k])}</option>)}</Select></FormField>
      <FormField name={`ci-min-${id}`} label={ui("Minutes")}><Input type="number" value={check.minutes} onChange={e => setCheck(c => ({ ...c, minutes: e.target.value }))} /></FormField>
      <FormField name={`ci-adj-${id}`} label={ui("Adjustment")}><Input value={check.adjustment} onChange={e => setCheck(c => ({ ...c, adjustment: e.target.value }))} /></FormField>
      <FormField name={`ci-next-${id}`} label={ui("Next check-in")}><Input type="date" value={check.next} onChange={e => setCheck(c => ({ ...c, next: e.target.value }))} /></FormField>
      <Button size="sm" disabled={busy} onClick={() => void act("check-in", { dueOn: check.dueOn, delivered: check.delivered === "yes", minutes: check.minutes ? Number(check.minutes) : null, participation: check.participation, adjustment: check.adjustment || null, pupilFeedback: null, nextCheckInDate: check.next || null }, ui("Check-in recorded."))}>{ui("Record check-in")}</Button>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-3">
        <FormField name={`rs-date-${id}`} label={ui("Reschedule to")}><Input type="date" value={reschedule.date} onChange={e => setReschedule(r => ({ ...r, date: e.target.value }))} /></FormField>
        <FormField name={`rs-reason-${id}`} label={ui("Reason")}><Input value={reschedule.reason} onChange={e => setReschedule(r => ({ ...r, reason: e.target.value }))} /></FormField>
        <Button size="sm" variant="secondary" disabled={busy || !reschedule.date || reschedule.reason.trim().length < 10} onClick={() => void act("reschedule", { nextCheckInDate: reschedule.date, reason: reschedule.reason }, ui("Check-in rescheduled."))}>{ui("Reschedule")}</Button>
      </div>
      {detail.checkIns.length ? <ul className="text-xs sm:col-span-3" data-check-ins>{detail.checkIns.map(c => <li key={c.id}>{date(c.dueOn)} · {c.delivered ? ui("Delivered") : ui("Not delivered")} · {ui(PARTICIPATION[c.participation] ?? c.participation)}{c.minutes ? ` · ${ui("{0} minutes", [c.minutes])}` : ""}</li>)}</ul> : null}
    </section> : null}

    {active ? <section className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-3" data-stage="review">
      <h4 className="text-sm font-semibold text-ink-strong sm:col-span-3">{ui("Outcome review")}</h4>
      <p className="text-xs text-ink-muted sm:col-span-3">{ui("Compare fresh evidence with the baseline. Taking part is not the same as progress, and a before-and-after comparison does not show the action caused a change.")}</p>
      <FormField name={`rv-decision-${id}`} label={ui("Decision")}><Select value={review.decision} onChange={e => setReview(r => ({ ...r, decision: e.target.value }))}>{Object.keys(DECISION).map(k => <option key={k} value={k}>{ui(DECISION[k])}</option>)}</Select></FormField>
      <FormField name={`rv-measure-${id}`} label={ui("Follow-up measure")}><Input value={review.measure} onChange={e => setReview(r => ({ ...r, measure: e.target.value }))} /></FormField>
      <div className="grid grid-cols-2 gap-2"><FormField name={`rv-value-${id}`} label={ui("Score")}><Input type="number" value={review.value} onChange={e => setReview(r => ({ ...r, value: e.target.value }))} /></FormField><FormField name={`rv-of-${id}`} label={ui("Out of")}><Input type="number" value={review.of} onChange={e => setReview(r => ({ ...r, of: e.target.value }))} /></FormField></div>
      <FormField name={`rv-comparable-${id}`} label={ui("Comparable with the baseline?")}><Select value={review.comparable} onChange={e => setReview(r => ({ ...r, comparable: e.target.value }))}><option value="yes">{ui("Yes")}</option><option value="no">{ui("No")}</option></Select></FormField>
      <FormField name={`rv-diff-${id}`} label={ui("What differed")}><Input value={review.differences} onChange={e => setReview(r => ({ ...r, differences: e.target.value }))} /></FormField>
      <FormField name={`rv-limits-${id}`} label={ui("Limitations")}><Input value={review.limitations} onChange={e => setReview(r => ({ ...r, limitations: e.target.value }))} /></FormField>
      <FormField name={`rv-next-${id}`} label={ui("New review date (extend)")}><Input type="date" value={review.nextReviewDate} onChange={e => setReview(r => ({ ...r, nextReviewDate: e.target.value }))} /></FormField>
      <FormField name={`rv-owner-${id}`} label={ui("Takes it on (escalate)")}><Select value={review.nextOwnerId} onChange={e => setReview(r => ({ ...r, nextOwnerId: e.target.value }))}><option value="">—</option>{ctx.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField>
      <FormField name={`rv-reason-${id}`} label={ui("Reason for the decision")}><Textarea value={review.reason} onChange={e => setReview(r => ({ ...r, reason: e.target.value }))} /></FormField>
      <Button size="sm" disabled={busy || review.reason.trim().length < 10} onClick={() => void act("review", { decision: review.decision, reason: review.reason, limitations: review.limitations,
        followUp: review.measure ? { measure: review.measure, value: review.value === "" ? null : Number(review.value), denominator: review.of === "" ? null : Number(review.of), takenOn: todayText(), source: "Teacher-approved follow-up", comparable: review.comparable === "yes", differences: review.differences } : null,
        nextReviewDate: review.nextReviewDate || null, nextOwnerId: review.nextOwnerId || null }, ui("Decision recorded."))}>{ui("Record decision")}</Button>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-3">
        <FormField name={`ho-owner-${id}`} label={ui("Hand over to")}><Select value={handoff.ownerId} onChange={e => setHandoff(h => ({ ...h, ownerId: e.target.value }))}><option value="">—</option>{ctx.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField>
        <FormField name={`ho-reason-${id}`} label={ui("Reason")}><Input value={handoff.reason} onChange={e => setHandoff(h => ({ ...h, reason: e.target.value }))} /></FormField>
        <Button size="sm" variant="secondary" disabled={busy || !handoff.ownerId || handoff.reason.trim().length < 10} onClick={() => void act("handoff", handoff, ui("Responsible adult changed."))}>{ui("Hand over")}</Button>
      </div>
    </section> : null}

    {detail.outcome ? <section className="rounded-xl bg-muted/60 p-3 text-xs" data-outcome>
      <p className="font-bold">{ui(DECISION[detail.outcome.decision] ?? detail.outcome.decision)} — <bdi>{detail.outcome.reason}</bdi></p>
      <p>{ui("Participation")}: {ui("{0} of {1} check-ins delivered, {2} minutes, absent {3} time(s)", [detail.outcome.participation.delivered, detail.outcome.participation.checkIns, detail.outcome.participation.minutes, detail.outcome.participation.absent])}</p>
      <p>{ui("Baseline")}: {detail.baseline ? `${detail.baseline.value ?? "—"}${detail.baseline.denominator ? ` / ${detail.baseline.denominator}` : ""}` : "—"} · {ui("Follow-up")}: {detail.outcome.followUp ? `${detail.outcome.followUp.value ?? "—"}${detail.outcome.followUp.denominator ? ` / ${detail.outcome.followUp.denominator}` : ""}${detail.outcome.followUp.comparable ? "" : ` (${ui("not comparable")})`}` : ui("No follow-up evidence")}</p>
      {detail.outcome.limitations ? <p>{ui("Limitations")}: <bdi>{detail.outcome.limitations}</bdi></p> : null}
      <p className="text-ink-muted">{ui("This compares evidence before and after the action. It does not show that the action caused any change.")}</p>
    </section> : null}

    <details className="text-xs" data-history><summary className="cursor-pointer font-bold">{ui("History")}</summary><ol className="mt-1 space-y-0.5">{detail.events.map(e => <li key={e.id}>{ui("Version {0}", [e.version])} · {ui(EVENT[e.kind] ?? e.kind)} · {dateTime(e.createdAt)}{e.reason ? <> · <bdi>{e.reason}</bdi></> : null}</li>)}</ol></details>
  </div>;
}
