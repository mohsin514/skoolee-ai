"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkedJson, readRequest, requestFailure, RequestFailure } from "@/lib/http/request-state";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCards } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Download, Gauge, Hourglass, RefreshCw, SlidersHorizontal, XCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DeskPill, DeskRowIcon, DeskStats, StatTile, deskRow } from "@/components/ui/desk";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { Alert } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { PAGE_CARD_BODY } from "@/components/role-dashboard/RoleShellSkeleton";

// SKO-451: release performance report and resource-policy review in the owner console. Measured values are kept
// apart from estimates, missing or stale telemetry is said plainly, and a policy change asks for a follow-up run.

type Ui = ReturnType<typeof useUiText>;
type Summary = { serviceClass: string; count: number; p50: number | null; p95: number | null; p99: number | null; maxMs: number | null; errors: number; rejected: number; timeouts: number; errorRate: number | null; concurrency?: number };
type Objective = { key: string; label: string; target: number; observed: number | null; pass: boolean | null };
type Run = { id: string; runId: string; profile: string; environment: string; release: string; dataset: Record<string, unknown>; concurrency: Record<string, unknown>; results: { workloads: Record<string, Summary>; baseline?: Record<string, Summary> | null; backgroundPeaks: { schoolId: string; peak: number; limit: number }[] }; objectives: Objective[]; passed: boolean; notes: string | null; startedAt: string; finishedAt: string };
type Policy = { id: string; targetSchoolId: string | null; schoolName: string | null; scope: string; limitValue: number; reason: string; expiresAt: string | null; createdAt: string; revokedAt?: string | null; revokeReason?: string | null };
type Report = {
  requests: { scope: string; startedAt: string; measuredAt: string; latestSampleAt: string | null; windowSeconds: number; state: "MEASURED" | "STALE" | "NO_MEASUREMENT"; classes: (Summary & { serviceClass: string })[]; schools: (Summary & { schoolId: string; inflight: number; peakBackground: { peak: number; limit: number } | null })[] };
  database: { available: true; measuredAt: string; probeMs: number; connections: number; active: number; idleInTransaction: number; waitingOnLocks: number; maxConnections: number } | { available: false; measuredAt: string; reason: string };
  queue: { available: boolean; measuredAt: string; reason?: string; schools: { schoolId: string; name: string | null; pending: number; running: number; failed24h: number; oldestPendingSeconds: number; estimate: { kind: string; drainMinutes: number | null; basis: string } | null }[] };
  policy: { defaults: Record<string, number>; platform: Record<string, { limit: number; source: string }>; active: Policy[]; history: Policy[] };
  runs: Run[]; followUpRequired: boolean; schools: { id: string; name: string }[];
};

async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}
const ms = (n: number | null) => n === null ? "—" : `${n} ms`;
const scopeLabel = (ui: Ui, s: string) => s === "BACKGROUND_REQUESTS" ? ui("Background requests at once (per instance)") : ui("Background jobs in flight (platform)");
const result = (ui: Ui, pass: boolean | null) => pass === null ? ui("Not measured") : pass ? ui("Pass") : ui("Fail");
const objectiveLabel = (ui: Ui, label: string) => ui(label);

function RunDetail({ run }: { run: Run }) {
  const ui = useUiText();
  const [evidence, setEvidence] = useState(false);
  return <div className="space-y-3" data-run-detail={run.runId}>
    <Table><TableHeader><TableRow><TableHead>{ui("Objective")}</TableHead><TableHead>{ui("Target")}</TableHead><TableHead>{ui("Observed")}</TableHead><TableHead>{ui("Result")}</TableHead></TableRow></TableHeader>
      <TableBody>{run.objectives.map(o => <TableRow key={o.key} data-objective={o.key} data-pass={String(o.pass)}><TableCell>{objectiveLabel(ui, o.label)}</TableCell><TableCell><bdi dir="ltr">{o.target}</bdi></TableCell><TableCell><bdi dir="ltr">{o.observed ?? "—"}</bdi></TableCell><TableCell className={cn("font-semibold", o.pass === false ? "text-status-error-text" : o.pass ? "text-status-success-text" : "text-status-warning-text")}>{result(ui, o.pass)}</TableCell></TableRow>)}</TableBody></Table>
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{ui("Workload")}</TableHead><TableHead>{ui("Class")}</TableHead><TableHead>{ui("Requests")}</TableHead><TableHead>p50</TableHead><TableHead>p95</TableHead><TableHead>{ui("Quiet baseline p95")}</TableHead><TableHead>p99</TableHead><TableHead>{ui("Errors")}</TableHead><TableHead>{ui("Refused (429)")}</TableHead><TableHead>{ui("Timeouts")}</TableHead></TableRow></TableHeader>
      <TableBody>{Object.entries(run.results.workloads).map(([name, w]) => <TableRow key={name} data-workload={name}><TableCell><bdi dir="ltr">{name}</bdi></TableCell><TableCell>{w.serviceClass}</TableCell><TableCell><bdi dir="ltr">{w.count}</bdi></TableCell><TableCell><bdi dir="ltr">{ms(w.p50)}</bdi></TableCell><TableCell><bdi dir="ltr">{ms(w.p95)}</bdi></TableCell><TableCell><bdi dir="ltr">{ms(run.results.baseline?.[name]?.p95 ?? null)}</bdi></TableCell><TableCell><bdi dir="ltr">{ms(w.p99)}</bdi></TableCell><TableCell><bdi dir="ltr">{w.errors}</bdi></TableCell><TableCell><bdi dir="ltr">{w.rejected}</bdi></TableCell><TableCell><bdi dir="ltr">{w.timeouts}</bdi></TableCell></TableRow>)}</TableBody></Table></div>
    {run.results.backgroundPeaks.length ? <p className="text-xs text-ink-muted">{ui("Background requests in flight per school (server-measured peak / limit)")}: {run.results.backgroundPeaks.map(p => <bdi key={p.schoolId} dir="ltr" className="me-2">{p.schoolId.slice(0, 18)} {p.peak}/{p.limit}</bdi>)}</p> : null}
    <Button size="sm" variant="ghost" onClick={() => setEvidence(!evidence)} aria-expanded={evidence} data-run-evidence>{ui("Open benchmark evidence")}</Button>
    {evidence ? <pre dir="ltr" className="max-w-full max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-muted p-3 text-xs">{JSON.stringify({ environment: run.environment, release: run.release, dataset: run.dataset, concurrency: run.concurrency, startedAt: run.startedAt, finishedAt: run.finishedAt }, null, 2)}</pre> : null}
  </div>;
}

/** The policy-change review dialog; its actions sit in the pinned footer. */
function PolicyForm({ data, onDone }: { data: Report; onDone: () => void }) {
  const ui = useUiText();
  const [f, setF] = useState({ targetSchoolId: "", scope: "BACKGROUND_REQUESTS", limitValue: "2", reason: "", expiresAt: "" });
  const [busy, setBusy] = useState(false), [done, setDone] = useState<{ before: { limit: number }; after: { limit: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const limit = Number(f.limitValue);
  const limitError = f.limitValue.trim() === "" || !Number.isInteger(limit) || limit < 0 || limit > 1000;
  const expiryError = Boolean(f.targetSchoolId && !f.expiresAt) || Boolean(f.expiresAt && (!Number.isFinite(new Date(f.expiresAt).getTime()) || new Date(f.expiresAt).getTime() <= openedAt));
  const apply = async () => {
    setBusy(true); setError(null);
    try { setDone(await call("/api/owner/capacity", "POST", { action: "apply", targetSchoolId: f.targetSchoolId || null, scope: f.scope, limitValue: Number(f.limitValue), reason: f.reason, expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null })); }
    catch (e) { setError(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); }
  };
  if (done) return <Modal title={ui("Resource policy change review")} icon={CheckCircle2} tone="emerald" size="md" onClose={onDone}
    footer={<div className="flex justify-end"><Button onClick={onDone} data-policy-close>{ui("Done")}</Button></div>}>
    <div className="space-y-3" data-policy-result><Alert tone="success" live="polite" title={ui("Scoped policy applied. A follow-up measurement is required.")}>{ui("Limit {0} → {1}", [String(done.before.limit), String(done.after.limit)])}</Alert></div>
  </Modal>;
  return <Modal title={ui("Resource policy change review")} icon={SlidersHorizontal} tone="amber" size="md" subtitle={ui("Background exports are limited; interactive school work remains prioritized.")} onClose={onDone} dismissible={!busy}
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" disabled={busy} onClick={onDone} data-policy-keep>{ui("Keep current policy")}</Button>
      <Button loading={busy} disabled={busy || limitError || expiryError || f.reason.trim().length < 10} data-policy-save onClick={() => void apply()}>{ui("Apply scoped policy")}</Button>
    </div>}>
  <div className="space-y-3" data-policy-form>
    {error ? <Alert tone="danger" compact>{error}</Alert> : null}
    <fieldset disabled={busy} className="space-y-3">
    <FormField name="cp-school" label={ui("Scope")}><Select value={f.targetSchoolId} onChange={e => setF({ ...f, targetSchoolId: e.target.value })} data-policy-school><option value="">{ui("Platform default (all schools)")}</option>{data.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField>
    <div className="grid gap-2 sm:grid-cols-2">
      <FormField name="cp-scope" label={ui("Work it limits")}><Select value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })} data-policy-scope><option value="BACKGROUND_REQUESTS">{scopeLabel(ui, "BACKGROUND_REQUESTS")}</option><option value="BACKGROUND_JOBS">{scopeLabel(ui, "BACKGROUND_JOBS")}</option></Select></FormField>
      <FormField name="cp-limit" label={ui("Limit")} error={limitError ? ui("Enter a whole number from 0 to 1000.") : undefined}><Input type="number" min={0} max={1000} step={1} value={f.limitValue} onChange={e => setF({ ...f, limitValue: e.target.value })} dir="ltr" data-policy-limit /></FormField>
    </div>
    <FormField name="cp-reason" label={ui("Reason")}><Textarea value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} rows={2} dir="auto" data-policy-reason /></FormField>
    <FormField name="cp-exp" label={ui("Expiry")} required={Boolean(f.targetSchoolId)} error={expiryError ? ui("Choose a future expiry for this change.") : undefined} hint={ui("Required for a school-scoped change, such as the end of the incident.")}><Input type="datetime-local" value={f.expiresAt} onChange={e => setF({ ...f, expiresAt: e.target.value })} data-policy-expires /></FormField>
    </fieldset>
    <Alert tone="info" compact live="off">{ui("Exam answer saves and payment confirmation are never limited by these settings.")}</Alert>
  </div></Modal>;
}

export function CapacityReport() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<Report | null>(null), [error, setError] = useState<RequestFailure | null>(null);
  const sequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null), [failingOnly, setFailingOnly] = useState(false), [changing, setChanging] = useState(false), [reverting, setReverting] = useState<Policy | null>(null), [revertBusy, setRevertBusy] = useState(false);
  const load = useCallback(async () => {
    const version = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const json = await checkedJson(await readRequest("/api/owner/capacity"));
      if (version !== sequence.current) return;
      if (!Array.isArray(json.data?.runs) || !Array.isArray(json.data?.requests?.classes) || !Array.isArray(json.data?.policy?.active)) throw new RequestFailure("server");
      setData(json.data);
    } catch (failure) { if (version === sequence.current) { setData(null); setError(requestFailure(failure)); } }
    finally { if (version === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  // §4.4b: a monitoring screen — no primary action; Export and Refresh are its secondaries.
  const exportReport = () => {
    if (!data || loading || error) return;
    const cell = (value: unknown) => { const raw = value == null ? "" : String(value); const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe; };
    const rows = [["section", "name", "detail", "passed_or_state", "measured_at"],
      ...data.runs.map(r => ["release run", r.runId, `${r.profile} · ${r.release} · ${r.environment}`, r.passed ? "passed" : "failed", r.finishedAt]),
      ...data.requests.classes.map(c => ["live class", c.serviceClass, `requests ${c.count} · p95 ${c.p95 ?? ""} · p99 ${c.p99 ?? ""} · errors ${c.errors} · refused ${c.rejected}`, data.requests.state, data.requests.measuredAt]),
      ...data.policy.active.map(p => ["policy", p.schoolName ?? "platform default", `${p.scope} ${p.limitValue} · ${p.reason}`, "active", p.createdAt])];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `capacity-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const header = <PageHeader eyebrow="Platform operations" title="Capacity" icon={Gauge}
    description="Capacity and tenant fairness: synthetic benchmarks and live measurements. Values here are not capacity claims."
    secondaryActions={[{ id: "export", label: "Export", icon: Download, onClick: exportReport, disabled: !data || loading || !!error }, { id: "refresh", label: "Refresh", icon: RefreshCw, onClick: () => void load() }]} />;
  // The scrolling body of the shell's one page card (addendum 2026-10-22).
  const body = cn("custom-scrollbar min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto", PAGE_CARD_BODY);
  if (error) return <div className={body} data-capacity-error>{header}<div className="sk-panel"><ErrorState title={ui("Telemetry is unavailable; do not infer healthy service.")} error={error} onRetry={() => load()} /></div></div>;
  if (loading || !data) return <div className={body}>{header}<SkeletonCards count={3} label={ui("Loading measured telemetry…")} /></div>;
  // §8.1 R3: reverting a policy is confirmed with a typed reason (it changes what every school may run).
  const revert = async (reason?: string) => {
    if (!reverting || !reason) return;
    setRevertBusy(true);
    try {
      await call("/api/owner/capacity", "POST", { action: "revert", id: reverting.id, reason });
      toast.success(ui("Change reverted; the previous limit applies again. A follow-up measurement is required."));
      setReverting(null);
      await load();
    } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); }
    finally { setRevertBusy(false); }
  };
  const runs = failingOnly ? data.runs.filter(r => !r.passed) : data.runs;
  const req = data.requests;
  const stateText = req.state === "MEASURED" ? ui("Measured") : req.state === "STALE" ? ui("Stale: no request in the last minute") : ui("No measurement yet");
  const failing = data.runs.filter(r => !r.passed);
  const pending = data.queue.schools.reduce((sum, s) => sum + s.pending, 0), failed24h = data.queue.schools.reduce((sum, s) => sum + s.failed24h, 0);
  const toggleFailing = () => { setFailingOnly(!failingOnly); const f = failing[0]; if (!failingOnly && f) setOpen(f.id); };
  return <div className={body} data-capacity>
    {header}
    {data.followUpRequired ? <Alert tone="warning" compact data-follow-up>{ui("Scoped policy applied. A follow-up measurement is required.")}</Alert> : null}
    <DeskStats data-capacity-stats>
      <StatTile index={0} icon={XCircle} tone={failing.length ? "danger" : "success"} label={ui("Objectives not met")} value={failing.length} hint={ui("Release performance report")} selected={failingOnly} onSelect={toggleFailing} />
      <StatTile index={1} icon={Hourglass} tone={pending ? "warning" : "neutral"} label={ui("Pending")} value={data.queue.available ? pending : "—"} hint={ui("Durable queue by school")} />
      <StatTile index={2} icon={AlertTriangle} tone={failed24h ? "danger" : "neutral"} label={ui("Failed (24 h)")} value={data.queue.available ? failed24h : "—"} />
      <StatTile index={3} icon={SlidersHorizontal} tone={data.policy.active.length ? "warning" : "neutral"} label={ui("Resource policy")} value={data.policy.active.length} hint={data.policy.active.length ? undefined : ui("No scoped changes are in force.")} />
    </DeskStats>

    <section className="sk-panel space-y-3 p-4" data-runs>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">{ui("Release performance report")}</h2>
        <Button size="sm" variant={failingOnly ? "default" : "outline"} aria-pressed={failingOnly} onClick={toggleFailing} data-review-failing>{ui("Review failing workload")}</Button></div>
      {!data.runs.length ? <div data-runs-empty><EmptyState size="sm" icon={Gauge} title={ui("Not measured")} description={ui("No representative benchmark has been recorded for this workload. No capacity claim is available until this workload is measured.")} /></div> : !runs.length ? <div role="status"><EmptyState size="sm" icon={CheckCircle2} title={ui("No failing workloads in the recorded runs.")} /></div> : <ul className="space-y-2">{runs.map(r => <li key={r.id} className={deskRow} data-tone={r.passed ? "success" : "danger"} data-run={r.runId} data-run-passed={String(r.passed)}>
        <Button variant="ghost" type="button" className="flex h-auto w-full flex-wrap items-center justify-between gap-2 px-0 text-start actionable-hover:bg-transparent" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} data-run-toggle={r.runId}>
          <span className="flex min-w-0 items-center gap-3"><DeskRowIcon icon={r.passed ? CheckCircle2 : XCircle} /><span className="min-w-0 font-semibold"><bdi dir="ltr" className="break-all">{r.runId}</bdi> · <bdi>{r.profile}</bdi></span></span>
          <DeskPill tone={r.passed ? "success" : "danger"}>{r.passed ? ui("All objectives met") : ui("Objectives not met")}</DeskPill>
        </Button>
        <p className="mt-1 min-w-0 text-xs text-ink-muted">{ui("Release")} <bdi dir="ltr" className="break-all">{r.release}</bdi> · <bdi dir="ltr" className="break-all">{r.environment}</bdi> · {dateTime(r.finishedAt)}</p>
        {open === r.id ? <div className="mt-3"><RunDetail run={r} /></div> : null}
      </li>)}</ul>}
    </section>

    <section className="sk-panel space-y-3 p-4" data-live>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">{ui("Live measurements")}</h2><Badge variant={req.state === "MEASURED" ? "success" : req.state === "STALE" ? "warning" : "neutral"} dot data-telemetry-state={req.state}>{stateText}</Badge></div>
      <p className="text-xs text-ink-muted">{ui(req.scope)} · {ui("Last {0} minutes", [String(req.windowSeconds / 60)])} · {ui("Measured at {0}", [dateTime(req.measuredAt)])}</p>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{ui("Class")}</TableHead><TableHead>{ui("Requests")}</TableHead><TableHead>p95</TableHead><TableHead>p99</TableHead><TableHead>{ui("Errors")}</TableHead><TableHead>{ui("Refused (429)")}</TableHead></TableRow></TableHeader>
        <TableBody>{req.classes.map(c => <TableRow key={c.serviceClass} data-live-class={c.serviceClass}><TableCell>{c.serviceClass}</TableCell><TableCell><bdi dir="ltr">{c.count}</bdi></TableCell><TableCell><bdi dir="ltr">{ms(c.p95)}</bdi></TableCell><TableCell><bdi dir="ltr">{ms(c.p99)}</bdi></TableCell><TableCell><bdi dir="ltr">{c.errors}</bdi></TableCell><TableCell><bdi dir="ltr">{c.rejected}</bdi></TableCell></TableRow>)}</TableBody></Table></div>
      <div data-database>{data.database.available ? <p className="text-sm">{ui("Database: {0} of {1} connections, {2} active, {3} waiting on locks, probe {4} ms", [String(data.database.connections), String(data.database.maxConnections), String(data.database.active), String(data.database.waitingOnLocks), String(data.database.probeMs)])}</p> : <Alert tone="danger" compact live="off" data-database-unavailable>{ui(data.database.reason)}</Alert>}</div>
      <h3 className="text-sm font-bold">{ui("Durable queue by school")}</h3>
      {!data.queue.available ? <Alert tone="danger" compact live="off">{ui(data.queue.reason ?? "Telemetry is unavailable; do not infer healthy service.")}</Alert> : !data.queue.schools.length ? <EmptyState size="sm" icon={Hourglass} title={ui("No queued or recent durable work.")} /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{ui("School")}</TableHead><TableHead>{ui("Pending")}</TableHead><TableHead>{ui("Running")}</TableHead><TableHead>{ui("Oldest waiting")}</TableHead><TableHead>{ui("Failed (24 h)")}</TableHead><TableHead>{ui("Estimate")}</TableHead></TableRow></TableHeader>
        <TableBody>{data.queue.schools.map(s => <TableRow key={s.schoolId} data-queue-school={s.schoolId} className={s.failed24h ? "bg-status-error-surface/60" : undefined}><TableCell><bdi>{s.name ?? s.schoolId}</bdi></TableCell><TableCell><bdi dir="ltr">{s.pending}</bdi></TableCell><TableCell><bdi dir="ltr">{s.running}</bdi></TableCell><TableCell><bdi dir="ltr">{s.oldestPendingSeconds} s</bdi></TableCell><TableCell><bdi dir="ltr">{s.failed24h}</bdi></TableCell><TableCell className="text-xs italic">{s.estimate ? (s.estimate.drainMinutes === null ? ui("Estimate unavailable: {0}", [ui(s.estimate.basis)]) : ui("Estimate: about {0} min to drain, from {1}", [String(s.estimate.drainMinutes), ui(s.estimate.basis)])) : "—"}</TableCell></TableRow>)}</TableBody></Table></div>}
    </section>

    <section className="sk-panel space-y-3 p-4" data-policy>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">{ui("Resource policy")}</h2><Button size="sm" variant="outline" onClick={() => setChanging(true)} data-policy-open>{ui("Change policy")}</Button></div>
      <p className="text-sm">{ui("Platform default")}: {scopeLabel(ui, "BACKGROUND_REQUESTS")} <bdi dir="ltr">{data.policy.platform.BACKGROUND_REQUESTS.limit}</bdi> · {scopeLabel(ui, "BACKGROUND_JOBS")} <bdi dir="ltr">{data.policy.platform.BACKGROUND_JOBS.limit}</bdi></p>
      <p className="text-xs text-ink-muted">{ui("Background exports are limited; interactive school work remains prioritized.")}</p>
      {data.policy.active.length ? <ul className="space-y-2">{data.policy.active.map(p => <li key={p.id} data-tone="warning" className={cn(deskRow, "flex flex-wrap items-center justify-between gap-2 text-sm")} data-active-policy={p.id}>
        <span className="min-w-0 flex-1"><bdi>{p.schoolName ?? ui("Platform default")}</bdi> · {scopeLabel(ui, p.scope)} <bdi dir="ltr">{p.limitValue}</bdi> · <bdi>{p.reason}</bdi>{p.expiresAt ? <> <DeskPill tone="warning" className="ms-1">{ui("Until {0}", [dateTime(p.expiresAt)])}</DeskPill></> : null}</span>
        <Button size="sm" variant="ghost" onClick={() => setReverting(p)} data-policy-revert={p.id}>{ui("Revert")}</Button></li>)}</ul> : <EmptyState size="sm" icon={SlidersHorizontal} title={ui("No scoped changes are in force.")} />}
      {data.policy.history.length ? <details className="text-sm" data-policy-history><summary className="cursor-pointer font-semibold">{ui("Policy history")}</summary><ul className="mt-2 space-y-1">{data.policy.history.map(h => <li key={h.id}><bdi>{dateTime(h.createdAt)}</bdi> · <bdi>{h.schoolName ?? ui("Platform default")}</bdi> · <bdi dir="ltr">{h.scope} {h.limitValue}</bdi>{h.revokedAt ? <> · {ui("Reverted")} <bdi>{h.revokeReason}</bdi></> : null}</li>)}</ul></details> : null}
    </section>

    {changing ? <PolicyForm data={data} onDone={async () => { setChanging(false); await load(); }} /> : null}
    <ConfirmAction
      open={Boolean(reverting)}
      tone="warning"
      title={ui("Revert this policy change?")}
      description={ui("The previous limit applies again straight away. A follow-up measurement is required.")}
      detail={reverting ? <p className="text-sm"><bdi>{reverting.schoolName ?? ui("Platform default")}</bdi> · {scopeLabel(ui, reverting.scope)} <bdi dir="ltr">{reverting.limitValue}</bdi></p> : null}
      confirmLabel={ui("Revert")}
      cancelLabel={ui("Keep editing")}
      requireReason={{ label: ui("Why revert this change?"), minLength: 5 }}
      busy={revertBusy}
      onCancel={() => setReverting(null)}
      onConfirm={(reason?: string) => revert(reason)}
    />
  </div>;
}
