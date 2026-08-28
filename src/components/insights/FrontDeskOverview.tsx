"use client";

/**
 * The receptionist's opening screen.
 *
 * The front desk is a queue, not a ledger: what matters is who is in the
 * building right now, what is still open, and whether today looks like a
 * normal day. The hero is the live count; the charts give it a fortnight of
 * context to judge it against.
 */

import { useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  DoorOpen,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  PhoneIncoming,
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

function titleCase(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function FrontDeskOverview({
  summary,
  campusLabel,
  onNavigate,
}: {
  summary: FrontDeskSummary;
  campusLabel: string;
  onNavigate: (view: string) => void;
}) {
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
        label: titleCase(c.status),
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
      Calls: d.count,
      Post: summary.postalByDay[i]?.count ?? 0,
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
      hasTraffic: traffic.some((t) => t.Calls > 0 || t.Post > 0),
    };
  }, [summary]);

  const totalCalls = summary.callsIn + summary.callsOut;
  const totalPost = summary.postalReceived + summary.postalDispatched;

  return (
    <div className="space-y-5">
      <CommandHero
        eyebrow={campusLabel}
        title="Front desk command centre"
        heroValue={compact(summary.visitorsToday)}
        heroLabel="Visitors signed in today"
        heroCaption={
          derived.fortnightVisitors > 0
            ? `${summary.stillInside} still inside. Averaging ${derived.dailyAverage} a day over the last fortnight.`
            : "No visitors logged in the last fortnight."
        }
        meters={[
          {
            label: "Signed out again",
            value: Math.max(0, summary.visitorsToday - summary.stillInside),
            max: summary.visitorsToday || 1,
            valueLabel:
              summary.visitorsToday > 0
                ? `${summary.visitorsToday - summary.stillInside} / ${summary.visitorsToday}`
                : "Nobody in yet",
            color: summary.stillInside === 0 ? STATUS.good : STATUS.warning,
          },
          {
            label: "Complaints resolved",
            value: derived.totalComplaints - derived.openComplaints,
            max: derived.totalComplaints || 1,
            valueLabel:
              derived.totalComplaints > 0
                ? `${derived.totalComplaints - derived.openComplaints} / ${derived.totalComplaints}`
                : "None logged",
            color: derived.openComplaints === 0 ? STATUS.good : STATUS.warning,
          },
        ]}
        pills={[
          { icon: DoorOpen, label: "Still inside", value: summary.stillInside, onClick: () => onNavigate("visitors"), tone: summary.stillInside > 0 ? "warning" : "default" },
          { icon: MessageSquare, label: "Open complaints", value: derived.openComplaints, onClick: () => onNavigate("complaints"), tone: derived.openComplaints > 0 ? "critical" : "default" },
          { icon: PhoneIncoming, label: "Follow-ups due", value: summary.followUpsDue, onClick: () => onNavigate("phone-calls"), tone: summary.followUpsDue > 0 ? "warning" : "default" },
          { icon: FileText, label: "Certificates", value: summary.certificateTemplates, onClick: () => onNavigate("certificates") },
        ]}
        aside={
          <div className="flex w-[148px] flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
              {summary.stillInside > 0 ? <Users className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            </span>
            <div>
              <p className="text-3xl font-black leading-none tracking-tight text-[#1f1a23]">{summary.stillInside}</p>
              <p className="mt-1.5 text-[9px] font-black uppercase leading-tight tracking-wider text-ink-subtle">
                {summary.stillInside === 1 ? "Visitor in the building" : "Visitors in the building"}
              </p>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={Users} label="Visitors" value={summary.visitorsToday} sub="Today" tone="brand" trend={derived.fortnightVisitors > 0 ? derived.visitors.map((v) => v.count).slice(-12) : undefined} onClick={() => onNavigate("visitors")} delay={80} />
        <StatTile icon={MessageSquare} label="Open complaints" value={derived.openComplaints} sub={`${derived.totalComplaints} logged in total`} tone={derived.openComplaints > 0 ? "critical" : "good"} onClick={() => onNavigate("complaints")} delay={140} />
        <StatTile icon={Phone} label="Calls" value={totalCalls} sub={`${summary.callsIn} in · ${summary.callsOut} out`} onClick={() => onNavigate("phone-calls")} delay={200} />
        <StatTile icon={Mail} label="Post" value={totalPost} sub={`${summary.postalReceived} in · ${summary.postalDispatched} out`} onClick={() => onNavigate("postal")} delay={260} />
        <StatTile icon={AlertCircle} label="Follow-ups" value={summary.followUpsDue} sub="Calls to return" tone={summary.followUpsDue > 0 ? "warning" : "good"} onClick={() => onNavigate("phone-calls")} delay={320} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InsightCard
          icon={Users}
          title="Visitors through the door"
          subtitle="Last 14 days"
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["Day", "Visitors"],
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
                <Tooltip cursor={{ stroke: INK.axis, strokeWidth: 1 }} content={<VizTooltip unit=" visitors" />} />
                <Area
                  {...NO_ENTRY_ANIMATION}
                  type="monotone"
                  dataKey="count"
                  name="Visitors"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#frontDeskVisitorWash)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No visitors logged in the last fortnight" />
          )}
        </InsightCard>

        <InsightCard
          icon={MessageSquare}
          title="Complaints"
          subtitle="By state"
          delay={180}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("complaints")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Open
            </button>
          }
          table={{
            columns: ["State", "Complaints"],
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
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" complaints" />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name="Complaints" radius={[0, 4, 4, 0]} maxBarSize={22}>
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
            <EmptyChart label="No complaints have been logged" />
          )}
        </InsightCard>
      </div>

      <InsightCard
        icon={Phone}
        title="Calls and post"
        subtitle="Traffic through the desk, last 14 days"
        delay={120}
        table={{
          columns: ["Day", "Calls", "Post"],
          rows: derived.traffic.map((t) => [t.label, t.Calls, t.Post]),
        }}
      >
        {derived.hasTraffic ? (
          <>
            <ResponsiveContainer width="100%" height={232}>
              <BarChart data={derived.traffic} margin={{ top: 18, right: 12, bottom: 4, left: -18 }} barGap={3}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={14} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="Calls" fill={SERIES[0]} radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="Post" fill={SERIES[2]} radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
            <SeriesLegend
              className="mt-3"
              items={[
                { label: "Calls", color: SERIES[0], value: totalCalls },
                { label: "Post", color: SERIES[2], value: totalPost },
              ]}
            />
          </>
        ) : (
          <EmptyChart label="No calls or post logged in the last fortnight" />
        )}
      </InsightCard>
    </div>
  );
}
