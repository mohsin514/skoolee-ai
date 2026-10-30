'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import SplashScreen from '@/components/SplashScreen';
import { useDocumentLocale } from '@/hooks/use-document-locale';

const FADE_MS = 360;

/**
 * The hard-load wrapper (refresh, typed URL, new tab) outside `/`.
 *
 * It renders the ONE `SplashScreen` in `hold` mode — the exact same splash
 * design as first landing — then fades and unmounts once the beat is done,
 * revealing the page or its route skeleton underneath. It lives in the root
 * layout, which never remounts on client navigation, so it plays only on hard
 * loads; in-app links go straight to the route's loading.tsx skeleton.
 *
 * `/` is skipped because the entry page already renders SplashScreen there. The
 * overlay is aria-hidden and ignores the pointer: assistive tech and the page
 * underneath stay usable while it plays.
 */
export default function BootSplash() {
  const pathname = usePathname();
  const { language } = useDocumentLocale();
  const [phase, setPhase] = useState<'playing' | 'fading' | 'done'>('playing');

  useEffect(() => {
    if (phase !== 'fading') return;
    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduced = false; }
    const timer = window.setTimeout(() => setPhase('done'), reduced ? 0 : FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (pathname === '/' || phase === 'done') return null;

  return (
    <div
      data-boot-splash
      role="dialog"
      aria-label="Loading Skoolee AI"
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto sk-splash-surface transition-opacity duration-300 ease-out ${phase === 'fading' ? 'opacity-0' : 'opacity-100'}`}
    >
      <SplashScreen language={language} mode="hold" onDone={() => setPhase('fading')} />
    </div>
  );
}
