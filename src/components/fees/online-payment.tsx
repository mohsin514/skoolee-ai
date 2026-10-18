"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Loader2, RefreshCw, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-431 / SKO-474: families see whether online payment is possible for an invoice before anything
// is created, a pending payment is never offered again, and the return page reports only what the
// server has confirmed.

type Availability = { available: true; mode: "PROVIDER" | "SANDBOX" } | { available: false; reason: "CURRENCY_UNSUPPORTED" | "NOT_CONFIGURED"; supportedCurrencies: string[] };
type OrderStatus = { orderRef: string; status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED"; amount: number; currency: string; invoiceNumber: string | null; balanceDue: number; receiptNo: string | null; confirmedAt: string | null };

/** The pay control for one invoice: a button, a pending notice, or why online payment is unavailable. */
export function OnlinePayAction({ invoiceId, onPending }: { invoiceId: string; onPending: (orderRef: string) => void }) {
  const ui = useUiText();
  const [state, setState] = useState<{ availability: Availability; pending: { orderRef: string } | null } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch(`/api/fees/pay-online?invoiceId=${encodeURIComponent(invoiceId)}`, { cache: "no-store" }).then(r => r.json()).then(json => { if (active && json.success) setState({ availability: json.availability, pending: json.pending }); }).catch(() => undefined);
    return () => { active = false; };
  }, [invoiceId]);
  const pay = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/fees/pay-online", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId }) });
      const json = await response.json().catch(() => ({}));
      if (json.success && json.url) { window.location.assign(json.url); return; }
      if (json.code === "PAYMENT_PENDING" && json.orderRef) { setState(current => current && { ...current, pending: { orderRef: json.orderRef } }); onPending(json.orderRef); return; }
      if (json.code === "PAYMENT_METHOD_UNAVAILABLE") { setState(current => current && { ...current, availability: { available: false, reason: json.reason, supportedCurrencies: json.supportedCurrencies ?? ["PKR"] } }); return; }
      setError(json.error || ui("Could not start online payment"));
    } catch { setError(ui("Could not start online payment")); } finally { setBusy(false); }
  };
  if (!state) return null;
  if (state.pending) return <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800" data-pay-state="pending"><Clock3 className="size-4" aria-hidden="true" />{ui("A payment is waiting for confirmation. Please do not pay again yet.")}<Button variant="outline" size="sm" onClick={() => onPending(state.pending!.orderRef)}>{ui("Check status")}</Button></div>;
  if (!state.availability.available) return <p className="mt-4 rounded-xl bg-muted p-3 text-xs text-ink-muted" data-pay-state="unavailable" data-pay-reason={state.availability.reason}>{state.availability.reason === "CURRENCY_UNSUPPORTED" ? ui("Online payment supports PKR invoices only. Please pay this invoice through the school's offline payment methods.") : ui("Online payment is not set up for this school yet. Please pay through the school's offline payment methods.")}</p>;
  return <div className="mt-4 space-y-2" data-pay-state="available">
    <Button variant="default" type="button" onClick={() => void pay()} disabled={busy} className="flex w-full items-center justify-center gap-2 py-2.5">
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Wallet className="size-4" aria-hidden="true" />}
      {busy ? ui("Starting SafePay...") : ui("Pay Now (SafePay)")}
    </Button>
    {state.availability.mode === "SANDBOX" && <p className="text-2xs text-ink-muted">{ui("Test mode: no real money is taken.")}</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

/** After the hosted checkout: the server's status for the order, re-checked until it settles. */
export function PaymentReturnStatus({ orderRef, onSettled }: { orderRef: string; onSettled?: () => void }) {
  const ui = useUiText();
  const { money, date } = useLocaleFormat();
  const [order, setOrder] = useState<OrderStatus | null>(null), [failed, setFailed] = useState(false), [checking, setChecking] = useState(false);
  const settled = useRef(false), polls = useRef(0), notify = useRef(onSettled);
  useEffect(() => { notify.current = onSettled; }, [onSettled]);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch(`/api/fees/pay-online?ref=${encodeURIComponent(orderRef)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) { setFailed(true); return; }
      setFailed(false); setOrder(json.order);
      if (json.order.status !== "PENDING" && !settled.current) { settled.current = true; notify.current?.(); }
    } catch { setFailed(true); } finally { setChecking(false); }
  }, [orderRef]);
  useEffect(() => {
    const first = setTimeout(() => void check(), 0);
    // Re-check while pending, for about two minutes; the refresh button stays available after that.
    const timer = setInterval(() => { if (settled.current || ++polls.current > 24) { clearInterval(timer); return; } void check(); }, 5000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [check]);
  const tone = !order || order.status === "PENDING" ? "border-amber-200 bg-amber-50 text-amber-900" : order.status === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900";
  return <section role="status" aria-live="polite" className={`sk-panel flex flex-wrap items-start justify-between gap-3 border p-4 ${tone}`} data-payment-return={order?.status ?? (failed ? "UNKNOWN" : "CHECKING")}>
    <div className="flex min-w-0 items-start gap-3">
      {!order || order.status === "PENDING" ? <Clock3 className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : order.status === "COMPLETED" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 space-y-1 text-sm">
        <p className="font-bold">{failed ? ui("We could not check this payment right now.") : !order ? ui("Checking your payment…") : order.status === "PENDING" ? ui("Your payment is pending confirmation. Please do not pay again yet.") : order.status === "COMPLETED" ? ui("Payment confirmed and allocated. Your receipt is ready.") : ui("The payment provider reported that this payment did not complete. No receipt was issued.")}</p>
        {order && <p className="text-xs opacity-80"><bdi>{order.invoiceNumber ?? ""}</bdi>{order.invoiceNumber ? " · " : ""}<bdi>{money(order.amount, order.currency)}</bdi>{" · "}{ui("Reference")} <bdi dir="ltr">{order.orderRef}</bdi>{order.receiptNo ? <> · {ui("Receipt")} <bdi dir="ltr">{order.receiptNo}</bdi></> : null}{order.confirmedAt ? ` · ${date(order.confirmedAt)}` : ""}</p>}
      </div>
    </div>
    {(!order || order.status === "PENDING" || failed) && <Button variant="outline" size="sm" disabled={checking} onClick={() => void check()}><RefreshCw className="size-4" aria-hidden="true" />{ui("Check status")}</Button>}
  </section>;
}
