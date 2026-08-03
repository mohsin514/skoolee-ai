"use client";

import { Banknote, Calendar, CheckCircle2, CreditCard, Receipt } from "lucide-react";
import { ParentListSkeleton, ParentEmptyState } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";

export const dynamic = "force-dynamic";

export default function ParentFeesPage() {
  const { data, loading } = useParentData();

  if (loading || !data) return <ParentListSkeleton />;
  const { fees, student } = data;

  const total = fees.reduce((sum, f) => sum + (f.totalAmount || 0), 0);
  const paid = fees.reduce((sum, f) => sum + (f.paid || 0), 0);
  const outstanding = fees.reduce((sum, f) => sum + (f.balance || 0), 0);
  const rupees = (v: number) => Math.round(v / 100).toLocaleString();

  if (fees.length === 0) {
    return (
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
        <PageHeader />
        <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9">
          <ParentEmptyState icon={Receipt} title="No fee records" description="Fee invoices will appear here when generated." />
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <PageHeader />
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniStat icon={Receipt} label="Total Invoiced" value={`Rs ${rupees(total)}`} />
          <MiniStat icon={CheckCircle2} label="Paid" value={`Rs ${rupees(paid)}`} tone="green" />
          <MiniStat icon={Banknote} label="Outstanding" value={`Rs ${rupees(outstanding)}`} tone="rose" />
          <MiniStat icon={Calendar} label="Overdue" value={fees.filter((f) => f.status === "OVERDUE" || f.status === "PARTIAL").length} tone="purple" />
        </div>

        <div className="space-y-3">
          {fees.map((fee) => (
            <FeeRow key={fee.id} fee={fee} />
          ))}
        </div>
      </div>
    </section>
  );

  function PageHeader() {
    return (
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <CreditCard className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {outstanding ? `Rs ${rupees(outstanding)} outstanding` : "All fees cleared"}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Fee Status</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">
            Invoices and payment progress for {student.fullName}.
          </p>
        </div>
      </div>
    );
  }
}

function FeeRow({ fee }: { fee: any }) {
  const statusColors: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-600",
    PENDING: "bg-amber-50 text-amber-600",
    OVERDUE: "bg-rose-50 text-rose-600",
    PARTIAL: "bg-blue-50 text-blue-600",
    CANCELLED: "bg-gray-50 text-gray-500",
  };
  const progress = fee.totalAmount ? Math.round((fee.paid / fee.totalAmount) * 100) : 0;

  return (
    <div className="group relative rounded-[24px] bg-white border border-[#cfc2d6]/10 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:border-[#8127cf]/20 overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#8127cf]/3 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{fee.invoiceNumber || "Invoice"}</p>
            <p className="text-[10px] font-semibold text-[#4d4354]/40 mt-0.5">Due: {fee.dueDate}</p>
          </div>
          <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${statusColors[fee.status] || "bg-gray-50 text-gray-500"}`}>
            {fee.status}
          </span>
        </div>
        <div className="h-2 w-full bg-[#f3f4f9] rounded-full overflow-hidden mt-4">
          <div
            className={`h-full rounded-full transition-all duration-700 ${progress >= 100 ? "bg-emerald-500" : progress > 0 ? "bg-amber-500" : "bg-rose-300"}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div>
            <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase">Total</p>
            <p className="text-sm font-black text-[#1d1b20]">Rs {Math.round(fee.totalAmount / 100).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase">Paid</p>
            <p className="text-sm font-black text-emerald-600">Rs {Math.round(fee.paid / 100).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase">Balance</p>
            <p className="text-sm font-black text-rose-600">Rs {Math.round(fee.balance / 100).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, tone = "dark" }: { icon: any; label: string; value: string | number; tone?: string }) {
  const tones: Record<string, string> = {
    dark: "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
    green: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
    rose: "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white",
    purple: "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
  };
  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider transition-colors group-hover:text-[#4d4354]/60">{label}</p>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${tones[tone] || tones.dark}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
      <p className="text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
    </div>
  );
}