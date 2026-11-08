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
import { ErrorState } from "@/components/ui/error-state";
import { Alert } from "@/components/ui/alert";
import { Coins, Download, RefreshCw, TrendingDown, Wallet, Zap } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DeskFilterStatus, DeskQuickFilter, DeskStats, StatTile } from "@/components/ui/desk";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { cn } from "@/lib/utils";
import { PAGE_CARD_BODY } from "@/components/role-dashboard/RoleShellSkeleton";
import { isReportStale, reconcileDetail, totalSpendUsd, type CostRates, type CostRow } from "@/lib/owner/ai-cost-math";

// SKAI-1042 (D1-02): OpenAI spend ÷ credits consumed per school and month, with margin against the plan price.
type Report = { since: string; generatedAt: string; latestUsageAt: string | null; rates: CostRates; rows: CostRow[] };
type Detail = { truncated: boolean; records: { id: string; feature: string | null; action: string; model: string | null; tokens: number; credits: number; createdAt: string }[] };
const num = (n: number | null, dp = 2) => n === null ? "—" : n.toLocaleString("en", { maximumFractionDigits: dp });

/** The cost-rates dialog; its Save sits in the pinned footer so it stays in reach on a phone. */
function RatesForm({ rates, onClose, onDone }: { rates: CostRates; onClose: () => void; onDone: () => Promise<void> }) {
  const ui = useUiText();
  const [text, setText] = useState(Object.entries(rates.usdPerMillionTokens).map(([m, r]) => `${m}=${r}`).join("\n"));
  const [fx, setFx] = useState(rates.pkrPerUsd === null ? "" : String(rates.pkrPerUsd));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const usdPerMillionTokens: Record<string, number> = {};
    for (const line of text.split("\n").map(l => l.trim()).filter(Boolean)) {
      const [model, rate] = line.split("=").map(s => s.trim());
      if (!model || !Number.isFinite(Number(rate))) { toast.error(ui("Write one model per line as model=USD per million tokens.")); return; }
      usdPerMillionTokens[model] = Number(rate);
    }
    setBusy(true);
    try {
      const response = await fetch("/api/owner/ai-cost-report", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usdPerMillionTokens, pkrPerUsd: fx.trim() ? Number(fx) : null }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
      toast.success(ui("Cost rates saved."));
      await onDone();
    } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); }
    finally { setBusy(false); }
  };
  return <Modal title={ui("Cost rates")} icon={Coins} tone="amber" size="md" subtitle={ui("Founder-set values from the OpenAI invoice. Nothing is assumed: an unpriced model leaves spend unknown.")} onClose={onClose}
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" type="button" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void save()} loading={busy} disabled={busy} data-cost-rates-save>{ui("Save rates")}</Button></div>}>
  <div className="space-y-4" data-cost-rates-form>
    <FormField label={ui("Blended USD per million tokens, one model per line")} name="cost-rates" id="cost-rates"><Textarea id="cost-rates" dir="ltr" rows={5} value={text} onChange={e => setText(e.target.value)} placeholder="model-name=0.00" /></FormField>
    <FormField label={ui("PKR per USD")} name="cost-fx" id="cost-fx"><Input id="cost-fx" dir="ltr" inputMode="decimal" value={fx} onChange={e => setFx(e.target.value)} /></FormField>
  </div></Modal>;
}

/** SKAI-721: drill-through from one school-month row to its source usage records, reconciled against the row. */
function CostDetail({ row, onClose }: { row: CostRow; onClose: () => void }) {
  const ui = useUiText();
  const when = new Intl.DateTimeFormat(localeTag(useLocale()), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState<RequestFailure | null>(null);
  const load = useCallback(async () => {
    setError(null); setDetail(null);
    try {
      const json = await checkedJson(await readRequest(`/api/owner/ai-cost-report?schoolId=${encodeURIComponent(row.schoolId)}&month=${encodeURIComponent(row.month)}`));
      if (!Array.isArray(json.data?.records)) throw new RequestFailure("server");
      setDetail(json.data);
    } catch (failure) { setError(requestFailure(failure)); }
  }, [row.schoolId, row.month]);
  useEffect(() => { void load(); }, [load]);
  const check = detail ? reconcileDetail(row, detail.records) : null;
  return <Modal title={ui("Usage records")} icon={Zap} tone="sky" size="lg" subtitle={`${row.schoolName} · ${row.month}`} onClose={onClose}>
    <div className="space-y-3" data-ai-cost-detail>
      {error ? <ErrorState title={ui("The usage records did not load.")} error={error} onRetry={() => load()} /> : !detail || !check ? <SkeletonCards count={1} label={ui("Loading the usage records…")} /> : <>
        <Alert tone={check.matches ? "success" : "warning"} compact data-ai-cost-reconciled={check.matches ? "yes" : "no"}>{check.matches
          ? ui("These records add up to the row: {0} calls, {1} tokens, {2} credits.", [String(row.calls), String(row.tokens), String(row.credits)])
          : detail.truncated ? ui("Only the newest {0} records are listed, so they cover part of the row.", [String(detail.records.length)])
          : ui("The records do not add up to the row (recorded {0} tokens, {1} credits). Refresh the report: usage may have been added since.", [String(check.tokens), String(check.credits)])}</Alert>
        {!detail.records.length ? <EmptyState size="sm" icon={Zap} title={ui("No AI usage was recorded in this period.")} /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow>
          <TableHead>{ui("Time")}</TableHead><TableHead>{ui("Feature")}</TableHead><TableHead>{ui("Model")}</TableHead><TableHead>{ui("Tokens")}</TableHead><TableHead>{ui("Credits")}</TableHead>
        </TableRow></TableHeader><TableBody>{detail.records.map(rec => <TableRow key={rec.id} data-ai-cost-record={rec.id}>
          <TableCell className="whitespace-nowrap"><bdi>{when.format(new Date(rec.createdAt))}</bdi></TableCell><TableCell><bdi dir="ltr">{rec.feature ?? rec.action}</bdi></TableCell><TableCell><bdi dir="ltr">{rec.model ?? "—"}</bdi></TableCell>
          <TableCell><bdi dir="ltr">{num(rec.tokens, 0)}</bdi></TableCell><TableCell><bdi dir="ltr">{num(rec.credits, 0)}</bdi></TableCell>
        </TableRow>)}</TableBody></Table></div>}
      </>}
    </div></Modal>;
}

export function AiCostReport() {
  const ui = useUiText();
  const [months, setMonths] = useState("6");
  const [lossOnly, setLossOnly] = useState(false), [query, setQuery] = useState("");
  const [data, setData] = useState<Report | null>(null), [error, setError] = useState<RequestFailure | null>(null), [loading, setLoading] = useState(true), [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<CostRow | null>(null), [now, setNow] = useState(() => Date.now());
  const when = new Intl.DateTimeFormat(localeTag(useLocale()), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(id); }, []);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const version = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const json = await checkedJson(await readRequest(`/api/owner/ai-cost-report?months=${months}`));
      if (version !== sequence.current) return;
      if (!Array.isArray(json.data?.rows)) throw new RequestFailure("server");
      setData(json.data); setNow(Date.now());
    } catch (failure) { if (version === sequence.current) { setData(null); setError(requestFailure(failure)); } }
    finally { if (version === sequence.current) setLoading(false); }
  }, [months]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  const exportCsv = () => { window.location.href = `/api/owner/ai-cost-report?months=${months}&format=csv`; };
  const header = <PageHeader eyebrow="Platform operations" title="AI cost per credit" icon={Coins}
    description="OpenAI spend divided by AI credits consumed, per school and month, with margin against the plan price."
    secondaryActions={[{ id: "rates", label: "Cost rates", icon: Coins, onClick: () => setEditing(true), disabled: !data }, { id: "export", label: "Export", icon: Download, onClick: exportCsv, disabled: !data || loading }, { id: "refresh", label: "Refresh", icon: RefreshCw, onClick: () => void load() }]} />;
  const body = cn("custom-scrollbar min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto", PAGE_CARD_BODY);
  if (error) return <div className={body} data-ai-cost-error>{header}<div className="sk-panel"><ErrorState title={ui("The cost report did not load.")} error={error} onRetry={() => load()} /></div></div>;
  if (loading || !data) return <div className={body}>{header}<SkeletonCards count={2} label={ui("Loading the cost report…")} /></div>;
  const losing = data.rows.filter(r => r.marginPkr !== null && r.marginPkr < 0);
  const needle = query.trim().toLowerCase();
  const rows = (lossOnly ? losing : data.rows).filter(r => !needle || r.schoolName.toLowerCase().includes(needle) || r.month.includes(needle));
  const spend = totalSpendUsd(data.rows);
  const stale = isReportStale(data.generatedAt, now);
  const unpriced = !Object.keys(data.rates.usdPerMillionTokens).length || data.rates.pkrPerUsd === null || data.rows.some(r => r.unpricedTokens > 0);
  return <div className={body} data-ai-cost>
    {header}
    <p className="text-xs text-ink-muted" role="status" data-ai-cost-refreshed={stale ? "stale" : "fresh"}>
      {ui("Last refreshed {0}", [when.format(new Date(data.generatedAt))])} · {data.latestUsageAt ? ui("Newest usage included {0}", [when.format(new Date(data.latestUsageAt))]) : ui("No usage in this period")}
    </p>
    {stale ? <Alert tone="warning" compact data-ai-cost-stale>{ui("These figures are more than 15 minutes old. Refresh to include newer usage.")}</Alert> : null}
    {unpriced && data.rows.length ? <Alert tone="warning" compact data-ai-cost-unpriced>{ui("Some usage has no saved cost rate, so its spend and margin show as unknown. Set cost rates from the OpenAI invoice.")}</Alert> : null}
    <DeskStats data-ai-cost-stats>
      <StatTile index={0} icon={Zap} tone="brand" label={ui("Credits consumed")} value={num(data.rows.reduce((sum, r) => sum + r.credits, 0), 0)} />
      <StatTile index={1} icon={Wallet} tone="info" label={ui("OpenAI spend (USD)")} value={num(spend, 2)} hint={spend === null && data.rows.length ? ui("Unknown: some usage has no cost rate") : undefined} />
      <StatTile index={2} icon={TrendingDown} tone={losing.length ? "danger" : "neutral"} label={ui("Negative margin")} value={num(losing.length, 0)} selected={lossOnly} onSelect={() => setLossOnly(!lossOnly)} />
    </DeskStats>
    <section className="sk-panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">{ui("Cost per credit by school and month")}</h2>
        <FormField label={ui("Period")} name="cost-months" id="cost-months"><Select id="cost-months" value={months} onChange={e => setMonths(e.target.value)}>
          <option value="1">{ui("This month")}</option><option value="3">{ui("Last 3 months")}</option><option value="6">{ui("Last 6 months")}</option><option value="12">{ui("Last 12 months")}</option>
        </Select></FormField>
      </div>
      {data.rows.length > 8 ? <DeskQuickFilter value={query} onChange={setQuery} label={ui("Search schools")} /> : null}
      <DeskFilterStatus shown={rows.length} total={data.rows.length} onClear={() => { setLossOnly(false); setQuery(""); }} />
      {!data.rows.length ? <div data-ai-cost-empty><EmptyState size="sm" icon={Coins} title={ui("No AI usage was recorded in this period.")} /></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow>
        <TableHead>{ui("Month")}</TableHead><TableHead>{ui("School")}</TableHead><TableHead>{ui("Plan")}</TableHead><TableHead>{ui("Credits consumed")}</TableHead><TableHead>{ui("OpenAI spend (USD)")}</TableHead><TableHead>{ui("Cost per credit (PKR)")}</TableHead><TableHead>{ui("Plan price per credit (PKR)")}</TableHead><TableHead>{ui("Margin (PKR)")}</TableHead><TableHead>{ui("Margin %")}</TableHead>
      </TableRow></TableHeader><TableBody>{rows.map(r => <TableRow key={`${r.month}-${r.schoolId}`} data-ai-cost-row={r.schoolId} className={r.marginPkr !== null && r.marginPkr < 0 ? "bg-status-error-surface/60" : undefined}>
        <TableCell className="whitespace-nowrap"><bdi dir="ltr">{r.month}</bdi></TableCell><TableCell><Button variant="link" size="sm" className="h-auto p-0" onClick={() => setSelected(r)} data-ai-cost-drill={r.schoolId} aria-label={ui("Show usage records for {0}, {1}", [r.schoolName, r.month])}><bdi>{r.schoolName}</bdi></Button></TableCell><TableCell>{r.plan}</TableCell>
        <TableCell><bdi dir="ltr">{num(r.credits, 0)}</bdi></TableCell><TableCell><bdi dir="ltr">{num(r.spendUsd, 4)}</bdi></TableCell>
        <TableCell><bdi dir="ltr">{num(r.costPerCreditPkr, 4)}</bdi></TableCell><TableCell><bdi dir="ltr">{num(r.pricePerCreditPkr, 4)}</bdi></TableCell>
        <TableCell className={cn("font-semibold", r.marginPkr !== null && r.marginPkr < 0 ? "text-status-error-text" : "")}><bdi dir="ltr">{num(r.marginPkr)}</bdi></TableCell><TableCell><bdi dir="ltr">{num(r.marginPct, 1)}</bdi></TableCell>
      </TableRow>)}</TableBody></Table></div>}
      <p className="text-xs text-ink-muted">{ui("Spend is estimated from recorded tokens and founder-set rates, not read from the OpenAI invoice. Months are calendar months in UTC.")}</p>
    </section>
    {selected ? <CostDetail row={selected} onClose={() => setSelected(null)} /> : null}
    {editing ? <RatesForm rates={data.rates} onClose={() => setEditing(false)} onDone={async () => { setEditing(false); await load(); }} /> : null}
  </div>;
}
