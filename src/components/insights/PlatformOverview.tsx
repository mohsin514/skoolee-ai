"use client";

/**
 * The platform owner's opening screen.
 *
 * An owner is running a business, not a school: the questions are how fast
 * tenants are arriving, what they are paying, which of them are actually being
 * used, and whether anyone is stuck on a trial. Everything here answers one of
 * those, from `/api/owner/stats`.
 */

import { useMemo, type ReactNode } from "react";
import {
  Activity,
  Building2,
  CreditCard,
  GraduationCap,
  Layers,
  Receipt,
  School,
  TrendingUp,
  UserCog,
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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CommandHero } from "./CommandHero";
import { EmptyChart, InsightCard, RadialGauge, SeriesLegend, StatTile, VizTooltip } from "./chart-kit";
import { AXIS_TICK, INK, RAMP_BRAND, SERIES, STATUS, compact, fromMinor } from "./palette";

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
  totalRevenue: number;
  totalPaymentCount: number;
  pendingInvoices: number;
  schoolsByStatus: Record<string, number>;
  schoolsByPlan: Record<string, number>;
  usersByRole?: Record<string, number>;
  invoicesByStatus?: { status: string; count: number; amount: number }[];
  signupsByMonth?: { month: string; count: number }[];
  revenueByMonth?: { month: string; amount: number; count: number }[];
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

const ROLE_LABEL: Record<string, string> = {
  APP_OWNER: "Platform owner",
  SUPER_ADMIN: "School owner",
  CAMPUS_ADMIN: "Campus admin",
  ADMIN: "Admin",
  PRINCIPAL: "Principal",
  TEACHER: "Teacher",
  ACCOUNTANT: "Accountant",
  LIBRARIAN: "Librarian",
  RECEPTIONIST: "Receptionist",
  STUDENT: "Student",
  PARENT: "Parent",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: STATUS.good,
  TRIAL: RAMP_BRAND[1],
  SUSPENDED: STATUS.critical,
  DELETED: STATUS.neutral,
};

const INVOICE_COLOR: Record<string, string> = {
  PAID: STATUS.good,
  PARTIAL: STATUS.warning,
  PENDING: RAMP_BRAND[1],
  OVERDUE: STATUS.critical,
  CANCELLED: STATUS.neutral,
};

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PlatformOverview({
  stats,
  actions,
  onOpenBilling,
  onOpenUsers,
}: {
  stats: PlatformStats;
  actions?: ReactNode;
  onOpenBilling?: () => void;
  onOpenUsers?: () => void;
}) {
  const derived = useMemo(() => {
    const statuses = Object.entries(stats.schoolsByStatus ?? {})
      .map(([status, count]) => ({ status, count, color: STATUS_COLOR[status] ?? STATUS.neutral }))
      .sort((a, b) => b.count - a.count);

    const plans = Object.entries(stats.schoolsByPlan ?? {})
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count);

    const roles = Object.entries(stats.usersByRole ?? {})
      .map(([role, count]) => ({ role: ROLE_LABEL[role] ?? role, count }))
      .sort((a, b) => b.count - a.count);

    const signups = (stats.signupsByMonth ?? []).map((r) => ({
      label: monthLabel(r.month),
      count: r.count,
    }));

    const revenue = (stats.revenueByMonth ?? []).map((r) => ({
      label: monthLabel(r.month),
      amount: fromMinor(r.amount),
      payments: r.count,
    }));

    const logins = (stats.loginsByDay ?? []).map((r) => ({ label: dayLabel(r.day), count: r.count }));

    const invoices = (stats.invoicesByStatus ?? [])
      .map((r) => ({
        status: r.status,
        label: r.status.charAt(0) + r.status.slice(1).toLowerCase(),
        count: r.count,
        amount: fromMinor(r.amount),
        color: INVOICE_COLOR[r.status] ?? STATUS.neutral,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

    const breakdown = [...(stats.schoolBreakdown ?? [])].sort((a, b) => b.students - a.students);
    const averageRoll = breakdown.length
      ? Math.round(breakdown.reduce((sum, s) => sum + s.students, 0) / breakdown.length)
      : 0;

    const paying = (stats.schoolsByStatus?.ACTIVE ?? 0);
    const trialling = (stats.schoolsByStatus?.TRIAL ?? 0);

    return {
      statuses,
      plans,
      roles,
      signups,
      revenue,
      logins,
      invoices,
      breakdown,
      averageRoll,
      paying,
      trialling,
      conversion: stats.schoolCount > 0 ? Math.round((paying / stats.schoolCount) * 100) : 0,
    };
  }, [stats]);

  const revenueMajor = fromMinor(stats.totalRevenue);
  const activeShare = stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0;

  return (
    <div className="space-y-6">
      <CommandHero
        eyebrow="SkooleeAI platform"
        title="Platform command centre"
        heroValue={compact(stats.schoolCount)}
        heroLabel="Schools on the platform"
        heroCaption={
          stats.schoolCount > 0
            ? `${stats.campusCount.toLocaleString()} campuses and ${compact(stats.totalUsers)} accounts, serving ${compact(stats.studentCount)} students. Average roll ${derived.averageRoll.toLocaleString()} per school.`
            : "No schools have registered yet."
        }
        heroAccent={<TrendingUp className="mb-2 h-7 w-7 text-emerald-400" aria-hidden />}
        meters={[
          {
            label: "On a paid plan",
            value: derived.paying,
            max: stats.schoolCount || 1,
            valueLabel: `${derived.paying} / ${stats.schoolCount}`,
            color: derived.conversion >= 50 ? STATUS.good : STATUS.warning,
          },
          {
            label: "Accounts active",
            value: stats.activeUsers,
            max: stats.totalUsers || 1,
            valueLabel: `${compact(stats.activeUsers)} / ${compact(stats.totalUsers)}`,
          },
          {
            label: "Signed in, 7 days",
            value: stats.recentLogins,
            max: stats.totalUsers || 1,
            valueLabel: compact(stats.recentLogins),
            color: "#c795f0",
          },
        ]}
        pills={[
          { icon: Receipt, label: "Payments", value: compact(stats.totalPaymentCount), onClick: onOpenBilling },
          { icon: CreditCard, label: "Unpaid invoices", value: compact(stats.pendingInvoices), onClick: onOpenBilling, tone: stats.pendingInvoices > 0 ? "warning" : "default" },
          { icon: Activity, label: "Admin actions (30d)", value: compact(stats.recentAuditActions) },
          { icon: UserCog, label: "Trialling", value: derived.trialling, tone: derived.trialling > 0 ? "warning" : "default" },
        ]}
        actions={actions}
        aside={
          <RadialGauge
            value={derived.conversion}
            label="On a paid plan"
            sublabel={`${derived.paying} of ${stats.schoolCount} schools`}
            color={derived.conversion >= 50 ? STATUS.good : derived.conversion >= 25 ? STATUS.warning : STATUS.critical}
          />
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={School} label="Schools" value={stats.schoolCount} sub={`${stats.campusCount} campuses`} delay={80} />
        <StatTile icon={GraduationCap} label="Students" value={stats.studentCount} sub={`Average ${derived.averageRoll} per school`} tone="good" delay={140} />
        <StatTile icon={Users} label="Accounts" value={stats.totalUsers} sub={`${activeShare}% active`} onClick={onOpenUsers} meter={{ value: stats.activeUsers, max: stats.totalUsers || 1, label: "Active" }} delay={200} />
        <StatTile icon={Receipt} label="Revenue" value={`PKR ${compact(revenueMajor)}`} sub={`${compact(stats.totalPaymentCount)} payments`} onClick={onOpenBilling} delay={260} />
        <StatTile icon={Activity} label="Logins" value={stats.recentLogins} sub="Last 7 days" tone={stats.recentLogins > 0 ? "good" : "warning"} trend={derived.logins.length > 1 ? derived.logins.map((l) => l.count).slice(-12) : undefined} trendColor={STATUS.good} delay={320} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title="Revenue by month"
          subtitle="Payments received, in PKR"
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["Month", "PKR", "Payments"],
            rows: derived.revenue.map((r) => [r.label, r.amount, r.payments]),
          }}
        >
          {derived.revenue.some((r) => r.amount > 0) ? (
            <ResponsiveContainer width="100%" height={256}>
              <BarChart data={derived.revenue} margin={{ top: 18, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => compact(v)} />
                <Tooltip
                  cursor={{ fill: "rgba(129,39,207,0.06)" }}
                  content={<VizTooltip format={(v, name) => (name === "Revenue" ? `PKR ${compact(v)}` : v.toLocaleString())} />}
                />
                <Bar dataKey="amount" name="Revenue" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No payments recorded in the last twelve months" />
          )}
        </InsightCard>

        <InsightCard
          icon={School}
          title="Schools by status"
          subtitle="Where each tenant sits"
          delay={180}
          table={{ columns: ["Status", "Schools"], rows: derived.statuses.map((s) => [s.status, s.count]) }}
        >
          {derived.statuses.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={derived.statuses} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="26%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="status" tick={AXIS_TICK} axisLine={false} tickLine={false} width={80} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" schools" />} />
                  <Bar dataKey="count" name="Schools" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {derived.statuses.map((s) => (
                      <Cell key={s.status} fill={s.color} />
                    ))}
                    <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-3" items={derived.statuses.map((s) => ({ label: s.status, color: s.color, value: s.count }))} />
            </>
          ) : (
            <EmptyChart label="No schools registered yet" />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Building2}
          title="New schools by month"
          subtitle="Signups over the last year"
          delay={120}
          table={{ columns: ["Month", "Schools"], rows: derived.signups.map((r) => [r.label, r.count]) }}
        >
          {derived.signups.some((r) => r.count > 0) ? (
            <ResponsiveContainer width="100%" height={232}>
              <BarChart data={derived.signups} margin={{ top: 18, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" schools" />} />
                <Bar dataKey="count" name="Schools" fill={RAMP_BRAND[2]} radius={[4, 4, 0, 0]} maxBarSize={22}>
                  <LabelList dataKey="count" position="top" offset={6} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No signups in the last twelve months" />
          )}
        </InsightCard>

        <InsightCard
          icon={Activity}
          title="Sign-in activity"
          subtitle="Sessions opened, last 14 days"
          delay={180}
          table={{ columns: ["Day", "Sessions"], rows: derived.logins.map((l) => [l.label, l.count]) }}
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
                <YAxis
                  domain={[0, (dataMax: number) => Math.ceil((dataMax || 1) * 1.1)]}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip cursor={{ stroke: INK.axis, strokeWidth: 1 }} content={<VizTooltip unit=" sessions" />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Sessions"
                  stroke={STATUS.good}
                  strokeWidth={2}
                  fill="url(#platformLoginWash)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Two or more days of sign-ins are needed to draw a trend" />
          )}
        </InsightCard>

        <InsightCard
          icon={Users}
          title="Accounts by role"
          subtitle="Signed-up accounts"
          delay={240}
          actions={
            onOpenUsers ? (
              <button
                type="button"
                onClick={onOpenUsers}
                className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
              >
                Manage
              </button>
            ) : undefined
          }
          table={{ columns: ["Role", "Accounts"], rows: derived.roles.map((r) => [r.role, r.count]) }}
        >
          {derived.roles.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(232, derived.roles.length * 30 + 30)}>
              <BarChart data={derived.roles} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="24%">
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="role" tick={AXIS_TICK} axisLine={false} tickLine={false} width={100} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" accounts" />} />
                <Bar dataKey="count" name="Accounts" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No accounts yet" />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Layers}
          title="Roll by school"
          subtitle="Students registered under each tenant"
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["School", "Students", "Campuses", "Plan", "Status"],
            rows: derived.breakdown.map((s) => [s.name, s.students, s.campuses, s.plan, s.status]),
          }}
        >
          {derived.breakdown.some((s) => s.students > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, Math.min(derived.breakdown.length, 12) * 34 + 40)}>
                <BarChart
                  data={derived.breakdown.slice(0, 12)}
                  layout="vertical"
                  margin={{ top: 4, right: 46, bottom: 4, left: 4 }}
                  barCategoryGap="24%"
                >
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={130}
                    /* School names run long and recharts wraps a category tick
                       onto three lines rather than shortening it. The full name
                       is still in the tooltip and the table view. */
                    tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)}
                  />
                  <ReferenceLine x={derived.averageRoll} stroke={INK.axis} strokeWidth={1} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" students" />} />
                  <Bar dataKey="students" name="Students" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList dataKey="students" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 text-[10px] font-bold text-ink-subtle">
                The vertical rule marks the platform average of {derived.averageRoll.toLocaleString()} students per school
                {derived.breakdown.length > 12 ? `. Showing the twelve largest of ${derived.breakdown.length}.` : "."}
              </p>
            </>
          ) : (
            <EmptyChart label="No students enrolled anywhere yet" />
          )}
        </InsightCard>

        <InsightCard
          icon={Receipt}
          title="Invoices by status"
          subtitle="Across every school"
          delay={180}
          table={{
            columns: ["Status", "Invoices", "Amount"],
            rows: derived.invoices.map((r) => [r.label, r.count, Math.round(r.amount)]),
          }}
        >
          {derived.invoices.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={232}>
                <BarChart data={derived.invoices} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="26%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={74} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" invoices" />} />
                  <Bar dataKey="count" name="Invoices" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {derived.invoices.map((r) => (
                      <Cell key={r.status} fill={r.color} />
                    ))}
                    <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-3" items={derived.invoices.map((r) => ({ label: r.label, color: r.color, value: r.count }))} />
            </>
          ) : (
            <EmptyChart label="No invoices raised anywhere yet" />
          )}
        </InsightCard>
      </div>
    </div>
  );
}
