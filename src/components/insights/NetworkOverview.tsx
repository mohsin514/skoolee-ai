"use client";

/**
 * The school-group owner's opening screen.
 *
 * An owner's job is comparison — which campus is carrying the group, which one
 * has a leadership hole, where the fee book is leaking — so almost everything
 * here is one campus against another on a shared scale, and the leadership
 * gaps are stated in words rather than left to a colour.
 */

import { useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Receipt,
  School,
  Sparkles,
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
import { getPlanLimits } from "@/config/plans";
import { CommandHero } from "./CommandHero";
import { EmptyChart, InsightCard, RadialGauge, SeriesLegend, StatTile, VizTooltip } from "./chart-kit";
import { AXIS_TICK, GRADE_HIGH, GRADE_LOW, INK, NO_ENTRY_ANIMATION, RAMP_BRAND, SERIES, STATUS, compact, money } from "./palette";
import {
  campusFeeStack,
  campusRows,
  enrolmentTrend,
  FEE_STACK_COLOR,
  FEE_STACK_KEYS,
  gradeDistribution,
  latestReportCards,
  networkStudents,
  ratio,
} from "./metrics";

interface NetworkOverviewProps {
  data: any;
  onSelectCampus: (campus: any) => void;
  onOpenBilling: () => void;
  onOpenFees: () => void;
  /** Scrolls to the AI panel already on the page. */
  onOpenAI?: () => void;
  /** Group-level buttons, rendered in the hero. */
  actions?: ReactNode;
}

export function NetworkOverview({ data, onSelectCampus, onOpenBilling, onOpenFees, onOpenAI, actions }: NetworkOverviewProps) {
  const campuses: any[] = data?.campuses ?? [];
  const summary = data?.networkSummary ?? {};

  const derived = useMemo(() => {
    const rows = campusRows(campuses);
    const students = networkStudents(campuses);
    const byStudents = [...rows].sort((a, b) => b.students - a.students);
    const billed = rows.reduce((sum, r) => sum + r.billed, 0);
    const collected = rows.reduce((sum, r) => sum + r.collected, 0);
    const aiRows = [...rows].filter((r) => r.aiRuns > 0).sort((a, b) => b.aiRuns - a.aiRuns);
    const gaps = rows.filter((r) => !r.hasAdmin || !r.hasPrincipal);

    return {
      rows,
      byStudents,
      averageRoll: rows.length ? Math.round(rows.reduce((sum, r) => sum + r.students, 0) / rows.length) : 0,
      billed,
      collected,
      collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
      feeStack: campusFeeStack(campuses),
      enrolment: enrolmentTrend(students, 12),
      grades: gradeDistribution(latestReportCards(students)),
      aiRows,
      gaps,
      coverage: [...rows].sort(
        (a, b) => Number(a.hasAdmin) + Number(a.hasPrincipal) - (Number(b.hasAdmin) + Number(b.hasPrincipal)),
      ),
      leaderboard: [...rows].sort((a, b) => (b.average ?? -1) - (a.average ?? -1)),
    };
  }, [data]);

  const creditsUsed = data?.billing?.aiCreditsUsed ?? 0;
  const creditsLimit = data?.billing?.aiCreditsLimit ?? 0;
  // Same source of truth as the billing banner, so the two never disagree.
  const planName = getPlanLimits(data?.billing?.plan || "FREE").name;

  return (
    <div className="space-y-6">
      <CommandHero
        eyebrow={`${data?.schoolName ?? "School"} group`}
        title="Network command centre"
        heroValue={compact(summary.totalStudents ?? 0)}
        heroLabel="Students across the group"
        heroCaption={
          campuses.length > 0
            ? `${campuses.length} ${campuses.length === 1 ? "campus" : "campuses"}, ${(summary.totalClasses ?? 0).toLocaleString()} classes and ${(summary.totalStaff ?? 0).toLocaleString()} staff accounts. Average roll ${derived.averageRoll.toLocaleString()} per campus.`
            : "No campuses yet — create the first one to start assigning admins and principals."
        }
        heroAccent={<TrendingUp className="mb-2 h-7 w-7 text-emerald-400" aria-hidden />}
        meters={[
          {
            label: "Campuses with an admin",
            value: campuses.length - (summary.adminGaps ?? 0),
            max: campuses.length || 1,
            valueLabel: `${campuses.length - (summary.adminGaps ?? 0)} / ${campuses.length}`,
            color: (summary.adminGaps ?? 0) === 0 ? STATUS.good : STATUS.warning,
          },
          {
            label: "Campuses with a principal",
            value: campuses.length - (summary.principalGaps ?? 0),
            max: campuses.length || 1,
            valueLabel: `${campuses.length - (summary.principalGaps ?? 0)} / ${campuses.length}`,
            color: (summary.principalGaps ?? 0) === 0 ? STATUS.good : STATUS.warning,
          },
          {
            label: "AI credits used",
            value: creditsUsed,
            max: creditsLimit || 1,
            valueLabel: `${compact(creditsUsed)} / ${compact(creditsLimit)}`,
            color: creditsLimit > 0 && creditsUsed / creditsLimit > 0.85 ? STATUS.critical : "#c795f0",
          },
        ]}
        pills={[
          { icon: CreditCard, label: planName, value: data?.billing?.status ?? "TRIAL", onClick: onOpenBilling, tone: data?.billing?.status === "SUSPENDED" ? "critical" : "default" },
          { icon: Sparkles, label: "AI runs", value: summary.totalAiRuns ?? 0, onClick: onOpenAI },
          { icon: Receipt, label: "Unpaid invoices", value: (summary.pendingInvoices ?? 0) + (summary.partialInvoices ?? 0), onClick: onOpenFees, tone: (summary.pendingInvoices ?? 0) > 0 ? "warning" : "default" },
          { icon: UserCog, label: "Pending invites", value: summary.pendingInvites ?? 0, tone: (summary.pendingInvites ?? 0) > 0 ? "warning" : "default" },
        ]}
        actions={actions}
        aside={
          derived.billed > 0 ? (
            <RadialGauge
              value={derived.collectionRate}
              label="Fees collected"
              sublabel={`${money(derived.collected)} of ${money(derived.billed)}`}
              color={derived.collectionRate >= 70 ? STATUS.good : derived.collectionRate >= 40 ? STATUS.warning : STATUS.critical}
            />
          ) : (
            <div className="flex h-[148px] w-[148px] flex-col items-center justify-center text-center">
              <Receipt className="h-7 w-7 text-[#cfc2d6]" aria-hidden />
              <p className="mt-2 px-2 text-[10px] font-bold leading-tight text-ink-subtle">No invoices raised yet</p>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatTile
          icon={CreditCard}
          label="Plan"
          value={planName}
          sub={data?.billing?.status ?? "TRIAL"}
          tone={data?.billing?.status === "SUSPENDED" ? "critical" : "brand"}
          meter={creditsLimit > 0 ? { value: creditsUsed, max: creditsLimit, label: "AI credits" } : undefined}
          onClick={onOpenBilling}
          delay={80}
        />
        <StatTile icon={Building2} label="Campuses" value={campuses.length} sub={`${derived.gaps.length} needing leadership`} tone={derived.gaps.length > 0 ? "warning" : "brand"} delay={140} />
        <StatTile icon={GraduationCap} label="Students" value={summary.totalStudents ?? 0} sub={`Average ${derived.averageRoll} per campus`} tone="good" delay={200} />
        <StatTile icon={Users} label="Teachers" value={summary.totalTeachers ?? 0} sub={`${ratio(summary.totalStudents ?? 0, summary.totalTeachers ?? 0)} students`} delay={260} />
        <StatTile icon={School} label="Classes" value={summary.totalClasses ?? 0} sub={`${(summary.totalSubjects ?? 0).toLocaleString()} subjects`} delay={320} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Building2}
          title="Roll by campus"
          subtitle="Students on the register at each campus"
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["Campus", "Students", "Classes", "Teachers"],
            rows: derived.byStudents.map((c) => [c.name, c.students, c.classes, c.teachers]),
          }}
        >
          {derived.byStudents.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, derived.byStudents.length * 36 + 40)}>
                <BarChart data={derived.byStudents} layout="vertical" margin={{ top: 4, right: 46, bottom: 4, left: 4 }} barCategoryGap="24%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={104} />
                  <ReferenceLine x={derived.averageRoll} stroke={INK.axis} strokeWidth={1} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" students" />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="students" name="Students" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList dataKey="students" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 text-[10px] font-bold text-ink-subtle">
                The vertical rule marks the group average of {derived.averageRoll.toLocaleString()} students per campus.
              </p>
            </>
          ) : (
            <EmptyChart label="No campuses yet" />
          )}
        </InsightCard>

        <InsightCard
          icon={AlertTriangle}
          title="Leadership coverage"
          subtitle="Who is in post at each campus"
          delay={180}
          table={{
            columns: ["Campus", "Admin", "Principal"],
            rows: derived.coverage.map((c) => [c.name, c.hasAdmin ? "In post" : "Vacant", c.hasPrincipal ? "In post" : "Vacant"]),
          }}
        >
          {derived.rows.length > 0 ? (
            <ul className="max-h-[300px] space-y-2 overflow-y-auto custom-scrollbar pr-1">
              {derived.coverage.map((campus, i) => (
                <li key={campus.id} className="sk-rise" style={{ animationDelay: `${i * 50}ms` }}>
                  <button
                    type="button"
                    onClick={() => {
                      const full = campuses.find((c: any) => c.id === campus.id);
                      if (full) onSelectCampus(full);
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[#cfc2d6]/25 bg-gradient-to-br from-[#fbf0fe]/45 via-white to-white px-4 py-3 text-left transition-all hover:border-[#8127cf]/25 hover:from-[#fbf0fe] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/15"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-[#1f1a23]">{campus.name}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle">
                        {campus.city || "—"} · {campus.teachers} teachers
                      </p>
                    </div>
                    {/* Icon + word, never colour alone. */}
                    <div className="flex shrink-0 gap-1.5">
                      <CoverageChip label="Admin" filled={campus.hasAdmin} />
                      <CoverageChip label="Head" filled={campus.hasPrincipal} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyChart label="No campuses yet" />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Receipt}
          title="Fee book by campus"
          subtitle="Invoiced amount, split by status"
          className="xl:col-span-2"
          delay={120}
          actions={
            <button
              type="button"
              onClick={onOpenFees}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Open fees
            </button>
          }
          table={{
            columns: ["Campus", "Paid", "Part paid", "Pending", "Overdue"],
            rows: derived.feeStack.map((c) => [
              c.name,
              Math.round(c.Paid),
              Math.round(c["Part paid"]),
              Math.round(c.Pending),
              Math.round(c.Overdue),
            ]),
          }}
        >
          {derived.feeStack.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, derived.feeStack.length * 44 + 40)}>
                <BarChart data={derived.feeStack} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="28%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => compact(v)} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={104} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip format={(v) => money(v)} />} />
                  {FEE_STACK_KEYS.map((key, i) => (
                    <Bar
                      {...NO_ENTRY_ANIMATION}
                      key={key}
                      dataKey={key}
                      name={key}
                      stackId="fees"
                      fill={FEE_STACK_COLOR[key]}
                      // 2px of surface between segments does the separating.
                      stroke={INK.surface}
                      strokeWidth={2}
                      maxBarSize={26}
                      radius={i === FEE_STACK_KEYS.length - 1 ? [0, 4, 4, 0] : undefined}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend
                className="mt-3"
                items={FEE_STACK_KEYS.map((key) => ({ label: key, color: FEE_STACK_COLOR[key] }))}
              />
            </>
          ) : (
            <EmptyChart label="No invoices raised anywhere in the group yet" />
          )}
        </InsightCard>

        <InsightCard
          icon={Sparkles}
          title="AI usage by campus"
          subtitle="Runs recorded to date"
          delay={180}
          table={{ columns: ["Campus", "Runs"], rows: derived.aiRows.map((c) => [c.name, c.aiRuns]) }}
        >
          {derived.aiRows.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, derived.aiRows.length * 34 + 40)}>
              <BarChart data={derived.aiRows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap="26%">
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={84} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" runs" />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="aiRuns" name="Runs" fill={RAMP_BRAND[2]} radius={[0, 4, 4, 0]} maxBarSize={20}>
                  <LabelList dataKey="aiRuns" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No AI runs recorded yet" />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title="Group roll growth"
          subtitle="Students on the register, month by month"
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["Month", "Joined", "On register"],
            rows: derived.enrolment.map((m) => [m.label, m.joined, m.total]),
          }}
        >
          {derived.enrolment.length > 1 ? (
            <ResponsiveContainer width="100%" height={252}>
              <AreaChart data={derived.enrolment} margin={{ top: 16, right: 16, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="networkRollWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={12} />
                {/* Headroom, so a flat or still-climbing line is not drawn
                    along the very top edge of the plot. */}
                <YAxis
                  domain={[0, (dataMax: number) => Math.ceil((dataMax || 1) * 1.1)]}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip cursor={{ stroke: INK.axis, strokeWidth: 1 }} content={<VizTooltip unit=" students" />} />
                <Area
                  {...NO_ENTRY_ANIMATION}
                  type="monotone"
                  dataKey="total"
                  name="On register"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#networkRollWash)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Roll growth appears once students have been admitted over more than one month" />
          )}
        </InsightCard>

        <InsightCard
          icon={GraduationCap}
          title="Grades across the group"
          subtitle="Latest report card per student"
          delay={180}
          table={{ columns: ["Grade", "Students"], rows: derived.grades.map((g) => [g.grade, g.count]) }}
        >
          {derived.grades.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={252}>
                <BarChart data={derived.grades} margin={{ top: 18, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="grade" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" students" />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name="Students" radius={[4, 4, 0, 0]} maxBarSize={26}>
                    {derived.grades.map((g) => (
                      <Cell key={g.grade} fill={g.color} />
                    ))}
                    <LabelList dataKey="count" position="top" offset={6} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend
                className="mt-3"
                items={[
                  { label: "Higher grades", color: GRADE_HIGH[1] },
                  { label: "Lower grades", color: GRADE_LOW[1] },
                ]}
              />
            </>
          ) : (
            <EmptyChart label="No graded report cards anywhere in the group yet" />
          )}
        </InsightCard>
      </div>

      {derived.rows.length > 0 ? (
        <InsightCard icon={School} title="Campus scorecard" subtitle="Every campus, side by side · reports shown as cards / exams" delay={120}>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#cfc2d6]/30">
                  {["Campus", "Students", "Classes", "Teachers", "Average", "Collected", "Reports", "Messages", "AI runs", ""].map((h, i) => (
                    <th
                      key={h || i}
                      scope="col"
                      className={`px-3 py-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle ${i > 0 && i < 9 ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {derived.leaderboard.map((campus) => (
                  <tr key={campus.id} className="border-b border-[#cfc2d6]/20 transition-colors hover:bg-[#fbf0fe]/40">
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-black text-[#1f1a23]">{campus.name}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle">{campus.city || "—"}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-[#1f1a23] [font-variant-numeric:tabular-nums]">
                      {campus.students.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-ink-muted [font-variant-numeric:tabular-nums]">
                      {campus.classes.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-ink-muted [font-variant-numeric:tabular-nums]">
                      {campus.teachers.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-black [font-variant-numeric:tabular-nums]">
                      {campus.average === null ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <span style={{ color: campus.average >= 40 ? "#0f7a55" : "#a81231" }}>{campus.average}%</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-ink-muted [font-variant-numeric:tabular-nums]">
                      {campus.billed > 0 ? `${campus.collectionRate}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-ink-muted [font-variant-numeric:tabular-nums]">
                      {campus.reportCards.toLocaleString()}
                      <span className="text-ink-faint"> / {campus.exams.toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-ink-muted [font-variant-numeric:tabular-nums]">
                      {campus.messagesSent.toLocaleString()}
                      {campus.messageIssues > 0 ? (
                        <span style={{ color: "#a81231" }}> · {campus.messageIssues} failed</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-ink-muted [font-variant-numeric:tabular-nums]">
                      {campus.aiRuns.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const full = campuses.find((c: any) => c.id === campus.id);
                          if (full) onSelectCampus(full);
                        }}
                        className="cursor-pointer rounded-xl bg-[#fbf0fe] px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InsightCard>
      ) : null}
    </div>
  );
}

function CoverageChip({ label, filled }: { label: string; filled: boolean }) {
  const Icon = filled ? CheckCircle2 : AlertTriangle;
  return (
    <span
      className="flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider"
      style={{
        background: filled ? `${STATUS.good}1f` : `${STATUS.warning}26`,
        color: filled ? "#0f7a55" : "#8a6100",
      }}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
      <span className="sr-only">{filled ? " in post" : " vacant"}</span>
    </span>
  );
}
