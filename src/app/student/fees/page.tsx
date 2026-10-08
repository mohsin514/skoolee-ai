"use client";

import { UiText } from "@/components/locale/LocaleProvider";

import { useMemo, useState } from "react";
import { Banknote, Calendar, CheckCircle2, CreditCard, Loader2, Receipt, Wallet } from "lucide-react";
import { StatCard, StudentEmptyState } from "@/components/student/student-ui";
import { StudentPage } from "@/components/student/student-page";
import { FeesSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";


export default function FeesPage() {
  const tr = useUiText();
  const { money } = useLocaleFormat();
  const [selectedCurrency, setSelectedCurrency] = useState("");
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
        toast.error(json.error || tr("Payment not available"));
      }
    } catch {
      toast.error(tr("Could not start online payment"));
    } finally {
      setPayingId(null);
    }
  };

  const allInvoices = data?.user?.invoices ?? [];
  const currencies: string[] = [...new Set<string>(allInvoices.map((invoice: any) => invoice.currency))];
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] ?? "PKR";
  const invoices = allInvoices.filter((invoice: any) => invoice.currency === currency);
  const formatPKR = (amount: number) => money(amount, currency);

  // Invoice.totalAmountPaid / balanceDue are the columns the ledger maintains,
  // and the parent portal already reads them. Re-deriving the totals from the
  // payment rows here is what let this page drift from the parent view.
  const summary = useMemo(() => {
    if (!invoices.length) return { total: 0, paid: 0, outstanding: 0, overdue: 0, pending: 0 };
    const now = new Date();
    return {
      total: invoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0),
      paid: invoices.reduce((s: number, i: any) => s + (i.totalAmountPaid || 0), 0),
      outstanding: invoices.reduce((s: number, i: any) => s + Math.max(i.balanceDue || 0, 0), 0),
      overdue: invoices.filter((i: any) => (i.balanceDue || 0) > 0 && i.dueDate && new Date(i.dueDate) < now).length,
      pending: invoices.filter((i: any) => (i.balanceDue || 0) > 0).length,
    };
  }, [invoices]);

  if (loading && !data) return <FeesSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data || !data.user) return null;

  return (
    <StudentPage
      tone="fees"
      icon={CreditCard}
      eyebrow={<>{summary.outstanding ? `${formatPKR(summary.outstanding)} · ${tr("Outstanding")} · ${summary.overdue} ${tr("Overdue")}` : tr("All fees cleared")}</>}
      title={tr("Fees")}
      summary={tr("Invoices, payment progress, and outstanding balances.")}
    >
      <div className="space-y-3"><label className="block max-w-xs text-sm">{tr("Currency")}<select className="mt-1 w-full rounded-xl border bg-white p-2" value={currency} onChange={(event) => setSelectedCurrency(event.target.value)}>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        <div className="sk-rise grid grid-cols-2 md:grid-cols-4 gap-4" style={{ animationDelay: "40ms" }}>
          <StatCard icon={Receipt} label={tr("Total invoiced")} value={formatPKR(summary.total)} sub={`${tr("Invoices")}: ${invoices.length}`} />
          <StatCard
            icon={CheckCircle2}
            label={tr("Paid")}
            value={formatPKR(summary.paid)}
            sub={`${summary.total ? Math.round((summary.paid / summary.total) * 100) : 0}% ${tr("of total")}`}
            tone="green"
            ring={summary.total ? Math.round((summary.paid / summary.total) * 100) : 0}
          />
          <StatCard icon={Banknote} label={tr("Outstanding")} value={formatPKR(summary.outstanding)} sub={`${tr("Pending")}: ${summary.pending}`} tone="rose" />
          <StatCard icon={Calendar} label={tr("Overdue")} value={summary.overdue} sub={`${tr("overdue invoices")}: ${summary.overdue}`} tone={summary.overdue ? "amber" : "purple"} />
        </div>

        <div className="sk-rise rounded-[32px] bg-gradient-to-br from-[#8127cf] to-[#9c48ea] p-7 shadow-xl relative overflow-hidden" style={{ animationDelay: "100ms" }}>
          <div className="absolute top-0 right-0 w-56 h-56 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold text-white/60 uppercase tracking-wider"><UiText>{"Total Outstanding"}</UiText></p>
              <p className="mt-1 text-4xl font-bold tabular-nums text-white">{formatPKR(summary.outstanding)}</p>
              <p className="mt-1 text-xs font-semibold text-white/70">
                {summary.paid > 0 ? `${Math.round((summary.paid / summary.total) * 100)}% ${tr("paid")} · ${formatPKR(summary.paid)}` : tr("No payments made yet")}
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
              <h3 className="text-sm font-black tracking-tight text-[#1d1b20]"><UiText>{"Invoices"}</UiText></h3>
              <span className="text-[10px] font-semibold text-ink-subtle">{invoices.length}<UiText>{"records"}</UiText></span>
            </div>
            <div className="sk-rise grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" style={{ animationDelay: "160ms" }}>
              {invoices.map((invoice: any) => (
                <InvoiceCard key={invoice.id} invoice={invoice} paying={payingId === invoice.id} onPay={() => handlePayNow(invoice.id)} />
              ))}
            </div>
          </div>
        ) : (
          <StudentEmptyState
            icon={CreditCard}
            title={tr("No invoices yet")}
            description={tr("Fee invoices will appear here once assigned to your profile.")}
          />
        )}
      </div>
    </StudentPage>
  );
}


function InvoiceCard({ invoice, paying, onPay }: { invoice: any; paying: boolean; onPay: () => void }) {
  const tr = useUiText();
  const { money, date: formatDate } = useLocaleFormat();
  const formatPKR = (amount: number) => money(amount, invoice.currency);
  const paid = invoice.totalAmountPaid || 0;
  const balance = Math.max(invoice.balanceDue || 0, 0);
  const progress = invoice.totalAmount ? Math.round(paid / invoice.totalAmount * 100) : 0;
  const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && balance > 0;

  const statusStyle = invoice.status === "PAID" ? "border-emerald-200/60 hover:border-emerald-400/60" :
    isOverdue ? "border-rose-200/60 hover:border-rose-400/60" :
    "border-[#cfc2d6]/12 hover:border-[#8127cf]/20";

  return (
    <div className={cn(
      "sk-panel group relative transition-all duration-300 hover:-translate-y-1 overflow-hidden",
      statusStyle
    )}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#8127cf]/3 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{invoice.invoiceNumber ? `${tr("Invoice")} ${invoice.invoiceNumber}` : tr("Fee invoice")}</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">
              {invoice.dueDate ? `${tr("Due")} ${formatDate(invoice.dueDate)}` : tr("No due date")}
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
          <span className="text-2xl font-bold tabular-nums text-[#1d1b20]">{formatPKR(balance)}</span>
          <span className="text-[10px] font-semibold text-ink-subtle"><UiText>{"of"}</UiText>{invoice.totalAmount ? formatPKR(invoice.totalAmount) : "—"}</span>
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
              {invoice.status === "PAID" ? tr("Paid") : isOverdue ? tr("Overdue") : balance > 0 ? tr("Pending") : invoice.status || "Pending"}
            </span>
          </div>
          {balance > 0 && invoice.currency === "PKR" && (
            <button
              type="button"
              onClick={onPay}
              disabled={paying}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#8127cf] text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wider hover:bg-[#6a1fb0] transition-colors cursor-pointer disabled:opacity-50"
            >
              {paying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wallet className="w-3 h-3" />}
              {paying ? tr("Starting...") : tr("Pay Now")}
            </button>
          )}
          {paid > 0 && balance <= 0 && (
            <span className="text-[9px] font-semibold text-emerald-600">{formatPKR(paid)}<UiText>{"paid"}</UiText></span>
          )}
        </div>
      </div>
    </div>
  );
}

