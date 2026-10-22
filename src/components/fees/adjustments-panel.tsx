"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Scale } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { rupeesToPaisa } from "./fee-utils";

// SKO-433: refunds, credit notes and waivers. The effect is named before anything is requested; the
// requester cannot decide; a refund is "approved, waiting for disbursement" until finance confirms it.
// role-ux §2.5: the finance desk requests and the campus admin decides. The server says, per row, which
// controls this viewer may use (canDecide / needsReason / canRecord), so nothing is shown and then refused.
// A campus admin with no other admin on the campus may decide their own request (SD3) with a typed reason;
// the record then carries a "Self-approved" badge.

type Adjustment = { id: string; kind: "REFUND" | "CREDIT_NOTE" | "WAIVER"; status: string; amount: number; invoiceAmount: number; creditAmount: number; currency: string; reasonCategory: string; reason: string; publicExplanation: string; requesterName: string; approverName: string | null; mine: boolean; invoiceId: string; disbursementRef: string | null; canDecide?: boolean; needsReason?: boolean; canRecord?: boolean; selfApproved?: boolean };
const KIND_LABEL = { REFUND: "Refund", CREDIT_NOTE: "Credit note", WAIVER: "Waiver" } as const;
const STATUS_LABEL: Record<string, string> = { REQUESTED: "Awaiting approval", DECLINED: "Declined", APPLIED: "Applied", APPROVED: "Approved — waiting for disbursement", DISBURSED: "Refund paid out", FAILED: "Refund failed" };
const EFFECT: Record<Adjustment["kind"], string> = {
  REFUND: "A refund returns cash to the family and reopens what was paid on this invoice. Approval is not disbursement.",
  CREDIT_NOTE: "A credit reduces the amount owed; it does not return cash.",
  WAIVER: "A waiver forgives part of the amount owed; it does not return cash.",
};
const STATUS_TONE: Record<string, "warning" | "danger" | "success" | "info" | "neutral"> = { REQUESTED: "warning", DECLINED: "neutral", APPLIED: "success", APPROVED: "info", DISBURSED: "success", FAILED: "danger" };
const CATEGORIES = ["WITHDRAWAL", "OVERPAYMENT", "BILLING_ERROR", "HARDSHIP", "SCHOLARSHIP", "SIBLING_POLICY", "OTHER"] as const;
const CATEGORY_LABEL: Record<string, string> = { WITHDRAWAL: "Withdrawal", OVERPAYMENT: "Overpayment", BILLING_ERROR: "Billing error", HARDSHIP: "Financial hardship", SCHOLARSHIP: "Scholarship", SIBLING_POLICY: "Sibling policy", OTHER: "Other" };

function AdjustmentRow({ row, onChanged }: { row: Adjustment; onChanged: () => void }) {
  const ui = useUiText();
  const { money } = useLocaleFormat();
  const [reference, setReference] = useState(""), [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"approve" | "decline" | "failed" | null>(null);
  const act = async (action: string, reason?: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/fees/adjustments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, action, reference, ...(reason ? { reason } : {}) }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || ui("The adjustment could not be updated."));
      toast.success(ui(action === "approve" ? "Adjustment approved." : action === "decline" ? "Adjustment declined." : action === "disbursed" ? "Refund recorded as paid out." : "Refund recorded as failed."));
      setConfirming(null);
      onChanged();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : ui("The adjustment could not be updated.")); } finally { setBusy(false); }
  };
  const amountLabel = money(row.amount, row.currency);
  const kindLabel = ui(KIND_LABEL[row.kind]);
  const selfDecision = row.mine && row.needsReason === true;
  const decide = confirming === "approve" || confirming === "decline";
  return <li className="space-y-2 rounded-xl border border-edge p-3 text-xs leading-relaxed" data-adjustment={row.id} data-adjustment-status={row.status} data-adjustment-kind={row.kind}>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-ink-strong tabular-nums">{kindLabel} · <bdi>{amountLabel}</bdi></span><span className="flex flex-wrap items-center gap-1.5">{row.selfApproved ? <Badge variant="warning" size="sm">{ui("Self-approved")}</Badge> : null}<Badge dot variant={STATUS_TONE[row.status] ?? "neutral"}>{ui(STATUS_LABEL[row.status] ?? row.status)}</Badge></span></div>
    <p className="text-ink-muted">{ui(CATEGORY_LABEL[row.reasonCategory] ?? row.reasonCategory)} · {row.reason}</p>
    <p className="text-ink-muted">{ui("Family sees: {0}", [row.publicExplanation])}</p>
    {row.kind === "REFUND" && row.creditAmount > 0 && <p className="text-ink-muted">{ui("{0} from unapplied credit, {1} from money applied to the invoice.", [money(row.creditAmount, row.currency), money(row.invoiceAmount, row.currency)])}</p>}
    <p className="text-ink-subtle">{ui("Requested by {0}", [row.requesterName])}{row.approverName ? ` · ${ui("Decided by {0}", [row.approverName])}` : ""}{row.disbursementRef ? ` · ${ui("Reference {0}", [row.disbursementRef])}` : ""}</p>
    {row.status === "REQUESTED" && (row.canDecide
      ? <div className="flex flex-wrap items-center gap-2">
          {selfDecision ? <p className="basis-full font-medium text-status-warning-text">{ui("You are the only campus admin here, so you may decide your own request with a reason.")}</p> : null}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming("decline")}>{ui("Decline")}</Button>
          <Button size="sm" disabled={busy} onClick={() => setConfirming("approve")}>{ui("Approve")}</Button>
        </div>
      : <p className="font-medium text-ink-muted" data-own-request={row.mine || undefined}>{ui(row.mine ? "Sent to a campus admin for approval." : "Waiting for a campus admin to decide.")}</p>)}
    {row.status === "APPROVED" && row.kind === "REFUND" && row.canRecord !== false && <div className="flex flex-wrap items-end gap-2"><FormField name={`ref-${row.id}`} label={ui("Bank or cash reference")} hint={ui("At least 3 characters.")}><Input value={reference} maxLength={120} onChange={event => setReference(event.target.value)} /></FormField><Button size="sm" loading={busy} disabled={busy || reference.trim().length < 3} onClick={() => void act("disbursed")}>{ui("Record refund paid out")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming("failed")}>{ui("Record refund failed")}</Button></div>}
    <ConfirmAction
      open={decide}
      busy={busy}
      tone={selfDecision ? "warning" : confirming === "decline" ? "danger" : "primary"}
      title={ui(confirming === "decline" ? "Decline this {0}?" : "Approve this {0}?", [kindLabel.toLocaleLowerCase()])}
      description={ui(confirming === "decline"
        ? "{0} for {1} is closed and the amount is released. The finance desk can request again from current values."
        : row.kind === "REFUND"
          ? "{0} for {1} is approved. The finance desk then pays it out and records the reference; nothing moves until then."
          : "{0} for {1} is applied to the invoice now and the family sees the explanation.", [kindLabel, amountLabel])}
      confirmLabel={ui(confirming === "decline" ? "Decline" : "Approve")}
      cancelLabel={ui("Keep editing")}
      // Every approve / decline is a money decision with a typed reason kept in the audit row (R3, §4.5.5, P8-10);
      // deciding one's own request (SD3) asks why the maker is also the checker.
      requireReason={selfDecision
        ? { label: ui("Why are you deciding your own request?"), minLength: 10, placeholder: ui("For example: no other campus admin is appointed yet.") }
        : { label: ui("Reason for this decision"), minLength: 10, placeholder: ui("For example: checked the receipt and the fee policy.") }}
      onConfirm={(reason?: string) => void act(confirming === "decline" ? "decline" : "approve", reason)}
      onCancel={() => setConfirming(null)}
    />
    <ConfirmAction
      open={confirming === "failed"}
      busy={busy}
      tone="danger"
      title={ui("Record this refund as failed?")}
      description={ui("The refund stays unpaid and the family's balance does not change. Request a new refund if the money still needs to go back.")}
      confirmLabel={ui("Record refund failed")}
      cancelLabel={ui("Keep editing")}
      onConfirm={() => void act("failed")}
      onCancel={() => setConfirming(null)}
    />
  </li>;
}

export function InvoiceAdjustmentsPanel({ invoice, onChanged, canRequest = true }: { invoice: { id: string; currency: string; balanceDue: number; payments?: { id: string; amount: number; receiptNo: string | null }[] }; onChanged?: () => void; /** The finance desk requests; a campus admin without the desk only decides (role-ux §2.4 #80). */ canRequest?: boolean }) {
  const ui = useUiText();
  const { money } = useLocaleFormat();
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<Adjustment[]>([]), [kind, setKind] = useState<Adjustment["kind"]>("CREDIT_NOTE"), [amount, setAmount] = useState(""), [paymentId, setPaymentId] = useState(""), [category, setCategory] = useState<string>("BILLING_ERROR"), [reason, setReason] = useState(""), [explanation, setExplanation] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const key = useRef<{ fingerprint: string; key: string } | null>(null);
  // A failed load says so in place with a retry (R4), never reads as "no adjustments".
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/fees/adjustments?invoiceId=${encodeURIComponent(invoice.id)}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error("load");
      setRows(json.data);
      setLoadFailed(false);
    } catch { setLoadFailed(true); }
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
      toast.success(ui("Adjustment requested. A campus admin decides it next."));
      key.current = null; setAmount(""); setReason(""); setExplanation(""); setNote(""); await load(); onChanged?.();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : ui("The adjustment could not be requested.")); } finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-2xl border border-edge p-4" data-adjustments-panel>
    <h4 className="flex items-center gap-2 text-sm font-bold text-ink-strong"><Scale className="size-4 text-primary" aria-hidden="true" />{ui("Refunds, credits and waivers")}</h4>
    {loadFailed ? <ErrorState variant="panel" title={ui("Adjustments could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} retryLabel={ui("Try again")} className="py-6" /> : null}
    {rows.length > 0 && <ul className="space-y-2">{rows.map(row => <AdjustmentRow key={row.id} row={row} onChanged={() => { void load(); onChanged?.(); }} />)}</ul>}
    {!canRequest && !rows.length && !loadFailed ? <p className="text-xs text-ink-muted">{ui("No refunds, credits or waivers on this invoice.")}</p> : null}
    {canRequest ? <>
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField name="adjustment-kind" label={ui("Adjustment type")}><Select value={kind} onChange={event => setKind(event.target.value as Adjustment["kind"])}>{(["CREDIT_NOTE", "WAIVER", "REFUND"] as const).map(option => <option key={option} value={option}>{ui(KIND_LABEL[option])}</option>)}</Select></FormField>
      <FormField name="adjustment-amount" label={ui("Amount ({0})", [invoice.currency])} required hint={ui("Enter the amount in {0}, for example 1500.", [invoice.currency])}><Input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></FormField>
      {kind === "REFUND" && <FormField name="adjustment-payment" label={ui("Payment to refund")} required><Select value={paymentId} onChange={event => setPaymentId(event.target.value)}><option value="">{ui("Choose a payment")}</option>{payments.map(payment => <option key={payment.id} value={payment.id}>{payment.receiptNo ?? payment.id} · {money(payment.amount, invoice.currency)}</option>)}</Select></FormField>}
      <FormField name="adjustment-category" label={ui("Reason category")}><Select value={category} onChange={event => setCategory(event.target.value)}>{CATEGORIES.map(option => <option key={option} value={option}>{ui(CATEGORY_LABEL[option])}</option>)}</Select></FormField>
    </div>
    <FormField name="adjustment-reason" label={ui("Reason and evidence (staff only)")} required hint={ui("At least 3 characters.")}><Input value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></FormField>
    <FormField name="adjustment-public" label={ui("Explanation the family will see")} required hint={ui("At least 3 characters.")}><Input value={explanation} maxLength={2000} onChange={event => setExplanation(event.target.value)} /></FormField>
    <FormField name="adjustment-note" label={ui("Private note (never shown to the family)")} optional><Input value={note} maxLength={4000} onChange={event => setNote(event.target.value)} /></FormField>
    <div data-adjustment-effect><Alert tone="info" compact live="off">{ui(EFFECT[kind])} {kind !== "REFUND" ? ui("Still owed now: {0}.", [money(invoice.balanceDue, invoice.currency)]) : ""}</Alert></div>
    <p className="text-xs text-ink-subtle">{ui("A campus admin approves it before it takes effect.")}</p>
    <Button loading={busy} disabled={busy || !amount || Number(amount) <= 0 || reason.trim().length < 3 || explanation.trim().length < 3 || (kind === "REFUND" && !paymentId)} onClick={() => void submit()}>{ui("Request adjustment")}</Button>
    </> : null}
  </section>;
}

/**
 * Refunds, credits and waivers that need someone: awaiting a campus admin's decision, or approved and waiting for
 * the finance desk to record the payout. The accountant's Today queue (`showEmpty`: an empty queue says so, §4.5.8);
 * elsewhere it renders nothing when empty. A failed load shows an error with a retry, never an empty queue (R4).
 */
export function AdjustmentsQueue({ version = 0, showEmpty = false }: { version?: number; showEmpty?: boolean }) {
  const ui = useUiText();
  const [rows, setRows] = useState<Adjustment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      const results = await Promise.all(["REQUESTED", "APPROVED"].map(async status => {
        const response = await fetch(`/api/fees/adjustments?status=${status}`, { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) throw new Error("load");
        return json.data as Adjustment[];
      }));
      setRows(results.flat());
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load, version]);
  const title = <h3 className="flex items-center gap-2 text-base font-bold text-ink-strong"><Scale className="size-4 text-primary" aria-hidden="true" />{ui("Adjustments needing a decision or disbursement")}</h3>;
  if (failed) return <section className="sk-panel space-y-3 p-5" data-adjustments-queue data-queue-state="error">{title}<ErrorState title={ui("The queue could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} retryLabel={ui("Try again")} className="py-6" /></section>;
  if (!rows) return showEmpty ? <section className="sk-panel space-y-3 p-5" data-adjustments-queue aria-busy="true">{title}<SkeletonList rows={2} label={ui("Loading the queue…")} /></section> : null;
  if (!rows.length) return showEmpty ? <section className="sk-panel space-y-3 p-5" data-adjustments-queue data-queue-state="empty">{title}<EmptyState size="sm" icon={CheckCircle2} title={ui("Nothing is waiting on you.")} description={ui("Refunds, credits and waivers appear here when one needs a decision or a payout.")} /></section> : null;
  return <section className="sk-panel space-y-3 p-5" data-adjustments-queue>
    {title}
    <ul className="space-y-2">{rows.map(row => <AdjustmentRow key={row.id} row={row} onChanged={() => void load()} />)}</ul>
  </section>;
}
