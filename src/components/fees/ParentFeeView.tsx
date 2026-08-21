"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Receipt, Wallet } from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";
import { CornerSparkles } from "@/components/CornerSparkles";
import { toast } from "sonner";
import { SkeletonList } from "@/components/ui/skeleton";

interface FeeData {
  studentId: string;
  studentName: string;
  class: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  nextDue: {
    invoiceId: string;
    invoiceNumber: string;
    dueDate: string;
    amount: number;
    status: string;
  } | null;
  invoiceHistory: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    amountDue: number;
    amountPaid: number;
    balance: number;
    status: string;
    payments: Array<{
      amount: number;
      fineAmount?: number;
      method: string;
      date: string;
      receiptNo: string;
    }>;
  }>;
  lateFeesAccrued: number;
  paymentStatus: string;
}

export function ParentFeeView({ studentId }: { studentId: string }) {
  const [data, setData] = useState<FeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/fees/student/${studentId}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setData(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  const handlePayNow = async (invoiceId: string) => {
    setPayingInvoiceId(invoiceId);
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
        toast.error(json.error || "Payment session failed");
      }
    } catch {
      toast.error("Failed to start online payment");
    } finally {
      setPayingInvoiceId(null);
    }
  };

  if (loading) {
    return (
      <SkeletonList rows={4} label="Loading fees" />
    );
  }

  if (!data) {
    return (
      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-ink-subtle">No fee data available</p>
      </div>
    );
  }

  const statusColor = data.paymentStatus === "good" ? "text-emerald-600 bg-emerald-50" : data.paymentStatus === "critical" ? "text-rose-600 bg-rose-50" : "text-amber-600 bg-amber-50";

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
      <CornerSparkles />
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm">
          <Receipt className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-black text-[#1f1a23]">Fee & Payments</h3>
          <p className="text-[9px] font-bold uppercase tracking-normal text-ink-subtle">{data.class}</p>
        </div>
        <span className={`ml-auto text-[9px] font-black uppercase tracking-normal px-3 py-1.5 rounded-full ${statusColor}`}>
          {data.paymentStatus === "good" ? "Good Standing" : data.paymentStatus === "critical" ? "Overdue" : "Due"}
        </span>
      </div>

      {data.nextDue && data.balance > 0 && data.nextDue.invoiceId && (
        <div className="mb-6 rounded-[24px] bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] border border-[#8127cf]/10 p-5">
          <p className="text-[9px] font-black uppercase tracking-normal text-ink-subtle">Outstanding Balance</p>
          <p className="mt-1 text-3xl font-black text-[#1f1a23]">Rs {(data.balance / 100).toLocaleString()}</p>
          <p className="mt-1 text-xs font-bold text-ink-muted">
            Due: {data.nextDue.dueDate}
            {data.nextDue.status === "OVERDUE" ? <span className="text-rose-600 ml-2">OVERDUE</span> : null}
          </p>
          <BrandButton className="mt-4 h-11 w-full" onClick={() => handlePayNow(data.nextDue!.invoiceId)} disabled={payingInvoiceId !== null}>
            {payingInvoiceId === data.nextDue.invoiceId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            {payingInvoiceId === data.nextDue.invoiceId ? "Starting SafePay..." : "Pay Now (SafePay)"}
          </BrandButton>
        </div>
      )}

      <div className="mb-6">
        <h4 className="text-[9px] font-black uppercase tracking-normal text-ink-subtle mb-3">Payment History</h4>
        <div className="space-y-2 max-h-[280px] overflow-y-auto custom-scrollbar">
          {data.invoiceHistory.map((inv, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbf0fe]/30 px-4 py-3 border border-[#cfc2d6]/10">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#1f1a23] truncate">{inv.invoiceNumber || "Invoice"}</p>
                <p className="text-[9px] font-bold text-ink-subtle">
                  {inv.invoiceDate} · Due: {inv.dueDate}
                  {inv.balance > 0 ? ` · Balance: Rs ${(inv.balance / 100).toLocaleString()}` : ""}
                </p>
                {inv.payments?.some((p) => p.fineAmount) ? (
                  <p className="text-[9px] font-bold text-rose-500">Includes late fine</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-[#1f1a23]">Rs {(inv.amountDue / 100).toLocaleString()}</p>
                <span className={`text-[9px] font-black uppercase ${inv.status === "PAID" ? "text-emerald-600" : inv.status === "OVERDUE" ? "text-rose-600" : "text-amber-600"}`}>
                  {inv.status}
                </span>
                {inv.balance > 0 && inv.id ? (
                  <button
                    type="button"
                    onClick={() => handlePayNow(inv.id)}
                    disabled={payingInvoiceId !== null}
                    className="mt-1.5 block w-full rounded-xl bg-[#8127cf] text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wider hover:bg-[#6a1fb0] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {payingInvoiceId === inv.id ? "Starting..." : "Pay"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.lateFeesAccrued > 0 && (
        <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-normal text-rose-600">Late Fees Accrued</p>
          <p className="text-lg font-black text-rose-700">Rs {(data.lateFeesAccrued / 100).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}
