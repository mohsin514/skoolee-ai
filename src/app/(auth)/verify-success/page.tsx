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
    <main lang={language} dir={directionFor(language)} className="grid min-h-dvh w-full grid-cols-1 font-sans md:grid-cols-2">

      {/* ─── LEFT SIDE: Visual Narrative ─── */}
      <section className="relative hidden min-h-dvh overflow-hidden md:block">
        <div aria-hidden className="absolute inset-0 z-10 bg-emerald-500/10 mix-blend-multiply"></div>
        <Image src="/login.svg" alt={t.imageAlt} fill className="object-cover" priority />
        <div aria-hidden className="absolute inset-0 z-20 bg-gradient-to-t from-emerald-500/20 to-transparent"></div>
        <div className="absolute bottom-12 inset-x-8 z-30 max-w-md xl:inset-x-12">
          <div className="sk-glass sk-enter rounded-3xl p-8 shadow-2xl">
            <p className="sk-eyebrow mb-3 text-emerald-700">{t.eyebrow}</p>
            <blockquote className="mb-4 text-2xl font-bold leading-snug tracking-tight text-ink-strong text-balance xl:text-3xl">{t.quote}</blockquote>
            <p className="text-sm font-medium leading-relaxed text-ink">{t.brandBody}</p>
          </div>
        </div>
      </section>

      {/* ─── RIGHT SIDE: Interaction Canvas ─── */}
      <section className="relative flex min-h-dvh w-full min-w-0 flex-col items-center justify-center bg-status-success-surface/50 px-4 py-8 sm:p-6 md:p-8">
        <div className="w-full max-w-md">

          <div className="mb-6 flex flex-col items-center sm:mb-10">
            <div className="mb-4">
              <SkooleeLogo size="1.6rem" />
            </div>
            <div aria-hidden className="h-1 w-12 rounded-full bg-emerald-500"></div>
          </div>

          <div
            className="sk-enter-scale sk-panel flex flex-col items-center border-status-success-border/60 p-6 text-center sm:p-10"
          >
            <div aria-hidden className="mb-6 flex size-20 items-center justify-center rounded-[32px] bg-status-success-surface text-emerald-600 shadow-inner ring-1 ring-status-success-border sm:mb-8">
              <CheckCircle className="size-12" />
            </div>

            <h1 className="mb-3 text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl">{t.title}</h1>
            <p className="mb-8 px-2 text-sm leading-relaxed text-ink-muted sm:mb-10">
              {t.body}
            </p>

            <Link href="/login" className={buttonVariants({ size: "lg", className: "sk-nudge-trigger w-full" })}>
              {t.continue}
              <span aria-hidden className="sk-nudge inline-flex">
                <ArrowRight className="size-4 rtl:rotate-180" />
              </span>
            </Link>

            <div role="status" aria-atomic="true" className="mt-6 flex items-center gap-2 text-xs font-medium tabular-nums text-ink-subtle sm:mt-8">
              <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" /> {t.redirect.replace("{0}", String(countdown))}
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs font-medium text-ink-subtle sm:mt-8">
            <ShieldCheck aria-hidden className="size-4 shrink-0 text-emerald-600" /> {t.complete}
          </p>
        </div>
      </section>
    </main>
  );
}
