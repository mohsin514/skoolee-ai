"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Check, Loader2, Mail, ShieldCheck } from "lucide-react";
import { ANNUAL_DISCOUNT } from "@/config/plans";

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
  bank: { bankName: string; accountTitle: string; accountNumber: string; iban: string | null } | null;
  language: string;
};

const order: Plan["type"][] = ["FREE", "BASIC", "PRO", "ENTERPRISE"];
const rtlWords = {
  title: "اختر الباقة المناسبة لمؤسستك",
  intro: "قارن الحدود والأسعار المعتمدة بناءً على حجم المؤسسة المتوقع.",
  campuses: "عدد الفروع المتوقع",
  enrollment: "عدد الطلاب المتوقع",
  month: "شهري",
  year: "سنوي",
  continueFree: "المتابعة بالباقة المجانية",
  choose: "اختيار هذه الباقة",
  quote: "طلب عرض سعر",
  loading: "جارٍ تحميل الباقات…",
  pending: "جارٍ تأكيد الدفع. تم حفظ إعداد مؤسستك.",
  error: "تعذر بدء الدفع. يمكنك المحاولة مرة أخرى أو المتابعة بالباقة المجانية.",
  terms: "الأسعار بعملة PKR. العملة الإقليمية لا تعني تحويل السعر.",
  fits: "تناسب الحجم المتوقع",
  exceeds: "تتجاوز احتياجاتك حدود هذه الباقة",
} as const;
const urduWords = {
  title: "اپنے ادارے کے لیے پیکیج منتخب کریں",
  intro: "متوقع کیمپس اور طلبہ کی تعداد کے مطابق منظور شدہ پیشکشوں کا موازنہ کریں۔",
  campuses: "متوقع کیمپس",
  enrollment: "متوقع طلبہ کی تعداد",
  month: "ماہانہ",
  year: "سالانہ",
  continueFree: "مفت پیکیج کے ساتھ جاری رکھیں",
  choose: "یہ پیکیج منتخب کریں",
  quote: "کسٹم قیمت کی درخواست",
  loading: "منظور شدہ پیکیجز لوڈ ہو رہے ہیں…",
  pending: "ادائیگی کی تصدیق جاری ہے۔ ادارے کا سیٹ اپ محفوظ ہے۔",
  error: "ادائیگی شروع نہیں ہو سکی۔ دوبارہ کوشش کریں یا مفت پیکیج جاری رکھیں۔",
  terms: "قیمتیں PKR میں ہیں۔ علاقائی کرنسی قیمت کی تبدیلی نہیں ہے۔",
  fits: "متوقع حجم کے لیے موزوں",
  exceeds: "متوقع ضرورت اس پیکیج کی حد سے زیادہ ہے",
} as const;

function PackageChoice() {
  const params = useSearchParams();
  const router = useRouter();
  const returnStep = params.get("returnStep") || "campuses";
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
  const copy = language === "ar" ? rtlWords : language === "ur" ? urduWords : null;
  const resume = useMemo(() => {
    const allowed = ["identity", "campuses", "academic", "review"];
    return allowed.includes(returnStep) ? returnStep : "campuses";
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

  const priceText = (plan: Plan) => {
    if (plan.price == null) return "Custom quote";
    if (plan.price === 0) return "Free";
    const total = period === "annual" ? Math.round(plan.price * (1 - ANNUAL_DISCOUNT) * 12) : plan.price;
    const monthly = period === "annual" ? Math.round(total / 12) : plan.price;
    const money = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(monthly);
    const cycleTotal = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(total);
    return period === "annual" ? `PKR ${money}/mo · PKR ${cycleTotal}/yr` : `PKR ${money}/mo`;
  };

  return (
    <main lang={language} dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-[#fff7fe] px-4 py-6 text-[#1f1a23] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <Link href={`/onboarding?step=${encodeURIComponent(resume)}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#5c5063] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8127cf]">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {isRtl ? "العودة إلى الإعداد المحفوظ" : "Back to saved setup"}
        </Link>

        <header className="mt-5 max-w-3xl">
          <p className="text-xs font-black uppercase tracking-wider text-[#8127cf]">Skoolee · Setup</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{copy?.title ?? "Choose a package for your institution"}</h1>
          <p className="mt-3 text-sm leading-6 text-[#615668]">{copy?.intro ?? "Compare the approved offers against your expected campus and student needs. Your setup draft stays saved while you decide."}</p>
        </header>

        <section aria-label="Institution sizing" className="mt-7 grid gap-4 rounded-2xl border border-[#e6dce9] bg-white p-4 sm:grid-cols-2 sm:p-6">
          <label className="grid gap-2 text-sm font-semibold" htmlFor="expected-campuses">
            {copy?.campuses ?? "Expected campuses"}
            <input id="expected-campuses" type="number" min={1} max={1000} value={campuses} onChange={(event) => setCampuses(Math.max(1, Number(event.target.value) || 1))} className="min-h-11 rounded-xl border border-[#cfc2d6] px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8127cf]" />
          </label>
          <label className="grid gap-2 text-sm font-semibold" htmlFor="expected-enrollment">
            {copy?.enrollment ?? "Expected student enrollment"}
            <input id="expected-enrollment" type="number" min={0} max={10000000} value={enrollment} onChange={(event) => setEnrollment(Math.max(0, Number(event.target.value) || 0))} className="min-h-11 rounded-xl border border-[#cfc2d6] px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8127cf]" />
          </label>
        </section>

        {catalogue && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-[#615668]">
              <span>{isRtl ? "الأسعار:" : "Catalogue:"} </span>
              <bdi dir="ltr">{catalogue.commercialTermsVersion}</bdi>
              <span className="mx-2">·</span>
              <span>{isRtl ? "العملة الإقليمية:" : "Regional display currency:"} </span>
              <bdi dir="ltr">{catalogue.regionalCurrency}</bdi>
            </p>
            <div role="group" aria-label="Billing period" className="inline-flex rounded-full border border-[#cfc2d6] bg-white p-1">
              {(["monthly", "annual"] as const).map((choice) => (
                <button key={choice} type="button" aria-pressed={period === choice} onClick={() => setPeriod(choice)} className={`min-h-10 rounded-full px-4 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8127cf] ${period === choice ? "bg-[#8127cf] text-white" : "text-[#5c5063]"}`}>
                  {choice === "monthly" ? copy?.month ?? "Monthly" : copy?.year ?? "Annual"}
                  {choice === "annual" && <span className="ms-1">{isRtl ? "خصم سنوي" : "annual discount"} ({Math.round(ANNUAL_DISCOUNT * 100)}%)</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {message && <p role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">{message}</p>}
        {!catalogue && !message && <p aria-live="polite" className="mt-8 flex items-center gap-2 text-sm text-[#615668]"><Loader2 className="h-4 w-4 animate-spin" />{copy?.loading ?? "Loading approved packages…"}</p>}

        {catalogue && <section aria-label="Available packages" className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {order.map((type) => {
            const plan = catalogue.plans[type];
            const fits = (plan.maxCampuses < 0 || campuses <= plan.maxCampuses) && (plan.maxStudents < 0 || enrollment <= plan.maxStudents);
            const recommendedCurrent = plan.type === catalogue.currentPlan;
            const unavailablePaid = type !== "FREE" && type !== "ENTERPRISE" && catalogue.paymentMethods.length === 0;
            return <article key={plan.type} className={`flex min-h-[28rem] flex-col rounded-2xl border bg-white p-5 shadow-sm ${recommendedCurrent ? "border-[#8127cf]" : "border-[#e6dce9]"}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-black">{plan.name}</h2>
                {recommendedCurrent && <span className="rounded-full bg-[#f3e9fb] px-2.5 py-1 text-xs font-bold text-[#8127cf]">{isRtl ? "الحالي" : "Current"}</span>}
              </div>
              <p className="mt-3 min-h-14 text-lg font-black" dir="ltr"><bdi>{priceText(plan)}</bdi></p>
              {type === "FREE" && <p className="text-xs leading-5 text-[#615668]">{language === "ar" ? "ابدأ دون بطاقة دفع. هذه باقة مجانية وليست فترة تجريبية محددة المدة." : language === "ur" ? "ادائیگی کارڈ کے بغیر مفت پیکیج شروع کریں۔ کیٹلاگ میں محدود مدت کی آزمائش درج نہیں ہے۔" : "Start without a payment card. This is the free package; no time-limited trial is stated in the catalogue."}</p>}
              {type === "ENTERPRISE" && <p className="text-xs leading-5 text-[#615668]">{isRtl ? "السعر والسعة يحددان بعرض سعر." : "Price and capacity are set by a custom quote."}</p>}
              <p className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-xs font-bold ${fits ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                {fits ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : <Building2 aria-hidden="true" className="h-4 w-4 shrink-0" />}
                {fits ? copy?.fits ?? "Fits the expected size" : copy?.exceeds ?? "Expected size is above this package limit"}
              </p>
              <dl className="mt-4 space-y-2 rounded-xl bg-[#fbf7fc] p-3 text-xs">
                <div className="flex justify-between gap-2"><dt>{isRtl ? "الطلاب" : "Students"}</dt><dd className="font-bold" dir="ltr">{plan.maxStudents < 0 ? "Unlimited" : plan.maxStudents.toLocaleString()}</dd></div>
                <div className="flex justify-between gap-2"><dt>{isRtl ? "المعلمون" : "Teachers"}</dt><dd className="font-bold" dir="ltr">{plan.maxTeachers < 0 ? "Unlimited" : plan.maxTeachers.toLocaleString()}</dd></div>
                <div className="flex justify-between gap-2"><dt>{isRtl ? "الفروع" : "Campuses"}</dt><dd className="font-bold" dir="ltr">{plan.maxCampuses < 0 ? "Unlimited" : plan.maxCampuses.toLocaleString()}</dd></div>
                <div className="flex justify-between gap-2"><dt>{isRtl ? "رصيد الذكاء الاصطناعي شهرياً" : "AI credits / month"}</dt><dd className="font-bold" dir="ltr">{plan.aiCredits.toLocaleString()}</dd></div>
              </dl>
              <ul className="mt-4 flex-1 space-y-1.5 text-xs leading-5 text-[#615668]">
                {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8127cf]" /><span lang="en" dir="auto">{feature}</span></li>)}
              </ul>
              {type === "FREE" ? (
                <button type="button" onClick={() => startChoice(plan)} disabled={!!busy} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8127cf] px-4 text-sm font-bold text-white hover:bg-[#681daf] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8127cf]">
                  {busy === type ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{copy?.continueFree ?? "Continue with free package"}
                </button>
              ) : type === "ENTERPRISE" ? (
                <button type="button" onClick={() => startChoice(plan)} disabled={!!busy} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#8127cf] px-4 text-sm font-bold text-[#8127cf] hover:bg-[#fbf7fc] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8127cf]">
                  <Mail className="h-4 w-4" />{copy?.quote ?? "Request a custom quote"}
                </button>
              ) : (
                <button type="button" onClick={() => startChoice(plan)} disabled={!!busy || unavailablePaid} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8127cf] px-4 text-sm font-bold text-white hover:bg-[#681daf] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8127cf]">
                  {busy === type && <Loader2 className="h-4 w-4 animate-spin" />}{copy?.choose ?? (unavailablePaid ? "Checkout unavailable" : "Choose this package")}
                </button>
              )}
              {unavailablePaid && <p className="mt-2 text-xs text-[#615668]">{isRtl ? "الدفع غير متاح حالياً." : "Paid checkout is not currently available."}</p>}
            </article>;
          })}
        </section>}

        {catalogue && <p className="mt-5 rounded-xl border border-[#e6dce9] bg-white p-4 text-xs leading-5 text-[#615668]">
          {copy?.terms ?? catalogue.regionalPriceDisclosure}
          <span className="mx-2">·</span>
          {isRtl ? "الشروط المعتمدة:" : "Approved terms:"} <bdi dir="ltr">{catalogue.catalogueVersion}</bdi>
        </p>}
      </div>
    </main>
  );
}

export default function OnboardingPackagePage() {
  return <Suspense fallback={<main className="p-8 text-sm">Loading packages…</main>}><PackageChoice /></Suspense>;
}
