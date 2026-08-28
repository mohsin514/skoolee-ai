"use client";

/**
 * The principal's opening screen.
 *
 * A principal is judged on one number — how the campus is actually performing —
 * so that is the hero, and everything else on the page explains it: which
 * classes carry it, whether attendance supports it, where this term's report
 * cards have stalled, and whether parents are hearing about any of it.
 */

import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  Award,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  MessageSquare,
  Receipt,
  School,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { CommandHero } from "./CommandHero";
import {
  EmptyChart,
  InsightCard,
  RadialGauge,
  SeriesLegend,
  SingleFigure,
  StatTile,
  VizTooltip,
} from "./chart-kit";
import { AXIS_TICK, GRADE_HIGH, GRADE_LOW, INK, NO_ENTRY_ANIMATION, SERIES, STATUS, compact } from "./palette";
import {
  attendanceRate,
  attendanceTrend,
  classPerformance,
  collectionRate,
  commsHealth,
  feeBuckets,
  gradeDistribution,
  groupByClass,
  latestReportCards,
  reportPipeline,
  studentAttendanceRate,
  ratio,
} from "./metrics";

interface AcademicOverviewProps {
  data: any;
  onNavigate: (view: string) => void;
  onAddClass?: () => void;
  onAddStudent?: () => void;
}

export function AcademicOverview({ data, onNavigate, onAddClass, onAddStudent }: AcademicOverviewProps) {
  const students: any[] = data?.students ?? [];
  const classes: any[] = data?.classes ?? [];

  const derived = useMemo(() => {
    const byClass = groupByClass(students);
    const perClass = classPerformance(classes, byClass)
      .filter((c) => c.students > 0)
      .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
    const graded = perClass.filter((c) => c.average !== null);
    const cards = latestReportCards(students);
    const trend = attendanceTrend(students, 21);
    const buckets = feeBuckets(data?.invoiceSummary?.byStatus ?? []);

    // Attendance and marks in one place, per class — the two levers a principal
    // actually pulls, and the pairing that shows when one is dragging the other.
    const correlation = perClass
      .filter((c) => c.average !== null && c.attendance !== null)
      .map((c) => ({ ...c, average: c.average as number, attendance: c.attendance as number }));

    const atRisk = students
      .map((s: any) => {
        const card = s?.reportCards?.[0];
        return {
          name: s.fullName,
          roll: s.rollNo,
          className: s.class ? (s.class.section ? `${s.class.name}-${s.class.section}` : s.class.name) : "—",
          percentage: typeof card?.percentage === "number" ? Math.round(card.percentage) : null,
          attendance: studentAttendanceRate(s),
        };
      })
      .filter((s) => (s.percentage !== null && s.percentage < 40) || (s.attendance !== null && s.attendance < 75))
      .sort((a, b) => (a.percentage ?? 100) - (b.percentage ?? 100))
      .slice(0, 6);

    return {
      perClass,
      graded,
      cards,
      grades: gradeDistribution(cards),
      trend,
      pipeline: reportPipeline(data?.recentReportCards ?? []),
      comms: commsHealth(data?.communicationSummary),
      todayRate: attendanceRate(data?.attendanceSummary),
      buckets,
      collection: collectionRate(buckets),
      correlation,
      atRisk,
    };
  }, [data]);

  const averageMarks = Number(data?.averageMarks ?? 0);
  const attendanceSeries = derived.trend.map((d) => d.rate);
  const gradedCount = derived.cards.filter((c) => typeof c.percentage === "number" && c.percentage > 0).length;

  return (
    <div className="space-y-6">
      <CommandHero
        eyebrow={`${data?.schoolName ?? "Institution"} · ${data?.campusName ?? "Campus"}`}
        title="Academic command centre"
        heroValue={`${averageMarks}%`}
        heroLabel="Campus average, submitted assessments"
        heroCaption={
          gradedCount > 0
            ? `Across ${gradedCount.toLocaleString()} graded report ${gradedCount === 1 ? "card" : "cards"} in ${derived.graded.length} ${derived.graded.length === 1 ? "class" : "classes"}.`
            : "No marks have been submitted yet — the average will appear once an exam is locked."
        }
        heroAccent={<TrendingUp className="mb-2 h-7 w-7 text-emerald-400" aria-hidden />}
        meters={[
          {
            label: "Report cards reviewed",
            value: derived.pipeline[1]?.count ?? 0,
            max: derived.pipeline[0]?.count ?? 0,
            valueLabel: `${derived.pipeline[1]?.count ?? 0} / ${derived.pipeline[0]?.count ?? 0}`,
          },
          {
            label: "Fee collection",
            value: derived.collection.collected,
            max: derived.collection.billed || 1,
            valueLabel: `${derived.collection.rate}%`,
            color: derived.collection.rate >= 70 ? STATUS.good : STATUS.warning,
          },
          {
            label: "Students with a result",
            value: gradedCount,
            max: data?.totalStudents || 1,
            valueLabel: `${gradedCount} / ${(data?.totalStudents ?? 0).toLocaleString()}`,
            color: "#c795f0",
          },
        ]}
        pills={[
          { icon: FileText, label: "Awaiting review", value: data?.pendingRemarkReviews ?? 0, onClick: () => onNavigate("report-cards"), tone: (data?.pendingRemarkReviews ?? 0) > 0 ? "warning" : "default" },
          { icon: Sparkles, label: "AI queue", value: data?.pendingAIReviews ?? 0, onClick: () => onNavigate("ai") },
          { icon: ClipboardList, label: "Locked exams", value: data?.lockedExams ?? 0, onClick: () => onNavigate("exam-cycles") },
          { icon: AlertTriangle, label: "At risk", value: derived.atRisk.length, onClick: () => onNavigate("students"), tone: derived.atRisk.length > 0 ? "critical" : "default" },
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
              sublabel={`${(data?.attendanceSummary?.present ?? 0).toLocaleString()} of ${(
                (data?.attendanceSummary?.present ?? 0) +
                (data?.attendanceSummary?.absent ?? 0) +
                (data?.attendanceSummary?.leave ?? 0)
              ).toLocaleString()} marked`}
              color={derived.todayRate >= 90 ? STATUS.good : derived.todayRate >= 75 ? STATUS.warning : STATUS.critical}
            />
          ) : (
            <div className="flex h-[148px] w-[148px] flex-col items-center justify-center text-center">
              <CalendarCheck className="h-7 w-7 text-[#cfc2d6]" aria-hidden />
              <p className="mt-2 px-2 text-[10px] font-bold leading-tight text-ink-subtle">
                Attendance not marked today
              </p>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={GraduationCap} label="Students" value={data?.totalStudents ?? 0} sub="On roll" tone="good" onClick={() => onNavigate("students")} delay={80} />
        <StatTile icon={Users} label="Teachers" value={data?.totalTeachers ?? 0} sub={ratio(data?.totalStudents ?? 0, data?.totalTeachers ?? 0) + " students"} onClick={() => onNavigate("teachers")} delay={140} />
        <StatTile icon={School} label="Classes" value={data?.totalClasses ?? 0} sub={`${derived.graded.length} with results`} onClick={() => onNavigate("classes")} delay={200} />
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
        <StatTile icon={Receipt} label="Fees collected" value={`${derived.collection.rate}%`} sub={`${compact(derived.collection.collected)} of ${compact(derived.collection.billed)}`} tone={derived.collection.rate >= 70 ? "good" : "warning"} onClick={() => onNavigate("fees")} delay={320} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Award}
          title="Class performance"
          subtitle="Average of each student's latest report card"
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["Class", "Average %", "Students graded", "Attendance %"],
            rows: derived.perClass.map((c) => [c.name, c.average ?? "—", c.graded, c.attendance ?? "—"]),
          }}
        >
          {derived.graded.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, derived.graded.length * 34 + 40)}>
                <BarChart
                  data={derived.graded}
                  layout="vertical"
                  margin={{ top: 4, right: 44, bottom: 4, left: 4 }}
                  barCategoryGap="22%"
                >
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} unit="%" />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={88} />
                  {/* The pass mark, so a bar's length reads against something. */}
                  <ReferenceLine x={40} stroke={INK.axis} strokeWidth={1} />
                  <Tooltip
                    cursor={{ fill: "rgba(129,39,207,0.06)" }}
                    content={<VizTooltip unit="%" />}
                  />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="average" name="Average" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {derived.graded.map((c) => (
                      <Cell
                        key={c.id}
                        fill={(c.average ?? 0) >= 40 ? SERIES[0] : STATUS.critical}
                      />
                    ))}
                    <LabelList
                      dataKey="average"
                      position="right"
                      offset={8}
                      formatter={(v: any) => `${v}%`}
                      style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend
                className="mt-3"
                items={[
                  { label: "At or above pass mark", color: SERIES[0] },
                  { label: "Below pass mark", color: STATUS.critical },
                ]}
              />
            </>
          ) : (
            <EmptyChart label="Class averages appear once report cards are generated" />
          )}
        </InsightCard>

        <InsightCard
          icon={GraduationCap}
          title="Grade distribution"
          subtitle="Latest card per student"
          delay={180}
          table={{
            columns: ["Grade", "Students"],
            rows: derived.grades.map((g) => [g.grade, g.count]),
          }}
        >
          {derived.grades.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={252}>
                <BarChart data={derived.grades} margin={{ top: 18, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="grade" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" students" />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name="Students" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {derived.grades.map((g) => (
                      <Cell key={g.grade} fill={g.color} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      offset={6}
                      style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }}
                    />
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
            <EmptyChart label="No graded report cards yet" />
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
            <ResponsiveContainer width="100%" height={252}>
              <ComposedChart data={derived.trend} margin={{ top: 16, right: 12, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="principalAttendanceWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STATUS.good} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={STATUS.good} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} unit="%" />
                <Tooltip
                  cursor={{ stroke: INK.axis, strokeWidth: 1 }}
                  content={<VizTooltip format={(v, name) => (name === "Attendance" ? `${v}%` : v.toLocaleString())} />}
                />
                <Area {...NO_ENTRY_ANIMATION} type="monotone" dataKey="rate" name="Attendance" stroke="none" fill="url(#principalAttendanceWash)" />
                <Line
                  {...NO_ENTRY_ANIMATION}
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
          icon={ClipboardList}
          title="Report card pipeline"
          subtitle="Where this term's cards have reached"
          delay={180}
          table={{
            columns: ["Stage", "Cards"],
            rows: derived.pipeline.map((s) => [s.stage, s.count]),
          }}
        >
          {derived.pipeline.length > 0 && derived.pipeline[0].count > 0 ? (
            <ResponsiveContainer width="100%" height={252}>
              <BarChart
                data={derived.pipeline}
                layout="vertical"
                margin={{ top: 4, right: 48, bottom: 4, left: 4 }}
                barCategoryGap="26%"
              >
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={AXIS_TICK} axisLine={false} tickLine={false} width={78} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" cards" />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name="Cards" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {derived.pipeline.map((s) => (
                    <Cell key={s.stage} fill={s.color} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    offset={8}
                    style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No report cards generated yet" />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title="Attendance against results"
          subtitle="One point per class · size is roll strength"
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["Class", "Attendance %", "Average %", "Students"],
            rows: derived.correlation.map((c) => [c.name, c.attendance, c.average, c.students]),
          }}
        >
          {derived.correlation.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={276}>
                <ScatterChart margin={{ top: 16, right: 20, bottom: 20, left: -14 }}>
                  <CartesianGrid stroke={INK.grid} />
                  <XAxis
                    type="number"
                    dataKey="attendance"
                    name="Attendance"
                    domain={[0, 100]}
                    unit="%"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: "Attendance", position: "insideBottom", offset: -10, style: { fill: INK.muted, fontSize: 10, fontWeight: 800 } }}
                  />
                  <YAxis
                    type="number"
                    dataKey="average"
                    name="Average"
                    domain={[0, 100]}
                    unit="%"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ZAxis type="number" dataKey="students" range={[80, 420]} name="Students" />
                  <Tooltip
                    cursor={{ strokeDasharray: "0", stroke: INK.axis }}
                    content={
                      <VizTooltip
                        titleFor={(_l, payload) => payload?.[0]?.payload?.name ?? ""}
                        format={(v, name) => (name === "Students" ? `${v}` : `${v}%`)}
                      />
                    }
                  />
                  <ReferenceLine y={40} stroke={INK.axis} />
                  <ReferenceLine x={85} stroke={INK.axis} />
                  <Scatter {...NO_ENTRY_ANIMATION} name="Classes" data={derived.correlation} fill={SERIES[0]} fillOpacity={0.85} stroke={INK.surface} strokeWidth={2} />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="mt-3 text-[10px] font-bold leading-relaxed text-ink-subtle">
                Reference lines mark the 40% pass mark and 85% attendance. Classes in the lower-left quadrant are the
                ones where both levers need attention.
              </p>
            </>
          ) : (
            <EmptyChart label="Needs both marked attendance and graded report cards" />
          )}
        </InsightCard>

        <InsightCard
          icon={MessageSquare}
          title="Parent communication"
          subtitle="Delivery outcomes to date"
          delay={180}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("engagement")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Open
            </button>
          }
          table={{
            columns: ["Outcome", "Messages"],
            rows: derived.comms.map((c) => [c.label, c.value]),
          }}
        >
          {derived.comms.length === 1 ? (
            <SingleFigure
              value={derived.comms[0].value}
              label={derived.comms[0].label}
              color={derived.comms[0].color}
              note="Every message sent so far has the same outcome."
            />
          ) : derived.comms.length > 1 ? (
            <>
              <ResponsiveContainer width="100%" height={216}>
                <BarChart data={derived.comms} margin={{ top: 18, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" messages" />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="value" name="Messages" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {derived.comms.map((c) => (
                      <Cell key={c.label} fill={c.color} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="top"
                      offset={6}
                      style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-3" items={derived.comms.map((c) => ({ label: c.label, color: c.color, value: c.value }))} />
            </>
          ) : (
            <EmptyChart label="No parent messages sent yet" />
          )}
        </InsightCard>
      </div>

      {derived.atRisk.length > 0 ? (
        <InsightCard
          icon={AlertTriangle}
          title="Students needing attention"
          subtitle="Below 40% in results, or under 75% attendance"
          delay={120}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("students")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              All students
            </button>
          }
        >
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {derived.atRisk.map((s, i) => (
              <li
                key={`${s.roll}-${i}`}
                className="sk-rise flex items-center justify-between gap-3 rounded-2xl border border-[#cfc2d6]/25 bg-gradient-to-br from-[#fbf0fe]/50 via-white to-white px-4 py-3"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-[#1f1a23]">{s.name}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle">
                    {s.className} · Roll {s.roll ?? "—"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {s.percentage !== null ? (
                    <span
                      className="rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider"
                      style={{
                        background: s.percentage < 40 ? `${STATUS.critical}1f` : `${STATUS.good}1f`,
                        color: s.percentage < 40 ? "#a81231" : "#0f7a55",
                      }}
                    >
                      {s.percentage}% marks
                    </span>
                  ) : null}
                  {s.attendance !== null ? (
                    <span
                      className="rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider"
                      style={{
                        background: s.attendance < 75 ? `${STATUS.warning}26` : `${STATUS.good}1f`,
                        color: s.attendance < 75 ? "#8a6100" : "#0f7a55",
                      }}
                    >
                      {s.attendance}% present
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </InsightCard>
      ) : null}
    </div>
  );
}
