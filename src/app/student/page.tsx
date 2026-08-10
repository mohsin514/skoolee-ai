"use client";

import { useEffect, useState } from "react";
import { Award, BookOpen, Calendar, CalendarClock, CreditCard, GraduationCap, Loader2, MapPin, Printer, Share2, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { AiActionPanel, BrandButton, EmptyState } from "@/components/role-dashboard";
import { DashboardSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "./student-data-context";
import { CornerSparkles } from "@/components/CornerSparkles";
import { downloadPdfFile } from "@/lib/download";

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function StudentDashboard() {
  const { data, loading, refetch, error } = useStudentData();
  const [downloading, setDownloading] = useState(false);
  const [upcomingPapers, setUpcomingPapers] = useState<any[]>([]);
  const [papersLoaded, setPapersLoaded] = useState(false);

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
  const studentAIFeatures = [
    { feature: "explain_report_card", label: "Explain Report", placeholder: "Optional question about the latest report" },
    { feature: "study_plan", label: "Study Plan", placeholder: "Goal, exam, or available study time" },
    { feature: "school_faq", label: "School FAQ", field: "question" as const, placeholder: "Ask an approved school question" },
  ];
  const profileImage = user.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName)}`;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className={`sk-rise relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0`}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative p-7 px-9">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="flex gap-6 items-start group">
              <div className="h-24 w-24 rounded-[32px] bg-gradient-to-br from-[#fbf0fe] to-white border-4 border-[#cfc2d6]/20 shadow-xl overflow-hidden shrink-0 transition-all duration-500 group-hover:scale-[1.03] group-hover:border-[#8127cf]/30 group-hover:shadow-2xl">
                <img src={profileImage} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
              </div>
              <div className="pt-2">
                <h2 className="text-4xl font-bold tracking-tight text-[#1d1b20] leading-none mb-2 transition-colors group-hover:text-[#8127cf]">{user.fullName}</h2>
                <p className="text-sm font-semibold text-[#4d4354]/60 uppercase tracking-wider">
                  {user.rollNo || "No roll number"} - {user.className}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">
                  {user.campusName}{user.campusCity ? ` - ${user.campusCity}` : ""}
                </p>
                <div className="flex gap-3 mt-4">
                  <span className="text-[10px] font-bold text-[#8127cf] bg-[#fbf0fe] px-3 py-1 rounded-lg uppercase tracking-wider transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-lg">
                    Enrolled
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg uppercase tracking-wider transition-all hover:bg-emerald-600 hover:text-white hover:shadow-lg">
                    Active
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <BrandButton variant="soft" icon={<Share2 className="w-4 h-4" />}>Share</BrandButton>
              <BrandButton variant="dark" icon={downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} onClick={handleDownloadPdf} disabled={downloading}>
                {downloading ? "Generating..." : "Download PDF"}
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <DashboardStat icon={Award} label="Average" value={`${average}%`} entranceDelay={80} />
            <DashboardStat icon={Calendar} label="Attendance" value={user.attendanceRate === null ? "N/A" : `${user.attendanceRate}%`} tone="green" entranceDelay={160} />
            <DashboardStat icon={BookOpen} label="Subjects" value={user.subjects.length} tone="purple" entranceDelay={240} />
            <DashboardStat icon={CreditCard} label="Balance Due" value={`Rs ${user.balanceDue.toLocaleString()}`} tone="rose" entranceDelay={320} />
          </div>

          {upcomingPapers.length > 0 && (
            <div className="sk-rise rounded-[28px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "360ms" }}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf0fe]">
                    <CalendarClock className="h-5 w-5 text-[#8127cf]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Upcoming Exam Papers</h3>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">
                      Next {upcomingPapers.length} paper{upcomingPapers.length !== 1 ? "s" : ""} · view full date sheet in Schedule
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {upcomingPapers.map((paper) => {
                  const day = new Date(paper.date + "T00:00:00").getDay();
                  return (
                    <div key={paper.id} className="flex items-center gap-3 rounded-2xl bg-[#fbf0fe]/30 p-3">
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white border border-[#cfc2d6]/20">
                        <span className="text-[8px] font-black uppercase text-[#8127cf]/60">{WEEKDAYS[day === 0 ? 7 : day]}</span>
                        <span className="text-sm font-black text-[#1f1a23] leading-none mt-0.5">{paper.date.slice(8, 10)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-[#1f1a23]">{paper.subject?.name || "Class-wide paper"}</p>
                        <p className="text-[9px] font-semibold text-[#4d4354]/45">
                          {paper.date}
                          {paper.periodDefinition ? ` · ${paper.periodDefinition.startTime}–${paper.periodDefinition.endTime}` : ""}
                        </p>
                        {paper.room && (
                          <p className="flex items-center gap-1 text-[9px] font-bold text-[#8127cf]/70">
                            <MapPin className="h-2.5 w-2.5" /> Room {paper.room.roomNumber}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="sk-rise bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-[40px] p-8 shadow-[0_14px_36px_-10px_rgba(31,26,35,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset] relative overflow-hidden flex flex-col lg:flex-row gap-8" style={{ animationDelay: "400ms" }}>
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
                  "Academic performance will be summarized here after marks and report card remarks are generated."}
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

function DashboardStat({ icon: Icon, label, value, tone = "purple", entranceDelay = 0 }: { icon: any; label: string; value: string | number; tone?: "purple" | "green" | "rose" | "dark"; entranceDelay?: number }) {
  const tones: Record<string, string> = {
    purple: "from-[#fbf0fe] to-white text-[#8127cf] group-hover:shadow-[#8127cf]/20",
    green: "from-emerald-50 to-white text-emerald-600 group-hover:shadow-emerald-500/20",
    rose: "from-rose-50 to-white text-[#b10e6b] group-hover:shadow-rose-500/20",
    dark: "from-[#1f1a23] to-[#2d2833] text-white group-hover:shadow-black/20",
  };
  const iconTone: Record<string, string> = {
    purple: "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
    green: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
    rose: "bg-rose-50 text-[#b10e6b] group-hover:bg-[#b10e6b] group-hover:text-white",
    dark: "bg-[#1f1a23] text-white",
  };
  const toneGlow: Record<string, string> = {
    purple: "bg-[#8127cf]/10",
    green: "bg-emerald-500/10",
    rose: "bg-rose-500/10",
    dark: "bg-[#1f1a23]/10",
  };

  return (
    <div
      className={`sk-rise group relative bg-white rounded-[28px] border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]`}
      style={entranceDelay > 0 ? { animationDelay: `${entranceDelay}ms` } : undefined}
    >
      <div className={`absolute inset-0 rounded-[28px] bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none ${tones[tone]}`} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-wider mb-2 transition-colors group-hover:text-[#4d4354]/60">
            {label}
          </p>
          <p className="text-3xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
        </div>
        <div className="relative shrink-0">
          <div className={`absolute -inset-2 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${toneGlow[tone]}`} />
          <div className={`relative h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${iconTone[tone]} shadow-md group-hover:shadow-xl group-hover:scale-110`}>
            <Icon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
          </div>
        </div>
      </div>
    </div>
  );
}
