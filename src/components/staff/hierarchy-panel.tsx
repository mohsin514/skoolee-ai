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
import { Building2, Layers, Network, RefreshCw, TriangleAlert, Users, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/components/ui/view-tabs";
import { SkeletonCards } from "@/components/ui/skeleton";
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


export type StaffStructureTab = "chart" | "departments" | "ladder" | "workload";
type Tab = StaffStructureTab;

/** The sections of Staff structure, in order. A console that hosts the panel renders these in its PageHeader. */
export const STAFF_STRUCTURE_TABS: Array<{ id: Tab; label: string; icon: typeof Network }> = [
  { id: "chart", label: "Org chart", icon: Network },
  { id: "departments", label: "Departments", icon: Building2 },
  { id: "ladder", label: "Rank ladder", icon: Layers },
  { id: "workload", label: "Workload & cover", icon: CalendarClock },
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
export function StaffHierarchyPanel({
  campusId,
  tab: controlledTab,
  onTabChange,
  addUnitRequest,
  addRankRequest,
}: {
  campusId?: string;
  /** Controlled section (the console renders the tabs in its PageHeader and keeps `?tab=`). */
  tab?: Tab;
  onTabChange?: (tab: Tab) => void;
  /** Console PageHeader primaries: each change opens "New unit" (Departments) / "New rank" (Rank ladder).
   *  When given, the sections do not repeat their own add buttons (§4.4b, one primary per screen). */
  addUnitRequest?: number;
  addRankRequest?: number;
}) {
  const ui = useUiText();
  const [localTab, setLocalTab] = useState<Tab>("chart");
  const tab: Tab = controlledTab ?? localTab;
  const setTab = (next: Tab) => { if (onTabChange) onTabChange(next); else setLocalTab(next); };
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
        // R4: a load failure is the inline ErrorState below (with retry), never a toast as well.
        console.error(error);
        setLoadError(true);
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
      <SkeletonCards count={4} label={ui("Building the staff hierarchy…")} />
    );
  }

  if (!data && loadError) {
    return (
      <ErrorState
        variant="panel"
        title={ui("Couldn't load the staff structure")}
        description={ui("Could not load the staff hierarchy. Check your connection and try again.")}
        onRetry={() => load()}
      />
    );
  }

  const needsLadder = data ? data.designations.length === 0 : false;

  return (
    <div className="space-y-4">
      {/* ── Summary ──────────────────────────────────────── */}
      {stats ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat icon={Users} label={ui("Staff on this campus")} value={stats.staff} />
          <Stat
            icon={Layers}
            label={ui("Given a rank")}
            value={`${stats.ranked}/${stats.staff}`}
            tone={stats.unranked > 0 ? "amber" : "default"}
          />
          <Stat icon={Building2} label={ui("Departments")} value={stats.departments} hint={ui("{0} with a head", [stats.headed])} />
          <Stat
            icon={TriangleAlert}
            label={ui("No reporting line")}
            value={stats.unplaced}
            tone={stats.unplaced > 0 ? "amber" : "default"}
          />
        </div>
      ) : null}

      {/* ── Tabs (the console renders them in its PageHeader when it controls the section) ── */}
      <div className="flex flex-wrap items-center gap-2">
        {controlledTab === undefined ? (
          <div className="min-w-0 flex-1">
            <ViewTabs
              items={STAFF_STRUCTURE_TABS.map((t) => ({ id: t.id, label: t.label }))}
              value={tab}
              onChange={(id) => setTab(id as Tab)}
              ariaLabel="Staff structure sections"
            />
          </div>
        ) : needsLadder && tab !== "ladder" ? (
          <p className="flex-1 text-xs font-semibold text-status-warning-text">{ui("Set up the rank ladder first: the chart reads seniority from it.")}</p>
        ) : <span className="flex-1" />}
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
            title={ui("Define your ranks first")}
            description={ui("The chart draws who is senior to whom, and it reads that from your rank ladder. Pick the preset for your kind of institution — school, college, university or training institute — and adjust it from there. Nothing is fixed.")}
            action={
              <Button type="button" onClick={() => setTab("ladder")}>
                <Layers aria-hidden="true" />{ui("Set up the rank ladder")}
              </Button>
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
        <DepartmentManager campusId={campusId} staff={data.nodes} onChanged={() => load(true)} addRequest={addUnitRequest} hideAdd={addUnitRequest !== undefined} />
      ) : null}

      {tab === "ladder" ? <DesignationLadder campusId={campusId} onChanged={() => load(true)} addRequest={addRankRequest} hideAdd={addRankRequest !== undefined} /> : null}

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
        "flex items-center gap-3 rounded-2xl border px-3.5 py-3",
        tone === "amber" ? "border-status-warning-border bg-status-warning-surface" : "border-edge/40 bg-card"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          tone === "amber" ? "bg-card text-status-warning-text" : "bg-brand-50 text-primary"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <bdi className="block text-lg font-bold leading-none tabular-nums text-ink">{value}</bdi>
        <span className="mt-0.5 block truncate text-xs font-semibold text-ink-subtle">{label}</span>
        {hint ? <span className="block truncate text-xs font-medium text-ink-subtle">{hint}</span> : null}
      </span>
    </div>
  );
}
