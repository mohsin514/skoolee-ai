"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

// SKO-450: improvement evidence workspace. Frameworks are school-configured references and no accreditation outcome
// is implied. Every claim keeps its source, date and freshness beside it; gaps are shown, not hidden. Actions link to
// a documented reassessment, and before/after observations never claim a cause.

type Ui = ReturnType<typeof useUiText>;
async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}
type Item = { id: string; sourceType: string; sourceDate: string; sourceVersion: string; freshness: string; reviewState: string; verified: boolean; stance: string; sensitivity: string; audience: string; restricted: boolean; sourceId: string | null; title: string | null; note: string | null; owner: string; ownerId: string; reviewBy: string; reviewNote: string | null; reviewer: string | null; criterionIds: string[]; narrativeOnly: boolean };
type Criterion = { id: string; code: string; title: string; interpretation: string | null; interpretationApproved: boolean; interpretationApprovedBy: string | null; status: string; items: Item[]; actionIds: string[]; gaps: string[] };
type Action = { id: string; title: string; owner: string; ownerId: string; dueDate: string; expectedMeasure: string; criterionIds: string[]; status: string; overdue: boolean; version: number; milestones: { label: string; date: string; done: boolean }[]; reassessment: { measure: string; baseline: string; followUp: string; comparable: boolean; note?: string | null } | null; reflection: string | null; outcome: { state: string; text: string }; completionEvidenceId: string | null; completedBy: string | null; learningAction: { id: string | null; status: string; version: number | null } | null };
type View = { framework: { id: string; name: string; version: string; status: string; disclaimer: string }; asOf: string; criteria: Criterion[]; actions: Action[]; summary: { current: number; total: number; needsEvidence: number; overdueActions: number; excludedForAudience: number } };
type Data = { frameworks: { id: string; name: string; version: string; status: string }[]; mode: "LEAD" | "STAFF" | "REVIEWER"; view: View | null; packs: { id: string; version: number; audience: string; digest: string; createdAt: string; gaps: number }[]; grants: { id: string; userId: string; name: string; criterionIds: string[]; expiresAt: string; active: boolean }[] };
type Person = { id: string; fullName: string; role: string };

const statusLabel = (ui: Ui, s: string) => ({ CURRENT: ui("Current evidence"), STALE: ui("Stale evidence"), MISSING: ui("Needs evidence"), UNVERIFIED: ui("Not yet reviewed"), CONFLICTING: ui("Conflicting evidence") } as Record<string, string>)[s] ?? s;
const statusTone = (s: string) => s === "CURRENT" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : s === "CONFLICTING" ? "bg-rose-50 text-rose-800 border-rose-200" : "bg-amber-50 text-amber-900 border-amber-200";
const freshLabel = (ui: Ui, f: string) => ({ CURRENT: ui("Current"), SOURCE_CHANGED: ui("Source changed since linked"), EXPIRED: ui("Past its review date"), MISSING: ui("Source unavailable") } as Record<string, string>)[f] ?? f;
const reviewLabel = (ui: Ui, r: string) => ({ PENDING: ui("Awaiting review"), ACCEPTED: ui("Reviewed and accepted"), MORE_REQUESTED: ui("More evidence requested") } as Record<string, string>)[r] ?? r;
const sourceLabel = (ui: Ui, t: string) => ({ INTERVENTION: ui("Learning action"), REPORT_CARD: ui("Report card"), CLINIC_VISIT: ui("Clinic visit"), CARE_PLAN: ui("Care plan"), DOCUMENT: ui("Narrative note") } as Record<string, string>)[t] ?? t;
const audienceLabel = (ui: Ui, a: string) => ({ STAFF: ui("Staff only"), REVIEWER: ui("Staff and reviewers"), EXTERNAL: ui("May go in external packs") } as Record<string, string>)[a] ?? a;
const outcomeLabel = (ui: Ui, o: Action["outcome"]) => o.state === "NOT_REASSESSED" ? ui("Reassessment not recorded · no outcome claimed") : o.state === "NOT_COMPARABLE" ? ui("Follow-up recorded · measures not comparable") : `${o.text.split(" · ")[0]} · ${ui("Observed change · cause not established")}`;
const gapText = (ui: Ui, s: string) => ({ MISSING: ui("No evidence linked"), STALE: ui("All linked evidence is stale"), UNVERIFIED: ui("Evidence not yet reviewed"), CONFLICTING: ui("Reviewed evidence conflicts") } as Record<string, string>)[s] ?? "";
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function CriteriaPicker({ criteria, value, onChange, name }: { criteria: Criterion[]; value: string[]; onChange: (v: string[]) => void; name: string }) {
  return <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2" data-criteria-picker={name}>{criteria.map(c => <label key={c.id} className="flex items-start gap-2 text-sm"><Checkbox checked={value.includes(c.id)} onChange={e => onChange(e.target.checked ? [...value, c.id] : value.filter(x => x !== c.id))} data-pick-criterion={c.code} /><span><bdi dir="ltr" className="font-semibold">{c.code}</bdi> · {c.title}</span></label>)}</div>;
}

function EvidenceForm({ view, preset, onDone }: { view: View; preset: string | null; onDone: () => void }) {
  const ui = useUiText();
  const [sources, setSources] = useState<{ type: string; id: string; label: string }[]>([]);
  const [f, setF] = useState({ criterionIds: preset ? [preset] : [] as string[], sourceType: "INTERVENTION", sourceId: "", title: "", note: "", reviewBy: inDays(180), audience: "STAFF", stance: "SUPPORTS", pupilData: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { call("/api/improvement?view=sources").then(setSources).catch(() => setSources([])); }, []);
  const options = sources.filter(s => s.type === f.sourceType);
  return <div className="space-y-3" data-evidence-form>
    <FormField name="ev-criteria" label={ui("Criteria this evidence supports")}><CriteriaPicker criteria={view.criteria} value={f.criterionIds} onChange={v => setF({ ...f, criterionIds: v })} name="evidence" /></FormField>
    <div className="grid gap-2 sm:grid-cols-2">
      <FormField name="ev-type" label={ui("Source")}><Select value={f.sourceType} onChange={e => setF({ ...f, sourceType: e.target.value, sourceId: "" })} data-evidence-type>{["INTERVENTION", "REPORT_CARD", "DOCUMENT"].map(t => <option key={t} value={t}>{sourceLabel(ui, t)}</option>)}</Select></FormField>
      {f.sourceType !== "DOCUMENT" ? <FormField name="ev-source" label={ui("Record")}><Select value={f.sourceId} onChange={e => setF({ ...f, sourceId: e.target.value })} data-evidence-source><option value="">{ui("Choose the source record")}</option>{options.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></FormField> : null}
    </div>
    <FormField name="ev-title" label={ui("What this evidence shows")}><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} dir="auto" data-evidence-title /></FormField>
    {f.sourceType === "DOCUMENT" ? <FormField name="ev-note" label={ui("Evidence note")} hint={ui("A narrative stays unverified until someone else reviews it.")}><Textarea value={f.note} onChange={e => setF({ ...f, note: e.target.value })} rows={3} dir="auto" data-evidence-note /></FormField> : null}
    <div className="grid gap-2 sm:grid-cols-3">
      <FormField name="ev-review" label={ui("Review by")}><Input type="date" value={f.reviewBy} onChange={e => setF({ ...f, reviewBy: e.target.value })} data-evidence-review-by /></FormField>
      <FormField name="ev-aud" label={ui("Who may see it")}><Select value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })} data-evidence-audience>{["STAFF", "REVIEWER", "EXTERNAL"].map(a => <option key={a} value={a}>{audienceLabel(ui, a)}</option>)}</Select></FormField>
      <FormField name="ev-stance" label={ui("Stance")}><Select value={f.stance} onChange={e => setF({ ...f, stance: e.target.value })} data-evidence-stance><option value="SUPPORTS">{ui("Supports the criterion")}</option><option value="CONTRADICTS">{ui("Contradicts the criterion")}</option></Select></FormField>
    </div>
    {f.sourceType === "DOCUMENT" ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.pupilData} onChange={e => setF({ ...f, pupilData: e.target.checked })} />{ui("Contains pupil information")}</label> : null}
    <p className="text-xs text-ink-muted">{ui("Pupil and clinic sources are shown as restricted to reviewers and in packs.")}</p>
    <Button disabled={busy || !f.criterionIds.length || f.title.trim().length < 3 || (f.sourceType !== "DOCUMENT" && !f.sourceId)} data-evidence-save onClick={async () => {
      setBusy(true);
      try { await call("/api/improvement", "POST", { action: "evidence", frameworkId: view.framework.id, ...f, sourceId: f.sourceType === "DOCUMENT" ? null : f.sourceId, note: f.note || null }); toast.success(ui("Evidence linked with its source version.")); onDone(); }
      catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); }
    }}>{ui("Add evidence")}</Button>
  </div>;
}

function ItemRow({ item, data, reload }: { item: Item; data: Data; reload: () => Promise<void> }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [reviewing, setReviewing] = useState(false), [note, setNote] = useState(""), [opened, setOpened] = useState<string | null>(null);
  const review = async (decision: "ACCEPT" | "REQUEST_MORE") => {
    try { await call("/api/improvement", "POST", { action: "review", itemId: item.id, decision, note: note || null }); toast.success(decision === "ACCEPT" ? ui("Evidence note approved.") : ui("More evidence requested.")); setReviewing(false); await reload(); }
    catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); }
  };
  return <li className="rounded-xl border border-border p-3 text-sm" data-evidence-item={item.id} data-freshness={item.freshness} data-review-state={item.reviewState} data-restricted={item.restricted ? "true" : "false"}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{item.restricted ? ui("Restricted source · {0}", [sourceLabel(ui, item.sourceType)]) : <bdi>{item.title}</bdi>}</span>
      <span className={cn("rounded-full border px-2 py-0.5 text-xs", item.freshness === "CURRENT" ? "border-emerald-200 text-emerald-800" : "border-amber-200 text-amber-900")} data-freshness-label>{freshLabel(ui, item.freshness)}</span>
      <span className="rounded-full border border-border px-2 py-0.5 text-xs">{reviewLabel(ui, item.reviewState)}</span>
      {item.stance === "CONTRADICTS" ? <span className="rounded-full border border-rose-200 px-2 py-0.5 text-xs text-rose-800">{ui("Contradicts the criterion")}</span> : null}
      {item.narrativeOnly ? <span className="text-xs text-ink-muted">{ui("Narrative only · not verified")}</span> : null}
    </div>
    <p className="mt-1 text-xs text-ink-muted">{sourceLabel(ui, item.sourceType)} · <bdi dir="ltr">{item.sourceVersion}</bdi> · {ui("Source date {0}", [date(item.sourceDate)])} · {ui("Review by {0}", [date(item.reviewBy)])} · {ui("Owner")}: <bdi>{item.owner}</bdi> · {audienceLabel(ui, item.audience)}</p>
    {item.reviewNote ? <p className="mt-1 text-xs" data-review-note>{ui("Reviewer")}: <bdi>{item.reviewer}</bdi> — <bdi>{item.reviewNote}</bdi></p> : null}
    {opened ? <p className="mt-1 rounded-lg bg-surface-muted p-2 text-xs" data-source-preview>{opened}</p> : null}
    <div className="mt-2 flex flex-wrap gap-2">
      <Button size="sm" variant="ghost" data-open-source onClick={async () => {
        try { const s = await call(`/api/improvement?view=source&itemId=${item.id}`); setOpened(s.content ? `${s.content.label ?? s.content.note ?? ""}${s.current ? "" : ` · ${ui("Source changed since linked")}`}` : ui(s.message ?? "This evidence source is unavailable. The criterion remains incomplete.")); }
        catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); }
      }}>{ui("Open source")}</Button>
      {data.mode !== "STAFF" ? <Button size="sm" variant="outline" onClick={() => setReviewing(!reviewing)} data-review-open>{ui("Review evidence")}</Button> : null}
    </div>
    {reviewing ? <div className="mt-2 space-y-2" data-review-form>
      <FormField name={`rv-${item.id}`} label={ui("Review note")}><Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} dir="auto" data-review-note-input /></FormField>
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => review("ACCEPT")} data-review-accept>{ui("Approve evidence note")}</Button><Button size="sm" variant="outline" onClick={() => review("REQUEST_MORE")} data-review-more>{ui("Request more evidence")}</Button></div>
    </div> : null}
  </li>;
}

function ActionCard({ action, view, data, reload }: { action: Action; view: View; data: Data; reload: () => Promise<void> }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [mode, setMode] = useState<null | "follow" | "complete">(null);
  const [r, setR] = useState({ measure: action.reassessment?.measure ?? action.expectedMeasure.slice(0, 120), baseline: action.reassessment?.baseline ?? "", followUp: action.reassessment?.followUp ?? "", comparable: action.reassessment?.comparable ?? true, reflection: action.reflection ?? "" });
  const accepted = view.criteria.flatMap(c => c.items).filter((i, idx, all) => i.verified && i.freshness === "CURRENT" && all.findIndex(x => x.id === i.id) === idx);
  const [evidenceId, setEvidenceId] = useState("");
  const codes = view.criteria.filter(c => action.criterionIds.includes(c.id)).map(c => c.code);
  const post = async (body: Record<string, unknown>, done: string) => { try { await call("/api/improvement", "POST", body); toast.success(done); setMode(null); await reload(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } };
  return <li className="sk-panel space-y-2 p-4 text-sm" data-action={action.id} data-action-status={action.status} data-outcome={action.outcome.state}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold"><bdi>{action.title}</bdi></h3>
      <div className="flex flex-wrap gap-1">{action.overdue ? <span className="rounded-full border border-rose-200 px-2 py-0.5 text-xs text-rose-800" data-action-overdue>{ui("Overdue")}</span> : null}<span className="rounded-full border border-border px-2 py-0.5 text-xs">{action.status === "COMPLETED" ? ui("Completed") : ui("Open")}</span></div></div>
    <p className="text-xs text-ink-muted">{ui("Owner")}: <bdi>{action.owner}</bdi> · {ui("Due {0}", [date(action.dueDate)])} · {ui("Criteria")}: <bdi dir="ltr">{codes.join(", ")}</bdi></p>
    <p>{ui("Expected measure")}: <bdi>{action.expectedMeasure}</bdi></p>
    {action.learningAction ? <p className="text-xs" data-learning-action>{ui("Linked learning action")}: {action.learningAction.status}{action.learningAction.version ? ` · v${action.learningAction.version}` : ""} · {ui("Managed in learning actions; not changed here.")}</p> : null}
    {action.milestones.length ? <ul className="text-xs">{action.milestones.map((m, i) => <li key={i}>{m.done ? "✓" : "○"} <bdi>{m.label}</bdi> · {date(m.date)}</li>)}</ul> : null}
    <p className="font-semibold" data-outcome-text>{outcomeLabel(ui, action.outcome)}</p>
    {action.reflection ? <p className="text-xs"><bdi>{action.reflection}</bdi></p> : null}
    {action.status === "OPEN" && (data.mode === "LEAD" || data.mode === "STAFF") ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setMode(mode === "follow" ? null : "follow")} data-follow-open>{ui("Record follow-up measure")}</Button><Button size="sm" onClick={() => setMode(mode === "complete" ? null : "complete")} data-complete-open>{ui("Complete with evidence")}</Button></div> : null}
    {mode === "follow" ? <div className="grid gap-2 sm:grid-cols-3" data-follow-form>
      <FormField name={`m-${action.id}`} label={ui("Measure")}><Input value={r.measure} onChange={e => setR({ ...r, measure: e.target.value })} dir="auto" data-follow-measure /></FormField>
      <FormField name={`b-${action.id}`} label={ui("Baseline")}><Input value={r.baseline} onChange={e => setR({ ...r, baseline: e.target.value })} dir="auto" data-follow-baseline /></FormField>
      <FormField name={`f-${action.id}`} label={ui("Follow-up")}><Input value={r.followUp} onChange={e => setR({ ...r, followUp: e.target.value })} dir="auto" data-follow-followup /></FormField>
      <label className="flex items-center gap-2 text-sm sm:col-span-3"><Checkbox checked={r.comparable} onChange={e => setR({ ...r, comparable: e.target.checked })} data-follow-comparable />{ui("Baseline and follow-up used a comparable measure")}</label>
      <div className="sm:col-span-3"><FormField name={`rf-${action.id}`} label={ui("Reflection")}><Textarea value={r.reflection} onChange={e => setR({ ...r, reflection: e.target.value })} rows={2} dir="auto" data-follow-reflection /></FormField></div>
      <Button size="sm" disabled={!r.baseline || !r.followUp} data-follow-save onClick={() => post({ action: "follow-up", actionId: action.id, expectedVersion: action.version, reassessment: { measure: r.measure, baseline: r.baseline, followUp: r.followUp, comparable: r.comparable }, reflection: r.reflection }, ui("Follow-up recorded."))}>{ui("Save follow-up")}</Button>
    </div> : null}
    {mode === "complete" ? <div className="space-y-2" data-complete-form>
      <FormField name={`ce-${action.id}`} label={ui("Completion evidence")} hint={ui("Only reviewed, current evidence can complete an action.")}><Select value={evidenceId} onChange={e => setEvidenceId(e.target.value)} data-complete-evidence><option value="">{ui("Choose reviewed evidence")}</option>{accepted.map(i => <option key={i.id} value={i.id}>{i.restricted ? ui("Restricted source · {0}", [sourceLabel(ui, i.sourceType)]) : i.title}</option>)}</Select></FormField>
      <Button size="sm" disabled={!evidenceId} data-complete-save onClick={() => post({ action: "complete", actionId: action.id, expectedVersion: action.version, evidenceId }, ui("Action completed with reviewed evidence."))}>{ui("Complete action")}</Button>
    </div> : null}
  </li>;
}

export function ImprovementWorkspace() {
  const ui = useUiText();
  const { date, dateTime } = useLocaleFormat();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState<string | null>(null), [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [modal, setModal] = useState<null | { kind: "framework" | "evidence" | "action" | "grant" | "export" | "interpret"; criterionId?: string }>(null);
  const [onlyGaps, setOnlyGaps] = useState(false), [open, setOpen] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => {
    try { const d: Data = await call(`/api/improvement?view=workspace${frameworkId ? `&frameworkId=${frameworkId}` : ""}`); setData(d); setError(null); if (d.mode === "LEAD" && !people.length) setPeople(await call("/api/improvement?view=staff").catch(() => [])); }
    catch (e) { setError(e instanceof Error ? e.message : "Unavailable"); }
  }, [frameworkId, people.length]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <p className="sk-panel p-4 text-sm" role="alert" data-improvement-denied>{ui(error)}</p>;
  if (!data) return <p className="text-sm text-ink-muted" aria-live="polite">{ui("Checking source access and evidence freshness.")}</p>;
  const view = data.view, lead = data.mode === "LEAD";
  const close = async () => { setModal(null); await load(); };
  return <div className="min-w-0 space-y-5" data-improvement data-mode={data.mode}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-black">{ui("Improvement evidence")}</h1><p className="text-sm text-ink-muted" data-disclaimer>{ui("School-configured framework. No accreditation outcome is implied.")}</p></div>
      <div className="flex flex-wrap gap-2">
        {data.frameworks.length ? <Select className="w-auto" value={view?.framework.id ?? ""} onChange={e => setFrameworkId(e.target.value)} aria-label={ui("Framework")} data-framework-select>{data.frameworks.map(f => <option key={f.id} value={f.id}>{f.name} · {f.version}{f.status === "RETIRED" ? ` (${ui("Retired")})` : ""}</option>)}</Select> : null}
        {lead ? <Button variant="outline" onClick={() => setModal({ kind: "framework" })} data-framework-new>{ui("New framework version")}</Button> : null}
      </div>
    </header>
    {!view ? <p className="sk-panel p-4 text-sm" data-improvement-empty>{ui("No criteria mapped. Select a framework and add your first evidence link.")}</p> : <>
      <section className="sk-panel flex flex-wrap items-center justify-between gap-3 p-4" data-summary>
        <div><p className="text-lg font-black" data-summary-current>{ui("Current: {0} of {1}", [String(view.summary.current), String(view.summary.total)])}</p>
          <p className="text-sm text-ink-muted">{view.summary.needsEvidence ? ui("{0} criteria need current evidence", [String(view.summary.needsEvidence)]) : ui("Every criterion has current, reviewed evidence.")}{view.summary.overdueActions ? ` · ${ui("{0} overdue actions", [String(view.summary.overdueActions)])}` : ""} · {ui("As of {0}", [date(view.asOf)])}</p>
          {data.mode === "REVIEWER" ? <p className="text-xs text-ink-muted" data-reviewer-scope>{ui("You can review the criteria you were granted. Restricted sources stay closed.")}</p> : null}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant={onlyGaps ? "default" : "outline"} onClick={() => setOnlyGaps(!onlyGaps)} aria-pressed={onlyGaps} data-review-gaps>{ui("Review gaps")}</Button>
          {data.mode !== "REVIEWER" && view.framework.status === "ACTIVE" ? <Button variant="outline" onClick={() => setModal({ kind: "evidence" })} data-evidence-add>{ui("Add evidence")}</Button> : null}
          {lead ? <Button onClick={() => setModal({ kind: "export" })} data-export-open>{ui("Export a versioned pack")}</Button> : null}
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="criteria-h"><h2 id="criteria-h" className="text-base font-bold">{ui("Evidence map")}</h2>
        <ul className="space-y-2">{view.criteria.filter(c => !onlyGaps || c.status !== "CURRENT" || !c.interpretationApproved).map(c => <li key={c.id} className="sk-panel p-4" data-criterion={c.code} data-criterion-status={c.status}>
          <Button variant="ghost" type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-start" aria-expanded={!!open[c.id]} onClick={() => setOpen({ ...open, [c.id]: !open[c.id] })} data-criterion-toggle={c.code}>
            <span className="font-bold"><bdi dir="ltr">{c.code}</bdi> · {c.title}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-xs", statusTone(c.status))} data-criterion-status-label>{statusLabel(ui, c.status)}</span>
          </Button>
          <p className="mt-1 text-xs text-ink-muted">{view.framework.name} · <bdi dir="ltr">{view.framework.version}</bdi> · {c.interpretationApproved ? <>{ui("School interpretation approved")} · <bdi>{c.interpretationApprovedBy}</bdi></> : <span data-interpretation-pending>{ui("Interpretation not yet approved")}</span>}</p>
          {open[c.id] ? <div className="mt-3 space-y-2">
            {c.interpretation ? <p className="text-sm"><bdi>{c.interpretation}</bdi></p> : null}
            {lead ? <Button size="sm" variant="ghost" onClick={() => setModal({ kind: "interpret", criterionId: c.id })} data-interpret-open={c.code}>{ui("Approve interpretation")}</Button> : null}
            {c.gaps.length ? <ul className="text-xs text-amber-900" data-criterion-gaps>{[...(!c.interpretationApproved ? [ui("Interpretation not yet approved")] : []), ...(gapText(ui, c.status) ? [gapText(ui, c.status)] : []), ...c.items.filter(i => i.freshness !== "CURRENT").map(i => `${i.restricted ? ui("Restricted source · {0}", [sourceLabel(ui, i.sourceType)]) : i.title} — ${freshLabel(ui, i.freshness)}`)].map((g, i) => <li key={i}><bdi>{g}</bdi></li>)}</ul> : null}
            {c.items.length ? <ul className="space-y-2">{c.items.map(i => <ItemRow key={i.id} item={i} data={data} reload={load} />)}</ul> : <p className="text-sm text-ink-muted">{ui("No evidence linked")}</p>}
            {data.mode !== "REVIEWER" && view.framework.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => setModal({ kind: "evidence", criterionId: c.id })} data-evidence-add-for={c.code}>{ui("Add evidence")}</Button> : null}
          </div> : null}
        </li>)}</ul>
      </section>

      <section className="space-y-2" aria-labelledby="actions-h"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="actions-h" className="text-base font-bold">{ui("Improvement actions")}</h2>{lead ? <Button size="sm" variant="outline" onClick={() => setModal({ kind: "action" })} data-action-new>{ui("Create an improvement action")}</Button> : null}</div>
        {view.actions.length ? <ul className="space-y-2">{view.actions.map(a => <ActionCard key={`${a.id}:${a.version}`} action={a} view={view} data={data} reload={load} />)}</ul> : <p className="text-sm text-ink-muted">{ui("No improvement actions yet.")}</p>}
      </section>

      {lead ? <section className="sk-panel space-y-2 p-4" data-grants><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">{ui("Reviewer access")}</h2><Button size="sm" variant="outline" onClick={() => setModal({ kind: "grant" })} data-grant-open>{ui("Grant reviewer access")}</Button></div>
        {data.grants.length ? <ul className="space-y-1 text-sm">{data.grants.map(g => <li key={g.id} className="flex flex-wrap items-center justify-between gap-2" data-grant={g.userId}><span><bdi>{g.name}</bdi> · {ui("{0} criteria", [String(g.criterionIds.length)])} · {ui("Until {0}", [date(g.expiresAt)])}</span><Button size="sm" variant="ghost" data-grant-revoke onClick={async () => { try { await call("/api/improvement", "POST", { action: "revoke", id: g.id }); toast.success(ui("Reviewer access revoked.")); await load(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } }}>{ui("Revoke")}</Button></li>)}</ul> : <p className="text-sm text-ink-muted">{ui("No reviewer has access.")}</p>}
      </section> : null}

      {data.packs.length ? <section className="sk-panel space-y-2 p-4" data-packs><h2 className="text-base font-bold">{ui("Evidence packs")}</h2>
        <ul className="space-y-1 text-sm">{data.packs.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2" data-pack={p.version}><span>{ui("Version {0}", [String(p.version)])} · {p.audience === "EXTERNAL" ? ui("External") : ui("Staff")} · {dateTime(p.createdAt)} · {ui("{0} marked gaps", [String(p.gaps)])} · <bdi dir="ltr" className="font-mono text-xs">{p.digest.slice(0, 12)}</bdi></span>
          {data.mode !== "STAFF" ? <Button size="sm" variant="ghost" data-pack-download={p.version} onClick={async () => { try { const d = await call(`/api/improvement?view=pack&id=${p.id}`); const url = URL.createObjectURL(new Blob([JSON.stringify({ digest: d.digest, manifest: d.manifest }, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `evidence-pack-v${d.version}.json`; a.click(); URL.revokeObjectURL(url); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } }}>{ui("Download")}</Button> : null}</li>)}</ul>
      </section> : null}
    </>}

    {modal?.kind === "framework" ? <ModalFrame title={ui("New framework version")} onClose={() => setModal(null)}><FrameworkForm data={data} onDone={close} /></ModalFrame> : null}
    {modal?.kind === "evidence" && view ? <ModalFrame title={ui("Add evidence")} onClose={() => setModal(null)}><EvidenceForm view={view} preset={modal.criterionId ?? null} onDone={close} /></ModalFrame> : null}
    {modal?.kind === "action" && view ? <ModalFrame title={ui("Create an improvement action")} onClose={() => setModal(null)}><ActionForm view={view} people={people} onDone={close} /></ModalFrame> : null}
    {modal?.kind === "grant" && view ? <ModalFrame title={ui("Grant reviewer access")} onClose={() => setModal(null)}><GrantForm view={view} people={people} onDone={close} /></ModalFrame> : null}
    {modal?.kind === "export" && view ? <ModalFrame title={ui("Export a versioned pack")} onClose={() => setModal(null)}><ExportForm view={view} onDone={close} /></ModalFrame> : null}
    {modal?.kind === "interpret" && view ? <ModalFrame title={ui("Approve interpretation")} onClose={() => setModal(null)}><InterpretForm criterion={view.criteria.find(c => c.id === modal.criterionId)!} onDone={close} /></ModalFrame> : null}
  </div>;
}

function useSubmit(onDone: () => void) {
  const ui = useUiText();
  const [busy, setBusy] = useState(false);
  return { busy, submit: async (body: Record<string, unknown>, done: string) => { setBusy(true); try { const r = await call("/api/improvement", "POST", body); toast.success(done); onDone(); return r; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } } };
}

function FrameworkForm({ data, onDone }: { data: Data; onDone: () => void }) {
  const ui = useUiText();
  const { busy, submit } = useSubmit(onDone);
  const [f, setF] = useState({ name: "", version: "", copyFrom: "", criteria: "" });
  const criteria = f.criteria.split("\n").map(l => l.split("|").map(x => x.trim())).filter(p => p[0] && p[1]).map(([code, title]) => ({ code, title }));
  return <div className="space-y-3" data-framework-form>
    <div className="grid gap-2 sm:grid-cols-2"><FormField name="fw-name" label={ui("Framework name")}><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} dir="auto" data-framework-name /></FormField><FormField name="fw-version" label={ui("Version")}><Input value={f.version} onChange={e => setF({ ...f, version: e.target.value })} dir="ltr" data-framework-version /></FormField></div>
    {data.frameworks.length ? <FormField name="fw-copy" label={ui("Copy criteria from")} hint={ui("Copied interpretations need approval again.")}><Select value={f.copyFrom} onChange={e => setF({ ...f, copyFrom: e.target.value })} data-framework-copy><option value="">{ui("Start empty")}</option>{data.frameworks.map(x => <option key={x.id} value={x.id}>{x.name} · {x.version}</option>)}</Select></FormField> : null}
    <FormField name="fw-criteria" label={ui("Criteria, one per line: code | title")}><Textarea value={f.criteria} onChange={e => setF({ ...f, criteria: e.target.value })} rows={4} dir="auto" data-framework-criteria /></FormField>
    <Button disabled={busy || !f.name || !f.version || (!criteria.length && !f.copyFrom)} data-framework-save onClick={() => submit({ action: "framework", name: f.name, version: f.version, copyFrom: f.copyFrom || null, criteria }, ui("Framework version saved."))}>{ui("Save framework version")}</Button>
  </div>;
}

function InterpretForm({ criterion, onDone }: { criterion: Criterion; onDone: () => void }) {
  const ui = useUiText();
  const { busy, submit } = useSubmit(onDone);
  const [text, setText] = useState(criterion.interpretation ?? "");
  return <div className="space-y-3" data-interpret-form><p className="text-sm"><bdi dir="ltr" className="font-semibold">{criterion.code}</bdi> · {criterion.title}</p>
    <FormField name="int-text" label={ui("How the school reads this criterion")}><Textarea value={text} onChange={e => setText(e.target.value)} rows={4} dir="auto" data-interpret-text /></FormField>
    <Button disabled={busy || text.trim().length < 5} data-interpret-save onClick={() => submit({ action: "interpretation", criterionId: criterion.id, interpretation: text }, ui("Interpretation approved."))}>{ui("Approve interpretation")}</Button></div>;
}

function ActionForm({ view, people, onDone }: { view: View; people: Person[]; onDone: () => void }) {
  const ui = useUiText();
  const { busy, submit } = useSubmit(onDone);
  const [f, setF] = useState({ title: "", ownerId: "", dueDate: inDays(60), expectedMeasure: "", criterionIds: [] as string[] });
  return <div className="space-y-3" data-action-form>
    <FormField name="ac-title" label={ui("Action")}><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} dir="auto" data-action-title /></FormField>
    <div className="grid gap-2 sm:grid-cols-2"><FormField name="ac-owner" label={ui("Owner")}><Select value={f.ownerId} onChange={e => setF({ ...f, ownerId: e.target.value })} data-action-owner><option value="">{ui("Choose an owner")}</option>{people.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}</Select></FormField><FormField name="ac-due" label={ui("Due date")}><Input type="date" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} data-action-due /></FormField></div>
    <FormField name="ac-measure" label={ui("Expected measure")}><Textarea value={f.expectedMeasure} onChange={e => setF({ ...f, expectedMeasure: e.target.value })} rows={2} dir="auto" data-action-measure /></FormField>
    <FormField name="ac-criteria" label={ui("Criteria")}><CriteriaPicker criteria={view.criteria} value={f.criterionIds} onChange={v => setF({ ...f, criterionIds: v })} name="action" /></FormField>
    <Button disabled={busy || !f.title || !f.ownerId || f.expectedMeasure.length < 5 || !f.criterionIds.length} data-action-save onClick={() => submit({ action: "improvement", frameworkId: view.framework.id, ...f }, ui("Improvement action created."))}>{ui("Create an improvement action")}</Button>
  </div>;
}

function GrantForm({ view, people, onDone }: { view: View; people: Person[]; onDone: () => void }) {
  const ui = useUiText();
  const { busy, submit } = useSubmit(onDone);
  const [f, setF] = useState({ userId: "", criterionIds: [] as string[], expiresAt: inDays(30) });
  return <div className="space-y-3" data-grant-form>
    <FormField name="gr-user" label={ui("Reviewer")}><Select value={f.userId} onChange={e => setF({ ...f, userId: e.target.value })} data-grant-user><option value="">{ui("Choose a reviewer")}</option>{people.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}</Select></FormField>
    <FormField name="gr-criteria" label={ui("Criteria they may review")}><CriteriaPicker criteria={view.criteria} value={f.criterionIds} onChange={v => setF({ ...f, criterionIds: v })} name="grant" /></FormField>
    <FormField name="gr-exp" label={ui("Access ends")}><Input type="date" value={f.expiresAt} onChange={e => setF({ ...f, expiresAt: e.target.value })} data-grant-expires /></FormField>
    <p className="text-xs text-ink-muted">{ui("Reviewers never open pupil or clinic records and see only evidence shared with reviewers.")}</p>
    <Button disabled={busy || !f.userId || !f.criterionIds.length} data-grant-save onClick={() => submit({ action: "grant", frameworkId: view.framework.id, ...f }, ui("Reviewer access granted."))}>{ui("Grant reviewer access")}</Button>
  </div>;
}

function ExportForm({ view, onDone }: { view: View; onDone: () => void }) {
  const ui = useUiText();
  const [result, setResult] = useState<{ version: number; digest: string; gaps: number } | null>(null);
  const { busy, submit } = useSubmit(() => undefined);
  const [audience, setAudience] = useState("EXTERNAL"), [criterionIds, setCriterionIds] = useState<string[]>([]);
  const gaps = view.criteria.filter(c => (!criterionIds.length || criterionIds.includes(c.id)) && c.gaps.length).length;
  if (result) return <div className="space-y-3" data-export-result><p className="font-bold">{ui("Evidence pack version {0} created with {1} clearly marked gaps.", [String(result.version), String(result.gaps)])}</p><p className="text-xs">{ui("Digest")}: <bdi dir="ltr" className="font-mono break-all">{result.digest}</bdi></p><p className="text-xs text-ink-muted">{ui("The digest proves this file is unchanged; it does not certify the evidence.")}</p><Button onClick={onDone} data-export-close>{ui("Done")}</Button></div>;
  return <div className="space-y-3" data-export-form>
    <FormField name="ex-aud" label={ui("Audience")}><Select value={audience} onChange={e => setAudience(e.target.value)} data-export-audience><option value="EXTERNAL">{ui("External reviewers")}</option><option value="STAFF">{ui("School staff")}</option></Select></FormField>
    <FormField name="ex-crit" label={ui("Criteria (leave empty for all)")}><CriteriaPicker criteria={view.criteria} value={criterionIds} onChange={setCriterionIds} name="export" /></FormField>
    <ul className="list-disc ps-5 text-xs text-ink-muted"><li>{ui("Pupil and clinic sources are redacted in every pack.")}</li>{audience === "EXTERNAL" ? <li>{ui("Only evidence marked for external packs is included; reviewer notes are left out.")}</li> : null}<li>{ui("{0} criteria will be marked with gaps.", [String(gaps)])}</li><li>{ui("Later changes to sources never alter this version.")}</li></ul>
    <Button disabled={busy} data-export-save onClick={async () => { const r = await submit({ action: "export", frameworkId: view.framework.id, audience, criterionIds }, ui("Evidence pack created.")); if (r) setResult(r); }}>{ui("Create pack")}</Button>
  </div>;
}
