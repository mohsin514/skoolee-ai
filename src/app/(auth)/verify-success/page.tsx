'use client'

import React, { useEffect, useState } from 'react';
import { CheckCircle, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import SkooleeLogo from "@/components/SkooleeLogo";
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { useAuthLanguage } from '@/components/locale/AuthLocaleProvider';
import { directionFor } from '@/lib/locale/language-cookie';
import type { Language } from '@/lib/locale/package';

const copy: Record<Language, { imageAlt: string; eyebrow: string; quote: string; brandBody: string; title: string; body: string; continue: string; redirect: string; complete: string }> = {
  en: {
    imageAlt: "Skoolee Verification",
    eyebrow: "Email confirmed",
    quote: "\"Trust is the glue of life. It’s the most essential ingredient in effective communication.\"",
    brandBody: "Sign in with the password you created to continue to your school workspace.",
    title: "Email verified",
    body: "Your email address has been confirmed. Sign in to continue setting up or using your school account.",
    continue: "Continue to Login",
    redirect: "Auto-redirecting in {0}s",
    complete: "Email confirmation complete",
  },
  ar: {
    imageAlt: "تحقق Skoolee",
    eyebrow: "تم تأكيد البريد الإلكتروني",
    quote: "«الثقة هي ما يربط الحياة. إنها أهم عنصر في التواصل الفعّال.»",
    brandBody: "سجّل الدخول بكلمة المرور التي أنشأتها لمتابعة العمل في مساحة مدرستك.",
    title: "تم التحقق من البريد الإلكتروني",
    body: "تم تأكيد عنوان بريدك الإلكتروني. سجّل الدخول لمتابعة إعداد حساب مدرستك أو استخدامه.",
    continue: "المتابعة لتسجيل الدخول",
    redirect: "إعادة التوجيه تلقائياً خلال {0} ث",
    complete: "اكتمل تأكيد البريد الإلكتروني",
  },
  ur: {
    imageAlt: "Skoolee تصدیق",
    eyebrow: "ای میل کی تصدیق ہو گئی",
    quote: "”اعتماد زندگی کو جوڑے رکھتا ہے۔ یہی مؤثر رابطے کا سب سے اہم جزو ہے۔“",
    brandBody: "اپنے اسکول ورک اسپیس میں جانے کے لیے اپنے بنائے ہوئے پاس ورڈ سے سائن اِن کریں۔",
    title: "ای میل کی تصدیق ہو گئی",
    body: "آپ کے ای میل ایڈریس کی تصدیق ہو گئی ہے۔ اپنے اسکول اکاؤنٹ کو سیٹ اپ کرنے یا استعمال کرنے کے لیے سائن اِن کریں۔",
    continue: "سائن اِن پر جائیں",
    redirect: "{0} سیکنڈ میں خودکار طور پر منتقل کیا جا رہا ہے",
    complete: "ای میل کی تصدیق مکمل",
  },
};

export default function VerifySuccessPage() {
  const router = useRouter();
  const { language } = useAuthLanguage();
  const t = copy[language];
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0) {
      router.push('/login');
    }
  }, [countdown, router]);

  return (
    <main lang={language} dir={directionFor(language)} className="grid min-h-dvh w-full grid-cols-1 bg-brand-50 font-sans md:grid-cols-2">

      {/* ─── LEFT SIDE: Visual Narrative ─── */}
      <section className="relative hidden min-h-dvh overflow-hidden md:block">
        <div className="absolute inset-0 bg-emerald-500/10 mix-blend-multiply z-10"></div>
        <Image src="/login.svg" alt={t.imageAlt} fill className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/20 to-transparent z-20"></div>
        <div className="absolute bottom-12 inset-x-8 z-30 max-w-md xl:inset-x-12">
          <div className="bg-white/70 backdrop-blur-[24px] p-8 rounded-xl border border-white/20 shadow-2xl">
            <span className="text-xs font-semibold tracking-normal text-emerald-600 uppercase mb-2 block">{t.eyebrow}</span>
            <h2 className="text-3xl font-extrabold text-ink-strong leading-tight mb-4">{t.quote}</h2>
            <p className="text-ink font-medium text-sm">{t.brandBody}</p>
          </div>
        </div>
      </section>

      {/* ─── RIGHT SIDE: Interaction Canvas ─── */}
      <section className="relative flex min-h-dvh w-full min-w-0 flex-col items-center justify-center bg-[#f6fdf9] p-6 md:p-8">
        <div className="w-full max-w-md">

          <div className="mb-6 flex flex-col items-center sm:mb-10">
            <div className="mb-4">
              <SkooleeLogo size="1.6rem" />
            </div>
            <div className="h-1 w-12 bg-emerald-500 rounded-full"></div>
          </div>

          <div
            className="flex flex-col items-center rounded-[40px] border border-emerald-100 bg-white p-6 text-center shadow-xl sm:p-10"
          >
            <div className="w-20 h-20 bg-emerald-50 rounded-[32px] flex items-center justify-center text-emerald-500 mb-8 shadow-inner">
              <CheckCircle aria-hidden className="w-12 h-12" />
            </div>

            <h1 className="mb-4 text-3xl font-extrabold tracking-normal text-ink-strong">{t.title}</h1>
            <p className="text-sm font-medium text-ink mb-10 leading-relaxed px-2">
              {t.body}
            </p>

            <Link href="/login" className={buttonVariants({ size: "lg", className: "w-full" })}>
              {t.continue} <ArrowRight aria-hidden className="rtl:rotate-180" />
            </Link>

            <div role="status" aria-atomic="true" className="mt-8 flex items-center gap-3 text-ink-subtle font-bold text-xs tracking-normal">
               <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" /> {t.redirect.replace("{0}", String(countdown))}
            </div>
          </div>

          <p className="mt-8 text-center text-xs font-semibold text-ink-subtle uppercase tracking-normal flex items-center justify-center gap-2">
            <ShieldCheck aria-hidden className="w-4 h-4" /> {t.complete}
          </p>
        </div>
      </section>
    </main>
  );
}
