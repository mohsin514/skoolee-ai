"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { downloadPdfFile } from "@/lib/download";
import type { ClassOption, Invoice, InvoiceStatus } from "./fee-types";
import {
  API,
  classLabel,
  exportCSV,
  formatDate,
  formatPKR,
  paymentMethodLabel,
  statusBadgeClass,
} from "./fee-utils";

const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function FeeInvoicesTab({ campusId }: { campusId?: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [detailInvoice, setDetailInvoice] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  const qp = campusId ? `campusId=${encodeURIComponent(campusId)}` : "";

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      if (statusFilter) params.set("status", statusFilter);
      if (classFilter) params.set("classId", classFilter);
      if (monthFilter) params.set("month", monthFilter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("page", String(page));
      params.set("pageSize", "20");

      const res = await fetch(`${API}/invoices?${params}`);
      const json = await res.json();
      if (json.success) {
        setInvoices(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      }
    } catch {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [campusId, statusFilter, classFilter, monthFilter, searchQuery, page]);

  const loadClasses = useCallback(async () => {
    try {
      const cqp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";
      const res = await fetch(`/api/classes${cqp}`);
      const json = await res.json();
      if (json.success) setClasses(json.data);
    } catch {}
  }, [campusId]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const handleSearch = () => {
    setPage(1);
    setSearchQuery(searchInput);
  };

  const viewDetail = async (id: string) => {
    setDetailInvoice(null);
    setShowDetail(true);
    setLoadingDetail(true);
    try {
      const res = await fetch(`${API}/invoices/${id}`);
      const json = await res.json();
      if (json.success) {
        setDetailInvoice(json.data);
      } else {
        toast.error("Failed to load invoice");
        setShowDetail(false);
      }
    } catch {
      toast.error("Failed to load invoice details");
      setShowDetail(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleStatusChange = async (id: string, status: "OVERDUE" | "CANCELLED") => {
    try {
      const res = await fetch(`${API}/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        loadInvoices();
        if (detailInvoice?.id === id) setDetailInvoice(null);
      } else {
        toast.error(json.error || "Failed to update status");
      }
    } catch {
      toast.error("Failed to update invoice");
    }
  };

  const handleExportCSV = () => {
    if (invoices.length === 0) return;
    const rows = invoices.map((inv) => ({
      "Invoice #": inv.invoiceNumber,
      Student: inv.student.fullName,
      "Roll No": inv.student.rollNo ?? "",
      Class: classLabel(inv.student.class.name, inv.student.class.section),
      "Invoice Date": formatDate(inv.invoiceDate),
      "Due Date": formatDate(inv.dueDate),
      "Total Amount": inv.totalAmount / 100,
      "Amount Paid": inv.totalAmountPaid / 100,
      "Balance Due": inv.balanceDue / 100,
      Status: inv.status,
    }));
    exportCSV(rows, `invoices-${new Date().toISOString().split("T")[0]}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-black text-[#1f1a23]">Invoices</h3>
        <div className="flex items-center gap-2">
          <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={handleExportCSV}>
            Export
          </BrandButton>
          <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowGenerate(true)}>
            Generate
          </BrandButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-2xl bg-[#f3f4f9] p-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => { setStatusFilter(s.value); setPage(1); }}
              className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                statusFilter === s.value
                  ? "bg-white text-[#8127cf] shadow-sm"
                  : "text-[#4d4354]/50 hover:text-[#8127cf]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <select
          value={classFilter}
          onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 text-[10px] font-black uppercase outline-none focus:border-[#8127cf]/30"
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{classLabel(c.name, c.section)}</option>
          ))}
        </select>

        <input
          type="month"
          value={monthFilter}
          onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] px-3 text-[10px] font-bold outline-none focus:border-[#8127cf]/30"
        />

        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search student or invoice #..."
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

      <p className="text-[9px] font-bold text-[#4d4354]/40">{total} invoice{total !== 1 ? "s" : ""}</p>

      {loading ? (
        <div className="rounded-[24px] border border-[#cfc2d6]/10 bg-white overflow-hidden animate-skeleton-in">
          <div className="grid grid-cols-[1fr_1fr_100px_100px_100px_90px_80px] gap-3 px-5 py-3 bg-[#f3f4f9]/50">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-3 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_100px_100px_100px_90px_80px] gap-3 px-5 py-3 border-t border-[#f3f4f9]" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="space-y-1.5">
                <div className="h-3.5 w-24 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="h-2.5 w-16 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3.5 w-20 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="h-2.5 w-14 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
              </div>
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-3.5 w-14 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer self-center" />
              ))}
            </div>
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description="Generate invoices or adjust your filters."
        />
      ) : (
        <>
          <div className="sk-rise rounded-[24px] border border-[#cfc2d6]/25 bg-white overflow-hidden shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="grid grid-cols-[1fr_1fr_100px_100px_100px_90px_80px] gap-3 px-5 py-3 bg-[#f3f4f9]/50 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
              <span>Student</span>
              <span>Invoice</span>
              <span>Total</span>
              <span>Paid</span>
              <span>Balance</span>
              <span>Status</span>
              <span></span>
            </div>
            <div className="divide-y divide-[#f3f4f9]">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="grid grid-cols-[1fr_1fr_100px_100px_100px_90px_80px] gap-3 px-5 py-3 items-center hover:bg-[#fbf0fe]/20 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-[#1f1a23] truncate">{inv.student.fullName}</p>
                    <p className="text-[9px] font-bold text-[#4d4354]/45">
                      {classLabel(inv.student.class.name, inv.student.class.section)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-[#1f1a23] truncate">{inv.invoiceNumber}</p>
                    <p className="text-[9px] font-bold text-[#4d4354]/45">
                      Due: {formatDate(inv.dueDate)}
                    </p>
                  </div>
                  <p className="text-xs font-black text-[#1f1a23]">{formatPKR(inv.totalAmount)}</p>
                  <p className="text-xs font-black text-emerald-600">{formatPKR(inv.totalAmountPaid)}</p>
                  <p className="text-xs font-black text-rose-600">{formatPKR(inv.balanceDue)}</p>
                  <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg w-fit ${statusBadgeClass(inv.status)}`}>
                    {inv.status}
                  </span>
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => viewDetail(inv.id)}
                      title={inv.status === "PAID" ? "View Receipt" : "View Details"}
                      className="h-7 w-7 rounded-lg bg-[#f3f4f9] flex items-center justify-center hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-colors cursor-pointer text-[#4d4354]/50"
                    >
                      {inv.status === "PAID" ? <Receipt className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                    {inv.status !== "PAID" && inv.status !== "CANCELLED" && inv.status !== "OVERDUE" && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(inv.id, "OVERDUE")}
                        title="Mark as Overdue"
                        className="h-7 w-7 rounded-lg bg-[#f3f4f9] flex items-center justify-center hover:bg-amber-50 hover:text-amber-600 transition-colors cursor-pointer text-[#4d4354]/50"
                      >
                        <AlertTriangle className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

      {showDetail && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          loading={loadingDetail}
          onClose={() => { setShowDetail(false); setDetailInvoice(null); }}
          onStatusChange={handleStatusChange}
        />
      )}

      {showGenerate && (
        <GenerateInvoicesModal
          campusId={campusId}
          classes={classes}
          onClose={() => setShowGenerate(false)}
          onGenerated={() => { setShowGenerate(false); loadInvoices(); }}
        />
      )}
    </div>
  );
}

function InvoiceDetailModal({
  invoice: inv,
  loading,
  onClose,
  onStatusChange,
}: {
  invoice: any;
  loading: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: "OVERDUE" | "CANCELLED") => void;
}) {
  const [confirmOverdue, setConfirmOverdue] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!inv?.id) return;
    setDownloadingPdf(true);
    try {
      await downloadPdfFile(`/api/fees/invoice-pdf?id=${encodeURIComponent(inv.id)}`, `invoice-${inv.invoiceNumber || "receipt"}.pdf`);
      toast.success("Invoice PDF downloaded");
    } catch (error: any) {
      toast.error(error?.message || "Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
    <ConfirmAction
      open={confirmOverdue}
      title="Mark as Overdue"
      description="Flag this invoice as overdue."
      onConfirm={() => { setConfirmOverdue(false); onStatusChange(inv.id, "OVERDUE"); }}
      onCancel={() => setConfirmOverdue(false)}
      tone="warning"
      confirmLabel="Mark Overdue"
    />
    <ConfirmAction
      open={confirmCancel}
      title="Cancel Invoice"
      description="This will cancel the invoice. This cannot be undone."
      onConfirm={() => { setConfirmCancel(false); onStatusChange(inv.id, "CANCELLED"); }}
      onCancel={() => setConfirmCancel(false)}
      tone="danger"
      confirmLabel="Cancel Invoice"
    />
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-enter" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-[32px] p-6 w-full max-w-lg shadow-2xl mx-4 max-h-[90vh] overflow-y-auto custom-scrollbar animate-modal-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-black text-[#1f1a23]">Invoice Detail</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#e8e0ec] transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading || !inv ? (
          <div className="space-y-4 py-2 animate-skeleton-in">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
              <div className="h-6 w-16 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="h-3 w-20 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                  <div className="h-3 w-24 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                </div>
              ))}
            </div>
            <div className="h-px bg-[#e8e0ec]/30" />
            <div className="h-5 w-32 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-[#1f1a23]">{inv.invoiceNumber}</p>
                <p className="text-[9px] font-bold text-[#4d4354]/45">
                  {inv.student?.fullName} · {inv.student?.class?.name}
                </p>
              </div>
              <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${statusBadgeClass(inv.status)}`}>
                {inv.status}
              </span>
            </div>

            {inv.status === "PAID" && inv.payments?.length > 0 && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                  <Receipt className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-sm font-black text-emerald-800">Fully Paid</p>
                <p className="text-[10px] font-bold text-emerald-600/70 mt-0.5">
                  Receipt: {inv.payments[0].receiptNo ?? "—"}
                </p>
              </div>
            )}

            <div className="rounded-2xl bg-[#f3f4f9]/50 p-4 space-y-2">
              <Row label="Invoice Date" value={formatDate(inv.invoiceDate)} />
              <Row label="Due Date" value={formatDate(inv.dueDate)} />
              <div className="border-t border-[#cfc2d6]/10 pt-2 mt-2" />
              <Row label="Monthly Fee" value={formatPKR(inv.monthlyFee)} />
              {inv.oneTimeFees > 0 && <Row label="One-Time Fees" value={formatPKR(inv.oneTimeFees)} />}
              <Row label="Subtotal" value={formatPKR(inv.subtotal)} />
              {inv.discountAmount > 0 && <Row label="Discount" value={`-${formatPKR(inv.discountAmount)}`} className="text-emerald-600" />}
              {inv.lateFeeAmount > 0 && <Row label="Late Fee" value={formatPKR(inv.lateFeeAmount)} className="text-rose-600" />}
              {inv.taxAmount > 0 && <Row label="Tax" value={formatPKR(inv.taxAmount)} />}
              <div className="border-t border-[#cfc2d6]/10 pt-2 mt-2" />
              <Row label="Total Amount" value={formatPKR(inv.totalAmount)} bold />
              <Row label="Amount Paid" value={formatPKR(inv.totalAmountPaid)} className="text-emerald-600" />
              <Row label="Balance Due" value={formatPKR(inv.balanceDue)} className={inv.balanceDue > 0 ? "text-rose-600" : "text-emerald-600"} bold />
            </div>

            {inv.payments && inv.payments.length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 mb-2">
                  Payment Receipts
                </p>
                <div className="space-y-2">
                  {inv.payments.map((p: any) => (
                    <div key={p.id} className="rounded-2xl bg-emerald-50/50 border border-emerald-100 px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-black text-emerald-700">{formatPKR(p.amount)}</p>
                        <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-lg">
                          {p.receiptNo ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-bold text-[#4d4354]/45">
                          {formatDate(p.paymentDate)} · {paymentMethodLabel(p.paymentMethod)}
                          {p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ""}
                        </p>
                        {p.recorder?.fullName && (
                          <p className="text-[9px] font-bold text-[#4d4354]/35">by {p.recorder.fullName}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inv.status !== "PAID" && inv.status !== "CANCELLED" && (
              <div className="flex gap-2 pt-2">
                <BrandButton variant="soft" className="flex-1" onClick={() => setConfirmOverdue(true)}>
                  <AlertTriangle className="w-4 h-4" />
                  Mark Overdue
                </BrandButton>
                <BrandButton variant="danger" className="flex-1" onClick={() => setConfirmCancel(true)}>
                  <XCircle className="w-4 h-4" />
                  Cancel
                </BrandButton>
              </div>
            )}

            {inv.status === "PAID" && (
              <BrandButton variant="soft" className="w-full h-12" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                {downloadingPdf ? "Preparing PDF..." : "Download Receipt"}
              </BrandButton>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function Row({ label, value, className, bold }: { label: string; value: string; className?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-black uppercase text-[#4d4354]/40">{label}</span>
      <span className={`text-sm ${bold ? "font-black" : "font-bold"} ${className ?? "text-[#1f1a23]"}`}>{value}</span>
    </div>
  );
}

function GenerateInvoicesModal({
  campusId,
  classes,
  onClose,
  onGenerated,
}: {
  campusId?: string;
  classes: ClassOption[];
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [generationMonth, setGenerationMonth] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [includeLateFees, setIncludeLateFees] = useState(true);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!generationMonth) { toast.error("Select a month"); return; }
    setGenerating(true);
    try {
      const res = await fetch(`${API}/generate-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationMonth,
          classId: selectedClass || undefined,
          includeLateFees,
          ...(campusId ? { campusId } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || "Invoices generated");
        onGenerated();
      } else {
        toast.error(json.error || "Generation failed");
      }
    } catch {
      toast.error("Failed to generate invoices");
    } finally {
      setGenerating(false);
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
      <div role="dialog" aria-modal="true" className="bg-white rounded-[32px] p-6 w-full max-w-md shadow-2xl mx-4 animate-modal-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-black text-[#1f1a23]">Generate Invoices</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-[#f3f4f9] flex items-center justify-center hover:bg-[#e8e0ec] transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Month</label>
            <input type="month" value={generationMonth} onChange={(e) => setGenerationMonth(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 block mb-1">Class (optional)</label>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className={inputClass}>
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{classLabel(c.name, c.section)}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeLateFees}
              onChange={(e) => setIncludeLateFees(e.target.checked)}
              className="accent-[#8127cf] w-4 h-4"
            />
            <span className="text-xs font-bold text-[#4d4354]/60">Include late fees from overdue invoices</span>
          </label>
          <BrandButton className="w-full h-12" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {generating ? "Generating..." : "Generate Invoices"}
          </BrandButton>
        </div>
      </div>
    </div>
  );
}
