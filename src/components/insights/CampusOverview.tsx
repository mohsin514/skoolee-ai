"use client";

/**
 * The campus admin's Today screen, under the Today queue.
 *
 * Landing screens never repeat the sidebar as tiles (§4.5.8): four KPI tiles — students on roll, the
 * register, fee collection (only for someone who can see fees) and report cards on their way home — and the
 * two charts an operator acts on daily: today's register and class strength. Everything else (roll growth,
 * staff mix, grades) lives with the view that owns it.
 */

import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { useCountLabel, useIsSingular } from "@/components/locale/use-count-label";
import { localeTag, minorUnits } from "@/lib/locale/package";
import { useMemo } from "react";
import { CalendarCheck, ClipboardList, GraduationCap, Layers, Receipt, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyChart, InsightCard, SeriesLegend, SingleFigure, StatTile, VizTooltip } from "./chart-kit";
import { AXIS_TICK, INK, NO_ENTRY_ANIMATION, SERIES, STATUS } from "./palette";
import {
  attendanceRate,
  attendanceSplit,
  attendanceTrend,
  classStrength,
  collectionRate,
  feeBuckets,
  isOnRoll,
  ratio,
  reportPipeline,
} from "./metrics";
import { Button } from "@/components/ui/button";

interface CampusOverviewProps {
  data: any;
  onNavigate: (view: string) => void;
  /** Fee collection tile only for someone who can open Fees. */
  showFinance?: boolean;
  /** @deprecated Add student lives in the Today PageHeader; ignored. */
  onAddStudent?: () => void;
  /** @deprecated Add class lives on Classes & subjects; ignored. */
  onAddClass?: () => void;
}

export function CampusOverview({ data, onNavigate, showFinance = true }: CampusOverviewProps) {
  const locale = useLocale();
  const ui = useUiText();
  const count = useCountLabel();
  const singular = useIsSingular();
  // R7: the school's own currency from the locale package when the summary does not carry one.
  const currency = data?.invoiceSummary?.currency ?? locale.currency;
  const money = (value: number) =>
    new Intl.NumberFormat(localeTag(locale), { style: "currency", currency, minimumFractionDigits: minorUnits(currency), maximumFractionDigits: minorUnits(currency) }).format(value);
  const students: any[] = data?.students ?? [];
  const classes: any[] = data?.classes ?? [];

  const derived = useMemo(() => {
    const onRoll = students.filter(isOnRoll);
    const strengths = classStrength(classes);
    const buckets = feeBuckets(data?.invoiceSummary?.byStatus ?? [], data?.invoiceSummary?.currency);
    const pipeline = reportPipeline(data?.recentReportCards ?? []);
    const generated = pipeline[0]?.count ?? 0;
    const sent = pipeline[3]?.count ?? 0;
    return {
      onRoll,
      strengths,
      averageClassSize: strengths.length ? Math.round(strengths.reduce((a, c) => a + c.students, 0) / strengths.length) : 0,
      unplaced: onRoll.filter((s: any) => !s.class).length,
      collection: collectionRate(buckets),
      trend: attendanceTrend(students, 21),
      split: attendanceSplit(data?.attendanceSummary),
      todayRate: attendanceRate(data?.attendanceSummary),
      reportsWaiting: Math.max(0, generated - sent),
      reportsGenerated: generated,
    };
  }, [data, students, classes]);

  const markedToday =
    (data?.attendanceSummary?.present ?? 0) + (data?.attendanceSummary?.absent ?? 0) + (data?.attendanceSummary?.leave ?? 0);
  const attendanceSeries = derived.trend.map((d) => d.rate);
  const studentCount = data?.studentCount ?? derived.onRoll.length;
  const teacherCount = (data?.teachers ?? []).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={GraduationCap}
          label={ui("Students on roll")}
          value={studentCount}
          sub={derived.unplaced > 0 ? ui("{0} not yet placed in a class", [derived.unplaced]) : ui("Across {0}", [count(derived.strengths.length, "class")])}
          tone={derived.unplaced > 0 ? "warning" : "good"}
          onClick={() => onNavigate("students")}
          delay={60}
        />
        <StatTile
          icon={CalendarCheck}
          label={ui("Present today")}
          value={derived.todayRate !== null ? `${derived.todayRate}%` : "—"}
          sub={markedToday > 0 ? ui("{0} marked", [count(markedToday, "student")]) : ui("Not marked yet")}
          tone={derived.todayRate !== null && derived.todayRate < 85 ? "warning" : "good"}
          trend={attendanceSeries.length > 1 ? attendanceSeries.slice(-12) : undefined}
          trendColor={STATUS.good}
          onClick={() => onNavigate("attendance")}
          delay={120}
        />
        {showFinance ? (
          <StatTile
            icon={Receipt}
            label={ui("Fees collected")}
            value={`${derived.collection.rate}%`}
            sub={ui("{0} of {1}", [money(derived.collection.collected), money(derived.collection.billed)])}
            tone={derived.collection.rate >= 70 ? "good" : "warning"}
            onClick={() => onNavigate("fees")}
            delay={180}
          />
        ) : (
          <StatTile
            icon={Users}
            label={singular(teacherCount) ? ui("Teacher") : ui("Teachers")}
            value={teacherCount}
            sub={ui("{0} students per teacher", [ratio(studentCount, teacherCount)])}
            onClick={() => onNavigate("teachers")}
            delay={180}
          />
        )}
        <StatTile
          icon={ClipboardList}
          label={ui("Report cards to send")}
          value={derived.reportsWaiting}
          sub={derived.reportsGenerated ? ui("{0} generated this term", [derived.reportsGenerated]) : ui("None generated yet")}
          tone={derived.reportsWaiting > 0 ? "warning" : "good"}
          onClick={() => onNavigate("report-cards")}
          delay={240}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Layers}
          title={ui("Class strength")}
          subtitle={ui("Students placed in each class")}
          className="xl:col-span-2"
          delay={120}
          actions={
            <Button variant="link" size="sm" type="button" onClick={() => onNavigate("classes")}>
              {ui("Open classes")}
            </Button>
          }
          table={{
            columns: [ui("Class"), ui("Students"), ui("Subjects")],
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
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={` ${ui("students")}`} />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="students" name={ui("Students")} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList dataKey="students" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 text-2xs font-bold text-ink-subtle">
                {ui("The vertical rule marks the campus average of {0} students per class.", [derived.averageClassSize])}
              </p>
            </>
          ) : (
            <EmptyChart label={ui("No classes created yet")} />
          )}
        </InsightCard>

        <InsightCard
          icon={CalendarCheck}
          title={ui("Today's register")}
          subtitle={markedToday > 0 ? ui("{0} marked", [count(markedToday, "student")]) : ui("Not marked yet")}
          delay={180}
          table={{
            columns: [ui("Status"), ui("Students")],
            rows: derived.split.map((s) => [ui(s.name), s.value]),
          }}
        >
          {derived.split.length === 1 ? (
            <SingleFigure value={derived.split[0].value} label={ui("{0} — everyone marked", [ui(derived.split[0].name)])} color={derived.split[0].color} />
          ) : derived.split.length > 1 ? (
            <>
              <ResponsiveContainer width="100%" height={216}>
                <PieChart>
                  <Pie
                    {...NO_ENTRY_ANIMATION}
                    data={derived.split}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    // A 2px surface gap separates the slices — never a stroke.
                    paddingAngle={2}
                    stroke={INK.surface}
                    strokeWidth={2}
                  >
                    {derived.split.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<VizTooltip unit={` ${ui("students")}`} />} />
                </PieChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-2 justify-center" items={derived.split.map((s) => ({ label: ui(s.name), color: s.color, value: s.value }))} />
            </>
          ) : (
            <EmptyChart label={ui("Attendance has not been marked today")} />
          )}
        </InsightCard>
      </div>
    </div>
  );
}
