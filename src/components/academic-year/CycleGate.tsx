"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { isInvalidSessionResponse, signOutInvalidSession } from "@/lib/auth/invalid-session";

interface CycleContextValue {
  hasActiveCycle: boolean;
  cycleLabel: string | null;
  cycleStatus: string | null;
  /**
   * Year of the active cycle. Everything a teacher creates (exams, grade
   * config, report cards) must be stamped with this and never with the
   * calendar year — a cycle labelled 2027 routinely starts in August 2026, so
   * `new Date().getFullYear()` files the record under a year the office is no
   * longer looking at.
   */
  academicYear: number | null;
  loading: boolean;
}

const CycleContext = createContext<CycleContextValue>({
  hasActiveCycle: false,
  cycleLabel: null,
  cycleStatus: null,
  academicYear: null,
  loading: true,
});

export function useCycleStatus() {
  return useContext(CycleContext);
}

/**
 * Academic year to stamp on new records. Falls back to the calendar year only
 * while the cycle is still loading.
 */
export function useAcademicYear() {
  const { academicYear } = useContext(CycleContext);
  return academicYear ?? new Date().getFullYear();
}

export function CycleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CycleContextValue>({
    hasActiveCycle: false,
    cycleLabel: null,
    cycleStatus: null,
    academicYear: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/academic-cycle");
        // A dead session must not be dressed up as "no active cycle" — that is
        // the screen users got stuck on, since it reads as an admin problem
        // they can only wait out.
        if (isInvalidSessionResponse(res)) {
          await signOutInvalidSession();
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          const active = json.active;
          setState({
            hasActiveCycle: !!active,
            cycleLabel: active?.label || null,
            cycleStatus: active?.status || (json.data?.[0]?.status || null),
            academicYear: active?.academicYear ?? null,
            loading: false,
          });
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
        toast.error("Failed to load academic cycle");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return <CycleContext.Provider value={state}>{children}</CycleContext.Provider>;
}

export function CycleGate({ children }: { children: ReactNode }) {
  const { hasActiveCycle, loading } = useCycleStatus();

  if (loading) {
    return (
      <div className="space-y-4 py-8 px-4 animate-skeleton-in">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
          <div className="space-y-1.5">
            <div className="h-4 w-40 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
            <div className="h-2.5 w-24 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
          </div>
        </div>
        <div className="h-px bg-[#e8e0ec]/20" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-[#e8e0ec]/20 skeleton-shimmer animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!hasActiveCycle) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-50 text-rose-400 shadow-sm mb-6">
          <Lock className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-black text-[#1d1b20] tracking-tight mb-2">Operations Locked</h2>
        <p className="text-sm font-semibold text-[#4d4354]/60 max-w-md leading-relaxed">
          No academic cycle is currently active. Your admin needs to create and activate a cycle
          before you can take attendance, enter marks, or generate reports.
        </p>
        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-amber-200/50 bg-amber-50 px-5 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-xs font-bold text-amber-700">
            Contact your campus administrator to start the academic cycle.
          </span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
