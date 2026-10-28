"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { splitEvenly, validatePlan, type InstallmentState } from "@/lib/fees/installments";

// SKO-431: staff split what is still owed on an invoice into dated instalments. One person proposes,
// a different person approves; families only ever see an approved schedule.

type Plan = { id: string; status: "proposed" | "active"; version: number; proposedByYou: boolean; installments: { dueDate: string; amount: number; paid: number; remaining: number; state: InstallmentState }[] };
const STATE_TONE: Record<InstallmentState, "success" | "info" | "danger" | "warning" | "neutral"> = { PAID: "success", PART_PAID: "info", OVERDUE: "danger", DUE_TODAY: "warning", NOT_YET_DUE: "neutral" };
const STATE_LABEL: Record<InstallmentState, string> = { PAID: "Paid", PART_PAID: "Part paid", OVERDUE: "Overdue", DUE_TODAY: "Due today", NOT_YET_DUE: "Not yet due" };

export function InstallmentSchedule({ installments, currency }: { installments: Plan["installments"]; currency: string }) {
  const ui = useUiText();
  const { money, date } = useLocaleFormat();
  return <ol className="space-y-1 text-xs" data-installment-schedule>{installments.map((item, index) => <li key={item.dueDate} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2" data-installment-state={item.state}>
    <span className="min-w-0 tabular-nums">{index + 1}. {date(item.dueDate)} · <bdi>{money(item.amount, currency)}</bdi>{item.paid > 0 && item.remaining > 0 ? <> · {ui("{0} remaining", [money(item.remaining, currency)])}</> : null}</span>
    <Badge size="sm" dot variant={STATE_TONE[item.state]}>{ui(STATE_LABEL[item.state])}</Badge>
  </li>)}</ol>;
}

/**
 * `canPropose` (default true) is the finance desk. A campus admin who does not hold the desk only decides: they see a
 * proposed plan and approve it in the invoice drawer (role-ux §3.1 "approvals inside the invoice drawer"), but never
 * propose one, and the panel stays out of the way when there is nothing to decide.
 */
export function InstallmentPlanPanel({ invoiceId, currency, canPropose = true }: { invoiceId: string; currency: string; canPropose?: boolean }) {
  const ui = useUiText();
  const { money } = useLocaleFormat();
  const [data, setData] = useState<{ today: string; balance: number; plans: Plan[] } | null>(null);
  const [count, setCount] = useState("3"), [firstDue, setFirstDue] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  // Approving a schedule changes what the family owes and when, so it is confirmed (R3).
  const [approving, setApproving] = useState(false);
  // A failed load says so in place with a retry (R4) instead of the panel silently disappearing.
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/fees/payment-plans?invoiceId=${encodeURIComponent(invoiceId)}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error("load");
      setData(json.data);
      setLoadFailed(false);
    } catch { setLoadFailed(true); }
  }, [invoiceId]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const preview = useMemo(() => data && firstDue && Number(count) >= 2 ? splitEvenly(data.balance, Number(count), firstDue) : [], [data, firstDue, count]);
  const problem = data && preview.length ? validatePlan(preview, data.balance, data.today) : null;
  const act = async (request: () => Promise<Response>, success: string) => {
    setBusy(true); setError("");
    try {
      const response = await request();
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || ui("The plan could not be saved."));
      toast.success(success); setFirstDue(""); await load(); return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : ui("The plan could not be saved.")); return false; } finally { setBusy(false); }
  };
  if (!data) {
    if (!loadFailed) return null;
    return <section className="space-y-2 rounded-2xl border border-edge p-4" data-installment-panel="error">
      <h4 className="flex items-center gap-2 text-sm font-bold text-ink-strong"><CalendarRange className="size-4 text-primary" aria-hidden="true" />{ui("Instalment plan")}</h4>
      <ErrorState title={ui("The instalment plan could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} retryLabel={ui("Try again")} className="py-6" />
    </section>;
  }
  const plan = data.plans[0];
  if (!canPropose && !plan) return null;
  return <section className="space-y-3 rounded-2xl border border-edge p-4" data-installment-panel={plan?.status ?? "none"}>
    <h4 className="flex items-center gap-2 text-sm font-bold text-ink-strong"><CalendarRange className="size-4 text-primary" aria-hidden="true" />{ui("Instalment plan")}</h4>
    {plan ? <>
      <p className="text-xs text-ink-muted">{plan.status === "active" ? ui("Approved. The family sees this schedule; only past-due instalments count as overdue.") : plan.proposedByYou ? ui("Proposed by you. Another staff member must approve it before the family sees it.") : ui("Proposed by a colleague and waiting for your approval.")}</p>
      <InstallmentSchedule installments={plan.installments} currency={currency} />
      <div className="flex flex-wrap gap-2">
        {plan.status === "proposed" && !plan.proposedByYou && <Button disabled={busy} loading={busy} onClick={() => setApproving(true)}>{ui("Approve plan")}</Button>}
        <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => setCancelling(true)}>{ui("Cancel plan")}</Button>
      </div>
      <ConfirmAction
        open={approving}
        busy={busy}
        tone="primary"
        title={ui("Approve this instalment plan?")}
        description={ui("The family is shown this schedule and only past-due instalments count as overdue. You can still cancel the plan later.")}
        confirmLabel={ui("Approve plan")}
        cancelLabel={ui("Keep editing")}
        onConfirm={async () => { if (await act(() => fetch("/api/fees/payment-plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plan.id, version: plan.version, action: "approve" }) }), ui("Instalment plan approved."))) setApproving(false); }}
        onCancel={() => setApproving(false)}
      />
      <ConfirmAction
        open={cancelling}
        busy={busy}
        tone="danger"
        title={ui("Cancel this instalment plan?")}
        description={ui("The schedule is withdrawn and the invoice falls due on its original date again. The family is no longer shown the instalments.")}
        confirmLabel={ui("Cancel plan")}
        cancelLabel={ui("Keep editing")}
        onConfirm={async () => { if (await act(() => fetch("/api/fees/payment-plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plan.id, version: plan.version, action: "cancel" }) }), ui("Instalment plan cancelled."))) setCancelling(false); }}
        onCancel={() => setCancelling(false)}
      />
    </> : canPropose && data.balance > 0 ? <>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="plan-count" label={ui("Number of instalments")} hint={ui("Between 2 and 24.")}><Input type="number" min={2} max={24} value={count} onChange={event => setCount(event.target.value)} /></FormField>
        <FormField name="plan-first" label={ui("First instalment due")} hint={ui("Today or later. Later instalments fall due monthly after this date.")}><Input type="date" value={firstDue} min={data.today} onChange={event => setFirstDue(event.target.value)} /></FormField>
      </div>
      {preview.length > 0 && <InstallmentSchedule installments={preview.map(item => ({ ...item, paid: 0, remaining: item.amount, state: "NOT_YET_DUE" as const }))} currency={currency} />}
      <p className="text-xs text-ink-muted">{ui("Splits the {0} still owed into monthly instalments. Amounts always add up exactly.", [money(data.balance, currency)])}</p>
      {problem && <Alert tone="warning" compact>{ui(problem)}</Alert>}
      <Button loading={busy} disabled={busy || !preview.length || Boolean(problem)} onClick={() => void act(() => fetch("/api/fees/payment-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, installments: preview }) }), ui("Instalment plan proposed for approval."))}>{ui("Propose plan")}</Button>
    </> : <p className="text-xs text-ink-muted">{ui("Nothing is owed on this invoice.")}</p>}
    {error && <Alert tone="danger" compact>{error}</Alert>}
  </section>;
}
