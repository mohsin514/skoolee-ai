"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CreditCard,
  Crown,
  Loader2,
  Mail,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ANNUAL_DISCOUNT, annualMonthlyPrice, type BillingPeriod } from "@/config/plans";

type PlanType = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";

interface PlanDetails {
  type: PlanType;
  name: string;
  price: number | null;
  priceLabel: string;
  features: string[];
  aiCredits: number;
  maxStudents: number;
  maxTeachers: number;
  maxCampuses: number;
  isCustom?: boolean;
}

interface BillingSnapshot {
  school: {
    plan: PlanType;
    status: string;
    aiCreditsUsed: number;
    aiCreditsLimit: number;
    stripeCustomerId?: string | null;
  };
  limits: PlanDetails;
  planEndsAt?: string | null;
  usage: {
    students: number;
    teachers: number;
    campuses: number;
    aiCredits: number;
  };
  plans: Record<PlanType, PlanDetails>;
  isOperational: boolean;
  defaultPlanPricing: Record<string, { price?: number | null }> | null;
  defaultPricingUpdatedAt: string | null;
}

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@skoolee.ai";

export function PlansPanel() {
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [isPlanAction, setIsPlanAction] = useState<PlanType | "PORTAL" | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [receiptRef, setReceiptRef] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [bankInfo, setBankInfo] = useState<any>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/billing");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load billing data");
      setBilling(data.billing || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Billing data failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const startCheckout = async (plan: "BASIC" | "PRO") => {
    setIsPlanAction(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billingPeriod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (data.method === "stripe" || data.method === "safepay") {
        window.location.href = data.url;
        return;
      }

      setPendingPlan(plan);
      setPaymentMethod(data.method);
      setBankInfo(data.bank);
      setPaymentModalOpen(true);
      setIsPlanAction(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
      setIsPlanAction(null);
    }
  };

  const submitPaymentNotification = async () => {
    if (!pendingPlan) return;
    setIsPlanAction(pendingPlan as any);
    try {
      const res = await fetch("/api/billing/payment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: pendingPlan, receiptRef }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to notify");
      toast.success("Payment notification sent to platform owner.");
      setPaymentModalOpen(false);
      setReceiptRef("");
      setPendingPlan(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to notify");
    } finally {
      setIsPlanAction(null);
    }
  };

  const openPortal = async () => {
    setIsPlanAction("PORTAL");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Portal failed");
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Portal failed");
      setIsPlanAction(null);
    }
  };

  useEffect(() => {
    if (!paymentModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPaymentModalOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [paymentModalOpen]);

  const planCards = billing ? Object.values(billing.plans) : [];
  const formatLimit = (limit: number) => (limit < 0 ? "Unlimited" : limit.toLocaleString());
  const contactSubject = encodeURIComponent(`Custom plan enquiry — ${billing?.limits?.name ?? "Skoolee"}`);
  const contactBody = encodeURIComponent(
    [
      "Assalam-o-Alaikum Skoolee team,",
      "",
      "We would like a custom plan for our school group:",
      "",
      "School / group name:",
      "Contact person:",
      "Phone / WhatsApp:",
      "City:",
      "Number of campuses:",
      "Approximate students:",
      "",
      "Thank you.",
    ].join("\n")
  );

  return (
    <div className="space-y-6">
      {billing && (
        <Card
          className={`sk-rise ${
            billing.isOperational
              ? "border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]"
              : "border-amber-200 bg-amber-50/70 shadow-none"
          }`}
          style={{ animationDelay: "0ms" }}
        >
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" />
                SaaS plan
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Current plan: {billing.limits.name} - {billing.school.status.toLowerCase()}
                {billing.planEndsAt && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary/80">
                    <CreditCard className="h-3 w-3" />
                    Paid through {new Date(billing.planEndsAt).toLocaleDateString()}
                  </span>
                )}
              </p>
            </div>
            {billing.school.stripeCustomerId && (
              <Button variant="outline" size="sm" onClick={openPortal} disabled={!!isPlanAction}>
                {isPlanAction === "PORTAL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Manage
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {!billing.isOperational && (
              <div className="rounded-lg border border-amber-200 bg-white/70 p-4 text-sm text-amber-800">
                Subscription access is paused. Update billing to restore student, teacher, campus, AI, PDF, and messaging workflows.
              </div>
            )}
            {billing.defaultPlanPricing && billing.defaultPlanPricing[billing.school.plan]?.price != null && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                <p className="font-semibold flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" /> Platform pricing updated
                </p>
                <p className="mt-1">
                  From next billing cycle, your {billing.limits.name} plan rate changes to
                  <strong> PKR {billing.defaultPlanPricing[billing.school.plan].price?.toLocaleString()}/mo</strong>.
                  {billing.defaultPricingUpdatedAt && (
                    <span className="block mt-0.5 text-xs text-sky-600/70">
                      Updated {new Date(billing.defaultPricingUpdatedAt).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Students", billing.usage.students, billing.limits.maxStudents],
                ["Teachers", billing.usage.teachers, billing.limits.maxTeachers],
                ["Campuses", billing.usage.campuses, billing.limits.maxCampuses],
                ["AI credits", billing.usage.aiCredits, billing.limits.aiCredits],
              ].map(([label, used, limit]) => (
                <div key={label} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-bold">
                    {Number(used).toLocaleString()} / {formatLimit(Number(limit))}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
              <div>
                <p className="text-sm font-bold text-[#1f1a23]">Choose your billing period</p>
                <p className="text-xs font-semibold text-[#4d4354]/55">
                  Pay annually and save {Math.round(ANNUAL_DISCOUNT * 100)}% on every paid plan.
                </p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-[#cfc2d6]/25 bg-[#f3f4f9] p-1 self-start sm:self-auto">
                {(["monthly", "annual"] as const).map((period) => {
                  const label = period === "monthly" ? "Monthly" : "Annual";
                  const active = billingPeriod === period;
                  const isAnnual = period === "annual";
                  return (
                    <button
                      key={period}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setBillingPeriod(period)}
                      className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                        active ? "bg-[#8127cf] text-white shadow-sm" : "text-[#4d4354]/55 hover:text-[#8127cf]"
                      }`}
                    >
                      {label}
                      {isAnnual && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                            active ? "bg-white/25 text-white" : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          −{Math.round(ANNUAL_DISCOUNT * 100)}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              {planCards.map((plan) => {
                const isCurrent = plan.type === billing.school.plan;
                const canCheckout = plan.type === "BASIC" || plan.type === "PRO";
                const displayPrice =
                  plan.price != null ? (billingPeriod === "annual" ? annualMonthlyPrice(plan.price) : plan.price) : null;
                return (
                  <div
                    key={plan.type}
                    className={`flex flex-col rounded-2xl border p-5 transition-all ${
                      isCurrent ? "border-[#8127cf]/30 bg-[#fbf0fe]/40" : "border-[#cfc2d6]/25 bg-white hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">{plan.name}</p>
                      {isCurrent && <Badge>Current</Badge>}
                    </div>

                    <div className="mt-3 min-h-[3.5rem]">
                      {plan.isCustom ? (
                        <>
                          <div className="text-2xl font-black text-[#1f1a23]">Custom</div>
                          <p className="mt-1 text-xs font-bold text-[#4d4354]/55">Quoted for your group</p>
                        </>
                      ) : plan.price === 0 ? (
                        <>
                          <div className="text-2xl font-black text-[#1f1a23]">Free</div>
                          <p className="mt-1 text-xs font-bold text-[#4d4354]/55">Forever at this tier</p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-end gap-1.5">
                            <span className="text-2xl font-black text-[#1f1a23]">PKR {displayPrice?.toLocaleString()}</span>
                            <span className="mb-1 text-xs font-bold text-[#4d4354]/55">/mo</span>
                          </div>
                          <p className="mt-1 text-xs font-bold text-[#4d4354]/55">
                            {billingPeriod === "annual" ? (
                              <span className="text-emerald-600">Billed yearly · save {Math.round(ANNUAL_DISCOUNT * 100)}%</span>
                            ) : (
                              `Billed monthly · ${annualMonthlyPrice(plan.price)?.toLocaleString()}/mo when yearly`
                            )}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="mt-4 space-y-1.5 rounded-2xl bg-[#fbf0fe]/50 p-3 text-xs font-semibold text-[#4d4354]/70">
                      <p>{formatLimit(plan.maxStudents)} students</p>
                      <p>{formatLimit(plan.maxTeachers)} teachers</p>
                      <p>{formatLimit(plan.maxCampuses)} campuses</p>
                      <p>{formatLimit(plan.aiCredits)} AI credits</p>
                    </div>

                    <div className="mt-auto pt-4">
                      {isCurrent ? (
                        <Button className="w-full" variant="outline" disabled>
                          Active
                        </Button>
                      ) : plan.isCustom ? (
                        <a
                          href={`mailto:${SALES_EMAIL}?subject=${contactSubject}&body=${contactBody}`}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#8127cf]/30 bg-[#fbf0fe] px-4 py-2.5 text-sm font-black text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                        >
                          <Mail className="h-4 w-4" />
                          Contact us
                        </a>
                      ) : (
                        <Button
                          className="w-full"
                          variant="default"
                          disabled={!!isPlanAction || !canCheckout}
                          onClick={() => {
                            if (plan.type === "BASIC" || plan.type === "PRO") {
                              startCheckout(plan.type);
                            }
                          }}
                        >
                          {isPlanAction === plan.type ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                          Upgrade
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs font-semibold text-[#4d4354]/55">
              Flat monthly pricing. Billing annually saves {Math.round(ANNUAL_DISCOUNT * 100)}% and final figures are confirmed on your demo call.
            </p>
          </CardContent>
        </Card>
      )}

      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-enter" onClick={() => setPaymentModalOpen(false)}>
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl animate-modal-enter" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <Building2 className="w-5 h-5 text-[#1f1a23]" />
              <h3 className="text-lg font-bold text-[#1f1a23]">Bank Transfer</h3>
            </div>
            <p className="text-sm font-semibold text-[#4d4354]/60 mb-4">
              Transfer <strong>{bankInfo?.amountLabel}</strong> to the account below, then submit your payment reference.
            </p>
            {bankInfo ? (
              <div className="rounded-xl bg-[#f3f4f9] p-4 space-y-2 mb-4">
                <p className="text-sm font-black text-[#1f1a23]">{bankInfo.bankName}</p>
                <p className="text-xs font-semibold text-[#4d4354]/60">
                  Account Title: <span className="text-[#1f1a23]">{bankInfo.accountTitle}</span>
                </p>
                <p className="text-xs font-semibold text-[#4d4354]/60">
                  Account #: <span className="text-[#1f1a23]">{bankInfo.accountNumber}</span>
                </p>
                {bankInfo.iban && (
                  <p className="text-xs font-semibold text-[#4d4354]/60">
                    IBAN: <span className="text-[#1f1a23]">{bankInfo.iban}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm font-semibold text-amber-600 mb-4">
                No bank details configured yet. Please contact the platform owner.
              </p>
            )}
            <div className="space-y-2 mb-4">
              <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block">Payment Reference (optional)</label>
              <input
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                placeholder="e.g. Transaction ID, receipt number"
                className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="flex-1 rounded-xl border border-[#cfc2d6]/20 px-5 py-[10px] text-sm font-black text-[#4d4354] hover:bg-[#f3f4f9] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPaymentNotification}
                disabled={isPlanAction !== null}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#8127cf] px-5 py-[10px] text-sm font-black text-white hover:bg-[#6a1fb3] transition-colors disabled:opacity-50"
              >
                {isPlanAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Notify Owner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}