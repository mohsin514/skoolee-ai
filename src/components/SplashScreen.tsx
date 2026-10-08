'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import SkooleeLogo from '@/components/SkooleeLogo';

/** How long the brand beat lasts before we hand over to /login. */
const HOLD_MS = 2200;

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
 * hidden by hand. It stays fully opaque and lets the router's own client-side
 * transition do the swap: with no `loading.tsx` in the tree, React keeps this
 * subtree on screen until `/login` is ready to commit, then exchanges the two in
 * a single paint. The splash's last frame and login's first frame are adjacent,
 * with nothing in between to see.
 *
 * `/` is also left out of history (`replace`, not `push`) so Back from the login
 * screen leaves the app instead of replaying this.
 */
export default function SplashScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  // True while the router is fetching /login. On a fast connection the prefetch
  // has long since landed and this is never seen; on a slow one it is the
  // difference between a loader and a frozen screen.
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    router.prefetch('/login');
  }, [router]);

  // One rAF loop drives both the bar and the clock, so the two can't disagree
  // the way a CSS keyframe and a JS timer did.
  useEffect(() => {
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const pct = Math.min(1, (now - start) / HOLD_MS);
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

  const pct = Math.round(progress * 100);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#fff7fe]">
      {/* Same drifting mesh and 56px rule as the auth brand panel, at a fraction
          of the opacity so it reads as texture on the light ground. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div className="sk-blob absolute -left-[15%] -top-[20%] h-[65%] w-[65%] rounded-full bg-[#9c48ea] opacity-[0.18] blur-[110px]" />
        <div className="sk-blob sk-blob-2 absolute -right-[18%] top-[25%] h-[60%] w-[60%] rounded-full bg-[#b073f0] opacity-[0.14] blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(129,39,207,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(129,39,207,.9) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center px-6">
        {/* The shared mark, not a second hand-rolled copy of it — the login
            screen renders the same component, so the wordmark no longer changes
            shape across the hand-over. 2s is the component's loading cadence. */}
        <div className="sk-rise">
          <SkooleeLogo size="3.25rem" weight="heavy" lookDuration={2} />
        </div>

        {/* Login opens with a 48px gradient rule under the same wordmark. This
            is that rule, used as the progress track, so the element the eye is
            already resting on is the one carrying the loading state. */}
        <div className="sk-rise mt-7" style={{ animationDelay: '90ms' }}>
          <div
            role="progressbar"
            aria-label="Loading Skoolee AI"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="relative h-1.5 w-[200px] overflow-hidden rounded-full bg-[#8127cf]/12"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-[width] duration-100 ease-linear"
              style={{ width: `${Math.max(6, pct)}%` }}
            />
            {isPending && (
              <span className="sk-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
            )}
          </div>
        </div>

        <p
          className="sk-rise mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-[#8127cf]/70"
          style={{ animationDelay: '160ms' }}
        >
          AI school management
        </p>

        {/* The percentage was the only status a screen reader got, and it read
            out on every frame. One announcement, in words. */}
        <span role="status" className="sr-only">
          {pct < 100 ? 'Loading Skoolee AI' : 'Opening sign in'}
        </span>
      </div>
    </div>
  );
}
