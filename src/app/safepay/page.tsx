"use client";

import { Button } from "@/components/ui/button";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { toast } from "@/components/ui/toast";
import { Shield, Lock, CheckCircle2, FlaskConical } from "lucide-react";
import { Input as SystemInput } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { PageCard } from "@/components/ui/page-card";
import { safeReturnPath } from "@/lib/auth/return-path";
import { dashboardPathForRole } from "@/lib/roles";
import { LocaleProvider, useUiText } from "@/components/locale/LocaleProvider";

function SafePayForm() {
  const ui = useUiText();
  const router = useRouter();
  const params = useSearchParams();
  const orderRef = params.get("orderRef") || "";
  const schoolId = params.get("schoolId") || "";
  const plan = params.get("plan") || "";
  const kind = params.get("kind") || "";
  const invoiceId = params.get("invoiceId") || "";
  const billingPeriod = params.get("billingPeriod") || "monthly";
  const contract = params.get("contract") || "";
  const amountLabel = params.get("amountLabel") || "PKR 0/mo";
  const [payBefore, payAfter = ""] = ui("Pay {0}").split("{0}");
  // PACKAGE: an onboarding package bought in development (no SafePay keys); settled by the dev-only endpoint.
  const intentId = params.get("intentId") || "";

  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  // SKO-474: the fee return target is built by the server; it is still checked against this role.
  const returnTo = params.get("returnTo");

  // Plan buyers return to /billing, which resolves the payer's own Billing & plan view (§6.2). Fee payers return
  // to the page that sent them (validated against their role) or, failing that, their own home.
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((json) => setRole(json?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const formatCard = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber.replace(/\s/g, "").length || !expiry.length || !cvv.length || !cardName.length) return;
    setSubmitting(true);
    try {
      const res = kind === "PACKAGE"
        ? await fetch("/api/onboarding/package/test-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intentId, outcome: "paid" }),
        })
        : await fetch("/api/safepay/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "FEE" ? { orderRef, kind: "FEE" } : { orderRef, schoolId, plan, billingPeriod, contract }
          ),
        });
      const data = await res.json();
      // Server copy is an EN UI key (or already in the reader's language); ui() leaves an unknown sentence as is.
      if (!res.ok) throw new Error(data.error ? ui(data.error) : ui("The payment did not go through. Please try again."));
      setDone(true);
      setTimeout(
        () =>
          router.push(
            kind === "PACKAGE"
              ? `/onboarding/package/status?intentId=${encodeURIComponent(intentId)}&return=success`
              : kind === "FEE"
              ? safeReturnPath(returnTo, role) ?? (role ? dashboardPathForRole(role) : "/login")
              : `/billing?${new URLSearchParams({ safepay_status: "completed" })}`
          ),
        1500
      );
    } catch (err: any) {
      // A native alert() on top of the toast said the same thing twice, in a
      // dialog the page cannot style and the user must dismiss before doing
      // anything else. The underlying reason belongs in the toast itself.
      toast.error(err?.message || ui("The payment did not go through. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="sk-brand-surface flex min-h-dvh items-center justify-center p-4">
        <PageCard role="status" className="sk-enter-scale w-full max-w-sm text-center">
          <div aria-hidden="true" className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-status-success-surface ring-1 ring-status-success-border">
            <CheckCircle2 className="size-9 text-status-success-text" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">{ui("Payment successful")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {ui(kind === "FEE" ? "Taking you back to your fees…" : kind === "PACKAGE" ? "Taking you back to your setup…" : "Taking you back to Billing & plan…")}
          </p>
        </PageCard>
      </div>
    );
  }

  return (
    <div className="sk-brand-surface flex min-h-dvh items-center justify-center p-4">
      {/* One shared page card (addendum 2026-10-22 §2): the same radius, padding and shadow as every workspace. */}
      <PageCard className="sk-enter-scale w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-brand">
            <Shield className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-ink-strong">SafePay</h1>
            <p className="sk-eyebrow">{ui("Secured by HBL")}</p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
          <p className="sk-eyebrow">{ui("Order reference")}</p>
          <p dir="ltr" className="mt-1 break-all text-start font-mono text-sm font-semibold text-ink-strong">{orderRef || "—"}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
            <div className="min-w-0">
              <p className="text-sm text-ink-muted">
                {ui(kind === "FEE" ? "Invoice:" : "Plan:")}{" "}
                <span className="font-semibold text-ink-strong">
                  {kind === "FEE" ? ui("Fee payment") : <><bdi>{plan}</bdi> · {ui(billingPeriod === "annual" ? "Annual" : "Monthly")}</>}
                </span>
              </p>
              {billingPeriod === "annual" && (
                <Badge variant="success" size="sm" dot className="mt-2">{ui("20% annual discount applied")}</Badge>
              )}
            </div>
            <p className="text-xl font-bold tabular-nums text-primary"><bdi>{amountLabel}</bdi></p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField name="safepay-card-name" label={ui("Cardholder name")} required>
            <SystemInput
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder={ui("Name on the card")}
              autoComplete="off"
              className="w-full"
              required
            />
          </FormField>
          <FormField name="safepay-card-number" label={ui("Card number")} required>
            <SystemInput
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCard(e.target.value))}
              placeholder="4242 4242 4242 4242"
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              className="w-full tabular-nums"
              required
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField name="safepay-expiry" label={ui("Expiry")} hint={ui("Month / year")} required className="min-w-0">
              <SystemInput
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                placeholder="MM/YY"
                inputMode="numeric"
                autoComplete="off"
                dir="ltr"
                className="w-full tabular-nums"
                required
              />
            </FormField>
            <FormField name="safepay-cvv" label={ui("CVV")} hint={ui("3 digits on the back")} required className="min-w-0">
              <SystemInput
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="123"
                type="password"
                autoComplete="off"
                dir="ltr"
                inputMode="numeric"
                className="w-full"
                required
              />
            </FormField>
          </div>
          <Button variant="default" type="submit" loading={submitting} className="mt-2 w-full">
            {submitting ? null : <Lock aria-hidden="true" />}
            {/* R7: the amount keeps its own number/currency order inside an Arabic or Urdu sentence. */}
            {payBefore}<bdi>{amountLabel}</bdi>{payAfter}
          </Button>
          <Alert tone="info" compact live="off" icon={FlaskConical}>
            {ui("This is a test payment page. No real payment will be charged.")}
          </Alert>
        </form>
      </PageCard>
    </div>
  );
}

/** The first-paint placeholder, shaped like the payment card (logo row, order summary, three fields). */
function SafePaySkeleton() {
  const ui = useUiText();
  return (
    <div className="sk-brand-surface flex min-h-dvh items-center justify-center p-4">
      <SkeletonRegion label={ui("Loading the payment page")} className="w-full max-w-md">
        <PageCard className="space-y-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-28 w-full rounded-2xl" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full rounded-xl" delay={i * 60} />)}
        </PageCard>
      </SkeletonRegion>
    </div>
  );
}

export default function SafePayPage() {
  // The page sits outside every console layout, so it resolves the viewer's language itself — the placeholder too.
  return (
    <LocaleProvider>
      <Suspense fallback={<SafePaySkeleton />}>
        <SafePayForm />
      </Suspense>
    </LocaleProvider>
  );
}
