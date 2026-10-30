"use client";

/**
 * The receptionist's opening screen.
 *
 * The front desk is a queue, not a ledger: what matters is who is in the
 * building right now, what is still open, and whether today looks like a
 * normal day. The hero is the live count; the charts give it a fortnight of
 * context to judge it against.
 */

import { useMemo, type ReactNode } from "react";
import {
  CheckCircle2,
  DoorOpen,
  MessageSquare,
  Phone,
  PhoneIncoming,
  UserCheck,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CommandHero } from "./CommandHero";
import { EmptyChart, InsightCard, SeriesLegend, StatTile, VizTooltip } from "./chart-kit";
import { AXIS_TICK, INK, NO_ENTRY_ANIMATION, SERIES, STATUS, compact } from "./palette";
import { Button } from "@/components/ui/button";
import { useUiText } from "@/components/locale/LocaleProvider";


export interface FrontDeskSummary {
  kind: "RECEPTIONIST";
  visitorsToday: number;
  stillInside: number;
  visitorsByDay: { day: string; count: number }[];
  complaintsByStatus: { status: string; count: number }[];
  callsByDay: { day: string; count: number }[];
  callsIn: number;
  callsOut: number;
  followUpsDue: number;
  postalReceived: number;
  postalDispatched: number;
  postalByDay: { day: string; count: number }[];
  certificateTemplates: number;
}

const COMPLAINT_COLOR: Record<string, string> = {
  OPEN: STATUS.critical,
  IN_PROGRESS: STATUS.warning,
  RESOLVED: STATUS.good,
  CLOSED: STATUS.neutral,
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const COMPLAINT_LABEL: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" };

export function FrontDeskOverview({
  summary,
  campusLabel,
  onNavigate,
  queue,
  pickupsWaiting = null,
}: {
  summary: FrontDeskSummary;
  campusLabel: string;
  onNavigate: (view: string) => void;
  /**
   * The landing view's one work queue ("waiting on you", role-ux §4.5.8), shown under the KPI tiles. The receptionist
   * console loads and renders it (`FrontDeskQueue` in `src/app/receptionist/page.tsx`); this overview stays
   * presentational, like every other insights screen.
   */
  queue?: ReactNode;
  /** Pickups at the gate still waiting (identity check or the pickup lead); from the queue, null while it loads. */
  pickupsWaiting?: number | null;
}) {
  const tr = useUiText();
  const derived = useMemo(() => {
    const visitors = summary.visitorsByDay.map((d) => ({ label: dayLabel(d.day), count: d.count }));
    const fortnightVisitors = summary.visitorsByDay.reduce((sum, d) => sum + d.count, 0);
    const busiest = summary.visitorsByDay.reduce(
      (best, d) => (d.count > best.count ? d : best),
      { day: "", count: 0 },
    );

    const complaints = summary.complaintsByStatus
      .map((c) => ({
        status: c.status,
        label: tr(COMPLAINT_LABEL[c.status] ?? c.status),
        count: c.count,
        color: COMPLAINT_COLOR[c.status] ?? STATUS.neutral,
      }))
      .sort((a, b) => b.count - a.count);
    const openComplaints = complaints
      .filter((c) => c.status === "OPEN" || c.status === "IN_PROGRESS")
      .reduce((sum, c) => sum + c.count, 0);

    // Calls and post are both "traffic through the desk", counted the same way
    // over the same fortnight, so one pair of axes serves them both.
    const traffic = summary.callsByDay.map((d, i) => ({
      label: dayLabel(d.day),
      calls: d.count,
      post: summary.postalByDay[i]?.count ?? 0,
    }));

    return {
      visitors,
      fortnightVisitors,
      busiest,
      dailyAverage: summary.visitorsByDay.length
        ? Math.round(fortnightVisitors / summary.visitorsByDay.length)
        : 0,
      complaints,
      openComplaints,
      totalComplaints: complaints.reduce((sum, c) => sum + c.count, 0),
      traffic,
      hasTraffic: traffic.some((t) => t.calls > 0 || t.post > 0),
    };
  }, [summary, tr]);

  const totalCalls = summary.callsIn + summary.callsOut;
  const totalPost = summary.postalReceived + summary.postalDispatched;

  return (
    <div className="space-y-5">
      {/* Spotlight anchor for the receptionist tour's first step (role-ux §9.4). */}
      <div data-tour="reception.today.summary">
      <CommandHero
        eyebrow={campusLabel}
        title={tr("On site today")}
        heroValue={compact(summary.visitorsToday)}
        heroLabel={tr("Visitors signed in today")}
        heroCaption={
          derived.fortnightVisitors > 0
            ? tr("{0} still inside. Averaging {1} a day over the last fortnight.", [summary.stillInside, derived.dailyAverage])
            : tr("No visitors logged in the last fortnight.")
        }
        meters={[
          {
            label: tr("Signed out again"),
            value: Math.max(0, summary.visitorsToday - summary.stillInside),
            max: summary.visitorsToday || 1,
            valueLabel:
              summary.visitorsToday > 0
                ? `${summary.visitorsToday - summary.stillInside} / ${summary.visitorsToday}`
                : tr("Nobody in yet"),
            color: summary.stillInside === 0 ? STATUS.good : STATUS.warning,
          },
          {
            label: tr("Complaints resolved"),
            value: derived.totalComplaints - derived.openComplaints,
            max: derived.totalComplaints || 1,
            valueLabel:
              derived.totalComplaints > 0
                ? `${derived.totalComplaints - derived.openComplaints} / ${derived.totalComplaints}`
                : tr("None logged"),
            color: derived.openComplaints === 0 ? STATUS.good : STATUS.warning,
          },
        ]}
        aside={
          <div className="flex w-full max-w-[148px] flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-primary">
              {summary.stillInside > 0 ? <Users className="h-6 w-6" aria-hidden /> : <CheckCircle2 className="h-6 w-6" aria-hidden />}
            </span>
            <div>
              <p className="text-3xl font-extrabold leading-none tracking-tight tabular-nums text-ink-strong"><bdi>{summary.stillInside}</bdi></p>
              <p className="mt-1.5 text-xs font-semibold leading-tight text-ink-subtle">
                {tr(summary.stillInside === 1 ? "Visitor in the building" : "Visitors in the building")}
              </p>
            </div>
          </div>
        }
      />
      </div>

      {/* At most four KPI tiles on a landing screen (role-ux §4.5.8). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={DoorOpen} label={tr("Visitors")} value={summary.visitorsToday} sub={tr("{0} still inside", [summary.stillInside])} tone={summary.stillInside > 0 ? "warning" : "brand"} trend={derived.fortnightVisitors > 0 ? derived.visitors.map((v) => v.count).slice(-12) : undefined} onClick={() => onNavigate("visitors")} delay={80} />
        <StatTile icon={PhoneIncoming} label={tr("Callbacks due")} value={summary.followUpsDue} sub={tr("{0} calls in · {1} out", [summary.callsIn, summary.callsOut])} tone={summary.followUpsDue > 0 ? "warning" : "good"} onClick={() => onNavigate("phone-calls")} delay={140} />
        {/* Who is on site, callbacks due and pickups waiting (the registry summary for Today); post stays in the
            traffic chart below and its own view. */}
        <StatTile icon={UserCheck} label={tr("Pickups waiting")} value={pickupsWaiting ?? "—"} sub={tr("At the gate today")} tone={pickupsWaiting ? "warning" : "good"} onClick={() => onNavigate("pickup")} delay={200} />
        <StatTile icon={MessageSquare} label={tr("Open complaints")} value={derived.openComplaints} sub={tr("{0} logged in total", [derived.totalComplaints])} tone={derived.openComplaints > 0 ? "critical" : "good"} onClick={() => onNavigate("complaints")} delay={260} />
      </div>

      {queue}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InsightCard
          icon={Users}
          title={tr("Visitors through the door")}
          subtitle={tr("Last 14 days")}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: [tr("Day"), tr("Visitors")],
            rows: derived.visitors.map((v) => [v.label, v.count]),
          }}
        >
          {derived.fortnightVisitors > 0 ? (
            <ResponsiveContainer width="100%" height={248}>
              <AreaChart data={derived.visitors} margin={{ top: 16, right: 12, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="frontDeskVisitorWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={14} />
                <YAxis
                  domain={[0, (dataMax: number) => Math.ceil((dataMax || 1) * 1.15)]}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip cursor={{ stroke: INK.axis, strokeWidth: 1 }} content={<VizTooltip />} />
                <Area
                  {...NO_ENTRY_ANIMATION}
                  type="monotone"
                  dataKey="count"
                  name={tr("Visitors")}
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#frontDeskVisitorWash)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={tr("No visitors logged in the last fortnight")} />
          )}
        </InsightCard>

        <InsightCard
          icon={MessageSquare}
          title={tr("Complaints")}
          subtitle={tr("By state")}
          delay={180}
          actions={
            <Button variant="link" size="sm" type="button" onClick={() => onNavigate("complaints")}>
              {tr("Open")}
            </Button>
          }
          table={{
            columns: [tr("State"), tr("Complaints")],
            rows: derived.complaints.map((c) => [c.label, c.count]),
          }}
        >
          {derived.complaints.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={248}>
                <BarChart data={derived.complaints} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="26%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={84} />
                  <Tooltip cursor={{ fill: INK.grid }} content={<VizTooltip />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name={tr("Complaints")} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {derived.complaints.map((c) => (
                      <Cell key={c.status} fill={c.color} />
                    ))}
                    <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-3" items={derived.complaints.map((c) => ({ label: c.label, color: c.color, value: c.count }))} />
            </>
          ) : (
            <EmptyChart label={tr("No complaints have been logged")} />
          )}
        </InsightCard>
      </div>

      <InsightCard
        icon={Phone}
        title={tr("Calls and post")}
        subtitle={tr("Traffic through the desk, last 14 days")}
        delay={120}
        table={{
          columns: [tr("Day"), tr("Calls"), tr("Post")],
          rows: derived.traffic.map((t) => [t.label, t.calls, t.post]),
        }}
      >
        {derived.hasTraffic ? (
          <>
            <ResponsiveContainer width="100%" height={232}>
              <BarChart data={derived.traffic} margin={{ top: 18, right: 12, bottom: 4, left: -18 }} barGap={3}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={14} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: INK.grid }} content={<VizTooltip />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="calls" name={tr("Calls")} fill={SERIES[0]} radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="post" name={tr("Post")} fill={SERIES[2]} radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
            <SeriesLegend
              className="mt-3"
              items={[
                { label: tr("Calls"), color: SERIES[0], value: totalCalls },
                { label: tr("Post"), color: SERIES[2], value: totalPost },
              ]}
            />
          </>
        ) : (
          <EmptyChart label={tr("No calls or post logged in the last fortnight")} />
        )}
      </InsightCard>
    </div>
  );
}
