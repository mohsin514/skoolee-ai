"use client";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Tooltip as HintTooltip, InfoTip } from "@/components/ui/tooltip";
import { useMemo, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BarChart3, CalendarCheck, GraduationCap, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { classLabel } from "@/components/teacher/teacher-components";
import { TeacherPage } from "@/components/teacher/teacher-page";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { NO_ENTRY_ANIMATION } from "@/components/insights";
import {
  DashboardSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";
import { useTeacherData } from "../teacher-data-context";
import { TeacherPerformancePanel } from "@/components/academic-year/TeacherPerformancePanel";
import { LearningActions } from "@/components/learning/learning-actions";

export default function TeacherInsightsPage() {
  const { data, loading, error, refetch } = useTeacherData();
  const router = useRouter();

  const attendanceStats = data?.attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };

  const attendanceChartData = useMemo(() => [
    { name: "Present", value: attendanceStats.present, color: "var(--color-status-success-text)" },
    { name: "Absent", value: attendanceStats.absent, color: "var(--color-status-error-text)" },
    { name: "Leave", value: attendanceStats.leave, color: "var(--color-status-warning-text)" },
    { name: "Unmarked", value: attendanceStats.unmarked, color: "var(--color-border-subtle)" },
  ].filter((d) => d.value > 0), [attendanceStats]);

  const marksProgressData = useMemo(() => {
    const exams = (data?.exams || []).slice(0, 5);
    return exams.map((exam: any) => ({
      name: exam.title.length > 12 ? exam.title.slice(0, 12) + "…" : exam.title,
      Entered: exam.enteredMarks || 0,
      Missing: exam.missingMarks || 0,
      total: (exam.enteredMarks || 0) + (exam.missingMarks || 0),
    }));
  }, [data]);

  /* The page reported one number per metric for the teacher's whole load,
     which is the one shape that cannot answer the question they actually
     have: *which* class is behind. Everything here comes from the payload the
     page already holds, so the breakdown costs nothing. */
  const classBreakdown = useMemo(() => {
    const classHubs: any[] = data?.classHubs || [];
    const students: any[] = data?.students || [];
    const exams: any[] = data?.exams || [];
    return classHubs
      .map((cls) => {
        const roster = students.filter((st) => st.class?.id === cls.id);
        const clsExams = exams.filter((ex) => ex.classId === cls.id);
        const entered = clsExams.reduce((sum, ex) => sum + (ex.enteredMarks || 0), 0);
        const expected = clsExams.reduce((sum, ex) => sum + (ex.expectedMarks || 0), 0);
        const missing = clsExams.reduce((sum, ex) => sum + (ex.missingMarks || 0), 0);
        const present = roster.filter((st) => st.todayAttendance === "PRESENT").length;
        const unmarked = roster.filter((st) => !st.todayAttendance).length;
        return {
          id: cls.id,
          label: classLabel(cls),
          role: cls.role || "Teacher",
          students: roster.length,
          subjects: cls.subjects?.length || 0,
          exams: clsExams.length,
          missing,
          completion: expected > 0 ? Math.round((entered / expected) * 100) : null,
          present,
          unmarked,
          attendanceRate: roster.length ? Math.round((present / roster.length) * 100) : null,
        };
      })
      // Whatever needs the teacher most goes to the top of the list.
      .sort((a, b) => b.missing - a.missing || b.unmarked - a.unmarked);
  }, [data]);

  const reportCardCount = data?.recentReportCards?.length || 0;
  const completionRate = marksProgressData.length
    ? Math.round(marksProgressData.reduce((s: number, d: any) => s + d.Entered, 0) / Math.max(marksProgressData.reduce((s: number, d: any) => s + d.total, 0), 1) * 100)
    : 0;

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  return (
    <TeacherPage
      icon={BarChart3}
      eyebrow="My Performance"
      title="Insights"
      summary="Attendance, marks progress and quick metrics across your work"
    >
      <div className="space-y-3">
        <div className="sk-stagger grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {/* Attendance Donut */}
          <div className="sk-panel min-w-0 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                  <CalendarCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">Attendance Breakdown</h2>
                  <p className="sk-eyebrow">Today</p>
                </div>
              </div>
            </div>
            {attendanceChartData.length > 0 ? (
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie {...NO_ENTRY_ANIMATION} data={attendanceChartData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value" stroke="none">
                        {attendanceChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {[
                    { label: "Present", value: attendanceStats.present, color: "var(--color-status-success-text)" },
                    { label: "Absent", value: attendanceStats.absent, color: "var(--color-status-error-text)" },
                    { label: "Leave", value: attendanceStats.leave, color: "var(--color-status-warning-text)" },
                    { label: "Unmarked", value: attendanceStats.unmarked, color: "var(--color-border-subtle)" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="truncate text-xs font-medium text-ink-muted">{item.label}</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-ink-strong">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                size="sm"
                icon={CalendarCheck}
                title="No attendance data yet"
                description="No students are enrolled in your classes yet, so there is nothing to count today."
                className="rounded-2xl bg-surface-subtle"
              />
            )}
          </div>

          {/* Marks Progress Bar Chart */}
          <div className="sk-panel min-w-0 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">Marks Progress</h2>
                  <p className="sk-eyebrow">Entry status</p>
                </div>
              </div>
              {marksProgressData.length > 0 ? (
                <span className="inline-flex items-center gap-0.5">
                  <Badge size="sm" dot data-numeric variant={completionRate >= 80 ? "success" : completionRate >= 50 ? "warning" : "danger"}>
                    {completionRate}% Complete
                  </Badge>
                  <InfoTip content="Marks entered out of marks expected, across the assessments in this chart (up to five)." />
                </span>
              ) : null}
            </div>
            {marksProgressData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={marksProgressData} barCategoryGap="20%" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 8px 32px rgba(55,27,77,0.14)", fontSize: 12, fontWeight: 600 }} cursor={{ fill: "var(--color-surface-hover)" }} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="Entered" stackId="a" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="Missing" stackId="a" fill="var(--color-edge)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                size="sm"
                icon={BarChart3}
                title="No exam data yet"
                description="Entry progress shows here once an assessment exists for one of your classes."
                className="rounded-2xl bg-surface-subtle"
                action={
                  <Button size="sm" variant="secondary" type="button" onClick={() => router.push("/teacher/marks")}>
                    Go to marks
                  </Button>
                }
              />
            )}
          </div>

          {/* Performance Summary */}
          <div className="sk-panel min-w-0 p-4 md:col-span-2 xl:col-span-1">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">Quick Insights</h2>
                  <p className="sk-eyebrow">Snapshot</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {[
                {
                  label: "Marks Completion", value: `${completionRate}%`, sub: `${marksProgressData.reduce((s: number, d: any) => s + d.Entered, 0)} of ${marksProgressData.reduce((s: number, d: any) => s + d.total, 0)} entries`,
                  progress: completionRate, tone: "brand" as const,
                  info: "Marks entered out of marks expected, across the assessments in the chart (up to five).",
                },
                {
                  label: "Attendance Rate", value: attendanceStats.total ? `${Math.round(attendanceStats.present / Math.max(attendanceStats.total, 1) * 100)}%` : "—",
                  sub: `${attendanceStats.present} present out of ${attendanceStats.total}`,
                  progress: attendanceStats.total ? Math.round(attendanceStats.present / attendanceStats.total * 100) : 0, tone: "success" as const,
                  info: "Students marked present today out of every student in your classes. Students not yet marked count as not present.",
                },
                {
                  // A count is not a percentage. This drew a bar at
                  // `count * 20`, so five report cards read as "100% complete"
                  // of nothing in particular. It is a figure, so show a figure.
                  label: "Report Cards", value: String(reportCardCount), sub: "Recently generated",
                  progress: null, tone: "danger" as const,
                  info: null,
                },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-0.5">
                      <span className="truncate text-2xs font-semibold uppercase tracking-wider text-ink-muted">{item.label}</span>
                      {item.info ? <InfoTip className="-my-1" content={item.info} /> : null}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-ink-strong">{item.value}</span>
                  </div>
                  {typeof item.progress === "number" ? (
                    <Progress value={item.progress} label={item.label} tone={item.tone} size="sm" />
                  ) : null}
                  {item.sub ? (
                    <p className="mt-1 text-xs tabular-nums text-ink-subtle">{item.sub}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Class by class ── */}
        {classBreakdown.length > 0 ? (
          <div className="sk-panel sk-enter overflow-hidden" style={{ "--sk-delay": "120ms" } as CSSProperties}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge/12 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                  <GraduationCap className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">Class by class</h2>
                  <p className="text-xs text-ink-subtle">
                    Sorted by what needs you first
                  </p>
                </div>
              </div>
              <Badge variant="neutral" size="sm" data-numeric className="shrink-0">
                {classBreakdown.length} class{classBreakdown.length === 1 ? "" : "es"}
              </Badge>
            </div>

              <Table containerClassName="overflow-x-auto" className="w-full min-w-[720px] text-start">
                <TableHeader>
                  <TableRow className="bg-brand-50/40 text-ink-muted">
                    <TableHead className="px-4 py-3">Class</TableHead>
                    <TableHead className="px-3 py-3 text-center">Students</TableHead>
                    <TableHead className="px-3 py-3 text-center">
                      <span className="inline-flex items-center gap-0.5">In today<InfoTip className="-my-1" content="Students marked present today out of the class roster. Until the register is complete it shows how many are still unmarked." /></span>
                    </TableHead>
                    <TableHead className="px-3 py-3 text-center">Assessments</TableHead>
                    <TableHead className="px-3 py-3">Marks entered</TableHead>
                    <TableHead className="px-3 py-3 text-center">
                      <span className="inline-flex items-center gap-0.5">Missing<InfoTip className="-my-1" content="Marks still to enter for this class's assessments, in the subjects you can mark." /></span>
                    </TableHead>
                    <TableHead className="px-4 py-3"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-muted">
                  {classBreakdown.map((cls) => (
                    <TableRow key={cls.id}>
                      <TableCell className="px-4 py-3">
                        <p className="text-sm font-semibold text-ink-strong">{cls.label}</p>
                        <p className="text-xs text-ink-subtle">
                          {cls.role} · {cls.subjects} subject{cls.subjects === 1 ? "" : "s"}
                        </p>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-sm tabular-nums text-ink-strong">
                        {cls.students}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        {cls.attendanceRate === null ? (
                          <span className="text-xs text-ink-subtle">—</span>
                        ) : (
                          <span className={cn(
                            "inline-flex flex-col items-center leading-tight",
                            cls.unmarked > 0 ? "text-amber-700" : "text-emerald-700",
                          )}>
                            <span className="text-sm font-bold tabular-nums">{cls.present}/{cls.students}</span>
                            <span className="text-2xs font-semibold tabular-nums">
                              {cls.unmarked > 0 ? `${cls.unmarked} unmarked` : `${cls.attendanceRate}%`}
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-sm tabular-nums text-ink-strong">
                        {cls.exams}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        {cls.completion === null ? (
                          <span className="text-xs text-ink-subtle">No assessments yet</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Progress
                              className="min-w-[80px]"
                              size="sm"
                              value={cls.completion}
                              label={`Marks entered for ${cls.label}`}
                              tone={cls.completion >= 80 ? "success" : cls.completion >= 40 ? "warning" : "danger"}
                            />
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-muted">
                              {cls.completion}%
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        {cls.missing > 0 ? (
                          <Badge variant="danger" size="sm" data-numeric>
                            <AlertCircle aria-hidden="true" />
                            {cls.missing}
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm" dot>All in</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-end">
                        {/* An insight the teacher cannot act on from where they
                            read it is just a number. */}
                        <div className="inline-flex gap-1.5">
                          <HintTooltip content={`Mark attendance for ${cls.label}`}>
                            <Button variant="secondary" size="sm" type="button"
                              onClick={() => router.push(`/teacher/attendance?classId=${encodeURIComponent(cls.id)}`)}
                            >
                              Attendance
                            </Button>
                          </HintTooltip>
                          <HintTooltip content={`Enter marks for ${cls.label}`}>
                            <Button variant="secondary" size="sm" type="button"
                              onClick={() => router.push(`/teacher/marks?classId=${encodeURIComponent(cls.id)}`)}
                            >
                              Marks
                            </Button>
                          </HintTooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

          </div>
        ) : null}
        {/* SKO-461: the teacher's own bounded evidence and a place to respond. */}
        <TeacherPerformancePanel self />
        {/* SKO-425: learning actions the teacher owns or drafted. */}
        <LearningActions />
      </div>
    </TeacherPage>
  );
}
