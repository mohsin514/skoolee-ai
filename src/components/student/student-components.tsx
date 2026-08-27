"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";
import { StudentSubnav } from "@/components/student/student-page";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`relative isolate overflow-hidden rounded-2xl bg-[#e8e0ec]/50 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

/**
 * The frame every student skeleton sits in.
 *
 * Each skeleton used to draw its own page shell — a `rounded-[40px]` card
 * with a 140px gradient header and no section strip — while the page it
 * stood in for is a `rounded-[32px]` card with a 57px header and a strip of
 * six tabs. So every screen visibly rebuilt itself the moment data arrived.
 * This mirrors `StudentPage` instead, and renders the *real* subnav: it
 * needs no data, so the student can move between screens while the one
 * behind it is still loading.
 */
function SkeletonFrame({ avatar = false, children }: { avatar?: boolean; children: React.ReactNode }) {
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_2px_8px_rgba(31,26,35,0.06),0_24px_60px_-24px_rgba(31,26,35,0.35)]">
      <header className="relative shrink-0 overflow-hidden border-b border-[#cfc2d6]/12 bg-white">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#8127cf] to-[#9c48ea] opacity-30"
        />
        <div className="relative flex items-center gap-3 px-4 py-3 sm:px-5">
          <SkeletonBlock className={avatar ? "h-10 w-10 shrink-0 rounded-xl" : "h-9 w-9 shrink-0 rounded-xl"} />
          <div className="min-w-0 space-y-1.5">
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="h-2.5 w-60" />
          </div>
        </div>
      </header>
      <StudentSubnav />
      <div className="custom-scrollbar flex-1 overflow-y-auto bg-[#fbf0fe]/20 p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Matches the compact `StatCard` the pages actually render. */
function StatCardSkeleton({ valueWidth = "w-16" }: { valueWidth?: string }) {
  return (
    <div className="rounded-[18px] border border-[#cfc2d6]/20 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_6px_16px_-10px_rgba(31,26,35,0.25)]">
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

export function DashboardSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="bg-gradient-to-br from-[#8127cf]/70 to-[#9c48ea]/60 rounded-[40px] p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="relative flex flex-col lg:flex-row gap-8">
            <div className="flex-1 space-y-6">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-10 w-10 rounded-2xl" />
                <SkeletonBlock className="h-6 w-40" />
              </div>
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-3/4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[...Array(2)].map((_, j) => (
                  <div key={j} className="rounded-2xl bg-white/10 border border-white/15 p-4 space-y-2 backdrop-blur-sm">
                    <SkeletonBlock className="h-3 w-24" />
                    <SkeletonBlock className="h-3 w-full" />
                    <SkeletonBlock className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:w-[360px]">
              <div className="rounded-[28px] bg-white/95 p-5 space-y-4 shadow-xl">
                <SkeletonBlock className="h-5 w-20" />
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="space-y-2">
                    <SkeletonBlock className="h-3 w-32" />
                    <SkeletonBlock className="h-9 w-full rounded-xl" />
                  </div>
                ))}
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
              </div>
            </div>
          </div>
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
                  <div key={i} className="rounded-2xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-4">
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
            <div className="overflow-hidden rounded-[22px] border border-[#cfc2d6]/20 bg-white shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
              <div className="border-b border-[#cfc2d6]/10 px-4 py-3">
                <SkeletonBlock className="h-4 w-28" />
              </div>
              <div className="bg-[#fbf0fe]/30 border-b border-[#cfc2d6]/10 px-4 py-3 flex gap-8">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-3 w-12" />
                <SkeletonBlock className="h-3 w-10" />
                <SkeletonBlock className="h-3 w-14 ml-auto" />
              </div>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="group flex items-center justify-between px-4 py-3 border-b border-[#cfc2d6]/8">
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
            <div key={i} className="overflow-hidden rounded-[22px] border border-[#cfc2d6]/20 bg-white shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
              <div className="bg-gradient-to-br from-[#fbf0fe]/60 via-white to-white p-4 pb-3 border-b border-[#cfc2d6]/8">
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
        <div className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
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
              <div key={i} className="group flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3.5 border border-[#cfc2d6]/8 shadow-sm">
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
        <div className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
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

export function StudentErrorState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-50 text-rose-600">
          <AlertCircle className="h-8 w-8" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">Something went wrong</p>
        <h2 className="mt-2 text-2xl font-bold text-[#1d1b20] tracking-tight">Couldn&apos;t load your portal</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-ink-muted">
          {error || "We couldn't load your student portal. This may be a permission or connectivity issue."}
        </p>
        <div className="mt-6 inline-block">
          <BrandButton variant="dark" icon={<RefreshCw className="w-4 h-4" />} onClick={onRetry}>
            Try Again
          </BrandButton>
        </div>
      </div>
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
        <div className="rounded-[32px] bg-gradient-to-br from-[#8127cf] to-[#9c48ea] p-7 shadow-xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-28 bg-white/15" />
              <SkeletonBlock className="h-10 w-36 bg-white/15" />
              <SkeletonBlock className="h-3 w-44 bg-white/15" />
            </div>
            <SkeletonBlock className="h-20 w-20 rounded-full bg-white/15 shrink-0" />
          </div>
          <SkeletonBlock className="h-2.5 w-full rounded-full bg-white/15 mt-5" />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-5 w-20" />
            <SkeletonBlock className="h-3 w-14" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="relative space-y-3 overflow-hidden rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
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
              className={`rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)] ${i === 0 ? "xl:col-span-2" : ""}`}
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
