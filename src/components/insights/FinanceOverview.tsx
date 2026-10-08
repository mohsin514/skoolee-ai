"use client";

import { UiText, useUiText } from "@/components/locale/LocaleProvider";

/**
 * The accountant's opening screen.
 *
 * Everything here answers one of two questions: how much of what was billed
 * has actually arrived, and what is still owed. The fee book, the collection
 * curve and the defaulter count are three views of the same gap.
 */

import { useLocale } from "@/components/locale/LocaleProvider";
import { localeTag, minorUnits } from "@/lib/locale/package";
import { useMemo } from "react";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  FileText,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CommandHero } from "./CommandHero";
import { EmptyChart, InsightCard, RadialGauge, SeriesLegend, StatTile, VizTooltip } from "./chart-kit";
import { AXIS_TICK, INK, NO_ENTRY_ANIMATION, RAMP_BRAND, SERIES, STATUS, compact, fromMinor, money } from "./palette";

export interface FinanceSummary {
  kind: "ACCOUNTANT";
  currency: string;
  byStatus: { status: string; count: number; billed: number; paid: number; outstanding: number }[];
  collectionByMonth: { month: string; count: number; value: number }[];
  byMethod: { method: string; count: number; amount: number }[];
  paymentCount: number;
  defaulters: number;
  payrollRuns: number;
  studentsBilled: number;
}

const STATUS_LABEL: Record<string, string> = {
  PAID: "Paid",
  PARTIAL: "Part paid",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  PAID: STATUS.good,
  PARTIAL: STATUS.warning,
  PENDING: RAMP_BRAND[1],
  OVERDUE: STATUS.critical,
  CANCELLED: STATUS.neutral,
};

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK: "Bank",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  CARD: "Card",
  ONLINE: "Online",
};

function monthLabel(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  const d = new Date(year, (month ?? 1) - 1, 1);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short" });
}

export function FinanceOverview({
  summary,
  campusLabel,
  onNavigate,
}: {
  summary: FinanceSummary;
  campusLabel: string;
  onNavigate: (view: string) => void;
}) {
  const tr = useUiText();
  const locale = useLocale();
  const fromMinor = (value: number) => value / 10 ** minorUnits(summary.currency);
  const money = (value: number) => new Intl.NumberFormat(localeTag(locale), { style: "currency", currency: summary.currency, minimumFractionDigits: minorUnits(summary.currency), maximumFractionDigits: minorUnits(summary.currency) }).format(value);
  const derived = useMemo(() => {
    const live = summary.byStatus.filter((r) => r.status !== "CANCELLED");
    const billed = fromMinor(live.reduce((sum, r) => sum + r.billed, 0));
    const collected = fromMinor(live.reduce((sum, r) => sum + r.paid, 0));
    const outstanding = fromMinor(live.reduce((sum, r) => sum + r.outstanding, 0));
    const invoices = live.reduce((sum, r) => sum + r.count, 0);

    const buckets = summary.byStatus
      .map((r) => ({
        ...r,
        billed: fromMinor(r.billed),
        paid: fromMinor(r.paid),
        outstanding: fromMinor(r.outstanding),
        label: tr(STATUS_LABEL[r.status] ?? r.status),
        color: STATUS_COLOR[r.status] ?? STATUS.neutral,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.outstanding - a.outstanding || b.count - a.count);

    const collection = summary.collectionByMonth.map((r) => ({
      label: new Intl.DateTimeFormat(localeTag(locale), {month:"short", timeZone:"UTC"}).format(new Date(`${r.month}-01T00:00:00Z`)),
      amount: fromMinor(r.value),
      payments: r.count,
    }));

    const methods = summary.byMethod.map((m) => ({
      ...m,
      amount: fromMinor(m.amount),
      label: tr(METHOD_LABEL[m.method] ?? m.method),
    }));

    return {
      billed,
      collected,
      outstanding,
      invoices,
      rate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
      buckets,
      collection,
      hasCollection: collection.some((c) => c.amount > 0),
      methods,
    };
  }, [summary, locale, tr]);

  return (
    <div className="space-y-5">
      <CommandHero
        eyebrow={campusLabel}
        title={tr("Finance command centre")}
        heroValue={money(derived.collected)}
        heroLabel={tr("Collected against invoices raised")}
        heroCaption={
          derived.billed > 0
            ? tr("{0} outstanding across {1} invoices for {2} students.", [money(derived.outstanding), derived.invoices, summary.studentsBilled])
            : tr("No invoices have been raised yet — generate the first run to start tracking collection.")
        }
        heroAccent={<TrendingUp className="mb-2 h-7 w-7 text-emerald-400" aria-hidden />}
        meters={[
          {
            label: tr("Invoices settled in full"),
            value: derived.buckets.find((b) => b.status === "PAID")?.count ?? 0,
            max: derived.invoices || 1,
            valueLabel: `${derived.buckets.find((b) => b.status === "PAID")?.count ?? 0} / ${derived.invoices}`,
            color: derived.rate >= 70 ? STATUS.good : STATUS.warning,
          },
          {
            label: tr("Amount recovered"),
            value: derived.collected,
            max: derived.billed || 1,
            valueLabel: `${money(derived.collected)} / ${money(derived.billed)}`,
          },
        ]}
        pills={[
          { icon: FileText, label: tr("Invoices"), value: derived.invoices, onClick: () => onNavigate("invoices") },
          { icon: Wallet, label: tr("Payments"), value: summary.paymentCount, onClick: () => onNavigate("payments") },
          { icon: AlertTriangle, label: tr("Past due"), value: summary.defaulters, onClick: () => onNavigate("fee-reports"), tone: summary.defaulters > 0 ? "critical" : "default" },
          { icon: Banknote, label: tr("Payroll runs"), value: summary.payrollRuns, onClick: () => onNavigate("payroll") },
        ]}
        aside={
          derived.billed > 0 ? (
            <RadialGauge
              value={derived.rate}
              label={tr("Collected")}
              sublabel={`${money(derived.collected)} / ${money(derived.billed)}`}
              color={derived.rate >= 70 ? STATUS.good : derived.rate >= 40 ? STATUS.warning : STATUS.critical}
            />
          ) : (
            <div className="flex h-[148px] w-[148px] flex-col items-center justify-center text-center">
              <Receipt className="h-7 w-7 text-[#cfc2d6]" aria-hidden />
              <p className="mt-2 px-2 text-[10px] font-bold leading-tight text-ink-subtle"><UiText>{"No invoices raised yet"}</UiText></p>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={Receipt} label={tr("Collected")} value={money(derived.collected)} sub={tr("{0}% of billed", [derived.rate])} tone={derived.rate >= 70 ? "good" : "warning"} onClick={() => onNavigate("payments")} delay={80} />
        <StatTile icon={AlertTriangle} label={tr("Outstanding")} value={money(derived.outstanding)} sub={tr("Past due: {0}", [summary.defaulters])} tone={derived.outstanding > 0 ? "warning" : "good"} onClick={() => onNavigate("fee-reports")} delay={140} />
        <StatTile icon={FileText} label={tr("Invoices")} value={derived.invoices} sub={tr("Students billed: {0}", [summary.studentsBilled])} onClick={() => onNavigate("invoices")} delay={200} />
        <StatTile icon={Wallet} label={tr("Payments")} value={summary.paymentCount} sub={tr("Last twelve months")} onClick={() => onNavigate("payments")} delay={260} />
        <StatTile icon={Banknote} label={tr("Payroll")} value={summary.payrollRuns} sub="Runs recorded" onClick={() => onNavigate("payroll")} delay={320} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title={tr("Collection by month")}
          subtitle={tr("Payments received over the last year")}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["Month", "Amount", "Payments"],
            rows: derived.collection.map((c) => [c.label, Math.round(c.amount), c.payments]),
          }}
        >
          {derived.hasCollection ? (
            <ResponsiveContainer width="100%" height={252}>
              <AreaChart data={derived.collection} margin={{ top: 16, right: 12, bottom: 4, left: -6 }}>
                <defs>
                  <linearGradient id="financeCollectionWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => compact(v)} />
                <Tooltip
                  cursor={{ stroke: INK.axis, strokeWidth: 1 }}
                  content={<VizTooltip format={(v) => money(v)} />}
                />
                <Area
                  {...NO_ENTRY_ANIMATION}
                  type="monotone"
                  dataKey="amount"
                  name="Collected"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#financeCollectionWash)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={tr("No payments recorded in the last twelve months")} />
          )}
        </InsightCard>

        <InsightCard
          icon={FileText}
          title={tr("Fee book")}
          subtitle={tr("Invoices by status")}
          delay={180}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("invoices")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            ><UiText>{"Open"}</UiText></button>
          }
          table={{
            columns: ["Status", "Invoices", "Billed", "Outstanding"],
            rows: derived.buckets.map((b) => [b.label, b.count, Math.round(b.billed), Math.round(b.outstanding)]),
          }}
        >
          {derived.buckets.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={252}>
                <BarChart data={derived.buckets} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="26%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={76} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" invoices" />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name="Invoices" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {derived.buckets.map((b) => (
                      <Cell key={b.status} fill={b.color} />
                    ))}
                    <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-3" items={derived.buckets.map((b) => ({ label: b.label, color: b.color, value: money(b.outstanding) }))} />
              <p className="mt-2 text-[10px] font-bold text-ink-subtle"><UiText>{"Legend figures are the amount still outstanding."}</UiText></p>
            </>
          ) : (
            <EmptyChart label={tr("No invoices raised yet")} />
          )}
        </InsightCard>
      </div>

      {derived.methods.length > 0 ? (
        <InsightCard
          icon={CreditCard}
          title={tr("How families are paying")}
          subtitle={tr("Amount received by method, last twelve months")}
          delay={120}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("fee-reports")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            ><UiText>{"Reports"}</UiText></button>
          }
          table={{
            columns: ["Method", "Payments", "Amount"],
            rows: derived.methods.map((m) => [m.label, m.count, Math.round(m.amount)]),
          }}
        >
          <ResponsiveContainer width="100%" height={Math.max(180, derived.methods.length * 34 + 40)}>
            <BarChart data={derived.methods} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap="26%">
              <CartesianGrid horizontal={false} stroke={INK.grid} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => compact(v)} />
              <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={96} />
              <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip format={(v) => money(v)} />} />
              <Bar {...NO_ENTRY_ANIMATION} dataKey="amount" name="Amount" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={20}>
                <LabelList
                  dataKey="amount"
                  position="right"
                  offset={8}
                  formatter={(v: any) => money(Number(v))}
                  style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </InsightCard>
      ) : null}
    </div>
  );
}
