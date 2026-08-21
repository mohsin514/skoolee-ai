"use client";

import { useMemo } from "react";
import { Award, ChevronRight, FileText, GraduationCap } from "lucide-react";
import { ReportsSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";

export default function ReportsPage() {
  const { data, loading, error, refetch } = useStudentData();

  const summary = useMemo(() => {
    if (!data?.user?.reportCards?.length) return { total: 0, best: 0, average: 0, published: 0, draft: 0 };
    const cards = data.user.reportCards;
    const pcts = cards.map((r: any) => Math.round(r.percentage || 0));
    return {
      total: cards.length,
      best: Math.max(...pcts, 0),
      average: Math.round(pcts.reduce((a: number, b: number) => a + b, 0) / pcts.length),
      published: cards.filter((r: any) => r.status === "PUBLISHED" || r.status === "SENT").length,
      draft: cards.filter((r: any) => r.status === "DRAFT" || !r.status).length,
    };
  }, [data]);

  if (loading && !data) return <ReportsSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data || !data.user) return null;

  const user = data.user;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {summary.total ? `${summary.total} report card${summary.total > 1 ? "s" : ""} · ${summary.published} published` : "No report cards"}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Report Cards</h2>
          <p className="mt-1 text-sm font-semibold text-ink-muted">Your published academic records and performance summaries.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        {user.reportCards.length > 0 ? (
          <>
            <div className="sk-rise grid grid-cols-2 md:grid-cols-4 gap-4" style={{ animationDelay: "40ms" }}>
              <SummaryStat icon={FileText} label="Total Cards" value={summary.total} sub="Issued" />
              <SummaryStat icon={GraduationCap} label="Best Score" value={`${summary.best}%`} sub={summary.best >= 80 ? "Excellent" : summary.best >= 60 ? "Good" : "Needs focus"} tone="green" />
              <SummaryStat icon={Award} label="Average" value={`${summary.average}%`} sub={`Across ${summary.total} card${summary.total > 1 ? "s" : ""}`} tone="purple" />
              <SummaryStat icon={FileText} label="Published" value={summary.published} sub={`${summary.draft} still in draft`} tone="rose" />
            </div>

            <div className="sk-rise grid grid-cols-1 md:grid-cols-2 gap-6" style={{ animationDelay: "80ms" }}>
              {user.reportCards.map((report: any) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-[40px] border border-dashed border-[#cfc2d6]/20 bg-[#fbf0fe]/10">
            <div className="h-16 w-16 rounded-[28px] bg-[#fbf0fe] flex items-center justify-center mb-5">
              <FileText className="w-8 h-8 text-[#8127cf]/40" />
            </div>
            <h3 className="text-xl font-bold text-[#1d1b20] tracking-tight">No report cards yet</h3>
            <p className="mt-1 text-sm font-semibold text-ink-muted max-w-sm">
              Report cards will appear here after teachers publish them for your exams.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryStat({ icon: Icon, label, value, sub, tone = "dark" }: { icon: any; label: string; value: string | number; sub: string; tone?: string }) {
  const iconGlows: Record<string, string> = {
    green: "bg-emerald-500/18",
    rose: "bg-rose-500/18",
    purple: "bg-[#8127cf]/18",
    dark: "bg-[#8127cf]/18",
  };
  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25">
      <div className="relative flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-ink-subtle uppercase tracking-wider transition-colors group-hover:text-ink-muted">{label}</p>
        <div className="relative">
          <div className={`absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${iconGlows[tone] || iconGlows.dark}`} />
          <div className={cn(
            "relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg",
            tone === "green" ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white" :
            tone === "rose" ? "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white" :
            tone === "purple" ? "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white" :
            "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white"
          )}>
            <Icon className="w-[18px] h-[18px]" />
          </div>
        </div>
      </div>
      <p className="text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-ink-subtle">{sub}</p>
    </div>
  );
}

function ReportCard({ report }: { report: any }) {
  const pct = Math.round(report.percentage || 0);
  const status = (report.status || "Draft") as string;

  const scoreColor = pct >= 80 ? "from-emerald-500 to-emerald-400" : pct >= 60 ? "from-amber-500 to-amber-400" : "from-rose-500 to-rose-400";
  const scoreText = pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-rose-600";
  const scoreLabel = pct >= 80 ? "Excellent" : pct >= 60 ? "Good" : "Needs improvement";

  return (
    <div className="sk-rise group relative rounded-[28px] bg-white border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25 overflow-hidden" style={{ animationDelay: "120ms" }}>
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe]/60 via-white to-white p-6 pb-4 border-b border-[#cfc2d6]/8">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-[#8127cf]/3 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider mb-1 transition-colors group-hover:text-ink-muted">
              {report.exam?.term || "Exam"}
            </p>
            <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight transition-colors group-hover:text-[#8127cf]">
              {report.exam?.title || "Report Card"}
            </h3>
            <div className="flex items-center gap-2.5 mt-2.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-white border border-[#8127cf]/10 px-3 py-0.5 text-[9px] font-bold text-[#8127cf] uppercase tracking-wider shadow-sm transition-all group-hover:bg-[#8127cf] group-hover:text-white group-hover:border-transparent group-hover:shadow-md">
                <Award className="w-3 h-3" />
                {report.grade || "Pending"}
              </span>
              <span className={cn(
                "text-[9px] font-semibold uppercase tracking-wider",
                status === "PUBLISHED" || status === "SENT" ? "text-emerald-600" : "text-amber-600"
              )}>
                {status === "PUBLISHED" || status === "SENT" ? "Published" : status === "DRAFT" ? "Draft" : status}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center shrink-0">
            <div className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center bg-gradient-to-br shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl",
              scoreColor
            )}>
              <span className="text-xl font-bold text-white">{pct}</span>
            </div>
            <span className={cn("text-[9px] font-bold mt-1", scoreText)}>{scoreLabel}</span>
          </div>
        </div>
      </div>
      <div className="p-6 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold text-ink-subtle">Academic Year {report.exam?.academicYear || "—"}</span>
          <span className="h-3 w-[1px] bg-[#cfc2d6]/20" />
          <span className="text-[10px] font-semibold text-ink-subtle">{Math.round(report.percentage || 0)}% overall</span>
        </div>
        {report.remarksEn ? (
          <div className="relative">
            <p className="text-sm font-medium text-ink leading-relaxed line-clamp-3 transition-colors group-hover:text-ink">
              {report.remarksEn}
            </p>
          </div>
        ) : (
          <p className="text-sm font-semibold text-ink-subtle italic">No remarks provided.</p>
        )}
        <div className="mt-4 flex items-center gap-1 text-[10px] font-semibold text-[#8127cf] opacity-0 transition-all duration-300 group-hover:opacity-100">
          <span>View details</span>
          <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
