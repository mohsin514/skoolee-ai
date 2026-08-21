"use client";

import { useState } from "react";
import { Banknote, Calendar, CheckCircle2, CreditCard, Loader2, Receipt, Wallet } from "lucide-react";
import { ParentErrorState, ParentListSkeleton, ParentEmptyState } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";
import { toast } from "sonner";

export const dynamic = "force-dynamic";

export default function ParentFeesPage() {
  const { data, loading, error, refetch } = useParentData();
  const [payingId, setPayingId] = useState<string | null>(null);

  const handlePayNow = async (invoiceId: string) => {
    setPayingId(invoiceId);
    try {
      const res = await fetch("/api/fees/pay-online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const json = await res.json();
      if (json.success && json.url) {
        window.location.href = json.url;
      } else {
        toast.error(json.error || "Payment not available");
      }
    } catch {
      toast.error("Could not start online payment");
    } finally {
      setPayingId(null);
    }
  };

  // Without this an expired session leaves the page on a skeleton
  // forever, because `data` never arrives and `loading` is already false.
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
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
        <div className="sk-rise grid grid-cols-2 md:grid-cols-4 gap-4" style={{ animationDelay: "40ms" }}>
          <MiniStat icon={Receipt} label="Total Invoiced" value={`Rs ${rupees(total)}`} />
          <MiniStat icon={CheckCircle2} label="Paid" value={`Rs ${rupees(paid)}`} tone="green" />
          <MiniStat icon={Banknote} label="Outstanding" value={`Rs ${rupees(outstanding)}`} tone="rose" />
          <MiniStat icon={Calendar} label="Overdue" value={fees.filter((f) => f.status === "OVERDUE" || f.status === "PARTIAL").length} tone="purple" />
        </div>

        <div className="sk-rise space-y-3" style={{ animationDelay: "120ms" }}>
          {fees.map((fee) => (
            <FeeRow key={fee.id} fee={fee} paying={payingId === fee.id} onPay={() => handlePayNow(fee.id)} />
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
          <p className="mt-1 text-sm font-semibold text-ink-muted">
            Invoices and payment progress for {student.fullName}.
          </p>
        </div>
      </div>
    );
  }
}

function FeeRow({ fee, paying, onPay }: { fee: any; paying: boolean; onPay: () => void }) {
  const statusColors: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-600",
    PENDING: "bg-amber-50 text-amber-600",
    OVERDUE: "bg-rose-50 text-rose-600",
    PARTIAL: "bg-blue-50 text-blue-600",
    CANCELLED: "bg-gray-50 text-gray-500",
  };
  const progress = fee.totalAmount ? Math.round((fee.paid / fee.totalAmount) * 100) : 0;

  return (
    <div className="group relative rounded-[24px] bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25 overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#8127cf]/3 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{fee.invoiceNumber || "Invoice"}</p>
            <p className="text-[10px] font-semibold text-ink-subtle mt-0.5">Due: {fee.dueDate}</p>
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
            <p className="text-[9px] font-bold text-ink-subtle uppercase">Total</p>
            <p className="text-sm font-black text-[#1d1b20]">Rs {Math.round(fee.totalAmount / 100).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-ink-subtle uppercase">Paid</p>
            <p className="text-sm font-black text-emerald-600">Rs {Math.round(fee.paid / 100).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-ink-subtle uppercase">Balance</p>
            <p className="text-sm font-black text-rose-600">Rs {Math.round(fee.balance / 100).toLocaleString()}</p>
          </div>
        </div>
        {fee.balance > 0 && (
          <button
            type="button"
            onClick={onPay}
            disabled={paying}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#8127cf] text-white py-2.5 text-[10px] font-black uppercase tracking-wider hover:bg-[#6a1fb0] transition-colors cursor-pointer disabled:opacity-50"
          >
            {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            {paying ? "Starting SafePay..." : "Pay Now (SafePay)"}
          </button>
        )}
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
  const iconGlows: Record<string, string> = {
    dark: "bg-[#8127cf]/18",
    green: "bg-emerald-500/18",
    rose: "bg-rose-500/18",
    purple: "bg-[#8127cf]/18",
  };
  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25">
      <div className="relative flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-ink-subtle uppercase tracking-wider transition-colors group-hover:text-ink-muted">{label}</p>
        <div className="relative">
          <div className={`absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${iconGlows[tone] || iconGlows.dark}`} />
          <div className={`relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${tones[tone] || tones.dark}`}>
            <Icon className="w-[18px] h-[18px]" />
          </div>
        </div>
      </div>
      <p className="text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
    </div>
  );
}