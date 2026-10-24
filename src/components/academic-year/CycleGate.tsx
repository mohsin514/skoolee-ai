"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { useUiText } from "@/components/locale/LocaleProvider";
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
  /** The cycle could not be read (network or server). Never shown as "no active cycle" (R4). */
  failed?: boolean;
  retry?: () => void;
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
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (attempt > 0) setState((s) => ({ ...s, loading: true, failed: false }));
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
            failed: false,
          });
        }
      } catch {
        // R4: an inline error with retry (CycleGate), never a toast and never "Operations locked".
        if (!cancelled) setState((s) => ({ ...s, loading: false, failed: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  return <CycleContext.Provider value={{ ...state, retry }}>{children}</CycleContext.Provider>;
}

export function CycleGate({ children }: { children: ReactNode }) {
  const { hasActiveCycle, loading, failed, retry } = useCycleStatus();
  const ui = useUiText();

  if (loading) {
    return (
      <div className="space-y-4 py-8 px-4 animate-skeleton-in">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-border-subtle/40 skeleton-shimmer" />
          <div className="space-y-1.5">
            <div className="h-4 w-40 rounded-full bg-border-subtle/50 skeleton-shimmer" />
            <div className="h-2.5 w-24 rounded-full bg-border-subtle/30 skeleton-shimmer" />
          </div>
        </div>
        <div className="h-px bg-border-subtle/20" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-border-subtle/20 skeleton-shimmer animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  if (failed) {
    return <ErrorState title={ui("The academic year could not be checked")} description={ui("Check your connection and try again.")} onRetry={retry} />;
  }

  if (!hasActiveCycle) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
        <div aria-hidden="true" className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-status-error-surface text-status-error-text shadow-sm">
          <Lock className="h-10 w-10" />
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-ink-strong">{ui("No active academic year")}</h2>
        <p className="max-w-md text-sm font-semibold leading-relaxed text-ink-muted">
          {ui("Attendance, marks and reports open once your campus admin creates and activates this year's academic year.")}
        </p>
        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-status-warning-border bg-status-warning-surface px-5 py-3">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-status-warning-text" />
          <span className="text-xs font-bold text-status-warning-text">
            {ui("Contact your campus admin to start the academic year.")}
          </span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
