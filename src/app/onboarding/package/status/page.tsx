"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { getPackageCopy } from "../copy";

type Intent = {
  id: string;
  plan: string;
  billingPeriod: string;
  idempotencyKey: string;
  provider: string;
  checkoutUrl: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  returnStep: string;
  expectedCampuses: number;
  expectedEnrollment: number;
  failureReason: string | null;
};

/** The status card's shape — a state notice, the order details and the actions. */
function StatusSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="mt-6 space-y-5">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="grid gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-24" delay={index * 60} />
            <Skeleton className="h-4 w-36" delay={index * 60} />
          </div>
        ))}
      </div>
      <Skeleton className="h-11 w-full rounded-2xl" />
      <Skeleton className="h-11 w-full rounded-2xl" />
    </SkeletonRegion>
  );
}

function CheckoutStatus() {
  const params = useSearchParams();
  const intentId = params.get("intentId") || "";
  const [intent, setIntent] = useState<Intent | null>(null);
  const [language, setLanguage] = useState("en");
  const [bank, setBank] = useState<{ bankName: string; accountTitle: string; accountNumber: string; iban: string | null } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const copy = getPackageCopy(language);

  const load = useCallback(async () => {
    const response = await fetch(`/api/onboarding/package/status?intentId=${encodeURIComponent(intentId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || copy.paymentFailure);
    setIntent(data.intent as Intent);
    setLanguage(typeof data.language === "string" ? data.language.slice(0, 2).toLowerCase() : "en");
    setBank(data.bank ?? null);
    setError("");
  }, [intentId, copy.paymentFailure]);

  useEffect(() => {
    if (intentId) load().catch(() => setError(copy.paymentFailure));
    else setError(copy.missingReference);
  }, [intentId, load, copy.missingReference]);

  useEffect(() => {
    if (!intent || intent.provider === "BANK_TRANSFER" || intent.provider === "SALES_ASSISTED" || intent.provider === "PAY_LATER" || !["CHECKOUT_PENDING", "PENDING_SETTLEMENT"].includes(intent.status)) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 8000);
    return () => window.clearInterval(timer);
  }, [intent, load]);

  /** A manual refresh (or a retry after a failed first load) reports its own failure. */
  const refresh = async () => {
    if (!intentId) return;
    setRefreshing(true);
    if (!intent) setError("");
    try {
      await load();
    } catch {
      setError(copy.paymentFailure);
    } finally {
      setRefreshing(false);
    }
  };

  const retry = async () => {
    if (!intent) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: intent.plan,
          billingPeriod: intent.billingPeriod,
          expectedCampuses: intent.expectedCampuses,
          expectedEnrollment: intent.expectedEnrollment,
          returnStep: intent.returnStep,
          idempotencyKey: intent.idempotencyKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || copy.paymentFailure);
      if (data.url) window.location.assign(data.url);
      else if (data.intentId) window.location.assign(`/onboarding/package/status?intentId=${encodeURIComponent(data.intentId)}`);
    } catch {
      setError(copy.paymentFailure);
    } finally {
      setBusy(false);
    }
  };

  const isSettled = intent?.status === "SETTLED";
  // Reserved: chosen where no online payment exists; the team confirms payment, nothing was charged.
  const isReserved = intent?.provider === "SALES_ASSISTED" && intent.status === "PENDING_SETTLEMENT";
  const isPending = intent && ["CHECKOUT_PENDING", "PENDING_SETTLEMENT", "PENDING"].includes(intent.status);
  const canRetry = intent && (
    ["FAILED", "CANCELLED"].includes(intent.status) ||
    (intent.provider !== "BANK_TRANSFER" && intent.provider !== "SALES_ASSISTED" && intent.provider !== "PAY_LATER" && ["PENDING", "PENDING_SETTLEMENT"].includes(intent.status) && !intent.checkoutUrl)
  );
  const resumeStep = intent?.returnStep || "package";
  const stateTone: AlertTone = isSettled ? "success" : isPending ? "info" : intent?.status === "FAILED" ? "danger" : intent?.status === "CANCELLED" ? "warning" : "neutral";

  const isRtl = language === "ar" || language === "ur";
  return (
    <main lang={language} dir={isRtl ? "rtl" : "ltr"} className="min-h-screen px-4 py-8 text-ink-strong sm:px-8 sm:py-12">
      <section aria-labelledby="payment-status-title" className="sk-panel sk-enter mx-auto max-w-xl p-5 shadow-lg sm:p-10">
        <p className="sk-eyebrow text-primary">{copy.setup}</p>
        <h1 id="payment-status-title" className="mt-2 text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{copy.statusTitle}</h1>
        {error && (
          <Alert
            tone="danger"
            className="mt-5"
            actions={!intent ? (
              <>
                {intentId && (
                  <Button variant="outline" size="sm" type="button" onClick={() => void refresh()} loading={refreshing}>
                    {!refreshing && <RefreshCw aria-hidden="true" />}{copy.refreshStatus}
                  </Button>
                )}
                <Link href="/onboarding" className={buttonVariants({ variant: "outline", size: "sm" })}>{copy.resumeSetup}</Link>
              </>
            ) : undefined}
          >
            {error}
          </Alert>
        )}
        {!intent && !error && <StatusSkeleton label={copy.loadingOrder.replace(/…$/, "")} />}
        {intent && (
          <div className="mt-6 space-y-5">
            <Alert tone={stateTone} live="polite" title={isReserved ? copy.statusReserved : copy.stateNames[intent.status] ?? intent.status}>
              <p className="text-sm leading-relaxed text-ink-muted">
                {isReserved ? copy.savedReserved : isSettled ? copy.savedActive : isPending ? copy.savedPending : intent.status === "FAILED" ? intent.failureReason || copy.savedFailed : intent.status === "CANCELLED" ? copy.savedCancelled : copy.savedSelection}
              </p>
            </Alert>
            <dl className="grid gap-4 rounded-2xl border border-border-subtle bg-surface-subtle p-4 text-sm sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs font-medium text-ink-subtle">{copy.orderReference}</dt><dd dir="ltr" className="mt-0.5 break-all font-mono font-semibold text-ink-strong"><bdi>{intent.id}</bdi></dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-ink-subtle">{copy.package}</dt><dd className="mt-0.5 font-semibold text-ink-strong">{copy.planNames[intent.plan as keyof typeof copy.planNames] ?? intent.plan}</dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-ink-subtle">{copy.paymentState}</dt><dd className="mt-0.5 font-semibold text-ink-strong">{isReserved ? copy.statusReserved : copy.stateNames[intent.status] ?? intent.status}</dd></div>
              {intent.amount != null && <div className="min-w-0"><dt className="text-xs font-medium text-ink-subtle">{copy.savedAmount}</dt><dd dir="ltr" className="mt-0.5 font-semibold tabular-nums text-ink-strong"><bdi>{intent.currency} {intent.amount.toLocaleString()}</bdi></dd></div>}
            </dl>
            {bank && intent.status === "PENDING_SETTLEMENT" && <dl className="grid gap-4 rounded-2xl border border-border-subtle bg-white p-4 text-sm sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs font-medium text-ink-subtle">{copy.bank}</dt><dd className="mt-0.5 font-semibold text-ink-strong">{bank.bankName}</dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-ink-subtle">{copy.accountTitle}</dt><dd className="mt-0.5 font-semibold text-ink-strong">{bank.accountTitle}</dd></div>
              <div className="min-w-0"><dt className="text-xs font-medium text-ink-subtle">{copy.accountNumber}</dt><dd dir="ltr" className="mt-0.5 break-all font-mono font-semibold tabular-nums text-ink-strong"><bdi>{bank.accountNumber}</bdi></dd></div>
              {bank.iban && <div className="min-w-0"><dt className="text-xs font-medium text-ink-subtle">{copy.iban}</dt><dd dir="ltr" className="mt-0.5 break-all font-mono font-semibold text-ink-strong"><bdi>{bank.iban}</bdi></dd></div>}
            </dl>}
            <div className="flex flex-col gap-3">
              {intent.checkoutUrl && isPending && <a href={intent.checkoutUrl} className={buttonVariants({ variant: "default", className: "w-full" })}>{copy.continueCheckout}</a>}
              {canRetry && <Button variant="default" type="button" onClick={retry} loading={busy} className="w-full">
                {!busy && <RefreshCw aria-hidden="true" className="h-4 w-4" />}{copy.retryCheckout}
              </Button>}
              {isPending && !isReserved && <Button variant="outline" type="button" onClick={() => void refresh()} loading={refreshing} className="w-full">{copy.refreshStatus}</Button>}
              {intent.status === "FAILED" || intent.status === "CANCELLED" ? (
                <Link href={`/onboarding?step=${encodeURIComponent(resumeStep)}&packages=open`} className={buttonVariants({ variant: "outline", className: "w-full" })}>
                  {copy.chooseAnother}
                </Link>
              ) : null}
              <Link href={`/onboarding?step=${encodeURIComponent(resumeStep)}`} className={buttonVariants({ variant: "outline", className: "w-full" })}>
                {copy.resumeSetup}
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default function CheckoutStatusPage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-4 py-8 sm:px-8 sm:py-12"><section className="sk-panel mx-auto max-w-xl p-5 sm:p-10"><StatusSkeleton label={getPackageCopy("en").loadingOrder.replace(/…$/, "")} /></section></main>}>
      <CheckoutStatus />
    </Suspense>
  );
}
