"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2,
  Pause, Play, Plus, Power, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";

interface Cycle {
  id: string;
  label: string;
  academicYear: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { color: string; bg: string; icon: typeof Activity; label: string }> = {
  DRAFT: { color: "text-blue-700", bg: "bg-blue-50 border-blue-200/40", icon: Clock, label: "Draft" },
  ACTIVE: { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200/40", icon: CheckCircle2, label: "Active" },
  PAUSED: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200/40", icon: Pause, label: "Paused" },
  ENDED: { color: "text-gray-600", bg: "bg-gray-50 border-gray-200/40", icon: XCircle, label: "Ended" },
};

export function CycleManagementPanel() {
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
      await fetchCycles();
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
      await fetchCycles();
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
        <div className="rounded-[28px] border border-[#cfc2d6]/10 bg-white p-6 animate-skeleton-in">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-[#e8e0ec]/50 skeleton-shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-28 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
              <div className="h-5 w-40 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
              <div className="h-3 w-52 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
            </div>
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-[20px] border border-[#cfc2d6]/15 bg-white p-4 animate-skeleton-in" style={{ animationDelay: `${(i + 1) * 80}ms` }}>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-[#e8e0ec]/50 skeleton-shimmer" />
              <div className="space-y-2">
                <div className="h-4 w-32 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="h-3 w-44 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
              </div>
            </div>
            <div className="h-7 w-16 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active cycle highlight */}
      {activeCycle && (
        <div className="sk-rise rounded-[28px] border border-emerald-200/30 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-sm">
                <Activity className="h-7 w-7" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600/70">Current Active Cycle</p>
                <h3 className="text-xl font-black text-[#1d1b20] tracking-tight">{activeCycle.label}</h3>
                <p className="text-xs font-semibold text-[#4d4354]/60 mt-0.5">
                  Academic Year {activeCycle.academicYear}
                  {activeCycle.startDate && ` · Started ${new Date(activeCycle.startDate).toLocaleDateString()}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => doAction("pause", activeCycle.id)}
                disabled={acting !== null}
                className="flex items-center gap-2 rounded-2xl border border-amber-200/40 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-700 transition-all hover:bg-amber-100 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {acting === `pause-${activeCycle.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                Pause
              </button>
              <button
                onClick={() => doAction("end", activeCycle.id)}
                disabled={acting !== null}
                className="flex items-center gap-2 rounded-2xl border border-rose-200/40 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-600 transition-all hover:bg-rose-100 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {acting === `end-${activeCycle.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                End Cycle
              </button>
            </div>
          </div>
        </div>
      )}

      {!activeCycle && (
        <div className="sk-rise rounded-[28px] border border-rose-200/30 bg-gradient-to-br from-rose-50 to-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-500 shadow-sm">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-500/70">No Active Cycle</p>
              <h3 className="text-lg font-black text-[#1d1b20] tracking-tight">Teachers cannot operate without an active cycle</h3>
              <p className="text-xs font-semibold text-[#4d4354]/60 mt-0.5">
                Create and activate a cycle to allow attendance, marks entry, and reports.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Create new cycle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1d1b20]">All Cycles</h3>
        <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
          New Cycle
        </BrandButton>
      </div>

      {showCreate && (
        <div className="sk-rise rounded-[24px] border border-[#cfc2d6]/20 bg-white p-5 shadow-sm space-y-4" style={{ animationDelay: "240ms" }}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Cycle Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Session 2026-27"
                className="h-11 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Academic Year</label>
              <input
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(Number(e.target.value))}
                className="h-11 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-2xl bg-[#f3f4f9] px-5 py-2.5 text-xs font-bold text-[#4d4354] hover:bg-[#e8e0ec] transition-all cursor-pointer"
            >
              Cancel
            </button>
            <BrandButton onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {creating ? "Creating..." : "Create Cycle"}
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
                  "sk-rise flex items-center justify-between rounded-[20px] border bg-white p-4 shadow-sm transition-all duration-200",
                  isActive ? "border-emerald-200/40 ring-1 ring-emerald-100" : "border-[#cfc2d6]/15 hover:border-[#8127cf]/15 hover:shadow-md"
                )}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", config.bg)}>
                    <Icon className={cn("h-5 w-5", config.color)} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1d1b20]">{cycle.label}</p>
                    <p className="text-[10px] font-semibold text-[#4d4354]/50">
                      Year {cycle.academicYear}
                      {cycle.startDate && ` · Started ${new Date(cycle.startDate).toLocaleDateString()}`}
                      {cycle.endDate && ` · Ended ${new Date(cycle.endDate).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide", config.bg, config.color)}>
                    <Icon className="h-3 w-3" />
                    {config.label}
                  </span>

                  {cycle.status === "DRAFT" && (
                    <button
                      onClick={() => doAction("activate", cycle.id)}
                      disabled={acting !== null}
                      className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] px-4 py-2 text-xs font-bold text-white shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {acting === `activate-${cycle.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Activate
                    </button>
                  )}

                  {cycle.status === "PAUSED" && (
                    <button
                      onClick={() => doAction("resume", cycle.id)}
                      disabled={acting !== null}
                      className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {acting === `resume-${cycle.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                      Resume
                    </button>
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
