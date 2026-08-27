"use client";

/**
 * Staff hierarchy: the chart, the units and the ladder in one place.
 *
 * The three tabs are one job split by what you are editing, not three
 * features. The chart is where you look at the institution and move a person;
 * Departments is where you shape the units and hand out headship; Rank ladder
 * is where you define what the ranks even are. An institution that has not
 * done the third has nothing to show in the first, so the empty state points
 * there rather than showing a bare canvas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Layers, Loader2, Network, RefreshCw, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandButton } from "@/components/role-dashboard";
import { OrgChart } from "./org-chart";
import { PositionDialog, type DesignationOption } from "./position-dialog";
import { DepartmentManager } from "./department-manager";
import { DesignationLadder } from "./designation-ladder";
import { TRACK_TONES } from "@/lib/staff/hierarchy-presets";
import type { OrgChartData, OrgNode } from "@/lib/staff/hierarchy";

type Tab = "chart" | "departments" | "ladder";

const TABS: Array<{ key: Tab; label: string; icon: typeof Network }> = [
  { key: "chart", label: "Org chart", icon: Network },
  { key: "departments", label: "Departments", icon: Building2 },
  { key: "ladder", label: "Rank ladder", icon: Layers },
];

interface HierarchyResponse extends OrgChartData {
  institutionType: string;
  designations: DesignationOption[];
}

export function StaffHierarchyPanel({ campusId }: { campusId: string }) {
  const [tab, setTab] = useState<Tab>("chart");
  const [data, setData] = useState<HierarchyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<OrgNode | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      try {
        const res = await fetch(`/api/staff/hierarchy?campusId=${campusId}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Could not load the staff hierarchy");
        setData(payload);
        // Keep the open dialog pointed at the refreshed record, not a stale copy.
        setSelected((current) =>
          current ? (payload.nodes as OrgNode[]).find((n) => n.id === current.id) ?? null : null
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load the staff hierarchy");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [campusId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!data) return null;
    const nodes = data.nodes;
    const heads = new Set(nodes.flatMap((n) => n.headOf.map((h) => h.id)));
    return {
      staff: nodes.length,
      ranked: nodes.filter((n) => n.designation).length,
      unranked: data.unrankedIds.length,
      unplaced: nodes.filter((n) => !n.managerId && !n.isInstitutionHead).length,
      departments: data.departments.length,
      headed: heads.size,
      dueForReview: nodes.filter((n) => n.dueForReview).length,
      byTrack: Object.keys(TRACK_TONES).map((track) => ({
        track,
        count: nodes.filter((n) => n.designation?.track === track).length,
      })),
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-xs font-bold text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Building the staff hierarchy…
      </div>
    );
  }

  const needsLadder = (data?.designations.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      {/* ── Summary ──────────────────────────────────────── */}
      {stats ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat icon={Users} label="Staff on this campus" value={stats.staff} />
          <Stat
            icon={Layers}
            label="Given a rank"
            value={`${stats.ranked}/${stats.staff}`}
            tone={stats.unranked > 0 ? "amber" : "default"}
          />
          <Stat icon={Building2} label="Departments" value={stats.departments} hint={`${stats.headed} with a head`} />
          <Stat
            icon={TriangleAlert}
            label="No reporting line"
            value={stats.unplaced}
            tone={stats.unplaced > 0 ? "amber" : "default"}
          />
        </div>
      ) : null}

      {/* ── Tabs ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-2xl bg-[#f3f4f9] p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-all",
                tab === t.key ? "bg-white text-[#8127cf] shadow-sm" : "text-muted hover:text-ink"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.key === "ladder" && needsLadder ? (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Needs setting up" />
              ) : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-xl border border-[#cfc2d6]/40 bg-white px-3 py-2.5 text-xs font-black text-muted transition-colors hover:text-[#8127cf] disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      {tab === "chart" ? (
        needsLadder ? (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 px-6 py-12 text-center">
            <Layers className="mx-auto h-8 w-8 text-amber-600" />
            <p className="mt-3 text-sm font-black text-ink">Define your ranks first</p>
            <p className="mx-auto mt-1 max-w-lg text-xs font-semibold text-muted">
              The chart draws who is senior to whom, and it reads that from your rank ladder. Pick the preset for
              your kind of institution — school, college, university or training institute — and adjust it from
              there. Nothing is fixed.
            </p>
            <div className="mt-4">
              <BrandButton icon={<Layers className="h-4 w-4" />} onClick={() => setTab("ladder")}>
                Set up the rank ladder
              </BrandButton>
            </div>
          </div>
        ) : (
          data && (
            <OrgChart
              nodes={data.nodes}
              dottedEdges={data.dottedEdges}
              departments={data.departments}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          )
        )
      ) : null}

      {tab === "departments" && data ? (
        <DepartmentManager campusId={campusId} staff={data.nodes} onChanged={() => load(true)} />
      ) : null}

      {tab === "ladder" ? <DesignationLadder campusId={campusId} onChanged={() => load(true)} /> : null}

      {selected && data ? (
        <PositionDialog
          node={selected}
          nodes={data.nodes}
          designations={data.designations}
          departments={data.departments}
          onClose={() => setSelected(null)}
          onSaved={() => load(true)}
        />
      ) : null}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "amber";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-white px-3.5 py-3",
        tone === "amber" ? "border-amber-200 bg-amber-50/40" : "border-[#cfc2d6]/40"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          tone === "amber" ? "bg-amber-100 text-amber-600" : "bg-[#fbf0fe] text-[#8127cf]"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-black leading-none tabular-nums text-ink">{value}</span>
        <span className="mt-0.5 block truncate text-[10px] font-black uppercase tracking-wide text-muted">{label}</span>
        {hint ? <span className="block truncate text-[10px] font-semibold text-muted">{hint}</span> : null}
      </span>
    </div>
  );
}
