"use client";

import { useEffect, useMemo, useState } from "react";
import { ATTENDANCE_RISK_THRESHOLD } from "@/lib/attendance";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import Link from "next/link";
import { AvatarImage } from "@/components/ui/avatar-image";
import {
  Award, BookOpen, CalendarClock, CheckCircle2, ChevronRight, Clock, CreditCard,
  GraduationCap, MapPin, Printer, Sparkles, TrendingUp,
} from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { cn } from "@/lib/utils";
import { localeTag } from "@/lib/locale/package";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { AiActionPanel, EmptyState } from "@/components/role-dashboard";
import { DashboardSkeleton, StudentErrorState } from "@/components/student/student-components";
import { CountUp, Panel, PanelHeading, StatCard } from "@/components/student/student-ui";
import { useStudentData } from "./student-data-context";
import { CornerSparkles } from "@/components/CornerSparkles";
import { LearnerInsights, learnerSeriesFromStudent } from "@/components/insights";
import { downloadPdfFile } from "@/lib/download";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { StudentToday } from "@/components/student/student-today";

/** A text link that reads as a quiet action: 44px tall, with an arrow that leans forward. */
const panelLink = cn(buttonVariants({ variant: "ghost", size: "sm" }), "sk-nudge-trigger -me-2 gap-1 text-primary");

/** Timetable days are 1=Mon..7=Sun; JS getDay() is 0=Sun. */
function isoDayOfWeek(d: Date) {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

function minutesOfDay(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function StudentDashboard() {
  const { money } = useLocaleFormat();
  const tr = useUiText();
  const locale = useLocale();
  const { data, loading, refetch, error } = useStudentData();
  const [downloading, setDownloading] = useState(false);
  const [upcomingPapers, setUpcomingPapers] = useState<any[]>([]);
  const [papersLoaded, setPapersLoaded] = useState(false);
  const [slots, setSlots] = useState<any[] | null>(null);
  // Re-render each minute so "now / next" stays truthful while the tab is open.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/timetable/class");
        const json = await res.json();
        if (!cancelled) setSlots(json.success && json.data ? json.data.slots : []);
      } catch {
        if (!cancelled) setSlots([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!data?.user?.classId || papersLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const exRes = await fetch(`/api/exams?classId=${data.user.classId}`);
        const exJson = await exRes.json();
        if (!exJson.success) return;
        const exams = exJson.exams || [];
        const schJson = await Promise.all(
          exams.map((exam: any) => fetch(`/api/academic/exam-schedule?examId=${exam.id}`).then((r) => r.json()).catch(() => null))
        );
        const today = new Date();
        const papers: any[] = [];
        exams.forEach((exam: any, i: number) => {
          const rows = schJson[i]?.success ? (schJson[i].data || []) : [];
          for (const row of rows) {
            const d = new Date(row.date + "T00:00:00");
            if (d >= today) papers.push({ ...row, exam });
          }
        });
        papers.sort((a, b) => a.date.localeCompare(b.date));
        if (!cancelled) setUpcomingPapers(papers.slice(0, 6));
      } catch {}
      finally { if (!cancelled) setPapersLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [data?.user?.classId, papersLoaded]);

  const today = useMemo(() => {
    if (!slots?.length) return [];
    const day = isoDayOfWeek(now);
    return slots
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.periodNumber - b.periodNumber);
  }, [slots, now]);

  // One pass marks the period covering the clock, then the first one after it.
  const todayWithState = useMemo(() => {
    const mins = now.getHours() * 60 + now.getMinutes();
    let nextTaken = false;
    return today.map((s) => {
      const start = minutesOfDay(s.startTime);
      const end = minutesOfDay(s.endTime);
      const current = mins >= start && mins < end;
      const isNext = !current && !nextTaken && start > mins;
      if (isNext) nextTaken = true;
      return { ...s, current, isNext, done: end <= mins };
    });
  }, [today, now]);

  const handleDownloadPdf = async () => {
    if (!data?.user?.id) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/reports/download?studentId=${data.user.id}`);
      const json = await res.json();
      if (json.success && json.pdfUrl) {
        await downloadPdfFile(json.pdfUrl, "report-card.pdf");
      } else {
        toast.error(tr("No report card is available to download yet."));
      }
    } catch {
      toast.error(tr("Could not download the report card. Please try again."));
    } finally {
      setDownloading(false);
    }
  };

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const user = data.user;
  const average = user.marks.length
    ? Math.round(
        user.marks.reduce((sum: number, mark: any) => sum + (mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100, 0) /
          user.marks.length
      )
    : 0;
  const invoiced = user.invoices?.filter((invoice: any) => invoice.currency === user.balanceCurrency).reduce((s: number, i: any) => s + (i.totalAmount || 0), 0) || 0;
  const feePaidPct = invoiced ? Math.round(((invoiced - user.balanceDue) / invoiced) * 100) : 100;

  const studentAIFeatures = [
    { feature: "explain_report_card", label: tr("Explain Report"), placeholder: tr("Optional question about the latest report") },
    { feature: "study_plan", label: tr("Study Plan"), placeholder: tr("Goal, exam, or available study time") },
    { feature: "school_faq", label: tr("School FAQ"), field: "question" as const, placeholder: tr("Ask an approved school question") },
  ];

  const nextPaper = upcomingPapers[0];
  const upNext = todayWithState.find((s) => s.current) || todayWithState.find((s) => s.isNext);
  const tag = localeTag(locale);
  const periodCount = todayWithState.length;

  return (
    <StudentPage
      avatar={<AvatarImage src={user.profileImageUrl} name={user.fullName} initialsClassName="text-lg" className="h-full w-full object-cover" />}
      icon={GraduationCap}
      eyebrow={<>{tr(greeting())}</>}
      title={user.fullName}
      summary={
        <>
          {user.rollNo || tr("No roll number")} · {user.className} · {user.campusName}
        </>
      }
      actions={
        <>
          {/* SKO-418: now/next lives in Today below, computed in school time rather than the device clock. */}
          <Button
            variant="dark"
            className="min-h-10"
            loading={downloading}
            onClick={handleDownloadPdf}
          >
            {downloading ? null : <Printer aria-hidden="true" />}
            {tr("Report Card")}
          </Button>
        </>
      }
    >
      {!data.profileMissing ? <StudentToday /> : null}
      {data.profileMissing ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={GraduationCap}
            title={tr("Academic profile not linked yet")}
            description={tr("The account is active, but no central student record is linked to it yet.")}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Award}
              label={tr("Average")}
              value={<CountUp value={average} suffix="%" />}
              sub={user.marks.length ? tr("Across {0} published marks", [user.marks.length]) : tr("No published marks yet")}
              tone="purple"
              delay={80}
            />
            <StatCard
              icon={CheckCircle2}
              label={tr("Attendance")}
              value={user.attendanceRate === null ? "—" : <CountUp value={user.attendanceRate} suffix="%" />}
              sub={user.attendanceRate === null ? tr("Nothing marked yet") : user.attendanceRate >= ATTENDANCE_RISK_THRESHOLD ? tr("Good standing") : tr("Below {0}%", [ATTENDANCE_RISK_THRESHOLD])}
              tone={user.attendanceRate === null ? "purple" : user.attendanceRate >= ATTENDANCE_RISK_THRESHOLD ? "green" : "rose"}
              ring={user.attendanceRate}
              delay={160}
            />
            <StatCard
              icon={BookOpen}
              label={tr("Subjects")}
              value={<CountUp value={user.subjects.length} />}
              sub={tr("Enrolled this year")}
              tone="purple"
              delay={240}
            />
            <StatCard
              icon={CreditCard}
              label={tr("Balance Due")}
              /* Invoice amounts are stored in paisa — the guardian portal
                 already divides, and this card was reading 100x high. */
              value={money(user.balanceDue, user.balanceCurrency)}
              sub={user.balanceDue > 0 ? tr("{0}% of fees cleared", [feePaidPct]) : tr("All fees cleared")}
              tone={user.balanceDue > 0 ? "amber" : "green"}
              ring={invoiced ? feePaidPct : null}
              delay={320}
            />
          </div>

          {/* How the year is actually going, before the day-to-day below. */}
          <LearnerInsights series={learnerSeriesFromStudent(user)} />

          {/* Today + next paper */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Panel className="xl:col-span-2" delay={360}>
              <PanelHeading
                icon={Clock}
                title={tr("Today's Classes")}
                sub={`${now.toLocaleDateString(tag, { weekday: "short" })} · ${tr(periodCount === 1 ? "{0} period" : "{0} periods", [periodCount])}`}
                action={
                  <Link href="/student/timetable" className={panelLink}>
                    {tr("Full week")} <ChevronRight aria-hidden="true" className="sk-nudge size-3.5 rtl:rotate-180" />
                  </Link>
                }
              />
              {slots === null ? (
                <SkeletonRegion label={tr("Loading today's classes")} className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} delay={i * 60} className="h-16 rounded-2xl" />
                  ))}
                </SkeletonRegion>
              ) : todayWithState.length ? (
                <ol className="space-y-2">
                  {todayWithState.map((s) => (
                    <li
                      key={`${s.dayOfWeek}-${s.periodNumber}`}
                      aria-current={s.current ? "time" : undefined}
                      className={cn(
                        "flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors duration-200 sm:gap-4 sm:px-4",
                        s.current
                          ? "border-status-success-border bg-status-success-surface shadow-xs"
                          : s.done
                          ? "border-border-subtle bg-surface-subtle opacity-70"
                          : "border-border-subtle bg-white hover:border-border-subtle-hover hover:bg-surface-hover",
                      )}
                    >
                      <div className="sk-panel flex size-12 shrink-0 flex-col items-center justify-center gap-0.5 shadow-none">
                        <span className="text-2xs font-semibold leading-none text-primary/80">{tr("Period")}</span>
                        <span className="text-sm font-bold leading-none tabular-nums text-ink-strong">{s.periodNumber}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-strong">
                          {s.subject?.name || s.slotType || tr("Class")}
                        </p>
                        <p className="truncate text-xs tabular-nums text-ink-subtle">
                          {s.startTime}–{s.endTime}
                          {s.teacher?.fullName ? ` · ${s.teacher.fullName}` : ""}
                          {s.roomNumber ? ` · ${tr("Room {0}", [s.roomNumber])}` : ""}
                        </p>
                      </div>
                      {s.current && (
                        <Badge variant="success" size="sm" dot className="shrink-0">{tr("Now")}</Badge>
                      )}
                      {s.isNext && (
                        <Badge variant="secondary" size="sm" className="shrink-0">{tr("Next")}</Badge>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  size="sm"
                  icon={Clock}
                  className="rounded-2xl border border-dashed border-border-subtle bg-surface-subtle"
                  title={tr("No classes scheduled today")}
                  description={slots.length ? tr("Enjoy the day off.") : tr("Your timetable will appear once the school publishes it.")}
                />
              )}
            </Panel>

            <Panel delay={420}>
              <PanelHeading icon={CalendarClock} title={tr("Next Paper")} tone="amber" />
              {nextPaper ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-edge/15 bg-gradient-to-br from-brand-50 to-white p-4 sm:p-5">
                    <p className="sk-eyebrow">{nextPaper.exam?.title || tr("Exam")}</p>
                    <p className="mt-1 break-words text-xl font-bold tracking-tight text-ink-strong">
                      {nextPaper.subject?.name || tr("Class-wide paper")}
                    </p>
                    <p className="mt-2 text-sm text-ink-muted">
                      {new Date(nextPaper.date + "T00:00:00").toLocaleDateString(tag, {
                        weekday: "long", month: "long", day: "numeric",
                      })}
                    </p>
                    {nextPaper.periodDefinition && (
                      <p className="text-xs tabular-nums text-ink-subtle">
                        {nextPaper.periodDefinition.startTime}–{nextPaper.periodDefinition.endTime}
                      </p>
                    )}
                    {nextPaper.room && (
                      <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary">
                        <MapPin aria-hidden="true" className="size-3.5" /> {tr("Room {0}", [nextPaper.room.roomNumber])}
                      </p>
                    )}
                  </div>
                  {upcomingPapers.length > 1 && (
                    <ul className="space-y-1.5">
                      {upcomingPapers.slice(1, 4).map((p) => (
                        <li key={p.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-surface-subtle px-3 py-2">
                          <span className="w-14 shrink-0 text-xs font-semibold tabular-nums text-primary">
                            {new Date(p.date + "T00:00:00").toLocaleDateString(tag, { month: "short", day: "numeric" })}
                          </span>
                          <span className="min-w-0 truncate text-sm font-medium text-ink-strong">
                            {p.subject?.name || tr("Paper")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href="/student/timetable" className={panelLink}>
                    {tr("Full date sheet")} <ChevronRight aria-hidden="true" className="sk-nudge size-3.5 rtl:rotate-180" />
                  </Link>
                </div>
              ) : (
                <EmptyState
                  size="sm"
                  icon={CalendarClock}
                  className="rounded-2xl border border-dashed border-border-subtle bg-surface-subtle"
                  title={tr("No papers scheduled")}
                  description={tr("Exam date sheets appear here once published.")}
                />
              )}
            </Panel>
          </div>

          <AcademicCalendar readOnly role="STUDENT" />

          {/* AI */}
          <section
            aria-labelledby="student-insight-title"
            className="sk-rise sk-brand-surface relative flex flex-col gap-4 overflow-hidden rounded-[28px] p-3 shadow-xl sm:rounded-[32px] sm:p-8 lg:flex-row"
            style={{ animationDelay: "480ms" }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute -end-16 -top-24 size-64 rounded-full bg-white/5 blur-3xl" />
            <div className="relative min-w-0 flex-1 space-y-5 text-white">
              <div className="flex items-center gap-3">
                <div aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur-sm">
                  {user.aiInsights?.length ? <Sparkles className="size-5 text-white" /> : <TrendingUp className="size-5 text-white" />}
                </div>
                <h2 id="student-insight-title" className="text-lg font-bold leading-tight tracking-tight sm:text-xl">{tr("Academic Insight")}</h2>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-white/85">
                {user.aiInsights?.[0]?.summary ||
                  user.reportCards?.[0]?.remarksEn ||
                  tr("Academic performance will be summarized here after marks and report card remarks are published.")}
              </p>
              {user.aiInsights?.length > 1 ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {user.aiInsights.slice(1, 3).map((insight: any) => (
                    <div key={insight.id} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-white/70">
                        {insight.feature.replaceAll("_", " ")}
                      </p>
                      <p className="text-sm leading-relaxed text-white/90">{insight.summary}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="relative min-w-0 overflow-hidden rounded-3xl bg-white/95 p-3 text-ink-strong shadow-xl sm:p-5 lg:w-[360px] lg:shrink-0">
              <CornerSparkles />
              <AiActionPanel
                title={tr("Student AI")}
                options={studentAIFeatures}
                studentId={user.id}
                compact
                onComplete={refetch}
              />
            </div>
          </section>
        </div>
      )}
    </StudentPage>
  );
}
