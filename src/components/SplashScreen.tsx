'use client';

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGreeting } from '@/components/auth/AuthGreeting';
import { AuthMascot } from '@/components/auth/AuthMascot';
import { InkRule } from '@/components/auth/InkRule';
import type { Language } from '@/lib/locale/package';

/** The full brand beat: first launch in this tab, motion allowed. */
const HOLD_MS = 3200;
/** Reduced motion: the bar still fills, just sooner. */
const QUICK_HOLD_MS = 1200;
/**
 * How long the hand-over may stay pending before the splash admits it is
 * waiting (thinking face, light along the ink). A normal hand-over is pending
 * for a couple of hundred milliseconds; showing a loader for that would only
 * read as a twitch on the last frame.
 */
const SLOW_MS = 400;

const copy: Record<Language, { eyebrow: string; loading: string; opening: string }> = {
  en: { eyebrow: 'AI school management', loading: 'Loading Skoolee AI', opening: 'Opening sign in' },
  ar: { eyebrow: 'إدارة مدرسية بالذكاء الاصطناعي', loading: 'جارٍ تحميل Skoolee AI', opening: 'جارٍ فتح تسجيل الدخول' },
  ur: { eyebrow: 'اے آئی اسکول مینجمنٹ', loading: 'Skoolee AI لوڈ ہو رہا ہے', opening: 'سائن اِن کھل رہا ہے' },
};

/**
 * `pending` is the server render and hydration; `wake` is a first launch with
 * motion allowed (eyes open, cap drops, pupils scan); `calm` is a repeat
 * launch or reduced motion (the face arrives awake).
 */
type Intro = 'pending' | 'wake' | 'calm';

/**
 * `landing`  — the entry beat for `/`, which hands over to `/login` (default).
 * `hold`     — the same beat with no navigation and no end; the caller unmounts it
 *              (the hard-reload BootSplash wrapper, the setLoading overlay).
 */
export type SplashMode = 'landing' | 'hold';

/**
 * THE one splash. This single component's design is used everywhere a loader
 * shows — first landing on `/`, a hard reload of any screen, and the long
 * client-side `setLoading(true)` overlay — so there is exactly one splash
 * design in the app, not a landing one and look-alikes.
 *
 * The face is the live Skoolee mascot. On a first launch it wakes: lids open
 * from closed through drowsy, the cap drops on, the pupils scan and settle,
 * while the ink stroke under it writes itself as the progress bar. The server
 * frame already shows it asleep (shut eyes, no cap; motion allowed only), so
 * the wordmark is visible from the first paint and the wake continues from
 * exactly that frame instead of open eyes snapping shut at hydration.
 *
 * In `landing` mode (`/`): `/login` is prefetched on mount and the overlay is
 * never hidden by hand — the router's own client-side transition swaps the two
 * in a single paint (no `loading.tsx` in the tree keeps this subtree on screen
 * until `/login` commits). `/` is left out of history (`replace`, not `push`)
 * so Back from login leaves the app instead of replaying this. The caller's
 * overlay is transparent, so the shared body canvas is the ground of both the
 * splash's last frame and login's first.
 *
 * In `hold` mode: the beat plays once, then `onDone` fires (the hard-reload
 * wrapper fades and unmounts). An indeterminate caller (`setLoading`) omits
 * `onDone` and the stroke simply holds full while the operation runs.
 */
export default function SplashScreen({
  language = 'en',
  mode = 'landing',
  onDone,
}: {
  language?: Language;
  mode?: SplashMode;
  onDone?: () => void;
}) {
  const t = copy[language];
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [intro, setIntro] = useState<Intro>('pending');
  // True while the router is fetching /login. On a fast connection it lasts a
  // few frames and is never shown; on a slow one it is the difference between
  // a loader and a frozen screen.
  const [isPending, startTransition] = useTransition();
  const [slow, setSlow] = useState(false);
  const handingOver = mode === 'landing' && leaving && isPending;
  const stalled = handingOver && slow;

  useEffect(() => {
    if (mode === 'landing') router.prefetch('/login');
  }, [router, mode]);

  // One rAF loop drives both the bar and the clock, so the two can't disagree
  // the way a CSS keyframe and a JS timer did.
  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
    const hold = reduced ? QUICK_HOLD_MS : HOLD_MS;
    setIntro(reduced ? 'calm' : 'wake');

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const pct = Math.min(1, (now - start) / hold);
      setProgress(pct);
      if (pct < 1) frame = requestAnimationFrame(tick);
      else setLeaving(true);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    if (mode === 'landing') {
      startTransition(() => router.replace('/login'));
    } else {
      onDone?.();
    }
  }, [leaving, mode, router, startTransition, onDone]);

  useEffect(() => {
    if (!handingOver) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [handingOver]);

  // The progress loop re-renders this component every frame; the face only
  // needs to change when the intro is decided or the hand-over stalls.
  // Until the intro is decided (server frame and hydration) the face sleeps:
  // shut eyes with the lash, no cap, so a first launch wakes from exactly
  // what was painted and the wordmark is on screen from the first paint.
  const face = useMemo(
    () => (
      <AuthMascot
        entrance={intro === 'wake' ? 'wake' : 'none'}
        asleep={intro === 'pending'}
        size="min(3.5rem, 14vw)"
        rule={false}
        lookDuration={2}
        signals={{ thinking: stalled }}
      />
    ),
    [intro, stalled],
  );

  const pct = Math.round(progress * 100);
  // The arrival runs from the server frame; it never restarts at mount.
  const delay = (ms: number) => ({ '--sk-delay': `${ms}ms` }) as CSSProperties;

  return (
    // Scrolls rather than clips if the column ever outgrows the screen (200% text in a landscape phone).
    <div className="flex w-full flex-col items-center px-6 pt-6 text-center">
      {/* The one face: the same wordmark login opens with, awake. */}
      <div className="sk-rise">{face}</div>

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
          {/* A soft light travels along the ink while /login is still on its way.
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
