"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

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

  const load = useCallback(async () => {
    const response = await fetch(`/api/onboarding/package/status?intentId=${encodeURIComponent(intentId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Payment status could not be loaded.");
    setIntent(data.intent as Intent);
    setLanguage(typeof data.language === "string" ? data.language.slice(0, 2).toLowerCase() : "en");
    setBank(data.bank ?? null);
    setError("");
  }, [intentId]);

  useEffect(() => {
    if (intentId) load().catch((issue) => setError(issue instanceof Error ? issue.message : "Payment status could not be loaded."));
    else setError("Checkout reference is missing.");
  }, [intentId, load]);

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
      if (!response.ok) throw new Error(data.error || "Retry could not be started.");
      if (data.url) window.location.assign(data.url);
      else if (data.intentId) window.location.assign(`/onboarding/package/status?intentId=${encodeURIComponent(data.intentId)}`);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Retry could not be started.");
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
      <section aria-labelledby="payment-status-title" className="mx-auto max-w-xl rounded-3xl border border-[#e6dce9] bg-white p-6 shadow-sm sm:p-10">
        <h1 id="payment-status-title" className="text-2xl font-black sm:text-3xl">Payment and setup status</h1>
        {error && <p role="alert" className="mt-5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">{error}</p>}
        {!intent && !error && <p aria-live="polite" className="mt-5 flex items-center gap-2 text-sm text-[#615668]"><Loader2 className="h-4 w-4 animate-spin" />Loading saved order…</p>}
        {intent && (
          <div className="mt-6 space-y-5">
            <div className={`rounded-2xl border p-4 ${isSettled ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <p className="flex items-center gap-2 font-bold">
                {isSettled ? <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-700" /> : isPending ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-amber-800" /> : <AlertCircle aria-hidden="true" className="h-5 w-5 text-amber-800" />}
                {isSettled ? "Payment confirmed by the provider" : isPending ? "Payment is being confirmed" : intent.status === "CUSTOM_QUOTE" ? "Custom quote requested" : intent.status === "FREE_SELECTED" ? "Free package selected" : intent.status === "CANCELLED" ? "Checkout cancelled" : intent.status === "FAILED" ? "Payment failed" : intent.status}
              </p>
              <p aria-live="polite" className="mt-2 text-sm leading-6 text-[#615668]">
                {isSettled ? "Your package is active. Resume the setup you saved." : isPending ? "Your school setup is saved. You can wait here or return to it while confirmation continues." : intent.status === "FAILED" ? intent.failureReason || "Your setup draft is saved. You can retry the payment or choose the free package." : intent.status === "CANCELLED" ? "Your setup draft is saved. Choose another package or try checkout again." : "Your selection is saved with the approved commercial catalogue."}
              </p>
            </div>
            <dl className="grid gap-3 rounded-2xl bg-[#fbf7fc] p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-[#615668]">Order reference</dt><dd dir="ltr" className="break-all font-mono font-semibold"><bdi>{intent.id}</bdi></dd></div>
              <div><dt className="text-[#615668]">Package</dt><dd className="font-semibold">{intent.plan}</dd></div>
              <div><dt className="text-[#615668]">Payment state</dt><dd className="font-semibold">{intent.status}</dd></div>
              {intent.amount != null && <div><dt className="text-[#615668]">Saved amount</dt><dd dir="ltr" className="font-semibold"><bdi>{intent.currency} {intent.amount.toLocaleString()}</bdi></dd></div>}
            </dl>
            {bank && intent.status === "PENDING_SETTLEMENT" && <dl className="grid gap-2 rounded-2xl border border-[#e6dce9] p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-[#615668]">Bank</dt><dd className="font-semibold">{bank.bankName}</dd></div>
              <div><dt className="text-[#615668]">Account title</dt><dd className="font-semibold">{bank.accountTitle}</dd></div>
              <div><dt className="text-[#615668]">Account number</dt><dd dir="ltr" className="break-all font-mono font-semibold"><bdi>{bank.accountNumber}</bdi></dd></div>
              {bank.iban && <div><dt className="text-[#615668]">IBAN</dt><dd dir="ltr" className="break-all font-mono font-semibold"><bdi>{bank.iban}</bdi></dd></div>}
            </dl>}
            {intent.checkoutUrl && isPending && <a href={intent.checkoutUrl} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#8127cf] px-4 text-sm font-bold text-white hover:bg-[#681daf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8127cf]">Continue checkout</a>}
            {canRetry && <button type="button" onClick={retry} disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#8127cf] px-4 text-sm font-bold text-white hover:bg-[#681daf] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8127cf]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Retry checkout
            </button>}
            {isPending && <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl border border-[#cfc2d6] px-4 text-sm font-semibold hover:bg-[#fbf7fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8127cf]">Refresh payment status</button>}
            <Link href={`/onboarding?step=${encodeURIComponent(resumeStep)}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#cfc2d6] px-4 text-sm font-bold text-[#5c5063] hover:bg-[#fbf7fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8127cf]">
              Resume saved setup
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
