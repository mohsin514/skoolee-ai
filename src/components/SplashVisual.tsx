'use client';

import { type CSSProperties } from 'react';
import { AuthGreeting } from '@/components/auth/AuthGreeting';
import { AuthMascot } from '@/components/auth/AuthMascot';
import { InkRule } from '@/components/auth/InkRule';
import type { Language } from '@/lib/locale/package';

/** Framework-owned copy, shared by every splash surface (landing, hard reload, the setLoading overlay). */
export const splashCopy: Record<Language, { eyebrow: string; loading: string; opening: string }> = {
  en: { eyebrow: 'AI school management', loading: 'Loading Skoolee AI', opening: 'Opening sign in' },
  ar: { eyebrow: 'إدارة مدرسية بالذكاء الاصطناعي', loading: 'جارٍ تحميل Skoolee AI', opening: 'جارٍ فتح تسجيل الدخول' },
  ur: { eyebrow: 'اے آئی اسکول مینجمنٹ', loading: 'Skoolee AI لوڈ ہو رہا ہے', opening: 'سائن اِن کھل رہا ہے' },
};

export type SplashVisualProps = {
  language?: Language;
  /** 0..1 — fills the ink stroke. Default 1 (full), for the indeterminate setLoading overlay. */
  progress?: number;
  /** The mascot wake state: 'wake' plays the first-launch wake, 'calm'/'none' arrive awake. */
  entrance?: 'wake' | 'calm' | 'none';
  /** Shut-eyes pre-wake pose (the server frame / hydration on `/`). */
  asleep?: boolean;
  /** Show the travelling light along the ink (hand-over still pending / operation in flight). */
  stalled?: boolean;
  className?: string;
};

/**
 * THE one splash visual. Every loading surface renders exactly this markup; the
 * only things a caller changes are behavioural (progress, wake state, stalled,
 * and its own outer overlay/background). Extracted verbatim from the landing
 * `SplashScreen` so a hard reload and the `setLoading` overlay are pixel-identical
 * to first landing — the live Skoolee mascot wordmark, the ink-rule stroke, the
 * time-aware greeting and the "AI school management" eyebrow, with the same
 * `sk-rise` + `sk-enter` staggered reveal.
 */
export function SplashVisual({
  language = 'en',
  progress = 1,
  entrance = 'wake',
  asleep = false,
  stalled = false,
  className,
}: SplashVisualProps) {
  const t = splashCopy[language] ?? splashCopy.en;
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const delay = (ms: number) => ({ '--sk-delay': `${ms}ms` }) as CSSProperties;

  return (
    <div className={className ? `flex w-full flex-col items-center px-6 pt-6 text-center ${className}` : 'flex w-full flex-col items-center px-6 pt-6 text-center'}>
      {/* The one face: the same wordmark login opens with, awake. */}
      <div className="sk-rise">
        <AuthMascot
          entrance={entrance === 'wake' ? 'wake' : 'none'}
          asleep={asleep}
          size="min(3.5rem, 14vw)"
          rule={false}
          lookDuration={2}
          signals={{ thinking: stalled }}
        />
      </div>

      {/* Login opens with an ink swash under the same wordmark. Here that
          swash writes itself over its own faint guide as the progress bar,
          so the element the eye is resting on carries the loading state. */}
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
          {/* A soft light travels along the ink while the next screen is still on its way.
              It fades out on every side, so it reads only where it crosses the stroke. */}
          {stalled && (
            <span className="sk-shimmer pointer-events-none absolute -inset-y-2 start-0 w-1/2 bg-radial from-white/85 to-transparent to-70% rtl:-scale-x-100 motion-reduce:hidden" />
          )}
        </div>
      </div>

      <div className="sk-enter mt-7" style={delay(160)}>
        <AuthGreeting language={language} className="text-center text-lg font-semibold text-balance text-ink-strong" />
        <p className="sk-eyebrow mt-1.5 text-primary">{t.eyebrow}</p>
      </div>

      {/* The percentage was the only status a screen reader got, and it read
          out on every frame. One announcement, in words. */}
      <span role="status" className="sr-only">
        {pct < 100 ? t.loading : t.opening}
      </span>
    </div>
  );
}
