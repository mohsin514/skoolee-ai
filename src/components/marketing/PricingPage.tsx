"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { COMMERCIAL_CONTRACT } from "@/config/commercial-contract";
import { ANNUAL_DISCOUNT, PLAN_ORDER, PLANS, annualMonthlyPrice, type BillingPeriod } from "@/config/plans";
import { COUNTRIES, currencyForCountry, type Country } from "@/lib/locale/country";
import type { PlanType } from "@/types";

type Language = "en" | "ar" | "ur";
type PricingCopy = {
  title: string; description: string; country: string; language: string; currency: string; priceCurrency: string; featureList: string;
  monthly: string; annual: string; save: string; billedMonthly: string; billedAnnual: string; free: string;
  custom: string; perMonth: string; perYear: string; students: string; teachers: string; campuses: string; credits: string; rollover: string;
  regional: string; trial: string; sales: string; version: string; example: string; unlimited: string;
  countryNames: Record<Country, string>; planNames: Record<PlanType, string>;
};

const copy = {
  en: {
    title: "Plans with clear limits",
    description: "Compare the published plan allowances and billing terms before you create an account.",
    country: "Institution country",
    language: "Language",
    currency: "Default regional currency",
    priceCurrency: "Published catalogue currency",
    monthly: "Monthly",
    annual: "Annual",
    save: "Save",
    billedMonthly: "per month, billed monthly",
    billedAnnual: "per month, billed annually",
    free: "Free",
    custom: "Contact for a quote", perMonth: "/mo", perYear: "/yr",
    featureList: "Plan capabilities are limited to the features available for this plan.",
    students: "Students",
    teachers: "Teacher accounts",
    campuses: "Campuses",
    credits: "AI credits per calendar month",
    rollover: "Unused AI credits expire at the calendar month reset. Credits do not roll over.",
    regional: COMMERCIAL_CONTRACT.regionalPriceDisclosure,
    trial: "Create free account",
    sales: "Ask about this plan",
    version: "Commercial catalogue",
    example: "Illustrative limits and synthetic examples only. No customer quotations or measured savings are claimed here.",
    countryNames: { PK: "Pakistan", SA: "Saudi Arabia", AE: "United Arab Emirates", KW: "Kuwait", OTHER: "Other" },
    planNames: { FREE: "Basic", BASIC: "Pro", PRO: "Enterprise", ENTERPRISE: "Custom" },
    unlimited: "Unlimited",
  },
  ar: {
    title: "خطط بحدود واضحة",
    description: "قارن السعات المنشورة وشروط الفوترة قبل إنشاء حساب.",
    country: "بلد المؤسسة",
    language: "اللغة",
    currency: "العملة الإقليمية الافتراضية",
    priceCurrency: "عملة الأسعار المنشورة",
    monthly: "شهريًا",
    annual: "سنويًا",
    save: "وفّر",
    billedMonthly: "شهريًا، مع فوترة شهرية",
    billedAnnual: "شهريًا، مع فوترة سنوية",
    free: "مجاني",
    custom: "اطلب عرض سعر", perMonth: "/شهر", perYear: "/سنة",
    featureList: "تقتصر إمكانات الخطة على الميزات المتاحة لهذه الخطة.",
    students: "الطلاب",
    teachers: "حسابات المعلمين",
    campuses: "الفروع",
    credits: "أرصدة الذكاء الاصطناعي لكل شهر تقويمي",
    rollover: "تنتهي الأرصدة غير المستخدمة عند إعادة الضبط في نهاية الشهر. لا تُرحّل الأرصدة.",
    regional: "العملة الإقليمية قيمة افتراضية للعرض. تبقى أسعار الكتالوج بالروبية الباكستانية حتى اعتماد سعر إقليمي؛ ولا يعني ذلك تحويلًا للعملة.",
    trial: "إنشاء حساب مجاني",
    sales: "استفسر عن الخطة",
    version: "كتالوج الأسعار",
    example: "الحدود المعروضة معلومات توضيحية. لا توجد هنا اقتباسات عملاء أو وفورات مقاسة.",
    countryNames: { PK: "باكستان", SA: "السعودية", AE: "الإمارات العربية المتحدة", KW: "الكويت", OTHER: "أخرى" },
    planNames: { FREE: "أساسي", BASIC: "احترافي", PRO: "مؤسسي", ENTERPRISE: "مخصص" },
    unlimited: "غير محدود",
  },
  ur: {
    title: "واضح حدود والے پلان",
    description: "اکاؤنٹ بنانے سے پہلے پلان کی گنجائش اور بلنگ کی شرائط دیکھیں۔",
    country: "ادارے کا ملک",
    language: "زبان",
    currency: "علاقے کی طے شدہ کرنسی",
    priceCurrency: "شائع شدہ قیمت کی کرنسی",
    monthly: "ماہانہ",
    annual: "سالانہ",
    save: "بچت",
    billedMonthly: "ماہانہ ادائیگی",
    billedAnnual: "سالانہ ادائیگی، ماہانہ اوسط",
    free: "مفت",
    custom: "قیمت کے لیے رابطہ کریں", perMonth: "/ماہ", perYear: "/سال",
    featureList: "پلان کی سہولتیں اسی پلان میں دستیاب خصوصیات تک محدود ہیں۔",
    students: "طلبہ",
    teachers: "اساتذہ کے اکاؤنٹس",
    campuses: "کیمپس",
    credits: "ہر کیلنڈر ماہ کے AI کریڈٹس",
    rollover: "غیر استعمال شدہ AI کریڈٹس ماہ کے اختتام پر ختم ہو جاتے ہیں۔ کریڈٹس اگلے ماہ منتقل نہیں ہوتے۔",
    regional: "علاقائی کرنسی صرف طے شدہ ڈسپلے ہے۔ منظور شدہ علاقائی قیمت آنے تک قیمتیں PKR میں رہیں گی؛ کوئی کرنسی تبدیلی مراد نہیں۔",
    trial: "مفت اکاؤنٹ بنائیں",
    sales: "اس پلان کے بارے میں پوچھیں",
    version: "قیمتوں کا کیٹلاگ",
    example: "حدود صرف وضاحتی مثالیں ہیں۔ یہاں کوئی گاہک کا اقتباس یا ناپی گئی بچت بیان نہیں کی گئی۔",
    countryNames: { PK: "پاکستان", SA: "سعودی عرب", AE: "متحدہ عرب امارات", KW: "کویت", OTHER: "دیگر" },
    planNames: { FREE: "بنیادی", BASIC: "پرو", PRO: "انٹرپرائز", ENTERPRISE: "حسب ضرورت" },
    unlimited: "لامحدود",
  },
} satisfies Record<Language, PricingCopy>;
const salesEmail = process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@skoolee.ai";

export function PricingPage() {
  const [country, setCountry] = useState<Country>("PK");
  const [language, setLanguage] = useState<Language>("en");
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const t = copy[language];
  const regionalCurrency = currencyForCountry(country);
  const direction = language === "en" ? "ltr" : "rtl";
  const number = (amount: number) => new Intl.NumberFormat(language === "en" ? "en" : `${language}-u-nu-latn`).format(amount);
  const money = (amount: number) => `${COMMERCIAL_CONTRACT.currency} ${number(amount)}`;
  const formatLimit = (value: number) => value < 0 ? t.unlimited : number(value);

  return (
    <main dir={direction} lang={language} className="min-h-screen bg-brand-50 px-4 py-8 text-ink-strong sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-lg font-bold text-primary">SkooleeAI</Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>Log in</Link>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div>
            <p className="sk-eyebrow text-primary">{t.version} · {COMMERCIAL_CONTRACT.version}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-ink-strong sm:text-5xl">{t.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted">{t.description}</p>
          </div>
          <div className="grid gap-3 rounded-2xl border border-border-subtle bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-1">
            <label className="grid gap-1.5 text-sm font-semibold text-ink-strong">
              {t.country}
              <Select value={country} onChange={(event) => setCountry(event.target.value as Country)}>
                {COUNTRIES.map((item) => <option key={item} value={item}>{t.countryNames[item]}</option>)}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-ink-strong">
              {t.language}
              <Select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                <option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option>
              </Select>
            </label>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-white p-4">
          <p className="text-sm font-semibold">{t.currency}: <bdi>{regionalCurrency}</bdi> <span className="mx-2 text-ink-subtle">·</span> {t.priceCurrency}: <bdi>{COMMERCIAL_CONTRACT.currency}</bdi></p>
          <div className="inline-flex rounded-full border border-edge bg-brand-50 p-1" role="group" aria-label={`${t.monthly} / ${t.annual}`}>
            {(["monthly", "annual"] as const).map((value) => <Button key={value} type="button" variant={period === value ? "default" : "ghost"} aria-pressed={period === value} onClick={() => setPeriod(value)} className="rounded-full">{value === "monthly" ? t.monthly : t.annual}{value === "annual" && <span className="ms-2 text-xs">({t.save} {Math.round(ANNUAL_DISCOUNT * 100)}%)</span>}</Button>)}
          </div>
        </div>

        <Alert tone="warning" live="off" className="mt-4">{t.regional} {t.rollover}</Alert>

        <section aria-label={t.title} className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const monthly = plan.price === null ? null : period === "annual" ? annualMonthlyPrice(plan.price) : plan.price;
            const annualTotal = plan.price === null ? null : Math.round(plan.price * (1 - ANNUAL_DISCOUNT) * 12);
            return (
              <article key={key} className="sk-panel sk-hover-lift flex min-w-0 flex-col p-5">
                <h2 className="text-lg font-bold text-primary">{t.planNames[key]}</h2>
                <div className="mt-4 min-h-16">
                  {plan.isCustom ? <p className="text-xl font-bold tracking-tight text-ink-strong">{t.custom}</p> : plan.price === 0 ? <p className="text-3xl font-extrabold tabular-nums tracking-tight text-ink-strong">{t.free}</p> : <><p className="text-3xl font-extrabold tabular-nums tracking-tight text-ink-strong"><bdi>{money(monthly!)}</bdi><span className="ms-1 text-sm font-semibold text-ink-muted">{t.perMonth}</span></p><p className="mt-1 text-xs text-ink-muted">{period === "annual" ? `${t.billedAnnual}: ${money(annualTotal!)}${t.perYear}` : t.billedMonthly}</p></>}
                </div>
                <dl className="mt-4 space-y-3 border-y border-border-subtle py-4 text-sm">
                  <div className="flex justify-between gap-3"><dt>{t.students}</dt><dd className="font-semibold tabular-nums text-ink-strong">{formatLimit(plan.maxStudents)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>{t.teachers}</dt><dd className="font-semibold tabular-nums text-ink-strong">{formatLimit(plan.maxTeachers)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>{t.campuses}</dt><dd className="font-semibold tabular-nums text-ink-strong">{formatLimit(plan.maxCampuses)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>{t.credits}</dt><dd className="font-semibold tabular-nums text-ink-strong">{formatLimit(plan.aiCredits)}</dd></div>
                </dl>
                <p className="mt-4 text-xs leading-5 text-ink-muted">{t.featureList}</p>
                <div className="mt-auto pt-5">
                  {plan.price === 0 ? <Link href="/register" className={buttonVariants({ className: "w-full text-center" })}>{t.trial}</Link> : <a href={`mailto:${salesEmail}?subject=${encodeURIComponent(`Pricing enquiry — ${plan.name}`)}`} className={buttonVariants({ variant: "outline", className: "w-full text-center" })}>{t.sales}</a>}
                </div>
              </article>
            );
          })}
        </section>

        <p className="mt-6 text-sm leading-6 text-ink-muted">{t.example}</p>
        <footer className="mt-4 border-t border-border-subtle pt-4 text-xs text-ink-muted">{t.version}: <bdi>{COMMERCIAL_CONTRACT.version}</bdi></footer>
      </div>
    </main>
  );
}
