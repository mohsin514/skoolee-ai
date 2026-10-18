"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Award, BookOpen, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Download, FileText } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { FamilyPortfolio } from "@/components/portfolio/portfolio";
import { toast } from "@/components/ui/toast";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ParentErrorState, ParentListSkeleton, ParentEmptyState, ParentStat } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";
import { downloadPdfFile } from "@/lib/download";

export const dynamic = "force-dynamic";

// The report card's own language decides these labels, not the reader's, so
// they sit beside the authored text they introduce.
const REPORT_COPY = {
  published: { en: "Published version", ar: "النسخة المنشورة", ur: "شائع شدہ نسخہ" },
  correction: { en: "Correction", ar: "تصحيح", ur: "تصحیح" },
} as const;

function reportCopy(key: keyof typeof REPORT_COPY, language: unknown) {
  return language === "ar" ? REPORT_COPY[key].ar : language === "ur" ? REPORT_COPY[key].ur : REPORT_COPY[key].en;
}

function scoreVariant(pct: number) {
  return pct >= 80 ? "success" : pct >= 60 ? "warning" : "danger";
}

export default function ParentResultsPage() {
  const { data, loading, error, refetch, token, selectedStudentId } = useParentData();
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadPdf = async (rc: any) => {
    if (!rc.pdfUrl) return;
    setDownloadingId(rc.id);
    try {
      await downloadPdfFile(rc.pdfUrl, `report-card-${rc.examTitle.replace(/[^a-z0-9]+/gi, "-") || "report-card"}.pdf`);
    } catch {
      toast.error("Could not download this report card. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  // Without this an expired session leaves the page on a skeleton
  // forever, because `data` never arrives and `loading` is already false.
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (loading || !data) return <ParentListSkeleton />;
  const { reportCards, marksByExam } = data;
  const publishedCount = reportCards.filter((r: any) => r.status === "PUBLISHED" || r.status === "SENT" || r.status === "CORRECTED").length;

  return (
    <ParentPage
      tone="reports"
      icon={FileText}
      eyebrow={<>{reportCards.length ? `${reportCards.length} report card${reportCards.length > 1 ? "s" : ""} · ${marksByExam.length} exams` : "Academic results"}</>}
      title="Results"
      summary="Report cards and subject-wise marks for your child."
    >
      <div className="space-y-3">
        {reportCards.length === 0 && marksByExam.length === 0 ? (
          <ParentEmptyState icon={FileText} title="No results yet" description="Results will appear here after exams are published." />
        ) : (
          <>
            <div className="sk-rise grid grid-cols-2 gap-3 md:grid-cols-4" style={{ animationDelay: "40ms" }}>
              <ParentStat icon={FileText} label="Report Cards" value={reportCards.length} sub="Issued to date" />
              <ParentStat icon={Award} label="Best Score" value={reportCards.length ? `${Math.max(...reportCards.map((r: any) => Math.round(r.percentage)))}%` : "N/A"} sub="Highest result" tone="green" />
              <ParentStat icon={ClipboardList} label="Exams" value={marksByExam.length} sub="Marked so far" tone="amber" />
              <ParentStat icon={CheckCircle2} label="Published" value={publishedCount} sub={reportCards.length - publishedCount ? `${reportCards.length - publishedCount} pending release` : "All released"} tone="violet" />
            </div>

            <div className="sk-stagger space-y-3">
              {reportCards.map((rc: any) => {
                const pct = Math.round(rc.percentage);
                const downloading = downloadingId === rc.id;
                const remarks = rc.language === "ar" ? rc.remarksAr : rc.language === "ur" ? rc.remarksUr : rc.remarksEn;
                return (
                  <div key={rc.id} className="sk-panel relative min-w-0 p-4 transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-md">
                    <div className="flex min-w-0 items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="sk-eyebrow [overflow-wrap:anywhere]">{rc.term} {rc.academicYear}</p>
                        <h3 className="mt-0.5 text-base font-bold text-ink-strong [overflow-wrap:anywhere]">{rc.examTitle}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <Badge variant={scoreVariant(pct)} size="sm" data-numeric className="tabular-nums">{pct}%</Badge>
                          <span className="text-xs font-medium text-ink-muted">Grade: {rc.grade || "N/A"}</span>
                          {rc.rank && <span className="text-xs font-medium tabular-nums text-ink-muted">Rank: #{rc.rank}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-end">
                        <p className="text-2xl font-bold tabular-nums text-primary">{rc.obtainedMarks}<span className="text-sm font-semibold text-ink-subtle">/{rc.totalMarks}</span></p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-ink-subtle" dir="auto">{reportCopy("published", rc.language)} <bdi>v{rc.version}</bdi></p>
                    {rc.correctionReason && (
                      <Alert tone="info" live="off" compact className="mt-2" dir="auto" title={reportCopy("correction", rc.language)}>
                        {rc.correctionReason}
                      </Alert>
                    )}
                    {(rc.remarksEn || rc.remarksAr || rc.remarksUr) && (
                      <div className="mt-3 rounded-xl border border-border-subtle bg-surface-subtle p-3">
                        <p className="sk-eyebrow mb-1">Teacher Remarks</p>
                        <p className="text-sm leading-relaxed text-ink" dir="auto">{remarks}</p>
                      </div>
                    )}

                    {rc.pdfUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPdf(rc)}
                        loading={downloading}
                        className="mt-3"
                      >
                        {downloading ? null : <Download aria-hidden="true" />}
                        Download PDF
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {marksByExam.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2.5">
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <h3 className="text-base font-bold text-ink-strong">Subject-wise Marks</h3>
                </div>
                <div className="sk-stagger space-y-3">
                  {marksByExam.map((exam: any) => {
                    const isExpanded = expandedExam === exam.examId;
                    return (
                      <div key={exam.examId} className="sk-panel overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-md">
                        <h4>
                          <Button variant="ghost"
                            type="button"
                            onClick={() => setExpandedExam(isExpanded ? null : exam.examId)}
                            aria-expanded={isExpanded}
                            aria-controls={`exam-marks-${exam.examId}`}
                            className="flex h-auto w-full items-center justify-between gap-3 rounded-none p-4 text-start"
                          >
                            <span className="block min-w-0">
                              <span className="sk-eyebrow block [overflow-wrap:anywhere]">{exam.term}</span>
                              <span className="block text-sm font-bold text-ink-strong [overflow-wrap:anywhere]">{exam.examTitle}</span>
                              <span className="mt-0.5 block text-xs font-medium text-ink-subtle">{exam.marks.length} subjects</span>
                            </span>
                            {isExpanded ? <ChevronUp aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /> : <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-subtle" />}
                          </Button>
                        </h4>
                        {isExpanded && (
                          <div id={`exam-marks-${exam.examId}`} className="border-t border-border-subtle">
                            <Table containerClassName="rounded-none border-0">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Subject</TableHead>
                                  <TableHead className="text-end">Marks</TableHead>
                                  <TableHead className="text-end">Grade</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {exam.marks.map((m: any) => (
                                  <TableRow key={m.subject}>
                                    <TableCell className="py-3 font-medium text-ink-strong [overflow-wrap:anywhere]">{m.subject}</TableCell>
                                    <TableCell className="py-3 text-end font-semibold tabular-nums text-ink-muted">{m.obtained}/{m.total}</TableCell>
                                    <TableCell className="py-3 text-end font-semibold text-primary">{m.grade || "-"}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
        {/* SKO-427: learning-progress collections the school shared with this guardian. */}
        {!token ? <div className="mt-6"><FamilyPortfolio studentId={selectedStudentId ?? null} /></div> : null}
      </div>
    </ParentPage>
  );
}
