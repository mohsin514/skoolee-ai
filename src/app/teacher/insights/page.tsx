"use client";

import { useMemo } from "react";
import { BarChart3, CalendarCheck, TrendingUp } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DashboardSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";
import { useTeacherData } from "../teacher-data-context";

export default function TeacherInsightsPage() {
  const { data, loading, error, refetch } = useTeacherData();

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

  const reportCardCount = data?.recentReportCards?.length || 0;
  const completionRate = marksProgressData.length
    ? Math.round(marksProgressData.reduce((s: number, d: any) => s + d.Entered, 0) / Math.max(marksProgressData.reduce((s: number, d: any) => s + d.total, 0), 1) * 100)
    : 0;

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white border-b border-[#cfc2d6]/12 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <BarChart3 className="w-4 h-4" />
            <p className="text-[10px] font-semibold uppercase tracking-wider">My Performance</p>
          </div>
          <h1 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Insights</h1>
          <p className="mt-1 text-sm font-semibold text-ink-muted">Attendance, marks progress and quick metrics across your work</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 bg-[#fbf0fe]/20 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Attendance Donut */}
          <div className="sk-rise bg-white rounded-[32px] p-6 border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Daily Overview</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Attendance Breakdown</h3>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf]">
                <CalendarCheck className="h-5 w-5" />
              </div>
            </div>
            {attendanceChartData.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="shrink-0">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={attendanceChartData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value" stroke="none">
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
          <div className="sk-rise bg-white rounded-[32px] p-6 border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Entry Status</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Marks Progress</h3>
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
                  <Bar dataKey="Entered" stackId="a" fill="#8127cf" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Missing" stackId="a" fill="#e8e0ec" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[160px] rounded-2xl bg-[#fbf0fe]/40">
                <p className="text-xs font-bold text-ink-subtle">No exam data yet</p>
              </div>
            )}
          </div>

          {/* Performance Summary */}
          <div className="sk-rise bg-white rounded-[32px] p-6 border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Snapshot</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Quick Insights</h3>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="space-y-4">
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
                  label: "Report Cards", value: String(reportCardCount), sub: "Generated",
                  progress: Math.min(reportCardCount * 20, 100), color: "bg-rose-500",
                },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">{item.label}</span>
                    <span className="text-sm font-bold text-[#1d1b20]">{item.value}</span>
                  </div>
                  <div className="h-2 bg-[#f3f4f9] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${item.color}`} style={{ width: `${item.progress}%` }} />
                  </div>
                  {item.sub ? <p className="mt-0.5 text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">{item.sub}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}