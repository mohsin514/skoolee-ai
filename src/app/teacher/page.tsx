"use client";
import { DepartmentAppeals } from "@/components/school-ai/exam-studio/department-appeals";

import { schoolClock } from "@/lib/timetable/school-clock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { readTeacherSchedule, scheduleAvailability as availabilityOf } from "@/lib/timetable/teacher-schedule-read";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { useCountLabel, useIsSingular } from "@/components/locale/use-count-label";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { FlagshipCard } from "@/components/ui/flagship";
import { SetupPrompt } from "@/components/ai-workflows/setup-prompt";
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
  const count = useCountLabel();
  const singular = useIsSingular();
  const locale = useLocale();
  const { data, loading, error, refetch } = useTeacherData();
  const access = useConsoleAccess();
  const canRegister = access.leafVisible("teacher", "attendance");
  const canMarks = access.leafVisible("teacher", "marks");
  const canExamStudio = access.leafVisible("teacher", "exam-studio");

  const [todaySlots, setTodaySlots] = useState<TimetableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [scheduleAvailability, setScheduleAvailability] = useState<"published" | "unpublished" | "failed">("published");
  const [selfAttendanceStatus, setSelfAttendanceStatus] = useState<"loading" | "unmarked" | "marked" | "failed">("loading");
  const [selfAttendanceTime, setSelfAttendanceTime] = useState<string | null>(null);

  const [attendanceRetry, setAttendanceRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setSelfAttendanceStatus("loading");
    (async () => {
      try {
        // API dates follow the school calendar, including when the teacher travels.
        const today = schoolClock(new Date(), locale.timezone).day;
        const res = await fetch(`/api/teacher-attendance?userId=self&date=${today}`);
        const json = await res.json();
        if (!active) return;
        if (!res.ok || !json.success || !Array.isArray(json.data)) throw new Error("Attendance unavailable");
        if (json.data.length > 0) {
          setSelfAttendanceStatus("marked");
          setSelfAttendanceTime(json.data[0].checkInTime);
        } else {
          setSelfAttendanceStatus("unmarked");
        }
      } catch { if (active) setSelfAttendanceStatus("failed"); }
    })();
    return () => { active = false; };
  }, [locale.timezone, attendanceRetry]);

  useEffect(() => {
    (async () => {
      // SKAI-1024: the same read and empty-state rule as /teacher/timetable (an empty week is "unpublished").
      try {
        const slots = await readTeacherSchedule<TimetableSlot>();
        setScheduleAvailability(availabilityOf(slots, null));
        const weekday = new Intl.DateTimeFormat("en", { timeZone: locale.timezone, weekday: "short" }).format(new Date());
        const dayNum = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday) + 1;
        setTodaySlots(
          slots
            .filter((s) => s.dayOfWeek === dayNum && s.slotType === "CLASS" && s.subject)
            .sort((a, b) => a.periodNumber - b.periodNumber)
        );
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
    const nowMinutes = schoolClock(new Date(), locale.timezone).minutes;
    const byLesson = [...todaySlots].sort((a, b) => {
      const aDone = toMinutes(a.endTime) <= nowMinutes ? 1 : 0;
      const bDone = toMinutes(b.endTime) <= nowMinutes ? 1 : 0;
      return aDone - bDone || a.periodNumber - b.periodNumber;
    });
    const fromLessons = byLesson.find((slot) => (unmarked.get(slot.classId) ?? 0) > 0)?.classId;
    return fromLessons ?? [...unmarked.keys()][0] ?? null;
  }, [data, todaySlots, locale.timezone]);

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
      ) : selfAttendanceStatus === "failed" ? (
        <span role="status" className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          {ui("Check-in status unavailable")}
          <Button variant="outline" size="sm" onClick={() => setAttendanceRetry(value => value + 1)}>{ui("Try again")}</Button>
        </span>
      ) : (
        // SKAI-1119: teachers cannot mark their own attendance; admins/principals record it.
        <Badge variant="outline" className="min-h-11 rounded-xl px-3 text-xs">
          <UserCheck aria-hidden="true" />
          {ui("Not marked yet")}
        </Badge>
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
        <DepartmentAppeals />
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
                detail={ui("{0} not marked today", [count(attendanceStats.unmarked, "pupil")])}
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

        {/* ── Flagship: AI Workflows first-login setup (per-user, so invited teachers see it too) ── */}
        <SetupPrompt />

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
            { key: "classes", icon: GraduationCap, label: singular(classHubs.length) ? ui("Class") : ui("Classes"), value: classHubs.length, tone: "violet" },
            { key: "students", icon: Users, label: singular(data.totalStudents) ? ui("Pupil") : ui("Pupils"), value: data.totalStudents, tone: "emerald" },
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
