"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import {
  AlertCircle, ArrowRight, CalendarCheck, CheckCircle2,
  ClipboardList, GraduationCap, Sun, UserCheck, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { StatTiles } from "@/components/shared-admin/workspace";
import {
  DashboardSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";
import { useTeacherData } from "./teacher-data-context";
import { TeachingInsights } from "@/components/insights";
import { ScheduleConflictsBanner } from "@/components/teacher/schedule-conflicts-banner";
import { TodaySchedule, type TimetableSlot } from "@/components/teacher/today-schedule";
import { clashingSlotIds } from "@/lib/timetable/clashes";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { FlagshipCard } from "@/components/ui/flagship";
import { DepartmentQueue } from "@/components/school-ai/exam-studio/department-queue";
import { ModerationQueue } from "@/components/school-ai/exam-studio/moderation-queue";
import { PapersOwed } from "@/components/school-ai/exam-studio/papers-owed";
import { TeachingLinePrompt } from "@/components/school-ai/exam-studio/teaching-line-prompt";

/**
 * Today — the teacher's landing screen (SPEC §4.4: one primary action, ≤ 4 KPI tiles, one queue).
 *
 * The primary action is **Take register** for the next class that still has unmarked pupils, in the
 * order of today's lessons. Checking in is a status chip, not a header button; New test, Grade Config
 * and Final Grades left this screen (New test lives on Tests & quizzes; grading rules belong to the
 * academic lead).
 *
 * Controls that lead into a module follow the registry (§4.5.11, G14): with the school's attendance or exams module
 * off for teachers, Take register and the "Needs you" rows for it are not offered. Exam Studio — a flagship
 * (addendum 2026-10-22) — has its card under the queue when the teacher may use it (`schoolAiExams`).
 */
export default function TeacherToday() {
  const router = useRouter();
  const ui = useUiText();
  const locale = useLocale();
  const { data, loading, error, refetch } = useTeacherData();
  const access = useConsoleAccess();
  const canRegister = access.leafVisible("teacher", "attendance");
  const canMarks = access.leafVisible("teacher", "marks");
  const canExamStudio = access.leafVisible("teacher", "exam-studio");

  const [todaySlots, setTodaySlots] = useState<TimetableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [scheduleAvailability, setScheduleAvailability] = useState<"published" | "unpublished" | "failed">("published");
  const [selfAttendanceStatus, setSelfAttendanceStatus] = useState<"loading" | "unmarked" | "marked">("loading");
  const [selfAttendanceTime, setSelfAttendanceTime] = useState<string | null>(null);
  const [markingSelf, setMarkingSelf] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // YYYY-MM-DD on the viewer's calendar (an API value, not display text).
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ? ui(json.error) : ui("Could not check you in. Please try again."));
      setSelfAttendanceStatus("marked");
      setSelfAttendanceTime(json.data?.checkInTime || new Date().toLocaleTimeString(localeTag(locale), { hour: "2-digit", minute: "2-digit", hour12: false }));
      toast.success(json.alreadyMarked ? ui("You were already checked in today.") : ui("You're checked in for today."));
    } catch (err) { toast.error(err); }
    finally { setMarkingSelf(false); }
  }, [ui, locale]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/timetable/teacher");
        const json = await res.json();
        if (json.success) {
          setScheduleAvailability(json.data.length ? "published" : "unpublished");
          const weekday = new Intl.DateTimeFormat("en", { timeZone: locale.timezone, weekday: "short" }).format(new Date());
          const dayNum = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday) + 1;
          setTodaySlots(
            (json.data as TimetableSlot[])
              .filter((s) => s.dayOfWeek === dayNum && s.slotType === "CLASS" && s.subject)
              .sort((a, b) => a.periodNumber - b.periodNumber)
          );
        } else { setScheduleAvailability("failed"); }
      } catch { setScheduleAvailability("failed"); }
      finally { setSlotsLoading(false); }
    })();
  }, [locale.timezone]);

  const todayClashIds = useMemo(() => clashingSlotIds(todaySlots), [todaySlots]);

  const classHubs: any[] = data?.classHubs || [];
  const missingMarksTotal = (data?.activeExams || []).reduce((sum: number, exam: any) => sum + (exam.missingMarks || 0), 0);
  const attendanceStats = data?.attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };
  const activeExamCount = data?.activeExams?.length || 0;

  /* The register to take next: the first class in today's lesson order that still has unmarked
     pupils; failing that, any of the teacher's classes with unmarked pupils. */
  const nextRegisterClassId = useMemo(() => {
    const students: any[] = data?.students || [];
    const unmarked = new Map<string, number>();
    for (const student of students) {
      const classId = student.class?.id;
      if (classId && student.todayAttendance == null) unmarked.set(classId, (unmarked.get(classId) ?? 0) + 1);
    }
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const byLesson = [...todaySlots].sort((a, b) => {
      const aDone = toMinutes(a.endTime) <= nowMinutes ? 1 : 0;
      const bDone = toMinutes(b.endTime) <= nowMinutes ? 1 : 0;
      return aDone - bDone || a.periodNumber - b.periodNumber;
    });
    const fromLessons = byLesson.find((slot) => (unmarked.get(slot.classId) ?? 0) > 0)?.classId;
    return fromLessons ?? [...unmarked.keys()][0] ?? null;
  }, [data, todaySlots]);

  const hasUnmarkedAttendance = canRegister && attendanceStats.unmarked > 0;
  const hasMissingMarks = canMarks && missingMarksTotal > 0;

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  const checkIn = (
    <span data-tour="teacher.today.checkin" className="inline-flex">
      {selfAttendanceStatus === "loading" ? (
        <Skeleton className="h-11 w-36 rounded-xl" />
      ) : selfAttendanceStatus === "marked" ? (
        <Badge variant="success" className="min-h-11 rounded-xl px-3 text-xs">
          <CheckCircle2 aria-hidden="true" />
          {ui("Checked in")}
          {selfAttendanceTime ? <bdi data-numeric className="font-medium tabular-nums">{selfAttendanceTime}</bdi> : null}
        </Badge>
      ) : (
        <Button variant="outline" onClick={handleMarkSelfAttendance} loading={markingSelf}>
          {markingSelf ? null : <UserCheck aria-hidden="true" />}
          {ui("Check in for today")}
        </Button>
      )}
    </span>
  );

  return (
    <TeacherPage
      icon={Sun}
      title="Today"
      description="Your lessons, the registers still to take and the marks still to enter."
      status={checkIn}
      primaryAction={
        !canRegister ? undefined
          : classHubs.length === 0
          ? { id: "take-register", label: "Take register", icon: CalendarCheck, disabled: true, disabledReason: "No classes are assigned to you yet." }
          : {
              id: "take-register",
              label: "Take register",
              icon: CalendarCheck,
              href: nextRegisterClassId ? `/teacher/attendance?classId=${encodeURIComponent(nextRegisterClassId)}` : "/teacher/attendance",
            }
      }
    >
      <div className="space-y-3">
        {/* SKO-500: a head of department's approvals and Teaching Line jumps (renders nothing for others). */}
        <DepartmentQueue />
        {/* SKO-501: papers waiting for this person's moderation. */}
        <ModerationQueue />
        {/* SKO-500: papers the exam office asked this teacher to write (renders nothing when none are owed). */}
        <PapersOwed />
        {/* ── What needs you, before anything else (the one queue) ── */}
        {(hasUnmarkedAttendance || hasMissingMarks) && (
          <section aria-label={ui("Needs you")} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {hasUnmarkedAttendance && (
              <AlertRow
                tone="warning"
                icon={CalendarCheck}
                title={ui("Unmarked attendance")}
                detail={ui("{0} pupils not marked today", [attendanceStats.unmarked])}
                onClick={() => router.push(nextRegisterClassId ? `/teacher/attendance?classId=${encodeURIComponent(nextRegisterClassId)}` : "/teacher/attendance")}
              />
            )}
            {hasMissingMarks && (
              <AlertRow
                tone="danger"
                icon={AlertCircle}
                title={ui("Missing marks")}
                detail={ui("{0} marks still to enter across {1} open tests", [missingMarksTotal, activeExamCount])}
                onClick={() => router.push("/teacher/marks")}
              />
            )}
          </section>
        )}

        {/* ── Flagship: Exam Studio (AI-built assessments, secure delivery, marking and recovery) ── */}
        {canExamStudio ? (
          // Same card, words and tour sentence as the principal's (one flagship, one voice across consoles).
          <FlagshipCard
            kind="exam-studio"
            title="Exam Studio"
            description="Create an exam with AI from your source material, review the paper, then deliver it securely and mark it."
            action={{ label: "Create an exam in Exam Studio", href: "/ai/studio" }}
            tourAnchor="teacher.today.flagship-exams"
          />
        ) : null}

        {/* ── Today ── */}
        {!slotsLoading && todaySlots.length > 0 && (
          <ScheduleConflictsBanner slots={todaySlots} scope="today" />
        )}
        <TodaySchedule
          slots={todaySlots}
          loading={slotsLoading}
          availability={scheduleAvailability}
          clashIds={todayClashIds}
          onOpenTimetable={() => router.push("/teacher/timetable")}
        />
        {/* SKO-500: after a lesson, move the Teaching Line by one (renders nothing without a syllabus to move). */}
        <TeachingLinePrompt slots={todaySlots} />

        {/* ── Four figures for the day ── */}
        <StatTiles
          columns={4}
          tiles={[
            { key: "classes", icon: GraduationCap, label: ui("Classes"), value: classHubs.length, tone: "violet" },
            { key: "students", icon: Users, label: ui("Pupils"), value: data.totalStudents, tone: "emerald" },
            { key: "present", icon: CheckCircle2, label: ui("Present today"), value: attendanceStats.present, tone: "emerald" },
            { key: "tests", icon: ClipboardList, label: ui("Open tests"), value: activeExamCount, tone: "violet" },
          ]}
        />

        {/* ── How the term is going, under what needs doing today ── */}
        <TeachingInsights
          exams={data.exams || []}
          attendance={attendanceStats}
          classHubs={classHubs}
          reportCards={data.recentReportCards || []}
          onNavigate={(path) => router.push(path)}
        />
      </div>
    </TeacherPage>
  );
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** A one-line "this needs you" row. Reads faster than a card and costs less. */
function AlertRow({
  tone,
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  tone: "warning" | "danger";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  const chips = {
    warning: "bg-status-warning-surface text-status-warning-text",
    danger: "bg-status-error-surface text-status-error-text",
  } as const;
  return (
    <Button variant="choice"
      type="button"
      onClick={onClick}
      className="group sk-nudge-trigger w-full justify-start gap-3 p-3 text-start"
    >
      <span aria-hidden="true" className={cn("sk-icon-tile flex size-9 shrink-0 items-center justify-center rounded-xl", chips[tone])}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-ink-strong">{title}</span>
        <span className="block truncate text-xs font-normal text-ink-muted">{detail}</span>
      </span>
      {/* Points forward in the reading direction and leans that way on hover. */}
      <ArrowRight aria-hidden="true" className="sk-nudge size-4 shrink-0 text-ink-subtle group-hover:text-primary rtl:rotate-180" />
    </Button>
  );
}
