'use client';

import { startTransition, useEffect, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { AuthGreeting } from '@/components/auth/AuthGreeting';
import { AuthMascot } from '@/components/auth/AuthMascot';
import { InkRule } from '@/components/auth/InkRule';
import { useDocumentLocale } from '@/hooks/use-document-locale';
import type { Language } from '@/lib/locale/package';

/** How long the brand beat holds on a hard load before the page (or its skeleton) shows. */
const HOLD_MS = 3200;
/** Reduced motion: the same beat, shorter, with no wake animation. */
const QUICK_HOLD_MS = 900;
const FADE_MS = 360;

/** Same framework-owned copy the landing splash uses. */
const copy: Record<Language, { eyebrow: string; loading: string }> = {
  en: { eyebrow: 'AI school management', loading: 'Loading Skoolee AI' },
  ar: { eyebrow: 'إدارة مدرسية بالذكاء الاصطناعي', loading: 'جارٍ تحميل Skoolee AI' },
  ur: { eyebrow: 'اے آئی اسکول مینجمنٹ', loading: 'Skoolee AI لوڈ ہو رہا ہے' },
};

/**
 * The splash for every full page load (refresh, typed URL, new tab) outside `/`.
 *
 * It lives in the root layout, which never remounts on client navigation, so
 * it plays only on hard loads; in-app links go straight to the route's
 * loading.tsx skeleton. It is server rendered, so it covers the first paint,
 * then fades and unmounts, revealing the page or its skeleton underneath.
 *
 * It mirrors the landing splash (`SplashScreen`) exactly — the live Skoolee
 * mascot wordmark, the ink-rule progress stroke, the time-aware greeting and
 * the "AI school management" eyebrow, with the same `sk-enter` staggered
 * reveal — so a hard reload looks identical to first landing. The only
 * difference is behavioural: this one fades out and unmounts once the hold is
 * done, where the landing splash hands over to `/login`.
 *
 * `/` is skipped because SplashScreen already owns that route. The overlay is
 * aria-hidden and ignores the pointer: assistive tech and the page underneath
 * stay usable while it plays, and it never adds a second "Skoolee AI" image or
 * status to the page.
 */
export default function BootSplash() {
  const pathname = usePathname();
  const { language } = useDocumentLocale();
  const t = copy[language] ?? copy.en;
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'wake' | 'calm' | 'fading' | 'done'>('wake');

  useEffect(() => {
    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduced = false; }
    if (reduced) setPhase('calm');
    const hold = reduced ? QUICK_HOLD_MS : HOLD_MS;
    let frame = 0;
    let fadeTimer = 0;
    const start = performance.now();
    let last = 0;
    const tick = (now: number) => {
      const pct = Math.min(1, (now - start) / hold);
      // ~12 updates a second, at low priority: this sits in the root layout, so
      // per-frame urgent renders would delay the page's own effects underneath.
      if (now - last > 80 || pct === 1) { last = now; startTransition(() => setProgress(pct)); }
      if (pct < 1) { frame = requestAnimationFrame(tick); return; }
      setPhase('fading');
      fadeTimer = window.setTimeout(() => setPhase('done'), reduced ? 0 : FADE_MS);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(fadeTimer); };
  }, []);

  if (pathname === '/' || phase === 'done') return null;

  const pct = Math.round(progress * 100);
  const delay = (ms: number) => ({ '--sk-delay': `${ms}ms` }) as CSSProperties;

  return (
    <div
      data-boot-splash
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto bg-background transition-opacity duration-300 ease-out ${phase === 'fading' ? 'opacity-0' : 'opacity-100'}`}
    >
      {/* pt-6 is the cap's headroom: the cap sits above the wordmark's box, so
          without it the group reads high and a very short screen clips the cap. */}
      <div className="flex w-full flex-col items-center px-6 pt-6 text-center">
        {/* The one face: the same wordmark the landing splash and login use, awake. */}
        <div className="sk-rise">
          <AuthMascot entrance={phase === 'calm' ? 'none' : 'wake'} size="min(3.5rem, 14vw)" rule={false} lookDuration={2} />
        </div>

        <div className="sk-enter" style={delay(90)}>
          <div
            role="progressbar"
            aria-label={t.loading}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="relative mt-4 w-[min(220px,64vw)]"
          >
            <InkRule width="100%" className="absolute inset-x-0 top-0 opacity-15" />
            <InkRule progress={progress} width="100%" className="relative block" />
          </div>
        </div>

        <div className="sk-enter mt-7" style={delay(160)}>
          <AuthGreeting language={language} className="text-center text-lg font-semibold text-balance text-ink-strong" />
          <p className="sk-eyebrow mt-1.5 text-primary">{t.eyebrow}</p>
        </div>
      </div>
    </div>
  );
}
