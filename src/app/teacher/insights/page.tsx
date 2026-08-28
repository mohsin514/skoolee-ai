"use client";

import { useMemo } from "react";
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

export default function TeacherInsightsPage() {
  const { data, loading, error, refetch } = useTeacherData();
  const router = useRouter();

  const attendanceStats = data?.attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };

  const attendanceChartData = useMemo(() => [
    { name: "Present", value: attendanceStats.present, color: "#10b981" },
    { name: "Absent", value: attendanceStats.absent, color: "#ef4444" },
    { name: "Leave", value: attendanceStats.leave, color: "#f59e0b" },
    { name: "Unmarked", value: attendanceStats.unmarked, color: "#d1d5db" },
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
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          {/* Attendance Donut */}
          <div className="sk-rise bg-white rounded-[24px] p-4 border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf]">
                  <CalendarCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black tracking-tight text-[#1d1b20]">Attendance Breakdown</h3>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Daily overview</p>
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
                <div className="flex-1 space-y-2">
                  {[
                    { label: "Present", value: attendanceStats.present, color: "#10b981" },
                    { label: "Absent", value: attendanceStats.absent, color: "#ef4444" },
                    { label: "Leave", value: attendanceStats.leave, color: "#f59e0b" },
                    { label: "Unmarked", value: attendanceStats.unmarked, color: "#d1d5db" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">{item.label}</span>
                      </div>
                      <span className="text-xs font-bold text-[#1d1b20]">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[140px] rounded-2xl bg-[#fbf0fe]/40">
                <p className="text-xs font-bold text-ink-subtle">No attendance data yet</p>
              </div>
            )}
          </div>

          {/* Marks Progress Bar Chart */}
          <div className="sk-rise bg-white rounded-[24px] p-4 border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf]">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black tracking-tight text-[#1d1b20]">Marks Progress</h3>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Entry status</p>
                </div>
              </div>
              <div className={`px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${completionRate >= 80 ? "bg-emerald-50 text-emerald-600" : completionRate >= 50 ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"}`}>
                {completionRate}% Complete
              </div>
            </div>
            {marksProgressData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={marksProgressData} barCategoryGap="20%" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fontWeight: 700 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", fontSize: 12, fontWeight: 700 }} cursor={{ fill: "#fbf0fe" }} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="Entered" stackId="a" fill="#8127cf" radius={[4, 4, 0, 0]} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="Missing" stackId="a" fill="#e8e0ec" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[160px] rounded-2xl bg-[#fbf0fe]/40">
                <p className="text-xs font-bold text-ink-subtle">No exam data yet</p>
              </div>
            )}
          </div>

          {/* Performance Summary */}
          <div className="sk-rise bg-white rounded-[24px] p-4 border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black tracking-tight text-[#1d1b20]">Quick Insights</h3>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Snapshot</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {[
                {
                  label: "Marks Completion", value: `${completionRate}%`, sub: `${marksProgressData.reduce((s: number, d: any) => s + d.Entered, 0)} of ${marksProgressData.reduce((s: number, d: any) => s + d.total, 0)} entries`,
                  progress: completionRate, color: "bg-[#8127cf]",
                },
                {
                  label: "Attendance Rate", value: attendanceStats.total ? `${Math.round(attendanceStats.present / Math.max(attendanceStats.total, 1) * 100)}%` : "—",
                  sub: `${attendanceStats.present} present out of ${attendanceStats.total}`,
                  progress: attendanceStats.total ? Math.round(attendanceStats.present / attendanceStats.total * 100) : 0, color: "bg-emerald-500",
                },
                {
                  // A count is not a percentage. This drew a bar at
                  // `count * 20`, so five report cards read as "100% complete"
                  // of nothing in particular. It is a figure, so show a figure.
                  label: "Report Cards", value: String(reportCardCount), sub: "Recently generated",
                  progress: null, color: "bg-rose-500",
                },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{item.label}</span>
                    <span className="text-sm font-black tabular-nums text-[#1d1b20]">{item.value}</span>
                  </div>
                  {typeof item.progress === "number" ? (
                    <div
                      className="h-2 overflow-hidden rounded-full bg-[#f3f4f9]"
                      role="progressbar"
                      aria-valuenow={item.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={item.label}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${item.color}`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  ) : null}
                  {item.sub ? (
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">{item.sub}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Class by class ── */}
        {classBreakdown.length > 0 ? (
          <div className="sk-rise overflow-hidden rounded-[24px] border border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#cfc2d6]/12 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf]">
                  <GraduationCap className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black tracking-tight text-[#1d1b20]">Class by class</h3>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                    Sorted by what needs you first
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
                {classBreakdown.length} class{classBreakdown.length === 1 ? "" : "es"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="bg-[#fbf0fe]/40 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    <th className="px-4 py-3">Class</th>
                    <th className="px-3 py-3 text-center">Students</th>
                    <th className="px-3 py-3 text-center">In today</th>
                    <th className="px-3 py-3 text-center">Assessments</th>
                    <th className="px-3 py-3">Marks entered</th>
                    <th className="px-3 py-3 text-center">Missing</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f9]">
                  {classBreakdown.map((cls) => (
                    <tr key={cls.id} className="transition-colors hover:bg-[#fbf0fe]/20">
                      <td className="px-4 py-3">
                        <p className="text-sm font-black text-[#1d1b20]">{cls.label}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                          {cls.role} · {cls.subjects} subject{cls.subjects === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-black tabular-nums text-[#1d1b20]">
                        {cls.students}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {cls.attendanceRate === null ? (
                          <span className="text-[11px] font-semibold text-ink-subtle">—</span>
                        ) : (
                          <span className={cn(
                            "inline-flex flex-col items-center leading-tight",
                            cls.unmarked > 0 ? "text-amber-700" : "text-emerald-700",
                          )}>
                            <span className="text-sm font-black tabular-nums">{cls.present}/{cls.students}</span>
                            <span className="text-[10px] font-bold tabular-nums opacity-75">
                              {cls.unmarked > 0 ? `${cls.unmarked} unmarked` : `${cls.attendanceRate}%`}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-black tabular-nums text-[#1d1b20]">
                        {cls.exams}
                      </td>
                      <td className="px-3 py-3">
                        {cls.completion === null ? (
                          <span className="text-[11px] font-semibold text-ink-subtle">No assessments yet</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-[#f3f4f9]"
                              role="progressbar"
                              aria-valuenow={cls.completion}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`Marks entered for ${cls.label}`}
                            >
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-700",
                                  cls.completion >= 80 ? "bg-emerald-500" : cls.completion >= 40 ? "bg-amber-500" : "bg-rose-500",
                                )}
                                style={{ width: `${cls.completion}%` }}
                              />
                            </div>
                            <span className="shrink-0 text-[11px] font-black tabular-nums text-ink-muted">
                              {cls.completion}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {cls.missing > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-black tabular-nums text-rose-700">
                            <AlertCircle className="h-3 w-3" />
                            {cls.missing}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-600">All in</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* An insight the teacher cannot act on from where they
                            read it is just a number. */}
                        <div className="inline-flex gap-1.5">
                          <button type="button"
                            onClick={() => router.push(`/teacher/attendance?classId=${encodeURIComponent(cls.id)}`)}
                            title={`Mark attendance for ${cls.label}`}
                            className="cursor-pointer rounded-lg bg-[#fbf0fe] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                            Attendance
                          </button>
                          <button type="button"
                            onClick={() => router.push(`/teacher/marks?classId=${encodeURIComponent(cls.id)}`)}
                            title={`Enter marks for ${cls.label}`}
                            className="cursor-pointer rounded-lg bg-[#fbf0fe] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                            Marks
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </TeacherPage>
  );
}