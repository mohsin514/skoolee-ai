"use client";

/**
 * The platform operator's picture of the business, under the Schools PageHeader (owner console).
 *
 * The questions are how fast schools arrive, which plans they are on, whether they are actually used and who is
 * stuck on a trial. Family tuition (what parents pay their school) is each school's own money and is never shown
 * here (M109): `/api/owner/stats` no longer returns it. The page owns the one heading (PageHeader), so this renders
 * no hero and no `<h1>`; ≤ 4 KPI tiles (§4.5.8). Copy is EN UI keys translated with useUiText (R11).
 */

import { useMemo } from "react";
import { Activity, Building2, CreditCard, GraduationCap, Layers, School, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { roleLabel, type UserRole } from "@/lib/roles";
import { getPlanLimits } from "@/config/plans";
import { EmptyChart, InsightCard, RadialGauge, SeriesLegend, StatTile, VizTooltip } from "./chart-kit";
import { AXIS_TICK, INK, NO_ENTRY_ANIMATION, RAMP_BRAND, SERIES, STATUS } from "./palette";
import { Button } from "@/components/ui/button";

export interface PlatformStats {
  schoolCount: number;
  campusCount: number;
  studentCount: number;
  teacherCount: number;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  recentLogins: number;
  recentAuditActions: number;
  schoolsByStatus: Record<string, number>;
  schoolsByPlan: Record<string, number>;
  usersByRole?: Record<string, number>;
  signupsByMonth?: { month: string; count: number }[];
  loginsByDay?: { day: string; count: number }[];
  schoolBreakdown?: {
    id: string;
    name: string;
    plan: string;
    status: string;
    createdAt: string;
    students: number;
    campuses: number;
  }[];
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: STATUS.good,
  TRIAL: RAMP_BRAND[1],
  SUSPENDED: STATUS.critical,
  DELETED: STATUS.neutral,
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", TRIAL: "Trial", SUSPENDED: "Suspended", DELETED: "Deleted" };

export function PlatformOverview({
  stats,
  onOpenUsers,
}: {
  stats: PlatformStats;
  onOpenUsers?: () => void;
}) {
  const t = useUiText();
  const locale = useLocale();
  const tag = localeTag(locale);
  const number = useMemo(() => new Intl.NumberFormat(tag), [tag]);
  const compact = useMemo(() => new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 }), [tag]);

  const derived = useMemo(() => {
    const monthLabel = (iso: string) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag, { month: "short" }).format(d);
    };
    const dayLabel = (iso: string) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit" }).format(d);
    };
    const statuses = Object.entries(stats.schoolsByStatus ?? {})
      .map(([status, count]) => ({ status, label: t(STATUS_LABEL[status] ?? status), count, color: STATUS_COLOR[status] ?? STATUS.neutral }))
      .sort((a, b) => b.count - a.count);
    const plans = Object.entries(stats.schoolsByPlan ?? {})
      .map(([plan, count]) => ({ plan, label: getPlanLimits(plan).name, count }))
      .sort((a, b) => b.count - a.count);
    const roles = Object.entries(stats.usersByRole ?? {})
      .map(([role, count]) => ({ role: roleLabel(role as UserRole, locale.language), count }))
      .sort((a, b) => b.count - a.count);
    const signups = (stats.signupsByMonth ?? []).map((r) => ({ label: monthLabel(r.month), count: r.count }));
    const logins = (stats.loginsByDay ?? []).map((r) => ({ label: dayLabel(r.day), count: r.count }));
    const breakdown = [...(stats.schoolBreakdown ?? [])].sort((a, b) => b.students - a.students);
    const averageRoll = breakdown.length ? Math.round(breakdown.reduce((sum, s) => sum + s.students, 0) / breakdown.length) : 0;
    const paid = plans.filter((p) => p.plan !== "FREE").reduce((sum, p) => sum + p.count, 0);
    return {
      statuses, plans, roles, signups, logins, breakdown, averageRoll, paid,
      conversion: stats.schoolCount > 0 ? Math.round((paid / stats.schoolCount) * 100) : 0,
    };
  }, [stats, t, tag, locale.language]);

  const activeShare = stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0;
  const unit = (key: string) => ` ${t(key)}`;

  return (
    <div className="space-y-6" data-platform-overview>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={School} label={t("Schools")} value={stats.schoolCount} sub={t("{0} campuses", [number.format(stats.campusCount)])} delay={80} />
        <StatTile icon={GraduationCap} label={t("Students")} value={stats.studentCount} sub={t("Average {0} per school", [number.format(derived.averageRoll)])} tone="good" delay={140} />
        <StatTile icon={Users} label={t("Accounts")} value={stats.totalUsers} sub={t("{0}% active", [activeShare])} onClick={onOpenUsers} meter={{ value: stats.activeUsers, max: stats.totalUsers || 1, label: t("Active") }} delay={200} />
        <StatTile icon={Activity} label={t("Sign-ins")} value={stats.recentLogins} sub={t("Last 7 days")} tone={stats.recentLogins > 0 ? "good" : "warning"} trend={derived.logins.length > 1 ? derived.logins.map((l) => l.count).slice(-12) : undefined} trendColor={STATUS.good} delay={260} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={CreditCard}
          title={t("Schools by plan")}
          subtitle={t("{0} of {1} schools are on a paid plan", [number.format(derived.paid), number.format(stats.schoolCount)])}
          className="xl:col-span-2"
          delay={120}
          table={{ columns: [t("Plan"), t("Schools")], rows: derived.plans.map((p) => [p.label, p.count]) }}
        >
          {derived.plans.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, derived.plans.length * 40 + 40)}>
              <BarChart data={derived.plans} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="26%">
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={96} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={unit("schools")} />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name={t("Schools")} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22}>
                  <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={t("No schools registered yet")} />
          )}
        </InsightCard>

        <InsightCard icon={School} title={t("On a paid plan")} subtitle={t("Share of all schools")} delay={180}>
          <div className="flex min-h-[220px] items-center justify-center">
            {stats.schoolCount > 0 ? (
              <RadialGauge
                value={derived.conversion}
                label={t("On a paid plan")}
                sublabel={t("{0} of {1} schools", [number.format(derived.paid), number.format(stats.schoolCount)])}
                color={derived.conversion >= 50 ? STATUS.good : derived.conversion >= 25 ? STATUS.warning : STATUS.critical}
              />
            ) : (
              <EmptyChart label={t("No schools registered yet")} />
            )}
          </div>
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Building2}
          title={t("New schools by month")}
          subtitle={t("Sign-ups over the last year")}
          delay={120}
          table={{ columns: [t("Month"), t("Schools")], rows: derived.signups.map((r) => [r.label, r.count]) }}
        >
          {derived.signups.some((r) => r.count > 0) ? (
            <ResponsiveContainer width="100%" height={232}>
              <BarChart data={derived.signups} margin={{ top: 18, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={unit("schools")} />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name={t("Schools")} fill={RAMP_BRAND[2]} radius={[4, 4, 0, 0]} maxBarSize={22}>
                  <LabelList dataKey="count" position="top" offset={6} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={t("No sign-ups in the last twelve months")} />
          )}
        </InsightCard>

        <InsightCard
          icon={School}
          title={t("Schools by status")}
          subtitle={t("Where each school's subscription stands")}
          delay={180}
          table={{ columns: [t("Status"), t("Schools")], rows: derived.statuses.map((s) => [s.label, s.count]) }}
        >
          {derived.statuses.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={232}>
                <BarChart data={derived.statuses} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="26%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={80} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={unit("schools")} />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name={t("Schools")} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {derived.statuses.map((s) => (
                      <Cell key={s.status} fill={s.color} />
                    ))}
                    <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-3" items={derived.statuses.map((s) => ({ label: s.label, color: s.color, value: s.count }))} />
            </>
          ) : (
            <EmptyChart label={t("No schools registered yet")} />
          )}
        </InsightCard>

        <InsightCard
          icon={Activity}
          title={t("Sign-in activity")}
          subtitle={t("Sessions opened, last 14 days")}
          delay={240}
          table={{ columns: [t("Day"), t("Sessions")], rows: derived.logins.map((l) => [l.label, l.count]) }}
        >
          {derived.logins.length > 1 ? (
            <ResponsiveContainer width="100%" height={232}>
              <AreaChart data={derived.logins} margin={{ top: 16, right: 12, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="platformLoginWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STATUS.good} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={STATUS.good} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={14} />
                <YAxis domain={[0, (dataMax: number) => Math.ceil((dataMax || 1) * 1.1)]} tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ stroke: INK.axis, strokeWidth: 1 }} content={<VizTooltip unit={unit("sessions")} />} />
                <Area
                  {...NO_ENTRY_ANIMATION}
                  type="monotone"
                  dataKey="count"
                  name={t("Sessions")}
                  stroke={STATUS.good}
                  strokeWidth={2}
                  fill="url(#platformLoginWash)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={t("Two or more days of sign-ins are needed to draw a trend")} />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Layers}
          title={t("Roll by school")}
          subtitle={t("Students registered at each school")}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: [t("School"), t("Students"), t("Campuses"), t("Plan"), t("Status")],
            rows: derived.breakdown.map((s) => [s.name, s.students, s.campuses, getPlanLimits(s.plan).name, t(STATUS_LABEL[s.status] ?? s.status)]),
          }}
        >
          {derived.breakdown.some((s) => s.students > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, Math.min(derived.breakdown.length, 12) * 34 + 40)}>
                <BarChart data={derived.breakdown.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 46, bottom: 4, left: 4 }} barCategoryGap="24%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={130}
                    /* School names run long and recharts wraps a category tick onto three lines rather than shortening
                       it. The full name is still in the tooltip and the table view. */
                    tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)}
                  />
                  <ReferenceLine x={derived.averageRoll} stroke={INK.axis} strokeWidth={1} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={unit("students")} />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="students" name={t("Students")} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList dataKey="students" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 text-2xs font-medium text-ink-subtle">
                {t("The vertical rule marks the platform average of {0} students per school.", [number.format(derived.averageRoll)])}
                {derived.breakdown.length > 12 ? <> {t("Showing the twelve largest of {0}.", [number.format(derived.breakdown.length)])}</> : null}
              </p>
            </>
          ) : (
            <EmptyChart label={t("No students enrolled anywhere yet")} />
          )}
        </InsightCard>

        <InsightCard
          icon={Users}
          title={t("Accounts by role")}
          subtitle={t("{0} admin actions in the last 30 days", [compact.format(stats.recentAuditActions)])}
          delay={180}
          actions={onOpenUsers ? <Button variant="link" size="sm" type="button" onClick={onOpenUsers}>{t("Open tenant users")}</Button> : undefined}
          table={{ columns: [t("Role"), t("Accounts")], rows: derived.roles.map((r) => [r.role, r.count]) }}
        >
          {derived.roles.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(232, derived.roles.length * 30 + 30)}>
              <BarChart data={derived.roles} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="24%">
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="role" tick={AXIS_TICK} axisLine={false} tickLine={false} width={100} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={unit("accounts")} />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name={t("Accounts")} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={t("No accounts yet")} />
          )}
        </InsightCard>
      </div>
    </div>
  );
}
