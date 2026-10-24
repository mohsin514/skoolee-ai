"use client";

import { useCallback, useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/locale/LocaleProvider";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioIntelCopy, type StudioIntelCopy } from "@/lib/school-ai/exam-studio-copy-intel";
import type { LedgerMetric } from "@/lib/school-ai/pilot-ledger-types";

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
  const load = useCallback(async () => {
    const response = await fetch("/api/school-ai/pilot-ledger", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setLedger(payload.ledger); else setError(typeof payload.error === "string" ? payload.error : "");
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (action: "opt-in" | "opt-out" | "compute") => {
    setBusy(true); setError("");
    const response = await fetch("/api/school-ai/pilot-ledger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) setLedger(payload.ledger); else setError(typeof payload.error === "string" ? payload.error : "");
  };
  const n = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  const show = (metric: LedgerMetric) => metric.value === null ? t.ledgerNoData : metric.unit === "PERCENT" ? new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(metric.value / 100) : metric.unit === "DAYS" ? fillStudioCopy(t.unitDAYS, [n(metric.value)]) : metric.unit === "POINTS" ? fillStudioCopy(t.unitPOINTS, [n(metric.value)]) : n(metric.value);
  return <section aria-labelledby="pilot-ledger" className="mx-auto max-w-5xl space-y-4 p-4" data-pilot-ledger={ledger?.optedIn ? "in" : "out"}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 id="pilot-ledger" className="flex items-center gap-2 text-2xl font-bold text-ink-strong"><Gauge aria-hidden="true" className="size-6" />{t.ledgerTitle}</h1>
      {ledger && <div className="flex flex-wrap gap-2">
        {ledger.optedIn ? <><Button disabled={busy} onClick={() => void act("compute")} data-ledger-compute>{t.ledgerCompute}</Button><Button variant="outline" disabled={busy} onClick={() => void act("opt-out")}>{t.ledgerOptOut}</Button></>
          : <Button disabled={busy} onClick={() => void act("opt-in")} data-ledger-opt-in>{t.ledgerOptIn}</Button>}
      </div>}
    </header>
    <p className="text-sm text-ink-muted">{t.ledgerIntro}</p>
    {error && <p role="alert" className="text-sm text-status-error-text"><bdi dir="auto">{error}</bdi></p>}
    {ledger && !ledger.optedIn && <p className="text-sm text-ink-muted">{t.ledgerNotOptedIn}</p>}
    {ledger?.snapshot && <>
      <p className="text-xs text-ink-subtle" data-ledger-computed>{fillStudioCopy(t.ledgerComputed, [new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ledger.snapshot.computedAt))])}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ledger.snapshot.metrics.map(metric => <li key={metric.claim} className="sk-panel space-y-2 p-4" data-ledger-tile={metric.claim}>
        <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-ink-strong">{t[`metric${metric.key}` as keyof StudioIntelCopy]}</p>{metric.estimate && <Badge variant="info" size="sm">{t.ledgerEstimate}</Badge>}</div>
        <p className="text-2xl font-bold tabular-nums text-primary" data-ledger-value>{show(metric)}</p>
        <p className="text-xs text-ink-subtle">{fillStudioCopy(t.ledgerSample, [n(metric.sample), n(ledger.windowDays), metric.claim])}</p>
      </li>)}</ul>
    </>}
  </section>;
}
