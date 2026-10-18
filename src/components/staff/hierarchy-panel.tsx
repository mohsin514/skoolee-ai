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
import { Building2, Layers, Loader2, Network, RefreshCw, TriangleAlert, Users, CalendarClock } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { BrandButton } from "@/components/role-dashboard";
import { OrgChart } from "./org-chart";
import { PositionDialog, type DesignationOption } from "./position-dialog";
import { DepartmentManager } from "./department-manager";
import { DesignationLadder } from "./designation-ladder";
import { WorkloadCover } from "./workload-cover";
import { CoverFollowUp } from "@/components/cover/cover-follow-up";
import { useUiText } from "@/components/locale/LocaleProvider";
import { TRACK_TONES } from "@/lib/staff/hierarchy-presets";
import type { OrgChartData, OrgNode } from "@/lib/staff/hierarchy";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";


type Tab = "chart" | "departments" | "ladder" | "workload";

const TABS: Array<{ key: Tab; label: string; icon: typeof Network }> = [
  { key: "chart", label: "Org chart", icon: Network },
  { key: "departments", label: "Departments", icon: Building2 },
  { key: "ladder", label: "Rank ladder", icon: Layers },
  { key: "workload", label: "Workload & cover", icon: CalendarClock },
];

interface HierarchyResponse extends OrgChartData {
  institutionType: string;
  designations: DesignationOption[];
}

/**
 * `campusId` is optional. The consoles that span campuses (/super) name the one
 * they are showing; the single-campus consoles (/admin, /principal, /dashboard)
 * omit it and let the API resolve it from the session, which is also the only
 * campus those roles are allowed to read.
 */
export function StaffHierarchyPanel({ campusId }: { campusId?: string }) {
  const ui = useUiText();
  const [tab, setTab] = useState<Tab>("chart");
  const [data, setData] = useState<HierarchyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<OrgNode | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      try {
        const res = await fetch(`/api/staff/hierarchy${campusId ? `?campusId=${campusId}` : ""}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Could not load the staff hierarchy");
        setData(payload);
        setLoadError(false);
        // Keep the open dialog pointed at the refreshed record, not a stale copy.
        setSelected((current) =>
          current ? (payload.nodes as OrgNode[]).find((n) => n.id === current.id) ?? null : null
        );
      } catch (error) {
        console.error(error);
        setLoadError(true);
        toast.error(ui("Could not load the staff hierarchy. Check your connection and try again."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [campusId, ui]
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
      <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 py-24 text-sm font-medium text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Building the staff hierarchy…
      </div>
    );
  }

  if (!data && loadError) {
    return <ErrorState variant="panel" onRetry={() => load()} />;
  }

  const needsLadder = data ? data.designations.length === 0 : false;

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
        <div className="flex flex-1 gap-1 rounded-2xl bg-muted p-1">
          {TABS.map((t) => (
            <Button aria-pressed={tab === t.key} variant="choice" size="sm"
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="flex flex-1 items-center justify-center gap-2"
            >
              <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {ui(t.label)}
              {t.key === "ladder" && needsLadder ? (
                <><span className="ms-1 h-1.5 w-1.5 rounded-full bg-status-warning-text" aria-hidden="true" /><span className="sr-only">{ui("Needs setting up")}</span></>
              ) : null}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm"
          type="button"
          onClick={() => load(true)}
          loading={refreshing}
          className="flex justify-start items-center gap-1.5"
        >
          {refreshing ? null : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          {ui("Refresh")}
        </Button>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      {tab === "chart" ? (
        needsLadder ? (
          <EmptyState
            icon={Layers}
            title="Define your ranks first"
            description="The chart draws who is senior to whom, and it reads that from your rank ladder. Pick the preset for your kind of institution — school, college, university or training institute — and adjust it from there. Nothing is fixed."
            action={
              <BrandButton icon={<Layers className="h-4 w-4" aria-hidden="true" />} onClick={() => setTab("ladder")}>
                Set up the rank ladder
              </BrandButton>
            }
          />
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

      {tab === "workload" ? <><WorkloadCover campusId={campusId} /><div className="mt-4"><CoverFollowUp campusId={campusId} /></div></> : null}

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
        tone === "amber" ? "border-amber-200 bg-amber-50/40" : "border-edge/40"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          tone === "amber" ? "bg-amber-100 text-amber-600" : "bg-brand-50 text-primary"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-none tabular-nums text-ink">{value}</span>
        <span className="mt-0.5 block truncate text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</span>
        {hint ? <span className="block truncate text-xs font-medium text-ink-subtle">{hint}</span> : null}
      </span>
    </div>
  );
}
