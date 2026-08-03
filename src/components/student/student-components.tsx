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

export function DashboardSkeleton() {
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
                <SkeletonBlock className="h-3 w-36" />
                <div className="flex gap-3 mt-4">
                  <SkeletonBlock className="h-6 w-20 rounded-lg" />
                  <SkeletonBlock className="h-6 w-16 rounded-lg" />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <SkeletonBlock className="h-11 w-24 rounded-2xl" />
              <SkeletonBlock className="h-11 w-32 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-[28px] bg-white p-6 border border-[#cfc2d6]/10 shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <SkeletonBlock className="h-3 w-20 mb-2" />
                  <SkeletonBlock className="h-8 w-16" />
                </div>
                <SkeletonBlock className="h-12 w-12 rounded-2xl shrink-0" />
              </div>
            </div>
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
    </section>
  );
}

export function CourseworkSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-36" />
          </div>
          <SkeletonBlock className="h-9 w-64 mb-2" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
              </div>
              <SkeletonBlock className="h-7 w-20 mb-1" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
          <div className="xl:col-span-2 space-y-6">
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
            <div className="border border-[#cfc2d6]/10 rounded-[32px] overflow-hidden shadow-sm">
              <div className="border-b border-[#cfc2d6]/10 px-6 py-4">
                <SkeletonBlock className="h-4 w-28" />
              </div>
              <div className="bg-[#fbf0fe]/30 border-b border-[#cfc2d6]/10 px-6 py-3.5 flex gap-8">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-3 w-12" />
                <SkeletonBlock className="h-3 w-10" />
                <SkeletonBlock className="h-3 w-14 ml-auto" />
              </div>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="group flex items-center justify-between px-6 py-3.5 border-b border-[#cfc2d6]/8">
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
    </section>
  );
}

export function ScheduleSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-44" />
          </div>
          <SkeletonBlock className="h-9 w-56 mb-2" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
              </div>
              <SkeletonBlock className="h-7 w-20 mb-1" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-5">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
              <div>
                <SkeletonBlock className="h-3 w-24 mb-1" />
                <SkeletonBlock className="h-5 w-36" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(2)].map((_, j) => (
                <div key={j} className="rounded-2xl bg-[#fbf0fe]/30 p-4 border border-[#cfc2d6]/8 space-y-1.5">
                  <SkeletonBlock className="h-3 w-20" />
                  <SkeletonBlock className="h-4 w-32" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
              <div>
                <SkeletonBlock className="h-3 w-16 mb-1" />
                <SkeletonBlock className="h-5 w-20" />
              </div>
            </div>
            <div className="space-y-3">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="flex justify-between">
                  <SkeletonBlock className="h-3 w-16" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-4">
            <SkeletonBlock className="h-5 w-44" />
            <div className="flex gap-3">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-3 w-14" />
              <SkeletonBlock className="h-3 w-12" />
            </div>
          </div>
          <div className="space-y-5">
            {[...Array(2)].map((_, i) => (
              <div key={i}>
                <SkeletonBlock className="h-3 w-28 mb-2.5 px-1" />
                <div className="space-y-1.5">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="group flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3.5 border border-[#cfc2d6]/8 shadow-sm">
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
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReportsSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-44" />
          </div>
          <SkeletonBlock className="h-9 w-48 mb-2" />
          <SkeletonBlock className="h-4 w-56" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
              </div>
              <SkeletonBlock className="h-7 w-20 mb-1" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-[28px] bg-white border border-[#cfc2d6]/12 shadow-lg overflow-hidden">
              <div className="bg-gradient-to-br from-[#fbf0fe]/60 via-white to-white p-6 pb-4 border-b border-[#cfc2d6]/8">
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
              <div className="p-6 pt-4 space-y-3">
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
    </section>
  );
}

export function AttendanceSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-44" />
          </div>
          <SkeletonBlock className="h-9 w-52 mb-2" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
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
        <div className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg">
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
    </section>
  );
}

export function TimetableSkeleton() {
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
          <SkeletonBlock className="h-4 w-56" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-6">
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-8 w-40 rounded-xl" />
          <SkeletonBlock className="h-8 w-52 rounded-xl" />
        </div>
        <div className="rounded-[28px] border border-[#cfc2d6]/10 bg-white shadow-xl p-4">
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
                {[...Array(6)].map((_, j) => (
                  <SkeletonBlock key={j} className="h-12 flex-1 rounded-xl" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
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
        <p className="mt-2 text-sm font-semibold leading-relaxed text-[#4d4354]/60">
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
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-36" />
          </div>
          <SkeletonBlock className="h-9 w-48 mb-2" />
          <SkeletonBlock className="h-4 w-56" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
              </div>
              <SkeletonBlock className="h-7 w-24 mb-1" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="group relative rounded-[24px] bg-white border border-[#cfc2d6]/12 shadow-lg overflow-hidden p-5 space-y-3">
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
    </section>
  );
}
