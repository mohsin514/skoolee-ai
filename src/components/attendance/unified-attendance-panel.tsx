"use client";
import { InputGroup } from "@/components/ui/input-group";


import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import {
  Award, Briefcase, CalendarCheck, Check, ChevronDown, Clock,
  GraduationCap, HelpCircle, Users, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { AttendanceOverview } from "./attendance-overview";
import { AttendanceExceptions, AttendanceRulePanel } from "./class-register";
import { LearnerLeaveQueue, TripsDesk } from "@/components/family/staff-requests";
import { AvatarImage } from "@/components/ui/avatar-image";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";


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
    } catch { toast.error("Failed to load teacher attendance"); }
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
    } catch { setTeacherMonthly([]); toast.error("Failed to load monthly teacher records"); }
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

  const tStatusVariant = (s: string) =>
    s === "PRESENT" ? "success" as const : s === "ABSENT" ? "danger" as const : s === "LEAVE" ? "warning" as const : "neutral" as const;


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
          <p className="text-2xs font-semibold uppercase tracking-wider text-primary">Attendance</p>
          <h2 className="text-2xl font-bold text-ink-strong tracking-tight mt-1">Attendance Tracker</h2>
        </div>
        <div className="flex items-center gap-1 rounded-2xl bg-muted p-1">
          {(["students", "teachers"] as const).map((tab) => (
            <Button aria-pressed={activeTab === tab} variant="choice" size="sm"
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex justify-start items-center gap-2"
            >
              {tab === "students" ? <GraduationCap className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
              {tab === "students" ? "Student Attendance" : "Teacher Attendance"}
            </Button>
          ))}
        </div>
      </div>

      {activeTab === "students" ? <>
        <AttendanceOverview />
        <div className="grid gap-6 lg:grid-cols-2"><AttendanceExceptions /><AttendanceRulePanel /></div>
        <div className="grid gap-6 lg:grid-cols-2"><LearnerLeaveQueue /><TripsDesk /></div>
      </> : null}

      {activeTab === "teachers" ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" type="button" onClick={() => shiftDate(-1)}
                className="flex items-center justify-center">
                <ChevronDown className="h-4 w-4 rotate-90" />
              </Button>
              <div className="flex items-center gap-2 rounded-xl border border-edge/20 bg-white px-4 h-10">
                <CalendarCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-ink-strong">{dateLabel}</span>
                {isToday ? <Badge variant="success" size="sm">Today</Badge> : null}
              </div>
              <Button variant="outline" size="icon" type="button" onClick={() => shiftDate(1)}
                className="flex items-center justify-center">
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </Button>
              {!isToday ? (
                <Button variant="secondary" size="sm" type="button" onClick={() => setTeacherDate(new Date().toISOString().split("T")[0])}
                  >
                  Today
                </Button>
              ) : null}
            </div>
            <InputGroup surfaceClassName="bg-muted" className="relative">
              <svg data-field-affix="start" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-subtle">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <SystemInput type="text" placeholder="Search teachers..." value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                className="w-full sm:w-52 ps-9 pe-3" />
            </InputGroup>
          </div>

          {teacherLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white rounded-[28px] border border-edge/10 shadow-lg p-6 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-3 flex-1">
                      <div className="h-2.5 w-20 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                      <div className="h-7 w-14 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                    </div>
                    <div className="h-10 w-10 rounded-2xl bg-border-subtle/30 skeleton-shimmer shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Total Teachers", value: teacherSummary.total, icon: Users, tone: "bg-brand-50 text-primary" },
                { label: "Present", value: teacherSummary.present, icon: CalendarCheck, tone: "bg-emerald-50 text-emerald-600" },
                { label: "Absent", value: teacherSummary.absent, icon: X, tone: "bg-rose-50 text-rose-500" },
                { label: "On Leave", value: teacherSummary.leave, icon: Clock, tone: "bg-amber-50 text-amber-600" },
                { label: "Attendance Rate", value: `${tRate}%`, icon: Award, tone: "bg-ink-strong text-white" },
              ].map((stat, i) => (
                <div key={stat.label} className="sk-panel sk-rise group p-5" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <p className="text-2xs font-semibold text-ink-subtle uppercase tracking-wider mb-2">{stat.label}</p>
                      <p className="text-2xl md:text-3xl font-extrabold text-ink-strong leading-none">{stat.value}</p>
                      {typeof stat.value === "number" && teacherSummary.total > 0 && stat.label !== "Total Teachers" ? (
                        <p className="text-2xs font-semibold text-ink-subtle uppercase tracking-wider mt-2">
                          {Math.round((stat.value / teacherSummary.total) * 1000) / 10}%
                        </p>
                      ) : null}
                    </div>
                    <div className="relative shrink-0">
                      <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-primary/18" />
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
            <div className="sk-panel sk-rise lg:col-span-2 p-6" style={{ animationDelay: "160ms" }}>
              <div className="flex items-center justify-between gap-4 mb-5">
                <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Daily Roster &mdash; {dateLabel}</p>
                <span className="text-2xs font-semibold uppercase tracking-wider text-primary">{filteredTeachers.length} teacher{filteredTeachers.length !== 1 ? "s" : ""}</span>
              </div>
              {teacherLoading ? (
                <div className="space-y-2 animate-skeleton-in">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2">
                    <div className="col-span-5 h-2 w-14 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                    <div className="col-span-2 h-2 w-12 rounded-full bg-border-subtle/40 skeleton-shimmer mx-auto" />
                    <div className="col-span-3 h-2 w-10 rounded-full bg-border-subtle/40 skeleton-shimmer mx-auto" />
                    <div className="col-span-2 h-2 w-8 rounded-full bg-border-subtle/40 skeleton-shimmer ms-auto" />
                  </div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-2xl bg-muted/50 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="col-span-5 flex items-center gap-3">
                        <div className="h-9 w-9 shrink-0 rounded-xl bg-border-subtle/40 skeleton-shimmer" />
                        <div className="space-y-1.5 flex-1">
                          <div className="h-3 w-24 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                          <div className="h-2 w-16 rounded-full bg-border-subtle/30 skeleton-shimmer" />
                        </div>
                      </div>
                      <div className="col-span-2 h-3 w-12 rounded-full bg-border-subtle/40 skeleton-shimmer mx-auto" />
                      <div className="col-span-3 h-5 w-16 rounded-full bg-border-subtle/30 skeleton-shimmer mx-auto" />
                      <div className="col-span-2 h-3 w-10 rounded-full bg-border-subtle/40 skeleton-shimmer ms-auto" />
                    </div>
                  ))}
                </div>
              ) : filteredTeachers.length === 0 ? (
                <EmptyState size="sm" icon={Users} title={teacherSearch ? "No teachers match your search" : "No teachers found"} description={teacherSearch ? "Try a different name or clear the search." : "Teachers appear here once they are added to the school."} />
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pe-1 custom-scrollbar">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                    <span className="col-span-5">Teacher</span>
                    <span className="col-span-2 text-center">Check-in</span>
                    <span className="col-span-3 text-center">Status</span>
                    <span className="col-span-2 text-end">Rate</span>
                  </div>
                  {filteredTeachers.map((teacher: any) => {
                    const status = teacher.status || "UNMARKED";
                    return (
                      <div key={teacher.id} className={cn("grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-2xl transition-all",
                        status === "ABSENT" ? "bg-rose-50/50 border border-rose-100" :
                        status === "LEAVE" ? "bg-amber-50/30 border border-amber-100" :
                        "bg-muted/50 border border-transparent"
                      )}>
                        <div className="col-span-5 flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 shrink-0 rounded-xl bg-brand-50 overflow-hidden">
                            <AvatarImage src={teacher.profileImageUrl} name={teacher.fullName} alt={teacher.fullName} initialsClassName="text-2xs" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink-strong truncate">{teacher.fullName}</p>
                            <p className="text-2xs font-semibold text-ink-subtle truncate">{teacher.email}</p>
                          </div>
                        </div>
                        <span className="col-span-2 text-xs font-medium tabular-nums text-ink-muted text-center">{teacher.attendance?.checkInTime || "—"}</span>
                        <div className="col-span-3 flex justify-center">
                          <Badge variant={tStatusVariant(status)} dot>
                            {status === "PRESENT" ? "Present" : status === "ABSENT" ? "Absent" : status === "LEAVE" ? "Leave" : "Unmarked"}
                          </Badge>
                        </div>
                        <span className="col-span-2 text-end text-sm font-medium text-ink-muted">{teacher.attendance?.checkInTime ? "On Time" : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sk-panel sk-rise p-6" style={{ animationDelay: "240ms" }}>
              <div className="flex items-center gap-2 mb-5">
                <div className="h-8 w-8 rounded-xl bg-brand-50 flex items-center justify-center"><Award className="h-4 w-4 text-primary" /></div>
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Monthly</p>
                  <p className="text-sm font-bold text-ink-strong">Teacher Records</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <Button variant="secondary" size="icon" type="button" onClick={() => shiftTeacherMonth(-1)}
                  className="flex items-center justify-center">
                  <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                </Button>
                <span className="text-xs font-bold text-ink-strong">{formatMonthLbl(teacherSelectedMonth)}</span>
                <Button variant="secondary" size="icon" type="button" onClick={() => shiftTeacherMonth(1)}
                  className="flex items-center justify-center">
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                </Button>
              </div>
              {teacherMonthlyLoading ? (
                <div className="space-y-2 animate-skeleton-in">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="p-3 rounded-2xl bg-muted/50 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 shrink-0 rounded-lg bg-border-subtle/40 skeleton-shimmer" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="h-3 w-24 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                          <div className="h-2 w-16 rounded-full bg-border-subtle/30 skeleton-shimmer" />
                        </div>
                        <div className="h-3 w-8 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-border-subtle/30 skeleton-shimmer" />
                    </div>
                  ))}
                </div>
              ) : teacherMonthly.length === 0 ? (
                <EmptyState size="sm" icon={CalendarCheck} title="No records" description={`No teacher attendance for ${formatMonthLbl(teacherSelectedMonth)}`} />
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pe-1 custom-scrollbar">
                  {teacherMonthly.map((record: any) => {
                    const pCount = record.presentDays ?? record.present ?? 0;
                    const totalDays = record.totalDays ?? record.total ?? 0;
                    const rate = totalDays > 0 ? Math.round((pCount / totalDays) * 100) : 0;
                    return (
                      <div key={record.userId || record.id} className="p-3 rounded-2xl bg-muted/50 border border-transparent hover:border-primary/10 transition-all">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 shrink-0 rounded-lg bg-brand-50 overflow-hidden">
                            <AvatarImage src={record.profileImageUrl} name={record.fullName || "Staff"} alt={record.fullName || "Staff"} initialsClassName="text-2xs" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-ink-strong truncate">{record.fullName || "Teacher"}</p>
                            <p className="text-2xs font-medium tabular-nums text-ink-subtle mt-0.5">
                              {pCount}P · {record.absentDays ?? record.absent ?? 0}A · {record.leaveDays ?? record.leave ?? 0}L
                            </p>
                          </div>
                          <span className={cn("text-xs font-bold shrink-0", rate >= 85 ? "text-emerald-600" : rate >= 75 ? "text-amber-600" : "text-rose-500")}>
                            {rate}%
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-border-subtle/40 overflow-hidden">
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
