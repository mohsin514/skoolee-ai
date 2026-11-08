"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CalendarClock,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { DeskPill, DeskRowIcon, deskRow, type DeskTone } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
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

const OWNER_STYLE: Record<ClosureStep["owner"], DeskTone> = {
  Teachers: "warning",
  Office: "brand",
  Principal: "info",
};
/** EN UI keys for the step owner chip (translated through useUiText; AR/UR in p6-messages). */
const OWNER_LABEL: Record<ClosureStep["owner"], string> = { Teachers: "Teachers", Office: "Office", Principal: "Principal" };

export type YearCloseCommand = { id: "close" | "force" | "refresh" | "focus"; nonce: number };
export type YearClosureState = { hasOpenYear: boolean; ready: boolean; canForce: boolean; label: string | null; loading: boolean };

/**
 * Shows exactly why a year can or cannot be closed. Every unfinished item names who has to clear it and
 * links to the screen that clears it, so the gate never feels arbitrary — but only to a screen the viewer can
 * open (`canOpen`; by default Exams & results needs the academic-lead seat, §4.5.11).
 *
 * Closing a ready year is confirmed (R3). Closing with work outstanding is the academic lead's override
 * (`canForceClose`, G35 — the server decides with `canLeadAcademics`): a danger confirmation whose typed reason
 * (`ConfirmAction requireReason`, §4.5.5) is recorded in the audit trail beside the items it overrode.
 *
 * Host-owned header (§4.4b "Academic year": **Close year** primary, Checklist secondary, Force-close in the
 * overflow): `hideActions` drops the in-panel close buttons; the host drives them with `command` (a new nonce runs
 * once) and reads `onState`.
 */
export function YearClosureChecklist({
  campusId,
  year,
  canForceClose = false,
  onNavigate,
  onClosed,
  canOpen,
  hideActions = false,
  command,
  onState,
}: {
  campusId?: string;
  year?: number;
  /** The academic lead (principal, or a campus admin while the campus has no principal). */
  canForceClose?: boolean;
  onNavigate?: (view: string) => void;
  onClosed?: () => void;
  /** Whether a step's screen is open to the viewer; a step whose screen is closed shows no link. */
  canOpen?: (view: string) => boolean;
  hideActions?: boolean;
  command?: YearCloseCommand;
  onState?: (state: YearClosureState) => void;
}) {
  const ui = useUiText();
  const navigationAccess = useNavigationAccess();
  const academicLead = navigationAccess.has("academicLead");
  const opens = (view: string) => Boolean(onNavigate) && (canOpen ? canOpen(view) : view !== "exam-cycles" || academicLead);
  const [data, setData] = useState<ClosureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "force" | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      if (year) params.set("year", String(year));
      const res = await fetch(`/api/academic-cycle/closure?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "");
      setData(json.data);
    } catch {
      // Load failure is an inline error with retry (R4), never a silent blank.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [campusId, year]);

  useEffect(() => {
    void load();
  }, [load]);

  // The host's PageHeader reads the state and drives the actions (each nonce runs once).
  const ready = Boolean(data?.canClose && data.openCycle);
  const stateKey = `${Boolean(data?.openCycle)}:${ready}:${canForceClose}:${data?.openCycle?.label ?? ""}:${loading}`;
  useEffect(() => {
    onState?.({ hasOpenYear: Boolean(data?.openCycle), ready, canForce: canForceClose && Boolean(data?.openCycle) && !ready, label: data?.openCycle?.label ?? null, loading });
    // stateKey captures every input; the callback identity may change on each host render.
  }, [stateKey]);
  const handled = useRef<number | null>(command?.nonce ?? null); // seeded: a remount never replays the last command
  useEffect(() => {
    if (!command || handled.current === command.nonce) return;
    handled.current = command.nonce;
    if (command.id === "refresh") { void load(); return; }
    if (command.id === "focus") {
      root.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      root.current?.focus({ preventScroll: true });
      return;
    }
    if (closing || !data?.openCycle) return;
    if (command.id === "close" && data.canClose) setConfirm("close");
    if (command.id === "force" && !data.canClose && canForceClose) setConfirm("force");
    // Only a new nonce runs a command.
  }, [command?.nonce]);

  const closeYear = async (force: boolean, reason?: string) => {
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
          ...(force ? { force: true, reason: (reason ?? "").trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : ui("Could not close the year"));
      toast.success(ui("{0} is now closed", [data.openCycle.label]));
      setConfirm(null);
      emitCycleChanged();
      await load();
      onClosed?.();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not close the year")));
    } finally {
      setClosing(false);
    }
  };

  if (loading && !data) {
    return <SkeletonList rows={4} label={ui("Loading the year-end checklist")} />;
  }
  if (loadFailed && !data) {
    return <ErrorState title={ui("The year-end checklist could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} />;
  }
  if (!data || !data.openCycle) return null;

  const label = data.openCycle.label;
  const remaining = data.steps.filter((s) => !s.done).length;
  // A year with no exams fails every step for the same reason. Saying it four
  // times is noise, so collapse to one honest explanation.
  const isEmptyYear = data.totals.exams === 0;

  return (
    <div ref={root} tabIndex={-1} className="sk-panel scroll-mt-4 p-5 outline-none sm:p-6" data-year-closure>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              data.canClose ? "bg-status-success-surface text-status-success-text" : "bg-status-warning-surface text-status-warning-text",
            )}
          >
            {data.canClose ? <ShieldCheck className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">{ui("Closing {0}", [label])}</p>
            <h3 className="text-lg font-bold tracking-tight text-ink-strong">
              {ui(data.canClose ? "Ready to close this year" : isEmptyYear ? "This year has not started yet" : "Finish these before closing")}
            </h3>
            <p className="mt-0.5 text-xs font-medium leading-relaxed text-ink-muted">
              {data.canClose
                ? ui("Everything is marked, approved and released. Closing lets you start the next year.")
                : isEmptyYear
                  ? ui("There are no exams in this year yet, so there are no results to finalise.")
                  : ui("{0} of {1} things still need to happen. A new year cannot start until this one is closed.", [remaining, data.steps.length])}
            </p>
          </div>
        </div>
      </div>

      {/* Checklist */}
      {isEmptyYear ? (
        <EmptyState
          size="sm"
          icon={CalendarClock}
          title={ui("Nothing to close here")}
          description={ui("Once exams are created and results released for {0}, this checklist will show what is left before the year can be closed.", [label])}
          primaryAction={onNavigate && opens("exam-cycles") ? { id: "open-exams", label: "Open Exams & results", onClick: () => onNavigate("exam-cycles") } : undefined}
        />
      ) : (
        <>
        <Progress className="mb-4" value={data.steps.length - remaining} max={data.steps.length || 1} tone={data.canClose ? "success" : "warning"} label={ui("{0} of {1} done", [data.steps.length - remaining, data.steps.length])} showValue />
        <ul className="space-y-2">
          {/* Unfinished steps first: the list reads as what is left, then what is done. */}
          {[...data.steps].sort((a, b) => Number(a.done) - Number(b.done)).map((s) => (
            <li
              key={s.id}
              data-tone={s.done ? "success" : "warning"}
              data-step-done={s.done || undefined}
              className={cn(deskRow, "flex flex-wrap items-center justify-between gap-3")}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <DeskRowIcon icon={s.done ? CheckCircle2 : Circle} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-ink-strong">{ui(s.label)}</p>
                    <DeskPill tone={OWNER_STYLE[s.owner]}>{ui(OWNER_LABEL[s.owner])}</DeskPill>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-ink-muted">{ui(s.detail)}</p>
                </div>
              </div>
              {!s.done && onNavigate && opens(s.view) ? (
                <Button variant="outline" size="sm" onClick={() => onNavigate(s.view)} className="shrink-0">
                  {ui("Fix this")}
                  <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        </>
      )}

      {/* Close action (the host's PageHeader owns it when `hideActions`) */}
      {data.canClose ? (
        hideActions ? null : (
          <div className="mt-5 border-t border-border-subtle pt-4">
            <Button variant="default" onClick={() => setConfirm("close")} loading={closing}>
              {closing ? null : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {ui("Close {0} and start the next year", [label])}
            </Button>
          </div>
        )
      ) : (
        <div className="mt-5 space-y-3 border-t border-border-subtle pt-4">
          <Alert tone="warning" live="off" compact>
            {ui("{0} cannot be closed yet, so the next academic year cannot be started.", [label])}{" "}
            {isEmptyYear
              ? canForceClose
                ? ui("Run this year's exams first. If it was created by mistake, use Close anyway.")
                : ui("Run this year's exams first, or ask the academic lead to close it if it was created by mistake.")
              : ui("Clear the items above first.")}
          </Alert>
          {/* The academic lead gets a deliberate override, never a silent one (never painted as primary). */}
          {canForceClose && !hideActions ? (
            <Button variant="outline" onClick={() => setConfirm("force")} className="text-destructive">
              {ui("Close anyway…")}
            </Button>
          ) : null}
        </div>
      )}

      <ConfirmAction
        open={confirm === "close"}
        title={ui("Close {0}?", [label])}
        description={ui("Marks are locked and report cards are frozen as they are, and the next year can start. Teachers and the office are notified. This cannot be undone.")}
        confirmLabel={ui("Close year")}
        cancelLabel={ui("Keep editing")}
        tone="warning"
        busy={closing}
        onCancel={() => setConfirm(null)}
        onConfirm={() => closeYear(false)}
      />
      <ConfirmAction
        open={confirm === "force"}
        title={ui("Close {0} anyway?", [label])}
        description={ui("Marks will be locked and report cards frozen as they are. Anything unfinished stays unfinished. This cannot be undone.")}
        confirmLabel={ui("Close anyway")}
        cancelLabel={ui("Keep editing")}
        tone="danger"
        busy={closing}
        // §4.5.5 / R3: the shared typed-reason pattern — Confirm stays disabled (with the rule shown inline) until
        // the reason is long enough; the reason is kept in the activity log.
        requireReason={{ label: ui("Why are you closing the year with work outstanding?"), minLength: 10, placeholder: ui("At least 10 characters. Your reason is kept in the activity log.") }}
        onCancel={() => setConfirm(null)}
        onConfirm={(reason) => closeYear(true, reason)}
      />
    </div>
  );
}
