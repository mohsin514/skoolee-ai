"use client";

/**
 * The campus admin's opening screen.
 *
 * An admin runs the campus day to day, so this leads with the register and the
 * things that go wrong when nobody is watching them: who is in today, how full
 * each class is, what the fee book looks like, and which report cards have
 * stalled on their way to a parent.
 */

import { useMemo } from "react";
import {
  Activity,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  Layers,
  Receipt,
  School,
  Sparkles,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CommandHero } from "./CommandHero";
import { EmptyChart, InsightCard, RadialGauge, SeriesLegend, SingleFigure, StatTile, VizTooltip } from "./chart-kit";
import { AXIS_TICK, INK, RAMP_BRAND, SERIES, STATUS, compact, money } from "./palette";
import {
  attendanceRate,
  attendanceSplit,
  attendanceTrend,
  classStrength,
  collectionRate,
  enrolmentTrend,
  feeBuckets,
  gradeDistribution,
  isOnRoll,
  latestReportCards,
  reportPipeline,
  staffMix,
  ratio,
} from "./metrics";

interface CampusOverviewProps {
  data: any;
  onNavigate: (view: string) => void;
  onAddStudent?: () => void;
  onAddClass?: () => void;
}

export function CampusOverview({ data, onNavigate, onAddStudent, onAddClass }: CampusOverviewProps) {
  const students: any[] = data?.students ?? [];
  const classes: any[] = data?.classes ?? [];

  const derived = useMemo(() => {
    const onRoll = students.filter(isOnRoll);
    const strengths = classStrength(classes);
    const buckets = feeBuckets(data?.invoiceSummary?.byStatus ?? []);
    const enrolment = enrolmentTrend(students, 12);
    const staff = staffMix([
      ...(data?.teachers ?? []),
      ...(data?.operationsStaff ?? []),
      ...(data?.campusAdmins ?? []),
      ...(data?.principal ? [data.principal] : []),
    ].map((u: any) => ({ ...u, role: u.role ?? "TEACHER" })));

    const withTeacher = classes.filter((k: any) => k.classTeacher).length;
    const subjectsWithTeacher = classes.reduce(
      (acc: { total: number; assigned: number }, k: any) => {
        const subjects = k.subjects ?? [];
        acc.total += subjects.length;
        acc.assigned += subjects.filter((s: any) => s.teacher).length;
        return acc;
      },
      { total: 0, assigned: 0 },
    );

    return {
      onRoll,
      strengths,
      averageClassSize: strengths.length ? Math.round(strengths.reduce((a, c) => a + c.students, 0) / strengths.length) : 0,
      unplaced: onRoll.filter((s: any) => !s.class).length,
      buckets,
      collection: collectionRate(buckets),
      enrolment,
      trend: attendanceTrend(students, 21),
      split: attendanceSplit(data?.attendanceSummary),
      todayRate: attendanceRate(data?.attendanceSummary),
      pipeline: reportPipeline(data?.recentReportCards ?? []),
      grades: gradeDistribution(latestReportCards(students)),
      staff,
      withTeacher,
      subjectsWithTeacher,
    };
  }, [data]);

  const markedToday =
    (data?.attendanceSummary?.present ?? 0) + (data?.attendanceSummary?.absent ?? 0) + (data?.attendanceSummary?.leave ?? 0);
  const attendanceSeries = derived.trend.map((d) => d.rate);
  const teacherCount = (data?.teachers ?? []).length;
  const staffTotal = derived.staff.reduce((a, r) => a + r.count, 0);

  return (
    <div className="space-y-6">
      <CommandHero
        eyebrow={`${data?.campusName ?? "Campus"}${data?.campusCity ? ` · ${data.campusCity}` : ""}`}
        title="Campus command centre"
        heroValue={compact(data?.studentCount ?? derived.onRoll.length)}
        heroLabel="Students on roll"
        heroCaption={
          derived.strengths.length > 0
            ? `Across ${derived.strengths.length} ${derived.strengths.length === 1 ? "class" : "classes"}, averaging ${derived.averageClassSize} per class.${derived.unplaced > 0 ? ` ${derived.unplaced} not yet placed in a class.` : ""}`
            : "No classes have been created yet — add one to start placing students."
        }
        meters={[
          {
            label: "Classes with a class teacher",
            value: derived.withTeacher,
            max: classes.length || 1,
            valueLabel: `${derived.withTeacher} / ${classes.length}`,
          },
          {
            label: "Subjects with a teacher",
            value: derived.subjectsWithTeacher.assigned,
            max: derived.subjectsWithTeacher.total || 1,
            valueLabel: `${derived.subjectsWithTeacher.assigned} / ${derived.subjectsWithTeacher.total}`,
            color: derived.subjectsWithTeacher.assigned === derived.subjectsWithTeacher.total ? STATUS.good : STATUS.warning,
          },
          {
            label: "Fees collected",
            value: derived.collection.collected,
            max: derived.collection.billed || 1,
            valueLabel: `${derived.collection.rate}%`,
            color: derived.collection.rate >= 70 ? STATUS.good : STATUS.warning,
          },
        ]}
        pills={[
          { icon: UserCog, label: "Staff", value: staffTotal, onClick: () => onNavigate("teachers") },
          { icon: Sparkles, label: "AI queue", value: (data?.pendingAIReviewItems ?? []).length, onClick: () => onNavigate("ai") },
          {
            icon: UserPlus,
            label: "Pending invites",
            value: data?.pendingInviteCount ?? 0,
            onClick: () => onNavigate("leadership"),
            tone: (data?.pendingInviteCount ?? 0) > 0 ? "warning" : "default",
          },
          { icon: ClipboardList, label: "Exams", value: (data?.recentExams ?? []).length, onClick: () => onNavigate("exam-cycles") },
        ]}
        actions={
          <>
            {onAddStudent ? (
              <button
                type="button"
                onClick={onAddStudent}
                className="flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#1f1a23] shadow-sm transition-all hover:bg-[#fbf0fe] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
              >
                <GraduationCap className="h-4 w-4" /> Add student
              </button>
            ) : null}
            {onAddClass ? (
              <button
                type="button"
                onClick={onAddClass}
                className="flex cursor-pointer items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white ring-1 ring-white/15 backdrop-blur transition-all hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
              >
                <BookOpen className="h-4 w-4" /> Add class
              </button>
            ) : null}
          </>
        }
        aside={
          derived.todayRate !== null ? (
            <RadialGauge
              value={derived.todayRate}
              label="Present today"
              sublabel={`${markedToday.toLocaleString()} marked`}
              color={derived.todayRate >= 90 ? STATUS.good : derived.todayRate >= 75 ? STATUS.warning : STATUS.critical}
            />
          ) : (
            <div className="flex h-[148px] w-[148px] flex-col items-center justify-center text-center">
              <CalendarCheck className="h-7 w-7 text-[#cfc2d6]" aria-hidden />
              <p className="mt-2 px-2 text-[10px] font-bold leading-tight text-ink-subtle">Attendance not marked today</p>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={GraduationCap} label="Students" value={data?.studentCount ?? derived.onRoll.length} sub="On roll" tone="good" onClick={() => onNavigate("students")} delay={80} />
        <StatTile icon={Users} label="Teachers" value={teacherCount} sub={`${ratio(data?.studentCount ?? 0, teacherCount)} students`} onClick={() => onNavigate("teachers")} delay={140} />
        <StatTile icon={School} label="Classes" value={classes.length} sub={`Average ${derived.averageClassSize} per class`} onClick={() => onNavigate("classes")} delay={200} />
        <StatTile
          icon={CalendarCheck}
          label="Attendance"
          value={derived.todayRate !== null ? `${derived.todayRate}%` : "—"}
          sub="Today"
          tone={derived.todayRate !== null && derived.todayRate < 85 ? "warning" : "good"}
          trend={attendanceSeries.length > 1 ? attendanceSeries.slice(-12) : undefined}
          trendColor={STATUS.good}
          onClick={() => onNavigate("attendance")}
          delay={260}
        />
        <StatTile
          icon={Receipt}
          label="Fees collected"
          value={`${derived.collection.rate}%`}
          sub={`${money(derived.collection.collected)} of ${money(derived.collection.billed)}`}
          tone={derived.collection.rate >= 70 ? "good" : "warning"}
          onClick={() => onNavigate("fees")}
          delay={320}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Layers}
          title="Class strength"
          subtitle="Students placed in each class"
          className="xl:col-span-2"
          delay={120}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("classes")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Manage
            </button>
          }
          table={{
            columns: ["Class", "Students", "Subjects"],
            rows: derived.strengths.map((c) => [c.name, c.students, c.subjects]),
          }}
        >
          {derived.strengths.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, derived.strengths.length * 32 + 40)}>
                <BarChart data={derived.strengths} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap="24%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={88} />
                  <ReferenceLine x={derived.averageClassSize} stroke={INK.axis} strokeWidth={1} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" students" />} />
                  <Bar dataKey="students" name="Students" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList dataKey="students" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 text-[10px] font-bold text-ink-subtle">
                The vertical rule marks the campus average of {derived.averageClassSize} students per class.
              </p>
            </>
          ) : (
            <EmptyChart label="No classes created yet" />
          )}
        </InsightCard>

        <InsightCard
          icon={CalendarCheck}
          title="Today's register"
          subtitle={markedToday > 0 ? `${markedToday.toLocaleString()} students marked` : "Not marked yet"}
          delay={180}
          table={{
            columns: ["Status", "Students"],
            rows: derived.split.map((s) => [s.name, s.value]),
          }}
        >
          {derived.split.length === 1 ? (
            <SingleFigure
              value={derived.split[0].value}
              label={`${derived.split[0].name} — everyone marked`}
              color={derived.split[0].color}
            />
          ) : derived.split.length > 1 ? (
            <>
              <ResponsiveContainer width="100%" height={216}>
                <PieChart>
                  <Pie
                    data={derived.split}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    // A 2px surface gap is what separates the slices — never a stroke.
                    paddingAngle={2}
                    stroke={INK.surface}
                    strokeWidth={2}
                  >
                    {derived.split.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<VizTooltip unit=" students" />} />
                </PieChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-2 justify-center" items={derived.split.map((s) => ({ label: s.name, color: s.color, value: s.value }))} />
            </>
          ) : (
            <EmptyChart label="Attendance has not been marked today" />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Activity}
          title="Attendance trend"
          subtitle={`Last ${derived.trend.length} marked ${derived.trend.length === 1 ? "day" : "days"}`}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["Day", "Present", "Absent", "On leave", "Rate %"],
            rows: derived.trend.map((d) => [d.label, d.present, d.absent, d.leave, d.rate]),
          }}
        >
          {derived.trend.length > 1 ? (
            <ResponsiveContainer width="100%" height={248}>
              <ComposedChart data={derived.trend} margin={{ top: 16, right: 12, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="campusAttendanceWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STATUS.good} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={STATUS.good} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} unit="%" />
                <Tooltip cursor={{ stroke: INK.axis, strokeWidth: 1 }} content={<VizTooltip unit="%" />} />
                <Area type="monotone" dataKey="rate" name="Attendance" stroke="none" fill="url(#campusAttendanceWash)" />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="Attendance"
                  stroke={STATUS.good}
                  strokeWidth={2}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Two or more marked days are needed to draw a trend" />
          )}
        </InsightCard>

        <InsightCard
          icon={Receipt}
          title="Fee book"
          subtitle="Invoiced amount by status"
          delay={180}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("fees")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Open
            </button>
          }
          table={{
            columns: ["Status", "Invoices", "Amount"],
            rows: derived.buckets.map((b) => [b.label, b.count, Math.round(b.amount)]),
          }}
        >
          {derived.buckets.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={248}>
                <BarChart data={derived.buckets} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }} barCategoryGap="26%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => compact(v)} />
                  <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={74} />
                  <Tooltip
                    cursor={{ fill: "rgba(129,39,207,0.06)" }}
                    content={<VizTooltip format={(v) => money(v)} />}
                  />
                  <Bar dataKey="amount" name="Amount" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {derived.buckets.map((b) => (
                      <Cell key={b.status} fill={b.color} />
                    ))}
                    <LabelList
                      dataKey="amount"
                      position="right"
                      offset={8}
                      formatter={(v: any) => money(Number(v))}
                      style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-3" items={derived.buckets.map((b) => ({ label: b.label, color: b.color, value: `${b.count}` }))} />
            </>
          ) : (
            <EmptyChart label="No invoices raised yet" />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title="Roll growth"
          subtitle="Students on the register, month by month"
          delay={120}
          table={{
            columns: ["Month", "Joined", "On register"],
            rows: derived.enrolment.map((m) => [m.label, m.joined, m.total]),
          }}
        >
          {derived.enrolment.length > 1 ? (
            <ResponsiveContainer width="100%" height={232}>
              <AreaChart data={derived.enrolment} margin={{ top: 16, right: 16, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="campusRollWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.18} />
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
                  type="monotone"
                  dataKey="total"
                  name="On register"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#campusRollWash)"
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
          icon={ClipboardList}
          title="Report card pipeline"
          subtitle="Where this term's cards have reached"
          delay={180}
          table={{ columns: ["Stage", "Cards"], rows: derived.pipeline.map((s) => [s.stage, s.count]) }}
        >
          {derived.pipeline.length > 0 && derived.pipeline[0].count > 0 ? (
            <ResponsiveContainer width="100%" height={232}>
              <BarChart data={derived.pipeline} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barCategoryGap="26%">
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={AXIS_TICK} axisLine={false} tickLine={false} width={78} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" cards" />} />
                <Bar dataKey="count" name="Cards" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {derived.pipeline.map((s) => (
                    <Cell key={s.stage} fill={s.color} />
                  ))}
                  <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No report cards generated yet" />
          )}
        </InsightCard>

        <InsightCard
          icon={UserCog}
          title="Staff on campus"
          subtitle="Active accounts by role"
          delay={240}
          table={{ columns: ["Role", "People"], rows: derived.staff.map((s) => [s.role, s.count]) }}
        >
          {derived.staff.length > 0 ? (
            <ResponsiveContainer width="100%" height={232}>
              <BarChart data={derived.staff} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap="26%">
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="role" tick={AXIS_TICK} axisLine={false} tickLine={false} width={86} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" people" />} />
                <Bar dataKey="count" name="People" fill={RAMP_BRAND[2]} radius={[0, 4, 4, 0]} maxBarSize={20}>
                  <LabelList dataKey="count" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No staff accounts yet" />
          )}
        </InsightCard>
      </div>

      {derived.grades.length > 0 ? (
        <InsightCard
          icon={GraduationCap}
          title="Grade distribution"
          subtitle="Latest report card per student"
          delay={120}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("report-cards")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Report cards
            </button>
          }
          table={{ columns: ["Grade", "Students"], rows: derived.grades.map((g) => [g.grade, g.count]) }}
        >
          <ResponsiveContainer width="100%" height={232}>
            <BarChart data={derived.grades} margin={{ top: 18, right: 8, bottom: 4, left: -18 }}>
              <CartesianGrid vertical={false} stroke={INK.grid} />
              <XAxis dataKey="grade" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" students" />} />
              <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {derived.grades.map((g) => (
                  <Cell key={g.grade} fill={g.color} />
                ))}
                <LabelList dataKey="count" position="top" offset={6} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </InsightCard>
      ) : null}
    </div>
  );
}
