"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle, ArrowRight, BookOpen, CalendarCheck, CheckCircle2,
  ClipboardList, GraduationCap, Loader2, UserCheck, Users,
} from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";
import {
  DashboardSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";
import { useTeacherData } from "./teacher-data-context";
import { useGradingTools } from "./use-grading-tools";
import { GradingModals, GradingToolbar } from "./grading-tools";
import { ScheduleConflictsBanner } from "@/components/teacher/schedule-conflicts-banner";
import { TodaySchedule, type TimetableSlot } from "@/components/teacher/today-schedule";
import { clashingSlotIds } from "@/lib/timetable/clashes";

export default function TeacherDashboardHub() {
  const router = useRouter();
  const { data, loading, error, refetch } = useTeacherData();

  const [todaySlots, setTodaySlots] = useState<TimetableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [selfAttendanceStatus, setSelfAttendanceStatus] = useState<"loading" | "unmarked" | "marked">("loading");
  const [selfAttendanceTime, setSelfAttendanceTime] = useState<string | null>(null);
  const [markingSelf, setMarkingSelf] = useState(false);
  const grading = useGradingTools({ onChanged: refetch });

  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toLocaleDateString("en-CA");
        const res = await fetch(`/api/teacher-attendance?userId=self&date=${today}`);
        const json = await res.json();
        if (json.success && json.data?.length > 0) {
          setSelfAttendanceStatus("marked");
          setSelfAttendanceTime(json.data[0].checkInTime);
        } else {
          setSelfAttendanceStatus("unmarked");
        }
      } catch { setSelfAttendanceStatus("unmarked"); }
    })();
  }, []);

  const handleMarkSelfAttendance = useCallback(async () => {
    setMarkingSelf(true);
    try {
      const res = await fetch("/api/teacher-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to mark attendance");
      setSelfAttendanceStatus("marked");
      setSelfAttendanceTime(json.data?.checkInTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
      toast.success(json.alreadyMarked ? "Already marked today" : "Attendance marked successfully!");
    } catch (err: any) { toast.error(err.message); }
    finally { setMarkingSelf(false); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/timetable/teacher");
        const json = await res.json();
        if (json.success) {
          const today = new Date().getDay();
          const dayNum = today === 0 ? 7 : today;
          setTodaySlots(
            (json.data as TimetableSlot[])
              .filter((s) => s.dayOfWeek === dayNum && s.slotType === "CLASS" && s.subject)
              .sort((a, b) => a.periodNumber - b.periodNumber)
          );
        }
      } catch { /* timetable not critical */ }
      finally { setSlotsLoading(false); }
    })();
  }, []);

  const todayClashIds = useMemo(() => clashingSlotIds(todaySlots), [todaySlots]);

  const classHubs = data?.classHubs || [];
  const teacherSubjects = data?.subjects || [];
  const missingMarksTotal = (data?.activeExams || []).reduce((sum: number, exam: any) => sum + (exam.missingMarks || 0), 0);
  const attendanceStats = data?.attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };

  const activeExamCount = data?.activeExams?.length || 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const hasUnmarkedAttendance = attendanceStats.unmarked > 0;
  const hasMissingMarks = missingMarksTotal > 0;

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* ── Header ── */}
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative p-7 px-9 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg shadow-[#8127cf]/20">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <div>
                {/* Viewer-clock values — see the note in RoleHeader. */}
                <p suppressHydrationWarning className="text-[12px] font-bold uppercase tracking-wider text-[#8127cf]">
                  {greeting}, {data.teacherName?.split(" ")[0] || "Teacher"}
                </p>
                <p suppressHydrationWarning className="text-[10px] font-semibold text-[#4d4354]/50">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {[
                { label: "Subjects", value: teacherSubjects.length, color: "bg-[#8127cf]/10 text-[#8127cf]" },
                { label: "Classes", value: classHubs.length, color: "bg-rose-50 text-rose-600" },
                { label: "Students", value: data.totalStudents, color: "bg-emerald-50 text-emerald-600" },
              ].map((pill) => (
                <span key={pill.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${pill.color}`}>
                  <span className="font-bold">{pill.value}</span>
                  <span className="opacity-60">{pill.label}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 xl:justify-end">
            <GradingToolbar grading={grading} classHubs={classHubs} />
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 bg-[#fbf0fe]/20 space-y-7">

        {/* ── Self Attendance Card ── */}
        {selfAttendanceStatus === "loading" ? (
          <div className="rounded-[28px] overflow-hidden border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] p-5 flex items-center gap-4 animate-skeleton-in">
            <div className="skeleton-shimmer h-12 w-12 shrink-0 rounded-2xl bg-[#e8e0ec]/60" />
            <div className="flex-1 space-y-2">
              <div className="skeleton-shimmer h-4 w-52 rounded-full bg-[#e8e0ec]/50" />
              <div className="skeleton-shimmer h-3 w-72 rounded-full bg-[#e8e0ec]/40" />
            </div>
            <div className="skeleton-shimmer h-10 w-28 shrink-0 rounded-2xl bg-[#e8e0ec]/50" />
          </div>
        ) : (
          <div className="rounded-[28px] overflow-hidden border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center shadow-sm ${selfAttendanceStatus === "marked" ? "bg-emerald-100 text-emerald-600" : "bg-[#fbf0fe] text-[#8127cf]"}`}>
                  {selfAttendanceStatus === "marked" ? <CheckCircle2 className="h-6 w-6" /> : <UserCheck className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1d1b20]">
                    {selfAttendanceStatus === "marked" ? "You're Checked In Today" : "Mark Your Attendance"}
                  </p>
                  <p className="text-[10px] font-semibold text-[#4d4354]/50 mt-0.5">
                    {selfAttendanceStatus === "marked" && selfAttendanceTime
                      ? `Checked in at ${selfAttendanceTime}`
                      : "Tap to mark yourself present for today"}
                  </p>
                </div>
              </div>
              {selfAttendanceStatus === "unmarked" && (
                <BrandButton variant="dark" onClick={handleMarkSelfAttendance} disabled={markingSelf}>
                  {markingSelf ? <Loader2 className="w-4 h-4 animate-spin" /> : "I'm Present"}
                </BrandButton>
              )}
              {selfAttendanceStatus === "marked" && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600">Present</span>
              )}
            </div>
          </div>
        )}

        {/* ── Action Alerts ── */}
        {(hasUnmarkedAttendance || hasMissingMarks) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hasUnmarkedAttendance && (
              <button type="button" onClick={() => router.push("/teacher/attendance")}
                className="group flex items-center gap-4 rounded-[28px] bg-gradient-to-r from-amber-50 to-amber-50/30 border border-amber-200/50 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm">
                  <CalendarCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-amber-800">Unmarked Attendance</p>
                  <p className="text-xs font-semibold text-amber-600/70 mt-0.5">
                    {attendanceStats.unmarked} student{attendanceStats.unmarked !== 1 ? "s" : ""} not marked today
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-amber-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all shrink-0" />
              </button>
            )}
            {hasMissingMarks && (
              <button type="button" onClick={() => router.push("/teacher/marks")}
                className="group flex items-center gap-4 rounded-[28px] bg-gradient-to-r from-rose-50 to-rose-50/30 border border-rose-200/50 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-sm">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-rose-800">Missing Marks</p>
                  <p className="text-xs font-semibold text-rose-600/70 mt-0.5">
                    {missingMarksTotal} mark{missingMarksTotal !== 1 ? "s" : ""} pending across {activeExamCount} active test{activeExamCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-rose-400 group-hover:text-rose-600 group-hover:translate-x-1 transition-all shrink-0" />
              </button>
            )}
          </div>
        )}

        {/* ── Today's Schedule ── */}
        {!slotsLoading && todaySlots.length > 0 && (
          <ScheduleConflictsBanner slots={todaySlots} scope="today" />
        )}
        <TodaySchedule
          slots={todaySlots}
          loading={slotsLoading}
          clashIds={todayClashIds}
          onOpenTimetable={() => router.push("/teacher/timetable")}
        />

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            { icon: BookOpen, label: "Subjects", value: teacherSubjects.length, color: "from-[#8127cf] to-[#9c48ea]", onClick: () => router.push("/teacher/marks") },
            { icon: GraduationCap, label: "Classes", value: classHubs.length, color: "from-rose-500 to-rose-600", onClick: () => router.push("/teacher/classes") },
            { icon: Users, label: "Students", value: data.totalStudents, color: "from-emerald-500 to-emerald-600", onClick: () => router.push("/teacher/students") },
            { icon: ClipboardList, label: "Active Tests", value: activeExamCount, color: "from-violet-500 to-violet-600", onClick: () => router.push("/teacher/tests") },
            { icon: AlertCircle, label: "Missing Marks", value: missingMarksTotal, color: missingMarksTotal > 0 ? "from-rose-500 to-rose-600" : "from-emerald-500 to-emerald-600", onClick: () => router.push("/teacher/marks") },
            { icon: CalendarCheck, label: "Unmarked Today", value: attendanceStats.unmarked, color: attendanceStats.unmarked > 0 ? "from-amber-500 to-amber-600" : "from-emerald-500 to-emerald-600", onClick: () => router.push("/teacher/attendance") },
          ].map((card, index) => (
            <button key={card.label} type="button" onClick={card.onClick}
              title={`${card.value} ${card.label} — click to view`}
              style={{ animationDelay: `${index * 70}ms` }}
              className="sk-rise group relative cursor-pointer rounded-3xl bg-white p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-[#cfc2d6]/10 overflow-hidden active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-300`} />
              <div className="relative mb-3">
                <div className={`absolute -inset-2 rounded-xl bg-gradient-to-br ${card.color} opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-20`} />
                <div className={`relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${card.color} shadow-md`}>
                  <card.icon className="h-5 w-5 text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors">{card.value}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">{card.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Modals ── */}
      <GradingModals grading={grading} classHubs={classHubs} />
    </section>
  );
}