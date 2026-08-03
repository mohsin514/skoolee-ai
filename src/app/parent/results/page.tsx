"use client";

import { useState } from "react";
import { Award, ChevronDown, ChevronUp, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ParentListSkeleton, ParentEmptyState } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";
import { downloadPdfFile } from "@/lib/download";

export const dynamic = "force-dynamic";

export default function ParentResultsPage() {
  const { data, loading } = useParentData();
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

  if (loading || !data) return <ParentListSkeleton />;
  const { reportCards, marksByExam } = data;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {reportCards.length ? `${reportCards.length} report card${reportCards.length > 1 ? "s" : ""} · ${marksByExam.length} exams` : "Academic results"}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Results</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">Report cards and subject-wise marks for your child.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-6">
        {reportCards.length === 0 && marksByExam.length === 0 ? (
          <ParentEmptyState icon={FileText} title="No results yet" description="Results will appear here after exams are published." />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MiniStat icon={FileText} label="Report Cards" value={reportCards.length} />
              <MiniStat icon={Award} label="Best Score" value={reportCards.length ? `${Math.max(...reportCards.map((r: any) => Math.round(r.percentage)))}%` : "N/A"} tone="green" />
              <MiniStat icon={FileText} label="Exams" value={marksByExam.length} />
              <MiniStat icon={FileText} label="Published" value={reportCards.filter((r: any) => r.status === "PUBLISHED" || r.status === "SENT").length} tone="purple" />
            </div>

            <div className="space-y-4">
              {reportCards.map((rc: any) => {
                const pct = Math.round(rc.percentage);
                const scoreColor = pct >= 80 ? "text-emerald-600 bg-emerald-50" : pct >= 60 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50";
                return (
                  <div key={rc.id} className="group relative rounded-[24px] bg-white border border-[#cfc2d6]/10 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:border-[#8127cf]/20">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase">{rc.term} {rc.academicYear}</p>
                        <h3 className="text-base font-bold text-[#1d1b20] mt-0.5 transition-colors group-hover:text-[#8127cf]">{rc.examTitle}</h3>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${scoreColor}`}>{pct}%</span>
                          <span className="text-[10px] font-bold text-[#4d4354]/40">Grade: {rc.grade || "N/A"}</span>
                          {rc.rank && <span className="text-[10px] font-bold text-[#4d4354]/40">Rank: #{rc.rank}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-black text-[#8127cf]">{rc.obtainedMarks}<span className="text-sm font-bold text-[#4d4354]/30">/{rc.totalMarks}</span></p>
                      </div>
                    </div>

                    {rc.remarksEn && (
                      <div className="mt-3 p-3 rounded-xl bg-[#fbf0fe]/30 border border-[#cfc2d6]/5">
                        <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase mb-1">Teacher Remarks</p>
                        <p className="text-xs text-[#4d4354]/70 leading-relaxed">{rc.remarksEn}</p>
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
                <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight mb-4">Subject-wise Marks</h3>
                <div className="space-y-3">
                  {marksByExam.map((exam: any) => {
                    const isExpanded = expandedExam === exam.examId;
                    return (
                      <div key={exam.examId} className="rounded-[24px] bg-white border border-[#cfc2d6]/10 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg">
                        <button
                          type="button"
                          onClick={() => setExpandedExam(isExpanded ? null : exam.examId)}
                          className="w-full flex items-center justify-between p-5 hover:bg-[#fbf0fe]/20 transition-colors cursor-pointer"
                        >
                          <div className="text-left">
                            <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase">{exam.term}</p>
                            <h3 className="text-sm font-bold text-[#1d1b20]">{exam.examTitle}</h3>
                            <p className="text-[10px] font-semibold text-[#4d4354]/40 mt-0.5">{exam.marks.length} subjects</p>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-[#4d4354]/40" /> : <ChevronDown className="w-4 h-4 text-[#4d4354]/40" />}
                        </button>
                        {isExpanded && (
                          <div className="border-t border-[#f3f4f9] px-5 pb-4">
                            <div className="grid grid-cols-[1fr_80px_60px] gap-2 py-2 text-[9px] font-black uppercase text-[#4d4354]/40">
                              <span>Subject</span>
                              <span className="text-right">Marks</span>
                              <span className="text-right">Grade</span>
                            </div>
                            {exam.marks.map((m: any) => (
                              <div key={m.subject} className="grid grid-cols-[1fr_80px_60px] gap-2 py-2 border-t border-[#f3f4f9]/50">
                                <span className="text-xs font-semibold text-[#1d1b20]">{m.subject}</span>
                                <span className="text-xs font-bold text-[#4d4354]/60 text-right">{m.obtained}/{m.total}</span>
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
    </section>
  );
}

function MiniStat({ icon: Icon, label, value, tone = "dark" }: { icon: any; label: string; value: string | number; tone?: string }) {
  const tones: Record<string, string> = {
    dark: "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
    green: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
    purple: "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
    rose: "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white",
  };
  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider transition-colors group-hover:text-[#4d4354]/60">{label}</p>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${tones[tone] || tones.dark}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
      <p className="text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
    </div>
  );
}
