"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { emitCycleChanged } from "@/lib/cycleEvents";

interface ClosureStep {
  id: string;
  label: string;
  requirement: string;
  done: boolean;
  outstanding: number;
  detail: string;
  view: string;
  owner: "Teachers" | "Office" | "Principal";
}

interface ClosureData {
  academicYear: number;
  canClose: boolean;
  steps: ClosureStep[];
  blockingReasons: string[];
  totals: { exams: number; studentsWithReportCards: number };
  openCycle: { id: string; label: string; academicYear: number; status: string } | null;
  canStartNextYear: boolean;
  blockedBy: { id: string; label: string; academicYear: number; status: string }[];
}

const OWNER_STYLE: Record<ClosureStep["owner"], string> = {
  Teachers: "bg-amber-50 text-amber-700 border-amber-200",
  Office: "bg-brand-100 text-primary border-primary/20",
  Principal: "bg-teal-50 text-teal-700 border-teal-200",
};

/**
 * Shows an admin exactly why a year can or cannot be closed. Every unfinished
 * item names who has to clear it and links to the screen that clears it, so the
 * gate never feels arbitrary.
 */
export function YearClosureChecklist({
  campusId,
  year,
  canForceClose = false,
  onNavigate,
  onClosed,
}: {
  campusId?: string;
  year?: number;
  /** True for principals — they may close a year with work outstanding. */
  canForceClose?: boolean;
  onNavigate?: (view: string) => void;
  onClosed?: () => void;
}) {
  const [data, setData] = useState<ClosureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      if (year) params.set("year", String(year));
      const res = await fetch(`/api/academic-cycle/closure?${params.toString()}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [campusId, year]);

  useEffect(() => {
    load();
  }, [load]);

  const closeYear = async (force: boolean) => {
    if (!data?.openCycle) return;
    setClosing(true);
    try {
      const res = await fetch("/api/academic-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end",
          cycleId: data.openCycle.id,
          campusId,
          ...(force ? { force: true } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not close the year");
      toast.success(`${data.openCycle.label} is now closed`);
      setConfirmForce(false);
      emitCycleChanged();
      await load();
      onClosed?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not close the year");
    } finally {
      setClosing(false);
    }
  };

  if (loading && !data) {
    return <div className="skeleton-shimmer h-64 w-full rounded-[28px] bg-border-subtle/50" />;
  }
  if (!data || !data.openCycle) return null;

  const remaining = data.steps.filter((s) => !s.done).length;
  // A year with no exams fails every step for the same reason. Saying it four
  // times is noise, so collapse to one honest explanation.
  const isEmptyYear = data.totals.exams === 0;

  return (
    <div className="sk-panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl",
              data.canClose ? "bg-emerald-100 text-emerald-600" : "bg-amber-50 text-amber-600",
            )}
          >
            {data.canClose ? <ShieldCheck className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-primary">
              Closing {data.openCycle.label}
            </p>
            <h3 className="text-lg font-bold tracking-tight text-ink-strong">
              {data.canClose
                ? "Ready to close this year"
                : isEmptyYear
                  ? "This year has not started yet"
                  : "Finish these before closing"}
            </h3>
            <p className="mt-0.5 text-xs font-medium leading-relaxed text-ink-muted">
              {data.canClose
                ? "Everything is marked, approved and released. Closing lets you start the next year."
                : isEmptyYear
                  ? "There are no exams in this year yet, so there are no results to finalise."
                  : `${remaining} of ${data.steps.length} things still need to happen. A new year cannot start until this one is closed.`}
            </p>
          </div>
        </div>
      </div>

      {/* Checklist */}
      {isEmptyYear ? (
        <div className="rounded-2xl border border-edge/25 bg-surface-subtle px-4 py-5 text-center">
          <p className="text-sm font-bold text-ink-strong">Nothing to close here</p>
          <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-ink-muted">
            Once exams are created and results released for {data.openCycle.label}, this checklist
            will show what is left before the year can be closed.
          </p>
          <Button variant="outline"
            onClick={() => onNavigate?.("exam-cycles")}
            className="justify-start mt-3 inline-flex items-center gap-1.5 px-3 py-1.5"
          >
            Go to Exams &amp; Results
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
      <div className="space-y-2">
        {data.steps.map((s) => (
          <div
            key={s.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
              s.done ? "border-emerald-200 bg-emerald-50/50" : "border-edge/25 bg-white",
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-edge" />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-ink-strong">{s.label}</p>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider",
                      OWNER_STYLE[s.owner],
                    )}
                  >
                    {s.owner}
                  </span>
                </div>
                <p className="mt-0.5 text-2xs font-medium text-ink-muted">{s.detail}</p>
              </div>
            </div>
            {!s.done ? (
              <Button variant="outline"
                onClick={() => onNavigate?.(s.view)}
                className="justify-start flex shrink-0 items-center gap-1.5 px-3 py-1.5"
              >
                Fix this
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      )}

      {/* Close action */}
      <div className="mt-5 border-t border-edge/12 pt-4">
        {data.canClose ? (
          <Button variant="default"
            onClick={() => closeYear(false)}
            loading={closing}
            className="justify-start flex items-center gap-2 px-5 py-3"
          >
            {closing ? null : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            Close {data.openCycle.label} & Start Next Year
          </Button>
        ) : (
          <div className="space-y-3">
            <Alert tone="warning" live="off" compact>
              {data.openCycle.label} cannot be closed yet, so the next academic year cannot be
              started.{" "}
              {isEmptyYear
                ? "Run this year's exams first, or ask the principal to close it if it was created by mistake."
                : "Clear the items above first."}
            </Alert>

            {/* Principals get a deliberate override, never a silent one. */}
            {canForceClose ? (
              confirmForce ? (
                <Alert
                  tone="danger"
                  live="off"
                  title={`Close ${data.openCycle.label} anyway?`}
                  actions={
                    <>
                      <Button variant="outline"
                        onClick={() => setConfirmForce(false)}
                        className="px-4 py-2"
                      >
                        Cancel
                      </Button>
                      <Button variant="destructive"
                        onClick={() => closeYear(true)}
                        loading={closing}
                        className="justify-start flex items-center gap-2 px-4 py-2"
                      >
                        Yes, close it anyway
                      </Button>
                    </>
                  }
                >
                  Marks will be locked and report cards frozen as they are. Anything unfinished
                  stays unfinished. This cannot be undone.
                </Alert>
              ) : (
                <Button variant="link"
                  onClick={() => setConfirmForce(true)}
                  className="underline underline-offset-2"
                >
                  Principal override — close anyway
                </Button>
              )
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
