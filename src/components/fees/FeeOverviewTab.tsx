"use client";

import { UiSentence } from "@/components/operations/console-page";

import { Button } from "@/components/ui/button";
import { UiText, useUiText, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { CurrencySelect } from "@/components/locale/CurrencySelect";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  BookOpen,
  CreditCard,
  Receipt,
  Shield,
  TrendingUp,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { checkedJson, readRequest, requestFailure, type RequestFailure } from "@/lib/http/request-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatCard } from "@/components/role-dashboard";
import { CornerSparkles } from "@/components/CornerSparkles";
import type { FeeTab, FeeSummary, RecentPayment } from "./fee-types";
import { API, formatPKR, paymentMethodLabel } from "./fee-utils";

// StatCard renders a plain string; wrap amounts in a left-to-right isolate
// (U+2066…U+2069, the text equivalent of <bdi dir="ltr">) so "PKR 1,200.00"
// never reorders into "$US 0.00" inside Arabic/Urdu layouts.
const ltrAmount = (value: string) => `\u2066${value}\u2069`;

export function FeeOverviewTab({
  campusId,
  onNavigate,
}: {
  campusId?: string;
  onNavigate?: (tab: FeeTab) => void;
}) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [currency, setCurrency] = useState("");
  const [summary, setSummary] = useState<FeeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const sequence = useRef(0);

  const qp = `?${new URLSearchParams({ ...(campusId ? { campusId } : {}), ...(currency ? { currency } : {}) })}`;

  const loadSummary = useCallback(async () => {
    const version = ++sequence.current;
    setLoading(true); setLoadFailed(null);
    try {
      const json = await checkedJson(await readRequest(`${API}/campus/summary${qp}`));
      if (version !== sequence.current) return;
      setSummary(json.data); if (!currency) setCurrency(json.data.currency);
    } catch (error) {
      if (version === sequence.current) { setSummary(null); setLoadFailed(requestFailure(error)); }
    } finally { if (version === sequence.current) setLoading(false); }
  }, [qp, currency]);

  useEffect(() => { void loadSummary(); return () => { sequence.current++; }; }, [loadSummary]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="sk-panel p-6 animate-skeleton-in">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-2xl bg-border-subtle/50 skeleton-shimmer" />
            <div className="h-5 w-32 rounded-full bg-border-subtle/50 skeleton-shimmer" />
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-muted/50 p-4 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="h-3 w-16 rounded-full bg-border-subtle/50 skeleton-shimmer mb-2" />
                <div className="h-6 w-20 rounded-full bg-border-subtle/50 skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return <ErrorState error={loadFailed} title={tr("The fee summary could not be loaded")} description={tr("Check your connection and try again.")} onRetry={loadSummary} />;
  }

  return (
    <div className="space-y-6"><CurrencySelect value={currency} onChange={setCurrency} />
      <div className="sk-rise relative overflow-hidden rounded-[32px] border border-edge/25 bg-gradient-to-br from-brand-50/35 to-card p-6 shadow-[0_4px_16px_-4px_rgba(120,70,180,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <CornerSparkles />
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary shadow-sm">
              <Receipt className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-ink-strong"><UiText>{"Fee dashboard"}</UiText></h3>
          </div>
          {/* The fee sections are tabs above this overview; repeating them here as buttons is retired (role-ux §4.5.8). */}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4 mb-6">
          <StatCard
            icon={Receipt}
            label={tr("Total receivable")}
            value={ltrAmount(formatPKR(summary?.totalReceivable ?? 0, summary?.currency))}
            tone="purple"
            entranceDelay={80}
          />
          <StatCard
            icon={Banknote}
            label={tr("Collected")}
            value={ltrAmount(formatPKR(summary?.totalCollected ?? 0, summary?.currency))}
            tone="green"
            entranceDelay={160}
          />
          <StatCard
            icon={CreditCard}
            label={tr("Outstanding")}
            value={ltrAmount(formatPKR(summary?.totalOutstanding ?? 0, summary?.currency))}
            tone="rose"
            entranceDelay={240}
          />
          <StatCard
            icon={ArrowUpRight}
            label={tr("Collection rate")}
            value={ltrAmount(`${summary?.collectionRate ?? 0}%`)}
            tone={summary && summary.collectionRate < 60 ? "rose" : "green"}
            entranceDelay={320}
          />
          <StatCard
            icon={Shield}
            label={tr("Overdue")}
            value={ltrAmount(formatPKR(summary?.totalOverdue ?? 0, summary?.currency))}
            tone="dark"
            entranceDelay={400}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-3"><UiText>{"Collection by class"}</UiText></h4>
            <div className="space-y-2">
              {summary?.byClass.map((cls) => (
                <div
                  key={cls.className}
                  className="sk-panel flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-strong">
                      {cls.className}
                    </p>
                    <Progress
                      className="mt-1"
                      value={Math.min(100, cls.collectionRate)}
                      max={100}
                      label={tr("Collection rate")}
                      size="sm"
                    />
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-xs font-bold tabular-nums text-ink-muted">
                      {cls.collectionRate}%
                    </p>
                    <p className="text-2xs font-medium tabular-nums text-ink-subtle">
                      <bdi dir="ltr">{formatPKR(cls.totalPaid, summary?.currency)} / {formatPKR(cls.totalDue, summary?.currency)}</bdi>
                    </p>
                  </div>
                </div>
              ))}
              {(!summary?.byClass || summary.byClass.length === 0) && (
                <EmptyState
                  size="sm"
                  icon={BookOpen}
                  title={tr("No fee data yet")}
                  description={tr("Class collection rates appear here once invoices are issued.")}
                />
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle"><UiText>{"At-Risk Students"}</UiText></h4>
              {onNavigate && summary?.atRiskStudents && summary.atRiskStudents.length > 0 && (
                <Button variant="link"
                  type="button"
                  onClick={() => onNavigate("reports")}
                  className="hover:underline"
                ><UiText>{"View all"}</UiText></Button>
              )}
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
              {summary?.atRiskStudents.map((s) => (
                <div
                  key={s.studentId}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 border border-edge/10 hover:border-status-error-border transition-colors"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-strong">
                      {s.studentName}
                    </p>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                      <UiSentence text="{0} · {1} days overdue" values={[s.className, s.daysOverdue]} /></p>
                  </div>
                  <p
                    className={`text-xs font-bold whitespace-nowrap ${
                      s.paymentStatus === "critical"
                        ? "text-status-error-text"
                        : s.paymentStatus === "warning"
                        ? "text-status-warning-text"
                        : "text-ink-muted"
                    }`}
                  >
                    <bdi dir="ltr">{formatPKR(s.totalOverdue, summary?.currency)}</bdi>
                  </p>
                </div>
              ))}
              {(!summary?.atRiskStudents ||
                summary.atRiskStudents.length === 0) && (
                <p className="text-xs font-medium text-ink-subtle"><UiText>{"No at-risk students"}</UiText></p>
              )}
            </div>
          </div>
        </div>
      </div>

      {summary?.recentPayments && summary.recentPayments.length > 0 && (
        <div className="sk-panel sk-rise p-6" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-status-success-surface text-status-success-text">
                <TrendingUp className="h-4 w-4" />
              </div>
              <h4 className="text-sm font-bold text-ink-strong"><UiText>{"Recent payments"}</UiText></h4>
            </div>
            {onNavigate && (
              <Button variant="link"
                type="button"
                onClick={() => onNavigate("payments")}
                className="hover:underline"
              ><UiText>{"View all"}</UiText></Button>
            )}
          </div>
          <div className="space-y-2">
            {summary.recentPayments.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-strong truncate">
                    {p.studentName}
                  </p>
                  <p className="text-2xs font-medium text-ink-subtle">
                    {p.invoiceNumber} · {tr(paymentMethodLabel(p.paymentMethod))}
                  </p>
                </div>
                <div className="text-end shrink-0">
                  <p className="text-sm font-bold tabular-nums text-status-success-text">
                    <bdi dir="ltr">{formatPKR(p.amount, summary?.currency)}</bdi>
                  </p>
                  <p className="text-2xs font-medium text-ink-subtle">
                    {p.receiptNo}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
