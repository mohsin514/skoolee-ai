"use client";

/**
 * The accountant's opening screen.
 *
 * Everything here answers one of two questions: how much of what was billed
 * has actually arrived, and what is still owed. The fee book, the collection
 * curve and the defaulter count are three views of the same gap.
 */

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
        label: STATUS_LABEL[r.status] ?? r.status,
        color: STATUS_COLOR[r.status] ?? STATUS.neutral,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.outstanding - a.outstanding || b.count - a.count);

    const collection = summary.collectionByMonth.map((r) => ({
      label: monthLabel(r.month),
      amount: fromMinor(r.value),
      payments: r.count,
    }));

    const methods = summary.byMethod.map((m) => ({
      ...m,
      amount: fromMinor(m.amount),
      label: METHOD_LABEL[m.method] ?? m.method,
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
  }, [summary]);

  return (
    <div className="space-y-5">
      <CommandHero
        eyebrow={campusLabel}
        title="Finance command centre"
        heroValue={money(derived.collected)}
        heroLabel="Collected against invoices raised"
        heroCaption={
          derived.billed > 0
            ? `${money(derived.outstanding)} still outstanding across ${derived.invoices.toLocaleString()} invoices for ${summary.studentsBilled.toLocaleString()} students.`
            : "No invoices have been raised yet — generate the first run to start tracking collection."
        }
        heroAccent={<TrendingUp className="mb-2 h-7 w-7 text-emerald-400" aria-hidden />}
        meters={[
          {
            label: "Invoices settled in full",
            value: derived.buckets.find((b) => b.status === "PAID")?.count ?? 0,
            max: derived.invoices || 1,
            valueLabel: `${derived.buckets.find((b) => b.status === "PAID")?.count ?? 0} / ${derived.invoices}`,
            color: derived.rate >= 70 ? STATUS.good : STATUS.warning,
          },
          {
            label: "Amount recovered",
            value: derived.collected,
            max: derived.billed || 1,
            valueLabel: `${money(derived.collected)} / ${money(derived.billed)}`,
          },
        ]}
        pills={[
          { icon: FileText, label: "Invoices", value: derived.invoices, onClick: () => onNavigate("invoices") },
          { icon: Wallet, label: "Payments", value: summary.paymentCount, onClick: () => onNavigate("payments") },
          { icon: AlertTriangle, label: "Past due", value: summary.defaulters, onClick: () => onNavigate("fee-reports"), tone: summary.defaulters > 0 ? "critical" : "default" },
          { icon: Banknote, label: "Payroll runs", value: summary.payrollRuns, onClick: () => onNavigate("payroll") },
        ]}
        aside={
          derived.billed > 0 ? (
            <RadialGauge
              value={derived.rate}
              label="Collected"
              sublabel={`${money(derived.collected)} of ${money(derived.billed)}`}
              color={derived.rate >= 70 ? STATUS.good : derived.rate >= 40 ? STATUS.warning : STATUS.critical}
            />
          ) : (
            <div className="flex h-[148px] w-[148px] flex-col items-center justify-center text-center">
              <Receipt className="h-7 w-7 text-[#cfc2d6]" aria-hidden />
              <p className="mt-2 px-2 text-[10px] font-bold leading-tight text-ink-subtle">No invoices raised yet</p>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={Receipt} label="Collected" value={money(derived.collected)} sub={`${derived.rate}% of billed`} tone={derived.rate >= 70 ? "good" : "warning"} onClick={() => onNavigate("payments")} delay={80} />
        <StatTile icon={AlertTriangle} label="Outstanding" value={money(derived.outstanding)} sub={`${summary.defaulters} past due`} tone={derived.outstanding > 0 ? "warning" : "good"} onClick={() => onNavigate("fee-reports")} delay={140} />
        <StatTile icon={FileText} label="Invoices" value={derived.invoices} sub={`${summary.studentsBilled} students billed`} onClick={() => onNavigate("invoices")} delay={200} />
        <StatTile icon={Wallet} label="Payments" value={summary.paymentCount} sub="Last twelve months" onClick={() => onNavigate("payments")} delay={260} />
        <StatTile icon={Banknote} label="Payroll" value={summary.payrollRuns} sub="Runs recorded" onClick={() => onNavigate("payroll")} delay={320} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title="Collection by month"
          subtitle="Payments received over the last year"
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
            <EmptyChart label="No payments recorded in the last twelve months" />
          )}
        </InsightCard>

        <InsightCard
          icon={FileText}
          title="Fee book"
          subtitle="Invoices by status"
          delay={180}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("invoices")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Open
            </button>
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
              <p className="mt-2 text-[10px] font-bold text-ink-subtle">Legend figures are the amount still outstanding.</p>
            </>
          ) : (
            <EmptyChart label="No invoices raised yet" />
          )}
        </InsightCard>
      </div>

      {derived.methods.length > 0 ? (
        <InsightCard
          icon={CreditCard}
          title="How families are paying"
          subtitle="Amount received by method, last twelve months"
          delay={120}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("fee-reports")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Reports
            </button>
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
