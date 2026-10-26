"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, CheckCircle2, CreditCard, Mail, RefreshCw, ShieldAlert } from "lucide-react";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { AccessNotice } from "@/components/ui/access-notice";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { SkeletonCards } from "@/components/ui/skeleton";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { ANNUAL_DISCOUNT, annualMonthlyPrice, type BillingPeriod } from "@/config/plans";
import { COMMERCIAL_CONTRACT } from "@/config/commercial-contract";
import { countLabel } from "@/lib/locale/count-label";
import { localeTag } from "@/lib/locale/package";
import { cn } from "@/lib/utils";

/**
 * Billing & plan — the institution's SkooleeAI subscription, never family tuition (F2).
 *
 * One workspace replaces PlansPanel + SubscriptionLifecyclePanel and the window events that coupled them:
 * status → plan grid (one period toggle) → preview in a Modal → checkout once the change is approved →
 * payment method → the three consequential requests (cancel, refund review, more time to pay), each behind a
 * ConfirmAction with a typed reason → request history.
 *
 * Who sees what: only a payer (registry key `billing` = authority AND owner/purchase delegate) reaches this;
 * anyone else who lands here by URL sees one AccessNotice naming the payer, never an email (§1.5, R6).
 * Cancel, refund and payment-method changes need two-step sign-in on the server (G6); without it those three
 * are not offered and one Alert links to /account/security (F28, K-I5).
 * Return parameters from Stripe/SafePay (`success`, `canceled`, `session_id`, `safepay_status`) produce one
 * toast and a status Alert, then are stripped from the address bar (§6.2).
 */

type PlanType = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
interface PlanDetails { type: PlanType; name: string; price: number | null; priceLabel: string; features: string[]; aiCredits: number; maxStudents: number; maxTeachers: number; maxCampuses: number; isCustom?: boolean }
interface BillingSnapshot {
  canPurchaseSubscription?: boolean;
  school: { plan: PlanType; status: string; aiCreditsUsed: number; aiCreditsLimit: number; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null };
  limits: PlanDetails;
  planEndsAt?: string | null;
  usage: { students: number; teachers: number; campuses: number; aiCredits: number };
  plans: Record<PlanType, PlanDetails>;
  isOperational: boolean;
  defaultPlanPricing: Record<string, { price?: number | null }> | null;
  defaultPricingUpdatedAt: string | null;
  regionalCurrency?: string;
  priceCurrency?: string;
  commercialContractVersion?: string;
}
type Preview = {
  currentPlan: string; proposedPlan: string; billingPeriod: BillingPeriod; proposedAmount: number | null; priceCurrency: string;
  currentUsage: { campuses: number; students: number; teachers: number }; proposedCapacity: { campuses: number; students: number; teachers: number };
  overages: { campuses: number; students: number; teachers: number }; recordsRetained: boolean; operationPolicy: string; effectiveAt: string | null; chargePreview: string;
};
type CancelPreview = { plan: string; alreadyScheduled: boolean; effectiveAt: string | null; providerManaged: boolean; reviewRequired: boolean; consequences: string[] };
type Lifecycle = {
  canManage?: boolean;
  managedBy?: string | null;
  billingContact?: { fullName: string } | null;
  school?: { name: string; plan: string; status: string; subscriptionLifecycleState: string; planEndsAt: string | null; cancellationEffectiveAt: string | null; graceEndsAt: string | null; stripeSubscriptionId?: string | null };
  requests?: Array<{ id: string; kind: string; state: string; requestedPlan: string | null; effectiveAt: string | null; createdAt: string; details?: Record<string, any> }>;
};
type LifecycleAction = "preview" | "request-change" | "cancel-preview" | "cancel" | "resume" | "grace" | "refund";

/** Plain-language meaning of each lifecycle state (unchanged EN keys; AR/UR already in the catalogue). */
const STATE: Record<string, { label: string; meaning: string; tone: "success" | "warning" | "danger" }> = {
  TRIAL: { label: "Trial", meaning: "Full access during the trial. Choose a plan before the trial ends to keep using the school workspace.", tone: "warning" },
  ACTIVE: { label: "Active", meaning: "The subscription is paid and renews on the renewal date.", tone: "success" },
  PENDING_PAYMENT: { label: "Payment pending", meaning: "The payment provider has not confirmed payment yet. Access stays as it is until it does.", tone: "warning" },
  PAST_DUE_GRACE: { label: "Payment overdue — grace period", meaning: "The last renewal payment failed. Everything keeps working until the grace date; update the payment method before then.", tone: "warning" },
  APPROVED_GRACE: { label: "Approved grace period", meaning: "Billing review approved extra time to pay. Everything keeps working until the approved date.", tone: "warning" },
  PAST_DUE: { label: "Payment overdue — access restricted", meaning: "The grace period ended. Records are kept, but the school workspace is restricted until payment is recovered.", tone: "danger" },
  CANCELLATION_SCHEDULED: { label: "Cancellation scheduled", meaning: "Access continues until the effective date and the subscription will not renew. You can resume before then.", tone: "warning" },
  ENDED: { label: "Ended", meaning: "The subscription has ended. Records are kept; choose a plan to restore access.", tone: "danger" },
};
const KIND: Record<string, string> = { PLAN_CHANGE: "Plan change", CANCELLATION: "Cancellation", REFUND: "Refund review", RENEWAL_RECOVERY: "Payment recovery", PAYMENT_REPORT: "Payment report", GRACE_EXTENSION: "Grace extension", RESUME: "Resumed subscription" };
const REQUEST_STATE: Record<string, string> = { PENDING_REVIEW: "Waiting for billing review", REVIEWED_APPROVED: "Approved", REVIEWED_DECLINED: "Declined", CHECKOUT_STARTED: "Checkout started", VERIFIED_ACTIVE: "Confirmed by the provider", SCHEDULED: "Scheduled", COMPLETED: "Completed", WITHDRAWN: "Withdrawn" };
const ITEM_LABEL = { campuses: "Campuses", students: "Students", teachers: "Staff" } as const;
const RETURN_PARAMS = ["success", "canceled", "session_id", "safepay_status"] as const;
const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@skoolee.ai";

type ReturnOutcome = { tone: "success" | "warning" | "danger"; message: string } | null;
/** What a provider return URL says happened. Read once, then stripped. */
function readReturnOutcome(params: URLSearchParams): ReturnOutcome {
  const safepay = params.get("safepay_status");
  if (params.get("success") === "true" || params.get("session_id") || safepay === "success" || safepay === "paid") return { tone: "success", message: "Payment received. The plan updates as soon as the payment provider confirms it." };
  if (params.get("canceled") === "true" || safepay === "cancelled" || safepay === "canceled") return { tone: "warning", message: "Checkout was cancelled. Nothing was charged and your plan is unchanged." };
  if (safepay) return { tone: "danger", message: "The payment did not go through. Nothing changed; you can try again." };
  return null;
}

export function SubscriptionWorkspace({ showHeader = true }: { showHeader?: boolean } = {}) {
  const t = useUiText();
  const locale = useLocale();
  const { date } = useLocaleFormat();
  const access = useConsoleAccess();
  const mfaReady = !access.ready || access.has("mfaVerified");
  const standaloneOwner = access.has("standaloneOwner");

  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [cancelPreview, setCancelPreview] = useState<CancelPreview | null>(null);
  const [confirm, setConfirm] = useState<"cancel" | "refund" | "grace" | null>(null);
  const [graceUntil, setGraceUntil] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [bank, setBank] = useState<{ plan: PlanType; amountLabel: string | null; details: { bankName?: string; accountTitle?: string; accountNumber?: string; iban?: string | null } | null } | null>(null);
  const [receiptRef, setReceiptRef] = useState("");
  const [outcome, setOutcome] = useState<ReturnOutcome>(null);
  const planGridRef = useRef<HTMLHeadingElement>(null);
  // One key per intended action, reused on retry so a lost response never creates a second request.
  const keys = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const [billingResponse, lifecycleResponse] = await Promise.all([
        fetch("/api/billing", { cache: "no-store" }),
        fetch("/api/billing/lifecycle", { cache: "no-store" }),
      ]);
      const lifecycleJson: Lifecycle = await lifecycleResponse.json().catch(() => ({}));
      if (lifecycleResponse.ok) setLifecycle(lifecycleJson);
      if (billingResponse.status === 403 || lifecycleJson.canManage === false) { setDenied(true); return; }
      const billingJson = await billingResponse.json().catch(() => ({}));
      if (!billingResponse.ok || !lifecycleResponse.ok) throw new Error(billingJson.error || "load");
      setDenied(!billingJson.billing?.canPurchaseSubscription);
      setSnapshot(billingJson.billing ?? null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Provider return: one toast, one status Alert, then a clean address bar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!RETURN_PARAMS.some((key) => params.has(key))) return;
    const result = readReturnOutcome(params);
    if (result) {
      setOutcome(result);
      if (result.tone === "success") toast.success(t(result.message)); else if (result.tone === "warning") toast.warning(t(result.message)); else toast.error(t(result.message));
    }
    for (const key of RETURN_PARAMS) params.delete(key);
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    // Runs once per mount: the parameters are gone after this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const number = useMemo(() => new Intl.NumberFormat(localeTag(locale)), [locale]);
  const money = useCallback((amount: number, currency: string) => {
    try { return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
    // An unknown currency code still reads in the viewer's numbering system (R7), never the browser default.
    catch { return `${currency} ${number.format(amount)}`; }
  }, [locale, number]);
  const limitText = (value: number) => (value < 0 ? t("Unlimited") : number.format(value));

  const lifecycleCall = useCallback(async (action: LifecycleAction, extra: { plan?: string; billingPeriod?: BillingPeriod; reason?: string; graceUntil?: string } = {}) => {
    const fingerprint = JSON.stringify({ action, ...extra });
    keys.current[fingerprint] ??= crypto.randomUUID();
    const response = await fetch("/api/billing/lifecycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra, idempotencyKey: keys.current[fingerprint] }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Subscription request failed");
    if (action !== "preview" && action !== "cancel-preview") delete keys.current[fingerprint];
    return result;
  }, []);

  const run = async (tag: string, work: () => Promise<void>) => {
    setBusy(tag);
    try { await work(); }
    catch (error) { toast.error(friendlyErrorMessage(error, t("Subscription request failed"))); }
    finally { setBusy(null); }
  };

  const reviewPlan = (plan: PlanType) => run(`review:${plan}`, async () => {
    const result = await lifecycleCall("preview", { plan, billingPeriod: period });
    setPreview(result.preview);
  });
  const requestChange = () => preview && run("request-change", async () => {
    await lifecycleCall("request-change", { plan: preview.proposedPlan, billingPeriod: preview.billingPeriod });
    toast.success(t("Your request is recorded for authorized billing review."));
    setPreview(null);
    await load();
  });
  const startCheckout = (plan: PlanType, billingPeriod: BillingPeriod) => run(`checkout:${plan}`, async () => {
    const response = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, billingPeriod }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Checkout failed");
    if (data.method === "stripe" || data.method === "safepay") { window.location.href = data.url; return; }
    setPreview(null);
    setBank({ plan, amountLabel: data.amountLabel ?? null, details: data.bank ?? null });
  });
  const sendPaymentReference = () => bank && run("bank", async () => {
    const response = await fetch("/api/billing/payment-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: bank.plan, billingPeriod: period, idempotencyKey: crypto.randomUUID(), receiptRef }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to notify");
    toast.success(t("Payment reference sent to SkooleeAI. Your plan changes once the transfer is confirmed."));
    setBank(null); setReceiptRef("");
    await load();
  });
  const openPortal = () => run("portal", async () => {
    const response = await fetch("/api/stripe/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Payment recovery is unavailable");
    window.location.assign(data.url);
  });
  const openCancel = () => run("cancel-preview", async () => {
    const result = await lifecycleCall("cancel-preview");
    setCancelPreview(result.preview);
    setConfirm("cancel");
  });
  const confirmRequest = (reason?: string) => {
    const kind = confirm;
    if (!kind) return;
    return run(kind, async () => {
      const result = await lifecycleCall(kind, { reason, ...(kind === "grace" ? { graceUntil } : {}) });
      toast.success(kind === "cancel" && result.providerConfirmed
        ? t("Cancellation is scheduled for {0}. Records are retained.", [date(result.effectiveAt)])
        : t("Your request is recorded for authorized billing review."));
      setConfirm(null); setCancelPreview(null); setGraceUntil("");
      await load();
    });
  };
  const resume = () => run("resume", async () => {
    await lifecycleCall("resume");
    toast.success(t("The subscription will continue to renew."));
    await load();
  });
  const focusPlans = () => {
    planGridRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    planGridRef.current?.focus({ preventScroll: true });
  };

  const header = (primary: boolean) => showHeader ? (
    <PageHeader
      title="Billing & plan"
      description="Your SkooleeAI plan, AI credits and payment method."
      secondaryActions={primary ? [
        { id: "compare-plans", label: "Compare plans", icon: ArrowUpRight, onClick: focusPlans },
        ...(snapshot?.school.stripeCustomerId && mfaReady ? [{ id: "payment-method", label: "Manage payment method", icon: CreditCard, onClick: () => void openPortal(), loading: busy === "portal" }] : []),
      ] : undefined}
      status={outcome ? <Alert tone={outcome.tone} live="off" compact onDismiss={() => setOutcome(null)}>{t(outcome.message)}</Alert> : undefined}
    />
  ) : (outcome ? <Alert tone={outcome.tone} live="off" compact onDismiss={() => setOutcome(null)}>{t(outcome.message)}</Alert> : null);

  if (loading && !snapshot && !denied) return <div className="space-y-6">{header(false)}<SkeletonCards count={3} label={t("Loading subscription status…")} /></div>;

  if (denied) {
    const owner = lifecycle?.managedBy ?? lifecycle?.billingContact?.fullName ?? null;
    return (
      <div className="space-y-6">
        {header(false)}
        <AccessNotice
          title="Billing & plan"
          reason={owner ? "The SkooleeAI subscription is managed by the account owner." : "Contact SkooleeAI support to restore billing access."}
          owner={owner}
        />
      </div>
    );
  }

  if (loadError || !snapshot || !lifecycle?.school) {
    return (
      <div className="space-y-6">
        {header(false)}
        <div className="sk-panel"><ErrorState title={t("Subscription status is unavailable")} description={t("Subscription status could not be loaded")} onRetry={() => void load()} /></div>
      </div>
    );
  }

  const school = lifecycle.school;
  const requests = lifecycle.requests ?? [];
  const state = STATE[school.subscriptionLifecycleState] ?? { label: school.subscriptionLifecycleState, meaning: "", tone: "warning" as const };
  const overdue = ["PAST_DUE", "PAST_DUE_GRACE", "APPROVED_GRACE"].includes(school.subscriptionLifecycleState) || school.status === "SUSPENDED";
  const scheduled = school.subscriptionLifecycleState === "CANCELLATION_SCHEDULED";
  const pendingGrace = requests.some((request) => request.kind === "GRACE_EXTENSION" && request.state === "PENDING_REVIEW");
  const approvedFor = (plan: PlanType) => requests.find((request) => request.kind === "PLAN_CHANGE" && request.state === "REVIEWED_APPROVED" && request.requestedPlan === plan && request.details?.preview?.billingPeriod === period);
  const currency = snapshot.priceCurrency || COMMERCIAL_CONTRACT.currency;
  const plans = Object.values(snapshot.plans);
  const discount = Math.round(ANNUAL_DISCOUNT * 100);
  const discountText = new Intl.NumberFormat(localeTag(locale), { style: "percent", signDisplay: "always" }).format(-ANNUAL_DISCOUNT);
  const contactSubject = encodeURIComponent(t("Custom plan enquiry"));
  // AI credits read the school's own allowance (the same source as the overview), not the catalogue tier.
  const aiLimit = snapshot.school.aiCreditsLimit ?? snapshot.limits.aiCredits;
  const aiUsed = snapshot.school.aiCreditsUsed ?? snapshot.usage.aiCredits;
  const usage: Array<[string, number, number]> = [
    ["Students", snapshot.usage.students, snapshot.limits.maxStudents],
    ["Teachers", snapshot.usage.teachers, snapshot.limits.maxTeachers],
    // A standalone school has exactly one campus: no meter, no warning.
    ...(standaloneOwner ? [] : [["Campuses", snapshot.usage.campuses, snapshot.limits.maxCampuses] as [string, number, number]]),
    ["AI credits", aiUsed, aiLimit],
  ];
  const trial = school.subscriptionLifecycleState === "TRIAL";

  return (
    <div className="space-y-6" data-subscription-workspace>
      {header(true)}

      {/* Status: what the school pays for and what it means right now. */}
      <section className="sk-panel space-y-5 p-4 sm:p-6" aria-labelledby="subscription-status-title" data-subscription-lifecycle data-state={school.subscriptionLifecycleState}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="sk-eyebrow text-primary">{t("Institution software subscription")}</p>
            <h2 id="subscription-status-title" className="mt-1 text-xl font-bold text-ink-strong"><bdi>{snapshot.limits.name}</bdi> · <bdi>{school.name}</bdi></h2>
            {school.planEndsAt ? (
              <p className="mt-1 text-sm text-ink-muted">
                {trial ? t("Trial ends {0}", [date(school.planEndsAt)]) : <>{t("Renewal date")}: <bdi>{date(school.planEndsAt)}</bdi></>}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-ink-subtle">{t("This covers the whole institution. Family tuition is billed separately under Fees.")}</p>
          </div>
          <Alert tone={state.tone} live="off" compact title={t(state.label)} className="max-w-md" data-state-explainer>
            {state.meaning ? <span className="block">{t(state.meaning)}</span> : null}
            {scheduled && school.cancellationEffectiveAt ? <span className="mt-1 block font-semibold">{t("Effective date")}: <bdi>{date(school.cancellationEffectiveAt)}</bdi></span> : null}
            {school.graceEndsAt && overdue ? <span className="mt-1 block font-semibold">{t("Grace ends")}: <bdi>{date(school.graceEndsAt)}</bdi></span> : null}
          </Alert>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {usage.map(([label, used, limit]) => (
            <div key={label} className="rounded-2xl border border-border-subtle bg-surface-subtle p-3">
              <p className="text-xs font-medium text-ink-muted">{t(label)}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-ink-strong">{t("{0} of {1}", [number.format(used), limitText(limit)])}</p>
              {limit > 0 ? <Progress className="mt-2" size="sm" value={Math.min(used, limit)} max={limit} label={t(label)} tone={used > limit ? "danger" : used < limit && used / limit > 0.85 ? "warning" : used === limit ? "neutral" : "brand"} /> : null}
            </div>
          ))}
        </div>
        {!snapshot.isOperational ? (
          <Alert tone="warning" live="off" compact>{t("Subscription access is paused. Update billing to restore student, teacher, campus, AI, PDF and messaging workflows.")}</Alert>
        ) : null}
        {snapshot.defaultPlanPricing?.[snapshot.school.plan]?.price != null ? (
          <Alert tone="info" live="off" compact icon={RefreshCw} title={t("Platform pricing updated")}>
            {t("The catalogue price for {0} is now {1} a month. Your approved plan terms do not change until a change you request is approved.", [snapshot.limits.name, money(Number(snapshot.defaultPlanPricing[snapshot.school.plan].price), currency)])}
          </Alert>
        ) : null}
      </section>

      {/* Plan grid: one period toggle, one action per card. */}
      <section className="space-y-4" aria-labelledby="plan-grid-title" data-plan-grid>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="plan-grid-title" ref={planGridRef} tabIndex={-1} className="text-lg font-bold text-ink-strong">{t("Choose a plan")}</h2>
            <p className="text-sm text-ink-muted">{t("Pay annually and save {0}% on every paid plan.", [discount])}</p>
          </div>
          <div role="group" aria-label={t("Billing period")} className="inline-flex items-center gap-1 self-start rounded-full border border-border-subtle bg-muted p-1 sm:self-auto">
            {(["monthly", "annual"] as const).map((value) => (
              <Button key={value} type="button" variant="choice" size="sm" aria-pressed={period === value} onClick={() => setPeriod(value)}>
                {value === "monthly" ? t("Monthly") : t("Annual")}
                {value === "annual" ? <Badge size="sm" variant="success"><bdi>{discountText}</bdi></Badge> : null}
              </Button>
            ))}
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = plan.type === snapshot.school.plan;
            const needsGroup = standaloneOwner && (plan.maxCampuses < 0 || plan.maxCampuses > 1);
            const approved = approvedFor(plan.type);
            const price = plan.price != null ? (period === "annual" ? annualMonthlyPrice(plan.price) : plan.price) : null;
            return (
              <li key={plan.type} className={cn("sk-panel flex flex-col p-5", isCurrent && "border-primary/30 bg-surface-selected")} data-plan={plan.type}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-primary"><bdi>{plan.name}</bdi></p>
                  {isCurrent ? <Badge size="sm">{t("Current")}</Badge> : null}
                </div>
                <div className="mt-3 min-h-14">
                  {plan.isCustom ? (
                    <><p className="text-2xl font-bold text-ink-strong">{t("Custom")}</p><p className="mt-1 text-xs font-medium text-ink-muted">{t("Quoted for your group")}</p></>
                  ) : plan.price === 0 ? (
                    <><p className="text-2xl font-bold text-ink-strong">{t("Free")}</p><p className="mt-1 text-xs font-medium text-ink-muted">{t("Forever at this tier")}</p></>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-ink-strong"><bdi>{price != null ? money(price, currency) : "—"}</bdi> <span className="text-xs font-semibold text-ink-muted">{t("a month")}</span></p>
                      <p className="mt-1 text-xs font-medium text-ink-muted">{period === "annual" ? t("Billed yearly · save {0}%", [discount]) : t("Billed monthly · {0} a month when yearly", [money(annualMonthlyPrice(plan.price) ?? 0, currency)])}</p>
                    </>
                  )}
                </div>
                <ul className="mt-4 space-y-1.5 rounded-2xl bg-surface-subtle p-3 text-xs font-medium text-ink">
                  <li>{plan.maxStudents < 0 ? t("Unlimited students") : countLabel(locale.language, plan.maxStudents, "student")}</li>
                  <li>{t("{0} teachers", [limitText(plan.maxTeachers)])}</li>
                  <li>{plan.maxCampuses < 0 ? t("Unlimited campuses") : countLabel(locale.language, plan.maxCampuses, "campus")}</li>
                  <li>{t("{0} AI credits", [limitText(plan.aiCredits)])}</li>
                </ul>
                <div className="mt-auto pt-4">
                  {isCurrent ? (
                    <p className="text-center text-xs font-semibold text-ink-muted">{t("Your current plan")}</p>
                  ) : needsGroup ? (
                    <p className="text-xs leading-relaxed text-ink-muted" data-needs-group>{t("Needs a school group — contact SkooleeAI support")}</p>
                  ) : plan.isCustom ? (
                    <a href={`mailto:${SALES_EMAIL}?subject=${contactSubject}`} className={buttonVariants({ variant: "outline", className: "w-full" })}><Mail aria-hidden="true" />{t("Contact us")}</a>
                  ) : approved && !snapshot.school.stripeSubscriptionId ? (
                    <Button className="w-full" type="button" loading={busy === `checkout:${plan.type}`} disabled={Boolean(busy)} onClick={() => void startCheckout(plan.type, period)}>{t("Continue to checkout")}</Button>
                  ) : (plan.type === "BASIC" || plan.type === "PRO") ? (
                    <Button className="w-full" type="button" variant="outline" loading={busy === `review:${plan.type}`} disabled={Boolean(busy)} onClick={() => void reviewPlan(plan.type)}>{t("Review change")}</Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-ink-muted">
          {t("Unused AI credits expire at the calendar month reset. Checkout prices are checked against the catalogue.")}{" "}
          {t("Prices are in {0}; no currency conversion is applied.", [currency])}
          {snapshot.commercialContractVersion ? <> {t("Current terms: {0}.", [snapshot.commercialContractVersion])}</> : null}
        </p>
      </section>

      {/* Consequential requests: each confirmed with a reason. */}
      <section className="sk-panel space-y-4 p-4 sm:p-6" aria-labelledby="subscription-actions-title">
        <div>
          <h2 id="subscription-actions-title" className="text-lg font-bold text-ink-strong">{t("Subscription")}</h2>
          <p className="text-sm text-ink-muted">{t("A refund request is reviewed; it is not an approved refund.")}</p>
        </div>
        {!mfaReady ? (
          <Alert tone="warning" icon={ShieldAlert} title={t("Turn on two-step sign-in")} live="off"
            actions={<Link href="/account/security" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("Turn on two-step sign-in")}</Link>}>
            {t("Cancelling, requesting a refund or changing the payment method needs two-step sign-in on your account.")}
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {scheduled ? (
            <Button type="button" loading={busy === "resume"} disabled={Boolean(busy)} onClick={() => void resume()}>{t("Resume subscription")}</Button>
          ) : null}
          {overdue ? (
            <Button type="button" variant="outline" disabled={Boolean(busy) || pendingGrace} onClick={() => setConfirm("grace")}>{t("Request more time to pay")}</Button>
          ) : null}
          {mfaReady && !scheduled ? (
            <Button type="button" variant="outline" loading={busy === "cancel-preview"} disabled={Boolean(busy)} onClick={() => void openCancel()}>{t("Cancel subscription…")}</Button>
          ) : null}
          {mfaReady ? (
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirm("refund")}>{t("Request refund review")}</Button>
          ) : null}
        </div>
        {pendingGrace ? <p className="text-xs text-ink-muted">{t("A grace request is waiting for billing review.")}</p> : null}
      </section>

      {/* Request history. */}
      <section className="sk-panel p-4 sm:p-6" aria-labelledby="subscription-requests-title">
        <h2 id="subscription-requests-title" className="text-lg font-bold text-ink-strong">{t("Recent requests")}</h2>
        {requests.length === 0 ? (
          <EmptyState size="sm" icon={CreditCard} title={t("No billing requests yet.")} />
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle text-sm" data-requests>
            {requests.slice(0, 8).map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5" data-request-kind={request.kind} data-request-state={request.state}>
                <span className="font-medium text-ink-strong">{t(KIND[request.kind] ?? request.kind)}{request.requestedPlan ? <> · <bdi>{snapshot.plans[request.requestedPlan as PlanType]?.name ?? request.requestedPlan}</bdi></> : null}</span>
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  <Badge size="sm" variant={request.state === "REVIEWED_DECLINED" ? "danger" : request.state === "PENDING_REVIEW" ? "warning" : "neutral"} dot>{t(REQUEST_STATE[request.state] ?? request.state)}</Badge>
                  {request.effectiveAt ? <bdi>{date(request.effectiveAt)}</bdi> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {preview ? (
        <Modal
          title={t("Review plan change")}
          subtitle={<><bdi>{snapshot.plans[preview.currentPlan as PlanType]?.name ?? preview.currentPlan}</bdi> <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> <bdi>{snapshot.plans[preview.proposedPlan as PlanType]?.name ?? preview.proposedPlan}</bdi></>}
          icon={ArrowUpRight}
          size="md"
          onClose={() => setPreview(null)}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" disabled={Boolean(busy)} onClick={() => setPreview(null)}>{t("Keep current plan")}</Button>
              {approvedFor(preview.proposedPlan as PlanType) && !snapshot.school.stripeSubscriptionId
                ? <Button type="button" loading={busy === `checkout:${preview.proposedPlan}`} disabled={Boolean(busy)} onClick={() => void startCheckout(preview.proposedPlan as PlanType, preview.billingPeriod)}>{t("Continue to checkout")}</Button>
                : <Button type="button" loading={busy === "request-change"} disabled={Boolean(busy)} onClick={() => void requestChange()}>{t("Confirm change request")}</Button>}
            </div>
          }
        >
          <div className="space-y-4 text-sm" data-plan-preview>
            <p>{t(preview.billingPeriod === "annual" ? "Proposed annual catalogue amount" : "Proposed monthly catalogue amount")}: <strong><bdi>{preview.proposedAmount == null ? t("Custom quote") : money(preview.proposedAmount, preview.priceCurrency)}</bdi></strong></p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm" data-capacity-compare>
                <caption className="sr-only">{t("Usage compared with the proposed plan")}</caption>
                <thead><tr className="text-xs text-ink-subtle"><th scope="col" className="py-1 text-start font-medium">{t("Item")}</th><th scope="col" className="py-1 text-start font-medium">{t("In use now")}</th><th scope="col" className="py-1 text-start font-medium">{t("Proposed limit")}</th><th scope="col" className="py-1 text-start font-medium">{t("Over the limit")}</th></tr></thead>
                <tbody>{(["campuses", "students", "teachers"] as const).map((key) => (
                  <tr key={key} className={preview.overages[key] ? "font-semibold text-status-warning-text" : ""}>
                    <th scope="row" className="py-1 text-start font-normal">{t(ITEM_LABEL[key])}</th>
                    <td className="tabular-nums"><bdi>{number.format(preview.currentUsage[key])}</bdi></td>
                    <td className="tabular-nums"><bdi>{limitText(preview.proposedCapacity[key])}</bdi></td>
                    <td className="tabular-nums"><bdi>{preview.overages[key] ? number.format(preview.overages[key]) : "—"}</bdi></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p>{t("Effective date")}: {preview.effectiveAt ? <bdi>{date(preview.effectiveAt)}</bdi> : t("Not set")}. {t(preview.operationPolicy)} {preview.recordsRetained ? t("Records are retained.") : ""}</p>
            <p className="text-ink-muted">{t("Any proration or renewal charge is confirmed by the payment provider or billing review before payment.")}</p>
            {approvedFor(preview.proposedPlan as PlanType) && snapshot.school.stripeSubscriptionId ? <Alert tone="info" live="off" compact>{t("This change was reviewed. Open the payment provider portal to confirm the provider terms.")}</Alert> : null}
          </div>
        </Modal>
      ) : null}

      {bank ? (
        <Modal
          title={t("Pay by bank transfer")}
          icon={Building2}
          size="sm"
          onClose={() => setBank(null)}
          dirty={Boolean(receiptRef.trim()) && busy !== "bank"}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" disabled={busy === "bank"} onClick={() => setBank(null)}>{t("Keep editing")}</Button>
              <Button type="button" loading={busy === "bank"} disabled={busy === "bank"} onClick={() => void sendPaymentReference()}><CheckCircle2 aria-hidden="true" />{t("Send payment reference to SkooleeAI")}</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-ink">{bank.amountLabel ? t("Transfer {0} to the account below, then send your payment reference.", [bank.amountLabel]) : t("Transfer the plan amount to the account below, then send your payment reference.")}</p>
            {bank.details ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-2xl bg-surface-subtle p-4 text-sm">
                <dt className="text-ink-muted">{t("Bank name")}</dt><dd className="font-semibold text-ink-strong"><bdi>{bank.details.bankName}</bdi></dd>
                <dt className="text-ink-muted">{t("Account title")}</dt><dd className="font-semibold text-ink-strong"><bdi>{bank.details.accountTitle}</bdi></dd>
                <dt className="text-ink-muted">{t("Account number")}</dt><dd className="font-semibold text-ink-strong"><bdi dir="ltr">{bank.details.accountNumber}</bdi></dd>
                {bank.details.iban ? <><dt className="text-ink-muted">IBAN</dt><dd className="font-semibold text-ink-strong"><bdi dir="ltr">{bank.details.iban}</bdi></dd></> : null}
              </dl>
            ) : (
              <Alert tone="warning" live="off" compact>{t("No bank details are set up yet. Contact SkooleeAI support to pay by transfer.")}</Alert>
            )}
            <FormField name="bank-reference" label={t("Payment reference")} optional hint={t("The transaction ID or receipt number from your bank.")}>
              <Input value={receiptRef} dir="auto" onChange={(event) => setReceiptRef(event.target.value)} />
            </FormField>
          </div>
        </Modal>
      ) : null}

      <ConfirmAction
        open={confirm === "cancel" && Boolean(cancelPreview)}
        tone="danger"
        title={cancelPreview?.reviewRequired ? t("Request cancellation?") : t("Cancel the subscription?")}
        description={cancelPreview?.effectiveAt
          ? t("Access continues until {0}, then the subscription does not renew. SkooleeAI billing is told. You can resume before then.", [date(cancelPreview.effectiveAt)])
          : t("The subscription will not renew. SkooleeAI billing reviews the request and confirms the effective date.")}
        detail={cancelPreview ? <ul className="list-disc space-y-1 ps-4" data-cancel-preview>{cancelPreview.consequences.map((line) => <li key={line}>{t(line)}</li>)}</ul> : null}
        confirmLabel={cancelPreview?.reviewRequired ? t("Request cancellation") : t("Confirm cancellation")}
        cancelLabel={t("Keep subscription")}
        requireReason={{ label: t("Reason for billing review"), minLength: 10 }}
        busy={busy === "cancel"}
        onCancel={() => { setConfirm(null); setCancelPreview(null); }}
        onConfirm={(reason?: string) => confirmRequest(reason)}
      />
      <ConfirmAction
        open={confirm === "refund"}
        tone="warning"
        title={t("Request a refund review?")}
        description={t("SkooleeAI billing reviews the request and replies by email. A request is not an approved refund.")}
        confirmLabel={t("Request refund review")}
        cancelLabel={t("Keep editing")}
        requireReason={{ label: t("Reason for billing review"), minLength: 10 }}
        busy={busy === "refund"}
        onCancel={() => setConfirm(null)}
        onConfirm={(reason?: string) => confirmRequest(reason)}
      />
      <ConfirmAction
        open={confirm === "grace"}
        tone="warning"
        title={t("Request more time to pay?")}
        description={t("Extra time is an exception approved by billing review, not an automatic right. Nothing changes until it is approved.")}
        detail={
          <FormField name="grace-until" label={t("Pay by (within 30 days)")} required>
            <Input type="date" dir="ltr" value={graceUntil} onChange={(event) => setGraceUntil(event.target.value)} />
          </FormField>
        }
        confirmLabel={t("Request more time to pay")}
        cancelLabel={t("Keep editing")}
        requireReason={{ label: t("Reason for billing review"), minLength: 10 }}
        busy={busy === "grace"}
        onCancel={() => { setConfirm(null); setGraceUntil(""); }}
        onConfirm={(reason?: string) => { if (!graceUntil) { toast.error(t("Choose the date you will pay by.")); return; } void confirmRequest(reason); }}
      />
    </div>
  );
}
