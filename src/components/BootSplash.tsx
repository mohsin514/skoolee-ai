'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import SplashScreen from '@/components/SplashScreen';
import { useDocumentLocale } from '@/hooks/use-document-locale';

const FADE_MS = 360;
/** How often the held splash looks for a page-level skeleton underneath it. */
const POLL_MS = 120;
/** Never cover the app longer than this, whatever is still loading. */
const MAX_HOLD_MS = 15000;
/** A busy region covering at least this share of the viewport is a whole-page loader. */
const PAGE_COVERAGE = 0.5;

/**
 * Whether the page under the splash is still showing a whole-page loading state
 * (the "Checking workspace access" card, a route's loading.tsx skeleton). Small
 * busy widgets (one panel still fetching) do not count: the page is usable.
 */
export function pageStillLoading(doc: Document = document): boolean {
  const viewport = (doc.defaultView?.innerWidth ?? 0) * (doc.defaultView?.innerHeight ?? 0);
  if (!viewport) return false;
  for (const node of Array.from(doc.querySelectorAll('[aria-busy="true"]'))) {
    if (node.closest('[data-boot-splash]')) continue;
    const box = node.getBoundingClientRect();
    if (box.width * box.height >= viewport * PAGE_COVERAGE) return true;
  }
  return false;
}

/**
 * The hard-load wrapper (refresh, typed URL, new tab) outside `/`.
 *
 * It renders the ONE `SplashScreen` in `hold` mode — the exact same splash
 * design as first landing. Once the brand beat is done it keeps holding while
 * the page underneath is still a whole-page skeleton, then fades and unmounts
 * onto the real page. Before, the splash faded onto the "Checking workspace
 * access" skeleton, so a first load showed two loaders back to back. It is
 * capped at MAX_HOLD_MS so a stuck request never hides the app.
 *
 * It lives in the root layout, which never remounts on client navigation, so it
 * plays only on hard loads; in-app links go straight to the route's loading.tsx
 * skeleton. `/` is skipped because the entry page already renders SplashScreen
 * there. The overlay is aria-hidden and ignores the pointer: assistive tech and
 * the page underneath stay usable while it plays.
 */
type BootPhase = 'playing' | 'waiting' | 'fading' | 'done';

/**
 * Decided once, from the URL the document was loaded at. `/` plays its own
 * splash and then soft-navigates to /login; this wrapper must not wake up on
 * that /login and play the beat a second time, so a load that starts at `/`
 * is finished for good.
 */
export function initialBootPhase(loadedAt: string | null): BootPhase {
  return loadedAt === '/' ? 'done' : 'playing';
}

export default function BootSplash() {
  const pathname = usePathname();
  const { language } = useDocumentLocale();
  const [phase, setPhase] = useState<BootPhase>(() => initialBootPhase(pathname));

  useEffect(() => {
    if (phase !== 'waiting') return;
    const started = performance.now();
    const check = () => {
      if (!pageStillLoading() || performance.now() - started >= MAX_HOLD_MS) setPhase('fading');
    };
    check();
    const timer = window.setInterval(check, POLL_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fading') return;
    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduced = false; }
    const timer = window.setTimeout(() => setPhase('done'), reduced ? 0 : FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      data-boot-splash
      role="dialog"
      aria-label="Loading Skoolee AI"
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto sk-splash-surface transition-opacity duration-300 ease-out ${phase === 'fading' ? 'opacity-0' : 'opacity-100'}`}
    >
      <SplashScreen language={language} mode="hold" onDone={() => setPhase((p) => (p === 'playing' ? 'waiting' : p))} />
    </div>
  );
}
