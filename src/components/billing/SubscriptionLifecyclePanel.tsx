"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-373: the institution's software subscription — never family tuition.
// Every consequential action is previewed first and says what changes now,
// at renewal and after access ends; refunds and extra grace are requests for
// review, never promises.

type Preview = {
  currentPlan: string;
  proposedPlan: string;
  billingPeriod: "monthly" | "annual";
  proposedAmount: number | null;
  priceCurrency: string;
  currentUsage: { campuses: number; students: number; teachers: number };
  proposedCapacity: { campuses: number; students: number; teachers: number };
  overages: { campuses: number; students: number; teachers: number };
  recordsRetained: boolean;
  operationPolicy: string;
  effectiveAt: string | null;
  chargePreview: string;
};
type CancelPreview = { plan: string; alreadyScheduled: boolean; effectiveAt: string | null; providerManaged: boolean; reviewRequired: boolean; consequences: string[] };
type Lifecycle = {
  canManage?: boolean;
  billingContact?: { fullName: string; email: string } | null;
  institutionName?: string;
  school: { name: string; plan: string; status: string; subscriptionLifecycleState: string; planEndsAt: string | null; cancellationEffectiveAt: string | null; graceEndsAt: string | null; stripeSubscriptionId?: string | null };
  requests: Array<{ id: string; kind: string; state: string; requestedPlan: string | null; effectiveAt: string | null; createdAt: string; details?: Record<string, any> }>;
};
type Action = "preview" | "request-change" | "cancel-preview" | "cancel" | "resume" | "grace" | "refund";

/** Plain-language meaning of each lifecycle state. */
const STATE: Record<string, { label: string; meaning: string; tone: "ok" | "warn" | "bad" }> = {
  TRIAL: { label: "Trial", meaning: "Full access during the trial. Choose a plan before the trial ends to keep using the school workspace.", tone: "ok" },
  ACTIVE: { label: "Active", meaning: "The subscription is paid and renews on the renewal date.", tone: "ok" },
  PENDING_PAYMENT: { label: "Payment pending", meaning: "The payment provider has not confirmed payment yet. Access stays as it is until it does.", tone: "warn" },
  PAST_DUE_GRACE: { label: "Payment overdue — grace period", meaning: "The last renewal payment failed. Everything keeps working until the grace date; update the payment method before then.", tone: "warn" },
  APPROVED_GRACE: { label: "Approved grace period", meaning: "Billing review approved extra time to pay. Everything keeps working until the approved date.", tone: "warn" },
  PAST_DUE: { label: "Payment overdue — access restricted", meaning: "The grace period ended. Records are kept, but the school workspace is restricted until payment is recovered.", tone: "bad" },
  CANCELLATION_SCHEDULED: { label: "Cancellation scheduled", meaning: "Access continues until the effective date and the subscription will not renew. You can resume before then.", tone: "warn" },
  ENDED: { label: "Ended", meaning: "The subscription has ended. Records are kept; choose a plan to restore access.", tone: "bad" },
};
const KIND: Record<string, string> = { PLAN_CHANGE: "Plan change", CANCELLATION: "Cancellation", REFUND: "Refund review", RENEWAL_RECOVERY: "Payment recovery", PAYMENT_REPORT: "Payment report", GRACE_EXTENSION: "Grace extension", RESUME: "Resumed subscription" };
const REQUEST_STATE: Record<string, string> = { PENDING_REVIEW: "Waiting for billing review", REVIEWED_APPROVED: "Approved", REVIEWED_DECLINED: "Declined", CHECKOUT_STARTED: "Checkout started", VERIFIED_ACTIVE: "Confirmed by the provider", SCHEDULED: "Scheduled", COMPLETED: "Completed", WITHDRAWN: "Withdrawn" };
const AMOUNT_LABEL = { monthly: "Proposed monthly catalogue amount", annual: "Proposed annual catalogue amount" } as const;
const ITEM_LABEL = { campuses: "Campuses", students: "Students", teachers: "Staff" } as const;
const limitText = (value: number, ui: (s: string) => string) => value < 0 ? ui("unlimited") : String(value);

export function SubscriptionLifecyclePanel() {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [data, setData] = useState<Lifecycle | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [cancelPreview, setCancelPreview] = useState<CancelPreview | null>(null);
  const [plan, setPlan] = useState("BASIC");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [reason, setReason] = useState("");
  const [graceUntil, setGraceUntil] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // One key per intended action, reused on retry so a lost response never creates a second request.
  const keys = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/billing/lifecycle", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Subscription status could not be loaded");
      setData(result);
    } catch (problem) {
      setError(ui(problem instanceof Error ? problem.message : "Subscription status could not be loaded"));
    } finally {
      setLoading(false);
    }
  }, [ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const submit = useCallback(async (action: Action, requestedPlan = plan, requestedPeriod = billingPeriod) => {
    const fingerprint = JSON.stringify({ action, requestedPlan, requestedPeriod, reason, graceUntil });
    keys.current[fingerprint] ??= crypto.randomUUID();
    setSaving(true);
    try {
      const response = await fetch("/api/billing/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, plan: requestedPlan, billingPeriod: requestedPeriod, reason: reason || undefined, graceUntil: graceUntil || undefined, idempotencyKey: keys.current[fingerprint] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Subscription request failed");
      if (action === "preview") { setPreview(result.preview); return; }
      if (action === "cancel-preview") { setCancelPreview(result.preview); return; }
      delete keys.current[fingerprint];
      toast.success(action === "cancel" && result.providerConfirmed
        ? ui("Cancellation is scheduled for {0}. Records are retained.", [date(result.effectiveAt)])
        : action === "resume" ? ui("The subscription will continue to renew.")
        : ui("Your request is recorded for authorized billing review."));
      setPreview(null); setCancelPreview(null); setReason(""); setGraceUntil("");
      await load();
    } catch (problem) {
      toast.error(ui(problem instanceof Error ? problem.message : "Subscription request failed"));
    } finally {
      setSaving(false);
    }
  }, [plan, billingPeriod, reason, graceUntil, ui, date, load]);

  useEffect(() => {
    const onPlanReview = (event: Event) => {
      const detail = (event as CustomEvent<{ plan: string; billingPeriod: "monthly" | "annual" }>).detail;
      setPlan(detail.plan);
      setBillingPeriod(detail.billingPeriod);
      void submit("preview", detail.plan, detail.billingPeriod);
    };
    window.addEventListener("subscription-plan-review", onPlanReview);
    return () => window.removeEventListener("subscription-plan-review", onPlanReview);
  }, [submit]);

  const recoverPayment = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Payment recovery is unavailable");
      window.location.assign(result.url);
    } catch (problem) {
      toast.error(ui(problem instanceof Error ? problem.message : "Payment recovery is unavailable"));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <section className="rounded-xl border bg-white p-5" aria-busy="true" role="status">{ui("Loading subscription status…")}</section>;
  if (!data) return <section className="rounded-xl border bg-white p-5" role="alert">{error || ui("Subscription status is unavailable. Retry or contact your billing owner.")} <Button size="sm" variant="secondary" onClick={() => void load()}>{ui("Retry")}</Button></section>;
  if (data.canManage === false) return <section className="rounded-xl border bg-white p-5" data-billing-contact>
    <h2 className="text-lg font-bold">{ui("Billing owner")}</h2>
    <p className="mt-1 text-sm text-slate-700">{ui("The {0} software subscription is managed by its authorized billing owner. Family tuition stays under Fees.", [data.institutionName || ui("institution")])}</p>
    {data.billingContact ? <p className="mt-2 text-sm">{ui("Contact")} <bdi>{data.billingContact.fullName}</bdi> · <a className="underline" href={`mailto:${data.billingContact.email}`}><bdi>{data.billingContact.email}</bdi></a></p> : <p className="mt-2 text-sm">{ui("Ask your institution owner to assign a billing contact.")}</p>}
  </section>;

  const school = data.school;
  const state = STATE[school.subscriptionLifecycleState] ?? { label: school.subscriptionLifecycleState, meaning: "", tone: "warn" as const };
  const overdue = ["PAST_DUE", "PAST_DUE_GRACE", "APPROVED_GRACE"].includes(school.subscriptionLifecycleState) || school.status === "SUSPENDED";
  const scheduled = school.subscriptionLifecycleState === "CANCELLATION_SCHEDULED";
  const pendingGrace = data.requests.some(request => request.kind === "GRACE_EXTENSION" && request.state === "PENDING_REVIEW");
  const approvedChange = data.requests.find(request => request.kind === "PLAN_CHANGE" && request.state === "REVIEWED_APPROVED" && request.requestedPlan === plan && request.details?.preview?.billingPeriod === billingPeriod);
  const toneClass = state.tone === "ok" ? "bg-emerald-50 text-emerald-900" : state.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-rose-50 text-rose-900";

  return <section className="space-y-4 rounded-xl border bg-white p-5" aria-labelledby="subscription-lifecycle-title" data-subscription-lifecycle data-state={school.subscriptionLifecycleState}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">{ui("Institution software subscription")}</p>
        <h2 id="subscription-lifecycle-title" className="mt-1 text-xl font-bold"><bdi>{school.name}</bdi></h2>
        <p className="mt-1 text-sm text-slate-600">{ui("Plan")}: {school.plan} · {ui("Renewal date")}: {school.planEndsAt ? date(school.planEndsAt) : ui("Not set")}</p>
        <p className="mt-1 text-xs text-slate-500">{ui("This covers the whole institution. Family tuition is billed separately under Fees.")}</p>
      </div>
      <div className={`max-w-md rounded-lg px-3 py-2 text-sm ${toneClass}`} role="status" data-state-explainer>
        <p className="font-bold">{ui(state.label)}</p>
        {state.meaning ? <p>{ui(state.meaning)}</p> : null}
        {scheduled && school.cancellationEffectiveAt ? <p className="mt-1 font-semibold">{ui("Effective date")}: {date(school.cancellationEffectiveAt)}</p> : null}
        {school.graceEndsAt && overdue ? <p className="mt-1 font-semibold">{ui("Grace ends")}: {date(school.graceEndsAt)}</p> : null}
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
      <FormField name="lifecycle-plan" label={ui("Plan to review")}>
        <Select value={plan} onChange={event => setPlan(event.target.value)}><option value="BASIC">{ui("Basic")}</option><option value="PRO">{ui("Pro")}</option></Select>
      </FormField>
      <FormField name="lifecycle-period" label={ui("Billing period")}>
        <Select value={billingPeriod} onChange={event => setBillingPeriod(event.target.value as "monthly" | "annual")}><option value="monthly">{ui("Monthly")}</option><option value="annual">{ui("Annual")}</option></Select>
      </FormField>
      <div><Button type="button" variant="outline" disabled={saving} onClick={() => void submit("preview")}>{ui("Preview change")}</Button></div>
    </div>

    {preview && <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50/50 p-4" data-plan-preview>
      <h3 className="font-semibold">{ui("Current plan")}: {preview.currentPlan} · {ui("Proposed plan")}: {preview.proposedPlan}</h3>
      <p className="text-sm">{ui(AMOUNT_LABEL[preview.billingPeriod])}: <bdi>{preview.priceCurrency} {preview.proposedAmount == null ? ui("Custom quote") : preview.proposedAmount.toLocaleString()}</bdi></p>
      <div className="overflow-x-auto"><table className="w-full min-w-[320px] text-sm" data-capacity-compare>
        <caption className="sr-only">{ui("Usage compared with the proposed plan")}</caption>
        <thead><tr className="text-start text-xs text-slate-500"><th scope="col" className="text-start">{ui("Item")}</th><th scope="col" className="text-start">{ui("In use now")}</th><th scope="col" className="text-start">{ui("Proposed limit")}</th><th scope="col" className="text-start">{ui("Over the limit")}</th></tr></thead>
        <tbody>{(["campuses", "students", "teachers"] as const).map(key => <tr key={key} className={preview.overages[key] ? "font-semibold text-amber-900" : ""}>
          <th scope="row" className="text-start font-normal">{ui(ITEM_LABEL[key])}</th>
          <td>{preview.currentUsage[key]}</td><td>{limitText(preview.proposedCapacity[key], ui)}</td><td>{preview.overages[key] || "—"}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="text-sm">{ui("Effective date")}: {preview.effectiveAt ? date(preview.effectiveAt) : ui("Not set")}. {ui(preview.operationPolicy)} {preview.recordsRetained ? ui("Records are retained.") : ""}</p>
      <p className="text-sm">{ui("Any proration or renewal charge is confirmed by the payment provider or billing review before payment.")}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={saving} onClick={() => void submit("request-change")}>{ui("Confirm change request")}</Button>
        <Button variant="outline" disabled={saving} onClick={() => setPreview(null)}>{ui("Keep current plan")}</Button>
        {approvedChange && !school.stripeSubscriptionId && <Button disabled={saving} onClick={() => window.dispatchEvent(new CustomEvent("subscription-proceed-checkout", { detail: { plan, billingPeriod } }))}>{ui("Continue to checkout")}</Button>}
      </div>
      {approvedChange && school.stripeSubscriptionId && <p className="text-sm">{ui("This change was reviewed. Open the payment provider portal to confirm the provider terms.")}</p>}
    </div>}

    <FormField name="lifecycle-reason" label={ui("Reason for billing review")}>
      <Textarea maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder={ui("Details for the authorized billing reviewer")} />
    </FormField>

    {cancelPreview && <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4" role="group" aria-labelledby="cancel-preview-title" data-cancel-preview>
      <h3 id="cancel-preview-title" className="font-semibold">{ui("Before you cancel")}</h3>
      <p className="text-sm font-semibold">{ui("Effective date")}: {cancelPreview.effectiveAt ? date(cancelPreview.effectiveAt) : ui("Confirmed by billing review")}</p>
      <ul className="list-disc space-y-1 ps-5 text-sm">{cancelPreview.consequences.map(line => <li key={line}>{ui(line)}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <Button disabled={saving} onClick={() => void submit("cancel")}>{cancelPreview.reviewRequired ? ui("Request cancellation") : ui("Confirm cancellation")}</Button>
        <Button variant="outline" disabled={saving} onClick={() => setCancelPreview(null)}>{ui("Keep subscription")}</Button>
      </div>
    </div>}

    {overdue && <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr] sm:items-end" data-grace-request>
      <FormField name="lifecycle-grace-until" label={ui("Pay by (within 30 days)")}><Input type="date" value={graceUntil} onChange={event => setGraceUntil(event.target.value)} /></FormField>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={saving || pendingGrace || !graceUntil || reason.trim().length < 10} onClick={() => void submit("grace")}>{ui("Request more time to pay")}</Button>
        <span className="text-xs text-slate-600">{pendingGrace ? ui("A grace request is waiting for billing review.") : ui("Extra time is an exception approved by billing review, not an automatic right. Give a reason above.")}</span>
      </div>
    </div>}

    <div className="flex flex-wrap gap-2">
      {scheduled
        ? <Button type="button" disabled={saving} onClick={() => void submit("resume")}>{ui("Resume subscription")}</Button>
        : <Button type="button" variant="outline" disabled={saving || Boolean(cancelPreview)} onClick={() => void submit("cancel-preview")}>{ui("Cancel subscription…")}</Button>}
      <Button type="button" variant="outline" disabled={saving || reason.trim().length < 10} onClick={() => void submit("refund")} title={ui("A refund request is reviewed; it is not an approved refund.")}>{ui("Request refund review")}</Button>
      {school.stripeSubscriptionId ? <Button type="button" variant="outline" disabled={saving} onClick={() => void recoverPayment()}>{ui("Update payment method")}</Button> : null}
    </div>
    <p className="text-xs text-slate-600">{ui("A refund request is reviewed; it is not an approved refund.")}</p>

    <div className="border-t pt-3">
      <h3 className="text-sm font-semibold">{ui("Recent requests")}</h3>
      {data.requests.length === 0 ? <p className="mt-1 text-sm text-slate-600">{ui("No billing requests yet.")}</p> : <ul className="mt-2 space-y-1 text-sm" data-requests>
        {data.requests.slice(0, 6).map(request => <li key={request.id} data-request-kind={request.kind} data-request-state={request.state}>{ui(KIND[request.kind] ?? request.kind)}{request.requestedPlan ? ` · ${request.requestedPlan}` : ""} · {ui(REQUEST_STATE[request.state] ?? request.state)}{request.effectiveAt ? ` · ${date(request.effectiveAt)}` : ""}</li>)}
      </ul>}
    </div>
  </section>;
}
