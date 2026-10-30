'use client'

import { useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, CirclePause, ShieldCheck } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuthLanguage } from '@/components/locale/AuthLocaleProvider';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthTopBar } from '@/components/auth/AuthTopBar';
import { AuthMascot } from '@/components/auth/AuthMascot';
import { WaxSeal } from '@/components/auth/WaxSeal';
import { CountdownRing } from '@/components/auth/CountdownRing';
import { useCountdown } from '@/components/auth/use-countdown';
import { authCopy } from '@/lib/auth/auth-copy';
import { fillText } from '@/lib/auth/fill-nodes';
import type { Language } from '@/lib/locale/package';

/** Seconds before the page opens sign in on its own (WCAG 2.2.1: "Stay on this page" pauses it). */
const REDIRECT_SECONDS = 5;

type VerifyCopy = {
  eyebrow: string; title: string; body: string; continue: string; redirect: string; complete: string;
  stay: string; paused: string; pausedBody: string;
};

// The eyebrow names what changed (the verify route sets isActive before it
// redirects here), so it never repeats the h1: in ur the old eyebrow and the
// title were the identical string, stacked one above the other.
const copy: Record<Language, VerifyCopy> = {
  en: {
    eyebrow: "Account activated",
    title: "Email verified",
    body: "Your email address has been confirmed. Sign in to continue setting up or using your school account.",
    continue: "Continue to Login",
    redirect: "Auto-redirecting in {0}s",
    complete: "Email confirmation complete",
    stay: "Stay on this page",
    paused: "Redirect paused.",
    pausedBody: "Continue whenever you’re ready.",
  },
  ar: {
    eyebrow: "تم تفعيل الحساب",
    title: "تم التحقق من البريد الإلكتروني",
    body: "تم تأكيد عنوان بريدك الإلكتروني. سجّل الدخول لمتابعة إعداد حساب مدرستك أو استخدامه.",
    continue: "المتابعة لتسجيل الدخول",
    redirect: "إعادة التوجيه تلقائياً خلال {0} ث",
    complete: "اكتمل تأكيد البريد الإلكتروني",
    stay: "البقاء في هذه الصفحة",
    paused: "تم إيقاف إعادة التوجيه.",
    pausedBody: "تابع متى كنت مستعداً.",
  },
  ur: {
    eyebrow: "اکاؤنٹ فعال ہو گیا",
    title: "ای میل کی تصدیق ہو گئی",
    body: "آپ کے ای میل ایڈریس کی تصدیق ہو گئی ہے۔ اپنے اسکول اکاؤنٹ کو سیٹ اپ کرنے یا استعمال کرنے کے لیے سائن اِن کریں۔",
    continue: "سائن اِن پر جائیں",
    redirect: "{0} سیکنڈ میں خودکار طور پر منتقل کیا جا رہا ہے",
    complete: "ای میل کی تصدیق مکمل",
    stay: "اسی صفحے پر رہیں",
    paused: "خودکار منتقلی روک دی گئی۔",
    pausedBody: "جب تیار ہوں، آگے بڑھیں۔",
  },
};

export default function VerifySuccessPage() {
  const router = useRouter();
  const { language, setLanguage } = useAuthLanguage();
  const t = copy[language];
  const ac = authCopy[language];
  const continueRef = useRef<HTMLAnchorElement>(null);
  // One interval, cleared on pause, at zero and on unmount, so an early click
  // on "Continue to Login" never leaves a timer to hijack a later navigation.
  const { remaining, running, pause } = useCountdown(REDIRECT_SECONDS);
  const paused = !running && remaining > 0;

  useEffect(() => {
    if (remaining === 0) router.push('/login');
  }, [remaining, router]);

  const stay = () => {
    pause();
    // The button unmounts with this render; focus lands on the one next step.
    continueRef.current?.focus();
  };

  // Switching language means the visitor is reading this page: hold the
  // redirect so it never fires mid-read (focus stays on the picker).
  const changeLanguage = (next: Language) => {
    pause();
    setLanguage(next);
  };

  // WCAG 2.2.1: five seconds is less than a keyboard or screen-reader user
  // needs to Tab to "Stay on this page" (the third stop). The first Tab is
  // the visitor taking over, so it holds the redirect; Continue to Login is
  // then the next step, one Tab later.
  useEffect(() => {
    if (!running) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Tab') pause(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [running, pause]);

  return (
    <AuthShell
      language={language}
      layout="center"
      topBar={<AuthTopBar languageId="verify-language" label={ac.language} value={language} onChange={changeLanguage} />}
      footer={
        // ink-muted, not ink-subtle: this 12px line sits in the card's lilac
        // shadow halo, where ink-subtle measures 3.6–4.2:1 (below AA).
        <p className="sk-fade-in mt-8 flex items-center justify-center gap-2 text-center text-xs font-medium text-ink-muted" style={{ "--sk-delay": "210ms" } as CSSProperties}>
          <ShieldCheck aria-hidden className="size-4 shrink-0 text-status-success-text" /> {t.complete}
        </p>
      }
    >
      {/* The ONE face. The server renders it idle; after mount it tosses its cap once (the page's single ceremony).
          mt-14, not mt-6: the toss rises ~1.1em above the seated cap, and in RTL the language
          select sits right over the first "o", so a tighter gap flies the cap across the select. */}
      <AuthMascot className="sk-enter mt-14" signals={{ celebrate: true }} />

      <div className="sk-enter-scale sk-panel sk-gradient-border mt-7 flex flex-col items-center p-6 text-center shadow-xl sm:p-9">
        <WaxSeal size={72} finish="wax" state="press" className="mb-4" />
        <p className="sk-eyebrow inline-flex items-center gap-1.5 rounded-full bg-status-success-surface px-3 py-1 text-status-success-text">
          <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />{t.eyebrow}
        </p>
        {/* Static wrapper: the heading's parent carries no transform (pinned). */}
        <div className="mt-5">
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl">{t.title}</h1>
          <p className="mt-3 px-2 text-md leading-relaxed text-ink-muted text-balance">{t.body}{paused ? ` ${t.pausedBody}` : ""}</p>
        </div>

        <Link ref={continueRef} href="/login" className={buttonVariants({ size: "lg", className: "sk-nudge-trigger mt-8 w-full" })}>
          {t.continue}
          <span aria-hidden className="sk-nudge inline-flex">
            <ArrowRight className="size-4 rtl:rotate-180" />
          </span>
        </Link>

        {/* The card's foot: the redirect status and its pause, on a quiet tinted strip. */}
        <div className="-mx-6 -mb-6 mt-8 flex min-h-16 flex-wrap items-center justify-center gap-x-3 gap-y-1 self-stretch rounded-b-[calc(var(--radius-panel)-1px)] border-t border-border-subtle bg-surface-subtle px-4 py-2.5 sm:-mx-9 sm:-mb-9 sm:mt-9 sm:gap-x-4 sm:px-9">
          <div role="status" aria-atomic="true" className="flex items-center gap-2 text-xs font-medium tabular-nums text-ink-muted">
            {paused
              ? <CirclePause aria-hidden className="size-4 shrink-0 text-ink-subtle" />
              : <CountdownRing total={REDIRECT_SECONDS} remaining={remaining} tone="success" />}
            {paused ? t.paused : fillText(t.redirect, remaining)}
          </div>
          {!paused && <Button variant="ghost" size="sm" type="button" className="text-primary" onClick={stay}>{t.stay}</Button>}
        </div>
      </div>
    </AuthShell>
  );
}
