"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, ArrowRight, CheckCircle2, Clock,
  Pause, Play, Plus, XCircle,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { emitCycleChanged } from "@/lib/cycleEvents";
import { YearClosureChecklist } from "@/components/academic/YearClosureChecklist";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";


interface Cycle {
  id: string;
  label: string;
  academicYear: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { color: string; bg: string; icon: typeof Activity; label: string; badge: "info" | "success" | "warning" | "neutral" }> = {
  DRAFT: { color: "text-status-info-text", bg: "bg-status-info-surface", icon: Clock, label: "Draft", badge: "info" },
  ACTIVE: { color: "text-status-success-text", bg: "bg-status-success-surface", icon: CheckCircle2, label: "Active", badge: "success" },
  PAUSED: { color: "text-status-warning-text", bg: "bg-status-warning-surface", icon: Pause, label: "Paused", badge: "warning" },
  ENDED: { color: "text-ink-muted", bg: "bg-surface-subtle", icon: XCircle, label: "Ended", badge: "neutral" },
};

export function CycleManagementPanel({
  campusId,
  canForceClose = false,
  onNavigate,
}: {
  campusId?: string;
  /** Principals may close a year that still has outstanding work. */
  canForceClose?: boolean;
  onNavigate?: (view: string) => void;
} = {}) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [creating, setCreating] = useState(false);

  const fetchCycles = useCallback(async () => {
    try {
      const res = await fetch("/api/academic-cycle");
      const json = await res.json();
      if (json.success) setCycles(json.data || []);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  const doAction = async (action: string, cycleId: string) => {
    setActing(`${action}-${cycleId}`);
    try {
      const res = await fetch("/api/academic-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cycleId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      toast.success(json.message);
      // Update the affected cycle in place (no waiting on a second fetch) and
      // notify the header/badge to refresh the active-cycle indicator.
      if (json.data) {
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
    if (!newLabel.trim()) return toast.error("Label is required");
    setCreating(true);
    try {
      const res = await fetch("/api/academic-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", label: newLabel.trim(), academicYear: newYear }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create cycle");
      toast.success(json.message);
      setShowCreate(false);
      setNewLabel("");
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-[28px] border border-edge/10 bg-white p-6 animate-skeleton-in">
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
          <div key={i} className="flex items-center justify-between rounded-[20px] border border-edge/15 bg-white p-4 animate-skeleton-in" style={{ animationDelay: `${(i + 1) * 80}ms` }}>
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
      {/* Active cycle highlight */}
      {activeCycle && (
        <div className="sk-panel sk-gradient-border sk-rise p-6 shadow-md" style={{ animationDelay: "80ms" }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-status-success-surface text-status-success-text shadow-sm">
                <Activity className="h-7 w-7" />
              </div>
              <div>
                <p className="sk-eyebrow text-status-success-text">Current Active Cycle</p>
                <h3 className="text-xl font-bold text-ink-strong tracking-tight">{activeCycle.label}</h3>
                <p className="text-xs font-normal text-ink-muted mt-0.5">
                  Academic Year {activeCycle.academicYear}
                  {activeCycle.startDate && ` · Started ${new Date(activeCycle.startDate).toLocaleDateString()}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm"
                loading={acting === `pause-${activeCycle.id}`}
                onClick={() => doAction("pause", activeCycle.id)}
                disabled={acting !== null}
                className="flex justify-start items-center gap-2"
              >
                {acting === `pause-${activeCycle.id}` ? null : <Pause className="h-3.5 w-3.5" />}
                Pause
              </Button>
            </div>
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
          onClosed={fetchCycles}
        />
      )}

      {!activeCycle && (
        <Alert tone="danger" title="No active cycle — teachers cannot operate without one" live="off" className="sk-rise">
          Create and activate a cycle to allow attendance, marks entry, and reports.
        </Alert>
      )}

      {/* Create new cycle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-strong">All Cycles</h3>
        <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
          New Cycle
        </BrandButton>
      </div>

      {showCreate && (
        <div className="sk-rise rounded-[24px] border border-edge/20 bg-white p-5 shadow-sm space-y-4" style={{ animationDelay: "240ms" }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField name="cycle-label" label="Cycle Label">
              <SystemInput
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Session 2026-27"
                className="w-full px-4"
              />
            </FormField>
            <FormField name="cycle-year" label="Academic Year">
              <SystemInput
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(Number(e.target.value))}
                className="w-full px-4"
              />
            </FormField>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm"
              onClick={() => setShowCreate(false)}

            >
              Cancel
            </Button>
            <BrandButton onClick={handleCreate} disabled={creating} loading={creating}>
              Create Cycle
            </BrandButton>
          </div>
        </div>
      )}

      {/* Cycle list */}
      {cycles.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No cycles yet"
          description="Create your first academic cycle to get started."
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
                    <p className="text-sm font-bold text-ink-strong">{cycle.label}</p>
                    <p className="text-2xs font-semibold text-ink-muted">
                      Year {cycle.academicYear}
                      {cycle.startDate && ` · Started ${new Date(cycle.startDate).toLocaleDateString()}`}
                      {cycle.endDate && ` · Ended ${new Date(cycle.endDate).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge size="sm" dot variant={config.badge}>
                    {config.label}
                  </Badge>

                  {cycle.status === "DRAFT" && (
                    <Button variant="default" size="sm"
                      loading={acting === `activate-${cycle.id}`}
                      onClick={() => doAction("activate", cycle.id)}
                      disabled={acting !== null}
                      className="flex justify-start items-center gap-1.5"
                    >
                      {acting === `activate-${cycle.id}` ? null : <Play className="h-3.5 w-3.5" />}
                      Activate
                    </Button>
                  )}

                  {cycle.status === "PAUSED" && (
                    <Button variant="default" size="sm"
                      loading={acting === `resume-${cycle.id}`}
                      onClick={() => doAction("resume", cycle.id)}
                      disabled={acting !== null}
                      className="flex justify-start items-center gap-1.5"
                    >
                      {acting === `resume-${cycle.id}` ? null : <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />}
                      Resume
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
