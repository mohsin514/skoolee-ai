"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Banknote, CalendarClock, CheckCircle2, Receipt } from "lucide-react";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText, useLocale } from "@/components/locale/LocaleProvider";
import { OnlinePayAction, PaymentReturnStatus } from "./online-payment";
import { InstallmentSchedule } from "./installment-plan-panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

// SKO-431: the family fee statement for one authorized child. Every figure comes from the server in one
// currency; due states use the school's calendar; the reconciliation line shows the arithmetic.

type DueState = "PAID" | "CANCELLED" | "OVERDUE" | "DUE_TODAY" | "NOT_YET_DUE";
type Statement = {
  student: { id: string; fullName: string }; currency: string | null; currencies: string[]; today: string;
  summary: { charges: number; payments: number; closing: number; outstanding: number; overdue: number; dueToday: number; notYetDue: number; reconciles: boolean };
  invoices: { id: string; invoiceNumber: string | null; currency: string; status: string; dueState: DueState; dueDate: string; totalAmount: number; paid: number; balance: number; receipts: { id: string; amount: number; receiptNo: string | null; paymentDate: string; method: string }[];
    installments: { dueDate: string; amount: number; paid: number; remaining: number; state: "PAID" | "PART_PAID" | "OVERDUE" | "DUE_TODAY" | "NOT_YET_DUE" }[] | null;
    adjustments?: { id: string; kind: "REFUND" | "CREDIT_NOTE" | "WAIVER"; status: string; amount: number; publicExplanation: string }[] }[];
};
const STATE_TONE: Record<DueState, "success" | "neutral" | "danger" | "warning" | "info"> = { PAID: "success", CANCELLED: "neutral", OVERDUE: "danger", DUE_TODAY: "warning", NOT_YET_DUE: "info" };
const STATE_LABEL: Record<DueState, string> = { PAID: "Paid", CANCELLED: "Cancelled", OVERDUE: "Overdue", DUE_TODAY: "Due today", NOT_YET_DUE: "Not yet due" };

/** The most recent payment on the statement, so a page header can offer "Download receipt" (§4.4 parent · Fees). */
export type LatestReceipt = { id: string; receiptNo: string | null; paymentDate: string; amount: number; currency: string; href: string };
export type FamilyFeeSummary = { outstanding: number; currency: string | null; fullName: string; latestReceipt: LatestReceipt | null };

function latestReceiptOf(statement: Statement): LatestReceipt | null {
  let latest: LatestReceipt | null = null;
  for (const invoice of statement.invoices) {
    for (const receipt of invoice.receipts) {
      if (latest && Date.parse(receipt.paymentDate) <= Date.parse(latest.paymentDate)) continue;
      latest = { id: receipt.id, receiptNo: receipt.receiptNo, paymentDate: receipt.paymentDate, amount: receipt.amount, currency: invoice.currency, href: `/api/fees/payment-pdf?id=${encodeURIComponent(receipt.id)}` };
    }
  }
  return latest;
}

/**
 * `canPay` (default true) shows the online Pay control. A learner sees their fees but never pays — the guardian
 * does (role-ux M101 / G44a), so `/student/fees` passes `canPay={false}` and gets a note instead of a button.
 * `onSummary` reports the figures a page header needs, including the latest receipt (null when nothing was paid).
 */
export function FamilyFeeStatement({ studentId, onSummary, canPay = true }: { studentId?: string | null; onSummary?: (summary: FamilyFeeSummary) => void; canPay?: boolean }) {
  const ui = useUiText();
  const { money, date } = useLocaleFormat();
  const { currency: campusCurrency } = useLocale();
  const params = useSearchParams();
  const focusInvoice = params.get("invoice");
  const [paymentRef, setPaymentRef] = useState<string | null>(() => params.get("payment"));
  const [currency, setCurrency] = useState<string | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null), [failed, setFailed] = useState(false);
  const refreshedFor = useRef<string | null>(null), report = useRef(onSummary);
  useEffect(() => { report.current = onSummary; }, [onSummary]);
  const load = useCallback(async (wanted: string | null) => {
    setFailed(false);
    const query = new URLSearchParams();
    if (studentId) query.set("studentId", studentId);
    if (wanted) query.set("currency", wanted);
    if (!wanted && focusInvoice) query.set("invoice", focusInvoice);
    try {
      const response = await fetch(`/api/fees/family-statement?${query}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error);
      setStatement(json.data);
      const data = json.data as Statement;
      report.current?.({ outstanding: data.summary.outstanding, currency: data.currency, fullName: data.student.fullName, latestReceipt: latestReceiptOf(data) });
    } catch { setFailed(true); }
  }, [studentId, focusInvoice]);
  useEffect(() => { const timer = setTimeout(() => void load(currency), 0); return () => clearTimeout(timer); }, [load, currency]);
  const settled = () => { if (paymentRef && refreshedFor.current !== paymentRef) { refreshedFor.current = paymentRef; void load(currency); } };

  if (failed) return <ErrorState title={ui("Fee statement could not be loaded.")} description={ui("Check your connection and try again.")} retryLabel={ui("Try again")} onRetry={() => void load(currency)} />;
  if (!statement) return <SkeletonRegion label={ui("Loading fee statement…")} className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><Skeleton className="h-40 rounded-2xl" /></SkeletonRegion>;
  const code = statement.currency ?? campusCurrency, s = statement.summary, fmt = (amount: number) => money(amount, code);
  return <div className="space-y-4" data-family-statement>
    {paymentRef && <PaymentReturnStatus key={paymentRef} orderRef={paymentRef} onSettled={settled} />}
    {statement.invoices.length === 0 ? <div className="sk-panel"><EmptyState icon={Receipt} title={ui("No fee obligations are available for this child.")} description={ui("New invoices from the school will appear here.")} /></div> : <>
      {statement.currencies.length > 1 && <FormField name="statementCurrency" label={ui("Currency")} hint={ui("Shows the invoices billed in this currency.")} className="w-full max-w-xs"><Select className="w-full" value={code} onChange={event => setCurrency(event.target.value)}>{statement.currencies.map(option => <option key={option} value={option}>{option}</option>)}</Select></FormField>}
      <div className="sk-stagger grid grid-cols-2 gap-3 md:grid-cols-4" data-statement-summary>
        <Figure icon={Banknote} label={ui("Outstanding")} value={fmt(s.outstanding)} tone="rose" />
        <Figure icon={CalendarClock} label={ui("Overdue")} value={fmt(s.overdue)} tone={s.overdue ? "rose" : "muted"} />
        <Figure icon={CalendarClock} label={ui("Due today")} value={fmt(s.dueToday)} tone={s.dueToday ? "amber" : "muted"} />
        <Figure icon={CheckCircle2} label={ui("Not yet due")} value={fmt(s.notYetDue)} tone="sky" />
      </div>
      <p className="text-xs leading-relaxed text-ink-muted tabular-nums" data-statement-reconciliation={s.reconciles ? "ok" : "mismatch"}><bdi>{ui("Charges {0} − payments {1} = {2} owed", [fmt(s.charges), fmt(s.payments), fmt(s.closing)])}</bdi>{" · "}{ui("Dates as of {0} (school calendar)", [date(statement.today)])}{s.reconciles ? "" : ` · ${ui("These figures do not reconcile; please contact the school office.")}`}</p>
      {!canPay && s.outstanding > 0 ? <p className="text-xs leading-relaxed text-ink-muted" data-pay-note>{ui("Your parent or guardian pays fees from their family account.")}</p> : null}
      <div className="space-y-3">{statement.invoices.map(invoice => <InvoiceCard key={invoice.id} invoice={invoice} focused={invoice.id === focusInvoice} fmt={fmt} onPending={setPaymentRef} canPay={canPay} />)}</div>
    </>}
  </div>;
}

function Figure({ icon: Icon, label, value, tone }: { icon: typeof Banknote; label: string; value: string; tone: "rose" | "amber" | "sky" | "muted" }) {
  const color = { rose: "text-status-error-text", amber: "text-status-warning-text", sky: "text-status-info-text", muted: "text-ink-muted" }[tone];
  return <div className="sk-panel min-w-0 p-4"><Icon className={`mb-1 size-4 ${color}`} aria-hidden="true" /><p className={`truncate text-lg font-bold tabular-nums ${color}`}><bdi>{value}</bdi></p><p className="sk-eyebrow text-ink-subtle">{label}</p></div>;
}

function InvoiceCard({ invoice, focused, fmt, onPending, canPay }: { invoice: Statement["invoices"][number]; focused: boolean; fmt: (amount: number) => string; onPending: (ref: string) => void; canPay: boolean }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focused) card.current?.scrollIntoView({ block: "center" }); }, [focused]);
  return <div ref={card} id={`invoice-${invoice.id}`} data-focused-invoice={focused || undefined} data-due-state={invoice.dueState} className={`sk-panel p-4 ${focused ? "ring-2 ring-primary" : ""}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="text-sm font-bold text-ink-strong"><bdi>{invoice.invoiceNumber || ui("Invoice")}</bdi></p><p className="text-xs text-ink-muted">{invoice.installments ? ui("Paid in instalments") : invoice.dueState === "NOT_YET_DUE" ? ui("Due on {0}; it is not overdue.", [date(invoice.dueDate)]) : ui("Due {0}", [date(invoice.dueDate)])}</p></div>
      <Badge dot variant={STATE_TONE[invoice.dueState]}>{ui(STATE_LABEL[invoice.dueState])}</Badge>
    </div>
    <dl className="mt-3 grid grid-cols-1 gap-3 text-sm min-[400px]:grid-cols-3">
      <div><dt className="sk-eyebrow text-ink-subtle">{ui("Total")}</dt><dd className="font-bold tabular-nums"><bdi>{fmt(invoice.totalAmount)}</bdi></dd></div>
      <div><dt className="sk-eyebrow text-ink-subtle">{ui("Paid")}</dt><dd className="font-bold tabular-nums text-status-success-text"><bdi>{fmt(invoice.paid)}</bdi></dd></div>
      <div><dt className="sk-eyebrow text-ink-subtle">{ui("Balance")}</dt><dd className={`font-bold tabular-nums ${invoice.balance > 0 && invoice.dueState !== "CANCELLED" ? "text-status-error-text" : "text-ink-muted"}`}><bdi>{fmt(invoice.balance)}</bdi></dd></div>
    </dl>
    {invoice.installments && <div className="mt-3 space-y-1"><p className="sk-eyebrow text-ink-subtle">{ui("Instalment plan")}</p><InstallmentSchedule installments={invoice.installments} currency={invoice.currency} /></div>}
    {(invoice.adjustments ?? []).length > 0 && <ul className="mt-3 space-y-1 text-xs" data-invoice-adjustments>{invoice.adjustments!.map(row => <li key={row.id} className="rounded-lg border border-status-info-border bg-status-info-surface px-3 py-1.5 tabular-nums" data-family-adjustment={row.status}>
      <span className="font-semibold">{row.kind === "REFUND" ? (row.status === "DISBURSED" ? ui("Refund paid: {0}", [fmt(row.amount)]) : ui("Refund approved: {0} — waiting to be paid out", [fmt(row.amount)])) : row.kind === "WAIVER" ? ui("Waiver: {0} less owed (not a cash refund)", [fmt(row.amount)]) : ui("Credit note: {0} less owed (not a cash refund)", [fmt(row.amount)])}</span> · <bdi>{row.publicExplanation}</bdi></li>)}</ul>}
    {invoice.receipts.length > 0 && <ul className="mt-3 space-y-1 text-xs text-ink-muted" data-invoice-receipts>{invoice.receipts.map(receipt => <li key={receipt.id} className="flex flex-wrap items-center gap-x-2">{ui("Receipt")} <bdi dir="ltr">{receipt.receiptNo ?? "—"}</bdi> · <bdi>{fmt(receipt.amount)}</bdi> · {date(receipt.paymentDate)} · <a className="sk-link font-semibold text-primary" href={`/api/fees/payment-pdf?id=${encodeURIComponent(receipt.id)}`} data-receipt-download>{ui("Download receipt")}</a></li>)}</ul>}
    {canPay && invoice.balance > 0 && !["CANCELLED", "PAID"].includes(invoice.dueState) && <OnlinePayAction invoiceId={invoice.id} onPending={onPending} />}
  </div>;
}
