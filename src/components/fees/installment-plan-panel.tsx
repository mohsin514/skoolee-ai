"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { splitEvenly, validatePlan, type InstallmentState } from "@/lib/fees/installments";

// SKO-431: staff split what is still owed on an invoice into dated instalments. One person proposes,
// a different person approves; families only ever see an approved schedule.

type Plan = { id: string; status: "proposed" | "active"; version: number; proposedByYou: boolean; installments: { dueDate: string; amount: number; paid: number; remaining: number; state: InstallmentState }[] };
const STATE_LABEL: Record<InstallmentState, string> = { PAID: "Paid", PART_PAID: "Part paid", OVERDUE: "Overdue", DUE_TODAY: "Due today", NOT_YET_DUE: "Not yet due" };

export function InstallmentSchedule({ installments, currency }: { installments: Plan["installments"]; currency: string }) {
  const ui = useUiText();
  const { money, date } = useLocaleFormat();
  return <ol className="space-y-1 text-xs" data-installment-schedule>{installments.map((item, index) => <li key={item.dueDate} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2" data-installment-state={item.state}>
    <span>{index + 1}. {date(item.dueDate)} · <bdi>{money(item.amount, currency)}</bdi>{item.paid > 0 && item.remaining > 0 ? <> · {ui("{0} remaining", [money(item.remaining, currency)])}</> : null}</span>
    <span className="font-bold">{ui(STATE_LABEL[item.state])}</span>
  </li>)}</ol>;
}

export function InstallmentPlanPanel({ invoiceId, currency }: { invoiceId: string; currency: string }) {
  const ui = useUiText();
  const { money } = useLocaleFormat();
  const [data, setData] = useState<{ today: string; balance: number; plans: Plan[] } | null>(null);
  const [count, setCount] = useState("3"), [firstDue, setFirstDue] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/fees/payment-plans?invoiceId=${encodeURIComponent(invoiceId)}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.success) setData(json.data);
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
      toast.success(success); setFirstDue(""); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : ui("The plan could not be saved.")); } finally { setBusy(false); }
  };
  if (!data) return null;
  const plan = data.plans[0];
  return <section className="space-y-3 rounded-2xl border border-border p-4" data-installment-panel={plan?.status ?? "none"}>
    <h4 className="flex items-center gap-2 text-sm font-bold"><CalendarRange className="size-4 text-primary" aria-hidden="true" />{ui("Instalment plan")}</h4>
    {plan ? <>
      <p className="text-xs text-ink-muted">{plan.status === "active" ? ui("Approved. The family sees this schedule; only past-due instalments count as overdue.") : plan.proposedByYou ? ui("Proposed by you. Another staff member must approve it before the family sees it.") : ui("Proposed by a colleague and waiting for your approval.")}</p>
      <InstallmentSchedule installments={plan.installments} currency={currency} />
      <div className="flex flex-wrap gap-2">
        {plan.status === "proposed" && !plan.proposedByYou && <Button disabled={busy} onClick={() => void act(() => fetch("/api/fees/payment-plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plan.id, version: plan.version, action: "approve" }) }), ui("Instalment plan approved."))}>{ui("Approve plan")}</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => void act(() => fetch("/api/fees/payment-plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plan.id, version: plan.version, action: "cancel" }) }), ui("Instalment plan cancelled."))}>{ui("Cancel plan")}</Button>
      </div>
    </> : data.balance > 0 ? <>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="plan-count" label={ui("Number of instalments")}><Input type="number" min={2} max={24} value={count} onChange={event => setCount(event.target.value)} /></FormField>
        <FormField name="plan-first" label={ui("First instalment due")}><Input type="date" value={firstDue} min={data.today} onChange={event => setFirstDue(event.target.value)} /></FormField>
      </div>
      {preview.length > 0 && <InstallmentSchedule installments={preview.map(item => ({ ...item, paid: 0, remaining: item.amount, state: "NOT_YET_DUE" as const }))} currency={currency} />}
      <p className="text-xs text-ink-muted">{ui("Splits the {0} still owed into monthly instalments. Amounts always add up exactly.", [money(data.balance, currency)])}</p>
      {problem && <p role="alert" className="text-xs text-destructive">{ui(problem)}</p>}
      <Button disabled={busy || !preview.length || Boolean(problem)} onClick={() => void act(() => fetch("/api/fees/payment-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, installments: preview }) }), ui("Instalment plan proposed for approval."))}>{ui("Propose plan")}</Button>
    </> : <p className="text-xs text-ink-muted">{ui("Nothing is owed on this invoice.")}</p>}
    {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
  </section>;
}
