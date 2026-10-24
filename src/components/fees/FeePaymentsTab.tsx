"use client";

import { ReconciliationsPanel } from "./reconciliations-panel";
import { AdjustmentsQueue } from "./adjustments-panel";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { getFinancialLocale } from "@/app/actions/locale";
import { CURRENCIES } from "@/lib/locale/package";
import { UiText, useUiText, useLocaleFormat, useLocale } from "@/components/locale/LocaleProvider";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Landmark,
  Plus,
  Printer,
  Search,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { downloadPdfFile } from "@/lib/download";
import type { PanelCommand, PaymentRecord } from "./fee-types";
import { ErrorState } from "@/components/ui/error-state";
import {
  API,
  classLabel,
  exportCSV,
  formatDate,
  formatPKR,
  paisaToRupees,
  rupeesToPaisa,
  paymentMethodLabel,
  usePanelCommand,
} from "./fee-utils";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";

function invoiceStatusVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "PAID": return "success";
    case "PARTIAL": return "warning";
    case "PENDING": return "info";
    case "OVERDUE": return "danger";
    default: return "neutral";
  }
}

const METHODS = [
  { value: "", label: "All methods" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "mobile_wallet", label: "Mobile Wallet" },
  { value: "cheque", label: "Cheque" },
];

export type PaymentsSection = "payments" | "bank-import" | "reconciliation";

/**
 * Collect: payments, receipts, bank statement import and reconciliation (role-ux §3.1 accountant · payments).
 * `section` shows one of the three (the accountant's in-view tabs); without it everything shows on one page
 * (FeesPanel). `hideHeader` hands the title and actions to the console's PageHeader; `command` runs
 * "record-payment", "bank-import" or "export" from there.
 */
export function FeePaymentsTab({ campusId, command, hideHeader = false, section }: { campusId?: string; command?: PanelCommand | null; hideHeader?: boolean; section?: PaymentsSection }) {
  const [reconciliationVersion, setReconciliationVersion] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const show = (part: PaymentsSection) => !section || section === part;
 const { date: formatDate, money: formatPKR } = useLocaleFormat();
  // Amounts before an invoice is chosen are in the campus currency (locale package, R7).
  const { currency: campusCurrency } = useLocale();
  const tr = useUiText();
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
    setLoadFailed(false);
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
      } else {
        setLoadFailed(true);
      }
    } catch {
      // Shown in place with a retry (role-ux R4), never a toast.
      setLoadFailed(true);
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
    if (payments.length === 0) { toast.info(tr("Nothing to export yet.")); return; }
    const rows = payments.map((p) => ({
      "Receipt #": p.receiptNo ?? "",
      Student: p.student.fullName,
      "Roll No": p.student.rollNo ?? "",
      Class: classLabel(p.student.class.name, p.student.class.section),
      "Invoice #": p.invoice.invoiceNumber,
      Currency: p.invoice.currency,
      Amount: paisaToRupees(p.amount, p.invoice.currency),
      Date: formatDate(p.paymentDate),
      Method: paymentMethodLabel(p.paymentMethod),
      Reference: p.referenceNumber ?? "",
    }));
    exportCSV(rows, `payments-${new Date().toISOString().split("T")[0]}`);
  };

  // "Record payment" may arrive with a view change (Today → Collect), so it runs at once; an export waits for
  // the list it exports.
  usePanelCommand(command, {
    "record-payment": () => setShowPayment(true),
    "bank-import": () => setShowBankImport(true),
  });
  usePanelCommand(command, { export: handleExportCSV }, !loading);

  return (
    <div className="space-y-5">
      {hideHeader ? null : (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-bold text-ink-strong"><UiText>{"Payments"}</UiText></h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExportCSV}><Download className="size-4" aria-hidden="true" /><UiText>{"Export"}</UiText></Button>
            <Button variant="outline" onClick={() => setShowBankImport(true)}><Upload className="size-4" aria-hidden="true" /><UiText>{"Import bank statement"}</UiText></Button>
            <Button onClick={() => setShowPayment(true)}><Plus className="size-4" aria-hidden="true" /><UiText>{"Record payment"}</UiText></Button>
          </div>
        </div>
      )}

      {show("bank-import") && section === "bank-import" ? (
        <div className="sk-panel">
          <EmptyState
            icon={Landmark}
            title={tr("Import a bank statement")}
            description={tr("Upload the CSV your bank provides. Every row is validated and reviewed before anything is saved, and only exact invoice references match automatically.")}
            action={<Button onClick={() => setShowBankImport(true)}><Upload className="size-4" aria-hidden="true" />{tr("Import bank statement")}</Button>}
          />
        </div>
      ) : null}

      {show("payments") ? <>
      <div className="flex flex-wrap items-center gap-2">
        <SystemSelect
          value={methodFilter}
          onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}
          className=""
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>{tr(m.label)}</option>
          ))}
        </SystemSelect>

        <SystemInput
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className=""
          placeholder={tr("From")}
        />
        <SystemInput
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className=""
          placeholder={tr("To")}
        />

        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <SystemInput
            type="text"
            placeholder={tr("Search by name, receipt #...")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <IconButton label={tr("Search")} variant="default" onClick={handleSearch}>
            <Search className="w-3.5 h-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <p className="text-2xs font-bold text-ink-subtle">{tr(total === 1 ? "{0} payment" : "{0} payments", [total])}</p>

      {loading ? (
        <div className="sk-panel overflow-hidden animate-skeleton-in" role="status" aria-label={tr("Loading payments")}>
          <div className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-3 px-5 py-3 bg-muted/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 rounded-full bg-border-subtle/40 skeleton-shimmer" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-3 px-5 py-3 border-t border-muted">
              <div className="space-y-1.5">
                <div className="h-3.5 w-24 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                <div className="h-2.5 w-16 rounded-full bg-border-subtle/30 skeleton-shimmer" />
              </div>
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-3.5 w-14 rounded-full bg-border-subtle/40 skeleton-shimmer self-center" />
              ))}
            </div>
          ))}
        </div>
      ) : loadFailed ? (
        <ErrorState
          title={tr("Payments could not be loaded")}
          description={tr("Check your connection and try again.")}
          onRetry={() => void loadPayments()}
        />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={tr("No payments found")}
          description={tr("Record a payment or adjust your filters.")}
          action={<Button onClick={() => setShowPayment(true)}><Plus className="size-4" aria-hidden="true" />{tr("Record payment")}</Button>}
        />
      ) : (
        <>
          <div className="sk-panel sk-rise overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-3 px-5 py-3 bg-muted/50 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
              <span><UiText>{"Student"}</UiText></span>
              <span><UiText>{"Receipt"}</UiText></span>
              <span><UiText>{"Amount"}</UiText></span>
              <span><UiText>{"Method"}</UiText></span>
              <span><UiText>{"Date"}</UiText></span>
              <span><UiText>{"Invoice"}</UiText></span>
            </div>
            <div className="divide-y divide-muted">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-3 px-5 py-3 items-center hover:bg-brand-50/20 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink-strong truncate">{p.student.fullName}</p>
                    <p className="text-2xs font-medium text-ink-subtle">
                      {classLabel(p.student.class.name, p.student.class.section)}
                    </p>
                  </div>
                  <p className="text-2xs font-bold text-ink truncate">{p.receiptNo ?? "—"}</p>
                  <p className="text-xs font-bold tabular-nums text-status-success-text">{formatPKR(p.amount, p.invoice.currency)}</p>
                  <p className="text-2xs font-medium text-ink-subtle">{tr(paymentMethodLabel(p.paymentMethod))}</p>
                  <p className="text-2xs font-medium tabular-nums text-ink-subtle">{formatDate(p.paymentDate)}</p>
                  <div className="min-w-0">
                    <p className="text-2xs font-bold text-ink truncate">{p.invoice.invoiceNumber}</p>
                    <Badge variant={invoiceStatusVariant(p.invoice.status)} size="sm" dot>
                      {tr(p.invoice.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary"
                type="button"
                onClick={() => setPage((pg) => Math.max(1, pg - 1))}
                disabled={page <= 1}
                className="justify-start flex items-center gap-1 px-3"
              >
                <ChevronLeft className="w-3 h-3" /><UiText>{"Prev"}</UiText></Button>
              <span className="text-2xs font-semibold tabular-nums text-ink-muted">{tr("Page {0} of {1}", [page, totalPages])}
              </span>
              <Button variant="secondary"
                type="button"
                onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))}
                disabled={page >= totalPages}
                className="justify-start flex items-center gap-1 px-3"
              ><UiText>{"Next"}</UiText><ChevronRight className="w-3 h-3" />
              </Button>
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

      <div className="mt-6"><AdjustmentsQueue version={reconciliationVersion} /></div>
      </> : null}
      {show("reconciliation") ? <div className={section ? undefined : "mt-6"}><ReconciliationsPanel campusId={campusId} version={reconciliationVersion} onPosted={() => void loadPayments()} showEmpty={section === "reconciliation"} /></div> : null}

      {showBankImport && (
        <BankImportModal
          campusId={campusId}
          onClose={() => { setShowBankImport(false); setReconciliationVersion((v) => v + 1); }}
          onImported={() => { loadPayments(); setReconciliationVersion((v) => v + 1); }}
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
  const { money: formatPKR } = useLocaleFormat();
  const { currency: campusCurrency } = useLocale();
  const tr = useUiText();
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
  // A failed invoice load is shown in place with a retry, never as "no pending dues" (R4).
  const [invoicesFailed, setInvoicesFailed] = useState(false);
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
      toast.success(tr("Receipt PDF downloaded"));
    } catch (error: any) {
      toast.error(tr(error?.message || "Failed to download PDF"));
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
        toast.error(tr("Student not found"));
      }
    } catch {
      toast.error(tr("Search failed"));
    } finally {
      setSearching(false);
    }
  };

  const loadStudentInvoices = async (studentId: string, student: any) => {
    setLoadingInvoices(true);
    setInvoicesFailed(false);
    setInvoices([]);
    setSelectedStudent(student);
    setStudentsList([]);
    try {
      const res = await fetch(`${API}/student/${studentId}`);
      const json = await res.json();
      if (!json.success) setInvoicesFailed(true);
      else {
        const all = json.data.invoiceHistory || [];
        const unpaid = all.filter((i: any) => i.status !== "PAID");
        setInvoices(unpaid.map((i: any) => ({ ...i, balanceDue: i.amountDue - i.amountPaid })));
        if (unpaid.length > 0) {
          setSelectedInvoiceId(unpaid[0].id);
          setAmount(String(paisaToRupees(unpaid[0].amountDue - unpaid[0].amountPaid, unpaid[0].currency)));
          setReferenceNumber(unpaid[0].invoiceNumber || "");
        }
      }
    } catch {
      setInvoicesFailed(true);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const currency = invoices.find((invoice) => invoice.id === selectedInvoiceId)?.currency || campusCurrency;
  const collectKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const handleRecordPayment = async () => {
    if (!selectedInvoiceId || !amount) { toast.error(tr("Invoice and amount required")); return; }
    setSaving(true);
    try {
      const payload = {
        studentId: selectedStudent?.id,
        invoiceId: selectedInvoiceId,
        amount: rupeesToPaisa(amount, currency),
        fineAmount: fineAmount ? rupeesToPaisa(fineAmount, currency) : undefined,
        discountAmount: discountAmount ? rupeesToPaisa(discountAmount, currency) : undefined,
        paymentDate,
        paymentMethod,
        referenceNumber: referenceNumber || undefined,
        note: note || undefined,
      };
      // SKO-475: the same payment keeps its operation key across retries (a lost response replays the
      // original receipt); any change to the payment starts a new key.
      const fingerprint = JSON.stringify(payload);
      if (collectKey.current?.fingerprint !== fingerprint) collectKey.current = { fingerprint, key: crypto.randomUUID() };
      const res = await fetch(`${API}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey: collectKey.current.key }),
      });
      const json = await res.json();
      if (json.success) {
        setReceipt({
          currency,
          id: json.data?.paymentId || "",
          receiptNumber: json.data?.receiptNumber || "",
          studentName: json.data?.studentName || "",
          invoiceNumber: json.data?.invoiceNumber || "",
          amount: rupeesToPaisa(amount, currency),
          fineAmount: fineAmount ? rupeesToPaisa(fineAmount, currency) : 0,
          discountAmount: discountAmount ? rupeesToPaisa(discountAmount, currency) : 0,
          creditAmount: json.data?.credit || 0,
          paymentDate,
          paymentMethod,
          note: json.data?.note || "",
        });
        if (json.data?.replayed) toast.info(tr("This payment was already recorded; no duplicate was posted."));
        collectKey.current = null;
        setOutcomeUnknown(false);
        setStep("receipt");
      } else if (res.status >= 500) {
        setOutcomeUnknown(true);
      } else {
        // The server answered and nothing was recorded: the entered values stay for correction.
        setOutcomeUnknown(false);
        toast.error(tr(json.error || "Payment failed"));
      }
    } catch {
      // No answer: the payment may or may not have been saved. Retrying with the same key is safe.
      setOutcomeUnknown(true);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full";

  return (
    <Modal
      title={tr("Record payment")}
      eyebrow={tr("Fees")}
      subtitle={tr("Find the student, pick the invoice, then take the payment.")}
      icon={Banknote}
      tone={step === "receipt" ? "emerald" : "violet"}
      size="xs"
      onClose={onClose}
      // A recorded payment is money that has changed hands; a stray click on the
      // backdrop must not be what discards the half-entered form behind it.
      dirty={step === "payment" && !saving}
      dirtyMessage={tr("This payment has not been recorded yet. Leave without saving it?")}
    >

        {step === "receipt" && receipt ? (
          <div className="space-y-5">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-status-success-surface">
                <Banknote className="h-7 w-7 text-status-success-text" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-ink-strong"><UiText>{"Payment successful"}</UiText></h3>
              <p className="mt-1 text-2xs font-semibold uppercase tracking-wider text-ink-subtle"><UiText>{"Receipt #"}</UiText>{receipt.receiptNumber}</p>
            </div>
            <div className="rounded-2xl bg-brand-50/40 px-4 py-4 border border-edge/10 space-y-3">
              <div className="flex justify-between">
                <span className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Student"}</UiText></span>
                <span className="text-sm font-bold text-ink-strong">{receipt.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Invoice"}</UiText></span>
                <span className="text-sm font-bold text-ink-strong">{receipt.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Amount"}</UiText></span>
                <span className="text-sm font-bold text-ink-strong">{formatPKR(receipt.amount, receipt.currency)}</span>
              </div>
              {receipt.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Discount"}</UiText></span>
                  <span className="text-sm font-bold tabular-nums text-status-success-text">−{formatPKR(receipt.discountAmount, receipt.currency)}</span>
                </div>
              )}
              {receipt.fineAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Fine"}</UiText></span>
                  <span className="text-sm font-bold tabular-nums text-status-error-text">{formatPKR(receipt.fineAmount, receipt.currency)}</span>
                </div>
              )}
              {receipt.creditAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Carried credit"}</UiText></span>
                  <span className="text-sm font-bold text-primary">{formatPKR(receipt.creditAmount, receipt.currency)}</span>
                </div>
              )}
              {receipt.note ? (
                <div className="flex justify-between">
                  <span className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Note"}</UiText></span>
                  <span className="text-sm font-bold text-ink-strong text-end max-w-[60%]">{receipt.note}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Date"}</UiText></span>
                <span className="text-sm font-bold text-ink-strong">{receipt.paymentDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Method"}</UiText></span>
                <span className="text-sm font-bold text-ink-strong capitalize">{tr(paymentMethodLabel(receipt.paymentMethod))}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <BrandButton variant="soft" className="flex-1 h-12" onClick={onSaved}><UiText>{"Close"}</UiText></BrandButton>
              <BrandButton className="flex-1 h-12" onClick={handleDownloadPdf} loading={downloadingPdf}>
                {!downloadingPdf && <Printer className="w-4 h-4" aria-hidden="true" />}
                {downloadingPdf ? tr("Preparing PDF...") : tr("Download receipt")}
              </BrandButton>
            </div>
          </div>
        ) : step === "search" ? (
          <div className="space-y-4">
            <div>
              <label className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1"><UiText>{"Find student"}</UiText></label>
              <div className="flex gap-2">
                <SystemInput
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchStudents()}
                  placeholder={tr("Search by name or roll no...")}
                  className="flex-1"
                />
                <IconButton label={tr("Search")} variant="default" onClick={searchStudents} loading={searching}>
                  {!searching && <Search className="w-4 h-4" aria-hidden="true" />}
                </IconButton>
              </div>
            </div>
            {studentsList.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {studentsList.map((s) => (
                  <Button variant="outline" key={s.id} onClick={() => loadStudentInvoices(s.id, s)} className="justify-start w-full flex items-center gap-3 px-4 py-3 text-start">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary text-xs font-bold">
                      {s.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink-strong truncate">{s.fullName}</p>
                      <p className="text-2xs font-bold text-ink-subtle">{s.rollNo} · {s.class?.name}{s.class?.section ? ` ${s.class.section}` : ""}</p>
                    </div>
                    <Users className="w-4 h-4 text-primary" />
                  </Button>
                ))}
              </div>
            )}
            {loadingInvoices && (
              <div className="space-y-2 py-2 animate-skeleton-in">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 rounded-2xl bg-muted/50 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="space-y-1.5">
                      <div className="h-3 w-24 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                      <div className="h-2 w-16 rounded-full bg-border-subtle/30 skeleton-shimmer" />
                    </div>
                    <div className="h-4 w-16 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                  </div>
                ))}
              </div>
            )}
            {!loadingInvoices && selectedStudent && invoicesFailed && (
              <ErrorState
                title={tr("This student's invoices could not be loaded")}
                description={tr("Check your connection and try again.")}
                onRetry={() => void loadStudentInvoices(selectedStudent.id, selectedStudent)}
              />
            )}
            {!loadingInvoices && selectedStudent && !invoicesFailed && invoices.length === 0 && (
              <div className="rounded-2xl bg-status-success-surface px-4 py-5 border border-status-success-border text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-status-success-surface">
                  <Banknote className="h-5 w-5 text-status-success-text" aria-hidden="true" />
                </div>
                <p className="text-sm font-bold text-status-success-text"><UiText>{"All paid"}</UiText></p>
                <p className="text-xs font-medium text-status-success-text/80 mt-0.5">{tr("{0} has no pending dues.", [selectedStudent.fullName])}</p>
                <Button variant="link" onClick={() => { setSelectedStudent(null); setStudentsList([]); }} className="mt-3 hover:underline"><UiText>{"Search again"}</UiText></Button>
              </div>
            )}
            {invoices.length > 0 && !loadingInvoices && (
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-2"><UiText>{"Select invoice"}</UiText></p>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {invoices.map((inv) => (
                    <label key={inv.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 border cursor-pointer transition-colors ${selectedInvoiceId === inv.id ? "border-primary/30 bg-brand-50" : "border-edge/10 bg-muted/50 hover:border-primary/20"}`}>
                      <input type="radio" name="invoice" value={inv.id} checked={selectedInvoiceId === inv.id} onChange={() => { setSelectedInvoiceId(inv.id); setAmount(String(paisaToRupees(inv.amountDue - inv.amountPaid, inv.currency))); setReferenceNumber(inv.invoiceNumber || ""); }} className="accent-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-ink-strong">{inv.invoiceNumber || tr("Invoice")}</p>
                        <p className="text-2xs font-bold text-ink-subtle"><UiText>{"Due:"}</UiText>{inv.dueDate} · {formatPKR(inv.amountDue, inv.currency)}</p>
                      </div>
                      <Badge variant={invoiceStatusVariant(inv.status)} size="sm" dot>{tr(inv.status)}</Badge>
                    </label>
                  ))}
                  <BrandButton className="w-full" onClick={() => setStep("payment")}><UiText>{"Continue to payment"}</UiText></BrandButton>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const sel = invoices.find((i) => i.id === selectedInvoiceId);
              return sel ? (
                <div className="rounded-2xl bg-brand-50/40 px-4 py-3 border border-edge/10">
                  <p className="text-xs font-bold text-ink-strong">{sel.invoiceNumber || tr("Invoice")}</p>
                  <p className="text-2xs font-bold text-ink-subtle"><UiText>{"Due:"}</UiText>{sel.dueDate} · {formatPKR(sel.amountDue, sel.currency)}</p>
                </div>
              ) : null;
            })()}
            <label>
              <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1">{tr("Amount") } (<bdi>{currency}</bdi>)</span>
              <SystemInput type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={tr("e.g. 5000")} className={inputClass} />
            </label>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
              <label>
                <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1">{tr("Fine") } (<bdi>{currency}</bdi>)</span>
                <SystemInput type="number" min="0" value={fineAmount} onChange={(e) => setFineAmount(e.target.value)} placeholder="0" className={inputClass} />
              </label>
              <label>
                <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1">{tr("Discount") } (<bdi>{currency}</bdi>)</span>
                <SystemInput type="number" min="0" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="0" className={inputClass} />
              </label>
            </div>
            <label>
              <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1"><UiText>{"Payment date"}</UiText></span>
              <SystemInput type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
            </label>
            <label>
              <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1"><UiText>{"Method"}</UiText></span>
              <SystemSelect value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                <option value="CASH"><UiText>{"Cash"}</UiText></option>
                <option value="BANK"><UiText>{"Bank transfer"}</UiText></option>
                <option value="CHEQUE"><UiText>{"Cheque"}</UiText></option>
                <option value="MOBILE_WALLET"><UiText>{"Mobile wallet"}</UiText></option>
                <option value="SAFEPAY"><UiText>{"SafePay / Card"}</UiText></option>
              </SystemSelect>
            </label>
            <label>
              <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1"><UiText>{"Reference (optional)"}</UiText></span>
              <SystemInput type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder={tr("Transaction ID / Cheque #")} className={inputClass} />
            </label>
            <label>
              <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1"><UiText>{"Note (optional)"}</UiText></span>
              <SystemInput type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("e.g. late fee waived")} className={inputClass} />
            </label>
            {outcomeUnknown && <div data-collect-outcome="unknown"><Alert tone="warning" live="polite" compact>{tr("We could not confirm whether this payment was saved. Check the result before doing anything else; it will not be recorded twice.")}</Alert></div>}
            <div className="flex gap-3">
              <BrandButton variant="soft" className="flex-1 h-12" onClick={() => { setStep("search"); setStudentsList([]); setInvoices([]); }}><UiText>{"Back"}</UiText></BrandButton>
              <BrandButton className="flex-[2] h-12" onClick={handleRecordPayment} loading={saving}>
                {!saving && <Banknote className="w-4 h-4" aria-hidden="true" />}
                {saving ? tr("Recording...") : outcomeUnknown ? tr("Check payment result") : tr("Save & Generate Receipt")}
              </BrandButton>
            </div>
          </div>
        )}
    </Modal>
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
  const tr = useUiText();
  const { money } = useLocaleFormat();
  // The campus currency from the locale package (R7: never a hard-coded default); refined for the chosen campus.
  const [currency, setCurrency] = useState<string>(useLocale().currency);
  useEffect(() => { void getFinancialLocale(campusId).then((locale) => setCurrency(locale.currency)).catch(() => {}); }, [campusId]);
  const [file, setFile] = useState<File | null>(null);
  const [accountName, setAccountName] = useState("");
  const [statementFrom, setStatementFrom] = useState("");
  const [statementTo, setStatementTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<any>(null);
  const [reversal, setReversal] = useState<any>(null);
  const [confirmReverse, setConfirmReverse] = useState(false);

  const batchUrl = () => "/api/import-batches/" + batch.id + (campusId ? "?campusId=" + encodeURIComponent(campusId) : "");

  const stage = async () => {
    if (!file || !accountName || !statementFrom || !statementTo) { toast.error(tr("All fields required")); return; }
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 5 * 1024 * 1024) { toast.error(tr("Choose a CSV file under 5MB")); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/import-batches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "BANK_STATEMENT", sourceName: file.name, csvText: await file.text(), accountName, currency, statementFrom, statementTo, campusId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || tr("Could not validate this statement"));
      setBatch(result.data); toast.success(tr("File validated. Review every row before commit."));
    } catch (error) { toast.error(error instanceof Error ? error.message : tr("Import failed")); }
    finally { setBusy(false); }
  };

  // SKO-432: a hand-chosen invoice must carry the reviewer's reason.
  const [matchReason, setMatchReason] = useState("");
  const updateRow = async (row: any, change: Record<string, unknown>) => {
    if (!batch) return;
    setBusy(true);
    try {
      const response = await fetch(batchUrl(), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: [{ rowNumber: row.rowNumber, ...change }] }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || tr("Could not save row decision"));
      setBatch(result.data);
    } catch (error) { toast.error(error instanceof Error ? error.message : tr("Could not save row decision")); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!batch || batch.summary.accepted < 1) return;
    setBusy(true);
    try {
      const response = await fetch(batchUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "commit" }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || tr("Import failed"));
      setBatch(result.data); setReversal(null);
      const summary = result.receipt?.summary || {};
      toast.success(tr("Reconciliation saved. {0} transactions matched and {1} remain unmatched.", [summary.matched || 0, summary.unmatched || 0]));
      onImported();
    } catch (error) { toast.error(error instanceof Error ? error.message : tr("Import failed")); }
    finally { setBusy(false); }
  };

  const checkReversal = async () => {
    try {
      const response = await fetch(batchUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reversal-check" }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || tr("Could not check reversal dependencies"));
      setReversal(result.data);
    } catch (error) { toast.error(error instanceof Error ? error.message : tr("Could not check reversal dependencies")); }
  };

  const reverse = async () => {
    setBusy(true);
    try {
      const response = await fetch(batchUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse" }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || tr("Reversal failed"));
      setBatch(result.data); setReversal(null); setConfirmReverse(false);
      toast.success(tr("Batch reversed. The reversal receipt is retained.")); onImported();
    } catch (error) { toast.error(error instanceof Error ? error.message : tr("Reversal failed")); }
    finally { setBusy(false); }
  };

  const committed = batch && ["COMMITTED", "PARTIAL", "REVERSED"].includes(batch.state);

  return (
    <>
    <ConfirmAction
      open={Boolean(confirmReverse && reversal?.eligible)}
      tone="danger"
      title={tr("Reverse this import?")}
      description={tr("This marks the pending reconciliation reversed and retains its receipt. The reversal cannot be undone.")}
      confirmLabel={tr("Reverse batch")}
      cancelLabel={tr("Keep editing")}
      busy={busy}
      onConfirm={() => void reverse()}
      onCancel={() => setConfirmReverse(false)}
    />
    <Modal title={tr("Import bank statement")} eyebrow={tr("Fees")}
      subtitle={tr("Upload and validate first. Only reviewed rows are saved to the reconciliation receipt.")}
      icon={Landmark} size="md" onClose={onClose}
      footer={committed ? <div className="flex w-full gap-2">
        {batch.state !== "REVERSED" && <BrandButton variant="soft" className="h-12 flex-1" onClick={() => void checkReversal()}>{tr("Check reversal")}</BrandButton>}
        {reversal?.eligible ? <Button variant="outline" className="h-12 flex-1 text-destructive" onClick={() => setConfirmReverse(true)}>{tr("Reverse batch")}</Button> : null}
      </div> : batch?.state === "STAGED" ? <BrandButton className="w-full h-12" onClick={() => void commit()} loading={busy} disabled={batch.summary.accepted < 1}>
        {!busy && <Landmark className="w-4 h-4" aria-hidden="true" />}
        {busy ? tr("Committing...") : tr("Commit {0} selected transactions", [batch.summary.accepted])}
      </BrandButton> : <BrandButton className="w-full h-12" onClick={() => void stage()} loading={busy} disabled={!file}>
        {!busy && <Landmark className="w-4 h-4" aria-hidden="true" />}
        {busy ? tr("Validating...") : tr("Validate statement")}
      </BrandButton>}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto" dir="auto">
        {committed ? <Alert tone="success" live="polite" title={batch.state === "REVERSED" ? tr("Batch reversed") : tr("Batch receipt")}><div className="space-y-3">
          <p>{tr("{0} transactions committed; {1} matched; {2} unmatched.", [batch.receipt?.summary?.committed || 0, batch.receipt?.summary?.matched || 0, batch.receipt?.summary?.unmatched || 0])}</p>
          <p className="font-mono text-xs" dir="ltr">{batch.id}</p>
          {reversal && <div className="rounded-xl bg-card p-3 text-sm"><p className="font-bold">{reversal.eligible ? tr("Reversal is eligible") : tr("Reversal is blocked")}</p><p>{tr(reversal.action)}</p>{reversal.dependencies?.map((item: string) => <p key={item} className="text-status-error-text">{item}</p>)}</div>}
        </div></Alert> : <>
          <label className="block text-sm">{tr("Currency")}<SystemSelect aria-label={tr("Currency")} className="mt-1 w-full" value={currency} onChange={(event) => setCurrency(event.target.value)}>{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</SystemSelect></label>
          <label><span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1">{tr("Account name")}</span><SystemInput type="text" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder={tr("School savings account")} className="w-full" /></label>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
            <label className="text-sm">{tr("From")}<SystemInput type="date" value={statementFrom} onChange={(event) => setStatementFrom(event.target.value)} className="mt-1 w-full" /></label>
            <label className="text-sm">{tr("To")}<SystemInput type="date" value={statementTo} onChange={(event) => setStatementTo(event.target.value)} className="mt-1 w-full" /></label>
          </div>
          <div><label className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1">{tr("CSV file")}</label><label className="relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-edge/20 bg-brand-50/20   ">
            <input aria-label={tr("Choose CSV file")} type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />
            {file ? <div className="text-center"><FileText className="mx-auto mb-1 h-6 w-6 text-primary" /><p className="text-xs font-bold">{file.name}</p><p className="text-2xs">{(file.size / 1024).toFixed(1)} KB</p></div> : <div className="text-center"><Upload className="mx-auto mb-1 h-6 w-6 text-primary" /><p className="text-xs font-bold">{tr("Click to upload CSV")}</p><p className="text-2xs">{tr("transaction_date,amount,description")}</p></div>}
          </label></div>
          {batch?.state === "STAGED" && <>
            <div className="flex flex-wrap gap-2 text-xs font-bold"><span>{tr("{0} selected", [batch.summary.accepted])}</span><span>{tr("{0} rejected", [batch.summary.rejected])}</span><span>{tr("{0} skipped", [batch.summary.skipped])}</span><span>{tr("{0} unresolved", [batch.summary.unresolved])}</span><span>{tr("{0} total rows", [batch.summary.total])}</span></div>
            <p className="text-xs text-ink-subtle">{tr("Matching uses exact invoice references only. Unmatched rows stay unmatched until reviewed; no payment is posted.")}</p>
            <label className="block text-xs font-bold">{tr("Reason for matching by hand")}<SystemInput type="text" value={matchReason} maxLength={300} placeholder={tr("e.g. payer's note names the pupil; confirmed by phone")} onChange={(event) => setMatchReason(event.target.value)} className="mt-1 w-full" /></label>
            <Table className="w-full text-xs"><TableHeader><TableRow><TableHead>{tr("Include")}</TableHead><TableHead dir="ltr">{tr("Row")}</TableHead><TableHead>{tr("Date")}</TableHead><TableHead>{tr("Amount")}</TableHead><TableHead>{tr("Description")}</TableHead><TableHead>{tr("Invoice match")}</TableHead><TableHead>{tr("Status")}</TableHead></TableRow></TableHeader><TableBody>
              {batch.rows?.map((row: any) => <TableRow key={row.rowNumber} className="border-t"><TableCell>{row.state === "ACCEPTED" && <Checkbox  aria-label={tr("Include row {0}", [row.rowNumber])} checked={row.selected} onChange={(event) => void updateRow(row, { selected: event.target.checked })} />}</TableCell><TableCell dir="ltr">{row.rowNumber}</TableCell><TableCell dir="ltr">{String(row.proposal?.date || "")}</TableCell><TableCell dir="ltr">{money(Number(row.proposal?.amountMinor || 0), currency)}</TableCell><TableCell>{String(row.proposal?.description || "")}</TableCell><TableCell><SystemSelect aria-label={tr("Invoice for row {0}", [row.rowNumber])} className="max-w-52" value={String(row.proposal?.matchedInvoiceId || "")} onChange={(event) => void updateRow(row, event.target.value ? { matchedInvoiceId: event.target.value, reason: matchReason } : { matchedInvoiceId: null })}><option value="">{tr("Leave unmatched")}</option>{(row.proposal?.candidates || []).map((candidate: any) => <option key={candidate.id} value={candidate.id}>{candidate.invoiceNumber || candidate.id} · {candidate.studentName}</option>)}</SystemSelect>{row.state === "UNRESOLVED" && <Button variant="link" type="button" className="mt-1 px-2 py-1 underline" onClick={() => void updateRow(row, { matchedInvoiceId: null })}>{tr("Resolve as unmatched")}</Button>}</TableCell><TableCell>{tr(row.state)}{row.errors?.length > 0 && <span className="block max-w-48 text-status-error-text">{row.errors.join("; ")}</span>}</TableCell></TableRow>)}
            </TableBody></Table>
          </>}
        </>}
      </div>
    </Modal>
    </>
  );
}
