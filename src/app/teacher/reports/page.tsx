"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BrainCircuit, FileText, Loader2 } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { BrandButton } from "@/components/role-dashboard";
import { Select } from "@/components/ui/select";
import {
  classLabel, EmptyInline, MiniMetric, ReportCardDetailModal, ReportsSkeleton, StatusPill, TeacherErrorState, useTeacherData,
} from "@/components/teacher/teacher-components";
import { useAcademicYear } from "@/components/academic-year/CycleGate";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const { data, loading, error, loadData } = useTeacherData();
  const academicYear = useAcademicYear();
  const router = useRouter();
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
          const rcRes = await fetch(`/api/reports/generate-from-grades?studentId=${studentId}&classId=${classId}&academicYear=${academicYear}`);
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
  }, [searchParams, data, academicYear]);

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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to generate remarks"));
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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to generate remarks"));
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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to send"));
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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Could not save remarks"));
      toast.success("Remarks saved");
      setSelectedReportCard((prev: any) => ({ ...prev, ...result.reportCard }));
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setSavingRemarks(false); }
  }, [selectedReportCard, loadData]);

  if (loading && !data) return <ReportsSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={loadData} />;

  return (
    <TeacherPage
      icon={FileText}
      eyebrow="Report Cards"
      title="Report Cards & Remarks"
      summary={`${data.recentReportCards?.length || 0} recent · generate report cards, draft remarks and send results to guardians`}
    >
      <div className="space-y-3">

        {/* Controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Locked Exam</label>
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
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-3">Locked Exams</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(data.lockedExams || []).slice(0, 6).map((exam: any, index: number) => {
              const rcCount = exam.reportCards || 0;
              return (
                <div key={exam.id} className="sk-rise group relative rounded-2xl bg-white border border-[#cfc2d6]/25 p-4 transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:-translate-y-0.5 overflow-hidden shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: `${index * 80}ms` }} title={`${exam.title} — ${rcCount} report card${rcCount !== 1 ? "s" : ""}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-rose-600 opacity-[0] group-hover:opacity-[0.04] transition-opacity duration-300" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors truncate">{exam.title}</p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">{classLabel(exam.class)}</p>
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
              <div className="col-span-full rounded-2xl border border-[#cfc2d6]/25 bg-white p-8 text-center shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
                  <FileText className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-base font-bold text-[#1d1b20]">No locked exams yet</h3>
                {/* Teachers cannot lock an exam themselves — only a principal or
                    campus admin can — so saying "locked exams will appear here"
                    left them with no idea what to actually do next. */}
                <p className="mx-auto mt-1.5 max-w-md text-sm font-semibold leading-relaxed text-ink-muted">
                  Finish entering marks for an assessment, then your principal or campus admin locks
                  it. Once locked it appears here, ready for remarks and report cards.
                </p>
                <button type="button" onClick={() => router.push("/teacher/marks")}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#fbf0fe] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#f3eeff] cursor-pointer active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                  Go to Marks &amp; Tests
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Report cards list */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-3">Recent Report Cards</p>
          <div className="space-y-2">
            {(data.recentReportCards || []).slice(0, 12).map((report: any, index: number) => (
              <button key={report.id} type="button" onClick={() => openReportCard(report)} title={`${report.student?.fullName || "Student"} — ${Math.round(report.percentage || 0)}%`}
                className={cn(
                  "sk-rise group relative w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white p-4 text-left transition-all duration-300 overflow-hidden active:scale-[0.99] shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]",
                  "hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25",
                  "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                )}
                style={{ animationDelay: `${index * 60}ms` }}>
                <div className="absolute inset-0 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] opacity-[0] group-hover:opacity-[0.04] transition-opacity duration-300" />
                <div className="min-w-0 relative">
                  <p className="text-sm font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors">{report.student?.fullName || "Student"}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">{report.exam?.title || "Report"} &mdash; {classLabel(report.student?.class)}</p>
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
    </TeacherPage>
  );
}
