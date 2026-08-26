"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle, ArrowRight, BookOpen, CalendarCheck, CheckCircle2,
  ClipboardList, GraduationCap, Loader2, UserCheck, Users,
} from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { StatTiles } from "@/components/shared-admin/workspace";
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
    <TeacherPage
      icon={GraduationCap}
      eyebrow="Faculty Console"
      /* Viewer-clock values — see the note in RoleHeader. */
      title={`${greeting}, ${data.teacherName?.split(" ")[0] || "Teacher"}`}
      summary={
        <span suppressHydrationWarning>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {` · ${teacherSubjects.length} subject${teacherSubjects.length === 1 ? "" : "s"}`}
          {` · ${classHubs.length} class${classHubs.length === 1 ? "" : "es"}`}
          {` · ${data.totalStudents} students`}
        </span>
      }
      actions={
        <>
          {/* Checking in was a full-width card of its own for one button. It is
              a two-second daily action, so it belongs in the header. */}
          {selfAttendanceStatus === "loading" ? (
            <span className="skeleton-shimmer h-10 w-32 rounded-xl bg-[#e8e0ec]/50" />
          ) : selfAttendanceStatus === "marked" ? (
            <span
              title={selfAttendanceTime ? `Checked in at ${selfAttendanceTime}` : "Checked in today"}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-black uppercase tracking-wider text-emerald-700"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Checked in
              {selfAttendanceTime ? (
                <span className="font-bold tabular-nums opacity-70">{selfAttendanceTime}</span>
              ) : null}
            </span>
          ) : (
            <BrandButton
              variant="dark"
              className="min-h-10"
              icon={markingSelf ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              onClick={handleMarkSelfAttendance}
              disabled={markingSelf}
            >
              I&apos;m Present
            </BrandButton>
          )}
          <GradingToolbar grading={grading} classHubs={classHubs} />
        </>
      }
    >
      <div className="space-y-3">
        {/* ── What needs doing, before anything else ── */}
        {(hasUnmarkedAttendance || hasMissingMarks) && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {hasUnmarkedAttendance && (
              <AlertRow
                tone="amber"
                icon={CalendarCheck}
                title="Unmarked attendance"
                detail={`${attendanceStats.unmarked} student${attendanceStats.unmarked !== 1 ? "s" : ""} not marked today`}
                onClick={() => router.push("/teacher/attendance")}
              />
            )}
            {hasMissingMarks && (
              <AlertRow
                tone="rose"
                icon={AlertCircle}
                title="Missing marks"
                detail={`${missingMarksTotal} mark${missingMarksTotal !== 1 ? "s" : ""} pending across ${activeExamCount} active test${activeExamCount !== 1 ? "s" : ""}`}
                onClick={() => router.push("/teacher/marks")}
              />
            )}
          </div>
        )}

        {/* ── Today ── */}
        {!slotsLoading && todaySlots.length > 0 && (
          <ScheduleConflictsBanner slots={todaySlots} scope="today" />
        )}
        <TodaySchedule
          slots={todaySlots}
          loading={slotsLoading}
          clashIds={todayClashIds}
          onOpenTimetable={() => router.push("/teacher/timetable")}
        />

        {/* ── The numbers, each one a way in ── */}
        <StatTiles
          columns={6}
          tiles={[
            { key: "subjects", icon: BookOpen, label: "Subjects", value: teacherSubjects.length, tone: "violet", onClick: () => router.push("/teacher/marks") },
            { key: "classes", icon: GraduationCap, label: "Classes", value: classHubs.length, tone: "rose", onClick: () => router.push("/teacher/classes") },
            { key: "students", icon: Users, label: "Students", value: data.totalStudents, tone: "emerald", onClick: () => router.push("/teacher/students") },
            { key: "tests", icon: ClipboardList, label: "Active tests", value: activeExamCount, tone: "violet", onClick: () => router.push("/teacher/tests") },
            {
              key: "missing",
              icon: AlertCircle,
              label: "Missing marks",
              value: missingMarksTotal,
              hint: missingMarksTotal > 0 ? "Needs you" : "All entered",
              tone: missingMarksTotal > 0 ? "rose" : "emerald",
              onClick: () => router.push("/teacher/marks"),
            },
            {
              key: "unmarked",
              icon: CalendarCheck,
              label: "Unmarked today",
              value: attendanceStats.unmarked,
              hint: attendanceStats.unmarked > 0 ? "Needs you" : "All marked",
              tone: attendanceStats.unmarked > 0 ? "amber" : "emerald",
              onClick: () => router.push("/teacher/attendance"),
            },
          ]}
        />
      </div>

      <GradingModals grading={grading} classHubs={classHubs} />
    </TeacherPage>
  );
}

/** A one-line "this needs you" row. Reads faster than a card and costs less. */
function AlertRow({
  tone,
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  tone: "amber" | "rose";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  const tones = {
    amber: "border-amber-200/70 bg-gradient-to-r from-amber-50 to-amber-50/20 text-amber-800",
    rose: "border-rose-200/70 bg-gradient-to-r from-rose-50 to-rose-50/20 text-rose-800",
  } as const;
  const chips = {
    amber: "bg-amber-100 text-amber-600",
    rose: "bg-rose-100 text-rose-600",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-[18px] border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(31,26,35,0.5)] active:scale-[0.99]",
        tones[tone],
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", chips[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black leading-tight">{title}</span>
        <span className="block truncate text-[11px] font-semibold opacity-70">{detail}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-50 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
    </button>
  );
}
