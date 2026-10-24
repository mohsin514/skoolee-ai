"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ClipboardList, ArrowLeft, ArrowRight, AlertCircle, SearchX } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { LocaleProvider, useLocale } from "@/components/locale/LocaleProvider";
import { useJobActivity, type JobDetail } from "@/components/jobs/use-job-activity";
import { jobMessages } from "@/lib/jobs/messages";
import { outcomes } from "@/lib/jobs/contract";
import { workflowCancelReasons, workflowRetryReasons, type WorkflowOperationReason } from "@/lib/queue/operation-contract";

type Review = { action: "retry" | "cancel" | "reconcile"; items: JobDetail["items"]; source: string };
const cardClass = "sk-panel p-4 sm:p-5";
const fieldLabel = "flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink-strong";
/** Tone for each persisted item state; the words always come from the job copy. */
const stateTone: Record<string, "neutral" | "info" | "success" | "danger"> = { queued: "neutral", running: "info", retrying: "info", completed: "success", failed: "danger", cancelled: "neutral" };

/** Placeholder job cards while the first status read is in flight; the status text beside it announces the wait. */
function JobCardsSkeleton() {
  return <div aria-hidden="true" className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map(index => <div key={index} className="sk-panel space-y-3 p-5"><Skeleton delay={index * 60} className="h-5 w-2/3 rounded-full" /><Skeleton delay={index * 60} className="h-3.5 w-1/2 rounded-full" /><Skeleton delay={index * 60} className="h-3.5 w-3/4 rounded-full" /><Skeleton delay={index * 60} className="h-3 w-1/3 rounded-full" /></div>)}</div>;
}

export default function JobsPage() {
  return <LocaleProvider><Suspense fallback={<InitialLoading />}><JobsRoute /></Suspense></LocaleProvider>;
}
/** The one header of /jobs (R1). Title and description come from the jobs dictionary, already in the viewer's
 *  language; Refresh is the page's only header action. While the first read is pending it has no action. */
function JobsHeader({ copy, refresh }: { copy: (typeof jobMessages)[keyof typeof jobMessages]; refresh?: { onClick: () => void; loading: boolean; disabled: boolean } }) {
  return <PageHeader
    icon={ClipboardList}
    title={copy.title}
    description={copy.description}
    secondaryActions={refresh ? [{ id: "refresh", label: copy.refresh, icon: RefreshCw, onClick: refresh.onClick, loading: refresh.loading, disabled: refresh.disabled }] : undefined}
  />;
}
/** The Refresh control in the header: the focus target when a review closes and its own trigger is gone. */
const refreshControl = () => document.querySelector<HTMLElement>('[data-page-action="refresh"]');
function InitialLoading() {
  const { language } = useLocale();
  return <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5"><JobsHeader copy={jobMessages[language]} /><p role="status" className="text-sm text-ink-muted">{jobMessages[language].loading}</p><JobCardsSkeleton /></div>;
}
function JobsRoute() {
  const params = useSearchParams();
  return <Jobs key={params.get("id") || "list"} id={params.get("id") || ""} />;
}
function Jobs({ id }: { id: string }) {
  const { language, timezone, numberingSystem, calendar } = useLocale();
  const t = jobMessages[language];
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [reason, setReason] = useState<WorkflowOperationReason | "">("");
  const [actionError, setActionError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<"exportFailed" | "exportSaved" | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const status = useJobActivity(id, busy);
  const { detail, jobs, checkedAt, error, loading } = status;
  const permitted = error !== "denied" && error !== "missing";
  useEffect(() => {
    if (!permitted) { setReview(null); setSelected([]); setReason(""); setConfirmed(false); }
  }, [permitted]);
  const query = (name: string, fallback = "") => params.get(name) ?? fallback;
  const state = query(id ? "itemState" : "state", id ? "all" : "attention");
  const search = query(id ? "itemQ" : "q");
  const kind = query("kind"), campus = query("campus"), started = query("started"), channel = query("channel");
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    history.replaceState(null, "", `/jobs${next.size ? `?${next}` : ""}`);
  };
  const open = (nextId: string) => {
    status.invalidate();
    const next = new URLSearchParams(params.toString());
    for (const key of ["itemQ", "itemState", "channel"]) next.delete(key);
    if (nextId) next.set("id", nextId); else next.delete("id");
    history.pushState(null, "", `/jobs${next.size ? `?${next}` : ""}`);
  };
  const clear = () => {
    const next = new URLSearchParams(params.toString());
    for (const key of id ? ["itemQ", "itemState", "channel"] : ["q", "state", "kind", "campus", "started"]) next.delete(key);
    if (!id) next.set("state", "all");
    history.replaceState(null, "", `/jobs${next.size ? `?${next}` : ""}`);
  };
  const date = (value: string | Date | null | undefined) => {
    if (!value) return t.noEvidence;
    const instant = new Date(String(value));
    return Number.isFinite(instant.getTime()) ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: timezone, numberingSystem, calendar }).format(instant) : t.unavailable;
  };
  const failureMessage = (item: JobDetail["items"][number]) => {
    if (item.uncertain) return t.uncertain;
    const blocked = item.retryBlockedReason;
    if (blocked === "AUTHORIZATION_REQUIRED") return t.permissionRequired;
    if (blocked === "ORIGINAL_VERSION_UNAVAILABLE") return t.versionChanged;
    if (blocked === "RECIPIENT_AUTHORIZATION_REQUIRED") return t.guardianRequired;
    if (blocked === "SOURCE_CORRECTION_REQUIRED") return item.category === "invalid_file" ? t.invalid_file : t.sourceCorrection;
    if (blocked === "WORKFLOW_UNAVAILABLE") return t.workflowMissing;
    if (blocked === "UNSUPPORTED_CHANNEL") return t.unsupported;
    return t[item.category as keyof typeof t];
  };
  const allowedSelected = selected.filter(itemId => detail?.items.some(item => item.id === itemId && item.canRetry));
  const counts = detail?.counts;
  const startedDay = (value: string | Date) => {
    const instant = new Date(value);
    if (!Number.isFinite(instant.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", calendar: "gregory", numberingSystem: "latn" }).formatToParts(instant);
    const part = (type: string) => parts.find(entry => entry.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const filteredJobs = jobs.filter(job => (!kind || job.kind === kind) && (state === "all" || (state === "attention" ? job.attentionCount > 0 : job.counts[state as keyof typeof job.counts] > 0)) && job.source_label.toLowerCase().includes(search.toLowerCase()) && (!campus || job.campus_id === campus) && (!started || startedDay(job.created_at) >= started));
  const filteredItems = detail?.items.filter(item => (state === "all" || (state === "attention" ? item.state === "failed" || item.uncertain || !!item.delivery_failed_at : item.state === state)) && (!channel || item.channel === channel) && `${item.label} ${item.recipient || ""}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const phase = useMemo(() => {
    if (!counts) return "";
    if (detail?.items.some(item => item.uncertain)) return t.uncertain;
    if (counts.completed && counts.completed < counts.total) return t.partial;
    if (counts.running) return t.running;
    if (counts.queued) return t.queued;
    if (counts.failed) return t.failed;
    if (counts.cancelled) return t.cancelled;
    return counts.total ? t.completed : t.empty;
  }, [counts, detail, t]);
  const beginReview = (action: Review["action"], trigger: HTMLElement, item?: JobDetail["items"][number]) => {
    if (!detail) return;
    returnFocus.current = trigger;
    setReason(""); setActionError(false); setConfirmed(false);
    setReview({ action, source: detail.source_label, items: item ? [item] : detail.items.filter(entry => action === "cancel" ? !["completed", "cancelled"].includes(entry.state) : allowedSelected.includes(entry.id)) });
  };
  const closeReview = () => {
    if (busy) return;
    if (confirmed || !returnFocus.current?.isConnected || returnFocus.current.matches(':disabled, [aria-disabled="true"]')) returnFocus.current = refreshControl();
    setReview(null); setReason(""); setActionError(false); setConfirmed(false);
  };
  const changedSelection = !!review && review.action !== "reconcile" && (!detail?.canEdit || (review.action === "retry" ? review.items.some(item => !detail?.items.some(current => current.id === item.id && current.canRetry)) : !!detail?.cancel_requested_at));
  const reviewItems = review?.action === "reconcile" ? detail?.items.filter(item => review.items.some(selected => selected.id === item.id)) ?? [] : review?.items ?? [];
  const act = async () => {
    if (!review || review.action === "reconcile" || !reason || busy || !detail?.canEdit || changedSelection) return;
    setBusy(true); setActionError(false); status.invalidate();
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: review.action, items: review.action === "retry" ? review.items.map(item => item.id) : [], reason }), signal: AbortSignal.timeout(15000) });
      if (!mounted.current) return;
      if ([401,403,404].includes(response.status)) { status.forget(response.status === 404 ? "missing" : "denied"); setReview(null); setSelected([]); return; }
      if (!response.ok) throw new Error("JOB_OPERATION_NOT_CONFIRMED");
      const result = await response.json();
      if (result.jobId !== id || result.action !== review.action) throw new Error("INVALID_JOB_ACKNOWLEDGMENT");
      if (!mounted.current) return;
      setConfirmed(true); setSelected([]);
      await status.refresh();
    } catch {
      if (mounted.current) { setActionError(true); await status.refresh(); }
    } finally { if (mounted.current) setBusy(false); }
  };
  const exportReceipt = async () => {
    if (busy) return;
    setBusy(true); setNotice(null); status.invalidate();
    const fresh = await status.refresh();
    if (!mounted.current) return;
    if (!fresh?.detail || fresh.detail.id !== id) { setNotice("exportFailed"); setBusy(false); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...fresh.detail }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `job-${id}.json`; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setNotice("exportSaved"); setBusy(false);
  };
  const filters = <section aria-label={t.filter} className={`${cardClass} grid gap-4 sm:grid-cols-2 lg:grid-cols-3`}>
        <label className={fieldLabel}>{t.search}<Input value={search} onChange={event => update(id ? "itemQ" : "q", event.target.value)} /></label>
        <label className={fieldLabel}>{t.stateFilter}<Select value={state} onChange={event => update(id ? "itemState" : "state", event.target.value)}><option value="all">{t.all}</option><option value="attention">{t.attention}</option>{outcomes.map(value => <option key={value} value={value}>{t[value]}</option>)}</Select></label>
        {!id ? <>
          <label className={fieldLabel}>{t.kindFilter}<Select value={kind} onChange={event => update("kind", event.target.value)}><option value="">{t.all}</option>{(["REPORT_DELIVERY","PDF","IMPORT"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}</Select></label>
          <label className={fieldLabel}>{t.campus}<Select value={campus} onChange={event => update("campus", event.target.value)}><option value="">{t.all}</option>{Array.from(new Map(jobs.map(job => [job.campus_id,job.campus_label || job.campus_id]))).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select></label>
          <label className={fieldLabel}>{t.started}<Input type="date" value={started} onChange={event => update("started", event.target.value)} /></label>
        </> : <label className={fieldLabel}>{t.channel}<Select value={channel} onChange={event => update("channel", event.target.value)}><option value="">{t.all}</option><option value="WHATSAPP">{t.WHATSAPP}</option><option value="EMAIL">{t.EMAIL}</option></Select></label>}
      </section>;
  const errorText = error === "denied" ? t.denied : error === "missing" ? t.missing : t.unknown;
  return <div lang={language} dir={language === "en" ? "ltr" : "rtl"} className="mx-auto w-full min-w-0 max-w-6xl space-y-5 text-foreground [overflow-wrap:anywhere]">
    <JobsHeader copy={t} refresh={{ onClick: () => void status.refresh(), loading, disabled: busy }} />
    {id && <Button variant="ghost" disabled={busy} onClick={() => open("")}><ArrowLeft aria-hidden className="rtl:rotate-180" />{t.back}</Button>}
    {error && <Alert tone="warning" live="assertive">{errorText}</Alert>}
    {notice && <Alert tone={notice === "exportFailed" ? "danger" : "success"} live={notice === "exportFailed" ? "assertive" : "polite"} onDismiss={() => setNotice(null)}>{t[notice]}</Alert>}
    {checkedAt && <p className="text-xs text-ink-subtle">{t.updated}: <bdi className="tabular-nums">{date(checkedAt)}</bdi>{loading ? ` · ${t.refreshing}` : ""}</p>}
    {permitted && <>
      {!id && filters}
      {loading && !checkedAt && <><p role="status" className="text-sm text-ink-muted">{t.loading}</p><JobCardsSkeleton /></>}
      {!id ? <section className="grid gap-4 md:grid-cols-2" aria-label={t.title}>
        {!loading && !error && !filteredJobs.length && <div className={`${cardClass} md:col-span-2`}><EmptyState size="sm" icon={jobs.length ? SearchX : ClipboardList} title={jobs.length ? t.filteredEmpty : t.empty} action={jobs.length > 0 ? <Button variant="outline" onClick={clear}>{t.clearFilters}</Button> : undefined} /></div>}
        {filteredJobs.map(job => <Button key={job.id} variant="choice" className="sk-hover-lift sk-nudge-trigger block h-auto min-w-0 w-full space-y-2 rounded-2xl bg-card p-5 text-start font-normal shadow-xs" onClick={() => open(job.id)}><span className="flex items-start justify-between gap-3"><strong className="block min-w-0 text-base font-bold leading-snug text-ink-strong">{job.source_label}</strong><ArrowRight aria-hidden className="sk-nudge mt-0.5 size-4 shrink-0 text-ink-subtle rtl:rotate-180" /></span><span className="block text-sm text-ink-muted">{t[job.kind as "PDF"] || job.kind} · {job.campus_label}</span><span className="block text-sm tabular-nums text-ink">{t.completed}: <bdi>{job.counts.completed} / {job.counts.total}</bdi> · <span className={job.attentionCount > 0 ? "font-semibold text-status-warning-text" : undefined}>{t.attention}: <bdi>{job.attentionCount}</bdi></span></span><span className="block text-xs text-ink-subtle">{date(job.created_at)}</span><bdi dir="ltr" className="block break-all font-mono text-2xs font-normal text-ink-subtle">{job.id}</bdi></Button>)}
      </section> : detail && <>
        <section className={cardClass}><h2 className="text-lg font-bold leading-snug text-ink-strong sm:text-xl">{detail.source_label}</h2><p className="mt-1.5 text-xs text-ink-subtle">{t.jobId}: <bdi dir="ltr" className="break-all font-mono">{id}</bdi></p><Link href={detail.sourceHref} className="sk-link sk-nudge-trigger mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm">{t.source}<ArrowRight aria-hidden className="sk-nudge size-4 rtl:rotate-180" /></Link></section>
        <div className="sk-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{(["total",...outcomes] as const).map(outcome => <div key={outcome} className="sk-panel min-w-0 p-3"><p className="truncate text-xs font-semibold text-ink-muted">{t[outcome]}</p><strong className="mt-1 block text-2xl font-bold tabular-nums text-ink-strong"><bdi>{counts?.[outcome]}</bdi></strong></div>)}</div>
        <p role="status" aria-live="polite" className="text-sm font-semibold text-ink-strong">{phase}{detail.cancel_requested_at ? ` · ${t.cancelRequested}` : ""}</p>
        {detail.kind === "REPORT_DELIVERY" && <p className="text-sm leading-relaxed text-ink-muted">{t.processingNote}</p>}
        <Alert tone="info" live="off">{t.cancelNote}</Alert>
        {filters}
        {!detail.canEdit && <Alert tone="neutral" live="off" compact>{t.readOnly}</Alert>}
        <div className="flex flex-wrap gap-3">{detail.canEdit && <>
          <Button disabled={busy || !!error || !allowedSelected.length || !!detail.cancel_requested_at} onClick={event => beginReview("retry", event.currentTarget)}>{t.retry} <span className="tabular-nums">({allowedSelected.length})</span></Button>
          <Button variant="outline" disabled={busy || !!error || !!detail.cancel_requested_at || !(counts!.queued + counts!.running + counts!.failed)} onClick={event => beginReview("cancel", event.currentTarget)}>{t.cancel}</Button>
        </>}<Button variant="outline" disabled={busy || !!error} onClick={() => void exportReceipt()}>{t.receipt}</Button></div>
        {!error && !filteredItems.length && <div className={cardClass}><EmptyState size="sm" icon={SearchX} title={t.filteredEmpty} action={<Button variant="outline" onClick={clear}>{t.clearFilters}</Button>} /></div>}
        <section className="space-y-3" aria-label={t.affected}>{filteredItems.map(item => <article key={item.id} className={`${cardClass} space-y-3`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-1 items-start gap-3">{detail.canEdit && item.canRetry && <Checkbox aria-label={`${t.select}: ${item.label}`} className="mt-1" checked={allowedSelected.includes(item.id)} disabled={busy || !!error} onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous,item.id])] : previous.filter(value => value !== item.id))} />}<strong className="min-w-0 font-semibold text-ink-strong">{item.label}</strong></div><Badge dot variant={stateTone[item.workflow_state === "retrying" ? "retrying" : item.state] ?? "neutral"}>{item.workflow_state === "retrying" ? t.retrying : t[item.state as "queued"]}</Badge></div>
          {item.recipient && <p className="text-sm text-ink-muted">{item.channel === "EMAIL" ? t.EMAIL : item.channel === "WHATSAPP" ? t.WHATSAPP : t.unsupported}: <bdi dir="ltr">{item.recipient}</bdi></p>}
          {item.version_id && <p className="text-xs text-ink-subtle">{t.version}: <bdi dir="ltr" className="break-all font-mono">{item.version_id}</bdi></p>}
          {(item.state === "failed" || item.uncertain) && <p className="flex items-start gap-2 text-sm font-medium leading-relaxed text-status-warning-text"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /><span>{failureMessage(item)}</span></p>}
          {item.workflow_state === "retrying" && <p className="text-sm tabular-nums text-ink-muted">{t.attempts}: <bdi dir="ltr">{item.attempts} / {item.max_attempts}</bdi> · {t.nextAttempt}: <bdi>{date(item.next_attempt_at)}</bdi></p>}
          {item.delivery_failed_at && <p className="text-sm text-status-error-text">{t.deliveryFailed} <bdi>{date(item.delivery_failed_at)}</bdi></p>}
          {item.channel && <dl className="grid gap-3 border-t border-border-subtle pt-3 sm:grid-cols-3">{(["accepted","delivered","read"] as const).map(stage => <div key={stage} className="min-w-0"><dt className="text-xs font-semibold text-ink-muted">{t[stage]}</dt><dd className="mt-0.5 text-sm text-ink"><bdi>{item.channel !== "EMAIL" && item.channel !== "WHATSAPP" ? t.unsupported : item[`${stage}_at`] ? date(item[`${stage}_at`]) : item.channel === "EMAIL" && stage !== "accepted" ? t.unsupported : t.noEvidence}</bdi></dd></div>)}</dl>}
          {(item.uncertain || item.delivery_failed_at) && <Button variant="outline" disabled={busy || !!error} onClick={event => beginReview("reconcile", event.currentTarget, item)}>{t.reviewOutcome}</Button>}
        </article>)}</section>
      </>}
    </>}
    {review && permitted && detail && <Modal title={review.action === "retry" ? t.reviewRetry : review.action === "cancel" ? t.reviewCancel : t.reviewOutcome} subtitle={review.source} onClose={closeReview} dismissible={!busy} returnFocusRef={returnFocus} size="lg" footer={<div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={closeReview}>{confirmed || review.action === "reconcile" ? t.done : t.keep}</Button>{!confirmed && review.action !== "reconcile" && <Button variant={review.action === "cancel" ? "destructive" : "default"} loading={busy} disabled={!reason || !!error || !!changedSelection || !review.items.length} onClick={() => void act()}>{review.action === "retry" ? t.confirmRetry : t.confirmCancel}</Button>}</div>}>
      <div lang={language} dir={language === "en" ? "ltr" : "rtl"} className="space-y-4 [overflow-wrap:anywhere]">
        <p className="text-sm leading-relaxed text-ink-muted">{review.action === "retry" ? t.retryNote : review.action === "cancel" ? t.cancelNote : t.outcomeNote}</p>
        <p className="text-xs text-ink-subtle">{t.jobId}: <bdi dir="ltr" className="break-all font-mono">{id}</bdi></p>
        {review.action === "cancel" && <p className="text-sm tabular-nums text-ink">{t.completed}: {counts?.completed} / {counts?.total} · {t.running}: {counts?.running} · {t.queued}: {counts?.queued}</p>}
        {confirmed ? <Alert tone="success" live="polite">{review.action === "retry" ? t.retrySaved : t.cancelSaved}</Alert> : <>
          {(actionError || changedSelection) && <Alert tone="warning" live="assertive" id="job-action-error">{!detail.canEdit ? t.readOnly : changedSelection ? t.selectionChanged : t.actionFailed}</Alert>}
          <h3 className="text-sm font-bold text-ink-strong">{t.affected}: <span className="tabular-nums">{reviewItems.length}</span></h3><ul className="space-y-2">{reviewItems.map(item => <li key={item.id} className="rounded-xl border border-border-subtle bg-surface-subtle p-3"><strong className="font-semibold text-ink-strong">{item.label}</strong>{item.version_id && <p className="mt-1 text-xs text-ink-muted">{t.version}: <bdi dir="ltr" className="break-all font-mono">{item.version_id}</bdi></p>}<p className="mt-1 text-xs text-ink-subtle"><bdi dir="ltr" className="break-all font-mono">{item.communication_id || item.id}</bdi></p>{review.action === "reconcile" && <dl className="mt-3 space-y-2 text-sm">{(["accepted","delivered","read"] as const).map(stage => <div key={stage}><dt className="text-xs font-semibold text-ink-muted">{t[stage]}</dt><dd><bdi>{item.channel !== "EMAIL" && item.channel !== "WHATSAPP" ? t.unsupported : item[`${stage}_at`] ? date(item[`${stage}_at`]) : item.channel === "EMAIL" && stage !== "accepted" ? t.unsupported : t.noEvidence}</bdi></dd></div>)}{item.delivery_failed_at && <div><dt className="text-xs font-semibold text-status-error-text">{t.deliveryFailed}</dt><dd><bdi>{date(item.delivery_failed_at)}</bdi></dd></div>}</dl>}</li>)}</ul>
          {review.action !== "reconcile" && <label className={fieldLabel}>{t.reason}<Select value={reason} disabled={busy} aria-describedby={actionError || changedSelection ? "job-action-error" : undefined} onChange={event => setReason(event.target.value as WorkflowOperationReason | "")}><option value="">{t.chooseReason}</option>{(review.action === "retry" ? workflowRetryReasons : workflowCancelReasons).map(value => <option key={value} value={value}>{t[value]}</option>)}</Select></label>}
        </>}
      </div>
    </Modal>}
  </div>;
}
