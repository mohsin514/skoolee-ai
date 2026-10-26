"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmAction } from "@/components/ui/confirm-action";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import type { ExamIntegrityView, IntegrityDecision } from "@/lib/school-ai/exam-integrity";
import { examIntegrityCopy } from "./exam-integrity-copy";
import { ExamIntegrityPolicySettings } from "./exam-integrity-policy";
import { examIntegrityPolicyCopy } from "./exam-integrity-policy-copy";

export function ExamIntegrityDesk({ id, locale, showPolicy }: { id: string; locale: AssessmentLocale; showPolicy: boolean }) {
  return <IntegrityDesk key={id} id={id} locale={locale} showPolicy={showPolicy} />;
}

type Observation = ExamIntegrityView["events"][number];
function IntegrityDesk({ id, locale, showPolicy }: { id: string; locale: AssessmentLocale; showPolicy: boolean }) {
  const t = examIntegrityCopy(locale);
  const [data, setData] = useState<ExamIntegrityView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState<Observation | null>(null);
  const [pendingSelection, setPendingSelection] = useState<Observation | null | undefined>(undefined);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Observation | null>(null);
  const [checkingLatest, setCheckingLatest] = useState(false);
  const [decision, setDecision] = useState<IntegrityDecision>("NOTED");
  const [reason, setReason] = useState("");
  const [reviewVersion, setReviewVersion] = useState(0);
  const requests = useRef({ version: 0, controller: null as AbortController | null });
  const api = `/api/school-ai/exams/${encodeURIComponent(id)}/integrity`;
  const initialDecision = selected?.decision === "DISMISSED" || selected?.decision === "FOLLOW_UP" ? selected.decision : "NOTED";
  const dirty = !!selected && (reason !== (selected.reviewReason ?? "") || decision !== initialDecision);
  const loadPage = useCallback(async (cursor = "") => {
    requests.current.controller?.abort();
    const version = ++requests.current.version, controller = new AbortController();
    requests.current.controller = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch(`${api}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json();
      if (version !== requests.current.version) return;
      if ([401, 403, 404].includes(response.status)) { setData(null); setSelected(null); setReason(""); }
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      setData(previous => cursor && previous ? { ...payload, events: [...previous.events, ...payload.events.filter((item: ExamIntegrityView["events"][number]) => !previous.events.some(existing => existing.id === item.id))] } : payload);
    } catch (cause) { if (!controller.signal.aborted && version === requests.current.version) setError(cause instanceof Error ? cause.message : t.failure); }
    finally { if (version === requests.current.version) setLoading(false); }
  }, [api, t.failure]);
  const load = useCallback(() => loadPage(), [loadPage]);
  useEffect(() => { void load(); return () => { requests.current.version++; requests.current.controller?.abort(); }; }, [load]);
  const openReview = (event: Observation | null) => {
    setSelected(event); setReviewVersion(event?.version ?? 0); setReason(event?.reviewReason ?? "");
    setDecision(event?.decision === "DISMISSED" || event?.decision === "FOLLOW_UP" ? event.decision : "NOTED");
    setConflict(false); setLatest(null); setError(""); setMessage("");
  };
  const requestSelection = (event: Observation | null) => {
    if (event?.id === selected?.id) return;
    if (dirty) setPendingSelection(event); else openReview(event);
  };
  const loadLatest = async () => {
    if (!selected) return;
    setCheckingLatest(true); setError("");
    try {
      const response = await fetch(`${api}?eventId=${encodeURIComponent(selected.id)}`, { cache: "no-store" });
      const payload = await response.json();
      if ([401, 403, 404].includes(response.status)) { setData(null); setSelected(null); setReason(""); }
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      const current = (payload as ExamIntegrityView).events.find(item => item.id === selected.id);
      if (!current) throw new Error(t.failure);
      setLatest(current);
      setData(previous => previous ? { ...previous, summary: payload.summary, canReview: payload.canReview, events: previous.events.map(item => item.id === current.id ? current : item) } : previous);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setCheckingLatest(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || !data?.canReview || conflict) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: selected.id, version: reviewVersion, decision, reason: reason.trim() }) });
      const payload = await response.json();
      if (response.status === 409) { setConflict(true); setLatest(null); }
      if ([401, 403, 404].includes(response.status)) { setData(null); setSelected(null); setReason(""); }
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      setSelected(null); setReason(""); await load(); setMessage(t.saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  const time = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
  const events = data?.events.filter(event => filter === "all" || event.decision === "PENDING") ?? [];

  return <section className="sk-panel space-y-5 p-4 sm:p-6" dir={locale === "en" ? "ltr" : "rtl"} aria-label={t.title}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck aria-hidden className="size-5 text-brand" />{t.title}</h2><Button variant="outline" onClick={load} disabled={loading || busy}><RefreshCw aria-hidden className="size-4" />{t.refresh}</Button></div>
    <p className="max-w-3xl text-sm leading-relaxed text-ink-subtle">{t.hint}</p>
    {error && <p role="alert" className="text-sm text-status-error-text">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {!data && loading ? <Skeleton className="h-32 w-full" /> : data && <>
      {showPolicy && <ExamIntegrityPolicySettings key={data.policyVersion} id={id} data={data} locale={locale} onSaved={async () => { await load(); setMessage(examIntegrityPolicyCopy(locale).saved); }} />}
      <dl className="grid gap-3 sm:grid-cols-3">{([[t.pending, data.summary.pending], [t.followUp, data.summary.followUp], [t.total, data.summary.total]] as const).map(([label, count]) => <div key={label} className="rounded-xl border border-border p-4"><dt className="text-sm text-ink-subtle">{label}</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{count.toLocaleString(locale)}</dd></div>)}</dl>
      <FormField name="integrity-filter" label={t.title}><Select value={filter} onChange={event => setFilter(event.target.value)}><option value="pending">{t.pendingOnly}</option><option value="all">{t.all}</option></Select></FormField>
      {data.nextCursor && <p className="text-sm text-ink-subtle">{t.truncated}</p>}
      {selected && <form onSubmit={save} className="space-y-4 rounded-xl border border-border p-4" aria-label={t.selected}>
        <h3 className="font-bold">{selected.student?.fullName ?? t.unknownStudent} · {t.kinds[selected.kind]}</h3>
        <p className="text-sm text-ink-subtle">{t.reviewHint}</p>
        {conflict && <div className="space-y-3 rounded-xl border border-status-warning-border bg-status-warning-surface p-3">
          <p role="status" className="text-sm">{t.conflict}</p>
          <Button type="button" variant="outline" disabled={checkingLatest} onClick={loadLatest}>{t.loadLatest}</Button>
          {latest && <div className="space-y-2"><p className="text-sm font-semibold">{t.latestDecision}: {latest.decision === "PENDING" ? t.unreviewed : t.decisions[latest.decision as IntegrityDecision]}</p><p className="whitespace-pre-wrap break-words text-sm">{latest.reviewReason ?? t.noReviewReason}</p><Button type="button" variant="outline" disabled={!data.canReview} onClick={() => { setSelected(latest); setReviewVersion(latest.version); setConflict(false); setLatest(null); setError(""); }}>{t.keepDraft}</Button></div>}
        </div>}
        <FormField name="integrity-decision" label={t.decision}><Select value={decision} disabled={busy || !data.canReview} onChange={event => setDecision(event.target.value as IntegrityDecision)}>{Object.entries(t.decisions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
        <FormField name="integrity-reason" label={t.reason}><Textarea required minLength={3} maxLength={2000} value={reason} disabled={busy || !data.canReview} onChange={event => setReason(event.target.value)} /></FormField>
        <div className="flex flex-wrap gap-2">{data.canReview && <Button type="submit" disabled={busy || checkingLatest || conflict || reason.trim().length < 3}>{busy ? t.saving : t.save}</Button>}<Button type="button" variant="outline" disabled={busy || checkingLatest} onClick={() => requestSelection(null)}>{t.cancel}</Button></div>
      </form>}
      {!events.length && <p className="rounded-xl border border-border p-5 text-sm text-ink-subtle">{t.empty}</p>}
      <ol className="space-y-3">{events.map(event => <li key={event.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-4">
        <div className="min-w-0 space-y-1"><p className="font-semibold"><bdi>{event.student?.fullName ?? t.unknownStudent}</bdi>{event.student?.rollNo && <> · <bdi>{event.student.rollNo}</bdi></>}</p><p className="text-sm">{t.kinds[event.kind]}</p><p className="text-xs text-ink-subtle">{t.observed}: <time dateTime={event.observedAt}>{time(event.observedAt)}</time> · {t.received}: <time dateTime={event.receivedAt}>{time(event.receivedAt)}</time></p><p className="text-xs text-ink-subtle">{examIntegrityPolicyCopy(locale).expires}: <time dateTime={event.retentionUntil}>{time(event.retentionUntil)}</time></p><p className="text-xs text-ink-subtle">{event.details.reason ? t.reasons[event.details.reason] : t.noReason}</p><p className="text-sm font-medium">{event.decision === "PENDING" ? t.unreviewed : t.decisions[event.decision as IntegrityDecision] ?? event.decision}</p>{event.reviewReason && <p className="max-w-2xl whitespace-pre-wrap break-words text-sm">{event.reviewReason}</p>}</div>
        <Button type="button" variant="outline" disabled={busy || checkingLatest} onClick={() => requestSelection(event)}>{t.select}</Button>
      </li>)}</ol>
      {data.nextCursor && <Button type="button" variant="outline" disabled={loading || busy} onClick={() => loadPage(data.nextCursor!)}>{t.older}</Button>}
    </>}
    <ConfirmAction open={pendingSelection !== undefined} title={t.discardTitle} description={t.discardHint} confirmLabel={t.discard} cancelLabel={t.keepEditing} onCancel={() => setPendingSelection(undefined)} onConfirm={() => { openReview(pendingSelection ?? null); setPendingSelection(undefined); }} />
  </section>;
}
