"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { DeskPill, DeskSection } from "@/components/ui/desk";
import { ErrorState } from "@/components/ui/error-state";
import { PageCard } from "@/components/ui/page-card";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, Banknote, Clock, CreditCard, Hash, Landmark, Package, ReceiptText, RefreshCw, Wallet, type LucideIcon } from "lucide-react";
import { translateUi } from "@/lib/locale/ui-messages";
import { getPackageCopy } from "../copy";
import { formatPackageAmount, packageStatus, type SchoolLifecycle } from "@/lib/billing/package-status";

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
    <SkeletonRegion label={label} className="space-y-5">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="grid gap-4 rounded-2xl border border-border-subtle p-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-start gap-3">
            <Skeleton className="size-9 shrink-0 rounded-xl" delay={index * 60} />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-24" delay={index * 60} />
              <Skeleton className="h-4 w-36 max-w-full" delay={index * 60} />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-11 w-full rounded-2xl" />
      <Skeleton className="h-11 w-full rounded-2xl" />
    </SkeletonRegion>
  );
}

/** One order fact: a toned icon tile beside its label and value. The tile takes the section's tone. */
function Detail({ icon: Icon, label, children, ltr }: { icon: LucideIcon; label: string; children: ReactNode; ltr?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span aria-hidden="true" className="sk-desk-section-icon size-9 rounded-xl"><Icon /></span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-ink-subtle">{label}</dt>
        <dd dir={ltr ? "ltr" : undefined} className={ltr ? "mt-0.5 break-all font-semibold text-ink-strong" : "mt-0.5 font-semibold text-ink-strong [overflow-wrap:anywhere]"}>{children}</dd>
      </div>
    </div>
  );
}

/** The canvas and the one card every state of this page sits in. */
function StatusFrame({ language, title, pill, children }: { language: string; title: string; pill?: ReactNode; children: ReactNode }) {
  const isRtl = language === "ar" || language === "ur";
  const copy = getPackageCopy(language);
  return (
    <main lang={language} dir={isRtl ? "rtl" : "ltr"} className="sk-app-canvas min-h-dvh px-4 py-8 text-ink-strong sm:px-8 sm:py-12">
      <PageCard className="sk-enter mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-8">
        <PageHeader icon={ReceiptText} eyebrow={copy.setup} title={<span id="payment-status-title">{title}</span>} status={pill} />
        {children}
      </PageCard>
    </main>
  );
}

function CheckoutStatus() {
  const params = useSearchParams();
  const intentId = params.get("intentId") || "";
  const [intent, setIntent] = useState<Intent | null>(null);
  const [language, setLanguage] = useState("en");
  const [bank, setBank] = useState<{ bankName: string; accountTitle: string; accountNumber: string; iban: string | null } | null>(null);
  const [lifecycle, setLifecycle] = useState<SchoolLifecycle | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
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
    setLifecycle(data.lifecycle ?? null);
    setCheckedAt(typeof data.checkedAt === "string" ? data.checkedAt : new Date().toISOString());
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

  // SKAI-161: the shared reading also covers grace, expiry and bank transfers, as the setup wizard shows them.
  const shared = intent ? packageStatus(intent, lifecycle) : null;
  const lapsed = shared?.key === "grace" || shared?.key === "expired";
  const stateName = !intent ? "" : shared?.key === "grace" ? copy.statusGrace : shared?.key === "expired" ? copy.statusExpired
    : isReserved ? copy.statusReserved : shared?.key === "bank" ? copy.statusBank : copy.stateNames[intent.status] ?? intent.status;
  const locale = language === "ar" ? "ar" : language === "ur" ? "ur-PK" : "en";
  const checkedLabel = checkedAt ? copy.lastChecked.replace("{0}", new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(checkedAt))) : "";

  const pillTone = shared?.key === "expired" ? "danger" : shared?.key === "grace" ? "warning" : stateTone;
  const stateIcon = isSettled ? CreditCard : isPending ? Clock : Activity;
  const resumeLink = (
    <Link href={`/onboarding?step=${encodeURIComponent(resumeStep)}`} className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}>
      {copy.resumeSetup}
    </Link>
  );
  return (
    <StatusFrame language={language} title={copy.statusTitle} pill={intent ? <DeskPill tone={pillTone} data-payment-state={intent.status}>{stateName}</DeskPill> : undefined}>
      {error && !intent && (
        <ErrorState
          title={error}
          description={translateUi("We couldn't load this right now. Please try again.", language)}
          onRetry={intentId ? refresh : undefined}
          retryLabel={copy.refreshStatus}
          action={<Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>{copy.resumeSetup}</Link>}
        />
      )}
      {error && intent && <Alert tone="danger">{error}</Alert>}
      {!intent && !error && <StatusSkeleton label={copy.loadingOrder.replace(/…$/, "")} />}
      {intent && (
        <div className="space-y-5">
          <Alert tone={pillTone} live="polite" title={stateName}>
            <p className="text-sm leading-relaxed text-ink-muted">
              {lapsed ? (shared?.key === "grace" ? copy.savedGrace : copy.savedExpired) : isReserved ? copy.savedReserved : isSettled ? copy.savedActive : isPending ? copy.savedPending : intent.status === "FAILED" ? intent.failureReason || copy.savedFailed : intent.status === "CANCELLED" ? copy.savedCancelled : copy.savedSelection}
            </p>
          </Alert>
          <DeskSection title={copy.planNames[intent.plan as keyof typeof copy.planNames] ?? intent.plan} icon={Package} tone={pillTone}>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail icon={Hash} label={copy.orderReference} ltr><bdi className="font-mono">{intent.id}</bdi></Detail>
              <Detail icon={Package} label={copy.package}>{copy.planNames[intent.plan as keyof typeof copy.planNames] ?? intent.plan}</Detail>
              <Detail icon={stateIcon} label={copy.paymentState}>{stateName}</Detail>
              {intent.amount != null && <Detail icon={Wallet} label={copy.savedAmount} ltr><bdi className="tabular-nums">{formatPackageAmount(intent.amount, intent.currency, language)}</bdi></Detail>}
            </dl>
            {checkedLabel && <p className="flex items-center gap-1.5 border-t border-border-subtle pt-3 text-xs text-ink-subtle" aria-live="polite"><RefreshCw aria-hidden="true" className="size-3.5 shrink-0" />{checkedLabel}</p>}
          </DeskSection>
          {bank && intent.status === "PENDING_SETTLEMENT" && <DeskSection title={copy.statusBank} icon={Landmark} tone="info">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail icon={Landmark} label={copy.bank}>{bank.bankName}</Detail>
              <Detail icon={Banknote} label={copy.accountTitle}>{bank.accountTitle}</Detail>
              <Detail icon={Hash} label={copy.accountNumber} ltr><bdi className="font-mono tabular-nums">{bank.accountNumber}</bdi></Detail>
              {bank.iban && <Detail icon={Hash} label={copy.iban} ltr><bdi className="font-mono">{bank.iban}</bdi></Detail>}
            </dl>
          </DeskSection>}
          <div className="flex flex-col gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:flex-wrap sm:justify-end">
            {intent.status === "FAILED" || intent.status === "CANCELLED" ? (
              <Link href={`/onboarding?step=${encodeURIComponent(resumeStep)}&packages=open`} className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}>
                {copy.chooseAnother}
              </Link>
            ) : null}
            {resumeLink}
            {isPending && !isReserved && <Button variant="outline" type="button" onClick={() => void refresh()} loading={refreshing} className="w-full sm:w-auto">
              {!refreshing && <RefreshCw aria-hidden="true" />}{copy.refreshStatus}
            </Button>}
            {canRetry && <Button variant="default" type="button" onClick={retry} loading={busy} className="order-first w-full sm:order-none sm:w-auto">
              {!busy && <RefreshCw aria-hidden="true" className="h-4 w-4" />}{copy.retryCheckout}
            </Button>}
            {intent.checkoutUrl && isPending && <a href={intent.checkoutUrl} className={buttonVariants({ variant: "default", className: "order-first w-full sm:order-none sm:w-auto" })}>{copy.continueCheckout}</a>}
          </div>
        </div>
      )}
    </StatusFrame>
  );
}

export default function CheckoutStatusPage() {
  return (
    <Suspense fallback={<StatusFrame language="en" title={getPackageCopy("en").statusTitle}><StatusSkeleton label={getPackageCopy("en").loadingOrder.replace(/…$/, "")} /></StatusFrame>}>
      <CheckoutStatus />
    </Suspense>
  );
}
