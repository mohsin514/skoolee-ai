"use client";

import { SkeletonBar as SkeletonBlock } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useUiText } from "@/components/locale/LocaleProvider";
import { WorkspacePageSkeleton } from "@/components/teacher/teacher-page";
import { StatTile, type DeskTone } from "@/components/ui/desk";
import type { LucideIcon } from "lucide-react";


/** A failed portal load: one inline ErrorState with a retry (R4/R5) — never a toast, never a sign-out. */
export function ParentErrorState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const ui = useUiText();
  return (
    <section className="flex flex-1 flex-col items-center justify-center p-4 sm:p-8">
      <ErrorState
        variant="page"
        title={ui("Couldn't load your portal")}
        description={error ? ui(error) : ui("Your child's details didn't load just now. Please try again in a moment.")}
        onRetry={onRetry}
        retryLabel={ui("Try again")}
      />
    </section>
  );
}

/**
 * The frame every skeleton here sits in: `WorkspacePageSkeleton`, the loading shape of the page itself
 * (PageHeader placeholder, the shared body padding, no card of its own — the shell draws the one page card).
 * Nothing moves when the data lands, and the sidebar stays usable while a screen is loading.
 */
function SkeletonFrame({ children }: { avatar?: boolean; children: React.ReactNode }) {
  const ui = useUiText();
  return <WorkspacePageSkeleton label={ui("Loading the family portal")} documentFlow>{children}</WorkspacePageSkeleton>;
}

/** Matches the compact `ParentStat` the pages actually render. */
function ParentStatSkeleton({ valueWidth = "w-16" }: { valueWidth?: string }) {
  return (
    <div className="sk-panel px-[12px] py-[10px] sm:px-3.5 sm:py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <SkeletonBlock className={`h-5 ${valueWidth}`} />
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-2.5 w-24" />
        </div>
        <SkeletonBlock className="h-9 w-9 shrink-0 rounded-xl" />
      </div>
    </div>
  );
}

export function ParentOverviewSkeleton() {
  return (
    <SkeletonFrame avatar>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <ParentStatSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="sk-panel p-4"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <SkeletonBlock className="h-8 w-8 shrink-0 rounded-xl" />
                <SkeletonBlock className="h-4 w-36" />
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {[...Array(i === 0 ? 1 : 4)].map((_, j) => (
                  <SkeletonBlock key={j} className={i === 0 ? "h-28 w-full rounded-2xl sm:col-span-2" : "h-16 w-full rounded-[18px]"} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}

export function ParentListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <ParentStatSkeleton key={i} valueWidth="w-20" />
          ))}
        </div>
        {[...Array(rows)].map((_, i) => (
          <div
            key={i}
            className="sk-panel space-y-3 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-2.5 w-28" />
                <SkeletonBlock className="h-4 w-44" />
                <SkeletonBlock className="h-5 w-32 rounded-lg" />
              </div>
              <SkeletonBlock className="h-8 w-20 shrink-0 rounded-lg" />
            </div>
            <SkeletonBlock className="h-2 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <SkeletonBlock className="h-2.5 w-14" />
                  <SkeletonBlock className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}


/**
 * The guardian console's one metric tile: the shared `StatTile`, toned by meaning (green good, rose missed,
 * amber waiting). It lived as a private `MiniStat` in three pages; the callers now sit it in `DeskStats`.
 */
const PARENT_TONE = { violet: "brand", green: "success", rose: "danger", amber: "warning" } as const satisfies Record<string, DeskTone>;

export function ParentStat({
  icon,
  label,
  value,
  sub,
  tone = "violet",
  index,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone?: keyof typeof PARENT_TONE;
  index?: number;
}) {
  return <StatTile icon={icon} label={label} value={<bdi>{value}</bdi>} hint={sub} tone={PARENT_TONE[tone]} index={index} />;
}

/**
 * The timetable grid's own skeleton.
 *
 * The page previously showed a single pulsing 40px square while a full
 * week's grid loaded, so the content jumped into place from nothing. This
 * sits inside `ParentPage` rather than replacing it, because the header and
 * section strip are already on screen by the time the grid is fetched.
 */
export function ParentTimetableSkeleton({ weekendDays = [] }: { weekendDays?: number[] }) {
  const dayCount = weekendDays.length ? 6 - weekendDays.filter((d) => d >= 1 && d <= 6).length : 6;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {[...Array(5)].map((_, i) => (
          <SkeletonBlock key={i} className="h-6 w-20 rounded-lg" />
        ))}
      </div>
      <div className="sk-panel p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-16 shrink-0" />
            {[...Array(dayCount)].map((_, j) => (
              <SkeletonBlock key={j} className="h-3 flex-1" />
            ))}
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-16 shrink-0 space-y-1">
                <SkeletonBlock className="h-3 w-6" />
                <SkeletonBlock className="h-2.5 w-10" />
              </div>
              {[...Array(dayCount)].map((_, j) => (
                <SkeletonBlock key={j} className="h-12 flex-1 rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * What a route transition shows before the destination page mounts.
 *
 * `loading.tsx` renders inside the shell, so the sidebar and top bar stay
 * put — but it used to draw a centred spinner where the page card belongs,
 * which read as the portal briefly losing its page. This puts the chrome up
 * immediately and lets the page's own skeleton take over from there.
 */
export function ParentRouteSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <ParentStatSkeleton key={i} />
          ))}
        </div>
        <div className="sk-panel p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <SkeletonBlock className="h-8 w-8 shrink-0 rounded-xl" />
            <SkeletonBlock className="h-4 w-36" />
          </div>
          <div className="space-y-2">
            {[...Array(4)].map((_, j) => (
              <SkeletonBlock key={j} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonFrame>
  );
}
