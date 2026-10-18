"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Scale } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { rupeesToPaisa } from "./fee-utils";

// SKO-433: refunds, credit notes and waivers. The effect is named before anything is requested; the
// requester cannot decide; a refund is "approved, waiting for disbursement" until finance confirms it.

type Adjustment = { id: string; kind: "REFUND" | "CREDIT_NOTE" | "WAIVER"; status: string; amount: number; invoiceAmount: number; creditAmount: number; currency: string; reasonCategory: string; reason: string; publicExplanation: string; requesterName: string; approverName: string | null; mine: boolean; invoiceId: string; disbursementRef: string | null };
const KIND_LABEL = { REFUND: "Refund", CREDIT_NOTE: "Credit note", WAIVER: "Waiver" } as const;
const STATUS_LABEL: Record<string, string> = { REQUESTED: "Awaiting approval", DECLINED: "Declined", APPLIED: "Applied", APPROVED: "Approved — waiting for disbursement", DISBURSED: "Refund paid out", FAILED: "Refund failed" };
const EFFECT: Record<Adjustment["kind"], string> = {
  REFUND: "A refund returns cash to the family and reopens what was paid on this invoice. Approval is not disbursement.",
  CREDIT_NOTE: "A credit reduces the amount owed; it does not return cash.",
  WAIVER: "A waiver forgives part of the amount owed; it does not return cash.",
};
const CATEGORIES = ["WITHDRAWAL", "OVERPAYMENT", "BILLING_ERROR", "HARDSHIP", "SCHOLARSHIP", "SIBLING_POLICY", "OTHER"] as const;
const CATEGORY_LABEL: Record<string, string> = { WITHDRAWAL: "Withdrawal", OVERPAYMENT: "Overpayment", BILLING_ERROR: "Billing error", HARDSHIP: "Financial hardship", SCHOLARSHIP: "Scholarship", SIBLING_POLICY: "Sibling policy", OTHER: "Other" };

function AdjustmentRow({ row, onChanged }: { row: Adjustment; onChanged: () => void }) {
  const ui = useUiText();
  const { money } = useLocaleFormat();
  const [reference, setReference] = useState(""), [busy, setBusy] = useState(false);
  const act = async (action: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/fees/adjustments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, action, reference }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || ui("The adjustment could not be updated."));
      onChanged();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : ui("The adjustment could not be updated.")); } finally { setBusy(false); }
  };
  return <li className="space-y-2 rounded-xl border border-border p-3 text-xs" data-adjustment={row.id} data-adjustment-status={row.status} data-adjustment-kind={row.kind}>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{ui(KIND_LABEL[row.kind])} · <bdi>{money(row.amount, row.currency)}</bdi></span><span className="rounded-lg bg-muted px-2 py-0.5 font-bold">{ui(STATUS_LABEL[row.status] ?? row.status)}</span></div>
    <p className="text-ink-muted">{ui(CATEGORY_LABEL[row.reasonCategory] ?? row.reasonCategory)} · {row.reason}</p>
    <p className="text-ink-muted">{ui("Family sees: {0}", [row.publicExplanation])}</p>
    {row.kind === "REFUND" && row.creditAmount > 0 && <p className="text-ink-muted">{ui("{0} from unapplied credit, {1} from money applied to the invoice.", [money(row.creditAmount, row.currency), money(row.invoiceAmount, row.currency)])}</p>}
    <p className="text-ink-subtle">{ui("Requested by {0}", [row.requesterName])}{row.approverName ? ` · ${ui("Decided by {0}", [row.approverName])}` : ""}{row.disbursementRef ? ` · ${ui("Reference {0}", [row.disbursementRef])}` : ""}</p>
    {row.status === "REQUESTED" && (row.mine ? <p className="font-medium text-amber-700" data-own-request>{ui("You requested this adjustment; another authorized approver must decide.")}</p>
      : <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void act("approve")}>{ui("Approve")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("decline")}>{ui("Decline")}</Button></div>)}
    {row.status === "APPROVED" && <div className="flex flex-wrap items-end gap-2"><FormField name={`ref-${row.id}`} label={ui("Bank or cash reference")}><Input value={reference} maxLength={120} onChange={event => setReference(event.target.value)} /></FormField><Button size="sm" disabled={busy || reference.trim().length < 3} onClick={() => void act("disbursed")}>{ui("Record refund paid out")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("failed")}>{ui("Record refund failed")}</Button></div>}
  </li>;
}

export function InvoiceAdjustmentsPanel({ invoice, onChanged }: { invoice: { id: string; currency: string; balanceDue: number; payments?: { id: string; amount: number; receiptNo: string | null }[] }; onChanged?: () => void }) {
  const ui = useUiText();
  const { money } = useLocaleFormat();
  const [rows, setRows] = useState<Adjustment[]>([]), [kind, setKind] = useState<Adjustment["kind"]>("CREDIT_NOTE"), [amount, setAmount] = useState(""), [paymentId, setPaymentId] = useState(""), [category, setCategory] = useState<string>("BILLING_ERROR"), [reason, setReason] = useState(""), [explanation, setExplanation] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const key = useRef<{ fingerprint: string; key: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/fees/adjustments?invoiceId=${encodeURIComponent(invoice.id)}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.success) setRows(json.data);
  }, [invoice.id]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const payments = (invoice.payments ?? []).filter(payment => payment.amount > 0);
  const submit = async () => {
    setBusy(true);
    try {
      const payload = { kind, invoiceId: invoice.id, paymentId: kind === "REFUND" ? paymentId : null, amount: rupeesToPaisa(amount, invoice.currency), reasonCategory: category, reason, publicExplanation: explanation, privateNote: note };
      const fingerprint = JSON.stringify(payload);
      if (key.current?.fingerprint !== fingerprint) key.current = { fingerprint, key: crypto.randomUUID() };
      const response = await fetch("/api/fees/adjustments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: key.current.key }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || ui("The adjustment could not be requested."));
      toast.success(ui("Adjustment requested. Another authorized approver must decide."));
      key.current = null; setAmount(""); setReason(""); setExplanation(""); setNote(""); await load(); onChanged?.();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : ui("The adjustment could not be requested.")); } finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-2xl border border-border p-4" data-adjustments-panel>
    <h4 className="flex items-center gap-2 text-sm font-bold"><Scale className="size-4 text-primary" aria-hidden="true" />{ui("Refunds, credits and waivers")}</h4>
    {rows.length > 0 && <ul className="space-y-2">{rows.map(row => <AdjustmentRow key={row.id} row={row} onChanged={() => { void load(); onChanged?.(); }} />)}</ul>}
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField name="adjustment-kind" label={ui("Adjustment type")}><Select value={kind} onChange={event => setKind(event.target.value as Adjustment["kind"])}>{(["CREDIT_NOTE", "WAIVER", "REFUND"] as const).map(option => <option key={option} value={option}>{ui(KIND_LABEL[option])}</option>)}</Select></FormField>
      <FormField name="adjustment-amount" label={ui("Amount ({0})", [invoice.currency])}><Input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></FormField>
      {kind === "REFUND" && <FormField name="adjustment-payment" label={ui("Payment to refund")}><Select value={paymentId} onChange={event => setPaymentId(event.target.value)}><option value="">{ui("Choose a payment")}</option>{payments.map(payment => <option key={payment.id} value={payment.id}>{payment.receiptNo ?? payment.id} · {money(payment.amount, invoice.currency)}</option>)}</Select></FormField>}
      <FormField name="adjustment-category" label={ui("Reason category")}><Select value={category} onChange={event => setCategory(event.target.value)}>{CATEGORIES.map(option => <option key={option} value={option}>{ui(CATEGORY_LABEL[option])}</option>)}</Select></FormField>
    </div>
    <FormField name="adjustment-reason" label={ui("Reason and evidence (staff only)")}><Input value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></FormField>
    <FormField name="adjustment-public" label={ui("Explanation the family will see")}><Input value={explanation} maxLength={2000} onChange={event => setExplanation(event.target.value)} /></FormField>
    <FormField name="adjustment-note" label={ui("Private note (never shown to the family)")}><Input value={note} maxLength={4000} onChange={event => setNote(event.target.value)} /></FormField>
    <p className="rounded-xl bg-muted p-3 text-xs" data-adjustment-effect>{ui(EFFECT[kind])} {kind !== "REFUND" ? ui("Still owed now: {0}.", [money(invoice.balanceDue, invoice.currency)]) : ""}</p>
    <Button disabled={busy || !amount || Number(amount) <= 0 || reason.trim().length < 3 || explanation.trim().length < 3 || (kind === "REFUND" && !paymentId)} onClick={() => void submit()}>{ui("Request adjustment")}</Button>
  </section>;
}

export function AdjustmentsQueue({ version = 0 }: { version?: number }) {
  const ui = useUiText();
  const [rows, setRows] = useState<Adjustment[]>([]);
  const load = useCallback(async () => {
    const results = await Promise.all(["REQUESTED", "APPROVED"].map(status => fetch(`/api/fees/adjustments?status=${status}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({}))));
    setRows(results.flatMap(json => json.success ? json.data : []));
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load, version]);
  if (!rows.length) return null;
  return <section className="sk-panel space-y-3 p-5" data-adjustments-queue>
    <h3 className="flex items-center gap-2 text-sm font-bold"><Scale className="size-4 text-primary" aria-hidden="true" />{ui("Adjustments needing a decision or disbursement")}</h3>
    <ul className="space-y-2">{rows.map(row => <AdjustmentRow key={row.id} row={row} onChanged={() => void load()} />)}</ul>
  </section>;
}
