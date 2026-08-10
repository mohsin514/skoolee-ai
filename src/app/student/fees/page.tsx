"use client";

import { useMemo, useState } from "react";
import { Banknote, Calendar, CheckCircle2, CreditCard, Loader2, Receipt, Wallet } from "lucide-react";
import { FeesSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";
import { toast } from "sonner";

const dummyInvoices = [
  { id: "dummy-1", term: "Term 1 Tuition Fee", totalAmount: 45000, status: "PARTIAL", dueDate: "2026-04-15", payments: [{ amountPaid: 25000 }] },
  { id: "dummy-2", term: "Annual Admission Fee", totalAmount: 12000, status: "PAID", dueDate: "2026-03-01", payments: [{ amountPaid: 12000 }] },
  { id: "dummy-3", term: "Transport Charges (Q1)", totalAmount: 8000, status: "PARTIAL", dueDate: "2026-05-01", payments: [{ amountPaid: 3000 }] },
  { id: "dummy-4", term: "Lab & Activity Fee", totalAmount: 5500, status: "PENDING", dueDate: "2026-06-01", payments: [] },
  { id: "dummy-5", term: "Term 2 Tuition Fee", totalAmount: 45000, status: "UNPAID", dueDate: "2026-07-15", payments: [] },
];

export default function FeesPage() {
  const { data, loading, error, refetch } = useStudentData();
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

  const { invoices, balanceDue } = useMemo(() => {
    const hasRealInvoices = data?.user?.invoices?.length > 0;
    const invs = hasRealInvoices ? data.user.invoices : dummyInvoices;
    const bal = hasRealInvoices
      ? data.user.balanceDue
      : dummyInvoices.reduce((sum, inv) => {
          const paid = inv.payments.reduce((p, pm) => p + pm.amountPaid, 0);
          return sum + Math.max(inv.totalAmount - paid, 0);
        }, 0);
    return { invoices: invs, balanceDue: bal };
  }, [data]);

  const useDummy = data && !data.user?.invoices?.length;

  const summary = useMemo(() => {
    if (!invoices.length) return { total: 0, paid: 0, outstanding: 0, overdue: 0, pending: 0 };
    const now = new Date();
    return {
      total: invoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0),
      paid: invoices.reduce((s: number, i: any) => s + (i.payments?.reduce((p: number, pm: any) => p + pm.amountPaid, 0) || 0), 0),
      outstanding: invoices.reduce((s: number, i: any) => {
        const paid = i.payments?.reduce((p: number, pm: any) => p + pm.amountPaid, 0) || 0;
        return s + Math.max((i.totalAmount || 0) - paid, 0);
      }, 0),
      overdue: invoices.filter((i: any) => {
        const paid = i.payments?.reduce((p: number, pm: any) => p + pm.amountPaid, 0) || 0;
        return paid < (i.totalAmount || 0) && i.dueDate && new Date(i.dueDate) < now;
      }).length,
      pending: invoices.filter((i: any) => {
        const paid = i.payments?.reduce((p: number, pm: any) => p + pm.amountPaid, 0) || 0;
        return paid < (i.totalAmount || 0);
      }).length,
    };
  }, [invoices]);

  if (loading && !data) return <FeesSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data || !data.user) return null;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <CreditCard className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {summary.outstanding ? `Rs ${summary.outstanding.toLocaleString()} outstanding · ${summary.overdue} overdue` : "All fees cleared"}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Fee Tokens</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">Invoices, payment progress, and outstanding balances.</p>
          {useDummy && (
            <p className="mt-1 text-[10px] font-semibold text-amber-600 italic">Showing sample data</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="sk-rise grid grid-cols-2 md:grid-cols-4 gap-4" style={{ animationDelay: "40ms" }}>
          <SummaryStat icon={Receipt} label="Total Invoiced" value={`Rs ${summary.total.toLocaleString()}`} sub={`${invoices.length} invoice${invoices.length > 1 ? "s" : ""}`} />
          <SummaryStat icon={CheckCircle2} label="Paid" value={`Rs ${summary.paid.toLocaleString()}`} sub={`${summary.total ? Math.round(summary.paid / summary.total * 100) : 0}% of total`} tone="green" />
          <SummaryStat icon={Banknote} label="Outstanding" value={`Rs ${summary.outstanding.toLocaleString()}`} sub={`${summary.pending} invoice${summary.pending > 1 ? "s" : ""} pending`} tone="rose" />
          <SummaryStat icon={Calendar} label="Overdue" value={summary.overdue} sub={summary.overdue === 1 ? "1 overdue invoice" : `${summary.overdue} overdue invoices`} tone="purple" />
        </div>

        <div className="sk-rise rounded-[32px] bg-gradient-to-br from-[#8127cf] to-[#9c48ea] p-7 shadow-xl relative overflow-hidden" style={{ animationDelay: "100ms" }}>
          <div className="absolute top-0 right-0 w-56 h-56 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold text-white/60 uppercase tracking-wider">Total Outstanding</p>
              <p className="text-4xl font-bold text-white mt-1">Rs {summary.outstanding.toLocaleString()}</p>
              <p className="mt-1 text-xs font-semibold text-white/70">
                {summary.paid > 0 ? `${Math.round(summary.paid / summary.total * 100)}% paid · Rs ${summary.paid.toLocaleString()} cleared` : "No payments made yet"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border-2 border-white/20">
                <span className="text-2xl font-bold text-white">{summary.total ? Math.round(summary.paid / summary.total * 100) : 0}%</span>
              </div>
            </div>
          </div>
          {summary.total > 0 && (
            <div className="relative mt-5 h-2.5 w-full bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-700"
                style={{ width: `${Math.min(Math.round(summary.paid / summary.total * 100), 100)}%` }}
              />
            </div>
          )}
        </div>

        {invoices.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Invoices</h3>
              <span className="text-[10px] font-semibold text-[#4d4354]/40">{invoices.length} records</span>
            </div>
            <div className="sk-rise grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" style={{ animationDelay: "160ms" }}>
              {invoices.map((invoice: any) => (
                <InvoiceCard key={invoice.id} invoice={invoice} paying={payingId === invoice.id} onPay={() => handlePayNow(invoice.id)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CreditCard className="w-12 h-12 text-[#4d4354]/20 mb-4" />
            <p className="text-lg font-bold text-[#1d1b20] tracking-tight">No invoices yet</p>
            <p className="mt-1 text-sm font-semibold text-[#4d4354]/55">Fee invoices will appear here once assigned to your profile.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryStat({ icon: Icon, label, value, sub, tone = "dark" }: { icon: any; label: string; value: string | number; sub: string; tone?: string }) {
  const iconGlows: Record<string, string> = {
    green: "bg-emerald-500/18",
    rose: "bg-rose-500/18",
    purple: "bg-[#8127cf]/18",
    dark: "bg-[#8127cf]/18",
  };
  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25">
      <div className="relative flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider transition-colors group-hover:text-[#4d4354]/60">{label}</p>
        <div className="relative">
          <div className={`absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${iconGlows[tone] || iconGlows.dark}`} />
          <div className={cn(
            "relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg",
            tone === "green" ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white" :
            tone === "rose" ? "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white" :
            tone === "purple" ? "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white" :
            "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white"
          )}>
            <Icon className="w-[18px] h-[18px]" />
          </div>
        </div>
      </div>
      <p className="text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-[#4d4354]/40">{sub}</p>
    </div>
  );
}

function InvoiceCard({ invoice, paying, onPay }: { invoice: any; paying: boolean; onPay: () => void }) {
  const paid = invoice.payments?.reduce((sum: number, payment: any) => sum + payment.amountPaid, 0) || 0;
  const balance = Math.max((invoice.totalAmount || 0) - paid, 0);
  const progress = invoice.totalAmount ? Math.round(paid / invoice.totalAmount * 100) : 0;
  const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && balance > 0;

  const statusStyle = invoice.status === "PAID" ? "border-emerald-200/60 hover:border-emerald-400/60" :
    isOverdue ? "border-rose-200/60 hover:border-rose-400/60" :
    "border-[#cfc2d6]/12 hover:border-[#8127cf]/20";

  return (
    <div className={cn(
      "group relative rounded-[24px] bg-white border shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] overflow-hidden",
      statusStyle
    )}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#8127cf]/3 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{invoice.term || "Fee invoice"}</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#4d4354]/45">
              {invoice.dueDate ? `Due ${formatDate(invoice.dueDate)}` : "No due date"}
            </p>
          </div>
          <div className="relative">
            <div className={cn(
              "absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500",
              invoice.status === "PAID" ? "bg-emerald-500/18" :
              isOverdue ? "bg-rose-500/18" :
              balance > 0 ? "bg-amber-500/18" :
              "bg-[#8127cf]/18"
            )} />
            <div className={cn(
              "relative h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0",
              invoice.status === "PAID" ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white" :
              isOverdue ? "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white" :
              balance > 0 ? "bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white" :
              "bg-[#fbf0fe] text-[#8127cf]"
            )}>
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="flex items-baseline gap-1.5 mb-3">
          <span className="text-2xl font-bold text-[#1d1b20]">Rs {balance.toLocaleString()}</span>
          <span className="text-[10px] font-semibold text-[#4d4354]/40">of Rs {invoice.totalAmount?.toLocaleString() || "—"}</span>
        </div>

        <div className="h-2 w-full bg-[#f3f4f9] rounded-full overflow-hidden mb-3">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              progress >= 100 ? "bg-emerald-500" : progress > 0 ? "bg-amber-500" : "bg-rose-300"
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-wider border transition-all",
              invoice.status === "PAID" ? "bg-emerald-50 text-emerald-600 border-emerald-200/50 group-hover:bg-emerald-100" :
              isOverdue ? "bg-rose-50 text-rose-600 border-rose-200/50 group-hover:bg-rose-100" :
              balance > 0 ? "bg-amber-50 text-amber-600 border-amber-200/50 group-hover:bg-amber-100" :
              "bg-[#fbf0fe] text-[#8127cf] border-[#cfc2d6]/20"
            )}>
              {invoice.status === "PAID" ? "Paid" : isOverdue ? "Overdue" : balance > 0 ? `Pending` : invoice.status || "Pending"}
            </span>
          </div>
          {balance > 0 && (
            <button
              type="button"
              onClick={onPay}
              disabled={paying}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#8127cf] text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wider hover:bg-[#6a1fb0] transition-colors cursor-pointer disabled:opacity-50"
            >
              {paying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wallet className="w-3 h-3" />}
              {paying ? "Starting..." : "Pay Now"}
            </button>
          )}
          {paid > 0 && balance <= 0 && (
            <span className="text-[9px] font-semibold text-emerald-600">Rs {paid.toLocaleString()} paid</span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
