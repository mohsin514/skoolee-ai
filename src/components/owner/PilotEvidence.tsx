"use client";

import { PilotCharter } from "./PilotCharter";
import type { PilotCommercialEvidence } from "@/lib/pilots/service";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPlus, Download, FlaskConical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { PAGE_CARD_BODY } from "@/components/role-dashboard/RoleShellSkeleton";
import { cn } from "@/lib/utils";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";

// SKO-430: pilot charter, comparable observations, evidence-state measures and claim review in the
// owner console. Figures always show their denominator; withheld percentages show the reason.

type Workflow = { key: string; definition: string; successDefinition: string };
type Pilot = { id: string; name: string; cohort?: string; country: string; curriculum: string; language: string; useCase: string; startsOn: string; endsOn: string | null; championName: string; measurementOwnerId: string;
  charterHistory?: { at: string; commercial: PilotCommercialEvidence | null }[]; workflows: Workflow[]; consentReference: string | null; caseStudyPermission: string; permissionReference: string | null; synthetic: boolean; status: string; targetSchoolId: string | null;
  _count?: { observations: number; measures: number; claims: number } };
type TimeFinding = { key: string; workflow: string; counts: { baseline: number; followUp: number; paired: number }; excluded: { id: string; reason: string }[];
  missing: { baselineOnly: number; followUpOnly: number; noTaskTime: number; incomplete: number; difficultyChanged: number }; selfReported: number; assisted: number;
  medianTaskSeconds: { baseline: number | null; followUp: number | null }; medianChangeSeconds: number | null; changePercent: number | null; percentWithheld: string | null;
  medianElapsedSeconds: { baseline: number | null; followUp: number | null }; latestObservation: string | null };
type MeasureFinding = { key: string; kind: string; workflow: string | null; current: { id: string; value: number | null; denominator: number | null; unit: string; state: string; method: string; reference: string | null; periodStart: string; periodEnd: string }[];
  excludedSynthetic: number; superseded: number; rate: number | null; rateWithheld: string | null };
type Observation = { id: string; workflow: string; phase: string; participant: string; task: string; difficulty: string; activeSeconds: number | null; correctionSeconds: number | null; elapsedSeconds: number | null; completed: boolean; source: string; synthetic: boolean; excludedReason: string | null; observedOn: string };
type Claim = { id: string; version: number; statement: string; findingKey: string; identifiable: boolean; status: string; stale: boolean; reviewNote: string | null; support: { supported: boolean; reason: string | null }; exportBlockedBy: string | null };
type Detail = { pilot: Pilot; observations: Observation[]; findings: { time: TimeFinding[]; correctness: { workflow: string; extraction: MeasureFinding; final: MeasureFinding }[]; other: MeasureFinding[] }; claims: Claim[];
  activationGate?: { allowed: true; market: string } | { allowed: false; blockers: { item: string; reason: string }[] } | null };
type Exported = { generatedAt: string; statements: { claimId: string; statement: string; school: string | null; cohort: Record<string, string>; sample: Record<string, number>; limitations: string[] }[]; excluded: { claimId: string; pilot: string; reason: string }[] };

const STATE_LABEL: Record<string, string> = { MEASURED: "Measured", SELF_REPORTED: "Self-reported", TARGET: "Target", VERBAL_INTENT: "Verbal intent", UNKNOWN: "Unknown" };
const KIND_LABEL: Record<string, string> = { CORRECTNESS_EXTRACTION: "Extraction accuracy", CORRECTNESS_FINAL: "Final approved accuracy", WEEKLY_ACTIVE: "Weekly active users", SUPPORT_MINUTES: "Support effort", SERVING_COST: "Serving cost", AI_CREDITS: "AI credits used", SATISFACTION: "Satisfaction", PAID_CONVERSION: "Paid conversion", RENEWAL: "Renewal" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", APPROVED: "Approved", RETURNED: "Returned", WITHDRAWN: "Withdrawn", STALE: "Stale", WAITING_CHARTER: "Waiting for charter", WAITING_PAYMENT: "Waiting for payment", WAITING_PROVIDER: "Waiting for provider", WAITING_READINESS: "Waiting for readiness", WAITING_PILOT_GATE: "Waiting for pilot readiness gate",PLANNED: "Planned", ACTIVE: "Active", CLOSED: "Closed" };
const PERMISSION_LABEL: Record<string, string> = { NONE: "No case-study permission", AGGREGATE: "Anonymised figures only", NAMED: "School may be named" };
const PHASE_LABEL: Record<string, string> = { BASELINE: "Baseline", FOLLOW_UP: "Follow-up" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "Request failed");
  return json.data;
}

export function PilotEvidence() {
  const ui = useUiText();
  const [pilots, setPilots] = useState<Pilot[] | null>(null);
  const [owners, setOwners] = useState<{ id: string; fullName: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const detailVersion = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: "nearest" });
      errorRef.current?.focus({ preventScroll: true });
    }
  }, [error]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  // §4.4b: "Add evidence" opens one dialog for an observation or a measure on the selected pilot.
  const [adding, setAdding] = useState<"observation" | "measure" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<Exported | null>(null);

  const load = useCallback(async () => {
    try { const data = await call("/api/owner/pilots"); setPilots(data.pilots); setOwners(data.owners); setLoadFailed(false); }
    catch { setLoadFailed(true); }
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const version = ++detailVersion.current;
    setDetailLoading(true); setDetailFailed(false); setDetail(null);
    try {
      const next = await call(`/api/owner/pilots/${id}`);
      if (version === detailVersion.current) { setDetail(next); setError(null); }
    } catch {
      if (version === detailVersion.current) setDetailFailed(true);
    } finally {
      if (version === detailVersion.current) setDetailLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (selected) void loadDetail(selected);
    else { setDetail(null); setDetailLoading(false); setDetailFailed(false); }
    return () => { ++detailVersion.current; };
  }, [selected, loadDetail]);
  const currentDetail = detail?.pilot.id === selected ? detail : null;

  const act = async (action: string, data: Record<string, unknown>, success: string) => {
    if (!selected) return false;
    setError(null);
    try {
      await call(`/api/owner/pilots/${selected}`, { method: "POST", body: JSON.stringify({ action, data: action === "charter" ? { ...data, version: currentDetail?.pilot.charterHistory?.length ?? 0 } : data }) });
      // R4: the result of the operator's own action is one translated toast; a refusal stays inline.
      toast.success(ui(success)); setError(null);
      await Promise.all([loadDetail(selected), load()]);
      return true;
    } catch (e) { setError(ui((e as Error).message)); return false; }
  };
  const exportClaims = async () => {
    setExporting(true);
    try { setExported(await call("/api/owner/pilots/export")); setError(null); if (selected) await loadDetail(selected); }
    catch (e) { setError(ui((e as Error).message)); }
    finally { setExporting(false); }
  };

  const newPilot = { id: "new-pilot", label: "New pilot", icon: Plus, onClick: () => { setError(null); setCreating(true); }, disabled: pilots === null || loadFailed };
  const exportAction = { id: "export-claims", label: "Export approved claims", icon: Download, onClick: () => void exportClaims(), loading: exporting };
  return (
    // The scrolling body of the shell's one page card (addendum 2026-10-22).
    <div className={cn("custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto", PAGE_CARD_BODY)}>
      <PageHeader
        eyebrow="Platform operations"
        title="Pilot evidence"
        description="Measured pilot results only. Targets, self-reports and synthetic demos are labelled and never counted as results."
        // One primary: "Add evidence" for the pilot in view (§4.4b); with no pilot open, starting one is the first job.
        primaryAction={currentDetail ? { id: "add-evidence", label: "Add evidence", icon: ClipboardPlus, onClick: () => { setError(null); setAdding("observation"); } } : newPilot}
        secondaryActions={currentDetail ? [newPilot, exportAction] : [exportAction]}
      />
      {error && !creating && !adding ? <Alert ref={errorRef} tabIndex={-1} tone="danger" compact onDismiss={() => setError(null)}>{error}</Alert> : null}
      {creating ? (
        <Modal title={ui("New pilot")} subtitle={ui("Record the charter first, then a baseline, before reporting any impact.")} icon={FlaskConical} size="lg" onClose={() => setCreating(false)}>
          {error ? <Alert ref={errorRef} tabIndex={-1} tone="danger" compact>{error}</Alert> : null}
          <PilotForm owners={owners} onCreated={async (id) => { setCreating(false); toast.success(ui("Pilot charter saved.")); await load(); setSelected(id); }} onError={(m) => setError(ui(m))} />
        </Modal>
      ) : null}
      {adding && detail ? (
        <Modal title={ui("Add evidence")} subtitle={<bdi>{detail.pilot.name}</bdi>} icon={ClipboardPlus} size="lg" onClose={() => setAdding(null)}>
          <div className="space-y-4">
            {error ? <Alert ref={errorRef} tabIndex={-1} tone="danger" compact>{error}</Alert> : null}
            <div role="group" aria-label={ui("Kind of evidence")} className="flex flex-wrap gap-2">
              <Button type="button" variant="choice" size="sm" aria-pressed={adding === "observation"} onClick={() => setAdding("observation")}>{ui("Observation")}</Button>
              <Button type="button" variant="choice" size="sm" aria-pressed={adding === "measure"} onClick={() => setAdding("measure")}>{ui("Measure")}</Button>
            </div>
            <p className="text-sm text-ink-muted">{adding === "observation"
              ? ui("One timed task by one participant, as baseline or follow-up. Pairs are compared by participant, task and difficulty.")
              : ui("A correctness sample, adoption, support, cost or commercial figure, with its denominator and how it was measured.")}</p>
            {adding === "observation"
              ? <ObservationForm key="observation" pilot={detail.pilot} onSubmit={async (data) => { const ok = await act("observation", data, "Observation recorded."); if (ok) setAdding(null); return ok; }} />
              : <MeasureForm key="measure" pilot={detail.pilot} onSubmit={async (data) => { const ok = await act("measure", data, "Measure recorded."); if (ok) setAdding(null); return ok; }} />}
          </div>
        </Modal>
      ) : null}
      {exported ? <ExportView exported={exported} onClose={() => setExported(null)} /> : null}

      {loadFailed && pilots === null ? <div className="sk-panel"><ErrorState title={ui("Pilots did not load")} description={ui("Check your connection and try again.")} onRetry={() => void load()} /></div>
        : pilots === null ? <SkeletonList rows={3} label={ui("Loading pilots…")} />
        : pilots.length === 0 ? <div className="sk-panel"><EmptyState size="sm" icon={FlaskConical} title={ui("No pilots yet")} description={ui("Record a charter, then a baseline, before reporting any impact.")} primaryAction={newPilot} /></div>
        : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pilots.map((pilot) => (
              <li key={pilot.id}>
                <Button variant="choice" type="button" onClick={() => setSelected(pilot.id === selected ? null : pilot.id)} aria-pressed={pilot.id === selected}
                  className="h-auto w-full flex-col items-start rounded-2xl p-4 text-start font-normal">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-ink"><bdi>{pilot.name}</bdi></span>
                    <Badge>{ui(STATUS_LABEL[pilot.status] ?? pilot.status)}</Badge>
                    {pilot.synthetic ? <Badge tone="warn">{ui("Synthetic — not a result")}</Badge> : null}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted" dir="ltr"><bdi>{pilot.cohort}</bdi></span>
                  <span className="mt-2 block text-xs font-medium text-ink-subtle tabular-nums">{ui("{0} observations · {1} measures · {2} claims", [pilot._count?.observations ?? 0, pilot._count?.measures ?? 0, pilot._count?.claims ?? 0])}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}

      {detailLoading ? <SkeletonList rows={3} label={ui("Loading pilot details")} /> : detailFailed && selected ? <ErrorState title={ui("Pilot details did not load")} onRetry={() => void loadDetail(selected)} /> : currentDetail ? <PilotDetail key={currentDetail.pilot.id} detail={currentDetail} owners={owners} act={act} /> : null}
    </div>
  );
}

/** Evidence-state chip on the shared Badge (tokens, not raw palette colours). */
function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" | "good" | "bad" }) {
  const variant = tone === "warn" ? "warning" : tone === "good" ? "success" : tone === "bad" ? "danger" : "neutral";
  return <UiBadge size="sm" variant={variant}>{children}</UiBadge>;
}

function PilotForm({ owners, onCreated, onError }: { owners: { id: string; fullName: string }[]; onCreated: (id: string) => void; onError: (message: string) => void }) {
  const ui = useUiText();
  const [form, setForm] = useState({ name: "", country: "", curriculum: "", language: "en", useCase: "", startsOn: "", endsOn: "", championName: "", measurementOwnerId: owners[0]?.id ?? "", workflowKey: "", definition: "", successDefinition: "", synthetic: false });
  const [busy, setBusy] = useState(false);
  const draft = useFormDraft({
    record: "owner:pilot-charter", schema: 1, values: form, baseline: { ...form, measurementOwnerId: owners[0]?.id ?? "" },
    fields: ["name", "country", "curriculum", "language", "useCase", "startsOn", "endsOn", "championName", "measurementOwnerId", "workflowKey", "definition", "successDefinition", "synthetic"] as const,
    apply: (values) => setForm((current) => ({ ...current, ...values, synthetic: Boolean(values.synthetic) })),
  });
  const set = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault(); if (busy) return; setBusy(true);
      try {
        const pilot = await call("/api/owner/pilots", { method: "POST", body: JSON.stringify({ name: form.name, country: form.country.toUpperCase(), curriculum: form.curriculum, language: form.language, useCase: form.useCase, startsOn: form.startsOn, endsOn: form.endsOn || null,
          championName: form.championName, measurementOwnerId: form.measurementOwnerId, synthetic: form.synthetic, workflows: [{ key: form.workflowKey.toUpperCase(), definition: form.definition, successDefinition: form.successDefinition }] }) });
        draft.markSaved(); onCreated(pilot.id);
      } catch (err) { onError((err as Error).message); } finally { setBusy(false); }
    }}>
      <div className="md:col-span-2"><DraftRecovery recordLabel={ui("Pilot charter")} draft={draft} saving={busy} excluded={ui("Only charter fields are stored in this signed-in browser draft; participant observations are never stored here.")} /></div>
      <FormField name="pilot-f1" label={ui("Pilot name")} required><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></FormField>
      <FormField name="pilot-f2" label={ui("Measurement owner")} required><Select value={form.measurementOwnerId} onChange={(e) => set("measurementOwnerId", e.target.value)}>{owners.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}</Select></FormField>
      <FormField name="pilot-f3" label={ui("Country code")} hint={ui("Two letters, for example PK, SA or AE.")} required><Input dir="ltr" maxLength={2} value={form.country} onChange={(e) => set("country", e.target.value)} /></FormField>
      <FormField name="pilot-f4" label={ui("Curriculum")} required><Input value={form.curriculum} onChange={(e) => set("curriculum", e.target.value)} /></FormField>
      <FormField name="pilot-f5" label={ui("Language")} required><Select value={form.language} onChange={(e) => set("language", e.target.value)}><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option><option value="other">{ui("Other")}</option></Select></FormField>
      <FormField name="pilot-f6" label={ui("Use case")} required><Input value={form.useCase} onChange={(e) => set("useCase", e.target.value)} /></FormField>
      <FormField name="pilot-f7" label={ui("Starts on")} required><Input type="date" value={form.startsOn} onChange={(e) => set("startsOn", e.target.value)} /></FormField>
      <FormField name="pilot-f8" label={ui("Ends on")}><Input type="date" value={form.endsOn} onChange={(e) => set("endsOn", e.target.value)} /></FormField>
      <FormField name="pilot-f9" label={ui("School champion")} required><Input value={form.championName} onChange={(e) => set("championName", e.target.value)} /></FormField>
      <FormField name="pilot-f10" label={ui("Workflow key")} hint={ui("For example MARKS_ENTRY.")} required><Input dir="ltr" value={form.workflowKey} onChange={(e) => set("workflowKey", e.target.value)} /></FormField>
      <FormField name="pilot-f11" label={ui("Workflow definition")} required><Textarea value={form.definition} onChange={(e) => set("definition", e.target.value)} /></FormField>
      <FormField name="pilot-f12" label={ui("Success definition")} required><Textarea value={form.successDefinition} onChange={(e) => set("successDefinition", e.target.value)} /></FormField>
      <label className="flex items-center gap-2 text-sm md:col-span-2"><Checkbox checked={form.synthetic} onChange={(e) => set("synthetic", e.target.checked)} /> {ui("Synthetic demonstration (never reported as a result)")}</label>
      <div className="md:col-span-2"><Button type="submit" disabled={busy}>{ui(busy ? "Saving…" : "Save charter")}</Button></div>
    </form>
  );
}

/** The server's withheld reason, as a catalog key (its counts are re-inserted as {0} and {1}). */
const withheldCopy = (reason: string | null) => (reason?.startsWith("Too few") ? WITHHELD_TOO_FEW : reason ?? NO_RESULT);
const WITHHELD_TOO_FEW = "Too few paired observations for a percentage ({0} of {1} needed).";
const NO_RESULT = "No measured result yet";

const minutes = (seconds: number | null, fmt: (n: number) => string) => (seconds == null ? "—" : fmt(Math.round((seconds / 60) * 10) / 10));

function PilotDetail({ detail, owners, act }: { detail: Detail; owners: { id: string; fullName: string }[]; act: (action: string, data: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const ui = useUiText();
  const { number } = useLocaleFormat();
  const fmt = (n: number) => number(n);
  const { pilot, findings, observations, claims } = detail;
  const [consent, setConsent] = useState(pilot.consentReference ?? "");
  const [permission, setPermission] = useState(pilot.caseStudyPermission);
  const [permissionRef, setPermissionRef] = useState(pilot.permissionReference ?? "");
  const [excluding, setExcluding] = useState<Observation | null>(null);
  const findingKeys = [...findings.time.map((f) => f.key), ...findings.correctness.flatMap((c) => [c.extraction.key, c.final.key]), ...findings.other.map((f) => f.key)];
  return (
    <section className="space-y-6" aria-labelledby="pilot-detail-heading">
      <PilotCharter history={pilot.charterHistory ?? []} workflows={pilot.workflows} save={data => act("charter", data, "Charter updated.")} />
      <div className="sk-panel p-4 sm:p-6">
        <h2 id="pilot-detail-heading" className="text-base font-bold text-ink"><bdi>{pilot.name}</bdi></h2>
        {pilot.synthetic ? <p className="mt-1 text-sm font-semibold text-status-warning-text">{ui("Synthetic demonstration: excluded from every finding, claim and export.")}</p> : null}
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs font-bold text-ink-muted">{ui("Cohort")}</dt><dd dir="ltr"><bdi>{pilot.country} · {pilot.curriculum} · {pilot.language} · {pilot.useCase}</bdi></dd></div>
          <div><dt className="text-xs font-bold text-ink-muted">{ui("Dates")}</dt><dd dir="ltr">{pilot.startsOn.slice(0, 10)} → {pilot.endsOn?.slice(0, 10) ?? ui("open")}</dd></div>
          <div><dt className="text-xs font-bold text-ink-muted">{ui("School champion")}</dt><dd><bdi>{pilot.championName}</bdi></dd></div>
          <div><dt className="text-xs font-bold text-ink-muted">{ui("Measurement owner")}</dt><dd><bdi>{owners.find((o) => o.id === pilot.measurementOwnerId)?.fullName ?? "—"}</bdi></dd></div>
        </dl>
        <ul className="mt-3 space-y-1 text-sm">{pilot.workflows.map((w) => <li key={w.key}><span className="font-bold" dir="ltr">{w.key}</span>: <bdi>{w.definition}</bdi> — <span className="text-ink-muted"><bdi>{w.successDefinition}</bdi></span></li>)}</ul>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <FormField name="pilot-f13" label={ui("Consent reference")} hint={ui("Where the school's signed consent is kept.")}><Input value={consent} onChange={(e) => setConsent(e.target.value)} /></FormField>
          <FormField name="pilot-f14" label={ui("Case-study permission")}><Select value={permission} onChange={(e) => setPermission(e.target.value)}>{Object.entries(PERMISSION_LABEL).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
          <FormField name="pilot-f15" label={ui("Permission reference")}><Input value={permissionRef} onChange={(e) => setPermissionRef(e.target.value)} /></FormField>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => act("charter", { consentReference: consent || null, caseStudyPermission: permission, permissionReference: permissionRef || null }, "Charter updated.")}>{ui("Save consent and permission")}</Button>
          {pilot.status !== "ACTIVE" && pilot.status !== "CLOSED" ? <Button variant="outline" onClick={() => act("charter", { status: "ACTIVE" }, "Charter updated.")}>{ui("Start pilot")}</Button> : null}
          {pilot.status !== "CLOSED" ? <Button variant="outline" onClick={() => act("charter", { status: "CLOSED" }, "Pilot closed.")}>{ui("Close pilot")}</Button> : null}
        </div>
        {detail.activationGate && !detail.activationGate.allowed && pilot.status !== "CLOSED" ? (
          <Alert className="mt-4" tone="warning" live="off" title={ui("This pilot cannot become active yet")}>
            <ul className="list-disc space-y-1 ps-5 text-sm" data-testid="pilot-gate-blockers">
              {detail.activationGate.blockers.map((b, i) => <li key={`${b.item}-${i}`}><span className="font-semibold" dir="ltr">{b.item}</span>: {ui(b.reason)}</li>)}
            </ul>
          </Alert>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 font-bold text-ink">{ui("Task time: baseline vs follow-up")}</h3>
        <p className="mb-2 text-xs text-ink-muted">{ui("Task time = active time + review and correction time, paired by participant, task and difficulty. Elapsed time is shown separately.")}</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{ui("Workflow")}</TableHead><TableHead>{ui("Paired")}</TableHead><TableHead>{ui("Missing or excluded")}</TableHead>
              <TableHead>{ui("Median task minutes")}</TableHead><TableHead>{ui("Change")}</TableHead><TableHead>{ui("Median elapsed minutes")}</TableHead><TableHead>{ui("Latest")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{findings.time.map((f) => (
              <TableRow key={f.key}>
                <TableCell dir="ltr">{f.workflow}</TableCell>
                <TableCell>{ui("{0} of {1} baseline / {2} follow-up", [fmt(f.counts.paired), fmt(f.counts.baseline), fmt(f.counts.followUp)])}</TableCell>
                <TableCell className="min-w-[14rem] text-xs">{ui("Baseline only {0} · Follow-up only {1} · Incomplete {2} · No task time {3} · Difficulty changed {4} · Excluded {5}", [f.missing.baselineOnly, f.missing.followUpOnly, f.missing.incomplete, f.missing.noTaskTime, f.missing.difficultyChanged, f.excluded.length])}</TableCell>
                <TableCell><bdi dir="ltr">{minutes(f.medianTaskSeconds.baseline, fmt)} → {minutes(f.medianTaskSeconds.followUp, fmt)}</bdi></TableCell>
                <TableCell>{f.changePercent == null ? <span className="text-xs text-ink-muted">{ui(withheldCopy(f.percentWithheld), [f.counts.paired, 5])}</span> : <bdi dir="ltr">{f.changePercent > 0 ? "+" : ""}{fmt(f.changePercent)}%</bdi>}</TableCell>
                <TableCell><bdi dir="ltr">{minutes(f.medianElapsedSeconds.baseline, fmt)} → {minutes(f.medianElapsedSeconds.followUp, fmt)}</bdi></TableCell>
                <TableCell dir="ltr">{f.latestObservation ?? "—"}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-bold text-ink">{ui("Correctness samples")}</h3>
        <p className="mb-2 text-xs text-ink-muted">{ui("Extraction accuracy and final approved accuracy are separate measures and are never combined.")}</p>
        <MeasureTable rows={findings.correctness.flatMap((c) => [c.extraction, c.final])} />
      </div>
      <div>
        <h3 className="mb-2 font-bold text-ink">{ui("Adoption, support, cost and commercial evidence")}</h3>
        <MeasureTable rows={findings.other} />
      </div>

      <div>
        <h3 className="mb-2 font-bold text-ink">{ui("Observations")}</h3>
        <p className="mb-2 text-xs text-ink-muted">{ui("Participants are pseudonyms. Participant-level rows stay in this console and are never exported.")}</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{ui("Date")}</TableHead><TableHead>{ui("Workflow")}</TableHead><TableHead>{ui("Phase")}</TableHead><TableHead>{ui("Participant")}</TableHead><TableHead>{ui("Task")}</TableHead><TableHead>{ui("Active + correction minutes")}</TableHead><TableHead>{ui("Status")}</TableHead><TableHead><span className="sr-only">{ui("Actions")}</span></TableHead></TableRow></TableHeader>
            <TableBody>{observations.slice(0, 50).map((o) => (
              <TableRow key={o.id}>
                <TableCell dir="ltr">{o.observedOn.slice(0, 10)}</TableCell><TableCell dir="ltr">{o.workflow}</TableCell><TableCell>{ui(PHASE_LABEL[o.phase] ?? o.phase)}</TableCell>
                <TableCell><bdi>{o.participant}</bdi></TableCell><TableCell><bdi>{o.task}</bdi> <span className="text-xs text-ink-muted">(<bdi>{o.difficulty}</bdi>)</span></TableCell>
                <TableCell>{minutes(o.activeSeconds, fmt)} + {minutes(o.correctionSeconds, fmt)}</TableCell>
                <TableCell className="text-xs">{o.synthetic ? ui("Synthetic") : o.excludedReason ? <>{ui("Excluded")}: <bdi>{o.excludedReason}</bdi></> : o.completed ? ui("Included") : ui("Not completed")}</TableCell>
                <TableCell>{!o.excludedReason && !o.synthetic ? <Button size="sm" variant="ghost" onClick={() => setExcluding(o)} aria-label={ui("Exclude observation by {0}", [o.participant])}>{ui("Exclude")}</Button> : null}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      </div>

      <ClaimsPanel claims={claims} findingKeys={findingKeys} act={act} />
      {/* F16: the exclusion reason is asked in a confirmation, never a browser prompt. */}
      <ConfirmAction
        open={Boolean(excluding)}
        tone="warning"
        title={ui("Exclude this observation?")}
        description={ui("It stays on record with your reason but no longer counts in any finding, claim or export.")}
        confirmLabel={ui("Exclude")}
        cancelLabel={ui("Keep editing")}
        requireReason={{ label: ui("Why exclude this observation?"), minLength: 5 }}
        onCancel={() => setExcluding(null)}
        onConfirm={(reason?: string) => { const target = excluding; if (!target || !reason?.trim()) return; return act("exclude", { observationId: target.id, reason: reason.trim() }, "Observation excluded.").then(saved => { if (saved) setExcluding(null); }); }}
      />
    </section>
  );
}

function MeasureTable({ rows }: { rows: MeasureFinding[] }) {
  const ui = useUiText();
  const { number } = useLocaleFormat();
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>{ui("Measure")}</TableHead><TableHead>{ui("Records")}</TableHead><TableHead>{ui("Result")}</TableHead><TableHead>{ui("Method and reference")}</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((f) => (
          <TableRow key={f.key}>
            <TableCell>{ui(KIND_LABEL[f.kind] ?? f.kind)}{f.workflow ? <span className="text-xs text-ink-muted" dir="ltr"> · {f.workflow}</span> : null}</TableCell>
            <TableCell className="text-xs">
              {f.current.length === 0 ? ui("No records") : f.current.map((row) => (
                <span key={row.id} className="me-2 inline-flex items-center gap-1">
                  <Badge tone={row.state === "MEASURED" ? "good" : row.state === "UNKNOWN" ? "bad" : "warn"}>{ui(STATE_LABEL[row.state] ?? row.state)}</Badge>
                  <bdi dir="ltr">{row.value == null ? "?" : number(row.value)}{row.denominator != null ? ` / ${number(row.denominator)}` : ""} {row.unit}</bdi>
                </span>
              ))}
              {f.superseded ? <span className="block text-ink-muted">{ui("{0} corrected values superseded", [f.superseded])}</span> : null}
              {f.excludedSynthetic ? <span className="block text-ink-muted">{ui("{0} synthetic records excluded", [f.excludedSynthetic])}</span> : null}
            </TableCell>
            <TableCell>{f.rate == null ? <span className="text-xs text-ink-muted">{ui(f.rateWithheld ?? "No measured result yet")}</span> : <bdi dir="ltr">{number(f.rate)}%</bdi>}</TableCell>
            <TableCell className="text-xs"><bdi>{[...new Set(f.current.map((row) => row.method))].join("; ") || "—"}</bdi>{f.current.some((row) => row.reference) ? <span className="block text-ink-muted"><bdi>{f.current.map((row) => row.reference).filter(Boolean).join("; ")}</bdi></span> : null}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}

function ObservationForm({ pilot, onSubmit }: { pilot: Pilot; onSubmit: (data: Record<string, unknown>) => Promise<boolean> }) {
  const ui = useUiText();
  const blank = { workflow: pilot.workflows[0]?.key ?? "", phase: "BASELINE", participant: "", task: "", difficulty: "", active: "", correction: "", elapsed: "", completed: true, failureNote: "", source: "OBSERVED", observedOn: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string | boolean) => setF((cur) => ({ ...cur, [key]: value }));
  const secs = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 60));
  return (
    <form className="grid gap-3 sm:grid-cols-2" aria-label={ui("Record observation")} onSubmit={async (e) => {
      e.preventDefault(); if (busy) return; setBusy(true);
      const ok = await onSubmit({ workflow: f.workflow, phase: f.phase, participant: f.participant, task: f.task, difficulty: f.difficulty, activeSeconds: secs(f.active), correctionSeconds: secs(f.correction), elapsedSeconds: secs(f.elapsed),
        completed: f.completed, failureNote: f.failureNote || null, source: f.source, synthetic: pilot.synthetic, observedOn: f.observedOn });
      if (ok) setF({ ...blank, workflow: f.workflow, phase: f.phase, observedOn: f.observedOn });
      setBusy(false);
    }}>
      <FormField name="pilot-f16" label={ui("Workflow")} required><Select value={f.workflow} onChange={(e) => set("workflow", e.target.value)}>{pilot.workflows.map((w) => <option key={w.key} value={w.key}>{w.key}</option>)}</Select></FormField>
      <FormField name="pilot-f17" label={ui("Phase")} required><Select value={f.phase} onChange={(e) => set("phase", e.target.value)}>{Object.entries(PHASE_LABEL).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
      <FormField name="pilot-f18" label={ui("Participant pseudonym")} hint={ui("For example T-03. Never a name, email or phone.")} required><Input dir="ltr" value={f.participant} onChange={(e) => set("participant", e.target.value)} /></FormField>
      <FormField name="pilot-f19" label={ui("Observed on")} required><Input type="date" value={f.observedOn} onChange={(e) => set("observedOn", e.target.value)} /></FormField>
      <FormField name="pilot-f20" label={ui("Task")} required><Input value={f.task} onChange={(e) => set("task", e.target.value)} /></FormField>
      <FormField name="pilot-f21" label={ui("Difficulty")} required><Input value={f.difficulty} onChange={(e) => set("difficulty", e.target.value)} /></FormField>
      <FormField name="pilot-f22" label={ui("Active minutes")}><Input inputMode="decimal" dir="ltr" value={f.active} onChange={(e) => set("active", e.target.value)} /></FormField>
      <FormField name="pilot-f23" label={ui("Review and correction minutes")}><Input inputMode="decimal" dir="ltr" value={f.correction} onChange={(e) => set("correction", e.target.value)} /></FormField>
      <FormField name="pilot-f24" label={ui("Elapsed minutes")}><Input inputMode="decimal" dir="ltr" value={f.elapsed} onChange={(e) => set("elapsed", e.target.value)} /></FormField>
      <FormField name="pilot-f25" label={ui("Source")} required><Select value={f.source} onChange={(e) => set("source", e.target.value)}><option value="OBSERVED">{ui("Observed")}</option><option value="TELEMETRY">{ui("Telemetry")}</option><option value="SELF_REPORTED">{ui("Self-reported")}</option></Select></FormField>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.completed} onChange={(e) => set("completed", e.target.checked)} /> {ui("Task completed")}</label>
      {!f.completed ? <FormField name="pilot-f26" label={ui("What happened")} required><Input value={f.failureNote} onChange={(e) => set("failureNote", e.target.value)} /></FormField> : null}
      <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={busy} disabled={busy} className="w-full sm:w-auto">{ui("Record observation")}</Button></div>
    </form>
  );
}

function MeasureForm({ pilot, onSubmit }: { pilot: Pilot; onSubmit: (data: Record<string, unknown>) => Promise<boolean> }) {
  const ui = useUiText();
  const blank = { kind: "CORRECTNESS_EXTRACTION", workflow: pilot.workflows[0]?.key ?? "", periodStart: "", periodEnd: "", value: "", denominator: "", unit: "", state: "MEASURED", method: "", reference: "", includesFailedCalls: false };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string | boolean) => setF((cur) => ({ ...cur, [key]: value }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <form className="grid gap-3 sm:grid-cols-2" aria-label={ui("Record measure")} onSubmit={async (e) => {
      e.preventDefault(); if (busy) return; setBusy(true);
      const ok = await onSubmit({ kind: f.kind, workflow: f.kind.startsWith("CORRECTNESS") ? f.workflow : null, periodStart: f.periodStart, periodEnd: f.periodEnd, value: f.state === "UNKNOWN" ? null : num(f.value), denominator: num(f.denominator),
        unit: f.unit, state: f.state, method: f.method, reference: f.reference || null, includesFailedCalls: f.includesFailedCalls, synthetic: pilot.synthetic });
      if (ok) setF({ ...blank, kind: f.kind, periodStart: f.periodStart, periodEnd: f.periodEnd });
      setBusy(false);
    }}>
      <FormField name="pilot-f27" label={ui("Measure")} required><Select value={f.kind} onChange={(e) => set("kind", e.target.value)}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
      {f.kind.startsWith("CORRECTNESS") ? <FormField name="pilot-f28" label={ui("Workflow")} required><Select value={f.workflow} onChange={(e) => set("workflow", e.target.value)}>{pilot.workflows.map((w) => <option key={w.key} value={w.key}>{w.key}</option>)}</Select></FormField> : <div />}
      <FormField name="pilot-f29" label={ui("Period start")} required><Input type="date" value={f.periodStart} onChange={(e) => set("periodStart", e.target.value)} /></FormField>
      <FormField name="pilot-f30" label={ui("Period end")} required><Input type="date" value={f.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} /></FormField>
      <FormField name="pilot-f31" label={ui("Evidence state")} required><Select value={f.state} onChange={(e) => set("state", e.target.value)}>{Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
      <FormField name="pilot-f32" label={ui("Unit")} required><Input value={f.unit} onChange={(e) => set("unit", e.target.value)} /></FormField>
      <FormField name="pilot-f33" label={ui("Value")} required={f.state !== "UNKNOWN"}><Input type="number" min={0} step="any" inputMode="decimal" dir="ltr" disabled={f.state === "UNKNOWN"} value={f.value} onChange={(e) => set("value", e.target.value)} /></FormField>
      <FormField name="pilot-f34" label={ui("Denominator")} required={f.kind.startsWith("CORRECTNESS")} hint={ui("Sample size, eligible users or respondents.")}><Input type="number" min={0} step="any" inputMode="decimal" dir="ltr" value={f.denominator} onChange={(e) => set("denominator", e.target.value)} /></FormField>
      <FormField name="pilot-f35" label={ui("Method")} required><Textarea value={f.method} onChange={(e) => set("method", e.target.value)} /></FormField>
      <FormField name="pilot-f36" label={ui("Reference")} required={f.kind.startsWith("CORRECTNESS")} hint={ui("Human-reviewed reference, invoice or source record.")}><Input value={f.reference} onChange={(e) => set("reference", e.target.value)} /></FormField>
      {f.kind === "SERVING_COST" ? <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={f.includesFailedCalls} onChange={(e) => set("includesFailedCalls", e.target.checked)} /> {ui("Includes failed, retried and abandoned provider calls")}</label> : null}
      <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={busy} disabled={busy} className="w-full sm:w-auto">{ui("Record measure")}</Button></div>
    </form>
  );
}

function ClaimsPanel({ claims, findingKeys, act }: { claims: Claim[]; findingKeys: string[]; act: (action: string, data: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const ui = useUiText();
  const [statement, setStatement] = useState("");
  const [findingKey, setFindingKey] = useState(findingKeys[0] ?? "");
  const [identifiable, setIdentifiable] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <div className="space-y-3">
      <h3 className="font-bold text-ink">{ui("External claims")}</h3>
      <p className="text-xs text-ink-muted">{ui("A target is not a result. A claim is approved against the exact evidence it cites; if that evidence changes, the claim becomes stale and is blocked from export.")}</p>
      <form className="grid gap-3 rounded-2xl border border-border p-4 md:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault();
        if (await act("claim", { statement, findingKey, identifiable }, "Claim proposed for review.")) { setStatement(""); setIdentifiable(false); }
      }}>
        <FormField name="pilot-f37" label={ui("Proposed statement")} required className="md:col-span-2"><Textarea value={statement} onChange={(e) => setStatement(e.target.value)} /></FormField>
        <FormField name="pilot-f38" label={ui("Evidence it rests on")} required><Select value={findingKey} onChange={(e) => setFindingKey(e.target.value)}>{findingKeys.map((k) => <option key={k} value={k}>{k}</option>)}</Select></FormField>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={identifiable} onChange={(e) => setIdentifiable(e.target.checked)} /> {ui("Identifies the school")}</label>
        <div className="md:col-span-2"><Button type="submit">{ui("Propose claim")}</Button></div>
      </form>
      <ul className="space-y-3">{claims.map((claim) => (
        <li key={claim.id} className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={claim.status === "APPROVED" && !claim.stale ? "good" : claim.status === "STALE" || claim.stale ? "bad" : "neutral"}>{ui(claim.stale ? "Stale" : STATUS_LABEL[claim.status] ?? claim.status)}</Badge>
            <span className="text-xs text-ink-muted" dir="ltr">{claim.findingKey} · v{claim.version}</span>
            {claim.identifiable ? <Badge tone="warn">{ui("Identifies the school")}</Badge> : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink"><bdi>{claim.statement}</bdi></p>
          {!claim.support.supported ? <p className="mt-1 text-xs text-status-error-text">{ui("Not supported")}: {ui(claim.support.reason ?? "")}</p> : null}
          {claim.exportBlockedBy ? <p className="mt-1 text-xs text-status-error-text">{ui("Blocked from export")}: {ui(claim.exportBlockedBy)}</p> : null}
          {claim.reviewNote ? <p className="mt-1 text-xs text-ink-muted">{ui("Review note")}: <bdi>{claim.reviewNote}</bdi></p> : null}
          {claim.status !== "WITHDRAWN" ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <FormField name="pilot-f39" label={ui("Review note")} className="min-w-[16rem] flex-1"><Input value={notes[claim.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [claim.id]: e.target.value }))} /></FormField>
              <Button size="sm" onClick={() => act("review", { claimId: claim.id, version: claim.version, decision: "APPROVE", note: notes[claim.id] ?? "" }, "Claim approved against the current evidence.")}>{ui("Approve supported wording")}</Button>
              <Button size="sm" variant="outline" onClick={() => act("review", { claimId: claim.id, version: claim.version, decision: "RETURN", note: notes[claim.id] ?? "" }, "Claim returned for revision.")}>{ui("Return for revision")}</Button>
            </div>
          ) : null}
        </li>
      ))}</ul>
    </div>
  );
}

function ExportView({ exported, onClose }: { exported: Exported; onClose: () => void }) {
  const ui = useUiText();
  return (
    <div className="mb-6 rounded-2xl border border-border p-4" role="region" aria-label={ui("Export of approved claims")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-ink">{ui("Export of approved claims")}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>{ui("Close")}</Button>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{ui("{0} statements exported · {1} excluded", [exported.statements.length, exported.excluded.length])}</p>
      <ul className="mt-3 space-y-2 text-sm">{exported.statements.map((s) => (
        <li key={s.claimId} className="rounded-xl bg-surface-muted p-3">
          <p className="font-semibold"><bdi>{s.statement}</bdi></p>
          <p className="text-xs text-ink-muted" dir="ltr"><bdi>{s.school ?? Object.values(s.cohort).join(" · ")}</bdi></p>
          <ul className="mt-1 list-disc ps-5 text-xs">{s.limitations.map((l) => <li key={l}><bdi>{l}</bdi></li>)}</ul>
        </li>
      ))}</ul>
      {exported.excluded.length ? <ul className="mt-3 space-y-1 text-xs text-status-error-text">{exported.excluded.map((x) => <li key={x.claimId}><bdi>{x.pilot}</bdi>: {ui(x.reason)}</li>)}</ul> : null}
    </div>
  );
}
