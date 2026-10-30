"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, CalendarRange, CheckCircle2, Clock,
  CopyPlus, Pause, Play, Plus, XCircle,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { emitCycleChanged } from "@/lib/cycleEvents";
import { YearClosureChecklist, type YearCloseCommand, type YearClosureState } from "@/components/academic/YearClosureChecklist";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";


interface Cycle {
  id: string;
  label: string;
  academicYear: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

const day = (value: string | null) => (value ? value.slice(0, 10) : "");

const statusConfig: Record<string, { color: string; bg: string; icon: typeof Activity; label: string; badge: "info" | "success" | "warning" | "neutral" }> = {
  DRAFT: { color: "text-status-info-text", bg: "bg-status-info-surface", icon: Clock, label: "Draft", badge: "info" },
  ACTIVE: { color: "text-status-success-text", bg: "bg-status-success-surface", icon: CheckCircle2, label: "Active", badge: "success" },
  PAUSED: { color: "text-status-warning-text", bg: "bg-status-warning-surface", icon: Pause, label: "Paused", badge: "warning" },
  ENDED: { color: "text-ink-muted", bg: "bg-surface-subtle", icon: XCircle, label: "Ended", badge: "neutral" },
};

/**
 * Academic years (cycles) for a campus and the year-end checklist.
 *
 * `canManageCycles` (default true): creating, activating, pausing and resuming a cycle are year logistics —
 * campus operations (§2.2 #24, PR reads). The principal passes false and keeps the close-year checklist,
 * where `canForceClose` adds the academic lead's override (§2.3 #70). Omitted, it follows the caller's
 * `academicLead` capability (the principal, or the campus admin while no principal is appointed), so the
 * campus console offers the override exactly when the server would accept it.
 *
 * Host-owned header (§4.4b "Academic year": **Close year** (ConfirmAction) primary, Checklist secondary,
 * Force-close in the overflow): `hideCloseActions` drops the checklist's own close buttons; the host drives them
 * with `closeCommand` (or `closeRequest`, a number that asks to close a ready year) and reads `onClosureState`
 * (or `onCloseReady`). `canOpen` limits the checklist's "Fix this" links to screens the viewer can open.
 */
export function CycleManagementPanel({
  campusId,
  canForceClose: canForceCloseProp,
  canManageCycles = true,
  onNavigate,
  canOpen,
  hideCloseActions = false,
  closeCommand,
  closeRequest,
  onClosureState,
  onCloseReady,
}: {
  campusId?: string;
  /** The academic lead may close a year that still has outstanding work (server: canLeadAcademics). */
  canForceClose?: boolean;
  /** Create / activate / pause / resume cycles. False for the principal (read-only year logistics). */
  canManageCycles?: boolean;
  onNavigate?: (view: string) => void;
  canOpen?: (view: string) => boolean;
  hideCloseActions?: boolean;
  closeCommand?: YearCloseCommand;
  closeRequest?: number;
  onClosureState?: (state: YearClosureState) => void;
  onCloseReady?: (ready: boolean) => void;
} = {}) {
  const ui = useUiText();
  const { date: formatDay } = useLocaleFormat();
  const navigationAccess = useNavigationAccess();
  const canForceClose = canForceCloseProp ?? navigationAccess.has("academicLead");
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [creating, setCreating] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  // SKAI-116: inline date edit (one year at a time) and the holiday-impact confirmation it may need.
  const [editing, setEditing] = useState<{ id: string; start: string; end: string; updatedAt: string } | null>(null);
  const [savingDates, setSavingDates] = useState(false);
  const [holidayWarning, setHolidayWarning] = useState<string | null>(null);

  const fetchCycles = useCallback(async () => {
    try {
      const res = await fetch("/api/academic-cycle");
      const json = await res.json();
      if (json.success) setCycles(json.data || []);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  const saveDates = async (confirm = false) => {
    if (!editing) return;
    if (!editing.start || !editing.end) return toast.error(ui("Enter the start and end dates"));
    setSavingDates(true);
    try {
      const res = await fetch("/api/academic-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-dates", cycleId: editing.id, startDate: editing.start, endDate: editing.end, expectedUpdatedAt: editing.updatedAt, confirm }),
      });
      const json = await res.json();
      if (json.code === "CONFIRM_HOLIDAYS") return setHolidayWarning(json.error);
      if (!res.ok) throw new Error(json.error || ui("Could not update the academic year. Try again."));
      toast.success(ui("Academic year dates saved"));
      setHolidayWarning(null);
      setEditing(null);
      if (json.data) setCycles((prev) => prev.map((c) => (c.id === json.data.id ? json.data : c)));
      emitCycleChanged();
      fetchCycles();
    } catch (err: any) {
      // The form stays open with the typed dates so the office can correct and retry.
      setHolidayWarning(null);
      toast.error(err.message);
    } finally {
      setSavingDates(false);
    }
  };

  const doAction = async (action: string, cycleId: string) => {
    setActing(`${action}-${cycleId}`);
    try {
      const res = await fetch("/api/academic-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cycleId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || ui("Could not update the academic year. Try again."));
      toast.success(ui(action === "pause" ? "Academic year paused" : action === "activate" ? "Academic year activated" : action === "resume" ? "Academic year resumed" : action === "rollover" ? "Next academic year drafted" : "Academic year updated"));
      // Update the affected cycle in place (no waiting on a second fetch) and
      // notify the header/badge to refresh the active-cycle indicator.
      if (json.data && action === "rollover") {
        setCycles((prev) => [json.data, ...prev]);
      } else if (json.data) {
        setCycles((prev) =>
          prev.map((c) => (c.id === json.data.id ? json.data : c)),
        );
      }
      emitCycleChanged();
      fetchCycles();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  };

  const handleCreate = async () => {
    if (!newLabel.trim()) return toast.error(ui("Enter a name for the academic year"));
    if (!newStart || !newEnd) return toast.error(ui("Enter the start and end dates"));
    setCreating(true);
    try {
      const res = await fetch("/api/academic-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", label: newLabel.trim(), academicYear: newYear, startDate: newStart, endDate: newEnd }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || ui("Could not create the academic year. Try again."));
      toast.success(ui("Academic year created"));
      setShowCreate(false);
      setNewLabel("");
      setNewStart("");
      setNewEnd("");
      // Show the new cycle immediately instead of waiting on a refetch.
      if (json.data) {
        setCycles((prev) => [json.data, ...prev.filter((c) => c.id !== json.data.id)]);
      }
      emitCycleChanged();
      fetchCycles();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const activeCycle = cycles.find((c) => c.status === "ACTIVE");
  // `closeRequest` (a plain number) is the short form of `closeCommand={{ id: "close", nonce }}`.
  const command = useMemo<YearCloseCommand | undefined>(
    () => closeCommand ?? (closeRequest ? { id: "close", nonce: closeRequest } : undefined),
    [closeCommand, closeRequest],
  );
  const reportClosure = useCallback((state: YearClosureState) => {
    onClosureState?.(state);
    onCloseReady?.(state.ready);
  }, [onClosureState, onCloseReady]);
  // No open year: the header has nothing to close.
  useEffect(() => {
    if (!loading && !activeCycle) reportClosure({ hasOpenYear: false, ready: false, canForce: false, label: null, loading: false });
  }, [loading, activeCycle, reportClosure]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="sk-panel p-6 animate-skeleton-in">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-border-subtle/50 skeleton-shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-28 rounded-full bg-border-subtle/50 skeleton-shimmer" />
              <div className="h-5 w-40 rounded-full bg-border-subtle/50 skeleton-shimmer" />
              <div className="h-3 w-52 rounded-full bg-border-subtle/40 skeleton-shimmer" />
            </div>
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="sk-panel flex items-center justify-between p-4 animate-skeleton-in" style={{ animationDelay: `${(i + 1) * 80}ms` }}>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-border-subtle/50 skeleton-shimmer" />
              <div className="space-y-2">
                <div className="h-4 w-32 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                <div className="h-3 w-44 rounded-full bg-border-subtle/40 skeleton-shimmer" />
              </div>
            </div>
            <div className="h-7 w-16 rounded-full bg-border-subtle/40 skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmAction
        open={holidayWarning !== null}
        tone="warning"
        title={ui("Holidays fall outside the new dates")}
        description={holidayWarning ?? ""}
        confirmLabel={ui("Save dates anyway")}
        busy={savingDates}
        onConfirm={() => saveDates(true)}
        onCancel={() => setHolidayWarning(null)}
      />
      {/* Active cycle highlight */}
      {activeCycle && (
        <div className="sk-panel sk-gradient-border sk-rise p-6 shadow-md" style={{ animationDelay: "80ms" }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-status-success-surface text-status-success-text shadow-sm">
                <Activity className="h-7 w-7" />
              </div>
              <div>
                <p className="sk-eyebrow text-status-success-text">{ui("Current academic year")}</p>
                <h3 className="text-xl font-bold text-ink-strong tracking-tight"><bdi>{activeCycle.label}</bdi></h3>
                <p className="text-xs font-normal text-ink-muted mt-0.5">
                  {ui("Academic year {0}", [activeCycle.academicYear])}
                  {activeCycle.startDate ? <> · {ui("Started {0}", [formatDay(activeCycle.startDate)])}</> : null}
                </p>
              </div>
            </div>
            {canManageCycles ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm"
                  loading={acting === `pause-${activeCycle.id}`}
                  onClick={() => doAction("pause", activeCycle.id)}
                  disabled={acting !== null}
                  className="flex justify-start items-center gap-2"
                >
                  {acting === `pause-${activeCycle.id}` ? null : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
                  {ui("Pause")}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/*
        Closing a year is gated on the checklist below rather than a bare
        "End Cycle" button, so an admin can never close a year that still has
        marks outstanding or results the principal has not approved.
      */}
      {activeCycle && (
        <YearClosureChecklist
          campusId={campusId}
          year={activeCycle.academicYear}
          canForceClose={canForceClose}
          onNavigate={onNavigate}
          canOpen={canOpen}
          hideActions={hideCloseActions}
          command={command}
          onState={reportClosure}
          onClosed={fetchCycles}
        />
      )}

      {!activeCycle && (
        <Alert tone="danger" title={ui("No active academic year — teachers cannot work without one")} live="off" className="sk-rise">
          {ui(canManageCycles ? "Create and activate an academic year to allow attendance, marks entry and reports." : "Your campus admin creates and activates the academic year.")}
        </Alert>
      )}

      {/* Create new cycle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-strong">{ui("All academic years")}</h3>
        {canManageCycles ? (
          <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            {ui("New academic year")}
          </BrandButton>
        ) : null}
      </div>

      {showCreate && canManageCycles && (
        <div className="sk-rise sk-panel p-5 space-y-4" style={{ animationDelay: "240ms" }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField name="cycle-label" label={ui("Name")}>
              <SystemInput
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={ui("e.g. Session 2026-27")}
                className="w-full px-4"
              />
            </FormField>
            <FormField name="cycle-year" label={ui("Academic year")}>
              <SystemInput
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(Number(e.target.value))}
                className="w-full px-4"
              />
            </FormField>
            <FormField name="cycle-start" label={ui("Start date")}>
              <SystemInput type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="w-full px-4" />
            </FormField>
            <FormField name="cycle-end" label={ui("End date")}>
              <SystemInput type="date" value={newEnd} min={newStart || undefined} onChange={(e) => setNewEnd(e.target.value)} className="w-full px-4" />
            </FormField>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm"
              onClick={() => setShowCreate(false)}
            >
              {ui("Cancel")}
            </Button>
            <BrandButton onClick={handleCreate} disabled={creating} loading={creating}>
              {ui("Create academic year")}
            </BrandButton>
          </div>
        </div>
      )}

      {/* Cycle list */}
      {cycles.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={ui("No academic years yet")}
          description={ui(canManageCycles ? "Create your first academic year to get started." : "Your campus admin sets up the academic year.")}
        />
      ) : (
        <div className="space-y-3">
          {cycles.map((cycle, i) => {
            const config = statusConfig[cycle.status] || statusConfig.DRAFT;
            const Icon = config.icon;
            const isActive = cycle.status === "ACTIVE";

            return (
              <div
                key={cycle.id}
                className={cn(
                  "sk-panel sk-rise sk-hover-lift flex flex-wrap items-center justify-between gap-3 p-4",
                  isActive && "border-status-success-border ring-1 ring-status-success-border"
                )}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", config.bg)}>
                    <Icon className={cn("h-5 w-5", config.color)} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink-strong"><bdi>{cycle.label}</bdi></p>
                    <p className="text-xs font-semibold text-ink-muted">
                      {ui("Academic year {0}", [cycle.academicYear])}
                      {cycle.startDate && cycle.endDate
                        ? <> · {ui("{0} to {1}", [formatDay(cycle.startDate), formatDay(cycle.endDate)])}</>
                        : <> · {ui("Dates not set")}</>}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" dot variant={config.badge}>
                    {ui(config.label)}
                  </Badge>

                  {canManageCycles && cycle.status === "DRAFT" && (
                    <Button variant="default" size="sm"
                      loading={acting === `activate-${cycle.id}`}
                      onClick={() => doAction("activate", cycle.id)}
                      disabled={acting !== null}
                      className="flex justify-start items-center gap-1.5"
                    >
                      {acting === `activate-${cycle.id}` ? null : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                      {ui("Activate")}
                    </Button>
                  )}

                  {canManageCycles && cycle.status !== "ENDED" && editing?.id !== cycle.id && (
                    <Button variant="outline" size="sm" disabled={acting !== null}
                      onClick={() => setEditing({ id: cycle.id, start: day(cycle.startDate), end: day(cycle.endDate), updatedAt: cycle.updatedAt })}
                      className="flex justify-start items-center gap-1.5"
                    >
                      <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
                      {ui("Edit dates")}
                    </Button>
                  )}

                  {canManageCycles && (cycle.status === "ACTIVE" || cycle.status === "ENDED") && !cycles.some((c) => c.academicYear === cycle.academicYear + 1) && (
                    <Button variant="outline" size="sm"
                      loading={acting === `rollover-${cycle.id}`}
                      onClick={() => doAction("rollover", cycle.id)}
                      disabled={acting !== null}
                      className="flex justify-start items-center gap-1.5"
                    >
                      {acting === `rollover-${cycle.id}` ? null : <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" />}
                      {ui("Prepare next year")}
                    </Button>
                  )}

                  {canManageCycles && cycle.status === "PAUSED" && (
                    <Button variant="default" size="sm"
                      loading={acting === `resume-${cycle.id}`}
                      onClick={() => doAction("resume", cycle.id)}
                      disabled={acting !== null}
                      className="flex justify-start items-center gap-1.5"
                    >
                      {acting === `resume-${cycle.id}` ? null : <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />}
                      {ui("Resume")}
                    </Button>
                  )}
                </div>

                {editing?.id === cycle.id && (
                  <form
                    className="grid w-full grid-cols-1 gap-3 border-t border-border-subtle pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    onSubmit={(e) => { e.preventDefault(); saveDates(); }}
                  >
                    <FormField name={`start-${cycle.id}`} label={ui("Start date")}>
                      <SystemInput type="date" value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} className="w-full px-4" />
                    </FormField>
                    <FormField name={`end-${cycle.id}`} label={ui("End date")}>
                      <SystemInput type="date" value={editing.end} min={editing.start || undefined} onChange={(e) => setEditing({ ...editing, end: e.target.value })} className="w-full px-4" />
                    </FormField>
                    <div className="flex gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(null)}>{ui("Cancel")}</Button>
                      <Button type="submit" size="sm" loading={savingDates} disabled={savingDates}>{ui("Save dates")}</Button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
