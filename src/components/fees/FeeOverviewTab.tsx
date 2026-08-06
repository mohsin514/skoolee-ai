"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  BookOpen,
  CreditCard,
  FileText,
  Loader2,
  Receipt,
  Shield,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, StatCard } from "@/components/role-dashboard";
import { CornerSparkles } from "@/components/CornerSparkles";
import type { FeeTab, FeeSummary, RecentPayment } from "./fee-types";
import { API, formatPKR, paymentMethodLabel } from "./fee-utils";

export function FeeOverviewTab({
  campusId,
  onNavigate,
}: {
  campusId?: string;
  onNavigate: (tab: FeeTab) => void;
}) {
  const [summary, setSummary] = useState<FeeSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API}/campus/summary${qp}`);
      const json = await res.json();
      if (json.success) setSummary(json.data);
    } catch {
      toast.error("Failed to load fee summary");
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 animate-skeleton-in">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-2xl bg-[#e8e0ec]/50 skeleton-shimmer" />
            <div className="h-5 w-32 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-[#f3f4f9]/50 p-4 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="h-3 w-16 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer mb-2" />
                <div className="h-6 w-20 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sk-rise relative overflow-hidden rounded-[32px] border border-[#cfc2d6]/25 bg-gradient-to-br from-[#fbf0fe]/35 to-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <CornerSparkles />
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm">
              <Receipt className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-black text-[#1f1a23]">Fee Dashboard</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={() => onNavigate("structures")}>
              Structures
            </BrandButton>
            <BrandButton variant="soft" icon={<FileText className="w-4 h-4" />} onClick={() => onNavigate("invoices")}>
              Invoices
            </BrandButton>
            <BrandButton variant="soft" icon={<Wallet className="w-4 h-4" />} onClick={() => onNavigate("payments")}>
              Payments
            </BrandButton>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
          <StatCard
            icon={Receipt}
            label="Total Receivable"
            value={formatPKR(summary?.totalReceivable ?? 0)}
            tone="purple"
            entranceDelay={80}
          />
          <StatCard
            icon={Banknote}
            label="Collected"
            value={formatPKR(summary?.totalCollected ?? 0)}
            tone="green"
            entranceDelay={160}
          />
          <StatCard
            icon={CreditCard}
            label="Outstanding"
            value={formatPKR(summary?.totalOutstanding ?? 0)}
            tone="rose"
            entranceDelay={240}
          />
          <StatCard
            icon={ArrowUpRight}
            label="Collection Rate"
            value={`${summary?.collectionRate ?? 0}%`}
            tone={summary && summary.collectionRate < 60 ? "rose" : "green"}
            entranceDelay={320}
          />
          <StatCard
            icon={Shield}
            label="Overdue"
            value={formatPKR(summary?.totalOverdue ?? 0)}
            tone="dark"
            entranceDelay={400}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <h4 className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 mb-3">
              Collection by Class
            </h4>
            <div className="space-y-2">
              {summary?.byClass.map((cls) => (
                <div
                  key={cls.className}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 border border-[#cfc2d6]/10"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[#1f1a23]">
                      {cls.className}
                    </p>
                    <div className="mt-1 h-2 rounded-full bg-[#f3f4f9] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#a855f7] transition-all"
                        style={{ width: `${cls.collectionRate}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-[#4d4354]/60">
                      {cls.collectionRate}%
                    </p>
                    <p className="text-[9px] font-bold text-[#4d4354]/35">
                      {formatPKR(cls.totalPaid)} / {formatPKR(cls.totalDue)}
                    </p>
                  </div>
                </div>
              ))}
              {(!summary?.byClass || summary.byClass.length === 0) && (
                <p className="text-xs font-semibold text-[#4d4354]/40 italic">
                  No fee data yet
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                At-Risk Students
              </h4>
              {summary?.atRiskStudents && summary.atRiskStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate("reports")}
                  className="text-[9px] font-black uppercase text-[#8127cf] hover:underline cursor-pointer"
                >
                  View All
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
              {summary?.atRiskStudents.map((s) => (
                <div
                  key={s.studentId}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 border border-[#cfc2d6]/10 hover:border-rose-200 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#1f1a23]">
                      {s.studentName}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                      {s.className} &middot; {s.daysOverdue}d overdue
                    </p>
                  </div>
                  <p
                    className={`text-xs font-black whitespace-nowrap ${
                      s.paymentStatus === "critical"
                        ? "text-rose-600"
                        : s.paymentStatus === "warning"
                        ? "text-amber-600"
                        : "text-[#4d4354]/60"
                    }`}
                  >
                    {formatPKR(s.totalOverdue)}
                  </p>
                </div>
              ))}
              {(!summary?.atRiskStudents ||
                summary.atRiskStudents.length === 0) && (
                <p className="text-xs font-semibold text-[#4d4354]/40 italic">
                  No at-risk students
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {summary?.recentPayments && summary.recentPayments.length > 0 && (
        <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <TrendingUp className="h-4 w-4" />
              </div>
              <h4 className="text-sm font-black text-[#1f1a23]">Recent Payments</h4>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("payments")}
              className="text-[9px] font-black uppercase text-[#8127cf] hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {summary.recentPayments.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-[#f3f4f9]/50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#1f1a23] truncate">
                    {p.studentName}
                  </p>
                  <p className="text-[9px] font-bold text-[#4d4354]/45">
                    {p.invoiceNumber} &middot; {paymentMethodLabel(p.paymentMethod)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-emerald-600">
                    {formatPKR(p.amount)}
                  </p>
                  <p className="text-[9px] font-bold text-[#4d4354]/35">
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
