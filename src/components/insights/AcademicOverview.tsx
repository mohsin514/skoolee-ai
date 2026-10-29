"use client";

/**
 * Academic overview — how the campus is actually performing.
 *
 * `variant="principal"` (the Academic console's Today, SPEC §4.4, §10.11): four KPI tiles (campus average,
 * present today, report cards reviewed, students needing attention) and the academic insights beneath the
 * action queue. No fee meter or tile (M44), no Add student / Add class (M50), no family-communication
 * counts (those include fee reminders; the principal reads the academic delivery log, M44/M46) and no second
 * page heading — the console's PageHeader owns the h1.
 *
 * `canOpen(view)` (optional): tiles and card links navigate only to views the viewer can open, so a tile never
 * leads to an access notice (§4.5.11). Omitted, every link is offered.
 *
 * `variant="admin"` keeps the full overview with the hero, fees and communication for campus operations.
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { useIsSingular } from "@/components/locale/use-count-label";
import { resultGradeLabel } from "@/lib/locale/result-grade";
import { cn } from "@/lib/utils";


interface AcademicOverviewProps {
  data: any;
  onNavigate: (view: string) => void;
  /** Ignored for the principal (M50: adding students and classes is campus operations). */
  onAddClass?: () => void;
  onAddStudent?: () => void;
  /** `principal`: academic KPIs only (no fees, no add actions, no hero heading). Default `admin`. */
  variant?: "principal" | "admin";
  /** Whether a view is open to the viewer; tiles and links to a closed view render without navigation. */
  canOpen?: (view: string) => boolean;
}

export function AcademicOverview({ data, onNavigate, onAddClass, onAddStudent, variant = "admin", canOpen }: AcademicOverviewProps) {
  const ui = useUiText();
  const singular = useIsSingular();
  const gradeLabel = resultGradeLabel(useLocale().language);
  const { number } = useLocaleFormat();
  const principal = variant === "principal";
  /** Tiles and links navigate only to a view the viewer can open (§4.5.11: never a link into an access notice). */
  const opens = (view: string) => !canOpen || canOpen(view);
  const go = (view: string) => (opens(view) ? () => onNavigate(view) : undefined);
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
    const buckets = feeBuckets(data?.invoiceSummary?.byStatus ?? [], data?.invoiceSummary?.currency);

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
      pipeline: reportPipeline(data?.recentReportCards ?? []).map((stage) => ({ ...stage, stage: ui(stage.stage) })),
      comms: commsHealth(data?.communicationSummary).map((item) => ({ ...item, label: ui(item.label) })),
      todayRate: attendanceRate(data?.attendanceSummary),
      buckets,
      collection: collectionRate(buckets),
      correlation,
      atRisk,
    };
  }, [data, ui]);

  const averageMarks = Number(data?.averageMarks ?? 0);
  const attendanceSeries = derived.trend.map((d) => d.rate);
  const gradedCount = derived.cards.filter((c) => typeof c.percentage === "number" && c.percentage > 0).length;
  const markedToday = (data?.attendanceSummary?.present ?? 0) + (data?.attendanceSummary?.absent ?? 0) + (data?.attendanceSummary?.leave ?? 0);

  return (
    <div className="space-y-6">
      {principal ? (
        <section aria-label={ui("Academic overview")} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={TrendingUp}
            label={ui("Campus average")}
            value={`${number(averageMarks)}%`}
            sub={gradedCount > 0 ? ui("{0} graded report cards", [number(gradedCount, 0)]) : ui("Appears once an exam is locked")}
            tone={averageMarks >= 40 ? "good" : "warning"}
            onClick={go("report-cards")}
            delay={80}
          />
          <StatTile
            icon={CalendarCheck}
            label={ui("Present today")}
            value={derived.todayRate !== null ? `${number(derived.todayRate)}%` : "—"}
            sub={derived.todayRate !== null ? ui("{0} of {1} marked", [number(data?.attendanceSummary?.present ?? 0, 0), number(markedToday, 0)]) : ui("Attendance not marked today")}
            tone={derived.todayRate !== null && derived.todayRate < 85 ? "warning" : "good"}
            trend={attendanceSeries.length > 1 ? attendanceSeries.slice(-12) : undefined}
            trendColor={STATUS.good}
            onClick={go("attendance")}
            delay={140}
          />
          <StatTile
            icon={FileText}
            label={ui("Report cards reviewed")}
            value={`${number(derived.pipeline[1]?.count ?? 0, 0)} / ${number(derived.pipeline[0]?.count ?? 0, 0)}`}
            sub={ui("This term")}
            tone={(data?.pendingRemarkReviews ?? 0) > 0 ? "warning" : "good"}
            onClick={go("report-cards")}
            delay={200}
          />
          <StatTile
            icon={AlertTriangle}
            label={ui("Students needing attention")}
            value={number(derived.atRisk.length, 0)}
            sub={ui("Below 40% or under 75% attendance")}
            tone={derived.atRisk.length > 0 ? "warning" : "good"}
            onClick={go("students")}
            delay={260}
          />
        </section>
      ) : (
        <>
      <CommandHero
        eyebrow={`${data?.schoolName ?? ui("Institution")} · ${data?.campusName ?? ui("Campus")}`}
        title={ui("Academic overview")}
        heroValue={`${number(averageMarks)}%`}
        heroLabel={ui("Campus average, submitted assessments")}
        heroCaption={
          gradedCount > 0
            ? ui("Across {0} graded report cards in {1} classes.", [number(gradedCount, 0), number(derived.graded.length, 0)])
            : ui("No marks have been submitted yet — the average will appear once an exam is locked.")
        }
        heroAccent={<TrendingUp className="mb-2 h-7 w-7 text-brand-200" aria-hidden />}
        meters={[
          {
            label: ui("Report cards reviewed"),
            value: derived.pipeline[1]?.count ?? 0,
            max: derived.pipeline[0]?.count ?? 0,
            valueLabel: `${number(derived.pipeline[1]?.count ?? 0, 0)} / ${number(derived.pipeline[0]?.count ?? 0, 0)}`,
          },
          {
            label: ui("Fee collection"),
            value: derived.collection.collected,
            max: derived.collection.billed || 1,
            valueLabel: `${number(derived.collection.rate)}%`,
            color: derived.collection.rate >= 70 ? STATUS.good : STATUS.warning,
          },
          {
            label: ui("Students with a result"),
            value: gradedCount,
            max: data?.totalStudents || 1,
            valueLabel: `${number(gradedCount, 0)} / ${number(data?.totalStudents ?? 0, 0)}`,
            color: "var(--brand-300)",
          },
        ]}
        pills={[
          { icon: FileText, label: ui("Awaiting review"), value: data?.pendingRemarkReviews ?? 0, onClick: go("report-cards"), tone: (data?.pendingRemarkReviews ?? 0) > 0 ? "warning" : "default" },
          { icon: Sparkles, label: ui("AI queue"), value: data?.pendingAIReviews ?? 0, onClick: go("ai") },
          { icon: ClipboardList, label: ui("Locked exams"), value: data?.lockedExams ?? 0, onClick: go("exam-cycles") },
          { icon: AlertTriangle, label: ui("At risk"), value: derived.atRisk.length, onClick: go("students"), tone: derived.atRisk.length > 0 ? "critical" : "default" },
        ]}
        actions={
          <>
            {onAddStudent && !principal ? (
              <Button variant="outline" size="sm" type="button" onClick={onAddStudent} className="flex items-center justify-start gap-2 focus-on-dark">
                <GraduationCap className="h-4 w-4" aria-hidden="true" /> {ui("Add student")}
              </Button>
            ) : null}
            {onAddClass && !principal ? (
              <Button variant="default" size="sm" type="button" onClick={onAddClass} className="flex items-center justify-start gap-2 backdrop-blur focus-on-dark">
                <BookOpen className="h-4 w-4" aria-hidden="true" /> {ui("Add class")}
              </Button>
            ) : null}
          </>
        }
        aside={
          derived.todayRate !== null ? (
            <RadialGauge
              value={derived.todayRate}
              label={ui("Present today")}
              sublabel={ui("{0} of {1} marked", [number(data?.attendanceSummary?.present ?? 0, 0), number(markedToday, 0)])}
              color={derived.todayRate >= 90 ? STATUS.good : derived.todayRate >= 75 ? STATUS.warning : STATUS.critical}
            />
          ) : (
            <div className="flex h-[148px] w-[148px] flex-col items-center justify-center text-center">
              <CalendarCheck className="h-7 w-7 text-edge" aria-hidden />
              <p className="mt-2 px-2 text-2xs font-bold leading-tight text-ink-subtle">{ui("Attendance not marked today")}</p>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={GraduationCap} label={singular(data?.totalStudents ?? 0) ? ui("Student") : ui("Students")} value={data?.totalStudents ?? 0} sub={ui("On roll")} tone="good" onClick={go("students")} delay={80} />
        <StatTile icon={Users} label={singular(data?.totalTeachers ?? 0) ? ui("Teacher") : ui("Teachers")} value={data?.totalTeachers ?? 0} sub={ui("{0} students", [ratio(data?.totalStudents ?? 0, data?.totalTeachers ?? 0)])} onClick={go("teachers")} delay={140} />
        <StatTile icon={School} label={singular(data?.totalClasses ?? 0) ? ui("Class") : ui("Classes")} value={data?.totalClasses ?? 0} sub={ui("{0} with results", [number(derived.graded.length, 0)])} onClick={go("classes")} delay={200} />
        <StatTile
          icon={CalendarCheck}
          label={ui("Attendance")}
          value={derived.todayRate !== null ? `${number(derived.todayRate)}%` : "—"}
          sub={ui("Today")}
          tone={derived.todayRate !== null && derived.todayRate < 85 ? "warning" : "good"}
          trend={attendanceSeries.length > 1 ? attendanceSeries.slice(-12) : undefined}
          trendColor={STATUS.good}
          onClick={go("attendance")}
          delay={260}
        />
        <StatTile icon={Receipt} label={ui("Fees collected")} value={`${number(derived.collection.rate)}%`} sub={ui("{0} of {1}", [compact(derived.collection.collected), compact(derived.collection.billed)])} tone={derived.collection.rate >= 70 ? "good" : "warning"} onClick={go("fees")} delay={320} />
      </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Award}
          title={ui("Class performance")}
          subtitle={ui("Average of each student's latest report card")}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: [ui("Class"), ui("Average %"), ui("Students graded"), ui("Attendance %")],
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
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="average" name={ui("Average")} radius={[0, 4, 4, 0]} maxBarSize={22}>
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
                  { label: ui("At or above pass mark"), color: SERIES[0] },
                  { label: ui("Below pass mark"), color: STATUS.critical },
                ]}
              />
            </>
          ) : (
            <EmptyChart label="Class averages appear once report cards are generated" />
          )}
        </InsightCard>

        <InsightCard
          icon={GraduationCap}
          title={ui("Grade distribution")}
          subtitle={ui("Latest card per student")}
          delay={180}
          table={{
            columns: [gradeLabel, ui("Students")],
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
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={` ${ui("students")}`} />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name={ui("Students")} radius={[4, 4, 0, 0]} maxBarSize={24}>
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
                  { label: ui("Higher grades"), color: GRADE_HIGH[1] },
                  { label: ui("Lower grades"), color: GRADE_LOW[1] },
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
          title={ui("Attendance trend")}
          subtitle={ui(derived.trend.length === 1 ? "Last {0} marked day" : "Last {0} marked days", [derived.trend.length])}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: [ui("Day"), ui("Present"), ui("Absent"), ui("On leave"), ui("Rate %")],
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
                  content={<VizTooltip format={(v, name) => (name === ui("Attendance") ? `${v}%` : v.toLocaleString())} />}
                />
                <Area {...NO_ENTRY_ANIMATION} type="monotone" dataKey="rate" name={ui("Attendance")} stroke="none" fill="url(#principalAttendanceWash)" />
                <Line
                  {...NO_ENTRY_ANIMATION}
                  type="monotone"
                  dataKey="rate"
                  name={ui("Attendance")}
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
          title={ui("Report card pipeline")}
          subtitle={ui("Where this term's cards have reached")}
          delay={180}
          table={{
            columns: [ui("Stage"), ui("Cards")],
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
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={` ${ui("cards")}`} />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name={ui("Cards")} radius={[0, 4, 4, 0]} maxBarSize={22}>
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

      <div className={cn("grid grid-cols-1 gap-5", !principal && "xl:grid-cols-3")}>
        <InsightCard
          icon={TrendingUp}
          title={ui("Attendance against results")}
          subtitle={ui("One point per class · size is roll strength")}
          className={principal ? undefined : "xl:col-span-2"}
          delay={120}
          table={{
            columns: [ui("Class"), ui("Attendance %"), ui("Average %"), ui("Students")],
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
                    name={ui("Attendance")}
                    domain={[0, 100]}
                    unit="%"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: ui("Attendance"), position: "insideBottom", offset: -10, style: { fill: INK.muted, fontSize: 10, fontWeight: 800 } }}
                  />
                  <YAxis
                    type="number"
                    dataKey="average"
                    name={ui("Average")}
                    domain={[0, 100]}
                    unit="%"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ZAxis type="number" dataKey="students" range={[80, 420]} name={ui("Students")} />
                  <Tooltip
                    cursor={{ strokeDasharray: "0", stroke: INK.axis }}
                    content={
                      <VizTooltip
                        titleFor={(_l, payload) => payload?.[0]?.payload?.name ?? ""}
                        format={(v, name) => (name === ui("Students") ? `${v}` : `${v}%`)}
                      />
                    }
                  />
                  <ReferenceLine y={40} stroke={INK.axis} />
                  <ReferenceLine x={85} stroke={INK.axis} />
                  <Scatter {...NO_ENTRY_ANIMATION} name={ui("Classes")} data={derived.correlation} fill={SERIES[0]} fillOpacity={0.85} stroke={INK.surface} strokeWidth={2} />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="mt-3 text-2xs font-bold leading-relaxed text-ink-subtle">
                {ui("Reference lines mark the 40% pass mark and 85% attendance. Classes in the lower-left quadrant are the ones where both levers need attention.")}
              </p>
            </>
          ) : (
            <EmptyChart label="Needs both marked attendance and graded report cards" />
          )}
        </InsightCard>

        {/* Family-communication counts include fee reminders: campus operations only (the principal reads the
            academic delivery log in Report delivery, M44/M46). */}
        {principal ? null : (
        <InsightCard
          icon={MessageSquare}
          title={ui("Parent communication")}
          subtitle={ui("Delivery outcomes to date")}
          delay={180}
          actions={
            opens("engagement") ? (
              <Button variant="link" size="sm" type="button" onClick={() => onNavigate("engagement")}>
                {ui("Open")}
              </Button>
            ) : undefined
          }
          table={{
            columns: [ui("Outcome"), ui("Messages")],
            rows: derived.comms.map((c) => [c.label, c.value]),
          }}
        >
          {derived.comms.length === 1 ? (
            <SingleFigure
              value={derived.comms[0].value}
              label={derived.comms[0].label}
              color={derived.comms[0].color}
              note={ui("Every message sent so far has the same outcome.")}
            />
          ) : derived.comms.length > 1 ? (
            <>
              <ResponsiveContainer width="100%" height={216}>
                <BarChart data={derived.comms} margin={{ top: 18, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={` ${ui("messages")}`} />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="value" name={ui("Messages")} radius={[4, 4, 0, 0]} maxBarSize={24}>
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
        )}
      </div>

      {derived.atRisk.length > 0 ? (
        <InsightCard
          icon={AlertTriangle}
          title={ui("Students needing attention")}
          subtitle={ui("Below 40% in results, or under 75% attendance")}
          delay={120}
          actions={
            opens("students") ? (
              <Button variant="link" size="sm" type="button" onClick={() => onNavigate("students")}>
                {ui("All students")}
              </Button>
            ) : undefined
          }
        >
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {derived.atRisk.map((s, i) => (
              <li
                key={`${s.roll}-${i}`}
                className="sk-rise flex items-center justify-between gap-3 rounded-2xl border border-edge/25 bg-gradient-to-br from-brand-50/50 via-card to-card px-4 py-3"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="min-w-0">
                  <bdi className="block truncate text-xs font-bold text-ink-strong">{s.name}</bdi>
                  <p className="text-2xs font-semibold text-ink-subtle">
                    {ui("{0} · Roll {1}", [s.className, s.roll ?? "—"])}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {s.percentage !== null ? (
                    <Badge variant={s.percentage < 40 ? "danger" : "success"} dot size="sm" className="tabular-nums">
                      {ui("{0}% marks", [s.percentage])}
                    </Badge>
                  ) : null}
                  {s.attendance !== null ? (
                    <Badge variant={s.attendance < 75 ? "warning" : "success"} dot size="sm" className="tabular-nums">
                      {ui("{0}% present", [s.attendance])}
                    </Badge>
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
