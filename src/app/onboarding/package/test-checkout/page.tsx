"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, FlaskConical, XCircle } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeskPill } from "@/components/ui/desk";
import { getPackageCopy } from "../copy";

type Intent = { id: string; plan: "FREE" | "BASIC" | "PRO" | "ENTERPRISE"; billingPeriod: string; amount: number | null; currency: string | null; status: string; provider: string };
type Outcome = "paid" | "declined" | "cancelled";

/**
 * Development-only stand-in for a payment provider's hosted checkout
 * (src/lib/payments/test-checkout.ts). No money moves: "Pay" settles the
 * intent through the verified-payment path, so the package really activates
 * in the local database; Decline and Cancel end the attempt like a provider
 * would. The API refuses every call unless `next dev` runs with
 * ALLOW_TEST_CHECKOUT=true.
 */
function TestCheckout() {
  const params = useSearchParams();
  const router = useRouter();
  const intentId = params.get("intentId") ?? "";
  const copy = getPackageCopy("en");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Outcome | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/onboarding/package/status?intentId=${encodeURIComponent(intentId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Checkout could not be loaded.");
    setIntent(data.intent as Intent);
  }, [intentId]);

  useEffect(() => {
    if (!intentId) { setError("Checkout reference is missing."); return; }
    load().catch((e) => setError(e instanceof Error ? e.message : "Checkout could not be loaded."));
  }, [intentId, load]);

  const finish = async (outcome: Outcome) => {
    setBusy(outcome);
    setError("");
    try {
      const response = await fetch("/api/onboarding/package/test-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId, outcome }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Test checkout failed.");
      router.push(`/onboarding/package/status?intentId=${encodeURIComponent(intentId)}&return=${outcome === "paid" ? "success" : "cancelled"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test checkout failed.");
      setBusy(null);
    }
  };

  const amount = intent?.amount != null ? `${intent.currency ?? "PKR"} ${new Intl.NumberFormat("en-PK").format(intent.amount)}` : "—";
  const open = intent && ["CHECKOUT_PENDING", "PENDING_SETTLEMENT"].includes(intent.status) && intent.provider === "TEST";

  return (
    <section aria-labelledby="test-checkout-title" className="sk-panel sk-gradient-border sk-step-card space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="sk-page-icon"><CreditCard className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="sk-folio text-primary">Skoolee · Test checkout</p>
          <h1 id="test-checkout-title" className="mt-1 text-2xl font-bold tracking-tight text-ink-strong">Test payment</h1>
        </div>
        {intent && <DeskPill tone={open ? "info" : "neutral"}>{copy.stateNames[intent.status] ?? intent.status}</DeskPill>}
      </header>
      <Alert tone="warning" icon={FlaskConical} live="off" role="note" title="Development only — no money moves">
        This page stands in for the payment provider on a local dev server. Pay activates the package in this database only.
      </Alert>
      {error && <Alert tone="danger">{error}</Alert>}
      {!intent && !error ? (
        <Skeleton className="h-28 w-full rounded-2xl" />
      ) : intent ? (
        <dl className="sk-package-limits">
          <div><dt>{copy.package}</dt><dd>{copy.planNames[intent.plan] ?? intent.plan}</dd></div>
          <div><dt>{copy.billingPeriod}</dt><dd>{intent.billingPeriod === "annual" ? copy.annual : copy.monthly}</dd></div>
          <div><dt>{copy.savedAmount}</dt><dd dir="ltr">{amount}</dd></div>
          <div><dt>{copy.paymentState}</dt><dd>{copy.stateNames[intent.status] ?? intent.status}</dd></div>
        </dl>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle pt-4">
        <Button variant="ghost" onClick={() => void finish("cancelled")} disabled={!open || !!busy} loading={busy === "cancelled"}>Cancel checkout</Button>
        <Button variant="outline" onClick={() => void finish("declined")} disabled={!open || !!busy} loading={busy === "declined"} className="gap-2">
          {busy !== "declined" && <XCircle aria-hidden="true" className="size-4" />}Decline payment
        </Button>
        <Button onClick={() => void finish("paid")} disabled={!open || !!busy} loading={busy === "paid"} className="gap-2">
          {busy !== "paid" && <CreditCard aria-hidden="true" className="size-4" />}Pay {amount} (test)
        </Button>
      </div>
    </section>
  );
}

export default function TestCheckoutPage() {
  return (
    <AuthShell language="en" layout="center">
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <TestCheckout />
      </Suspense>
    </AuthShell>
  );
}
