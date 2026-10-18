"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InputGroup, FieldAction } from "@/components/ui/input-group";
import { Tooltip } from "@/components/ui/tooltip";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { ArrowRight, BrainCircuit, ChevronDown, FileText, Search, SearchX, X } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { FamilyDigestReview } from "@/components/family/family-digest";
import { Select } from "@/components/ui/select";
import {
  classLabel, ReportCardDetailModal, ReportsSkeleton, StatusPill, TeacherErrorState, useTeacherData,
} from "@/components/teacher/teacher-components";
import { useAcademicYear } from "@/components/academic-year/CycleGate";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Input as SystemInput } from "@/components/ui/input";

/** "PRINCIPAL_REVIEWED" → "Principal reviewed", for filter chips. */
function statusLabel(status: string) {
  const text = status.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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
  const [cardQuery, setCardQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAllCards, setShowAllCards] = useState(false);

  const classHubs = data?.classHubs || [];

  /* The list was a hard `.slice(0, 12)`. A teacher of four classes has well
     over a hundred report cards, and the other ninety-plus were simply
     unreachable from this screen — no search, no paging, no indication they
     existed at all. */
  const allCards: any[] = useMemo(() => data?.recentReportCards || [], [data]);
  const visibleCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    return allCards.filter((report) => {
      if (statusFilter && (report.status || "") !== statusFilter) return false;
      if (!q) return true;
      return `${report.student?.fullName || ""} ${report.student?.rollNo || ""} ${report.exam?.title || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [allCards, cardQuery, statusFilter]);

  const cardStatuses = useMemo(
    () => [...new Set(allCards.map((r) => r.status).filter(Boolean))],
    [allCards],
  );

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
        } catch { toast.error("Could not open this report card. Please try again."); }
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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Could not draft remarks. Please try again."));
      toast.success("Remarks drafted for all students");
      await loadData();
    } catch (error: any) { toast.error(friendlyErrorMessage(error, "Could not draft remarks. Please try again.")); }
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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Could not draft remarks for this student. Please try again."));
      toast.success("Remarks drafted for this student");
      setSelectedReportCard(null);
    } catch (error: any) { toast.error(friendlyErrorMessage(error, "Could not draft remarks for this student. Please try again.")); }
    finally { setRemarkGeneratingFor(null); }
  }, []);

  const sendReportCard = useCallback(async (reportId: string) => {
    setSendingReport(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/send`, { method: "POST" });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Could not send this report card. Please try again."));
      if (result.jobId) { router.push(`/jobs?id=${result.jobId}`); return; }
      await loadData();
    } catch (error: any) { toast.error(friendlyErrorMessage(error, "Could not send this report card. Please try again.")); }
    finally { setSendingReport(null); }
  }, [loadData, router]);

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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Could not save remarks. Please try again."));
      toast.success("Remarks saved");
      setSelectedReportCard((prev: any) => ({ ...prev, ...result.reportCard }));
      await loadData();
    } catch (error: any) { toast.error(friendlyErrorMessage(error, "Could not save remarks. Please try again.")); }
    finally { setSavingRemarks(false); }
  }, [selectedReportCard, loadData]);

  if (loading && !data) return <ReportsSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={loadData} />;

  const draftRemarksButton = (
    <Button variant="secondary" type="button" onClick={handleGenerateRemarks}
      loading={remarkBusy} disabled={!selectedReportExamId} className="w-full sm:w-auto">
      {remarkBusy ? null : <BrainCircuit aria-hidden="true" />}
      Draft remarks
    </Button>
  );

  return (
    <TeacherPage
      tone="reports"
      icon={FileText}
      eyebrow="Report Cards"
      title="Report Cards & Remarks"
      summary={`${data.recentReportCards?.length || 0} recent · generate report cards, draft remarks and send results to guardians`}
    >
      <div className="space-y-3">

        {/* Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <FormField
            name="reportExam"
            label="Locked exam"
            description="Only exams your principal or campus admin has locked are listed."
            className="w-full min-w-0 sm:w-auto"
          >
            <Select value={selectedReportExamId} onChange={(e) => setSelectedReportExamId(e.target.value)} className="w-full sm:min-w-[280px]">
              {(data.lockedExams || []).map((exam: any) => (
                <option key={exam.id} value={exam.id}>{exam.title} &mdash; {classLabel(exam.class)}</option>
              ))}
              {!data.lockedExams?.length ? <option value="">No locked exams</option> : null}
            </Select>
          </FormField>
          {selectedReportExamId ? (
            <Tooltip content="Drafts a remark for every student in this exam. You can edit each one on the report card.">
              {draftRemarksButton}
            </Tooltip>
          ) : (
            /* A disabled button cannot show a tooltip of its own, so the reason
               sits on a focusable wrapper instead. */
            <Tooltip content="Pick a locked exam first">
              <span tabIndex={0} className="inline-flex w-full sm:w-auto">{draftRemarksButton}</span>
            </Tooltip>
          )}
        </div>

        {/* Locked exam cards */}
        <section aria-labelledby="locked-exams-heading">
          <h2 id="locked-exams-heading" className="mb-3 text-base font-bold text-ink-strong">Locked exams</h2>
          <div className="sk-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(data.lockedExams || []).slice(0, 6).map((exam: any) => {
              const rcCount = exam.reportCards || 0;
              return (
                <div key={exam.id} className="sk-panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-strong">{exam.title}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-subtle">{classLabel(exam.class)}</p>
                    </div>
                    <StatusPill status={exam.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="secondary">
                      <FileText aria-hidden="true" />
                      <span data-numeric className="tabular-nums">{rcCount}</span> report card{rcCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>
              );
            })}
            {!data.lockedExams?.length && (
              /* Teachers cannot lock an exam themselves — only a principal or
                 campus admin can — so saying "locked exams will appear here"
                 left them with no idea what to actually do next. */
              <div className="sk-panel col-span-full">
                <EmptyState
                  icon={FileText}
                  title="No locked exams yet"
                  description="Finish entering marks for an assessment, then your principal or campus admin locks it. Once locked it appears here, ready for remarks and report cards."
                  action={
                    <Button variant="secondary" type="button" onClick={() => router.push("/teacher/marks")} className="sk-nudge-trigger">
                      Go to Marks &amp; Tests
                      <ArrowRight aria-hidden="true" className="sk-nudge rtl:rotate-180" />
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        </section>

        {/* Report cards list */}
        <section aria-labelledby="report-cards-heading">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="report-cards-heading" className="flex items-center gap-2 text-base font-bold text-ink-strong">
              Report cards
              <Badge variant="secondary" size="sm" aria-live="polite">
                <span data-numeric className="tabular-nums">
                  {cardQuery || statusFilter ? `${visibleCards.length} of ${allCards.length}` : allCards.length}
                </span>
              </Badge>
            </h2>
            {allCards.length > 0 ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:ms-auto sm:w-auto">
                <InputGroup surfaceClassName="bg-white" className="w-full sm:w-64">
                  <Search aria-hidden="true" data-field-affix="start" className="pointer-events-none h-4 w-4 text-ink-subtle" />
                  <SystemInput
                    value={cardQuery}
                    onChange={(e) => setCardQuery(e.target.value)}
                    placeholder="Student, roll no or exam…"
                    aria-label="Search report cards"
                    className={"w-full"}
                  />
                  {cardQuery ? (
                    <FieldAction data-field-affix="end" type="button" onClick={() => setCardQuery("")} label="Clear report card search">
                      <X aria-hidden="true" />
                    </FieldAction>
                  ) : null}
                </InputGroup>
                {cardStatuses.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter report cards by status">
                    {["", ...cardStatuses].map((st) => (
                      <Button variant="choice" size="sm"
                        key={st || "all"}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        aria-pressed={statusFilter === st}
                      >
                        {st ? statusLabel(String(st)) : "All"}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="sk-stagger space-y-2">
            {(showAllCards ? visibleCards : visibleCards.slice(0, 12)).map((report: any) => (
              <Button variant="choice" key={report.id} type="button" onClick={() => openReportCard(report)}
                className="group w-full flex-col items-start gap-2 p-4 text-start sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-strong transition-colors group-hover:text-primary">{report.student?.fullName || "Student"}</p>
                  <p className="mt-0.5 text-xs font-normal text-ink-subtle">{report.exam?.title || "Report"} &mdash; {classLabel(report.student?.class)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">
                    <span data-numeric className="tabular-nums">{Math.round(report.percentage || 0)}%</span>
                  </Badge>
                  <StatusPill status={report.status} />
                </div>
              </Button>
            ))}
            {visibleCards.length > 12 ? (
              <Button variant="outline"
                type="button"
                onClick={() => setShowAllCards((v) => !v)}
                className="w-full items-center justify-center gap-1.5"
              >
                <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", showAllCards && "rotate-180")} />
                {showAllCards ? "Show fewer" : `Show all ${visibleCards.length} report cards`}
              </Button>
            ) : null}
            {/* `allCards.length && …` rendered a stray "0" when there were no cards. */}
            {allCards.length > 0 && visibleCards.length === 0 ? (
              <div className="sk-panel">
                <EmptyState
                  size="sm"
                  icon={SearchX}
                  title="No report card matches that"
                  description="Try another name, roll number or exam, or clear the filters."
                  action={
                    <Button variant="secondary" type="button" onClick={() => { setCardQuery(""); setStatusFilter(""); }}>
                      <X aria-hidden="true" /> Clear filters
                    </Button>
                  }
                />
              </div>
            ) : null}
            {!allCards.length && (
              <div className="sk-panel">
                <EmptyState
                  size="sm"
                  icon={FileText}
                  title="No report cards yet"
                  description="Report cards will appear after exams are processed."
                />
              </div>
            )}
          </div>
        </section>
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
      {/* SKO-423: reviewed weekly family updates for the teacher's classes. */}
      <div className="mt-4"><FamilyDigestReview classes={classHubs.map((cls: any) => ({ id: cls.id, label: classLabel(cls) }))} /></div>
    </TeacherPage>
  );
}
