"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Banknote, CalendarClock, CheckCircle2, Receipt } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { OnlinePayAction, PaymentReturnStatus } from "./online-payment";
import { InstallmentSchedule } from "./installment-plan-panel";
import { Button } from "@/components/ui/button";

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
const STATE_STYLE: Record<DueState, string> = { PAID: "bg-emerald-50 text-emerald-700", CANCELLED: "bg-gray-100 text-gray-500", OVERDUE: "bg-rose-50 text-rose-700", DUE_TODAY: "bg-amber-50 text-amber-700", NOT_YET_DUE: "bg-sky-50 text-sky-700" };
const STATE_LABEL: Record<DueState, string> = { PAID: "Paid", CANCELLED: "Cancelled", OVERDUE: "Overdue", DUE_TODAY: "Due today", NOT_YET_DUE: "Not yet due" };

export function FamilyFeeStatement({ studentId, onSummary }: { studentId?: string | null; onSummary?: (summary: { outstanding: number; currency: string | null; fullName: string }) => void }) {
  const ui = useUiText();
  const { money, date } = useLocaleFormat();
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
      report.current?.({ outstanding: json.data.summary.outstanding, currency: json.data.currency, fullName: json.data.student.fullName });
    } catch { setFailed(true); }
  }, [studentId, focusInvoice]);
  useEffect(() => { const timer = setTimeout(() => void load(currency), 0); return () => clearTimeout(timer); }, [load, currency]);
  const settled = () => { if (paymentRef && refreshedFor.current !== paymentRef) { refreshedFor.current = paymentRef; void load(currency); } };

  if (failed) return <div role="alert" className="sk-panel p-5 text-sm">{ui("Fee statement could not be loaded.")} <Button variant="ghost" className="font-bold text-primary underline" onClick={() => void load(currency)}>{ui("Try again")}</Button></div>;
  if (!statement) return <p role="status" className="sk-panel p-5 text-sm text-ink-muted">{ui("Loading fee statement…")}</p>;
  const code = statement.currency ?? "PKR", s = statement.summary, fmt = (amount: number) => money(amount, code);
  return <div className="space-y-4" data-family-statement>
    {paymentRef && <PaymentReturnStatus key={paymentRef} orderRef={paymentRef} onSettled={settled} />}
    {statement.invoices.length === 0 ? <div className="sk-panel p-6 text-center"><Receipt className="mx-auto mb-2 size-6 text-ink-muted" aria-hidden="true" /><p className="font-bold">{ui("No fee obligations are available for this child.")}</p></div> : <>
      {statement.currencies.length > 1 && <label className="block max-w-xs text-sm">{ui("Currency")}<Select aria-label={ui("Currency")} className="mt-1 w-full" value={code} onChange={event => setCurrency(event.target.value)}>{statement.currencies.map(option => <option key={option} value={option}>{option}</option>)}</Select></label>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-statement-summary>
        <Figure icon={Banknote} label={ui("Outstanding")} value={fmt(s.outstanding)} tone="rose" />
        <Figure icon={CalendarClock} label={ui("Overdue")} value={fmt(s.overdue)} tone={s.overdue ? "rose" : "muted"} />
        <Figure icon={CalendarClock} label={ui("Due today")} value={fmt(s.dueToday)} tone={s.dueToday ? "amber" : "muted"} />
        <Figure icon={CheckCircle2} label={ui("Not yet due")} value={fmt(s.notYetDue)} tone="sky" />
      </div>
      <p className="text-xs text-ink-muted" data-statement-reconciliation={s.reconciles ? "ok" : "mismatch"}><bdi>{ui("Charges {0} − payments {1} = {2} owed", [fmt(s.charges), fmt(s.payments), fmt(s.closing)])}</bdi>{" · "}{ui("Dates as of {0} (school calendar)", [date(statement.today)])}{s.reconciles ? "" : ` · ${ui("These figures do not reconcile; please contact the school office.")}`}</p>
      <div className="space-y-3">{statement.invoices.map(invoice => <InvoiceCard key={invoice.id} invoice={invoice} focused={invoice.id === focusInvoice} fmt={fmt} onPending={setPaymentRef} />)}</div>
    </>}
  </div>;
}

function Figure({ icon: Icon, label, value, tone }: { icon: typeof Banknote; label: string; value: string; tone: "rose" | "amber" | "sky" | "muted" }) {
  const color = { rose: "text-rose-600", amber: "text-amber-600", sky: "text-sky-700", muted: "text-ink-muted" }[tone];
  return <div className="sk-panel p-4"><Icon className={`mb-1 size-4 ${color}`} aria-hidden="true" /><p className={`text-lg font-bold tabular-nums ${color}`}><bdi>{value}</bdi></p><p className="text-2xs font-semibold uppercase text-ink-subtle">{label}</p></div>;
}

function InvoiceCard({ invoice, focused, fmt, onPending }: { invoice: Statement["invoices"][number]; focused: boolean; fmt: (amount: number) => string; onPending: (ref: string) => void }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focused) card.current?.scrollIntoView({ block: "center" }); }, [focused]);
  return <div ref={card} id={`invoice-${invoice.id}`} data-focused-invoice={focused || undefined} data-due-state={invoice.dueState} className={`sk-panel p-4 ${focused ? "ring-2 ring-primary" : ""}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-sm font-bold"><bdi>{invoice.invoiceNumber || ui("Invoice")}</bdi></p><p className="text-xs text-ink-muted">{invoice.installments ? ui("Paid in instalments") : invoice.dueState === "NOT_YET_DUE" ? ui("Due on {0}; it is not overdue.", [date(invoice.dueDate)]) : ui("Due {0}", [date(invoice.dueDate)])}</p></div>
      <span className={`rounded-lg px-2 py-1 text-2xs font-semibold uppercase ${STATE_STYLE[invoice.dueState]}`}>{ui(STATE_LABEL[invoice.dueState])}</span>
    </div>
    <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
      <div><dt className="text-2xs font-semibold uppercase text-ink-subtle">{ui("Total")}</dt><dd className="font-bold tabular-nums"><bdi>{fmt(invoice.totalAmount)}</bdi></dd></div>
      <div><dt className="text-2xs font-semibold uppercase text-ink-subtle">{ui("Paid")}</dt><dd className="font-bold tabular-nums text-emerald-600"><bdi>{fmt(invoice.paid)}</bdi></dd></div>
      <div><dt className="text-2xs font-semibold uppercase text-ink-subtle">{ui("Balance")}</dt><dd className={`font-bold tabular-nums ${invoice.balance > 0 && invoice.dueState !== "CANCELLED" ? "text-rose-600" : "text-ink-muted"}`}><bdi>{fmt(invoice.balance)}</bdi></dd></div>
    </dl>
    {invoice.installments && <div className="mt-3 space-y-1"><p className="text-2xs font-semibold uppercase text-ink-subtle">{ui("Instalment plan")}</p><InstallmentSchedule installments={invoice.installments} currency={invoice.currency} /></div>}
    {(invoice.adjustments ?? []).length > 0 && <ul className="mt-3 space-y-1 text-xs" data-invoice-adjustments>{invoice.adjustments!.map(row => <li key={row.id} className="rounded-lg bg-sky-50 px-3 py-1.5" data-family-adjustment={row.status}>
      <span className="font-bold">{row.kind === "REFUND" ? (row.status === "DISBURSED" ? ui("Refund paid: {0}", [fmt(row.amount)]) : ui("Refund approved: {0} — waiting to be paid out", [fmt(row.amount)])) : row.kind === "WAIVER" ? ui("Waiver: {0} less owed (not a cash refund)", [fmt(row.amount)]) : ui("Credit note: {0} less owed (not a cash refund)", [fmt(row.amount)])}</span> · <bdi>{row.publicExplanation}</bdi></li>)}</ul>}
    {invoice.receipts.length > 0 && <ul className="mt-3 space-y-1 text-xs text-ink-muted" data-invoice-receipts>{invoice.receipts.map(receipt => <li key={receipt.id} className="flex flex-wrap items-center gap-x-2">{ui("Receipt")} <bdi dir="ltr">{receipt.receiptNo ?? "—"}</bdi> · <bdi>{fmt(receipt.amount)}</bdi> · {date(receipt.paymentDate)} · <a className="font-bold text-primary underline-offset-2 hover:underline" href={`/api/fees/payment-pdf?id=${encodeURIComponent(receipt.id)}`} data-receipt-download>{ui("Download receipt")}</a></li>)}</ul>}
    {invoice.balance > 0 && !["CANCELLED", "PAID"].includes(invoice.dueState) && <OnlinePayAction invoiceId={invoice.id} onPending={onPending} />}
  </div>;
}
