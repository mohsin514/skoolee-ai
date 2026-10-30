"use client";

/**
 * "Insights" on the campus Academic overview (M37, ported from the retired legacy analytics page).
 *
 * Built on the shared insights kit so it reads like every other chart in the product: InsightCard with a
 * table twin, StatTile, the validated series/grade palettes, VizTooltip and EmptyChart. A load failure is the
 * inline ErrorState with retry (R4), never a toast as well. Every label is an EN UI key (R11).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Award, BarChart3, BookOpen, Calendar, GraduationCap, TrendingDown, TrendingUp } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { SkeletonCards } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";
import { DeskPill, DeskRowIcon, deskRow } from "@/components/ui/desk";
import { cn } from "@/lib/utils";
import { EmptyChart, InsightCard, StatTile, VizTooltip } from "@/components/insights/chart-kit";
import { AXIS_TICK, GRADE_COLOR, GRADE_ORDER, INK, NO_ENTRY_ANIMATION, SERIES, STATUS } from "@/components/insights/palette";

interface AnalyticsData {
  summary: {
    avgPerformance: number;
    passRate: number;
    needsAttention: number;
    totalStudents: number;
    attendanceRate: number | null;
  };
  classPerformance: { className: string; average: number; students: number }[];
  subjectPerformance: { subject: string; average: number; entries: number }[];
  gradeDistribution: { grade: string; count: number }[];
  examTrends: { examId: string; title: string; term: string; type: string; average: number; students: number; className: string }[];
  topStudents: { name: string; rollNo: string; percentage: number; grade: string }[];
  atRiskStudents: { name: string; rollNo: string; percentage: number; attendancePct: number | null }[];
  academicYear: number;
}

const CHART_HEIGHT = 260;

export function AnalyticsCharts() {
  const ui = useUiText();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/analytics");
      const json = await res.json();
      if (json.success) setData(json.data);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grades = useMemo(() => {
    const rows = data?.gradeDistribution ?? [];
    return [...rows].sort((a, b) => {
      const ai = GRADE_ORDER.indexOf(a.grade);
      const bi = GRADE_ORDER.indexOf(b.grade);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  }, [data]);

  if (loading) return <SkeletonCards count={4} label={ui("Loading insights")} />;

  if (!data) {
    return failed ? (
      <ErrorState
        title={ui("Insights could not be loaded")}
        description={ui("The results summary didn't come back. Try again in a moment.")}
        onRetry={() => void load()}
      />
    ) : null;
  }

  const { summary } = data;
  const percent = (value: number) => `${value}%`;

  return (
    <div className="space-y-5">
      {/* Four tiles at most (§4.5.8); the roll count already lives on Today and the Student list. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={TrendingUp} label={ui("Average result")} value={percent(summary.avgPerformance)} tone="brand" />
        <StatTile icon={Award} label={ui("Pass rate")} value={percent(summary.passRate)} tone={summary.passRate >= 70 ? "good" : "warning"} />
        <StatTile
          icon={AlertTriangle}
          label={ui("Needs attention")}
          value={summary.needsAttention}
          sub={ui("of {0} students", [summary.totalStudents])}
          tone={summary.needsAttention > 0 ? "warning" : "good"}
        />
        <StatTile
          icon={Calendar}
          label={ui("Attendance")}
          value={summary.attendanceRate !== null ? percent(summary.attendanceRate) : "—"}
          sub={summary.attendanceRate === null ? ui("Not recorded yet") : undefined}
          tone={summary.attendanceRate !== null && summary.attendanceRate < 85 ? "warning" : "good"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <InsightCard
          icon={BarChart3}
          title={ui("Results by class")}
          subtitle={ui("Average result in each class")}
          table={{ columns: [ui("Class"), ui("Average"), ui("Students")], rows: data.classPerformance.map((row) => [row.className, percent(row.average), row.students]) }}
        >
          {data.classPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={data.classPerformance} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={INK.grid} vertical={false} />
                <XAxis dataKey="className" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
                <Tooltip cursor={{ fill: INK.grid, opacity: 0.4 }} content={<VizTooltip unit="%" />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="average" name={ui("Average")} radius={[6, 6, 0, 0]} maxBarSize={44} fill={SERIES[0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label={ui("Charts appear after exam results are published.")} />}
        </InsightCard>

        <InsightCard
          icon={GraduationCap}
          title={ui("Grade distribution")}
          subtitle={ui("How many results fall in each grade")}
          table={{ columns: [ui("Grade"), ui("Results")], rows: grades.map((row) => [row.grade, row.count]) }}
        >
          {grades.length > 0 ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <PieChart>
                <Pie {...NO_ENTRY_ANIMATION} data={grades} cx="50%" cy="50%" innerRadius={58} outerRadius={96} paddingAngle={2} dataKey="count" nameKey="grade" stroke="none">
                  {grades.map((entry) => <Cell key={entry.grade} fill={GRADE_COLOR[entry.grade] ?? STATUS.neutral} />)}
                </Pie>
                <Tooltip content={<VizTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart label={ui("Charts appear after exam results are published.")} />}
        </InsightCard>

        <InsightCard
          icon={BookOpen}
          title={ui("Results by subject")}
          subtitle={ui("Average result in each subject")}
          table={{ columns: [ui("Subject"), ui("Average"), ui("Results")], rows: data.subjectPerformance.map((row) => [row.subject, percent(row.average), row.entries]) }}
        >
          {data.subjectPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={data.subjectPerformance} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={INK.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis dataKey="subject" type="category" tick={AXIS_TICK} tickLine={false} axisLine={false} width={84} />
                <Tooltip cursor={{ fill: INK.grid, opacity: 0.4 }} content={<VizTooltip unit="%" />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="average" name={ui("Average")} radius={[0, 6, 6, 0]} maxBarSize={22} fill={SERIES[0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label={ui("Charts appear after exam results are published.")} />}
        </InsightCard>

        <InsightCard
          icon={TrendingUp}
          title={ui("Results over time")}
          subtitle={ui("Average result in each exam this year")}
          table={{ columns: [ui("Exam"), ui("Class"), ui("Average")], rows: data.examTrends.map((row) => [row.title, row.className, percent(row.average)]) }}
        >
          {data.examTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={data.examTrends} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={INK.grid} vertical={false} />
                <XAxis dataKey="title" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
                <Tooltip content={<VizTooltip unit="%" />} />
                <Line {...NO_ENTRY_ANIMATION} type="monotone" dataKey="average" name={ui("Average")} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart label={ui("Charts appear after exam results are published.")} />}
        </InsightCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <InsightCard icon={Award} title={ui("Top results")} subtitle={ui("The highest overall results this year")}>
          {data.topStudents.length > 0 ? (
            <ol className="space-y-1.5">
              {data.topStudents.map((student, index) => (
                <li key={`${student.rollNo}-${index}`} data-tone={index < 3 ? "success" : undefined} className={cn(deskRow, "flex items-center justify-between gap-3 py-2.5")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className={index < 3 ? "grid size-6 shrink-0 place-items-center rounded-lg bg-primary text-2xs font-bold text-primary-foreground" : "grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-2xs font-bold text-ink-muted"}>
                      <bdi>{index + 1}</bdi>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-strong"><bdi>{student.name}</bdi></p>
                      <p className="text-xs tabular-nums text-ink-subtle"><bdi>{student.rollNo}</bdi></p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <bdi className="text-sm font-bold tabular-nums text-primary">{percent(student.percentage)}</bdi>
                    <Badge variant="neutral" size="sm"><bdi>{student.grade}</bdi></Badge>
                  </div>
                </li>
              ))}
            </ol>
          ) : <EmptyState size="sm" icon={Award} title={ui("No results yet")} description={ui("Rankings appear once exam results are published.")} />}
        </InsightCard>

        <InsightCard icon={TrendingDown} title={ui("Students needing attention")} subtitle={ui("Flagged by their results or attendance")}>
          {data.atRiskStudents.length > 0 ? (
            <ul className="space-y-1.5">
              {data.atRiskStudents.map((student, index) => (
                <li key={`${student.rollNo}-${index}`} data-tone="danger" className={cn(deskRow, "flex flex-wrap items-center justify-between gap-3 py-2.5")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <DeskRowIcon icon={TrendingDown} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-strong"><bdi>{student.name}</bdi></p>
                      <p className="text-xs tabular-nums text-ink-subtle"><bdi>{student.rollNo}</bdi></p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <bdi className="text-sm font-bold tabular-nums text-status-error-text">{percent(student.percentage)}</bdi>
                    {student.attendancePct !== null ? (
                      <DeskPill tone={student.attendancePct < 75 ? "danger" : "success"} className="tabular-nums">
                        {ui("{0} attendance", [percent(student.attendancePct)])}
                      </DeskPill>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState size="sm" icon={TrendingDown} title={ui("No students need attention")} description={ui("No student is currently flagged by their results or attendance.")} />}
        </InsightCard>
      </div>
    </div>
  );
}
