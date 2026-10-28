'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SplashVisual } from '@/components/SplashVisual';
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

/**
 * `pending` is the server render and hydration; `wake` is a first launch with
 * motion allowed (eyes open, cap drops, pupils scan); `calm` is a repeat
 * launch or reduced motion (the face arrives awake).
 */
type Intro = 'pending' | 'wake' | 'calm';

/**
 * The entry beat for `/`, which then hands over to `/login`.
 *
 * Two things used to go wrong at the hand-over, and both showed up as a blink:
 *
 *  1. The overlay removed itself (`setIsVisible(false)`) in the same callback
 *     that started the navigation. `router.replace` is asynchronous — it has to
 *     fetch the RSC payload and the login chunk — so the overlay was gone for
 *     however long that took, exposing the bare page underneath.
 *  2. Nothing warmed `/login` up first, so that fetch only began at the moment
 *     it was needed.
 *
 * Now the route is prefetched the instant this mounts, and the overlay is never
 * hidden by hand. It lets the router's own client-side transition do the swap:
 * with no `loading.tsx` in the tree, React keeps this subtree on screen until
 * `/login` is ready to commit, then exchanges the two in a single paint.
 *
 * The overlay is transparent, so the shared body canvas (lilac glow and dot
 * grid) is the ground of both the splash's last frame and login's first.
 *
 * The visual itself is the shared `SplashVisual` — the same markup the hard-load
 * BootSplash and the setLoading overlay render, so all three are identical.
 *
 * `/` is also left out of history (`replace`, not `push`) so Back from the login
 * screen leaves the app instead of replaying this.
 */
export default function SplashScreen({ language = 'en' }: { language?: Language }) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [intro, setIntro] = useState<Intro>('pending');
  // True while the router is fetching /login. On a fast connection it lasts a
  // few frames and is never shown; on a slow one it is the difference between
  // a loader and a frozen screen.
  const [isPending, startTransition] = useTransition();
  const [slow, setSlow] = useState(false);
  const handingOver = leaving && isPending;
  const stalled = handingOver && slow;

  useEffect(() => {
    router.prefetch('/login');
  }, [router]);

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
    startTransition(() => router.replace('/login'));
  }, [leaving, router, startTransition]);

  useEffect(() => {
    if (!handingOver) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [handingOver]);

  return (
    // Scrolls rather than clips if the column ever outgrows the screen (200% text in a landscape phone).
    <div className="fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto">
      <SplashVisual
        language={language}
        progress={progress}
        entrance={intro === 'wake' ? 'wake' : intro === 'calm' ? 'calm' : 'none'}
        asleep={intro === 'pending'}
        stalled={stalled}
      />
    </div>
  );
}
