"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BrainCircuit, FileText, Loader2 } from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";
import { Select } from "@/components/ui/select";
import {
  classLabel, EmptyInline, MiniMetric, ReportCardDetailModal, ReportsSkeleton, StatusPill, useTeacherData,
} from "@/components/teacher/teacher-components";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const { data, loading, loadData } = useTeacherData();
  const searchParams = useSearchParams();
  const [selectedReportExamId, setSelectedReportExamId] = useState("");
  const [remarkBusy, setRemarkBusy] = useState(false);
  const [selectedReportCard, setSelectedReportCard] = useState<any>(null);
  const [sendingReport, setSendingReport] = useState<string | null>(null);
  const [remarkGeneratingFor, setRemarkGeneratingFor] = useState<string | null>(null);
  const [savingRemarks, setSavingRemarks] = useState(false);

  const classHubs = data?.classHubs || [];

  useEffect(() => {
    const studentId = searchParams.get("studentId");
    const classId = searchParams.get("classId");
    if (studentId && classId && data) {
      (async () => {
        try {
          const rcRes = await fetch(`/api/reports/generate-from-grades?studentId=${studentId}&classId=${classId}&academicYear=${new Date().getFullYear()}`);
          const rcBody = await rcRes.text();
          const rcResult = JSON.parse(rcBody);
          const reportCard = rcResult.reportCard || null;
          if (reportCard) {
            setSelectedReportCard({
              ...reportCard,
              student: { ...reportCard.student, class: reportCard.student?.class || {} },
              subjectBreakdown: reportCard.subjectBreakdown || [],
            });
          } else {
            toast.error("Report card not found. Generate it from Final Grades first.");
          }
        } catch { toast.error("Failed to load report card"); }
      })();
    }
  }, [searchParams, data]);

  useEffect(() => {
    if (!data) return;
    if (!selectedReportExamId && data.lockedExams?.[0]?.id) setSelectedReportExamId(data.lockedExams[0].id);
  }, [data, selectedReportExamId]);

  const handleGenerateRemarks = useCallback(async () => {
    if (!selectedReportExamId) return;
    setRemarkBusy(true);
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedReportExamId }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "Failed to generate remarks");
      toast.success("Remarks drafted for all students");
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setRemarkBusy(false); }
  }, [selectedReportExamId, loadData]);

  const handleGenerateStudentRemarks = useCallback(async (studentId: string, examId: string) => {
    setRemarkGeneratingFor(studentId);
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, studentId }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "Failed to generate remarks");
      toast.success("Remarks generated");
      setSelectedReportCard(null);
    } catch (error: any) { toast.error(error.message); }
    finally { setRemarkGeneratingFor(null); }
  }, []);

  const sendReportCard = useCallback(async (reportId: string) => {
    setSendingReport(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/send`, { method: "POST" });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "Failed to send");
      toast.success("Report card sent");
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setSendingReport(null); }
  }, [loadData]);

  const openReportCard = useCallback(async (report: any) => {
    setSelectedReportCard(report);
  }, []);

  const saveRemarks = useCallback(async (remarks: { en: string; ur: string }) => {
    if (!selectedReportCard) return;
    setSavingRemarks(true);
    try {
      const res = await fetch(`/api/reports/${selectedReportCard.id}/remarks`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarksEn: remarks.en || null, remarksUr: remarks.ur || null }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "Could not save remarks");
      toast.success("Remarks saved");
      setSelectedReportCard((prev: any) => ({ ...prev, ...result.reportCard }));
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setSavingRemarks(false); }
  }, [selectedReportCard, loadData]);

  if (loading && !data) return <ReportsSkeleton />;
  if (!data) return null;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <header className="relative overflow-hidden p-7 px-9 border-b border-[#cfc2d6]/12 bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">{data.recentReportCards?.length || 0} recent report cards</span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Report Cards & Remarks</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">Generate report cards, draft remarks, and send results to guardians.</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20 space-y-6">

        {/* Controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">Locked Exam</label>
              <Select value={selectedReportExamId} onChange={(e) => setSelectedReportExamId(e.target.value)} className="min-w-[280px]">
                {(data.lockedExams || []).map((exam: any) => (
                  <option key={exam.id} value={exam.id}>{exam.title} &mdash; {classLabel(exam.class)}</option>
                ))}
                {!data.lockedExams?.length ? <option value="">No locked exams</option> : null}
              </Select>
            </div>
            <BrandButton variant="soft" icon={remarkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
              onClick={handleGenerateRemarks} disabled={remarkBusy || !selectedReportExamId}
              title={!selectedReportExamId ? "Select a locked exam first" : "Draft AI-powered remarks for all students"}>
              {remarkBusy ? "Drafting..." : "Draft Remarks"}
            </BrandButton>
          </div>
        </div>

        {/* Locked exam cards */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50 mb-3">Locked Exams</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(data.lockedExams || []).slice(0, 6).map((exam: any) => {
              const rcCount = exam.reportCards || 0;
              return (
                <div key={exam.id} className="group relative rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden" title={`${exam.title} — ${rcCount} report card${rcCount !== 1 ? "s" : ""}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-rose-600 opacity-[0] group-hover:opacity-[0.04] transition-opacity duration-300" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors truncate">{exam.title}</p>
                      <p className="mt-0.5 text-[11px] text-[#4d4354]/50">{classLabel(exam.class)}</p>
                    </div>
                    <StatusPill status={exam.status} />
                  </div>
                  <div className="relative mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#fbf0fe] px-2.5 py-1 text-[11px] font-semibold text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white transition-all">
                      <FileText className="w-3 h-3" />{rcCount} card{rcCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              );
            })}
            {!data.lockedExams?.length && (
              <div className="col-span-full">
                <EmptyInline text="Locked exams will appear here for remarks and report-card work." />
              </div>
            )}
          </div>
        </div>

        {/* Report cards list */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50 mb-3">Recent Report Cards</p>
          <div className="space-y-2">
            {(data.recentReportCards || []).slice(0, 12).map((report: any) => (
              <button key={report.id} type="button" onClick={() => openReportCard(report)} title={`${report.student?.fullName || "Student"} — ${Math.round(report.percentage || 0)}%`}
                className={cn(
                  "group relative w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/10 bg-white p-4 text-left transition-all duration-300 overflow-hidden active:scale-[0.99]",
                  "hover:border-[#8127cf]/25 hover:shadow-xl hover:-translate-y-0.5",
                  "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                )}>
                <div className="absolute inset-0 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] opacity-[0] group-hover:opacity-[0.04] transition-opacity duration-300" />
                <div className="min-w-0 relative">
                  <p className="text-sm font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors">{report.student?.fullName || "Student"}</p>
                  <p className="text-[11px] text-[#4d4354]/50 mt-0.5">{report.exam?.title || "Report"} &mdash; {classLabel(report.student?.class)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 relative">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[#fbf0fe] px-2.5 py-1 text-[12px] font-bold text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white transition-all">
                    {Math.round(report.percentage || 0)}%
                  </span>
                  <StatusPill status={report.status} />
                </div>
              </button>
            ))}
            {!data.recentReportCards?.length && (
              <EmptyInline text="Report cards will appear after exams are processed." />
            )}
          </div>
        </div>
      </div>

      {selectedReportCard ? (
        <ReportCardDetailModal report={selectedReportCard} busy={sendingReport === selectedReportCard.id} remarkBusy={remarkGeneratingFor}
          savingRemarks={savingRemarks}
          onClose={() => setSelectedReportCard(null)}
          onSend={() => sendReportCard(selectedReportCard.id)}
          onSaveRemarks={saveRemarks}
          onGenerateRemarks={(studentId, examId) => handleGenerateStudentRemarks(studentId, examId)}
        />
      ) : null}
    </section>
  );
}
