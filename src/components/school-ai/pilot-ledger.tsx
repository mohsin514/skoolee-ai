"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Calculator, Gauge, Hash, LogOut, Percent, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DeskStats, StatTile } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCards } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioIntelCopy, type StudioIntelCopy } from "@/lib/school-ai/exam-studio-copy-intel";
import type { LedgerMetric } from "@/lib/school-ai/pilot-ledger-types";

const UNIT_ICON = { PERCENT: Percent, DAYS: CalendarClock, COUNT: Hash, POINTS: TrendingUp } as const;

type Ledger = { optedIn: boolean; windowDays: number; snapshot: { computedAt: string; metrics: LedgerMetric[] } | null };

/**
 * SKO-507 Pilot Ledger slide: six tiles, each footnoted with its claim id, sample and window, estimates
 * marked. The school joins before anything is computed, and leaving deletes what was kept.
 */
export function PilotLedger() {
  const { language } = useLocale();
  const t = studioIntelCopy(language as Language);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const ui = useUiText();
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/school-ai/pilot-ledger", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && payload.ledger) setLedger(payload.ledger); else setError(typeof payload.error === "string" ? payload.error : t.loadError);
    } catch { setError(t.loadError); }
  }, [t.loadError]);
  useEffect(() => { void load(); }, [load]);
  const act = async (action: "opt-in" | "opt-out" | "compute") => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/school-ai/pilot-ledger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json();
      if (response.ok && payload.ledger) setLedger(payload.ledger); else setError(typeof payload.error === "string" ? payload.error : t.loadError);
    } catch { setError(t.loadError); }
    finally { setBusy(false); }
  };
  const n = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  const show = (metric: LedgerMetric) => metric.value === null ? t.ledgerNoData : metric.unit === "PERCENT" ? new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(metric.value / 100) : metric.unit === "DAYS" ? fillStudioCopy(t.unitDAYS, [n(metric.value)]) : metric.unit === "POINTS" ? fillStudioCopy(t.unitPOINTS, [n(metric.value)]) : n(metric.value);
  return <section aria-label={t.ledgerTitle} className="mx-auto max-w-5xl space-y-5 p-4" data-pilot-ledger={ledger?.optedIn ? "in" : "out"}>
    <PageHeader icon={Gauge} title={t.ledgerTitle} description={t.ledgerIntro} />
    {ledger?.optedIn && <div className="flex flex-wrap items-center gap-2">
      <Button disabled={busy} loading={busy} onClick={() => void act("compute")} data-ledger-compute><Calculator aria-hidden="true" />{t.ledgerCompute}</Button>
      <Button variant="outline" disabled={busy} onClick={() => setLeaving(true)}><LogOut aria-hidden="true" />{t.ledgerOptOut}</Button>
      {ledger.snapshot && <span className="ms-auto text-xs text-ink-subtle" data-ledger-computed>{fillStudioCopy(t.ledgerComputed, [new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ledger.snapshot.computedAt))])}</span>}
    </div>}
    {error && ledger && <Alert compact tone="danger" onDismiss={() => setError("")}><bdi dir="auto">{error}</bdi></Alert>}
    {error && !ledger && <div className="sk-panel" data-static><ErrorState description={<bdi dir="auto">{error}</bdi>} onRetry={() => load()} retryLabel={t.retry} /></div>}
    {!ledger && !error && <SkeletonCards count={6} className="sm:grid-cols-2 lg:grid-cols-3" label={t.ledgerTitle} />}
    {ledger && !ledger.optedIn && <div className="sk-panel" data-static><EmptyState icon={Sparkles} title={t.ledgerTitle} description={t.ledgerNotOptedIn}
      action={<Button disabled={busy} loading={busy} onClick={() => void act("opt-in")} data-ledger-opt-in>{t.ledgerOptIn}</Button>} /></div>}
    {ledger?.optedIn && !ledger.snapshot && <div className="sk-panel" data-static><EmptyState size="sm" icon={Calculator} title={t.ledgerNoData} description={t.ledgerIntro} /></div>}
    {ledger?.snapshot && <DeskStats className="sm:grid-cols-2 lg:grid-cols-3">{ledger.snapshot.metrics.map((metric, index) => <StatTile key={metric.claim} index={index} data-ledger-tile={metric.claim}
      icon={UNIT_ICON[metric.unit] ?? Hash} tone={metric.value === null ? "neutral" : metric.estimate ? "info" : "brand"}
      label={<span className="inline-flex flex-wrap items-center gap-2">{t[`metric${metric.key}` as keyof StudioIntelCopy]}{metric.estimate && <Badge variant="info" size="sm">{t.ledgerEstimate}</Badge>}</span>}
      value={metric.value === null ? <span className="text-base font-semibold text-ink-muted">{show(metric)}</span> : show(metric)} valueProps={{ "data-ledger-value": "" }}
      hint={fillStudioCopy(t.ledgerSample, [n(metric.sample), n(ledger.windowDays), metric.claim])} />)}</DeskStats>}
    <ConfirmAction open={leaving} tone="danger" busy={busy} title={ui("Leave the pilot ledger?")} description={ui("Everything the ledger kept for this school is deleted. You can join again later.")}
      confirmLabel={t.ledgerOptOut} onCancel={() => setLeaving(false)} onConfirm={async () => { await act("opt-out"); setLeaving(false); }} />
  </section>;
}
