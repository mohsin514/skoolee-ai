"use client";

import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { UiText } from "@/components/locale/LocaleProvider";

import { useState } from "react";
import { Banknote, Calendar, CheckCircle2, CreditCard, Loader2, Receipt, Wallet } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton, ParentEmptyState, ParentStat } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";
import { toast } from "sonner";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

export const dynamic = "force-dynamic";

export default function ParentFeesPage() {
  const tr = useUiText();
  const { money } = useLocaleFormat();
  const [selectedCurrency, setSelectedCurrency] = useState("");
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
        toast.error(json.error || tr("Payment not available"));
      }
    } catch {
      toast.error(tr("Could not start online payment"));
    } finally {
      setPayingId(null);
    }
  };

  // Without this an expired session leaves the page on a skeleton
  // forever, because `data` never arrives and `loading` is already false.
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (loading || !data) return <ParentListSkeleton />;
  const { fees: allFees, student } = data;
  const currencies = [...new Set(allFees.map((fee) => fee.currency))];
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] ?? "PKR";
  const fees = allFees.filter((fee) => fee.currency === currency);
  const formatPKR = (amount: number) => money(amount, currency);

  const total = fees.reduce((sum, f) => sum + (f.totalAmount || 0), 0);
  const paid = fees.reduce((sum, f) => sum + (f.paid || 0), 0);
  const outstanding = fees.reduce((sum, f) => sum + (f.balance || 0), 0);
  const overdueCount = fees.filter((f) => f.status === "OVERDUE" || f.status === "PARTIAL").length;
  const page = (body: React.ReactNode) => (
    <ParentPage
      tone="fees"
      icon={CreditCard}
      eyebrow={<>{outstanding ? `${formatPKR(outstanding)} · ${tr("Outstanding")}` : tr("All fees cleared")}</>}
      title={tr("Fee Status")}
      summary={`${tr("Invoices and payment progress")} · ${student.fullName}`}
    >
      {body}
    </ParentPage>
  );

  if (fees.length === 0) {
    return page(
      <ParentEmptyState icon={Receipt} title={tr("No fee records")} description={tr("Fee invoices will appear here when generated.")} />
    );
  }

  return page(
    <div className="space-y-3"><label className="block max-w-xs text-sm">{tr("Currency")}<Select aria-label={tr("Currency")} className="mt-1 w-full" value={currency} onChange={(event) => setSelectedCurrency(event.target.value)}>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}</Select></label>
        <div className="sk-rise grid grid-cols-2 gap-3 md:grid-cols-4" style={{ animationDelay: "40ms" }}>
          <ParentStat icon={Receipt} label={tr("Total Invoiced")} value={formatPKR(total)} sub={`${tr("Invoices")}: ${fees.length}`} />
          <ParentStat icon={CheckCircle2} label={tr("Paid")} value={formatPKR(paid)} sub={`${total ? Math.round((paid / total) * 100) : 0}% ${tr("of total")}`} tone="green" />
          <ParentStat icon={Banknote} label={tr("Outstanding")} value={formatPKR(outstanding)} sub={outstanding ? "Payment due" : "Nothing due"} tone="rose" />
          <ParentStat icon={Calendar} label={tr("Needs Attention")} value={overdueCount} sub="Overdue or partial" tone={overdueCount ? "amber" : "violet"} />
        </div>

        <div className="sk-rise space-y-3" style={{ animationDelay: "120ms" }}>
          {fees.map((fee) => (
            <FeeRow key={fee.id} fee={fee} paying={payingId === fee.id} onPay={() => handlePayNow(fee.id)} />
          ))}
        </div>
    </div>
  );
}

function FeeRow({ fee, paying, onPay }: { fee: any; paying: boolean; onPay: () => void }) {
  const tr = useUiText();
  const { money, date: formatDate } = useLocaleFormat();
  const formatPKR = (amount: number) => money(amount, fee.currency);
  const statusColors: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-600",
    PENDING: "bg-amber-50 text-amber-600",
    OVERDUE: "bg-rose-50 text-rose-600",
    PARTIAL: "bg-blue-50 text-blue-600",
    CANCELLED: "bg-gray-50 text-gray-500",
  };
  const progress = fee.totalAmount ? Math.round((fee.paid / fee.totalAmount) * 100) : 0;

  return (
    <div className="sk-panel group relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:shadow-[0_2px_4px_rgba(31,26,35,0.05),0_14px_28px_-14px_rgba(129,39,207,0.4)]">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#8127cf]/3 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{fee.invoiceNumber || "Invoice"}</p>
            <p className="mt-0.5 text-[10px] font-semibold text-ink-subtle"><UiText>{"Due"}</UiText>{" "}
              {fee.dueDate
                ? formatDate(fee.dueDate)
                : "—"}
            </p>
          </div>
          <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${statusColors[fee.status] || "bg-gray-50 text-gray-500"}`}>
            {tr(fee.status)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.min(progress, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${tr("Paid")}: ${Math.min(progress, 100)}%`}
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#f3f4f9]"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 ${progress >= 100 ? "bg-emerald-500" : progress > 0 ? "bg-amber-500" : "bg-rose-300"}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div>
            <p className="text-[9px] font-bold text-ink-subtle uppercase"><UiText>{"Total"}</UiText></p>
            <p className="text-sm font-black tabular-nums text-[#1d1b20]">{formatPKR(fee.totalAmount)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-ink-subtle uppercase"><UiText>{"Paid"}</UiText></p>
            <p className="text-sm font-black tabular-nums text-emerald-600">{formatPKR(fee.paid)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-ink-subtle uppercase"><UiText>{"Balance"}</UiText></p>
            <p className={`text-sm font-black tabular-nums ${fee.balance > 0 ? "text-rose-600" : "text-ink-muted"}`}>{formatPKR(fee.balance)}</p>
          </div>
        </div>
        {fee.balance > 0 && fee.currency === "PKR" && (
          <Button variant="default"
            type="button"
            onClick={onPay}
            disabled={paying}
            className="mt-4 flex w-full items-center justify-center gap-2 py-2.5"
          >
            {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            {paying ? tr("Starting SafePay...") : tr("Pay Now (SafePay)")}
          </Button>
        )}
      </div>
    </div>
  );
}
