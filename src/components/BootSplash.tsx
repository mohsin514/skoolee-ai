'use client';

import { startTransition, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SplashVisual } from '@/components/SplashVisual';
import { useDocumentLocale } from '@/hooks/use-document-locale';

/** How long the brand beat holds on a hard load before the page (or its skeleton) shows. */
const HOLD_MS = 3200;
/** Reduced motion: the same beat, shorter, with no wake animation. */
const QUICK_HOLD_MS = 900;
const FADE_MS = 360;

/**
 * The splash for every full page load (refresh, typed URL, new tab) outside `/`.
 *
 * It lives in the root layout, which never remounts on client navigation, so
 * it plays only on hard loads; in-app links go straight to the route's
 * loading.tsx skeleton. It is server rendered, so it covers the first paint,
 * then fades and unmounts, revealing the page or its skeleton underneath.
 *
 * The visual is the shared `SplashVisual` — the exact same markup the landing
 * `SplashScreen` and the `setLoading` overlay render, so a hard reload looks
 * identical to first landing. The only difference is behavioural: this one
 * fades out and unmounts once the hold is done, where the landing splash hands
 * over to `/login`.
 *
 * `/` is skipped because SplashScreen already owns that route. The overlay is
 * aria-hidden and ignores the pointer: assistive tech and the page underneath
 * stay usable while it plays, and it never adds a second "Skoolee AI" image or
 * status to the page.
 */
export default function BootSplash() {
  const pathname = usePathname();
  const { language } = useDocumentLocale();
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

  return (
    <div
      data-boot-splash
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto sk-splash-surface transition-opacity duration-300 ease-out ${phase === 'fading' ? 'opacity-0' : 'opacity-100'}`}
    >
      <SplashVisual
        language={language}
        progress={progress}
        entrance={phase === 'calm' ? 'calm' : 'wake'}
      />
    </div>
  );
}
