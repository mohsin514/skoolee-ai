"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, X, Clock } from "lucide-react";
import { AttendanceSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";

export default function StudentAttendancePage() {
  const { data, loading, error, refetch } = useStudentData();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const stats = useMemo(() => {
    if (!data?.user?.attendance) return { total: 0, present: 0, absent: 0, leave: 0, rate: 0 };
    const att = data.user.attendance;
    return {
      total: att.length,
      present: att.filter((e: any) => e.status === "PRESENT").length,
      absent: att.filter((e: any) => e.status === "ABSENT").length,
      leave: att.filter((e: any) => e.status === "LEAVE").length,
      rate: data.user.attendanceRate || 0,
    };
  }, [data]);

  const monthRecords = useMemo(() => {
    if (!data?.user?.attendance?.length) return [];
    const [y, m] = selectedMonth.split("-").map(Number);
    return data.user.attendance.filter((e: any) => {
      const d = new Date(e.date);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    }).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, selectedMonth]);

  const monthStats = useMemo(() => {
    const present = monthRecords.filter((r: any) => r.status === "PRESENT").length;
    const absent = monthRecords.filter((r: any) => r.status === "ABSENT").length;
    const leave = monthRecords.filter((r: any) => r.status === "LEAVE").length;
    const total = monthRecords.length;
    const percentage = total > 0 ? Math.round(((present + leave) / total) * 100) : 0;
    return { present, absent, leave, total, percentage };
  }, [monthRecords]);

  const calendarDays = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const recordMap = new Map<number, any>();
    monthRecords.forEach((r: any) => {
      const d = new Date(r.date).getDate();
      recordMap.set(d, r);
    });
    const days: ({ day: number; record: any } | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push({ day: d, record: recordMap.get(d) || null });
    return days;
  }, [selectedMonth, monthRecords]);

  const consecutiveAbsences = useMemo(() => {
    if (!data?.user?.attendance?.length) return 0;
    const sorted = [...data.user.attendance].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    let count = 0;
    for (const r of sorted) {
      if (r.status === "ABSENT") count++;
      else break;
    }
    return count;
  }, [data]);

  const groupedByMonth = useMemo(() => {
    if (!data?.user?.attendance?.length) return [];
    const groups: { label: string; key: string; entries: any[] }[] = [];
    const sorted = [...data.user.attendance].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    sorted.forEach((entry: any) => {
      const d = new Date(entry.date);
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = groups.find((g) => g.key === key);
      if (existing) existing.entries.push(entry);
      else groups.push({ label, key, entries: [entry] });
    });
    return groups;
  }, [data]);

  function adjustMonth(dir: number) {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthLabel = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  })();

  if (loading && !data) return <AttendanceSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data || !data.user) return null;

  const isAtRisk = stats.rate > 0 && stats.rate < 75;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <CalendarCheck className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {stats.total ? `${stats.rate}% overall · ${stats.total} days recorded` : "No attendance data yet"}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">My Attendance</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">
            {data.user.className} · {data.user.campusName}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        {isAtRisk && (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200/50 px-5 py-4 shadow-sm">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">Attendance Below 75%</p>
              <p className="text-xs font-semibold text-amber-700/70">
                Your attendance is at {stats.rate}%. Regular attendance is important for academic success.
                {consecutiveAbsences >= 3 && ` You have ${consecutiveAbsences} consecutive absences.`}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={CalendarDays} label="Total Days" value={stats.total} sub="School days recorded" />
          <StatCard icon={CheckCircle2} label="Present" value={stats.present} sub={`${stats.total ? Math.round((stats.present / stats.total) * 100) : 0}% of total`} tone="green" />
          <StatCard icon={X} label="Absent" value={stats.absent} sub={consecutiveAbsences > 0 ? `${consecutiveAbsences} consecutive` : "No consecutive"} tone="rose" />
          <StatCard icon={Clock} label="Leave" value={stats.leave} sub="Approved leaves" tone="amber" />
        </div>

        <div className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Monthly Calendar</h3>
            <div className="flex items-center gap-3">
              <button onClick={() => adjustMonth(-1)} className="h-8 w-8 rounded-xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-lg">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-[#1d1b20] min-w-[140px] text-center">{monthLabel}</span>
              <button onClick={() => adjustMonth(1)} className="h-8 w-8 rounded-xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-lg">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2 rounded-xl bg-[#fbf0fe]/50 px-3 py-1.5 border border-[#cfc2d6]/10">
              <span className="text-xs font-bold text-[#1d1b20]">{monthStats.percentage}%</span>
              <span className="text-[9px] font-semibold text-[#4d4354]/50">this month</span>
            </div>
            <div className="flex gap-3">
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />P: {monthStats.present}</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" />A: {monthStats.absent}</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />L: {monthStats.leave}</span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider py-2">{d}</div>
            ))}
            {calendarDays.map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} />;
              const status = cell.record?.status;
              const bg = status === "PRESENT"
                ? "bg-emerald-50 border-emerald-200/50 text-emerald-700"
                : status === "ABSENT"
                ? "bg-rose-50 border-rose-200/50 text-rose-700"
                : status === "LEAVE"
                ? "bg-amber-50 border-amber-200/50 text-amber-700"
                : "bg-[#f3f4f9]/30 border-transparent text-[#4d4354]/30";
              return (
                <div key={cell.day} className={`relative flex flex-col items-center justify-center rounded-xl border py-2.5 transition-all ${bg} ${status ? "hover:shadow-md hover:-translate-y-0.5" : ""}`}>
                  <span className="text-xs font-bold">{cell.day}</span>
                  {status && (
                    <span className="text-[7px] font-bold uppercase tracking-wider mt-0.5">
                      {status === "PRESENT" ? "P" : status === "ABSENT" ? "A" : "L"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Attendance History</h3>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />Present</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" />Absent</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Leave</span>
            </div>
          </div>
          {data.user.attendance.length > 0 ? (
            <div className="space-y-5">
              {groupedByMonth.map((group) => (
                <div key={group.key}>
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
              <p className="mt-1 text-xs font-semibold text-[#4d4354]/55">Attendance will appear here after your teacher marks it.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = "purple" }: { icon: any; label: string; value: string | number; sub: string; tone?: string }) {
  const iconColors: Record<string, string> = {
    purple: "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
    green: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
    rose: "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white",
    amber: "bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white",
  };
  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider transition-colors group-hover:text-[#4d4354]/60">{label}</p>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${iconColors[tone] || iconColors.purple}`}>
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
    LEAVE: { label: "Leave", bg: "bg-amber-50 text-amber-600 border-amber-200/50 hover:bg-amber-100 hover:border-amber-300", dot: "bg-amber-500" },
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
          {entry.notes && <p className="text-[9px] font-semibold text-[#4d4354]/40">{entry.notes}</p>}
          {entry.marker?.fullName && (
            <p className="text-[9px] font-semibold text-[#4d4354]/30">Marked by {entry.marker.fullName}</p>
          )}
        </div>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[9px] font-bold uppercase tracking-wider border shadow-sm transition-all duration-200 group-hover:shadow-md ${cfg.bg}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    </div>
  );
}
