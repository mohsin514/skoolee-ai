"use client";

import { useMemo, useState } from "react";
import { ATTENDANCE_RISK_THRESHOLD, summarizeAttendance } from "@/lib/attendance";
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, X, Clock } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { AttendanceSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";

export default function StudentAttendancePage() {
  const { data, loading, error, refetch } = useStudentData();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Shared helper so this page, the dashboard, the parent portal, and the
  // office's monthly report all quote the same percentage.
  const stats = useMemo(
    () => summarizeAttendance(data?.user?.attendance || []),
    [data],
  );

  const monthRecords = useMemo(() => {
    if (!data?.user?.attendance?.length) return [];
    const [y, m] = selectedMonth.split("-").map(Number);
    return data.user.attendance.filter((e: any) => {
      const d = new Date(e.date);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    }).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, selectedMonth]);

  const monthStats = useMemo(() => summarizeAttendance(monthRecords), [monthRecords]);

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

  const isAtRisk = stats.rate !== null && stats.rate < ATTENDANCE_RISK_THRESHOLD;

  return (
    <StudentPage
      icon={CalendarCheck}
      eyebrow={<>{stats.total ? `${stats.rate}% overall · ${stats.total} days recorded` : "No attendance data yet"}</>}
      title="My Attendance"
      summary={<>{`${data.user.className} · ${data.user.campusName}`}</>}
    >
      <div className="space-y-3">
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

        <div className="sk-rise grid grid-cols-2 md:grid-cols-4 gap-4" style={{ animationDelay: "40ms" }}>
          <StatCard icon={CalendarDays} label="Total Days" value={stats.total} sub="School days recorded" />
          <StatCard icon={CheckCircle2} label="Present" value={stats.present} sub={`${stats.total ? Math.round((stats.present / stats.total) * 100) : 0}% of total`} tone="green" />
          <StatCard icon={X} label="Absent" value={stats.absent} sub={consecutiveAbsences > 0 ? `${consecutiveAbsences} consecutive` : "No consecutive"} tone="rose" />
          <StatCard icon={Clock} label="Leave" value={stats.leave} sub="Approved leaves" tone="amber" />
        </div>

        <div className="sk-rise group rounded-[28px] bg-white border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Monthly Calendar</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#8127cf]/18" />
                <button onClick={() => adjustMonth(-1)} className="relative h-8 w-8 rounded-xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-lg">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm font-bold text-[#1d1b20] min-w-[140px] text-center">{monthLabel}</span>
              <div className="relative">
                <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#8127cf]/18" />
                <button onClick={() => adjustMonth(1)} className="relative h-8 w-8 rounded-xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-lg">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2 rounded-xl bg-[#fbf0fe]/50 px-3 py-1.5 border border-[#cfc2d6]/10">
              <span className="text-xs font-bold text-[#1d1b20]">{monthStats.rate ?? 0}%</span>
              <span className="text-[9px] font-semibold text-ink-muted">this month</span>
            </div>
            <div className="flex gap-3">
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />P: {monthStats.present}</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" />A: {monthStats.absent}</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />L: {monthStats.leave}</span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-[9px] font-bold text-ink-subtle uppercase tracking-wider py-2">{d}</div>
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
                : "bg-[#f3f4f9]/30 border-transparent text-ink-subtle";
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
            <div className="space-y-3">
              {groupedByMonth.map((group) => (
                <div key={group.key}>
                  <p className="text-[11px] font-bold text-ink-subtle uppercase tracking-wider mb-2.5 px-1">{group.label}</p>
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
              <CalendarCheck className="w-10 h-10 text-ink-subtle mb-3" />
              <p className="text-sm font-bold text-[#1d1b20]">No attendance recorded yet</p>
              <p className="mt-1 text-xs font-semibold text-ink-muted">Attendance will appear here after your teacher marks it.</p>
            </div>
          )}
        </div>
      </div>
    </StudentPage>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = "purple" }: { icon: any; label: string; value: string | number; sub: string; tone?: string }) {
  const iconColors: Record<string, string> = {
    purple: "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
    green: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
    rose: "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white",
    amber: "bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white",
  };
  const iconGlows: Record<string, string> = {
    purple: "bg-[#8127cf]/18",
    green: "bg-emerald-500/18",
    rose: "bg-rose-500/18",
    amber: "bg-amber-500/18",
  };
  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25">
      <div className="relative flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-ink-subtle uppercase tracking-wider transition-colors group-hover:text-ink-muted">{label}</p>
        <div className="relative">
          <div className={`absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${iconGlows[tone] || iconGlows.purple}`} />
          <div className={`relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${iconColors[tone] || iconColors.purple}`}>
            <Icon className="w-[18px] h-[18px]" />
          </div>
        </div>
      </div>
      <p className="text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-ink-subtle">{sub}</p>
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
          <span className="text-[9px] font-bold text-ink-subtle uppercase tracking-wider">{dayName}</span>
          <span className="text-sm font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{formatted.split(" ")[1]}</span>
        </div>
        <div className="h-8 w-[1px] bg-[#cfc2d6]/15" />
        <div>
          <p className="text-xs font-semibold text-ink">{formatted}</p>
          {entry.notes && <p className="text-[9px] font-semibold text-ink-subtle">{entry.notes}</p>}
          {entry.marker?.fullName && (
            <p className="text-[9px] font-semibold text-ink-subtle">Marked by {entry.marker.fullName}</p>
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
