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
import { useUiText } from "@/components/locale/LocaleProvider";

export default function TeacherInsightsPage() {
  const ui = useUiText();
  const { data, loading, error, refetch } = useTeacherData();
  const router = useRouter();

  const attendanceStats = data?.attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };

  const attendanceChartData = useMemo(() => [
    { name: ui("Present"), value: attendanceStats.present, color: "var(--color-status-success-text)" },
    { name: ui("Absent"), value: attendanceStats.absent, color: "var(--color-status-error-text)" },
    { name: ui("Leave"), value: attendanceStats.leave, color: "var(--color-status-warning-text)" },
    { name: ui("Unmarked"), value: attendanceStats.unmarked, color: "var(--color-border-subtle)" },
  ].filter((d) => d.value > 0), [attendanceStats, ui]);

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
      title="My teaching evidence"
      description="The evidence your academic lead records with you, where you can respond, and how each of your classes is doing."
    >
      <div className="space-y-3">
        {/* SKO-461: the teacher's own bounded evidence and a place to respond — what this page is for. */}
        <TeacherPerformancePanel self />
        <div className="sk-stagger grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {/* Attendance Donut */}
          <div className="sk-panel min-w-0 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                  <CalendarCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">{ui("Attendance breakdown")}</h2>
                  <p className="sk-eyebrow">{ui("Today")}</p>
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
                        <span className="truncate text-xs font-medium text-ink-muted">{ui(item.label)}</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-ink-strong"><bdi>{item.value}</bdi></span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                size="sm"
                icon={CalendarCheck}
                title={ui("No attendance data yet")}
                description={ui("No students are enrolled in your classes yet, so there is nothing to count today.")}
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
                  <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">{ui("Marks progress")}</h2>
                  <p className="sk-eyebrow">{ui("Entry status")}</p>
                </div>
              </div>
              {marksProgressData.length > 0 ? (
                <span className="inline-flex items-center gap-0.5">
                  <Badge size="sm" dot data-numeric variant={completionRate >= 80 ? "success" : completionRate >= 50 ? "warning" : "danger"}>
                    {ui("{0}% complete", [completionRate])}
                  </Badge>
                  <InfoTip content={ui("Marks entered out of marks expected, across the assessments in this chart (up to five).")} />
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
                title={ui("No exam data yet")}
                description={ui("Entry progress shows here once an assessment exists for one of your classes.")}
                className="rounded-2xl bg-surface-subtle"
                action={
                  <Button size="sm" variant="secondary" type="button" onClick={() => router.push("/teacher/marks")}>
                    {ui("Go to Marks")}
                  </Button>
                }
              />
            )}
          </div>

          {/* Performance Summary */}
          <div className="sk-panel min-w-0 p-4 md:col-span-2 xl:col-span-1">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-status-warning-surface text-status-warning-text">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">{ui("Quick insights")}</h2>
                  <p className="sk-eyebrow">{ui("Snapshot")}</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {[
                {
                  label: ui("Marks completion"), value: `${completionRate}%`,
                  sub: ui("{0} of {1} entries", [marksProgressData.reduce((s: number, d: any) => s + d.Entered, 0), marksProgressData.reduce((s: number, d: any) => s + d.total, 0)]),
                  progress: completionRate, tone: "brand" as const,
                  info: ui("Marks entered out of marks expected, across the assessments in this chart (up to five)."),
                },
                {
                  label: ui("Attendance rate"), value: attendanceStats.total ? `${Math.round(attendanceStats.present / Math.max(attendanceStats.total, 1) * 100)}%` : "—",
                  sub: ui("{0} present out of {1}", [attendanceStats.present, attendanceStats.total]),
                  progress: attendanceStats.total ? Math.round(attendanceStats.present / attendanceStats.total * 100) : 0, tone: "success" as const,
                  info: ui("Students marked present today out of every student in your classes. Students not yet marked count as not present."),
                },
                {
                  // A count is not a percentage. This drew a bar at
                  // `count * 20`, so five report cards read as "100% complete"
                  // of nothing in particular. It is a figure, so show a figure.
                  label: ui("Report cards"), value: String(reportCardCount), sub: ui("Recently generated"),
                  progress: null, tone: "danger" as const,
                  info: null,
                },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-0.5">
                      <span className="truncate text-2xs font-semibold text-ink-muted">{item.label}</span>
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
                  <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">{ui("Class by class")}</h2>
                  <p className="text-xs text-ink-subtle">
                    {ui("Sorted by what needs you first")}
                  </p>
                </div>
              </div>
              <Badge variant="neutral" size="sm" data-numeric className="shrink-0">
                {ui("{0} classes", [classBreakdown.length])}
              </Badge>
            </div>

              <Table containerClassName="overflow-x-auto" className="w-full min-w-[720px] text-start">
                <TableHeader>
                  <TableRow className="bg-brand-50/40 text-ink-muted">
                    <TableHead className="px-4 py-3">{ui("Class")}</TableHead>
                    <TableHead className="px-3 py-3 text-center">{ui("Students")}</TableHead>
                    <TableHead className="px-3 py-3 text-center">
                      <span className="inline-flex items-center gap-0.5">{ui("In today")}<InfoTip className="-my-1" content={ui("Students marked present today out of the class roster. Until the register is complete it shows how many are still unmarked.")} /></span>
                    </TableHead>
                    <TableHead className="px-3 py-3 text-center">{ui("Assessments")}</TableHead>
                    <TableHead className="px-3 py-3">{ui("Marks entered")}</TableHead>
                    <TableHead className="px-3 py-3 text-center">
                      <span className="inline-flex items-center gap-0.5">{ui("Missing")}<InfoTip className="-my-1" content={ui("Marks still to enter for this class's assessments, in the subjects you can mark.")} /></span>
                    </TableHead>
                    <TableHead className="px-4 py-3"><span className="sr-only">{ui("Actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-muted">
                  {classBreakdown.map((cls) => (
                    <TableRow key={cls.id}>
                      <TableCell className="px-4 py-3">
                        <p className="text-sm font-semibold text-ink-strong">{cls.label}</p>
                        <p className="text-xs text-ink-subtle">
                          {ui(cls.role)} · {ui("{0} subjects", [cls.subjects])}
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
                            cls.unmarked > 0 ? "text-status-warning-text" : "text-status-success-text",
                          )}>
                            <span className="text-sm font-bold tabular-nums">{cls.present}/{cls.students}</span>
                            <span className="text-2xs font-semibold tabular-nums">
                              {cls.unmarked > 0 ? ui("{0} unmarked", [cls.unmarked]) : `${cls.attendanceRate}%`}
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-sm tabular-nums text-ink-strong">
                        {cls.exams}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        {cls.completion === null ? (
                          <span className="text-xs text-ink-subtle">{ui("No assessments yet")}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Progress
                              className="min-w-[80px]"
                              size="sm"
                              value={cls.completion}
                              label={ui("Marks entered for {0}", [cls.label])}
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
                          <Badge variant="success" size="sm" dot>{ui("All in")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-end">
                        {/* An insight the teacher cannot act on from where they
                            read it is just a number. */}
                        <div className="inline-flex gap-1.5">
                          <HintTooltip content={ui("Mark attendance for {0}", [cls.label])}>
                            <Button variant="secondary" size="sm" type="button"
                              onClick={() => router.push(`/teacher/attendance?classId=${encodeURIComponent(cls.id)}`)}
                            >
                              {ui("Attendance")}
                            </Button>
                          </HintTooltip>
                          <HintTooltip content={ui("Enter marks for {0}", [cls.label])}>
                            <Button variant="secondary" size="sm" type="button"
                              onClick={() => router.push(`/teacher/marks?classId=${encodeURIComponent(cls.id)}`)}
                            >
                              {ui("Marks")}
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
        {/* Learning actions moved to Students (M65). */}
      </div>
    </TeacherPage>
  );
}
