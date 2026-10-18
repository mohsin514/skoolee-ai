"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Check, Mail, ShieldCheck } from "lucide-react";
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
    <SkeletonRegion label={label} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {order.map((type, index) => (
        <div key={type} className="sk-panel animate-skeleton-in flex min-h-[28rem] flex-col gap-3 p-5" style={{ animationDelay: `${index * 80}ms` }}>
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
    </SkeletonRegion>
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

  const language = catalogue?.language.slice(0, 2).toLowerCase() || "en";
  const isRtl = language === "ar" || language === "ur";
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

  return (
    <main lang={language} dir={isRtl ? "rtl" : "ltr"} className="min-h-screen px-4 py-6 text-ink-strong sm:px-8 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <Link href={`/onboarding?step=${encodeURIComponent(resume)}`} className={buttonVariants({ variant: "link", className: "-ms-2 gap-2 px-2" })}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
          {copy.back}
        </Link>

        <header className="sk-enter mt-5 max-w-3xl">
          <p className="sk-eyebrow text-primary">{copy.setup}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{copy.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">{copy.intro}</p>
        </header>

        <section aria-label={copy.sizing} className="sk-panel sk-enter mt-7 p-4 sm:p-6" style={{ "--sk-delay": "60ms" } as CSSProperties}>
          <h2 className="text-base font-bold text-ink-strong">{copy.sizing}</h2>
          <p id="sizing-hint" className="mt-1 text-sm leading-relaxed text-ink-muted">{local.sizingHint}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField name="expectedCampuses" label={copy.campuses}>
              <Input id="expected-campuses" type="number" inputMode="numeric" min={1} max={1000} value={campuses} onChange={(event) => setCampuses(Math.max(1, Number(event.target.value) || 1))} aria-describedby="sizing-hint" className="min-h-11 tabular-nums" />
            </FormField>
            <FormField name="expectedEnrollment" label={copy.enrollment}>
              <Input id="expected-enrollment" type="number" inputMode="numeric" min={0} max={10000000} value={enrollment} onChange={(event) => setEnrollment(Math.max(0, Number(event.target.value) || 0))} aria-describedby="sizing-hint" className="min-h-11 tabular-nums" />
            </FormField>
          </div>
        </section>

        {catalogue && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <p className="min-w-0 text-xs leading-relaxed text-ink-subtle">
              <span>{copy.catalogue}: </span>
              <bdi dir="ltr">{catalogue.commercialTermsVersion}</bdi>
              <span aria-hidden="true" className="mx-2">·</span>
              <span>{copy.regionalCurrency}: </span>
              <bdi dir="ltr">{catalogue.regionalCurrency}</bdi>
            </p>
            <div role="group" aria-label={copy.billingPeriod} className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-edge bg-white p-1 shadow-xs">
              {(["monthly", "annual"] as const).map((choice) => (
                <Button variant="choice" key={choice} type="button" aria-pressed={period === choice} onClick={() => setPeriod(choice)} className="border-transparent bg-transparent">
                  {choice === "monthly" ? copy.monthly : copy.annual}
                  {choice === "annual" && <span className="ms-1 text-xs font-medium text-primary">{copy.annualDiscount} (<span className="tabular-nums">{Math.round(ANNUAL_DISCOUNT * 100)}%</span>)</span>}
                </Button>
              ))}
            </div>
          </div>
        )}

        {message && catalogue && <Alert tone="danger" className="mt-4">{message}</Alert>}
        {message && !catalogue && (
          <ErrorState className="sk-panel mt-6" title={local.loadFailed} description={message} onRetry={retryLoad} retryLabel={local.retry} />
        )}
        {!catalogue && !message && <PackagesSkeleton label={local.loading} />}

        {catalogue && <section aria-label={copy.availablePackages} className="sk-stagger mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {order.map((type) => {
            const plan = catalogue.plans[type];
            const fits = (plan.maxCampuses < 0 || campuses <= plan.maxCampuses) && (plan.maxStudents < 0 || enrollment <= plan.maxStudents);
            const recommendedCurrent = plan.type === catalogue.currentPlan;
            const paidType = type !== "FREE" && type !== "ENTERPRISE";
            const regionalQuote = paidType && catalogue.salesAssisted;
            const unavailablePaid = paidType && !regionalQuote && catalogue.paymentMethods.length === 0;
            return <article key={plan.type} className={`sk-panel flex min-h-[28rem] min-w-0 flex-col p-5 ${recommendedCurrent ? "sk-gradient-border shadow-md" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 text-base font-bold text-ink-strong">{copy.planNames[plan.type] ?? plan.name}</h2>
                {recommendedCurrent && <Badge variant="secondary" size="sm" dot className="shrink-0">{copy.current}</Badge>}
              </div>
              <p className="mt-3 min-h-14 text-lg font-bold tabular-nums text-ink-strong" dir="ltr"><bdi>{priceText(plan)}</bdi></p>
              {type === "FREE" && <p className="text-xs leading-relaxed text-ink-muted">{copy.freeDescription}</p>}
              {type === "ENTERPRISE" && <p className="text-xs leading-relaxed text-ink-muted">{copy.customDescription}</p>}
              <Alert compact live="off" tone={fits ? "success" : "warning"} icon={fits ? Check : Building2} className="mt-4">{fits ? copy.fits : copy.exceeds}</Alert>
              <dl className="mt-4 space-y-2 rounded-xl border border-border-subtle bg-surface-subtle p-3 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-ink-muted">{copy.students}</dt><dd className="font-semibold tabular-nums text-ink-strong" dir="ltr">{plan.maxStudents < 0 ? copy.unlimited : plan.maxStudents.toLocaleString()}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-ink-muted">{copy.teachers}</dt><dd className="font-semibold tabular-nums text-ink-strong" dir="ltr">{plan.maxTeachers < 0 ? copy.unlimited : plan.maxTeachers.toLocaleString()}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-ink-muted">{copy.branches}</dt><dd className="font-semibold tabular-nums text-ink-strong" dir="ltr">{plan.maxCampuses < 0 ? copy.unlimited : plan.maxCampuses.toLocaleString()}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-ink-muted">{copy.aiCredits}</dt><dd className="font-semibold tabular-nums text-ink-strong" dir="ltr">{plan.aiCredits.toLocaleString()}</dd></div>
              </dl>
              <ul className="mt-4 flex-1 space-y-1.5 text-xs leading-5 text-ink-muted">
                {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span lang={copy.featureNames[feature] ? language : "en"} dir="auto">{copy.featureNames[feature] ?? feature}</span></li>)}
              </ul>
              {type === "FREE" ? (
                <Button variant="default" type="button" onClick={() => startChoice(plan)} disabled={!!busy} loading={busy === type} className="mt-5">
                  {busy !== type && <ShieldCheck aria-hidden="true" className="h-4 w-4" />}{copy.continueFree}
                </Button>
              ) : type === "ENTERPRISE" ? (
                <Button variant="outline" type="button" onClick={() => startChoice(plan)} disabled={!!busy} loading={busy === type} className="mt-5">
                  {busy !== type && <Mail aria-hidden="true" className="h-4 w-4" />}{copy.quote}
                </Button>
              ) : regionalQuote ? (
                <Button variant="outline" type="button" onClick={() => requestRegionalQuote(plan)} disabled={!!busy} className="mt-5">
                  <Mail aria-hidden="true" className="h-4 w-4" />{copy.quote}
                </Button>
              ) : (
                <Button variant="default" type="button" onClick={() => startChoice(plan)} disabled={!!busy || unavailablePaid} loading={busy === type} className="mt-5">
                  {unavailablePaid ? copy.checkoutUnavailable : copy.choose}
                </Button>
              )}
              {unavailablePaid && <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{copy.paidUnavailable}</p>}
              {regionalQuote && <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{copy.regionalQuote}</p>}
            </article>;
          })}
        </section>}

        {catalogue && <Alert tone="neutral" live="off" className="mt-5 text-xs">
          {language === "en" ? catalogue.regionalPriceDisclosure : copy.priceDisclosure}
          <span aria-hidden="true" className="mx-2">·</span>
          {copy.approvedTerms}: <bdi dir="ltr">{catalogue.catalogueVersion}</bdi>
        </Alert>}
      </div>
    </main>
  );
}

export default function OnboardingPackagePage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-4 py-6 sm:px-8 sm:py-10"><div className="mx-auto max-w-7xl"><PackagesSkeleton label="Loading packages" /></div></main>}>
      <PackageChoice />
    </Suspense>
  );
}
