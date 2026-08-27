"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";
import { ParentSubnav } from "@/components/parent/parent-page";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`relative isolate overflow-hidden rounded-2xl bg-[#e8e0ec]/50 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

export function ParentErrorState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <section className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-50 text-rose-600">
          <AlertCircle className="h-8 w-8" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">Something went wrong</p>
        <h2 className="mt-2 text-2xl font-bold text-[#1d1b20] tracking-tight">Couldn&apos;t load your portal</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-ink-muted">
          {error || "This link may have expired. Please contact the school for a new access link."}
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

/**
 * The frame both guardian skeletons sit in.
 *
 * They used to draw a `rounded-[40px]` card with a 140px gradient header and
 * no section strip, while the page they stand in for is a `rounded-[32px]`
 * card with a 57px header and a strip of five tabs — so every screen visibly
 * rebuilt itself the moment the data landed. This mirrors `ParentPage`, and
 * renders the *real* subnav: it needs no data beyond the portal token, so a
 * guardian can move between screens while one is still loading.
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
      <ParentSubnav />
      <div className="custom-scrollbar flex-1 overflow-y-auto bg-[#fbf0fe]/20 p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Matches the compact `ParentStat` the pages actually render. */
function ParentStatSkeleton({ valueWidth = "w-16" }: { valueWidth?: string }) {
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
              className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]"
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
            className="space-y-3 rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]"
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

export function ParentEmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-[#cfc2d6]/25 bg-[#fbf0fe]/15 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#fbf0fe]">
        <Icon className="h-6 w-6 text-[#8127cf]/40" />
      </div>
      <h3 className="text-sm font-black tracking-tight text-[#1d1b20]">{title}</h3>
      <p className="mt-1 max-w-sm text-xs font-semibold leading-relaxed text-ink-muted">{description}</p>
    </div>
  );
}

/**
 * The guardian console's one metric tile.
 *
 * This lived as a private `MiniStat` in each of the attendance, fees and
 * results pages — three copies that had already drifted apart. One definition
 * means a change lands everywhere, and it matches the compact proportions the
 * rest of the app now uses.
 */
export function ParentStat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "violet",
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "violet" | "green" | "rose" | "amber";
}) {
  const tones = {
    violet: { chip: "bg-[#fbf0fe] text-[#8127cf]", bar: "bg-[#8127cf]" },
    green: { chip: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
    rose: { chip: "bg-rose-50 text-rose-600", bar: "bg-rose-500" },
    amber: { chip: "bg-amber-50 text-amber-600", bar: "bg-amber-500" },
  } as const;
  const t = tones[tone];

  return (
    <div className="group relative overflow-hidden rounded-[18px] border border-[#cfc2d6]/20 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_6px_16px_-10px_rgba(31,26,35,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:shadow-[0_2px_4px_rgba(31,26,35,0.05),0_14px_28px_-14px_rgba(129,39,207,0.4)]">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] opacity-0 transition-opacity group-hover:opacity-60 ${t.bar}`}
      />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-black leading-none tracking-tight tabular-nums text-[#1d1b20] transition-colors group-hover:text-[#8127cf] sm:text-[22px]">
            {value}
          </p>
          <p className="mt-1.5 truncate text-[10px] font-bold uppercase leading-tight tracking-wider text-ink-muted">
            {label}
          </p>
          {sub ? (
            <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-ink-subtle">{sub}</p>
          ) : null}
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${t.chip}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
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
      <div className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
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
        <div className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
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
