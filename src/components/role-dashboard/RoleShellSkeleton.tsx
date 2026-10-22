"use client";

/**
 * The loading state for every console that renders `RoleShell`, and for every framed route.
 *
 * A skeleton earns its keep by being the *same shape* as what replaces it —
 * otherwise the page visibly rebuilds itself the moment data lands, which
 * reads as a bug. These mirror `RoleSidebar`, `RoleHeader`, the shell's one page
 * card (`pageCardSurface`) and `PageHeader` down to the radii and the grid, so
 * the only thing that changes on arrival is the content.
 *
 * Every dimension here is copied from the real component; if one of those
 * moves, this has to move with it.
 *
 * The pieces are exported so a page that loads its own data inside the shell
 * shows the same shapes: `PageHeaderSkeleton` (the PageHeader), `PageSkeleton`
 * (PageHeader + a generic body) and `CommandCentreSkeleton` (a Today view).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SkeletonBar } from "@/components/ui/skeleton";
import { pageCardSurface } from "@/components/ui/page-card";

/**
 * The page card the shell draws around every console view and framed route (one card, no card-in-card), and the
 * padding of its body. RoleShell, RoleFrame and these skeletons share them so the content never shifts on arrival.
 */
export const PAGE_CARD_CLASS = cn(pageCardSurface, "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card p-0 sm:p-0");
export const PAGE_CARD_BODY = "p-4 sm:p-6";

/**
 * Sidebar rail, header bar and the page card — the furniture that is identical
 * on every role console. `children` stands in for the page itself; without
 * children the card shows a PageHeader and a generic body.
 */
export function RoleShellSkeleton({
  navRows = 8,
  children,
  label = "Loading dashboard",
  /**
   * @deprecated The shell draws the one page card for every page (addendum 2026-10-22). `false` is honoured only
   * for skeletons that still draw a card of their own, so the two never nest while those callers move over.
   */
  contentCard = true,
}: {
  navRows?: number;
  children?: ReactNode;
  label?: string;
  contentCard?: boolean;
}) {
  const body = children ?? <PageSkeleton />;
  return (
    <div
      className="sk-app-canvas flex min-h-dvh font-sans"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <SidebarSkeleton rows={navRows} />

      <main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden p-[12px] pb-[calc(5rem+12px)] md:ms-[72px] md:p-5 lg:ms-64 md:pb-5">
        <HeaderSkeleton />
        {contentCard ? (
          <section className={PAGE_CARD_CLASS}>
            <div className={cn("min-h-0 flex-1 overflow-hidden", PAGE_CARD_BODY)}>{body}</div>
          </section>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        )}
      </main>

      <MobileBarSkeleton />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** Fixed (never random) label lengths, so the rail does not jitter between paints. */
const ROW_WIDTHS = ["w-[62%]", "w-[48%]", "w-[70%]", "w-[56%]", "w-[44%]", "w-[66%]", "w-[52%]", "w-[60%]", "w-[40%]", "w-[58%]"];

/** `RoleSidebar`'s desktop rail: institution badge + name, "Find a workspace", the rows and "Collapse" (72 px when folded). */
export function SidebarSkeleton({ rows, collapsed = false }: { rows: number; collapsed?: boolean }) {
  return (
    <aside aria-hidden="true" className={cn("fixed inset-y-0 start-0 z-50 hidden h-full shrink-0 flex-col border-e border-border/50 bg-card p-3 shadow-sm md:flex", collapsed ? "w-[72px]" : "w-[72px] lg:w-64")}>
      <div className="mb-6 flex min-h-11 shrink-0 items-center gap-3 px-1">
        <SkeletonBar className="size-10 shrink-0 rounded-xl" />
        {!collapsed ? (
          <div className="hidden min-w-0 flex-1 space-y-1.5 lg:block">
            <SkeletonBar className="h-4 w-24 rounded-lg" />
            <SkeletonBar className="h-2.5 w-20 rounded-full" />
          </div>
        ) : null}
      </div>
      <SkeletonBar className="mb-3 h-11 w-full rounded-xl" />
      <div className="min-h-0 flex-1 space-y-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3", collapsed ? "justify-center" : "justify-center lg:justify-start")}>
            <SkeletonBar className="size-5 shrink-0 rounded-md" delay={i * 50} />
            {!collapsed ? <SkeletonBar className={cn("hidden h-3 rounded-full lg:block", ROW_WIDTHS[i % ROW_WIDTHS.length])} delay={i * 50} /> : null}
          </div>
        ))}
      </div>
      <SkeletonBar className="mt-3 h-11 w-full rounded-xl" />
    </aside>
  );
}

/** `RoleHeader`: Home tile and console name; scope chip, Help, bell and the account button at the end. */
export function HeaderSkeleton() {
  return (
    <div aria-hidden="true" className="sk-panel mb-4 flex shrink-0 items-center justify-between gap-2 px-[12px] py-[8px] sm:px-4 sm:py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <SkeletonBar className="size-11 shrink-0 rounded-xl sm:size-9" />
        <div className="hidden space-y-1.5 sm:block">
          <SkeletonBar className="h-3 w-32 rounded-full" />
          <SkeletonBar className="h-2.5 w-44 rounded-full" />
        </div>
      </div>
      <div className="flex items-center gap-[6px] sm:gap-2.5">
        <SkeletonBar className="hidden h-8 w-36 rounded-full sm:block" />
        <SkeletonBar className="size-11 rounded-xl" />
        <SkeletonBar className="size-11 rounded-xl" />
        <SkeletonBar className="h-11 w-11 rounded-xl sm:w-32" />
      </div>
    </div>
  );
}

/** The phone bar: the four registry slots and More. */
export function MobileBarSkeleton() {
  return (
    <div aria-hidden="true" className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-border bg-card p-[4px] md:hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-[6px]">
          <SkeletonBar className="size-5 rounded-md" delay={i * 50} />
          <SkeletonBar className="h-2 w-10 rounded-full max-[359px]:hidden" delay={i * 50} />
        </div>
      ))}
    </div>
  );
}

/** `PageHeader`: icon tile, eyebrow, title, one-sentence description and the one primary action (full width on a phone). */
export function PageHeaderSkeleton({ action = true, tabs = false }: { action?: boolean; tabs?: boolean }) {
  return (
    <div aria-hidden="true" className="flex min-w-0 shrink-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <SkeletonBar className="size-10 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-6 w-48 max-w-full rounded-lg sm:h-7 sm:w-64" />
            <SkeletonBar className="h-3.5 w-80 max-w-full rounded-full" />
          </div>
        </div>
        {action ? <SkeletonBar className="order-first h-11 w-full rounded-xl sm:order-none sm:w-36" /> : null}
      </div>
      {tabs ? (
        <div className="flex gap-2 border-b border-border-subtle pb-2">
          {["w-24", "w-20", "w-28"].map((w, i) => <SkeletonBar key={w} className={cn("h-8 rounded-lg", w)} delay={i * 60} />)}
        </div>
      ) : null}
    </div>
  );
}

/** PageHeader and a generic body (a short summary row and one list panel): the default page placeholder. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <TileSkeleton key={i} delay={i * 80} className={i === 2 ? "hidden lg:block" : undefined} />)}
      </div>
      <div aria-hidden="true" className="sk-panel space-y-4 p-4 sm:p-5">
        <SkeletonBar className="h-4 w-40 max-w-full rounded-lg" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonBar className="size-9 shrink-0 rounded-xl" delay={i * 60} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonBar className="h-3 w-1/2 rounded-full" delay={i * 60} />
              <SkeletonBar className="h-2.5 w-1/3 rounded-full" delay={i * 60} />
            </div>
            <SkeletonBar className="hidden h-8 w-20 shrink-0 rounded-lg sm:block" delay={i * 60} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A flagship card on Today (AI Workflows / Exam Studio): a brand-tinted band with a title, a line and its action. */
function FlagshipCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div aria-hidden="true" className="rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <SkeletonBar className="size-11 shrink-0 rounded-2xl" delay={delay} />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-56 max-w-full rounded-lg" delay={delay} />
            <SkeletonBar className="h-3 w-72 max-w-full rounded-full" delay={delay} />
          </div>
        </div>
        <SkeletonBar className="h-11 w-full shrink-0 rounded-xl sm:w-44" delay={delay} />
      </div>
    </div>
  );
}

/** @deprecated Today views no longer open on a dark banner; kept for callers, renders the flagship band. */
function HeroSkeleton() {
  return <FlagshipCardSkeleton />;
}

/** One stat tile, matching `StatTile`'s padding and radius. */
function TileSkeleton({ delay = 0, className }: { delay?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("sk-panel p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <SkeletonBar className="h-2.5 w-20 rounded-full" delay={delay} />
          <SkeletonBar className="h-7 w-16 rounded-lg" delay={delay} />
          <SkeletonBar className="h-2.5 w-24 rounded-full" delay={delay} />
        </div>
        <SkeletonBar className="size-11 shrink-0" delay={delay} />
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
    <div aria-hidden="true" className={cn("sk-panel flex flex-col p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SkeletonBar className="size-9 shrink-0" delay={delay} />
          <div className="min-w-0 space-y-1.5">
            <SkeletonBar className="h-3.5 w-36 rounded-lg" delay={delay} />
            <SkeletonBar className="h-2.5 w-52 max-w-full rounded-full" delay={delay} />
          </div>
        </div>
        <SkeletonBar className="size-8 shrink-0 rounded-xl" delay={delay} />
      </div>

      {orientation === "horizontal" ? (
        <div className="flex-1 space-y-3 py-1">
          {Array.from({ length: bars }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <SkeletonBar className="h-2.5 w-14 shrink-0 rounded-full" delay={delay + i * 50} />
              <div className="min-w-0 flex-1">
                <div
                  className="skeleton-shimmer h-4 rounded-md bg-border-subtle/55"
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
              className="skeleton-shimmer w-full rounded-md bg-border-subtle/55"
              style={{ height: `${spread[i % spread.length] * 100}%`, animationDelay: `${delay + i * 50}ms` }}
              aria-hidden="true"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { ChartCardSkeleton, TileSkeleton, HeroSkeleton, FlagshipCardSkeleton };

/**
 * A Today view: PageHeader, the flagship card, the tile row and two panels — the same order the Today views render
 * (addendum 2026-10-22: the flagship card is the screen's first block for the roles that have one).
 */
export function CommandCentreSkeleton({ tiles = 5 }: { tiles?: number }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FlagshipCardSkeleton delay={60} />

      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: Math.min(tiles, 4) }).map((_, i) => (
          <TileSkeleton key={i} delay={i * 80} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCardSkeleton className="xl:col-span-2" bars={6} delay={120} />
        <ChartCardSkeleton bars={5} orientation="vertical" delay={180} />
      </div>
    </div>
  );
}
