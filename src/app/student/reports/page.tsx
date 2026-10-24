"use client";

import { useMemo, useState } from "react";
import { Award, CheckCircle2, Download, FileText, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { downloadReportCardPdf } from "@/lib/download";
import { StatCard } from "@/components/student/student-ui";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StudentPage } from "@/components/student/student-page";
import { ReportsSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";

/** A card the school has released: published, sent, or re-released after a correction (`familyVersion()` "CORRECTED"). */
const isReleased = (status: string | null | undefined) => status === "PUBLISHED" || status === "SENT" || status === "CORRECTED";

/**
 * Results (learner): every released report card — the list is not capped — each with its own
 * Download (M100). The old header button only ever fetched the latest card.
 */
export default function ReportsPage() {
  const ui = useUiText();
  const { data, loading, error, refetch } = useStudentData();

  const summary = useMemo(() => {
    if (!data?.user?.reportCards?.length) return { total: 0, best: 0, average: 0, published: 0, draft: 0 };
    const cards = data.user.reportCards;
    const pcts = cards.map((r: any) => Math.round(r.percentage || 0));
    return {
      total: cards.length,
      best: Math.max(...pcts, 0),
      average: Math.round(pcts.reduce((a: number, b: number) => a + b, 0) / pcts.length),
      published: cards.filter((r: any) => isReleased(r.status)).length,
      draft: cards.filter((r: any) => r.status === "DRAFT" || !r.status).length,
    };
  }, [data]);

  if (loading && !data) return <ReportsSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data || !data.user) return null;

  const user = data.user;

  return (
    <StudentPage
      icon={FileText}
      title="Results"
      description={summary.total
        ? ui("{0} report cards · {1} published. Download any card.", [summary.total, summary.published])
        : ui("Your report cards appear here once they are published.")}
    >
      <div className="space-y-3">
        {user.reportCards.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard icon={FileText} label={ui("Report cards")} value={summary.total} sub={ui("Issued")} delay={40} />
              <StatCard icon={GraduationCap} label={ui("Best score")} value={`${summary.best}%`} sub={summary.best >= 80 ? ui("Excellent") : summary.best >= 60 ? ui("Good") : ui("Needs focus")} tone="green" ring={summary.best} delay={80} />
              <StatCard icon={Award} label={ui("Average")} value={`${summary.average}%`} sub={ui("Across {0} cards", [summary.total])} tone="purple" ring={summary.average} delay={120} />
              <StatCard icon={CheckCircle2} label={ui("Published")} value={summary.published} sub={summary.draft ? ui("{0} still in draft", [summary.draft]) : ui("All released")} tone={summary.draft ? "amber" : "green"} delay={160} />
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
            title={ui("No report cards yet")}
            description={ui("Report cards appear here once your school publishes them.")}
          />
        )}
      </div>
    </StudentPage>
  );
}


function ReportCard({ report, index }: { report: any; index: number }) {
  const ui = useUiText();
  const [downloading, setDownloading] = useState(false);
  const pct = Math.round(report.percentage || 0);
  const download = async () => {
    setDownloading(true);
    try {
      await downloadReportCardPdf(report.id, `${(report.exam?.title || "report-card").replace(/[^a-z0-9]+/gi, "-")}.pdf`);
    } catch {
      toast.error(ui("Could not download this report card. Please try again."));
    } finally {
      setDownloading(false);
    }
  };
  const status = (report.status || "Draft") as string;
  const released = isReleased(status);

  const scoreColor = pct >= 80 ? "bg-status-success-text" : pct >= 60 ? "bg-status-warning-text" : "bg-status-error-text";
  const scoreText = pct >= 80 ? "text-status-success-text" : pct >= 60 ? "text-status-warning-text" : "text-status-error-text";
  const scoreLabel = pct >= 80 ? ui("Excellent") : pct >= 60 ? ui("Good") : ui("Needs improvement");

  return (
    <article className="sk-panel sk-rise relative min-w-0 overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-md" style={{ animationDelay: `${200 + index * 60}ms` }}>
      <div className="relative overflow-hidden border-b border-border-subtle bg-surface-subtle p-4 pb-3">
        <div aria-hidden="true" className="pointer-events-none absolute -end-12 -top-24 size-48 rounded-full bg-gradient-to-bl from-primary/5 to-transparent blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="sk-eyebrow mb-1 truncate">
              {report.exam?.term || ui("Exam")}
            </p>
            <h2 className="break-words text-lg font-bold tracking-tight text-ink-strong">
              <bdi>{report.exam?.title || ui("Report card")}</bdi>
            </h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" size="sm">
                <Award aria-hidden="true" />
                {report.grade || ui("Pending")}
              </Badge>
              <Badge variant={released ? "success" : "warning"} size="sm" dot>
                {released ? ui("Published") : status === "DRAFT" || status === "Draft" ? ui("Draft") : ui("In review")}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <div className={cn(
              "flex size-16 items-center justify-center rounded-full shadow-md",
              scoreColor
            )}>
              <bdi className="text-xl font-bold tabular-nums text-primary-foreground">{pct}</bdi>
            </div>
            <span className={cn("mt-1 text-xs font-semibold", scoreText)}>{scoreLabel}</span>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4 pt-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
          <span>{ui("Academic year")} <bdi className="tabular-nums">{report.exam?.academicYear || "—"}</bdi></span>
          <span aria-hidden="true" className="h-3 w-px bg-edge/20" />
          <span className="tabular-nums">{ui("{0}% overall", [Math.round(report.percentage || 0)])}</span>
        </div>
        <p className="text-xs text-ink-muted" dir="auto">{report.language === "ar" ? "النسخة المنشورة" : report.language === "ur" ? "شائع شدہ نسخہ" : "Published version"} <bdi className="font-semibold text-ink">v{report.version}</bdi></p>
        {report.correctionReason && <Alert tone="info" compact live="off" dir="auto">{report.language === "ar" ? "تصحيح:" : report.language === "ur" ? "تصحیح:" : "Correction:"} {report.correctionReason}</Alert>}
        {report.remarksEn ? (
          <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-3">
            <p className="sk-eyebrow mb-1">
              {ui("Teacher remarks")}
            </p>
            <p className="text-sm leading-relaxed text-ink" dir="auto">{report.remarksEn}</p>
          </div>
        ) : (
          <p className="text-xs text-ink-subtle">{ui("No remarks provided.")}</p>
        )}
        {released ? (
          <Button variant="outline" size="sm" type="button" loading={downloading} onClick={() => void download()} data-report-download={report.id}>
            {downloading ? null : <Download aria-hidden="true" />}
            {ui("Download")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

