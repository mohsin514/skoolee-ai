"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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

type Lifecycle = {
  canManage?: boolean;
  billingContact?: { fullName: string; email: string } | null;
  institutionName?: string;
  school: { name: string; plan: string; status: string; subscriptionLifecycleState: string; planEndsAt: string | null; cancellationEffectiveAt: string | null; graceEndsAt: string | null; stripeSubscriptionId?: string | null };
  requests: Array<{ id: string; kind: string; state: string; requestedPlan: string | null; effectiveAt: string | null; createdAt: string; details?: Record<string, any> }>;
};

export function SubscriptionLifecyclePanel() {
  const [data, setData] = useState<Lifecycle | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [plan, setPlan] = useState("BASIC");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/billing/lifecycle", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Subscription status could not be loaded");
      setData(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subscription status could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (action: "preview" | "request-change" | "cancel" | "refund", requestedPlan = plan, requestedPeriod = billingPeriod) => {
    setSaving(true);
    try {
      const response = await fetch("/api/billing/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, plan: requestedPlan, billingPeriod: requestedPeriod, reason: reason || undefined, idempotencyKey: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Subscription request failed");
      if (action === "preview") setPreview(result.preview);
      else {
        toast.success(action === "cancel" && result.providerConfirmed
          ? `Cancellation is scheduled for ${result.effectiveAt ? new Date(result.effectiveAt).toLocaleDateString() : "the renewal date"}.`
          : "Your request is recorded for authorized billing review.");
        setPreview(null);
        await load();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subscription request failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onPlanReview = (event: Event) => {
      const detail = (event as CustomEvent<{ plan: string; billingPeriod: "monthly" | "annual" }>).detail;
      setPlan(detail.plan);
      setBillingPeriod(detail.billingPeriod);
      void submit("preview", detail.plan, detail.billingPeriod);
    };
    window.addEventListener("subscription-plan-review", onPlanReview);
    return () => window.removeEventListener("subscription-plan-review", onPlanReview);
  }, [plan, billingPeriod, reason]);

  const recoverPayment = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Payment recovery is unavailable");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment recovery is unavailable");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <section className="rounded-xl border bg-white p-5" aria-busy="true">Loading subscription status…</section>;
  if (!data) return <section className="rounded-xl border bg-white p-5">Subscription status is unavailable. Retry or contact your billing owner.</section>;
  if (data.canManage === false) return <section className="rounded-xl border bg-white p-5">
    <h2 className="text-lg font-bold">Billing owner</h2>
    <p className="mt-1 text-sm text-slate-700">The {data.institutionName || "institution"} software subscription is managed by its authorized billing owner. Family tuition stays under Fees.</p>
    {data.billingContact ? <p className="mt-2 text-sm">Contact {data.billingContact.fullName} · <a className="underline" href={`mailto:${data.billingContact.email}`}>{data.billingContact.email}</a></p> : <p className="mt-2 text-sm">Ask your institution owner to assign a billing contact.</p>}
  </section>;

  const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString() : "Not set";
  const approvedChange = data.requests.find(request => request.kind === "PLAN_CHANGE" && request.state === "REVIEWED_APPROVED" && request.requestedPlan === plan && request.details?.preview?.billingPeriod === billingPeriod);
  return <section className="space-y-4 rounded-xl border bg-white p-5" aria-labelledby="subscription-lifecycle-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Institution software subscription</p>
        <h2 id="subscription-lifecycle-title" className="mt-1 text-xl font-bold">{data.school.name}</h2>
        <p className="mt-1 text-sm text-slate-600">{data.school.plan} · {data.school.subscriptionLifecycleState.replaceAll("_", " ").toLowerCase()} · Renewal date {dateLabel(data.school.planEndsAt)}</p>
      </div>
      {data.school.cancellationEffectiveAt && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm">Cancellation scheduled for {dateLabel(data.school.cancellationEffectiveAt)}. Access and records remain available until then.</p>}
      {data.school.graceEndsAt && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm">Payment recovery is available through {dateLabel(data.school.graceEndsAt)}.</p>}
    </div>

    <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
      <label className="text-sm font-medium">Plan to review
        <select className="mt-1 block h-10 w-full rounded-md border px-3" value={plan} onChange={event => setPlan(event.target.value)}>
          <option value="BASIC">Basic</option><option value="PRO">Pro</option>
        </select>
      </label>
      <label className="text-sm font-medium">Billing period
        <select className="mt-1 block h-10 w-full rounded-md border px-3" value={billingPeriod} onChange={event => setBillingPeriod(event.target.value as "monthly" | "annual")}>
          <option value="monthly">Monthly</option><option value="annual">Annual</option>
        </select>
      </label>
      <Button type="button" variant="outline" disabled={saving} onClick={() => void submit("preview")}>Preview change</Button>
    </div>

    {preview && <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50/50 p-4">
      <h3 className="font-semibold">{preview.currentPlan} → {preview.proposedPlan}</h3>
      <p className="text-sm">Proposed {preview.billingPeriod} catalogue amount: <bdi>{preview.priceCurrency} {preview.proposedAmount == null ? "Custom quote" : preview.proposedAmount.toLocaleString()}</bdi>.</p>
      <p className="text-sm">Effective date: {dateLabel(preview.effectiveAt)}. Campuses {preview.currentUsage.campuses}/{preview.proposedCapacity.campuses < 0 ? "unlimited" : preview.proposedCapacity.campuses}; students {preview.currentUsage.students}/{preview.proposedCapacity.students < 0 ? "unlimited" : preview.proposedCapacity.students}; staff {preview.currentUsage.teachers}/{preview.proposedCapacity.teachers < 0 ? "unlimited" : preview.proposedCapacity.teachers}.</p>
      {(preview.overages.campuses || preview.overages.students || preview.overages.teachers) > 0 && <p className="text-sm font-medium text-amber-900">Over limit: {preview.overages.campuses} campuses, {preview.overages.students} students, {preview.overages.teachers} staff.</p>}
      <p className="text-sm">{preview.operationPolicy} {preview.recordsRetained ? "Records are retained." : ""}</p>
      <p className="text-sm">{preview.chargePreview}</p>
      <Button disabled={saving} onClick={() => void submit("request-change")}>Confirm change request</Button>
      {approvedChange && !data.school.stripeSubscriptionId && <Button className="ml-2" disabled={saving} onClick={() => window.dispatchEvent(new CustomEvent("subscription-proceed-checkout", { detail: { plan, billingPeriod } }))}>Continue to checkout</Button>}
      {approvedChange && data.school.stripeSubscriptionId && <p className="text-sm">This change was reviewed. Open the payment provider portal to confirm the provider terms.</p>}
    </div>}

    <label className="block text-sm font-medium">Reason for billing review
      <textarea className="mt-1 block min-h-20 w-full rounded-md border p-3" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Optional details for the authorized billing reviewer" />
    </label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={saving || Boolean(data.school.cancellationEffectiveAt)} onClick={() => void submit("cancel")}>Schedule cancellation</Button>
      <Button type="button" variant="outline" disabled={saving} onClick={() => void submit("refund")}>Request refund review</Button>
      <Button type="button" variant="outline" disabled={saving} onClick={() => void recoverPayment()}>Recover payment</Button>
    </div>
    <div className="border-t pt-3">
      <h3 className="text-sm font-semibold">Recent requests</h3>
      {data.requests.length === 0 ? <p className="mt-1 text-sm text-slate-600">No billing requests yet.</p> : <ul className="mt-2 space-y-1 text-sm">
        {data.requests.slice(0, 5).map(request => <li key={request.id}>{request.kind.replaceAll("_", " ")} · {request.requestedPlan || ""} · {request.state.replaceAll("_", " ")} · {dateLabel(request.effectiveAt)}</li>)}
      </ul>}
    </div>
  </section>;
}
