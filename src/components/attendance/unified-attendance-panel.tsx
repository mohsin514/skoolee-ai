"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award, Briefcase, CalendarCheck, Check, ChevronDown, Clock,
  GraduationCap, HelpCircle, Users, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AttendanceOverview } from "./attendance-overview";

export function UnifiedAttendancePanel() {
  const [activeTab, setActiveTab] = useState<"students" | "teachers">("students");
  const [teacherDate, setTeacherDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [teacherRoster, setTeacherRoster] = useState<any[]>([]);
  const [teacherSummary, setTeacherSummary] = useState({ total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 });
  const [teacherLoading, setTeacherLoading] = useState(true);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherMonthly, setTeacherMonthly] = useState<any[]>([]);
  const [teacherMonthlyLoading, setTeacherMonthlyLoading] = useState(false);
  const [teacherSelectedMonth, setTeacherSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const formatMonthLbl = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  };

  const shiftTeacherMonth = (delta: number) => {
    const [y, m] = teacherSelectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (delta > 0 && next > curMonth) return;
    setTeacherSelectedMonth(next);
  };

  const loadTeacherRoster = useCallback(async () => {
    setTeacherLoading(true);
    try {
      const res = await fetch(`/api/teacher-attendance?date=${teacherDate}`);
      const json = await res.json();
      if (json.success) {
        setTeacherRoster(json.data || []);
        setTeacherSummary(json.summary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 });
      }
    } catch { /* silent */ }
    finally { setTeacherLoading(false); }
  }, [teacherDate]);

  const loadTeacherMonthly = useCallback(async () => {
    setTeacherMonthlyLoading(true);
    try {
      const res = await fetch(`/api/teacher-attendance?month=${teacherSelectedMonth}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTeacherMonthly(json.data);
      } else {
        setTeacherMonthly([]);
      }
    } catch { setTeacherMonthly([]); }
    finally { setTeacherMonthlyLoading(false); }
  }, [teacherSelectedMonth]);

  useEffect(() => { if (activeTab === "teachers") { loadTeacherRoster(); } }, [activeTab, loadTeacherRoster]);
  useEffect(() => { if (activeTab === "teachers") { loadTeacherMonthly(); } }, [activeTab, loadTeacherMonthly]);

  const shiftDate = (days: number) => {
    const d = new Date(teacherDate);
    d.setDate(d.getDate() + days);
    setTeacherDate(d.toISOString().split("T")[0]);
  };

  const filteredTeachers = teacherSearch
    ? teacherRoster.filter((t: any) => t.fullName?.toLowerCase().includes(teacherSearch.toLowerCase()) || t.email?.toLowerCase().includes(teacherSearch.toLowerCase()))
    : teacherRoster;

  const tStatusColor = (s: string) => {
    if (s === "PRESENT") return "bg-emerald-50 text-emerald-600";
    if (s === "ABSENT") return "bg-rose-50 text-rose-600";
    if (s === "LEAVE") return "bg-amber-50 text-amber-600";
    return "bg-[#f3f4f9] text-[#4d4354]/40";
  };

  const tStatusIcon = (s: string) => {
    if (s === "PRESENT") return <Check className="h-3.5 w-3.5" />;
    if (s === "ABSENT") return <X className="h-3.5 w-3.5" />;
    if (s === "LEAVE") return <Clock className="h-3.5 w-3.5" />;
    return <HelpCircle className="h-3.5 w-3.5" />;
  };

  const tRate = teacherSummary.total > 0
    ? Math.round(((teacherSummary.present + teacherSummary.leave) / teacherSummary.total) * 1000) / 10
    : 0;

  const dateLabel = new Date(teacherDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });

  const isToday = teacherDate === new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Attendance</p>
          <h2 className="text-2xl font-black text-[#1f1a23] tracking-tight mt-1">Attendance Tracker</h2>
        </div>
        <div className="flex items-center gap-1 rounded-2xl bg-[#f3f4f9] p-1">
          {(["students", "teachers"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "rounded-xl px-5 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2",
                activeTab === tab
                  ? "bg-white text-[#8127cf] shadow-md"
                  : "text-[#4d4354]/50 hover:text-[#8127cf]"
              )}
            >
              {tab === "students" ? <GraduationCap className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
              {tab === "students" ? "Student Attendance" : "Teacher Attendance"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "students" ? <AttendanceOverview /> : null}

      {activeTab === "teachers" ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => shiftDate(-1)}
                className="h-10 w-10 rounded-xl bg-white border border-[#cfc2d6]/20 flex items-center justify-center text-[#4d4354] hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-all cursor-pointer">
                <ChevronDown className="h-4 w-4 rotate-90" />
              </button>
              <div className="flex items-center gap-2 rounded-xl border border-[#cfc2d6]/20 bg-white px-4 h-10">
                <CalendarCheck className="h-4 w-4 text-[#8127cf]" />
                <span className="text-sm font-black text-[#1f1a23]">{dateLabel}</span>
                {isToday ? <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 rounded-full px-2 py-0.5">Today</span> : null}
              </div>
              <button type="button" onClick={() => shiftDate(1)}
                className="h-10 w-10 rounded-xl bg-white border border-[#cfc2d6]/20 flex items-center justify-center text-[#4d4354] hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-all cursor-pointer">
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </button>
              {!isToday ? (
                <button type="button" onClick={() => setTeacherDate(new Date().toISOString().split("T")[0])}
                  className="h-10 rounded-xl bg-[#fbf0fe] px-3 text-[10px] font-black uppercase tracking-wider text-[#8127cf] hover:bg-[#f0d6fa] transition-colors cursor-pointer">
                  Today
                </button>
              ) : null}
            </div>
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#4d4354]/30">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input type="text" placeholder="Search teachers..." value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                className="h-10 w-52 rounded-xl border border-[#cfc2d6]/20 bg-[#f3f4f9] pl-9 pr-3 text-xs font-semibold text-[#1f1a23] placeholder:text-[#4d4354]/30 outline-none focus:border-[#8127cf]/30 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] transition-all" />
            </div>
          </div>

          {teacherLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white rounded-[28px] border border-[#cfc2d6]/10 shadow-lg p-6 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-3 flex-1">
                      <div className="h-2.5 w-20 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                      <div className="h-7 w-14 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                    </div>
                    <div className="h-10 w-10 rounded-2xl bg-[#e8e0ec]/30 skeleton-shimmer shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Total Teachers", value: teacherSummary.total, icon: Users, tone: "bg-[#fbf0fe] text-[#8127cf]" },
                { label: "Present", value: teacherSummary.present, icon: CalendarCheck, tone: "bg-emerald-50 text-emerald-600" },
                { label: "Absent", value: teacherSummary.absent, icon: X, tone: "bg-rose-50 text-rose-500" },
                { label: "On Leave", value: teacherSummary.leave, icon: Clock, tone: "bg-amber-50 text-amber-600" },
                { label: "Attendance Rate", value: `${tRate}%`, icon: Award, tone: "bg-[#1f1a23] text-white" },
              ].map((stat, i) => (
                <div key={stat.label} className="sk-rise group bg-white p-5 rounded-[28px] border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-wider mb-2">{stat.label}</p>
                      <p className="text-2xl md:text-3xl font-black text-[#1f1a23] leading-none">{stat.value}</p>
                      {typeof stat.value === "number" && teacherSummary.total > 0 && stat.label !== "Total Teachers" ? (
                        <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-wider mt-2">
                          {Math.round((stat.value / teacherSummary.total) * 1000) / 10}%
                        </p>
                      ) : null}
                    </div>
                    <div className="relative shrink-0">
                      <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#8127cf]/18" />
                      <div className={cn("relative h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", stat.tone)}>
                        <stat.icon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="sk-rise lg:col-span-2 bg-white rounded-[30px] border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "160ms" }}>
              <div className="flex items-center justify-between gap-4 mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">Daily Roster &mdash; {dateLabel}</p>
                <span className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">{filteredTeachers.length} teacher{filteredTeachers.length !== 1 ? "s" : ""}</span>
              </div>
              {teacherLoading ? (
                <div className="space-y-2 animate-skeleton-in">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2">
                    <div className="col-span-5 h-2 w-14 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                    <div className="col-span-2 h-2 w-12 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer mx-auto" />
                    <div className="col-span-3 h-2 w-10 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer mx-auto" />
                    <div className="col-span-2 h-2 w-8 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer ml-auto" />
                  </div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-2xl bg-[#f3f4f9]/50 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="col-span-5 flex items-center gap-3">
                        <div className="h-9 w-9 shrink-0 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
                        <div className="space-y-1.5 flex-1">
                          <div className="h-3 w-24 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                          <div className="h-2 w-16 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                        </div>
                      </div>
                      <div className="col-span-2 h-3 w-12 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer mx-auto" />
                      <div className="col-span-3 h-5 w-16 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer mx-auto" />
                      <div className="col-span-2 h-3 w-10 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer ml-auto" />
                    </div>
                  ))}
                </div>
              ) : filteredTeachers.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="mx-auto h-10 w-10 text-[#4d4354]/20 mb-3" />
                  <p className="text-sm font-bold text-[#4d4354]/40">{teacherSearch ? "No teachers match your search" : "No teachers found"}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                    <span className="col-span-5">Teacher</span>
                    <span className="col-span-2 text-center">Check-in</span>
                    <span className="col-span-3 text-center">Status</span>
                    <span className="col-span-2 text-right">Rate</span>
                  </div>
                  {filteredTeachers.map((teacher: any) => {
                    const status = teacher.status || "UNMARKED";
                    return (
                      <div key={teacher.id} className={cn("grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-2xl transition-all",
                        status === "ABSENT" ? "bg-rose-50/50 border border-rose-100" :
                        status === "LEAVE" ? "bg-amber-50/30 border border-amber-100" :
                        "bg-[#f3f4f9]/50 border border-transparent"
                      )}>
                        <div className="col-span-5 flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 shrink-0 rounded-xl bg-[#fbf0fe] overflow-hidden">
                            <img src={teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teacher.fullName)}`} alt="" className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#1f1a23] truncate">{teacher.fullName}</p>
                            <p className="text-[9px] font-semibold text-[#4d4354]/40 truncate">{teacher.email}</p>
                          </div>
                        </div>
                        <span className="col-span-2 text-xs font-bold text-[#4d4354]/50 text-center">{teacher.attendance?.checkInTime || "—"}</span>
                        <div className="col-span-3 flex justify-center">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wider", tStatusColor(status))}>
                            {tStatusIcon(status)}
                            {status === "PRESENT" ? "Present" : status === "ABSENT" ? "Absent" : status === "LEAVE" ? "Leave" : "Unmarked"}
                          </span>
                        </div>
                        <span className="col-span-2 text-right text-sm font-black text-[#4d4354]/50">{teacher.attendance?.checkInTime ? "On Time" : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sk-rise bg-white rounded-[30px] border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "240ms" }}>
              <div className="flex items-center gap-2 mb-5">
                <div className="h-8 w-8 rounded-xl bg-[#fbf0fe] flex items-center justify-center"><Award className="h-4 w-4 text-[#8127cf]" /></div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">Monthly</p>
                  <p className="text-sm font-black text-[#1f1a23]">Teacher Records</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <button type="button" onClick={() => shiftTeacherMonth(-1)}
                  className="h-8 w-8 rounded-lg bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-all cursor-pointer">
                  <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                </button>
                <span className="text-xs font-black text-[#1f1a23]">{formatMonthLbl(teacherSelectedMonth)}</span>
                <button type="button" onClick={() => shiftTeacherMonth(1)}
                  className="h-8 w-8 rounded-lg bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#fbf0fe] hover:text-[#8127cf] transition-all cursor-pointer">
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                </button>
              </div>
              {teacherMonthlyLoading ? (
                <div className="space-y-2 animate-skeleton-in">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="p-3 rounded-2xl bg-[#f3f4f9]/50 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 shrink-0 rounded-lg bg-[#e8e0ec]/40 skeleton-shimmer" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="h-3 w-24 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                          <div className="h-2 w-16 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                        </div>
                        <div className="h-3 w-8 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                    </div>
                  ))}
                </div>
              ) : teacherMonthly.length === 0 ? (
                <div className="py-10 text-center">
                  <CalendarCheck className="mx-auto h-8 w-8 text-[#4d4354]/20 mb-3" />
                  <p className="text-sm font-bold text-[#4d4354]/40">No records</p>
                  <p className="text-xs font-semibold text-[#4d4354]/30 mt-1">No teacher attendance for {formatMonthLbl(teacherSelectedMonth)}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                  {teacherMonthly.map((record: any) => {
                    const pCount = record.presentDays ?? record.present ?? 0;
                    const totalDays = record.totalDays ?? record.total ?? 0;
                    const rate = totalDays > 0 ? Math.round((pCount / totalDays) * 100) : 0;
                    return (
                      <div key={record.userId || record.id} className="p-3 rounded-2xl bg-[#f3f4f9]/50 border border-transparent hover:border-[#8127cf]/10 transition-all">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 shrink-0 rounded-lg bg-[#fbf0fe] overflow-hidden">
                            <img src={record.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(record.fullName || "T")}`} alt="" className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-[#1f1a23] truncate">{record.fullName || "Teacher"}</p>
                            <p className="text-[8px] font-bold text-[#4d4354]/40 mt-0.5">
                              {pCount}P · {record.absentDays ?? record.absent ?? 0}A · {record.leaveDays ?? record.leave ?? 0}L
                            </p>
                          </div>
                          <span className={cn("text-xs font-black shrink-0", rate >= 85 ? "text-emerald-600" : rate >= 75 ? "text-amber-600" : "text-rose-500")}>
                            {rate}%
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-[#e8e0ec]/40 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500",
                              rate >= 85 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" :
                              rate >= 75 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                              "bg-gradient-to-r from-rose-400 to-rose-500"
                            )}
                            style={{ width: `${Math.min(rate, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
