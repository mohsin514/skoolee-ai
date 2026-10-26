"use client";

import { UiSentence } from "@/components/operations/console-page";

import { InstallmentPlanPanel } from "./installment-plan-panel";
import { InvoiceAdjustmentsPanel } from "./adjustments-panel";
import { Button } from "@/components/ui/button";
import { UiText, useUiText, useLocaleFormat, useLocale } from "@/components/locale/LocaleProvider";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { toast } from "@/components/ui/toast";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { downloadPdfFile } from "@/lib/download";
import type { ClassOption, Invoice, InvoiceStatus, PanelCommand } from "./fee-types";

const INVOICE_TONE: Record<string, "success" | "warning" | "info" | "danger" | "neutral"> = { PAID: "success", PARTIAL: "warning", PENDING: "info", OVERDUE: "danger", CANCELLED: "neutral" };
import {
  API,
  classLabel,
  exportCSV,
  formatDate,
  formatPKR,
  paisaToRupees,
  paymentMethodLabel,
  usePanelCommand,
} from "./fee-utils";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";

const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
];

/**
 * Invoices for one campus. `readOnly` is the campus admin who does not hold the finance desk: they follow
 * invoices and decide refunds inside the invoice drawer, but generating, cancelling and requesting adjustments
 * stay with the finance desk (role-ux §3.1). `hideHeader` lets a console's PageHeader own the title and the
 * primary action; `command` runs "generate-invoices" or "export" from that header.
 */
export function FeeInvoicesTab({ campusId, readOnly = false, command, hideHeader = false }: { campusId?: string; readOnly?: boolean; command?: PanelCommand | null; hideHeader?: boolean }) {
 const { date: formatDate, money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const { language } = useLocale();
  // The last two years plus the next three months, newest first, named in the reader's language.
  const monthOptions = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(language === "en" ? "en" : `${language}-u-nu-latn`, { month: "long", year: "numeric", timeZone: "UTC" });
    const now = new Date();
    return Array.from({ length: 27 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3 - i, 1));
      return { value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: fmt.format(d) };
    });
  }, [language]);
  const formatCount = (n: number) => new Intl.NumberFormat(language === "en" ? "en" : `${language}-u-nu-latn`).format(n);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [detailInvoice, setDetailInvoice] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // The invoice the drawer is showing; a failed load stays in the drawer with a retry (R4: never a toast).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const qp = campusId ? `campusId=${encodeURIComponent(campusId)}` : "";

  const requestVersion = useRef(0);
  const loadInvoices = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadFailed(false);
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
      if (version !== requestVersion.current) return;
      if (res.ok && json.success) {
        setInvoices(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      } else {
        setLoadFailed(true);
      }
    } catch {
      if (version !== requestVersion.current) return;
      // Load failures are shown in place with a retry (role-ux R4), never as a toast.
      setLoadFailed(true);
    } finally {
      if (version === requestVersion.current) setLoading(false);
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
    void loadInvoices();
    return () => { requestVersion.current++; };
  }, [loadInvoices]);

  // Deep link from the approvals queue: ?invoice=<id> opens that invoice's drawer once.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("invoice");
    if (id) void viewDetail(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    setPage(1);
    setSearchQuery(searchInput);
  };

  const detailVersion = useRef(0);
  const viewDetail = async (id: string) => {
    const version = ++detailVersion.current;
    setDetailInvoice(null);
    setDetailId(id);
    setDetailFailed(false);
    setShowDetail(true);
    setLoadingDetail(true);
    try {
      const res = await fetch(`${API}/invoices/${id}`);
      const json = await res.json();
      if (version !== detailVersion.current) return;
      if (res.ok && json.success) setDetailInvoice(json.data);
      else setDetailFailed(true);
    } catch {
      if (version === detailVersion.current) setDetailFailed(true);
    } finally {
      if (version === detailVersion.current) setLoadingDetail(false);
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
        toast.success(tr(json.message));
        loadInvoices();
        if (detailInvoice?.id === id) setDetailInvoice(null);
        return true;
      } else {
        toast.error(tr(json.error || "Failed to update status"));
      }
    } catch {
      toast.error(tr("Failed to update invoice"));
    }
  };

  const handleExportCSV = () => {
    if (invoices.length === 0) { toast.info(tr("Nothing to export yet.")); return; }
    const rows = invoices.map((inv) => ({
      "Invoice #": inv.invoiceNumber,
      Student: inv.student.fullName,
      "Roll No": inv.student.rollNo ?? "",
      Class: classLabel(inv.student.class.name, inv.student.class.section),
      "Invoice Date": formatDate(inv.invoiceDate),
      "Due Date": formatDate(inv.dueDate),
      "Currency": inv.currency,
      "Total Amount": paisaToRupees(inv.totalAmount, inv.currency),
      "Amount Paid": paisaToRupees(inv.totalAmountPaid, inv.currency),
      "Balance Due": paisaToRupees(inv.balanceDue, inv.currency),
      Status: inv.status,
    }));
    exportCSV(rows, `invoices-${new Date().toISOString().split("T")[0]}`);
  };

  // "Generate invoices" may arrive with a view change (Today → Invoices), so it runs at once; an export waits
  // for the list it exports.
  usePanelCommand(command, { "generate-invoices": () => { if (!readOnly) setShowGenerate(true); } });
  usePanelCommand(command, { export: handleExportCSV }, !loading);

  return (
    <div className="space-y-5">
      {hideHeader ? null : (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-bold text-ink-strong"><UiText>{"Invoices"}</UiText></h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportCSV}><Download className="size-4" aria-hidden="true" /><UiText>{"Export"}</UiText></Button>
            {readOnly ? null : <Button onClick={() => setShowGenerate(true)}><Plus className="size-4" aria-hidden="true" /><UiText>{"Generate invoices"}</UiText></Button>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-muted p-1">
          {STATUSES.map((s) => (
            <Button aria-pressed={statusFilter === s.value} variant="choice"
              key={s.value}
              type="button"
              onClick={() => { setStatusFilter(s.value); setPage(1); }}
              className={`px-3 py-1.5 ${
                ""
              } `}
            >
              {tr(s.label)}
            </Button>
          ))}
        </div>

        <SystemSelect
          aria-label={tr("Class")}
          value={classFilter}
          onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
          className=""
        >
          <option value=""><UiText>{"All classes"}</UiText></option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{classLabel(c.name, c.section)}</option>
          ))}
        </SystemSelect>

        <SystemSelect
          aria-label={tr("Month")}
          title={tr("Month")}
          value={monthFilter}
          onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }}
          className=""
        >
          <option value="">{tr("Any month")}</option>
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </SystemSelect>

        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <SystemInput
            type="text"
            placeholder={tr("Search student or invoice #...")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Button aria-label={tr("Search")} variant="default" size="icon" onClick={handleSearch} className="flex items-center justify-center">
            <Search className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-xs font-medium text-ink-subtle">{tr(total === 1 ? "{0} invoice" : "{0} invoices", [formatCount(total)])}</p>

      {loading ? (
        <SkeletonTable rows={6} columns={7} label={tr("Loading invoices…")} />
      ) : loadFailed ? (
        <ErrorState
          title={tr("Invoices could not be loaded")}
          description={tr("Check your connection and try again.")}
          onRetry={() => void loadInvoices()}
        />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tr("No invoices found")}
          description={tr("Generate invoices or adjust your filters.")}
          action={readOnly ? undefined : <Button onClick={() => setShowGenerate(true)}><Plus className="size-4" aria-hidden="true" />{tr("Generate invoices")}</Button>}
        />
      ) : (
        <>
          <div className="sk-panel sk-rise overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-[1fr_1fr_100px_100px_100px_90px_80px] gap-3 px-5 py-3 bg-muted/50 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
              <span><UiText>{"Student"}</UiText></span>
              <span><UiText>{"Invoice"}</UiText></span>
              <span><UiText>{"Total"}</UiText></span>
              <span><UiText>{"Paid"}</UiText></span>
              <span><UiText>{"Balance"}</UiText></span>
              <span><UiText>{"Status"}</UiText></span>
              <span></span>
            </div>
            <div className="min-w-[760px] divide-y divide-muted">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="grid grid-cols-[1fr_1fr_100px_100px_100px_90px_80px] gap-3 px-5 py-3 items-center sk-row-interactive"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink-strong truncate">{inv.student.fullName}</p>
                    <p className="text-2xs text-ink-subtle">
                      {classLabel(inv.student.class.name, inv.student.class.section)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink-strong truncate">{inv.invoiceNumber}</p>
                    <p className="text-2xs tabular-nums text-ink-subtle"><UiText>{"Due:"}</UiText>{formatDate(inv.dueDate)}
                    </p>
                  </div>
                  <p className="text-xs font-semibold tabular-nums text-ink-strong">{formatPKR(inv.totalAmount, inv.currency)}</p>
                  <p className="text-xs font-semibold tabular-nums text-status-success-text">{formatPKR(inv.totalAmountPaid, inv.currency)}</p>
                  <p className="text-xs font-semibold tabular-nums text-status-error-text">{formatPKR(inv.balanceDue, inv.currency)}</p>
                  <Badge size="sm" dot variant={INVOICE_TONE[inv.status] ?? "neutral"} className="w-fit">
                    {tr(inv.status)}
                  </Badge>
                  <div className="flex items-center gap-1 justify-end">
                    <IconButton variant="secondary" size="sm" label={inv.status === "PAID" ? tr("View receipt") : tr("View details")}
                      onClick={() => viewDetail(inv.id)}
                    >
                      {inv.status === "PAID" ? <Receipt aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary"
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="justify-start flex items-center gap-1 px-3"
              >
                <ChevronLeft className="w-3 h-3 rtl:rotate-180" aria-hidden="true" /><UiText>{"Prev"}</UiText></Button>
              <span className="text-xs font-medium tabular-nums text-ink-muted"><UiSentence text="Page {0} of {1}" values={[page, totalPages]} /></span>
              <Button variant="secondary"
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="justify-start flex items-center gap-1 px-3"
              ><UiText>{"Next"}</UiText><ChevronRight className="w-3 h-3 rtl:rotate-180" aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}

      {showDetail && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          readOnly={readOnly}
          loading={loadingDetail}
          failed={detailFailed}
          onRetry={() => { if (detailId) void viewDetail(detailId); }}
          onClose={() => { setShowDetail(false); setDetailInvoice(null); setDetailFailed(false); }}
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
  readOnly = false,
  loading,
  failed = false,
  onRetry,
  onClose,
  onStatusChange,
}: {
  invoice: any;
  readOnly?: boolean;
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  onStatusChange: (id: string, status: "OVERDUE" | "CANCELLED") => Promise<boolean | undefined>;
}) {
 const { date: formatDate, money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [confirmOverdue, setConfirmOverdue] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!inv?.id) return;
    setDownloadingPdf(true);
    try {
      await downloadPdfFile(`/api/fees/invoice-pdf?id=${encodeURIComponent(inv.id)}`, `invoice-${inv.invoiceNumber || "receipt"}.pdf`);
      toast.success(tr("Invoice PDF downloaded"));
    } catch (error: any) {
      toast.error(tr(error?.message || "Failed to download PDF"));
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <>
    <ConfirmAction
      open={confirmOverdue}
      title={tr("Mark this invoice overdue?")}
      description={tr("The invoice is flagged overdue and late-fee rules start to apply. You can still record payments against it.")}
      cancelLabel={tr("Keep editing")}
      onConfirm={() => { return onStatusChange(inv.id, "OVERDUE").then(saved => { if (saved) setConfirmOverdue(false); }); }}
      onCancel={() => setConfirmOverdue(false)}
      tone="warning"
      confirmLabel={tr("Mark overdue")}
    />
    <ConfirmAction
      open={confirmCancel}
      title={tr("Cancel this invoice?")}
      description={tr("The family no longer owes this invoice and it cannot be reopened. An invoice with any payment recorded cannot be cancelled.")}
      cancelLabel={tr("Keep editing")}
      onConfirm={() => { return onStatusChange(inv.id, "CANCELLED").then(saved => { if (saved) setConfirmCancel(false); }); }}
      onCancel={() => setConfirmCancel(false)}
      tone="danger"
      confirmLabel={tr("Cancel invoice")}
    />
    <Modal
      title={tr("Invoice detail")}
      eyebrow={tr("Fees")}
      subtitle={inv ? `${inv.invoiceNumber} · ${inv.student?.fullName ?? ""}` : undefined}
      icon={Receipt}
      size="sm"
      onClose={onClose}
    >

        {failed && !loading ? (
          <ErrorState
            title={tr("This invoice could not be loaded")}
            description={tr("Check your connection and try again.")}
            onRetry={onRetry}
          />
        ) : loading || !inv ? (
          <div className="space-y-4 py-2 animate-skeleton-in">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded-full bg-border-subtle/50 skeleton-shimmer" />
              <div className="h-6 w-16 rounded-full bg-border-subtle/40 skeleton-shimmer" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="h-3 w-20 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                  <div className="h-3 w-24 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                </div>
              ))}
            </div>
            <div className="h-px bg-border-subtle/30" />
            <div className="h-5 w-32 rounded-full bg-border-subtle/50 skeleton-shimmer" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-ink-strong">{inv.invoiceNumber}</p>
                <p className="text-2xs font-bold text-ink-subtle">
                  {inv.student?.fullName} · {inv.student?.class?.name}
                </p>
              </div>
              <Badge size="sm" dot variant={INVOICE_TONE[inv.status] ?? "neutral"}>
                {tr(inv.status)}
              </Badge>
            </div>

            {inv.status === "PAID" && inv.payments?.length > 0 && (
              <div className="rounded-2xl bg-status-success-surface border border-status-success-border p-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-status-success-surface">
                  <Receipt className="h-5 w-5 text-status-success-text" />
                </div>
                <p className="text-sm font-bold text-status-success-text"><UiText>{"Fully paid"}</UiText></p>
                <p className="text-2xs font-bold text-status-success-text/70 mt-0.5"><UiText>{"Receipt:"}</UiText>{inv.payments[0].receiptNo ?? "—"}
                </p>
              </div>
            )}

            <div className="rounded-2xl bg-muted/50 p-4 space-y-2">
              <Row label={tr("Invoice date")} value={formatDate(inv.invoiceDate)} />
              <Row label={tr("Due date")} value={formatDate(inv.dueDate)} />
              <div className="border-t border-edge/10 pt-2 mt-2" />
              <Row label={tr("Monthly fee")} value={formatPKR(inv.monthlyFee, inv.currency)} />
              {inv.oneTimeFees > 0 && <Row label={tr("One-Time Fees")} value={formatPKR(inv.oneTimeFees, inv.currency)} />}
              <Row label={tr("Subtotal")} value={formatPKR(inv.subtotal, inv.currency)} />
              {inv.discountAmount > 0 && <Row label={tr("Discount")} value={`-${formatPKR(inv.discountAmount, inv.currency)}`} className="text-status-success-text" />}
              {Boolean(inv.carryForwardAmount) && <Row label={tr("Carry forward")} value={formatPKR(inv.carryForwardAmount || 0, inv.currency)} />}
              {inv.lateFeeAmount > 0 && <Row label={tr("Late fee")} value={formatPKR(inv.lateFeeAmount, inv.currency)} className="text-status-error-text" />}
              {inv.taxAmount > 0 && <Row label={tr("Tax")} value={formatPKR(inv.taxAmount, inv.currency)} />}
              <div className="border-t border-edge/10 pt-2 mt-2" />
              <Row label={tr("Total amount")} value={formatPKR(inv.totalAmount, inv.currency)} bold />
              <Row label={tr("Amount paid")} value={formatPKR(inv.totalAmountPaid, inv.currency)} className="text-status-success-text" />
              <Row label={tr("Balance due")} value={formatPKR(inv.balanceDue, inv.currency)} className={inv.balanceDue > 0 ? "text-status-error-text" : "text-status-success-text"} bold />
            </div>

            {inv.payments && inv.payments.length > 0 && (
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-2"><UiText>{"Payment receipts"}</UiText></p>
                <div className="space-y-2">
                  {inv.payments.map((p: any) => (
                    <div key={p.id} className="rounded-2xl bg-status-success-surface border border-status-success-border px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-status-success-text">{formatPKR(p.amount, inv.currency)}</p>
                        <span className="text-2xs font-semibold uppercase text-status-success-text bg-status-success-surface px-2 py-0.5 rounded-lg">
                          {p.receiptNo ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-2xs font-bold text-ink-subtle">
                          {formatDate(p.paymentDate)} · {tr(paymentMethodLabel(p.paymentMethod))}
                          {p.referenceNumber ? tr(" · Ref: {0}", [p.referenceNumber]) : ""}
                        </p>
                        {p.recorder?.fullName && (
                          <p className="text-2xs font-bold text-ink-subtle"><UiText>{"by"}</UiText>{p.recorder.fullName}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inv.status !== "CANCELLED" && inv.status !== "PAID" && <InstallmentPlanPanel invoiceId={inv.id} currency={inv.currency} canPropose={!readOnly} />}
            {inv.status !== "CANCELLED" && <InvoiceAdjustmentsPanel invoice={inv} canRequest={!readOnly} />}
            {!readOnly && inv.status !== "PAID" && inv.status !== "CANCELLED" && (
              // Destructive work sits at the start of the footer, never painted as the primary (role-ux §4.5.3).
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" className="text-destructive" onClick={() => setConfirmCancel(true)}>
                  <XCircle className="size-4" aria-hidden="true" /><UiText>{"Cancel invoice"}</UiText></Button>
                {inv.status !== "OVERDUE" ? <Button variant="outline" onClick={() => setConfirmOverdue(true)}>
                  <AlertTriangle className="size-4" aria-hidden="true" /><UiText>{"Mark overdue"}</UiText></Button> : null}
              </div>
            )}

            {inv.status === "PAID" && (
              <BrandButton variant="soft" className="w-full h-12" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                {downloadingPdf ? tr("Preparing PDF...") : tr("Download receipt")}
              </BrandButton>
            )}
          </div>
        )}
    </Modal>
    </>
  );
}

function Row({ label, value, className, bold }: { label: string; value: string; className?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-2xs font-semibold uppercase text-ink-subtle">{label}</span>
      <span className={`text-sm tabular-nums ${bold ? "font-bold" : "font-semibold"} ${className ?? "text-ink-strong"}`}>{value}</span>
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
  const tr = useUiText();
  const [generationMonth, setGenerationMonth] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [includeLateFees, setIncludeLateFees] = useState(true);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!generationMonth) { toast.error(tr("Select a month")); return; }
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
        toast.success(tr(json.message || "Invoices generated"));
        onGenerated();
      } else {
        toast.error(tr(json.error || "Generation failed"));
      }
    } catch {
      toast.error(tr("Failed to generate invoices"));
    } finally {
      setGenerating(false);
    }
  };

  const inputClass = "w-full";

  return (
    <Modal
      title={tr("Generate invoices")}
      eyebrow={tr("Fees")}
      subtitle={tr("Raises one invoice per active student for the month you pick.")}
      icon={FileText}
      size="xs"
      onClose={onClose}
      footer={
        <BrandButton className="w-full h-12" onClick={handleGenerate} disabled={generating} aria-busy={generating || undefined}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileText className="w-4 h-4" aria-hidden="true" />}
          {generating ? tr("Generating...") : tr("Generate invoices")}
        </BrandButton>
      }
    >
        <div className="space-y-4">
          <label>
            <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1"><UiText>{"Month"}</UiText></span>
            <SystemInput type="month" value={generationMonth} onChange={(e) => setGenerationMonth(e.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle block mb-1"><UiText>{"Class (optional)"}</UiText></span>
            <SystemSelect value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className={inputClass}>
              <option value=""><UiText>{"All classes"}</UiText></option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{classLabel(c.name, c.section)}</option>
              ))}
            </SystemSelect>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <SystemCheckbox

              checked={includeLateFees}
              onChange={(e) => setIncludeLateFees(e.target.checked)}
              className=""
            />
            <span className="text-xs font-bold text-ink-muted"><UiText>{"Include late fees from overdue invoices"}</UiText></span>
          </label>
        </div>
    </Modal>
  );
}
