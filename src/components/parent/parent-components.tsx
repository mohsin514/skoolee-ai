"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";

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

export function ParentOverviewSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#8127cf]/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative p-7 px-9">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="flex gap-6 items-start">
              <SkeletonBlock className="h-24 w-24 rounded-[32px] shrink-0" />
              <div className="pt-2 space-y-2">
                <SkeletonBlock className="h-9 w-64 mb-3" />
                <SkeletonBlock className="h-4 w-48" />
                <SkeletonBlock className="h-3 w-40" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
              </div>
              <SkeletonBlock className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg space-y-4">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-24 w-full rounded-2xl" />
            <SkeletonBlock className="h-24 w-full rounded-2xl" />
          </div>
          <div className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg space-y-4">
            <SkeletonBlock className="h-5 w-40" />
            <div className="flex items-center gap-3 mb-4">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
              <div className="space-y-1">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-5 w-36" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...Array(2)].map((_, j) => (
                <SkeletonBlock key={j} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ParentListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-40" />
          </div>
          <SkeletonBlock className="h-9 w-52 mb-2" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
              </div>
              <SkeletonBlock className="h-7 w-16 mb-1" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          ))}
        </div>
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="rounded-[24px] bg-white border border-[#cfc2d6]/10 p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <SkeletonBlock className="h-3 w-28" />
                <SkeletonBlock className="h-5 w-44" />
              </div>
              <SkeletonBlock className="h-8 w-16 rounded-lg shrink-0" />
            </div>
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ParentEmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-[32px] bg-[#fbf0fe]/20 border border-dashed border-[#cfc2d6]/20">
      <div className="h-14 w-14 rounded-[24px] bg-[#fbf0fe] flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#8127cf]/40" />
      </div>
      <h3 className="text-base font-bold text-[#1d1b20]">{title}</h3>
      <p className="mt-1 text-xs font-semibold text-ink-muted max-w-xs">{description}</p>
    </div>
  );
}
