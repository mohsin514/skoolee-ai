"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AvatarImage } from "@/components/ui/avatar-image";
import {
  Award, BookOpen, CalendarClock, CheckCircle2, ChevronRight, Clock, CreditCard,
  GraduationCap, Loader2, MapPin, Printer, Sparkles, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { AiActionPanel, BrandButton, EmptyState } from "@/components/role-dashboard";
import { DashboardSkeleton, StudentErrorState } from "@/components/student/student-components";
import { CountUp, Panel, PanelHeading, StatCard } from "@/components/student/student-ui";
import { useStudentData } from "./student-data-context";
import { CornerSparkles } from "@/components/CornerSparkles";
import { downloadPdfFile } from "@/lib/download";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
        toast.error(json.error || "No report card available to download");
      }
    } catch {
      toast.error("Failed to download report card");
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
  const invoiced = user.invoices?.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0) || 0;
  const feePaidPct = invoiced ? Math.round(((invoiced - user.balanceDue) / invoiced) * 100) : 100;

  const studentAIFeatures = [
    { feature: "explain_report_card", label: "Explain Report", placeholder: "Optional question about the latest report" },
    { feature: "study_plan", label: "Study Plan", placeholder: "Goal, exam, or available study time" },
    { feature: "school_faq", label: "School FAQ", field: "question" as const, placeholder: "Ask an approved school question" },
  ];

  const nextPaper = upcomingPapers[0];
  const upNext = todayWithState.find((s) => s.current) || todayWithState.find((s) => s.isNext);

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* Hero */}
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative p-7 px-9">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="flex gap-6 items-start group">
              <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-[32px] bg-gradient-to-br from-[#fbf0fe] to-white border-4 border-[#cfc2d6]/20 shadow-xl overflow-hidden shrink-0 transition-all duration-500 group-hover:scale-[1.03] group-hover:border-[#8127cf]/30 group-hover:shadow-2xl">
                <AvatarImage src={user.profileImageUrl} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
              </div>
              <div className="pt-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8127cf]/70">
                  {greeting()}
                </p>
                {/* Fixed at text-4xl this wrapped a three-word name onto three
                    lines on a phone; type and avatar both step down so a
                    longer real name still fits. */}
                <h2 className="text-2xl sm:text-3xl xl:text-4xl font-bold tracking-tight text-[#1d1b20] leading-tight sm:leading-none mt-1 mb-2 transition-colors group-hover:text-[#8127cf]">
                  {user.fullName}
                </h2>
                <p className="text-sm font-semibold text-[#4d4354]/60 uppercase tracking-wider">
                  {user.rollNo || "No roll number"} · {user.className}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-[10px] font-bold text-[#8127cf] bg-[#fbf0fe] px-3 py-1 rounded-lg uppercase tracking-wider">
                    {user.campusName}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg uppercase tracking-wider">
                    Enrolled
                  </span>
                </div>
              </div>
            </div>

            {/* At-a-glance: what matters right now, without scrolling */}
            <div className="flex items-center gap-4">
              {upNext && (
                <div className="hidden lg:flex items-center gap-3 rounded-[24px] bg-white/80 backdrop-blur px-5 py-3.5 border border-[#cfc2d6]/20 shadow-sm">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${upNext.current ? "bg-emerald-50 text-emerald-600" : "bg-[#fbf0fe] text-[#8127cf]"}`}>
                    <Clock className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/40">
                      {upNext.current ? "In class now" : "Up next"}
                    </p>
                    <p className="text-sm font-bold text-[#1d1b20] truncate max-w-[160px]">
                      {upNext.subject?.name || upNext.slotType || "Class"}
                    </p>
                    <p className="text-[10px] font-semibold text-[#4d4354]/45">
                      {upNext.startTime}–{upNext.endTime}
                    </p>
                  </div>
                </div>
              )}
              <BrandButton
                variant="dark"
                icon={downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                onClick={handleDownloadPdf}
                disabled={downloading}
              >
                {downloading ? "Generating..." : "Report Card"}
              </BrandButton>
            </div>
          </div>
        </div>
      </div>

      {data.profileMissing ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={GraduationCap}
            title="Academic profile not linked yet"
            description="The account is active, but no central student record is linked to it yet."
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <StatCard
              icon={Award}
              label="Average"
              value={<CountUp value={average} suffix="%" />}
              sub={user.marks.length ? `Across ${user.marks.length} published marks` : "No published marks yet"}
              tone="purple"
              delay={80}
            />
            <StatCard
              icon={CheckCircle2}
              label="Attendance"
              value={user.attendanceRate === null ? "N/A" : <CountUp value={user.attendanceRate} suffix="%" />}
              sub={user.attendanceRate === null ? "Nothing marked yet" : user.attendanceRate >= 75 ? "Good standing" : "Below 75%"}
              tone={user.attendanceRate === null ? "purple" : user.attendanceRate >= 75 ? "green" : "rose"}
              ring={user.attendanceRate}
              delay={160}
            />
            <StatCard
              icon={BookOpen}
              label="Subjects"
              value={<CountUp value={user.subjects.length} />}
              sub="Enrolled this year"
              tone="purple"
              delay={240}
            />
            <StatCard
              icon={CreditCard}
              label="Balance Due"
              value={<CountUp value={user.balanceDue} prefix="Rs " />}
              sub={user.balanceDue > 0 ? `${feePaidPct}% of fees cleared` : "All fees cleared"}
              tone={user.balanceDue > 0 ? "amber" : "green"}
              ring={invoiced ? feePaidPct : null}
              delay={320}
            />
          </div>

          {/* Today + next paper */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <Panel className="xl:col-span-2" delay={360}>
              <PanelHeading
                icon={Clock}
                title="Today's Classes"
                sub={`${WEEKDAYS[isoDayOfWeek(now)]} · ${todayWithState.length} period${todayWithState.length !== 1 ? "s" : ""}`}
                action={
                  <Link
                    href="/student/timetable"
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#6a1fb0]"
                  >
                    Full week <ChevronRight className="w-3 h-3" />
                  </Link>
                }
              />
              {slots === null ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 rounded-2xl bg-[#e8e0ec]/40 animate-pulse" />
                  ))}
                </div>
              ) : todayWithState.length ? (
                <div className="space-y-2">
                  {todayWithState.map((s) => (
                    <div
                      key={`${s.dayOfWeek}-${s.periodNumber}`}
                      className={`group flex items-center gap-4 rounded-2xl border px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        s.current
                          ? "border-emerald-300/60 bg-emerald-50/60 shadow-sm"
                          : s.done
                          ? "border-[#cfc2d6]/10 bg-[#f8f6fa]/60 opacity-60"
                          : "border-[#cfc2d6]/12 bg-white"
                      }`}
                    >
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-white border border-[#cfc2d6]/20">
                        <span className="text-[7px] font-black uppercase text-[#8127cf]/60">Period</span>
                        <span className="text-sm font-black leading-none text-[#1f1a23]">{s.periodNumber}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">
                          {s.subject?.name || s.slotType || "Class"}
                        </p>
                        <p className="truncate text-[10px] font-semibold text-[#4d4354]/45">
                          {s.startTime}–{s.endTime}
                          {s.teacher?.fullName ? ` · ${s.teacher.fullName}` : ""}
                          {s.roomNumber ? ` · Room ${s.roomNumber}` : ""}
                        </p>
                      </div>
                      {s.current && (
                        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                          Now
                        </span>
                      )}
                      {s.isNext && (
                        <span className="shrink-0 rounded-full bg-[#fbf0fe] px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-[#8127cf]">
                          Next
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-[#cfc2d6]/25 bg-[#fbf0fe]/15 py-12 text-center">
                  <Clock className="mb-3 h-8 w-8 text-[#4d4354]/20" />
                  <p className="text-sm font-bold text-[#1d1b20]">No classes scheduled today</p>
                  <p className="mt-1 text-xs font-semibold text-[#4d4354]/50">
                    {slots.length ? "Enjoy the day off." : "Your timetable will appear once the school publishes it."}
                  </p>
                </div>
              )}
            </Panel>

            <Panel delay={420}>
              <PanelHeading icon={CalendarClock} title="Next Paper" tone="amber" />
              {nextPaper ? (
                <div className="space-y-4">
                  <div className="rounded-[24px] bg-gradient-to-br from-[#fbf0fe] to-white p-5 border border-[#cfc2d6]/15">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/40">
                      {nextPaper.exam?.title || "Exam"}
                    </p>
                    <p className="mt-1 text-xl font-bold tracking-tight text-[#1d1b20]">
                      {nextPaper.subject?.name || "Class-wide paper"}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-[#4d4354]/55">
                      {new Date(nextPaper.date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "long", month: "long", day: "numeric",
                      })}
                    </p>
                    {nextPaper.periodDefinition && (
                      <p className="text-xs font-semibold text-[#4d4354]/45">
                        {nextPaper.periodDefinition.startTime}–{nextPaper.periodDefinition.endTime}
                      </p>
                    )}
                    {nextPaper.room && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-[#8127cf]">
                        <MapPin className="h-3 w-3" /> Room {nextPaper.room.roomNumber}
                      </p>
                    )}
                  </div>
                  {upcomingPapers.length > 1 && (
                    <div className="space-y-1.5">
                      {upcomingPapers.slice(1, 4).map((p) => (
                        <div key={p.id} className="flex items-center gap-3 rounded-xl bg-[#fbf0fe]/30 px-3 py-2">
                          <span className="text-[10px] font-black text-[#8127cf]/70 w-12 shrink-0">
                            {new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <span className="truncate text-[11px] font-bold text-[#1f1a23]">
                            {p.subject?.name || "Paper"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link
                    href="/student/timetable"
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#6a1fb0]"
                  >
                    Full date sheet <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-[#cfc2d6]/25 bg-[#fbf0fe]/15 py-12 text-center">
                  <CalendarClock className="mb-3 h-8 w-8 text-[#4d4354]/20" />
                  <p className="text-sm font-bold text-[#1d1b20]">No papers scheduled</p>
                  <p className="mt-1 text-xs font-semibold text-[#4d4354]/50">
                    Exam date sheets appear here once published.
                  </p>
                </div>
              )}
            </Panel>
          </div>

          <AcademicCalendar readOnly role="STUDENT" />

          {/* AI */}
          <div
            className="sk-rise bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-[40px] p-8 shadow-[0_14px_36px_-10px_rgba(31,26,35,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset] relative overflow-hidden flex flex-col lg:flex-row gap-8"
            style={{ animationDelay: "480ms" }}
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
            <div className="relative flex-1 text-white space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm transition-all hover:bg-white/30 hover:scale-110">
                  {user.aiInsights?.length ? <Sparkles className="w-6 h-6 text-white" /> : <TrendingUp className="w-6 h-6 text-white" />}
                </div>
                <h4 className="text-xl font-bold italic tracking-tight leading-none">Academic Insight</h4>
              </div>
              <p className="text-sm font-medium leading-relaxed italic max-w-2xl text-white/85">
                {user.aiInsights?.[0]?.summary ||
                  user.reportCards?.[0]?.remarksEn ||
                  "Academic performance will be summarized here after marks and report card remarks are published."}
              </p>
              {user.aiInsights?.length > 1 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {user.aiInsights.slice(1, 3).map((insight: any) => (
                    <div key={insight.id} className="rounded-2xl bg-white/10 border border-white/15 p-4 transition-all hover:bg-white/20 hover:-translate-y-0.5 hover:shadow-xl backdrop-blur-sm">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                        {insight.feature.replaceAll("_", " ")}
                      </p>
                      <p className="text-xs font-semibold leading-relaxed text-white/90">{insight.summary}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="relative lg:w-[360px] rounded-[28px] bg-white/95 p-5 text-[#1d1b20] shadow-xl transition-all hover:shadow-2xl hover:-translate-y-0.5 overflow-hidden">
              <CornerSparkles />
              <AiActionPanel
                title="Student AI"
                options={studentAIFeatures}
                studentId={user.id}
                compact
                onComplete={refetch}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
