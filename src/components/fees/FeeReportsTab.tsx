"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CreditCard,
  Download,
  Loader2,
  Phone,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import type {
  CollectionReport,
  DefaulterRecord,
  PaymentMethodBreakdown,
} from "./fee-types";
import {
  API,
  classLabel,
  exportCSV,
  formatPKR,
  paymentMethodLabel,
} from "./fee-utils";

type ReportTab = "defaulters" | "collection" | "methods";

export function FeeReportsTab({ campusId }: { campusId?: string }) {
  const [subTab, setSubTab] = useState<ReportTab>("defaulters");

  const TABS: { key: ReportTab; label: string; icon: typeof Users }[] = [
    { key: "defaulters", label: "Defaulters", icon: AlertTriangle },
    { key: "collection", label: "Collection", icon: BarChart3 },
    { key: "methods", label: "Payment Methods", icon: CreditCard },
  ];

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-black text-[#1f1a23]">Reports</h3>

      <div className="flex items-center gap-1 rounded-2xl bg-[#f3f4f9] p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSubTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                subTab === tab.key
                  ? "bg-white text-[#8127cf] shadow-sm"
                  : "text-[#4d4354]/50 hover:text-[#8127cf]"
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {subTab === "defaulters" && <DefaultersReport campusId={campusId} />}
      {subTab === "collection" && <CollectionSummary campusId={campusId} />}
      {subTab === "methods" && <MethodBreakdown campusId={campusId} />}
    </div>
  );
}

function DefaultersReport({ campusId }: { campusId?: string }) {
  const [defaulters, setDefaulters] = useState<DefaulterRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`${API}/reports/defaulters?${params}`);
      const json = await res.json();
      if (json.success) setDefaulters(json.data);
    } catch {
      toast.error("Failed to load defaulters");
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = () => {
    if (defaulters.length === 0) return;
    const rows = defaulters.map((d) => ({
      Student: d.studentName,
      "Roll No": d.rollNo ?? "",
      Class: classLabel(d.className, d.section),
      Guardian: d.guardianName ?? "",
      Phone: d.guardianPhone ?? "",
      Email: d.guardianEmail ?? "",
      "Total Due": d.totalDue / 100,
      "Total Paid": d.totalPaid / 100,
      "Overdue Amount": d.totalOverdue / 100,
      "Days Overdue": d.daysOverdue,
      "Overdue Invoices": d.overdueInvoices,
    }));
    exportCSV(rows, `defaulters-${new Date().toISOString().split("T")[0]}`);
  };

  if (loading) {
    return (
      <div className="rounded-[24px] border border-[#cfc2d6]/10 bg-white overflow-hidden animate-skeleton-in">
        <div className="px-5 py-3 bg-[#f3f4f9]/50">
          <div className="h-3 w-full max-w-md rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 border-t border-[#f3f4f9]">
            <div className="h-3.5 w-24 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
            <div className="h-3.5 w-20 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
            <div className="h-3.5 flex-1 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (defaulters.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No defaulters"
        description="All students are up to date on their payments."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold text-[#4d4354]/40">
          {defaulters.length} defaulter{defaulters.length !== 1 ? "s" : ""}
        </p>
        <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
          Export CSV
        </BrandButton>
      </div>

      <div className="sk-rise rounded-[24px] border border-[#cfc2d6]/25 bg-white overflow-hidden shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <div className="grid grid-cols-[1fr_120px_100px_100px_80px_80px] gap-3 px-5 py-3 bg-[#f3f4f9]/50 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
          <span>Student</span>
          <span>Guardian</span>
          <span>Overdue</span>
          <span>Total Due</span>
          <span>Days</span>
          <span>Invoices</span>
        </div>
        <div className="divide-y divide-[#f3f4f9]">
          {defaulters.map((d) => (
            <div
              key={d.studentId}
              className="grid grid-cols-[1fr_120px_100px_100px_80px_80px] gap-3 px-5 py-3 items-center hover:bg-rose-50/30 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-black text-[#1f1a23] truncate">{d.studentName}</p>
                <p className="text-[9px] font-bold text-[#4d4354]/45">
                  {d.rollNo ? `${d.rollNo} · ` : ""}{classLabel(d.className, d.section)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-[#4d4354]/60 truncate">{d.guardianName ?? "—"}</p>
                {d.guardianPhone && (
                  <p className="text-[9px] font-bold text-[#4d4354]/40 flex items-center gap-0.5">
                    <Phone className="w-2.5 h-2.5" />
                    {d.guardianPhone}
                  </p>
                )}
              </div>
              <p className="text-xs font-black text-rose-600">{formatPKR(d.totalOverdue)}</p>
              <p className="text-xs font-bold text-[#4d4354]/60">{formatPKR(d.totalDue)}</p>
              <span className={`text-[9px] font-black px-2 py-1 rounded-lg w-fit ${
                d.daysOverdue > 30 ? "bg-rose-50 text-rose-600" : d.daysOverdue > 15 ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
              }`}>
                {d.daysOverdue}d
              </span>
              <p className="text-xs font-black text-[#4d4354]/60">{d.overdueInvoices}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CollectionSummary({ campusId }: { campusId?: string }) {
  const [data, setData] = useState<CollectionReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`${API}/reports/collection?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data.byClass);
    } catch {
      toast.error("Failed to load collection report");
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = () => {
    if (data.length === 0) return;
    const rows = data.map((d) => ({
      Class: d.className,
      Students: d.totalStudents,
      "Total Due": d.totalDue / 100,
      "Total Paid": d.totalPaid / 100,
      "Total Overdue": d.totalOverdue / 100,
      "Collection Rate": `${d.collectionRate}%`,
    }));
    exportCSV(rows, `collection-${new Date().toISOString().split("T")[0]}`);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-skeleton-in">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-[#cfc2d6]/10 px-4 py-3">
              <div className="h-2.5 w-16 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer mb-2" />
              <div className="h-5 w-20 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
            </div>
          ))}
        </div>
        <div className="rounded-[24px] border border-[#cfc2d6]/10 bg-white overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 border-t border-[#f3f4f9] first:border-t-0">
              <div className="h-3.5 flex-1 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
              <div className="h-3.5 w-16 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
              <div className="h-2 w-24 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No collection data"
        description="Generate invoices and record payments to see collection reports."
      />
    );
  }

  const totals = data.reduce(
    (acc, d) => ({
      students: acc.students + d.totalStudents,
      due: acc.due + d.totalDue,
      paid: acc.paid + d.totalPaid,
      overdue: acc.overdue + d.totalOverdue,
    }),
    { students: 0, due: 0, paid: 0, overdue: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold text-[#4d4354]/40">
          {data.length} class{data.length !== 1 ? "es" : ""}
        </p>
        <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
          Export CSV
        </BrandButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-[#fbf0fe]/50 px-4 py-3 border border-[#cfc2d6]/10">
          <p className="text-[9px] font-black uppercase text-[#4d4354]/40">Total Students</p>
          <p className="text-xl font-black text-[#8127cf]">{totals.students}</p>
        </div>
        <div className="rounded-2xl bg-blue-50/50 px-4 py-3 border border-blue-100">
          <p className="text-[9px] font-black uppercase text-[#4d4354]/40">Total Due</p>
          <p className="text-xl font-black text-blue-600">{formatPKR(totals.due)}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50/50 px-4 py-3 border border-emerald-100">
          <p className="text-[9px] font-black uppercase text-[#4d4354]/40">Total Collected</p>
          <p className="text-xl font-black text-emerald-600">{formatPKR(totals.paid)}</p>
        </div>
        <div className="rounded-2xl bg-rose-50/50 px-4 py-3 border border-rose-100">
          <p className="text-[9px] font-black uppercase text-[#4d4354]/40">Total Overdue</p>
          <p className="text-xl font-black text-rose-600">{formatPKR(totals.overdue)}</p>
        </div>
      </div>

      <div className="sk-rise rounded-[24px] border border-[#cfc2d6]/25 bg-white overflow-hidden shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "80ms" }}>
        <div className="grid grid-cols-[1fr_80px_100px_100px_100px_90px] gap-3 px-5 py-3 bg-[#f3f4f9]/50 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
          <span>Class</span>
          <span>Students</span>
          <span>Total Due</span>
          <span>Collected</span>
          <span>Overdue</span>
          <span>Rate</span>
        </div>
        <div className="divide-y divide-[#f3f4f9]">
          {data.map((d) => (
            <div
              key={d.className}
              className="grid grid-cols-[1fr_80px_100px_100px_100px_90px] gap-3 px-5 py-3 items-center hover:bg-[#fbf0fe]/20 transition-colors"
            >
              <p className="text-xs font-black text-[#1f1a23]">{d.className}</p>
              <p className="text-xs font-bold text-[#4d4354]/60">{d.totalStudents}</p>
              <p className="text-xs font-bold text-[#4d4354]/60">{formatPKR(d.totalDue)}</p>
              <p className="text-xs font-black text-emerald-600">{formatPKR(d.totalPaid)}</p>
              <p className="text-xs font-black text-rose-600">{formatPKR(d.totalOverdue)}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-[#f3f4f9] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      d.collectionRate >= 80
                        ? "bg-emerald-500"
                        : d.collectionRate >= 50
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    }`}
                    style={{ width: `${d.collectionRate}%` }}
                  />
                </div>
                <span className="text-[9px] font-black text-[#4d4354]/50 w-8 text-right">
                  {d.collectionRate}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MethodBreakdown({ campusId }: { campusId?: string }) {
  const [data, setData] = useState<PaymentMethodBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`${API}/reports/collection?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data.byMethod);
    } catch {
      toast.error("Failed to load payment method data");
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 animate-skeleton-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[20px] border border-[#cfc2d6]/10 bg-white p-5 animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="h-3.5 w-20 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="h-3 w-10 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
              </div>
              <div className="h-5 w-24 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer mb-3" />
              <div className="h-2 w-full rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No payment data"
        description="Record payments to see the method breakdown."
      />
    );
  }

  const methodColors: Record<string, string> = {
    cash: "bg-emerald-500",
    bank_transfer: "bg-blue-500",
    card: "bg-purple-500",
    mobile_wallet: "bg-amber-500",
    cheque: "bg-gray-500",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map((m, i) => (
          <div
            key={m.method}
            className="sk-rise rounded-[20px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-black text-[#1f1a23]">
                {paymentMethodLabel(m.method)}
              </p>
              <span className="text-[9px] font-black uppercase text-[#4d4354]/40 px-2 py-1 rounded-lg bg-[#f3f4f9]">
                {m.count} txns
              </span>
            </div>
            <p className="text-xl font-black text-[#8127cf] mb-2">{formatPKR(m.total)}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-3 rounded-full bg-[#f3f4f9] overflow-hidden">
                <div
                  className={`h-full rounded-full ${methodColors[m.method] ?? "bg-gray-500"}`}
                  style={{ width: `${m.percentage}%` }}
                />
              </div>
              <span className="text-xs font-black text-[#4d4354]/50">{m.percentage}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
