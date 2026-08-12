"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Landmark,
  Loader2,
  Plus,
  Printer,
  Search,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { downloadPdfFile } from "@/lib/download";
import type { PaymentRecord } from "./fee-types";
import {
  API,
  classLabel,
  exportCSV,
  formatDate,
  formatPKR,
  paymentMethodLabel,
  statusBadgeClass,
} from "./fee-utils";

const METHODS = [
  { value: "", label: "All Methods" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "mobile_wallet", label: "Mobile Wallet" },
  { value: "cheque", label: "Cheque" },
];

export function FeePaymentsTab({ campusId }: { campusId?: string }) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [methodFilter, setMethodFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [showBankImport, setShowBankImport] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      if (methodFilter) params.set("method", methodFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (searchQuery) params.set("search", searchQuery);
      params.set("page", String(page));
      params.set("pageSize", "20");

      const res = await fetch(`${API}/payments?${params}`);
      const json = await res.json();
      if (json.success) {
        setPayments(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      }
    } catch {
      toast.error("Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [campusId, methodFilter, dateFrom, dateTo, searchQuery, page]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleSearch = () => {
    setPage(1);
    setSearchQuery(searchInput);
  };

  const handleExportCSV = () => {
    if (payments.length === 0) return;
    const rows = payments.map((p) => ({
      "Receipt #": p.receiptNo ?? "",
      Student: p.student.fullName,
      "Roll No": p.student.rollNo ?? "",
      Class: classLabel(p.student.class.name, p.student.class.section),
      "Invoice #": p.invoice.invoiceNumber,
      Amount: p.amount / 100,
      Date: formatDate(p.paymentDate),
      Method: paymentMethodLabel(p.paymentMethod),
      Reference: p.referenceNumber ?? "",
    }));
    exportCSV(rows, `payments-${new Date().toISOString().split("T")[0]}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-black text-[#1f1a23]">Payments</h3>
        <div className="flex items-center gap-2">
          <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={handleExportCSV}>
            Export
          </BrandButton>
          <BrandButton variant="soft" icon={<Upload className="w-4 h-4" />} onClick={() => setShowBankImport(true)}>
            Bank Import
          </BrandButton>
          <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowPayment(true)}>
            Record Payment
          </BrandButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={methodFilter}
          onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 text-[10px] font-black uppercase outline-none focus:border-[#8127cf]/30"
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 text-[10px] font-bold outline-none focus:border-[#8127cf]/30"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 text-[10px] font-bold outline-none focus:border-[#8127cf]/30"
          placeholder="To"
        />

        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by name, receipt #..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 text-xs font-bold outline-none focus:border-[#8127cf]/30"
          />
          <button onClick={handleSearch} className="h-9 w-9 rounded-xl bg-[#8127cf] text-white flex items-center justify-center hover:bg-[#6a1fb0] transition-colors cursor-pointer">
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="text-[9px] font-bold text-[#4d4354]/40">{total} payment{total !== 1 ? "s" : ""}</p>

      {loading ? (
        <div className="rounded-[24px] border border-[#cfc2d6]/10 bg-white overflow-hidden animate-skeleton-in">
          <div className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-3 px-5 py-3 bg-[#f3f4f9]/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-3 px-5 py-3 border-t border-[#f3f4f9]">
              <div className="space-y-1.5">
                <div className="h-3.5 w-24 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="h-2.5 w-16 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
              </div>
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-3.5 w-14 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer self-center" />
              ))}
            </div>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payments found"
          description="Record a payment or adjust your filters."
        />
      ) : (
        <>
          <div className="sk-rise rounded-[24px] border border-[#cfc2d6]/25 bg-white overflow-hidden shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-3 px-5 py-3 bg-[#f3f4f9]/50 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
              <span>Student</span>
              <span>Receipt</span>
              <span>Amount</span>
              <span>Method</span>
              <span>Date</span>
              <span>Invoice</span>
            </div>
            <div className="divide-y divide-[#f3f4f9]">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-3 px-5 py-3 items-center hover:bg-[#fbf0fe]/20 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-[#1f1a23] truncate">{p.student.fullName}</p>
                    <p className="text-[9px] font-bold text-[#4d4354]/45">
                      {classLabel(p.student.class.name, p.student.class.section)}
                    </p>
                  </div>
                  <p className="text-[10px] font-black text-[#4d4354]/70 truncate">{p.receiptNo ?? "—"}</p>
                  <p className="text-xs font-black text-emerald-600">{formatPKR(p.amount)}</p>
                  <p className="text-[10px] font-bold text-[#4d4354]/60">{paymentMethodLabel(p.paymentMethod)}</p>
                  <p className="text-[10px] font-bold text-[#4d4354]/60">{formatDate(p.paymentDate)}</p>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-[#4d4354]/70 truncate">{p.invoice.invoiceNumber}</p>
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${statusBadgeClass(p.invoice.status)}`}>
                      {p.invoice.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((pg) => Math.max(1, pg - 1))}
                disabled={page <= 1}
                className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase text-[#4d4354]/60 hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
                Prev
              </button>
              <span className="text-[9px] font-black uppercase text-[#4d4354]/50">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))}
                disabled={page >= totalPages}
                className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase text-[#4d4354]/60 hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </>
      )}

      {showPayment && (
        <PaymentModal
          campusId={campusId}
          onClose={() => setShowPayment(false)}
          onSaved={() => { setShowPayment(false); loadPayments(); }}
        />
      )}

      {showBankImport && (
        <BankImportModal
          campusId={campusId}
          onClose={() => setShowBankImport(false)}
          onImported={() => { setShowBankImport(false); loadPayments(); }}
        />
      )}
    </div>
  );
}

function PaymentModal({
  campusId,
  onClose,
  onSaved,
}: {
  campusId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [fineAmount, setFineAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [note, setNote] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"search" | "payment" | "receipt">("search");
  const [receipt, setReceipt] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!receipt?.id) return;
    setDownloadingPdf(true);
    try {
      await downloadPdfFile(`/api/fees/payment-pdf?id=${encodeURIComponent(receipt.id)}`, `receipt-${receipt.receiptNumber || "payment"}.pdf`);
      toast.success("Receipt PDF downloaded");
    } catch (error: any) {
      toast.error(error?.message || "Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const searchStudents = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setStudentsList([]);
    setInvoices([]);
    try {
      const url = campusId
        ? `/api/students?search=${encodeURIComponent(searchQuery)}&campusId=${encodeURIComponent(campusId)}`
        : `/api/students?search=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data.length > 0) {
        setStudentsList(json.data);
      } else {
        toast.error("Student not found");
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const loadStudentInvoices = async (studentId: string, student: any) => {
    setLoadingInvoices(true);
    setSelectedStudent(student);
    setStudentsList([]);
    try {
      const res = await fetch(`${API}/student/${studentId}`);
      const json = await res.json();
      if (json.success) {
        const all = json.data.invoiceHistory || [];
        const unpaid = all.filter((i: any) => i.status !== "PAID");
        setInvoices(unpaid.map((i: any) => ({ ...i, balanceDue: i.amountDue - i.amountPaid })));
        if (unpaid.length > 0) {
          setSelectedInvoiceId(unpaid[0].id);
          setAmount(String((unpaid[0].amountDue - unpaid[0].amountPaid) / 100));
          setReferenceNumber(unpaid[0].invoiceNumber || "");
        }
      }
    } catch {
      toast.error("Failed to load invoices");
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoiceId || !amount) { toast.error("Invoice and amount required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent?.id,
          invoiceId: selectedInvoiceId,
          amount: Math.round(parseFloat(amount) * 100),
          fineAmount: fineAmount ? Math.round(parseFloat(fineAmount) * 100) : undefined,
          discountAmount: discountAmount ? Math.round(parseFloat(discountAmount) * 100) : undefined,
          paymentDate,
          paymentMethod,
          referenceNumber: referenceNumber || undefined,
          note: note || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setReceipt({
          id: json.data?.paymentId || "",
          receiptNumber: json.data?.receiptNumber || "",
          studentName: json.data?.studentName || "",
          invoiceNumber: json.data?.invoiceNumber || "",
          amount: Math.round(parseFloat(amount) * 100),
          fineAmount: fineAmount ? Math.round(parseFloat(fineAmount) * 100) : 0,
          discountAmount: discountAmount ? Math.round(parseFloat(discountAmount) * 100) : 0,
          creditAmount: json.data?.credit || 0,
          paymentDate,
          paymentMethod,
          note: json.data?.note || "",
        });
        setStep("receipt");
      } else {
        toast.error(json.error || "Payment failed");
      }
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full h-11 rounded-2xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-4 text-sm font-bold outline-none focus:border-[#8127cf]/30 transition-colors";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-enter" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-[32px] p-6 w-full max-w-md shadow-2xl mx-4 max-h-[90vh] overflow-y-auto custom-scrollbar animate-modal-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-black text-[#1f1a23]">Record Payment</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#e8e0ec] transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "receipt" && receipt ? (
          <div className="space-y-5">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
                <Banknote className="h-7 w-7 text-green-600" />
              </div>
              <h3 className="text-lg font-black text-[#1f1a23]">Payment Successful</h3>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/45">Receipt #{receipt.receiptNumber}</p>
            </div>
            <div className="rounded-2xl bg-[#fbf0fe]/40 px-4 py-4 border border-[#cfc2d6]/10 space-y-3">
              <div className="flex justify-between">
                <span className="text-[9px] font-black uppercase text-[#4d4354]/40">Student</span>
                <span className="text-sm font-black text-[#1f1a23]">{receipt.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[9px] font-black uppercase text-[#4d4354]/40">Invoice</span>
                <span className="text-sm font-black text-[#1f1a23]">{receipt.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[9px] font-black uppercase text-[#4d4354]/40">Amount</span>
                <span className="text-sm font-black text-[#1f1a23]">{formatPKR(receipt.amount)}</span>
              </div>
              {receipt.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-[9px] font-black uppercase text-[#4d4354]/40">Discount</span>
                  <span className="text-sm font-black text-emerald-600">−{formatPKR(receipt.discountAmount)}</span>
                </div>
              )}
              {receipt.fineAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-[9px] font-black uppercase text-[#4d4354]/40">Fine</span>
                  <span className="text-sm font-black text-rose-600">{formatPKR(receipt.fineAmount)}</span>
                </div>
              )}
              {receipt.creditAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-[9px] font-black uppercase text-[#4d4354]/40">Carried Credit</span>
                  <span className="text-sm font-black text-[#8127cf]">{formatPKR(receipt.creditAmount)}</span>
                </div>
              )}
              {receipt.note ? (
                <div className="flex justify-between">
                  <span className="text-[9px] font-black uppercase text-[#4d4354]/40">Note</span>
                  <span className="text-sm font-bold text-[#1f1a23] text-right max-w-[60%]">{receipt.note}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-[9px] font-black uppercase text-[#4d4354]/40">Date</span>
                <span className="text-sm font-black text-[#1f1a23]">{receipt.paymentDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[9px] font-black uppercase text-[#4d4354]/40">Method</span>
                <span className="text-sm font-black text-[#1f1a23] capitalize">{paymentMethodLabel(receipt.paymentMethod)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <BrandButton variant="soft" className="flex-1 h-12" onClick={onSaved}>
                Close
              </BrandButton>
              <BrandButton className="flex-1 h-12" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                {downloadingPdf ? "Preparing PDF..." : "Download Receipt"}
              </BrandButton>
            </div>
          </div>
        ) : step === "search" ? (
          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Find Student</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchStudents()}
                  placeholder="Search by name or roll no..."
                  className="flex-1 h-11 rounded-2xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-4 text-sm font-bold outline-none focus:border-[#8127cf]/30 transition-colors"
                />
                <button onClick={searchStudents} disabled={searching} className="h-11 w-11 rounded-2xl bg-[#8127cf] text-white flex items-center justify-center hover:bg-[#6a1fb0] transition-colors cursor-pointer disabled:opacity-50">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {studentsList.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {studentsList.map((s) => (
                  <button key={s.id} onClick={() => loadStudentInvoices(s.id, s)} className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 border border-[#cfc2d6]/10 bg-[#f3f4f9]/50 hover:border-[#8127cf]/30 hover:bg-[#fbf0fe] transition-all text-left cursor-pointer">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#8127cf]/10 text-[#8127cf] text-xs font-black">
                      {s.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-[#1f1a23] truncate">{s.fullName}</p>
                      <p className="text-[9px] font-bold text-[#4d4354]/45">{s.rollNo} · {s.class?.name}{s.class?.section ? ` ${s.class.section}` : ""}</p>
                    </div>
                    <Users className="w-4 h-4 text-[#8127cf]" />
                  </button>
                ))}
              </div>
            )}
            {loadingInvoices && (
              <div className="space-y-2 py-2 animate-skeleton-in">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 rounded-2xl bg-[#f3f4f9]/50 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="space-y-1.5">
                      <div className="h-3 w-24 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                      <div className="h-2 w-16 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                    </div>
                    <div className="h-4 w-16 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                  </div>
                ))}
              </div>
            )}
            {!loadingInvoices && selectedStudent && invoices.length === 0 && (
              <div className="rounded-2xl bg-green-50 px-4 py-5 border border-green-200 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <Banknote className="h-5 w-5 text-green-600" />
                </div>
                <p className="text-sm font-black text-green-800">All Paid</p>
                <p className="text-[10px] font-semibold text-green-600/70 mt-0.5">{selectedStudent.fullName} has no pending dues</p>
                <button onClick={() => { setSelectedStudent(null); setStudentsList([]); }} className="mt-3 text-[9px] font-black uppercase text-[#8127cf] hover:underline cursor-pointer">Search Again</button>
              </div>
            )}
            {invoices.length > 0 && !loadingInvoices && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 mb-2">Select Invoice</p>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {invoices.map((inv) => (
                    <label key={inv.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 border cursor-pointer transition-colors ${selectedInvoiceId === inv.id ? "border-[#8127cf]/30 bg-[#fbf0fe]" : "border-[#cfc2d6]/10 bg-[#f3f4f9]/50 hover:border-[#8127cf]/20"}`}>
                      <input type="radio" name="invoice" value={inv.id} checked={selectedInvoiceId === inv.id} onChange={() => { setSelectedInvoiceId(inv.id); setAmount(String((inv.amountDue - inv.amountPaid) / 100)); setReferenceNumber(inv.invoiceNumber || ""); }} className="accent-[#8127cf]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-[#1f1a23]">{inv.invoiceNumber || "Invoice"}</p>
                        <p className="text-[9px] font-bold text-[#4d4354]/45">Due: {inv.dueDate} · {formatPKR(inv.amountDue)}</p>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${statusBadgeClass(inv.status)}`}>{inv.status}</span>
                    </label>
                  ))}
                  <BrandButton className="w-full" onClick={() => setStep("payment")}>Continue to Payment</BrandButton>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const sel = invoices.find((i) => i.id === selectedInvoiceId);
              return sel ? (
                <div className="rounded-2xl bg-[#fbf0fe]/40 px-4 py-3 border border-[#cfc2d6]/10">
                  <p className="text-xs font-black text-[#1f1a23]">{sel.invoiceNumber || "Invoice"}</p>
                  <p className="text-[9px] font-bold text-[#4d4354]/45">Due: {sel.dueDate} · {formatPKR(sel.amountDue)}</p>
                </div>
              ) : null;
            })()}
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Amount (PKR)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Fine (PKR)</label>
                <input type="number" min="0" value={fineAmount} onChange={(e) => setFineAmount(e.target.value)} placeholder="0" className={inputClass} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Discount (PKR)</label>
                <input type="number" min="0" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="0" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Payment Date</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="MOBILE_WALLET">Mobile Wallet</option>
                <option value="SAFEPAY">SafePay / Card</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Reference (optional)</label>
              <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Transaction ID / Cheque #" className={inputClass} />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Note (optional)</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. late fee waived" className={inputClass} />
            </div>
            <div className="flex gap-3">
              <BrandButton variant="soft" className="flex-1 h-12" onClick={() => { setStep("search"); setStudentsList([]); setInvoices([]); }}>Back</BrandButton>
              <BrandButton className="flex-[2] h-12" onClick={handleRecordPayment} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                {saving ? "Recording..." : "Save & Generate Receipt"}
              </BrandButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BankImportModal({
  campusId,
  onClose,
  onImported,
}: {
  campusId?: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [accountName, setAccountName] = useState("");
  const [statementFrom, setStatementFrom] = useState("");
  const [statementTo, setStatementTo] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleImport = async () => {
    if (!file || !accountName || !statementFrom || !statementTo) {
      toast.error("All fields required");
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("accountName", accountName);
      form.append("statementFrom", statementFrom);
      form.append("statementTo", statementTo);
      if (campusId) form.append("campusId", campusId);

      const res = await fetch(`${API}/bank-import`, { method: "POST", body: form });
      const json = await res.json();
      if (json.success) {
        toast.success(`Matched ${json.data.matched} of ${json.data.totalTransactions} transactions`);
        onImported();
      } else {
        toast.error(json.error || "Import failed");
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-enter" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-[32px] p-6 w-full max-w-md shadow-2xl mx-4 animate-modal-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-black text-[#1f1a23]">Import Bank Statement</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#e8e0ec] transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Account Name</label>
            <input type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="School Savings Account" className="w-full h-11 rounded-2xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-4 text-sm font-bold outline-none focus:border-[#8127cf]/30 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">From</label>
              <input type="date" value={statementFrom} onChange={(e) => setStatementFrom(e.target.value)} className="w-full h-11 rounded-2xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-4 text-sm font-bold outline-none focus:border-[#8127cf]/30 transition-colors" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">To</label>
              <input type="date" value={statementTo} onChange={(e) => setStatementTo(e.target.value)} className="w-full h-11 rounded-2xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-4 text-sm font-bold outline-none focus:border-[#8127cf]/30 transition-colors" />
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">CSV File</label>
            <label className="flex flex-col items-center justify-center h-28 rounded-2xl border-2 border-dashed border-[#cfc2d6]/20 bg-[#fbf0fe]/20 cursor-pointer hover:bg-[#fbf0fe]/40 hover:border-[#8127cf]/30 transition-all">
              <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
              {file ? (
                <div className="text-center">
                  <FileText className="w-6 h-6 text-[#8127cf] mx-auto mb-1" />
                  <p className="text-xs font-bold text-[#1f1a23]">{file.name}</p>
                  <p className="text-[9px] text-[#4d4354]/45">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="w-6 h-6 text-[#8127cf] mx-auto mb-1" />
                  <p className="text-xs font-bold text-[#4d4354]/60">Click to upload CSV</p>
                  <p className="text-[9px] text-[#4d4354]/40">transaction_date,amount,description</p>
                </div>
              )}
            </label>
          </div>
          <BrandButton className="w-full h-12" onClick={handleImport} disabled={importing || !file}>
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
            {importing ? "Importing..." : "Import & Auto-Match"}
          </BrandButton>
        </div>
      </div>
    </div>
  );
}
