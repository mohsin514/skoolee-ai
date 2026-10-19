"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Mail, Package, ShieldCheck, Users } from "lucide-react";
import { AuthColophon } from "@/components/auth/AuthColophon";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { AuthShell } from "@/components/auth/AuthShell";
import { FieldGroup } from "@/components/auth/FieldGroup";
import { PackageCard } from "@/components/onboarding/PackageCard";
import { SetupBar } from "@/components/onboarding/SetupBar";
import { StepCard } from "@/components/onboarding/StepCard";
import { StepDock } from "@/components/onboarding/StepDock";
import type { Language } from "@/lib/locale/package";
import { ANNUAL_DISCOUNT } from "@/config/plans";
import { getPackageCopy } from "./copy";

type Plan = {
  type: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  name: string;
  price: number | null;
  priceLabel: string;
  features: string[];
  maxStudents: number;
  maxTeachers: number;
  maxCampuses: number;
  aiCredits: number;
  isCustom: boolean;
};

type Catalogue = {
  plans: Record<Plan["type"], Plan>;
  currentPlan: Plan["type"];
  regionalCurrency: string;
  priceCurrency: string;
  catalogueVersion: string;
  commercialTermsVersion: string;
  regionalPriceDisclosure: string;
  paymentMethods: string[];
  salesAssisted: boolean;
  bank: { bankName: string; accountTitle: string; accountNumber: string; iban: string | null } | null;
  language: string;
};

const order: Plan["type"][] = ["FREE", "BASIC", "PRO", "ENTERPRISE"];

/** Strings this page owns that the shared package copy does not carry. */
const pageCopy = {
  en: {
    loading: "Loading approved packages",
    loadFailed: "Packages could not be loaded",
    retry: "Try again",
    sizingHint: "Used to show which packages fit, and sent with the package you choose.",
  },
  ar: {
    loading: "جارٍ تحميل الباقات المعتمدة",
    loadFailed: "تعذر تحميل الباقات",
    retry: "إعادة المحاولة",
    sizingHint: "تُستخدم لإظهار الباقات المناسبة، وتُرسل مع الباقة التي تختارها.",
  },
  ur: {
    loading: "منظور شدہ پیکیجز لوڈ ہو رہے ہیں",
    loadFailed: "پیکیجز لوڈ نہیں ہو سکے",
    retry: "دوبارہ کوشش کریں",
    sizingHint: "ان سے پتا چلتا ہے کہ کون سے پیکیج موزوں ہیں، اور یہ آپ کے منتخب کردہ پیکیج کے ساتھ بھیجے جاتے ہیں۔",
  },
} as const;

/** Four package-shaped placeholders, so the grid does not jump when the catalogue lands. */
function PackagesSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="@container"><div className="sk-package-grid">
      {order.map((type, index) => (
        <div key={type} className="sk-package-card animate-skeleton-in min-h-[28rem]" style={{ animationDelay: `${index * 80}ms` }}>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-2 h-7 w-40" />
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-11 w-full rounded-2xl" />
        </div>
      ))}
    </div></SkeletonRegion>
  );
}

function PackageChoice() {
  const params = useSearchParams();
  const router = useRouter();
  const returnStep = params.get("returnStep") || "package";
  const initialCampuses = Number(params.get("campuses") || "1");
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [campuses, setCampuses] = useState(Number.isSafeInteger(initialCampuses) ? Math.max(1, initialCampuses) : 1);
  const initialEnrollment = Number(params.get("enrollment") || "50");
  const [enrollment, setEnrollment] = useState(Number.isSafeInteger(initialEnrollment) ? Math.max(0, initialEnrollment) : 50);
  const [busy, setBusy] = useState<Plan["type"] | null>(null);
  const [message, setMessage] = useState("");
  const retryKey = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const language = catalogue?.language.slice(0, 2).toLowerCase() || "en";
  const copy = getPackageCopy(language);
  const local = pageCopy[language === "ar" ? "ar" : language === "ur" ? "ur" : "en"];
  const resume = useMemo(() => {
    const allowed = ["structure", "identity", "package", "campuses", "academic", "review"];
    return allowed.includes(returnStep) ? returnStep : "package";
  }, [returnStep]);

  const load = useCallback(async () => {
    const response = await fetch("/api/onboarding/package", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Package catalogue is unavailable.");
    setCatalogue(data as Catalogue);
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Package catalogue is unavailable."));
  }, [load]);

  const retryLoad = () => {
    setMessage("");
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Package catalogue is unavailable."));
  };

  const startChoice = async (plan: Plan) => {
    if (!catalogue) return;
    setBusy(plan.type);
    setMessage("");
    try {
      const response = await fetch("/api/onboarding/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: plan.type,
          billingPeriod: period,
          expectedCampuses: campuses,
          expectedEnrollment: enrollment,
          returnStep: resume,
          idempotencyKey: retryKey.current ?? (retryKey.current = crypto.randomUUID()),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.intentId) {
          router.push(`/onboarding/package/status?intentId=${encodeURIComponent(data.intentId)}`);
          return;
        }
        throw new Error(data.error || "Package selection failed.");
      }
      if (plan.type === "FREE") {
        router.push(`/onboarding?step=${encodeURIComponent(resume)}`);
      } else if (plan.type === "ENTERPRISE") {
        const subject = encodeURIComponent(`Custom plan enquiry — ${catalogue.plans.ENTERPRISE.name}`);
        const body = encodeURIComponent(`Expected campuses: ${campuses}\nExpected enrollment: ${enrollment}\nSetup return step: ${resume}\nCheckout reference: ${data.intentId}`);
        window.location.href = `mailto:${encodeURIComponent(process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@skoolee.ai")}?subject=${subject}&body=${body}`;
        setBusy(null);
      } else if (data.url) {
        window.location.assign(data.url);
      } else {
        router.push(`/onboarding/package/status?intentId=${encodeURIComponent(data.intentId)}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Package selection failed.");
      setBusy(null);
    }
  };

  const requestRegionalQuote = (plan: Plan) => {
    if (!catalogue) return;
    const subject = encodeURIComponent(`Package quote — ${plan.name}`);
    const body = encodeURIComponent(`Package: ${plan.name}\nBilling period: ${period}\nExpected campuses: ${campuses}\nExpected enrollment: ${enrollment}\nSchool currency: ${catalogue.regionalCurrency}\nSetup return step: ${resume}`);
    window.location.href = `mailto:${encodeURIComponent(process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@skoolee.ai")}?subject=${subject}&body=${body}`;
  };

  const priceText = (plan: Plan) => {
    if (plan.price == null) return copy.customQuote;
    if (plan.price === 0) return copy.free;
    const total = period === "annual" ? Math.round(plan.price * (1 - ANNUAL_DISCOUNT) * 12) : plan.price;
    const monthly = period === "annual" ? Math.round(total / 12) : plan.price;
    const money = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(monthly);
    const cycleTotal = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(total);
    return period === "annual" ? `PKR ${money}/${copy.perMonth} · PKR ${cycleTotal}/${copy.perYear}` : `PKR ${money}/${copy.perMonth}`;
  };

  const shellLanguage: Language = language === "ar" ? "ar" : language === "ur" ? "ur" : "en";
  const backToSetup = () => router.push(`/onboarding?step=${encodeURIComponent(resume)}`);
  const limitValue = (value: number) => (value < 0 ? copy.unlimited : value.toLocaleString());

  return (
    <AuthShell
      language={shellLanguage}
      layout="center"
      width="studio"
      footer={<AuthColophon language={shellLanguage} claims={["campuses", "encrypted"]} />}
    >
      <SetupBar
        face={<AuthMascot size="min(1.5rem, 7vw)" rule={false} />}
        summary={(
          <p className="sk-chip min-w-0">
            <Package aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">{copy.setup}</span>
          </p>
        )}
        actions={(
          <Link href={`/onboarding?step=${encodeURIComponent(resume)}`} className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}>
            <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
            <span className="max-sm:sr-only">{copy.back}</span>
          </Link>
        )}
      />

      <StepCard
        headingRef={headingRef}
        folio={copy.folio}
        title={copy.title}
        intro={copy.intro}
        notices={message && catalogue ? <Alert tone="danger">{message}</Alert> : null}
        dock={<StepDock back={{ label: copy.back, onClick: backToSetup, disabled: !!busy }} />}
      >
        <div className="space-y-6">
          <FieldGroup level={2} id="grp-sizing" icon={Users} title={copy.sizingTitle}>
            <p id="sizing-hint" className="-mt-2 px-1 text-sm leading-relaxed text-ink-muted">{local.sizingHint}</p>
            <div className="grid gap-4 @min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] @min-[36rem]:items-end">
              <FormField name="expectedCampuses" label={copy.campuses}>
                <Input id="expected-campuses" type="number" inputMode="numeric" min={1} max={1000} value={campuses} onChange={(event) => setCampuses(Math.max(1, Number(event.target.value) || 1))} aria-describedby="sizing-hint" className="min-h-11 tabular-nums" />
              </FormField>
              <FormField name="expectedEnrollment" label={copy.enrollment}>
                <Input id="expected-enrollment" type="number" inputMode="numeric" min={0} max={10000000} value={enrollment} onChange={(event) => setEnrollment(Math.max(0, Number(event.target.value) || 0))} aria-describedby="sizing-hint" className="min-h-11 tabular-nums" />
              </FormField>
              {catalogue && (
                <div className="space-y-1.5">
                  <p id="billing-period-label" className="sk-field-label">{copy.billingPeriod}</p>
                  <div role="group" aria-labelledby="billing-period-label" className="sk-period-toggle">
                    {(["monthly", "annual"] as const).map((choice) => (
                      <Button variant="choice" key={choice} type="button" size="sm" aria-pressed={period === choice} onClick={() => setPeriod(choice)} className="border-transparent bg-transparent">
                        {choice === "monthly" ? copy.monthly : copy.annual}
                        {choice === "annual" && <span className="text-xs font-medium text-primary">−<span className="tabular-nums">{Math.round(ANNUAL_DISCOUNT * 100)}%</span></span>}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FieldGroup>

          {message && !catalogue && (
            <ErrorState className="sk-panel" title={local.loadFailed} description={message} onRetry={retryLoad} retryLabel={local.retry} />
          )}
          {!catalogue && !message && <PackagesSkeleton label={local.loading} />}

          {catalogue && (
            <section aria-labelledby="packages-heading" className="@container space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                <h2 id="packages-heading" className="text-md font-bold text-ink-strong">{copy.availablePackages}</h2>
                <p className="min-w-0 text-xs leading-relaxed text-ink-subtle">
                  <span>{copy.regionalCurrency}: </span>
                  <bdi dir="ltr">{catalogue.regionalCurrency}</bdi>
                </p>
              </div>
              <div className="sk-package-grid sk-stagger">
                {order.map((type) => {
                  const plan = catalogue.plans[type];
                  const fits = (plan.maxCampuses < 0 || campuses <= plan.maxCampuses) && (plan.maxStudents < 0 || enrollment <= plan.maxStudents);
                  const current = plan.type === catalogue.currentPlan;
                  const paidType = type !== "FREE" && type !== "ENTERPRISE";
                  const regionalQuote = paidType && catalogue.salesAssisted;
                  // No payment rail is configured (no SafePay/Stripe keys, no bank account in payment settings):
                  // offer the sales-assisted quote rather than a dead "Checkout unavailable" button.
                  const notConfigured = paidType && !regionalQuote && catalogue.paymentMethods.length === 0;
                  const quoteOnly = regionalQuote || notConfigured;
                  return (
                    <PackageCard
                      key={plan.type}
                      name={copy.planNames[plan.type] ?? plan.name}
                      tag={current ? copy.current : undefined}
                      current={current}
                      price={priceText(plan)}
                      description={type === "FREE" ? copy.freeDescription : type === "ENTERPRISE" ? copy.customDescription : undefined}
                      fit={{ fits, label: fits ? copy.fits : copy.exceeds }}
                      limits={[
                        { label: copy.students, value: limitValue(plan.maxStudents) },
                        { label: copy.teachers, value: limitValue(plan.maxTeachers) },
                        { label: copy.branches, value: limitValue(plan.maxCampuses) },
                        { label: copy.aiCredits, value: plan.aiCredits.toLocaleString() },
                      ]}
                      features={plan.features.map((feature) => (
                        <span key={feature} lang={copy.featureNames[feature] ? language : "en"} dir="auto">{copy.featureNames[feature] ?? feature}</span>
                      ))}
                      note={regionalQuote ? copy.regionalQuote : notConfigured ? copy.checkoutNotConfigured : undefined}
                      action={type === "FREE" ? (
                        <Button variant="default" type="button" onClick={() => startChoice(plan)} disabled={!!busy} loading={busy === type}>
                          {busy !== type && <ShieldCheck aria-hidden="true" className="h-4 w-4" />}{copy.continueFree}
                        </Button>
                      ) : type === "ENTERPRISE" ? (
                        <Button variant="outline" type="button" onClick={() => startChoice(plan)} disabled={!!busy} loading={busy === type}>
                          {busy !== type && <Mail aria-hidden="true" className="h-4 w-4" />}{copy.quote}
                        </Button>
                      ) : quoteOnly ? (
                        <Button variant="outline" type="button" onClick={() => requestRegionalQuote(plan)} disabled={!!busy}>
                          <Mail aria-hidden="true" className="h-4 w-4" />{copy.quote}
                        </Button>
                      ) : (
                        <Button variant="default" type="button" onClick={() => startChoice(plan)} disabled={!!busy} loading={busy === type}>
                          {copy.choose}
                        </Button>
                      )}
                    />
                  );
                })}
              </div>
              <p className="px-1 text-xs leading-relaxed text-ink-subtle">
                {language === "en" ? catalogue.regionalPriceDisclosure : copy.priceDisclosure}
                <span aria-hidden="true" className="mx-2">·</span>
                {copy.approvedTerms}: <bdi dir="ltr">{catalogue.catalogueVersion}</bdi>
                <span aria-hidden="true" className="mx-2">·</span>
                {copy.catalogue}: <bdi dir="ltr">{catalogue.commercialTermsVersion}</bdi>
              </p>
            </section>
          )}
        </div>
      </StepCard>
    </AuthShell>
  );
}

export default function OnboardingPackagePage() {
  return (
    <Suspense fallback={<AuthShell language="en" layout="center" width="studio"><PackagesSkeleton label="Loading packages" /></AuthShell>}>
      <PackageChoice />
    </Suspense>
  );
}
