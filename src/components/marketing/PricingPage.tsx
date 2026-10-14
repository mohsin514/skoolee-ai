"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { COMMERCIAL_CONTRACT } from "@/config/commercial-contract";
import { ANNUAL_DISCOUNT, PLAN_ORDER, PLANS, annualMonthlyPrice, type BillingPeriod } from "@/config/plans";
import { COUNTRIES, currencyForCountry, type Country } from "@/lib/locale/country";
import type { PlanType } from "@/types";

type Language = "en" | "ar" | "ur";
type PricingCopy = {
  title: string; description: string; country: string; language: string; currency: string; priceCurrency: string; featureList: string;
  monthly: string; annual: string; save: string; billedMonthly: string; billedAnnual: string; free: string;
  custom: string; students: string; teachers: string; campuses: string; credits: string; rollover: string;
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
    custom: "Contact for a quote",
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
    custom: "اطلب عرض سعر",
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
    custom: "قیمت کے لیے رابطہ کریں",
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
    <main dir={direction} lang={language} className="min-h-screen bg-[#fff7fe] px-4 py-8 text-[#1f1a23] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-lg font-black text-[#8127cf]">SkooleeAI</Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>Log in</Link>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#8127cf]">{t.version} · {COMMERCIAL_CONTRACT.version}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight sm:text-5xl">{t.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#554c5b]">{t.description}</p>
          </div>
          <div className="grid gap-3 rounded-2xl border border-[#e8dced] bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-1">
            <label className="grid gap-1.5 text-sm font-bold">
              {t.country}
              <Select value={country} onChange={(event) => setCountry(event.target.value as Country)}>
                {COUNTRIES.map((item) => <option key={item} value={item}>{t.countryNames[item]}</option>)}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {t.language}
              <Select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                <option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option>
              </Select>
            </label>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e8dced] bg-white p-4">
          <p className="text-sm font-semibold">{t.currency}: <bdi>{regionalCurrency}</bdi> <span className="mx-2 text-[#9a8ea0]">·</span> {t.priceCurrency}: <bdi>{COMMERCIAL_CONTRACT.currency}</bdi></p>
          <div className="inline-flex rounded-full border border-[#d7c5df] bg-[#fbf0fe] p-1" role="group" aria-label={`${t.monthly} / ${t.annual}`}>
            {(["monthly", "annual"] as const).map((value) => <Button key={value} type="button" variant={period === value ? "default" : "ghost"} aria-pressed={period === value} onClick={() => setPeriod(value)} className="rounded-full">{value === "monthly" ? t.monthly : t.annual}{value === "annual" && <span className="ms-2 text-xs">({t.save} {Math.round(ANNUAL_DISCOUNT * 100)}%)</span>}</Button>)}
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{t.regional} {t.rollover}</p>

        <section aria-label={t.title} className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const monthly = plan.price === null ? null : period === "annual" ? annualMonthlyPrice(plan.price) : plan.price;
            const annualTotal = plan.price === null ? null : Math.round(plan.price * (1 - ANNUAL_DISCOUNT) * 12);
            return (
              <article key={key} className="flex min-w-0 flex-col rounded-2xl border border-[#e3d4e9] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black text-[#8127cf]">{t.planNames[key]}</h2>
                <div className="mt-4 min-h-16">
                  {plan.isCustom ? <p className="text-xl font-black">{t.custom}</p> : plan.price === 0 ? <p className="text-3xl font-black">{t.free}</p> : <><p className="text-3xl font-black"><bdi>{money(monthly!)}</bdi><span className="ms-1 text-sm font-semibold text-[#6a5b71]">/mo</span></p><p className="mt-1 text-xs text-[#6a5b71]">{period === "annual" ? `${t.billedAnnual}: ${money(annualTotal!)}/yr` : t.billedMonthly}</p></>}
                </div>
                <dl className="mt-4 space-y-3 border-y border-[#eee5f1] py-4 text-sm">
                  <div className="flex justify-between gap-3"><dt>{t.students}</dt><dd className="font-bold">{formatLimit(plan.maxStudents)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>{t.teachers}</dt><dd className="font-bold">{formatLimit(plan.maxTeachers)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>{t.campuses}</dt><dd className="font-bold">{formatLimit(plan.maxCampuses)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>{t.credits}</dt><dd className="font-bold">{formatLimit(plan.aiCredits)}</dd></div>
                </dl>
                <p className="mt-4 text-xs leading-5 text-[#63566a]">{t.featureList}</p>
                <div className="mt-auto pt-5">
                  {plan.price === 0 ? <Link href="/register" className={buttonVariants({ className: "w-full text-center" })}>{t.trial}</Link> : <a href={`mailto:${salesEmail}?subject=${encodeURIComponent(`Pricing enquiry — ${plan.name}`)}`} className={buttonVariants({ variant: "outline", className: "w-full text-center" })}>{t.sales}</a>}
                </div>
              </article>
            );
          })}
        </section>

        <p className="mt-6 text-sm leading-6 text-[#63566a]">{t.example}</p>
        <footer className="mt-4 border-t border-[#e8dced] pt-4 text-xs text-[#6a5b71]">{t.version}: <bdi>{COMMERCIAL_CONTRACT.version}</bdi></footer>
      </div>
    </main>
  );
}
