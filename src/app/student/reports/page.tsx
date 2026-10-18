"use client";

import { useMemo } from "react";
import { Award, CheckCircle2, FileText, GraduationCap } from "lucide-react";
import { StatCard } from "@/components/student/student-ui";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {user.reportCards.map((report: any, index: number) => (
                <ReportCard key={report.id} report={report} index={index} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={FileText}
            className="sk-panel"
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
  const released = status === "PUBLISHED" || status === "SENT";

  const scoreColor = pct >= 80 ? "from-emerald-500 to-emerald-600" : pct >= 60 ? "from-amber-500 to-amber-600" : "from-rose-500 to-rose-600";
  const scoreText = pct >= 80 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-rose-700";
  const scoreLabel = pct >= 80 ? "Excellent" : pct >= 60 ? "Good" : "Needs improvement";

  return (
    <article className="sk-panel sk-rise relative min-w-0 overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-md" style={{ animationDelay: `${200 + index * 60}ms` }}>
      <div className="relative overflow-hidden border-b border-border-subtle bg-gradient-to-br from-brand-50/60 via-white to-white p-4 pb-3">
        <div aria-hidden="true" className="pointer-events-none absolute -end-12 -top-24 size-48 rounded-full bg-gradient-to-bl from-primary/5 to-transparent blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="sk-eyebrow mb-1 truncate">
              {report.exam?.term || "Exam"}
            </p>
            <h3 className="break-words text-lg font-bold tracking-tight text-ink-strong">
              {report.exam?.title || "Report Card"}
            </h3>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" size="sm">
                <Award aria-hidden="true" />
                {report.grade || "Pending"}
              </Badge>
              <Badge variant={released ? "success" : "warning"} size="sm" dot>
                {released ? "Published" : status === "DRAFT" ? "Draft" : status}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <div className={cn(
              "flex size-16 items-center justify-center rounded-full bg-gradient-to-br shadow-md",
              scoreColor
            )}>
              <span className="text-xl font-bold tabular-nums text-white">{pct}</span>
            </div>
            <span className={cn("mt-1 text-xs font-semibold", scoreText)}>{scoreLabel}</span>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4 pt-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
          <span>Academic Year <span className="tabular-nums">{report.exam?.academicYear || "—"}</span></span>
          <span aria-hidden="true" className="h-3 w-px bg-edge/20" />
          <span className="tabular-nums">{Math.round(report.percentage || 0)}% overall</span>
        </div>
        <p className="text-xs text-ink-muted" dir="auto">{report.language === "ar" ? "النسخة المنشورة" : report.language === "ur" ? "شائع شدہ نسخہ" : "Published version"} <bdi className="font-semibold text-ink">v{report.version}</bdi></p>
        {report.correctionReason && <Alert tone="info" compact live="off" dir="auto">{report.language === "ar" ? "تصحيح:" : report.language === "ur" ? "تصحیح:" : "Correction:"} {report.correctionReason}</Alert>}
        {report.remarksEn ? (
          <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-3">
            <p className="sk-eyebrow mb-1">
              Teacher Remarks
            </p>
            <p className="text-sm leading-relaxed text-ink">{report.remarksEn}</p>
          </div>
        ) : (
          <p className="text-xs text-ink-subtle">No remarks provided.</p>
        )}
      </div>
    </article>
  );
}

