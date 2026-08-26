"use client";

import { useState } from "react";
import { Award, ChevronDown, ChevronUp, Download, FileText, Loader2 } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { toast } from "sonner";
import { ParentErrorState, ParentListSkeleton, ParentEmptyState, ParentStat } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";
import { downloadPdfFile } from "@/lib/download";

export const dynamic = "force-dynamic";

export default function ParentResultsPage() {
  const { data, loading, error, refetch } = useParentData();
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadPdf = async (rc: any) => {
    if (!rc.pdfUrl) return;
    setDownloadingId(rc.id);
    try {
      await downloadPdfFile(rc.pdfUrl, `report-card-${rc.examTitle.replace(/[^a-z0-9]+/gi, "-") || "report-card"}.pdf`);
    } catch {
      toast.error("Failed to download report card");
    } finally {
      setDownloadingId(null);
    }
  };

  // Without this an expired session leaves the page on a skeleton
  // forever, because `data` never arrives and `loading` is already false.
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (loading || !data) return <ParentListSkeleton />;
  const { reportCards, marksByExam } = data;

  return (
    <ParentPage
      tone="reports"
      icon={FileText}
      eyebrow={<>{reportCards.length ? `${reportCards.length} report card${reportCards.length > 1 ? "s" : ""} · ${marksByExam.length} exams` : "Academic results"}</>}
      title="Results"
      summary={<>"Report cards and subject-wise marks for your child."</>}
    >
      <div className="space-y-3">
        {reportCards.length === 0 && marksByExam.length === 0 ? (
          <ParentEmptyState icon={FileText} title="No results yet" description="Results will appear here after exams are published." />
        ) : (
          <>
            <div className="sk-rise grid grid-cols-2 md:grid-cols-4 gap-4" style={{ animationDelay: "40ms" }}>
              <ParentStat icon={FileText} label="Report Cards" value={reportCards.length} />
              <ParentStat icon={Award} label="Best Score" value={reportCards.length ? `${Math.max(...reportCards.map((r: any) => Math.round(r.percentage)))}%` : "N/A"} tone="green" />
              <ParentStat icon={FileText} label="Exams" value={marksByExam.length} />
              <ParentStat icon={FileText} label="Published" value={reportCards.filter((r: any) => r.status === "PUBLISHED" || r.status === "SENT").length} tone="violet" />
            </div>

            <div className="space-y-4">
              {reportCards.map((rc: any, index: number) => {
                const pct = Math.round(rc.percentage);
                const scoreColor = pct >= 80 ? "text-emerald-600 bg-emerald-50" : pct >= 60 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50";
                return (
                  <div key={rc.id} className="sk-rise group relative rounded-[24px] bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25" style={{ animationDelay: `${index * 80}ms` }}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-ink-subtle uppercase">{rc.term} {rc.academicYear}</p>
                        <h3 className="text-base font-bold text-[#1d1b20] mt-0.5 transition-colors group-hover:text-[#8127cf]">{rc.examTitle}</h3>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${scoreColor}`}>{pct}%</span>
                          <span className="text-[10px] font-bold text-ink-subtle">Grade: {rc.grade || "N/A"}</span>
                          {rc.rank && <span className="text-[10px] font-bold text-ink-subtle">Rank: #{rc.rank}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-black text-[#8127cf]">{rc.obtainedMarks}<span className="text-sm font-bold text-ink-subtle">/{rc.totalMarks}</span></p>
                      </div>
                    </div>

                    {rc.remarksEn && (
                      <div className="mt-3 p-3 rounded-xl bg-[#fbf0fe]/30 border border-[#cfc2d6]/5">
                        <p className="text-[10px] font-bold text-ink-subtle uppercase mb-1">Teacher Remarks</p>
                        <p className="text-xs text-ink leading-relaxed">{rc.remarksEn}</p>
                      </div>
                    )}

                    {rc.pdfUrl && (
                      <button
                        onClick={() => handleDownloadPdf(rc)}
                        disabled={downloadingId === rc.id}
                        className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-[#8127cf] hover:text-[#6a1fb0] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {downloadingId === rc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        {downloadingId === rc.id ? "Downloading..." : "Download PDF"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {marksByExam.length > 0 && (
              <div>
                <h3 className="text-sm font-black tracking-tight text-[#1d1b20] mb-4">Subject-wise Marks</h3>
                <div className="space-y-3">
                  {marksByExam.map((exam: any, index: number) => {
                    const isExpanded = expandedExam === exam.examId;
                    return (
                      <div key={exam.examId} className="sk-rise rounded-[24px] bg-white border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] overflow-hidden transition-all duration-200 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: `${(index + 1) * 80}ms` }}>
                        <button
                          type="button"
                          onClick={() => setExpandedExam(isExpanded ? null : exam.examId)}
                          className="w-full flex items-center justify-between p-5 hover:bg-[#fbf0fe]/20 transition-colors cursor-pointer"
                        >
                          <div className="text-left">
                            <p className="text-[10px] font-bold text-ink-subtle uppercase">{exam.term}</p>
                            <h3 className="text-sm font-bold text-[#1d1b20]">{exam.examTitle}</h3>
                            <p className="text-[10px] font-semibold text-ink-subtle mt-0.5">{exam.marks.length} subjects</p>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-ink-subtle" /> : <ChevronDown className="w-4 h-4 text-ink-subtle" />}
                        </button>
                        {isExpanded && (
                          <div className="border-t border-[#f3f4f9] px-5 pb-4">
                            <div className="grid grid-cols-[1fr_80px_60px] gap-2 py-2 text-[9px] font-black uppercase text-ink-subtle">
                              <span>Subject</span>
                              <span className="text-right">Marks</span>
                              <span className="text-right">Grade</span>
                            </div>
                            {exam.marks.map((m: any) => (
                              <div key={m.subject} className="grid grid-cols-[1fr_80px_60px] gap-2 py-2 border-t border-[#f3f4f9]/50">
                                <span className="text-xs font-semibold text-[#1d1b20]">{m.subject}</span>
                                <span className="text-xs font-bold text-ink-muted text-right">{m.obtained}/{m.total}</span>
                                <span className="text-xs font-black text-[#8127cf] text-right">{m.grade || "-"}</span>
                              </div>
                            ))}
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
      </div>
    </ParentPage>
  );
}

