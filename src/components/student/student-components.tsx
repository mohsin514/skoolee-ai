"use client";

import { SkeletonBar as SkeletonBlock } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useUiText } from "@/components/locale/LocaleProvider";
import { WorkspacePageSkeleton } from "@/components/teacher/teacher-page";


/**
 * The frame every skeleton here sits in: `WorkspacePageSkeleton`, the loading shape of the page itself
 * (PageHeader placeholder, the shared body padding, no card of its own — the shell draws the one page card).
 * Nothing moves when the data lands, and the sidebar stays usable while a screen is loading.
 */
function SkeletonFrame({ children, action = false }: { avatar?: boolean; action?: boolean; children: React.ReactNode }) {
  const ui = useUiText();
  return <WorkspacePageSkeleton label={ui("Loading your learner portal")} documentFlow action={action}>{children}</WorkspacePageSkeleton>;
}

/** Matches the compact `StatCard` the pages actually render. */
function StatCardSkeleton({ valueWidth = "w-16" }: { valueWidth?: string }) {
  return (
    <div className="sk-panel px-3.5 py-2.5">
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

/** Today is StudentToday alone: a next-action card, then lessons and work side by side. */
export function DashboardSkeleton() {
  return (
    <SkeletonFrame action>
      <div className="sk-panel space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock className="h-5 w-28" />
          <SkeletonBlock className="h-9 w-48 rounded-xl" />
        </div>
        <SkeletonBlock className="h-28 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <SkeletonBlock className="h-4 w-24" />
              {[0, 1, 2].map((j) => <SkeletonBlock key={j} className="h-9 w-full rounded-lg" />)}
            </div>
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}

export function CourseworkSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} valueWidth="w-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
          <div className="xl:col-span-2 space-y-3">
            <div>
              <SkeletonBlock className="h-5 w-48 mb-4" />
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-2xl bg-brand-50/40 border border-edge/10 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <SkeletonBlock className="h-4 w-32" />
                        <SkeletonBlock className="h-3 w-24" />
                      </div>
                      <div className="flex items-center gap-3">
                        <SkeletonBlock className="h-4 w-10" />
                        <SkeletonBlock className="h-6 w-20 rounded-full shrink-0" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <SkeletonBlock className="h-5 w-48 mb-4" />
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i}>
                    <div className="flex justify-between mb-1.5">
                      <SkeletonBlock className="h-3 w-24" />
                      <SkeletonBlock className="h-3 w-10" />
                    </div>
                    <SkeletonBlock className="h-3 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="xl:col-span-3">
            <div className="sk-panel overflow-hidden">
              <div className="border-b border-edge/10 px-4 py-3">
                <SkeletonBlock className="h-4 w-28" />
              </div>
              <div className="bg-brand-50/30 border-b border-edge/10 px-4 py-3 flex gap-8">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-3 w-12" />
                <SkeletonBlock className="h-3 w-10" />
                <SkeletonBlock className="h-3 w-14 ms-auto" />
              </div>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="group flex items-center justify-between px-4 py-3 border-b border-edge/8">
                  <div className="space-y-1 flex-1">
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="h-3 w-20" />
                  </div>
                  <SkeletonBlock className="h-4 w-12 mx-3" />
                  <SkeletonBlock className="h-5 w-12 rounded-lg mx-3" />
                  <SkeletonBlock className="h-5 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonFrame>
  );
}

export function ReportsSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} valueWidth="w-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="sk-panel overflow-hidden">
              <div className="bg-gradient-to-br from-brand-50/60 via-card to-card p-4 pb-3 border-b border-edge/8">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    <SkeletonBlock className="h-3 w-20" />
                    <SkeletonBlock className="h-5 w-36" />
                    <div className="flex items-center gap-2.5 mt-2.5">
                      <SkeletonBlock className="h-5 w-20 rounded-full" />
                      <SkeletonBlock className="h-3 w-14" />
                    </div>
                  </div>
                  <SkeletonBlock className="h-16 w-16 rounded-full shrink-0" />
                </div>
              </div>
              <div className="space-y-3 p-4 pt-3">
                <div className="flex items-center gap-2">
                  <SkeletonBlock className="h-3 w-24" />
                  <SkeletonBlock className="h-3 w-[1px]" />
                  <SkeletonBlock className="h-3 w-20" />
                </div>
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-3/4" />
                <SkeletonBlock className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}

export function AttendanceSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} valueWidth="w-16" />
          ))}
        </div>
        <div className="sk-panel p-4">
          <div className="flex items-center justify-between mb-5">
            <SkeletonBlock className="h-5 w-40" />
            <div className="flex gap-3">
              <SkeletonBlock className="h-8 w-8 rounded-xl" />
              <SkeletonBlock className="h-8 w-32 rounded-xl" />
              <SkeletonBlock className="h-8 w-8 rounded-xl" />
            </div>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <SkeletonBlock className="h-7 w-24 rounded-xl" />
            <SkeletonBlock className="h-3 w-28" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {[...Array(7)].map((_, i) => (
              <SkeletonBlock key={i} className="h-3 w-full mb-1" />
            ))}
            {[...Array(35)].map((_, i) => (
              <SkeletonBlock key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-4">
            <SkeletonBlock className="h-5 w-40" />
            <div className="flex gap-3">
              <SkeletonBlock className="h-3 w-14" />
              <SkeletonBlock className="h-3 w-12" />
            </div>
          </div>
          <div className="space-y-1.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="group flex items-center justify-between gap-3 rounded-2xl bg-card px-5 py-3.5 border border-edge/8 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center w-10 space-y-0.5">
                    <SkeletonBlock className="h-2.5 w-8" />
                    <SkeletonBlock className="h-4 w-6" />
                  </div>
                  <SkeletonBlock className="h-8 w-[1px]" />
                  <div className="space-y-0.5">
                    <SkeletonBlock className="h-3 w-28" />
                    <SkeletonBlock className="h-2.5 w-20" />
                  </div>
                </div>
                <SkeletonBlock className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonFrame>
  );
}

export function TimetableSkeleton({ weekendDays = [] }: { weekendDays?: number[] }) {
  const dayCount = weekendDays.length ? 6 - weekendDays.filter((d) => d >= 1 && d <= 6).length : 6;
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-8 w-40 rounded-xl" />
          <SkeletonBlock className="h-8 w-52 rounded-xl" />
        </div>
        <div className="sk-panel p-4">
          <div className="space-y-3">
            <div className="flex flex-col items-center justify-center py-2.5">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-3 w-16 mt-1" />
            </div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex flex-col items-center justify-center w-16 space-y-1">
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
    </SkeletonFrame>
  );
}

/** A failed portal load: one inline ErrorState with a retry (R4/R5). */
export function StudentErrorState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const ui = useUiText();
  return (
    <section className="flex flex-1 flex-col items-center justify-center p-4 sm:p-8">
      <ErrorState
        variant="page"
        title={ui("Couldn't load your portal")}
        description={error ? ui(error) : ui("We couldn't load your learner portal. Check your connection and try again.")}
        onRetry={onRetry}
        retryLabel={ui("Try again")}
      />
    </section>
  );
}

export function FeesSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} valueWidth="w-24" />
          ))}
        </div>
        <div className="sk-panel space-y-3 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="h-8 w-36 rounded-lg" />
              <SkeletonBlock className="h-3 w-44" />
            </div>
            <SkeletonBlock className="size-16 shrink-0 rounded-full" />
          </div>
          <SkeletonBlock className="h-2.5 w-full rounded-full" />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-5 w-20" />
            <SkeletonBlock className="h-3 w-14" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="sk-panel relative space-y-3 overflow-hidden p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="h-3 w-20" />
                  </div>
                  <SkeletonBlock className="h-10 w-10 rounded-xl shrink-0" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <SkeletonBlock className="h-7 w-20" />
                  <SkeletonBlock className="h-3 w-16" />
                </div>
                <SkeletonBlock className="h-2 w-full rounded-full" />
                <div className="flex items-center justify-between">
                  <SkeletonBlock className="h-5 w-14 rounded-full" />
                  <SkeletonBlock className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonFrame>
  );
}

/**
 * What a route transition shows before the destination page mounts.
 *
 * `loading.tsx` renders inside the shell, so the sidebar and top bar stay
 * put — but it used to draw a centred spinner where the page card belongs,
 * which read as the console briefly losing its page. This puts the chrome up
 * immediately (header, section strip) and lets the page's own skeleton take
 * over from there, so nothing between click and content changes shape.
 */
export function StudentRouteSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className={`sk-panel p-4 ${i === 0 ? "xl:col-span-2" : ""}`}
            >
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
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}
