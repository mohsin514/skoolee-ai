"use client";

import { useMemo } from "react";
import { Award, CheckCircle2, FileText, GraduationCap } from "lucide-react";
import { StatCard, StudentEmptyState } from "@/components/student/student-ui";
import { cn } from "@/lib/utils";
import { StudentPage } from "@/components/student/student-page";
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
    <StudentPage
      tone="reports"
      icon={FileText}
      eyebrow={
        <>
          {summary.total
            ? `${summary.total} report card${summary.total > 1 ? "s" : ""} · ${summary.published} published`
            : "No report cards"}
        </>
      }
      title="Report Cards"
      summary="Your published academic records and performance summaries."
    >
      <div className="space-y-3">
        {user.reportCards.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard icon={FileText} label="Total Cards" value={summary.total} sub="Issued" delay={40} />
              <StatCard icon={GraduationCap} label="Best Score" value={`${summary.best}%`} sub={summary.best >= 80 ? "Excellent" : summary.best >= 60 ? "Good" : "Needs focus"} tone="green" ring={summary.best} delay={80} />
              <StatCard icon={Award} label="Average" value={`${summary.average}%`} sub={`Across ${summary.total} card${summary.total > 1 ? "s" : ""}`} tone="purple" ring={summary.average} delay={120} />
              <StatCard icon={CheckCircle2} label="Published" value={summary.published} sub={summary.draft ? `${summary.draft} still in draft` : "All released"} tone={summary.draft ? "amber" : "green"} delay={160} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {user.reportCards.map((report: any, index: number) => (
                <ReportCard key={report.id} report={report} index={index} />
              ))}
            </div>
          </>
        ) : (
          <StudentEmptyState
            icon={FileText}
            title="No report cards yet"
            description="Report cards appear here after teachers publish them for your exams."
          />
        )}
      </div>
    </StudentPage>
  );
}


function ReportCard({ report, index }: { report: any; index: number }) {
  const pct = Math.round(report.percentage || 0);
  const status = (report.status || "Draft") as string;

  const scoreColor = pct >= 80 ? "from-emerald-500 to-emerald-400" : pct >= 60 ? "from-amber-500 to-amber-400" : "from-rose-500 to-rose-400";
  const scoreText = pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-rose-600";
  const scoreLabel = pct >= 80 ? "Excellent" : pct >= 60 ? "Good" : "Needs improvement";

  return (
    <div className="sk-rise group relative overflow-hidden rounded-[22px] border border-[#cfc2d6]/20 bg-white shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:shadow-[0_2px_4px_rgba(31,26,35,0.05),0_14px_28px_-14px_rgba(129,39,207,0.4)]" style={{ animationDelay: `${200 + index * 60}ms` }}>
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe]/60 via-white to-white p-4 pb-3 border-b border-[#cfc2d6]/8">
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
      <div className="p-4 pt-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold text-ink-subtle">Academic Year {report.exam?.academicYear || "—"}</span>
          <span className="h-3 w-[1px] bg-[#cfc2d6]/20" />
          <span className="text-[10px] font-semibold text-ink-subtle">{Math.round(report.percentage || 0)}% overall</span>
        </div>
        {report.remarksEn ? (
          <div className="rounded-2xl border border-[#cfc2d6]/10 bg-[#fbf0fe]/30 p-3">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-ink-subtle">
              Teacher Remarks
            </p>
            <p className="text-xs font-medium leading-relaxed text-ink">{report.remarksEn}</p>
          </div>
        ) : (
          <p className="text-xs font-semibold text-ink-subtle">No remarks provided.</p>
        )}
      </div>
    </div>
  );
}

