"use client";

/**
 * The loading state for every console that renders `RoleShell`.
 *
 * A skeleton earns its keep by being the *same shape* as what replaces it —
 * otherwise the page visibly rebuilds itself the moment data lands, which
 * reads as a bug. These mirror `RoleSidebar`, `RoleHeader` and the command
 * centre deck down to the radii and the grid, so the only thing that changes
 * on arrival is the content.
 *
 * Every dimension here is copied from the real component; if one of those
 * moves, this has to move with it.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SkeletonBar } from "@/components/ui/skeleton";

/**
 * Sidebar rail, header bar and the white content card — the furniture that is
 * identical on every role console. `children` stands in for the page itself.
 */
export function RoleShellSkeleton({
  navRows = 8,
  children,
  label = "Loading dashboard",
  /**
   * The leadership decks sit inside a white card the shell provides; the
   * operations consoles draw their own. Set false so the two do not nest.
   */
  contentCard = true,
}: {
  navRows?: number;
  children?: ReactNode;
  label?: string;
  contentCard?: boolean;
}) {
  return (
    <div
      className="flex min-h-screen bg-[#fbf0fe] font-sans"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <aside className="fixed hidden h-full w-64 shrink-0 flex-col border-r border-[#cfc2d6]/25 bg-white/70 p-6 shadow-[12px_0_40px_rgba(129,39,207,0.05)] backdrop-blur-xl md:flex">
        <div className="mb-5 flex shrink-0 items-center gap-3">
          <SkeletonBar className="h-11 w-11 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonBar className="h-4 w-24 rounded-lg" />
            <SkeletonBar className="h-2 w-20 rounded-full" />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5">
          {Array.from({ length: navRows }).map((_, i) => (
            <SkeletonBar key={i} className="h-11 w-full rounded-2xl" delay={i * 60} />
          ))}
        </div>
      </aside>

      <main className="flex h-screen flex-1 flex-col overflow-hidden p-3 pb-20 md:ml-64 md:p-5 md:pb-5">
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3 rounded-[22px] border border-[#cfc2d6]/25 bg-white/40 px-4 py-2.5 shadow-[0_1px_2px_rgba(31,26,35,0.05),0_8px_28px_-10px_rgba(129,39,207,0.18)] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <SkeletonBar className="h-9 w-9 shrink-0 rounded-xl" />
            <div className="hidden space-y-1.5 sm:block">
              <SkeletonBar className="h-3 w-40 rounded-full" />
              <SkeletonBar className="h-2 w-28 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <SkeletonBar className="hidden h-8 w-36 rounded-full sm:block" />
            <SkeletonBar className="h-9 w-9 rounded-xl" />
            <SkeletonBar className="h-9 w-9 rounded-xl" />
            <SkeletonBar className="h-9 w-32 rounded-full" />
          </div>
        </div>

        {contentCard ? (
          <section className="custom-scrollbar flex-1 overflow-hidden rounded-[32px] bg-white p-4 shadow-[0_2px_8px_rgba(31,26,35,0.06),0_24px_60px_-24px_rgba(31,26,35,0.35)] sm:p-5">
            {children}
          </section>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        )}
      </main>

      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** The dark banner each command centre opens with. */
function HeroSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#1f1a23] via-[#2a2130] to-[#2d2533] p-6 shadow-[0_14px_36px_-10px_rgba(31,26,35,0.45)] sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gradient-to-bl from-[#8127cf]/30 to-transparent blur-[70px]"
      />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <SkeletonBar tone="dark" className="h-2.5 w-40 rounded-full" />
          <SkeletonBar tone="dark" className="mt-2.5 h-8 w-72 max-w-full rounded-xl" />

          <div className="mt-7 grid gap-7 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
            <div className="space-y-3">
              <SkeletonBar tone="dark" className="h-2.5 w-44 rounded-full" />
              <SkeletonBar tone="dark" className="h-14 w-40 rounded-2xl" />
              <SkeletonBar tone="dark" className="h-2.5 w-56 rounded-full" />
            </div>
            <div className="grid gap-4 sm:max-w-sm">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <SkeletonBar tone="dark" className="h-2.5 w-full rounded-full" delay={i * 80} />
                  <SkeletonBar tone="dark" className="h-2 w-full rounded-full" delay={i * 80} />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBar key={i} tone="dark" className="h-9 w-36 rounded-2xl" delay={i * 70} />
            ))}
          </div>
        </div>

        {/* The gauge sits on its own white plate, so this one stays light. */}
        <div className="flex justify-center rounded-[28px] bg-white/95 p-5 lg:justify-end">
          <SkeletonBar className="h-[148px] w-[148px] rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** One stat tile, matching `StatTile`'s padding and radius. */
function TileSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <SkeletonBar className="h-2.5 w-20 rounded-full" delay={delay} />
          <SkeletonBar className="h-7 w-16 rounded-lg" delay={delay} />
          <SkeletonBar className="h-2.5 w-24 rounded-full" delay={delay} />
        </div>
        <SkeletonBar className="h-11 w-11 shrink-0" delay={delay} />
      </div>
    </div>
  );
}

/**
 * One chart card. The plot is drawn as a run of uneven marks rather than a
 * blank rectangle, so the placeholder reads as a chart before the chart
 * exists. The lengths are fixed rather than random: a random length on every
 * render would jitter between paints.
 */
function ChartCardSkeleton({
  className,
  bars = 6,
  orientation = "horizontal",
  delay = 0,
}: {
  className?: string;
  bars?: number;
  orientation?: "horizontal" | "vertical";
  delay?: number;
}) {
  const spread = [0.92, 0.74, 0.86, 0.58, 0.68, 0.44, 0.8, 0.52, 0.36, 0.64, 0.48];

  return (
    <div
      className={cn(
        "flex flex-col rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]",
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SkeletonBar className="h-9 w-9 shrink-0" delay={delay} />
          <div className="min-w-0 space-y-1.5">
            <SkeletonBar className="h-3.5 w-36 rounded-lg" delay={delay} />
            <SkeletonBar className="h-2.5 w-52 max-w-full rounded-full" delay={delay} />
          </div>
        </div>
        <SkeletonBar className="h-8 w-8 shrink-0 rounded-xl" delay={delay} />
      </div>

      {orientation === "horizontal" ? (
        <div className="flex-1 space-y-3 py-1">
          {Array.from({ length: bars }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <SkeletonBar className="h-2.5 w-14 shrink-0 rounded-full" delay={delay + i * 50} />
              <div className="min-w-0 flex-1">
                <div
                  className="skeleton-shimmer h-4 rounded-md bg-[#e8e0ec]/55"
                  style={{ width: `${spread[i % spread.length] * 100}%`, animationDelay: `${delay + i * 50}ms` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-end gap-2.5 py-2" style={{ minHeight: 176 }}>
          {Array.from({ length: bars }).map((_, i) => (
            <div
              key={i}
              className="skeleton-shimmer w-full rounded-md bg-[#e8e0ec]/55"
              style={{ height: `${spread[i % spread.length] * 100}%`, animationDelay: `${delay + i * 50}ms` }}
              aria-hidden="true"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { ChartCardSkeleton, TileSkeleton, HeroSkeleton };

/**
 * The whole command centre deck: hero, tile row, and the chart grid the three
 * leadership consoles share.
 */
export function CommandCentreSkeleton({ tiles = 5 }: { tiles?: number }) {
  return (
    <div className="custom-scrollbar h-full space-y-6 overflow-y-auto">
      <HeroSkeleton />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: tiles }).map((_, i) => (
          <TileSkeleton key={i} delay={i * 80} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCardSkeleton className="xl:col-span-2" bars={7} delay={120} />
        <ChartCardSkeleton bars={5} orientation="vertical" delay={180} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCardSkeleton className="xl:col-span-2" bars={6} orientation="vertical" delay={120} />
        <ChartCardSkeleton bars={4} delay={180} />
      </div>
    </div>
  );
}
