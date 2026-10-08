"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
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

function CheckoutStatus() {
  const params = useSearchParams();
  const intentId = params.get("intentId") || "";
  const [intent, setIntent] = useState<Intent | null>(null);
  const [language, setLanguage] = useState("en");
  const [bank, setBank] = useState<{ bankName: string; accountTitle: string; accountNumber: string; iban: string | null } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    if (intentId) load().catch((issue) => setError(issue instanceof Error ? issue.message : copy.paymentFailure));
    else setError(copy.missingReference);
  }, [intentId, load, copy.missingReference]);

  useEffect(() => {
    if (!intent || intent.provider === "BANK_TRANSFER" || !["CHECKOUT_PENDING", "PENDING_SETTLEMENT"].includes(intent.status)) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 8000);
    return () => window.clearInterval(timer);
  }, [intent, load]);

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
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : copy.paymentFailure);
    } finally {
      setBusy(false);
    }
  };

  const isSettled = intent?.status === "SETTLED";
  const isPending = intent && ["CHECKOUT_PENDING", "PENDING_SETTLEMENT", "PENDING"].includes(intent.status);
  const canRetry = intent && (
    ["FAILED", "CANCELLED"].includes(intent.status) ||
    (intent.provider !== "BANK_TRANSFER" && ["PENDING", "PENDING_SETTLEMENT"].includes(intent.status) && !intent.checkoutUrl)
  );
  const resumeStep = intent?.returnStep || "campuses";

  const isRtl = language === "ar" || language === "ur";
  return (
    <main lang={language} dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-[#fff7fe] px-4 py-8 text-[#1f1a23] sm:px-8 sm:py-12">
      <section aria-labelledby="payment-status-title" className="sk-panel mx-auto max-w-xl p-6 sm:p-10">
        <h1 id="payment-status-title" className="text-2xl font-black sm:text-3xl">{copy.statusTitle}</h1>
        {error && <p role="alert" className="mt-5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">{error}</p>}
        {!intent && !error && <p aria-live="polite" className="mt-5 flex items-center gap-2 text-sm text-[#615668]"><Loader2 className="h-4 w-4 animate-spin" />{copy.loadingOrder}</p>}
        {intent && (
          <div className="mt-6 space-y-5">
            <div className={`rounded-2xl border p-4 ${isSettled ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <p className="flex items-center gap-2 font-bold">
                {isSettled ? <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-700" /> : isPending ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-amber-800" /> : <AlertCircle aria-hidden="true" className="h-5 w-5 text-amber-800" />}
                {copy.stateNames[intent.status] ?? intent.status}
              </p>
              <p aria-live="polite" className="mt-2 text-sm leading-6 text-[#615668]">
                {isSettled ? copy.savedActive : isPending ? copy.savedPending : intent.status === "FAILED" ? intent.failureReason || copy.savedFailed : intent.status === "CANCELLED" ? copy.savedCancelled : copy.savedSelection}
              </p>
            </div>
            <dl className="grid gap-3 rounded-2xl bg-[#fbf7fc] p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-[#615668]">{copy.orderReference}</dt><dd dir="ltr" className="break-all font-mono font-semibold"><bdi>{intent.id}</bdi></dd></div>
              <div><dt className="text-[#615668]">{copy.package}</dt><dd className="font-semibold">{copy.planNames[intent.plan as keyof typeof copy.planNames] ?? intent.plan}</dd></div>
              <div><dt className="text-[#615668]">{copy.paymentState}</dt><dd className="font-semibold">{copy.stateNames[intent.status] ?? intent.status}</dd></div>
              {intent.amount != null && <div><dt className="text-[#615668]">{copy.savedAmount}</dt><dd dir="ltr" className="font-semibold"><bdi>{intent.currency} {intent.amount.toLocaleString()}</bdi></dd></div>}
            </dl>
            {bank && intent.status === "PENDING_SETTLEMENT" && <dl className="grid gap-2 rounded-2xl border border-[#e6dce9] p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-[#615668]">{copy.bank}</dt><dd className="font-semibold">{bank.bankName}</dd></div>
              <div><dt className="text-[#615668]">{copy.accountTitle}</dt><dd className="font-semibold">{bank.accountTitle}</dd></div>
              <div><dt className="text-[#615668]">{copy.accountNumber}</dt><dd dir="ltr" className="break-all font-mono font-semibold"><bdi>{bank.accountNumber}</bdi></dd></div>
              {bank.iban && <div><dt className="text-[#615668]">{copy.iban}</dt><dd dir="ltr" className="break-all font-mono font-semibold"><bdi>{bank.iban}</bdi></dd></div>}
            </dl>}
            {intent.checkoutUrl && isPending && <a href={intent.checkoutUrl} className={buttonVariants({ variant: "default", className: "w-full" })}>{copy.continueCheckout}</a>}
            {canRetry && <Button variant="default" type="button" onClick={retry} disabled={busy} className="w-full items-center justify-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {copy.retryCheckout}
            </Button>}
            {isPending && <Button variant="outline" type="button" onClick={() => void load()} >{copy.refreshStatus}</Button>}
            <Link href={`/onboarding?step=${encodeURIComponent(resumeStep)}`} className={buttonVariants({ variant: "outline", className: "w-full" })}>
              {copy.resumeSetup}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

export default function CheckoutStatusPage() {
  return <Suspense fallback={<main className="p-8 text-sm">Loading checkout status…</main>}><CheckoutStatus /></Suspense>;
}
