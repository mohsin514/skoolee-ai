"use client";

import { useMemo } from "react";
import { CalendarCheck, Clock, MapPin, UserRound, X } from "lucide-react";
import { ScheduleSkeleton } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";

export default function SchedulePage() {
  const { data, loading } = useStudentData();

  const stats = useMemo(() => {
    if (!data?.user?.attendance) return { total: 0, present: 0, absent: 0, late: 0, rate: 0 };
    const att = data.user.attendance;
    return {
      total: att.length,
      present: att.filter((e: any) => e.status === "PRESENT").length,
      absent: att.filter((e: any) => e.status === "ABSENT").length,
      late: att.filter((e: any) => e.status === "LATE").length,
      rate: data.user.attendanceRate || 0,
    };
  }, [data]);

  const groupedByMonth = useMemo(() => {
    if (!data?.user?.attendance?.length) return [];
    const groups: { label: string; entries: any[] }[] = [];
    const sorted = [...data.user.attendance].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    sorted.forEach((entry: any) => {
      const d = new Date(entry.date);
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const existing = groups.find((g) => g.label === label);
      if (existing) existing.entries.push(entry);
      else groups.push({ label, entries: [entry] });
    });
    return groups;
  }, [data]);

  if (loading && !data) return <ScheduleSkeleton />;
  if (!data || !data.user) return null;

  const user = data.user;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <CalendarCheck className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {stats.total ? `${stats.rate}% attendance · ${stats.total} days` : "No attendance data"}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Schedule & Attendance</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">Current class assignment and daily attendance record.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryStat icon={CalendarCheck} label="Total Days" value={stats.total} sub="School days recorded" />
          <SummaryStat icon={CalendarCheck} label="Present" value={stats.present} sub={`${stats.total ? Math.round(stats.present / stats.total * 100) : 0}% rate`} tone="green" />
          <SummaryStat icon={X} label="Absent" value={stats.absent} sub={stats.late ? `${stats.late} late` : "No lates"} tone="rose" />
          <SummaryStat icon={Clock} label="Attendance" value={`${stats.rate}%`} sub={stats.rate >= 80 ? "Good standing" : stats.rate >= 60 ? "Needs improvement" : "At risk"} tone="purple" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="relative group rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#8127cf]/20 md:col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-2xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf] transition-all duration-300 group-hover:bg-[#8127cf] group-hover:text-white group-hover:shadow-lg group-hover:scale-110">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#4d4354]/40 uppercase tracking-wider transition-colors group-hover:text-[#4d4354]/60">Current Class</p>
                <p className="text-lg font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{user.className}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#fbf0fe]/30 p-4 border border-[#cfc2d6]/8 transition-all hover:bg-[#fbf0fe]/60 hover:shadow-md">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[#4d4354]/40">Class Teacher</p>
                <p className="mt-1.5 text-sm font-bold text-[#1d1b20]">{user.classTeacher?.fullName || "Not assigned"}</p>
                {user.classTeacher?.email && (
                  <p className="mt-0.5 text-[10px] font-semibold text-[#4d4354]/45">{user.classTeacher.email}</p>
                )}
              </div>
              <div className="rounded-2xl bg-[#fbf0fe]/30 p-4 border border-[#cfc2d6]/8 transition-all hover:bg-[#fbf0fe]/60 hover:shadow-md">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[#4d4354]/40">Enrolled Subjects</p>
                <p className="mt-1.5 text-sm font-bold text-[#1d1b20]">{user.subjects.length} subjects</p>
                <p className="mt-0.5 text-[10px] font-semibold text-[#4d4354]/45">
                  {user.subjects?.length ? user.subjects.map((s: any) => s.name).join(", ") : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="relative group rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-emerald-400/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 transition-all duration-300 group-hover:bg-emerald-600 group-hover:text-white group-hover:shadow-lg group-hover:scale-110">
                <UserRound className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#4d4354]/40 uppercase tracking-wider transition-colors group-hover:text-emerald-600/60">Profile</p>
                <p className="text-lg font-bold text-[#1d1b20] transition-colors group-hover:text-emerald-600">{user.rollNo || "N/A"}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-[#4d4354]/60">Name</span>
                <span className="font-bold text-[#1d1b20]">{user.fullName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-[#4d4354]/60">Class</span>
                <span className="font-bold text-[#1d1b20]">{user.className}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-[#4d4354]/60">Campus</span>
                <span className="font-bold text-[#1d1b20]">{user.campusName}</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Attendance History</h3>
            {stats.total > 0 && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />Present</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" />Absent</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Late</span>
              </div>
            )}
          </div>
          {user.attendance.length > 0 ? (
            <div className="space-y-5">
              {groupedByMonth.map((group) => (
                <div key={group.label}>
                  <p className="text-[11px] font-bold text-[#4d4354]/40 uppercase tracking-wider mb-2.5 px-1">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.entries.map((entry: any) => (
                      <AttendanceRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-[32px] bg-[#fbf0fe]/20 border border-dashed border-[#cfc2d6]/20">
              <CalendarCheck className="w-10 h-10 text-[#4d4354]/20 mb-3" />
              <p className="text-sm font-bold text-[#1d1b20]">No attendance recorded yet</p>
              <p className="mt-1 text-xs font-semibold text-[#4d4354]/55">Attendance will appear after a teacher marks it.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryStat({ icon: Icon, label, value, sub, tone = "dark" }: { icon: any; label: string; value: string | number; sub: string; tone?: string }) {
  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider transition-colors group-hover:text-[#4d4354]/60">{label}</p>
        <div className={cn(
          "h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg",
          tone === "green" ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white" :
          tone === "rose" ? "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white" :
          tone === "purple" ? "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white" :
          "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white"
        )}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
      <p className="text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-[#4d4354]/40">{sub}</p>
    </div>
  );
}

function AttendanceRow({ entry }: { entry: any }) {
  const date = new Date(entry.date);
  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const statusConfig: Record<string, { label: string; bg: string; dot: string }> = {
    PRESENT: { label: "Present", bg: "bg-emerald-50 text-emerald-600 border-emerald-200/50 hover:bg-emerald-100 hover:border-emerald-300", dot: "bg-emerald-500" },
    ABSENT: { label: "Absent", bg: "bg-rose-50 text-rose-600 border-rose-200/50 hover:bg-rose-100 hover:border-rose-300", dot: "bg-rose-500" },
    LATE: { label: "Late", bg: "bg-amber-50 text-amber-600 border-amber-200/50 hover:bg-amber-100 hover:border-amber-300", dot: "bg-amber-500" },
  };
  const cfg = statusConfig[entry.status] || { label: entry.status, bg: "bg-[#fbf0fe] text-[#8127cf] border-[#cfc2d6]/20", dot: "bg-[#8127cf]" };

  return (
    <div className="group flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3.5 border border-[#cfc2d6]/8 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:border-[#cfc2d6]/20">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center w-10">
          <span className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider">{dayName}</span>
          <span className="text-sm font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{formatted.split(" ")[1]}</span>
        </div>
        <div className="h-8 w-[1px] bg-[#cfc2d6]/15" />
        <div>
          <p className="text-xs font-semibold text-[#4d4354]/70">{formatted}</p>
          {entry.marker?.fullName && (
            <p className="text-[9px] font-semibold text-[#4d4354]/30">Marked by {entry.marker.fullName}</p>
          )}
        </div>
      </div>
      <span className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[9px] font-bold uppercase tracking-wider border shadow-sm transition-all duration-200 group-hover:shadow-md",
        cfg.bg
      )}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
