"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InputGroup, FieldAction } from "@/components/ui/input-group";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { ArrowRight, BrainCircuit, ChevronDown, FileText, Search, SearchX, X } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Select } from "@/components/ui/select";
import {
  classLabel, ReportCardDetailModal, ReportsSkeleton, StatusPill, TeacherErrorState, useTeacherData,
} from "@/components/teacher/teacher-components";
import { useAcademicYear } from "@/components/academic-year/CycleGate";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Input as SystemInput } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";

/** "PRINCIPAL_REVIEWED" → "Principal reviewed", for filter chips. */
function statusLabel(status: string) {
  const text = status.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Report cards (teacher): draft remarks for locked tests, open each card to edit and save its
 * remarks, and send a published card to its family. Approving and publishing belong to the academic
 * lead; queueing delivery for a whole class belongs to the office (C6, D5).
 */

export default function ReportsPage() {
  const ui = useUiText();
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
  /* Links into this screen scope the list: job and notification links carry `?exam=<id>` (P9
     `jobSourceHref`, REPORT_CARDS_* notifications) and the class row menu carries `?classId=<id>`.
     `studentId` + `classId` together open one card instead (effect below). */
  const examParam = searchParams.get("exam");
  const classParam = searchParams.get("studentId") ? null : searchParams.get("classId");
  const scopeKey = `${examParam ?? ""}|${classParam ?? ""}`;
  const [clearedScopeKey, setClearedScopeKey] = useState<string | null>(null);
  const scopeCleared = clearedScopeKey === scopeKey;
  const examScope = scopeCleared ? null : examParam;
  const classScope = scopeCleared ? null : classParam;


  /* G10: the console payload carries only the newest cards (`recentReportCards`), so a scoped link must not filter
     that short list — a test outside it would open as "0 of 18". A scope reads its own cards from
     `GET /api/reports?examId=` (the same teacher-scoped read the report pipeline uses): one locked test, or every
     locked test of the linked class. */
  const scopeExamIds = useMemo(() => {
    if (examScope) return [examScope];
    if (!classScope) return [];
    return (data?.lockedExams || []).filter((exam: any) => (exam.classId ?? exam.class?.id) === classScope).map((exam: any) => String(exam.id));
  }, [examScope, classScope, data]);
  const scopeFetchKey = scopeExamIds.join(",");
  const [scoped, setScoped] = useState<{ key: string; cards: any[] | null; failed: boolean } | null>(null);
  const loadScoped = useCallback(async () => {
    if (!scopeFetchKey) { setScoped(null); return; }
    // A refresh of the same scope (after saving remarks) keeps the list on screen while it revalidates.
    setScoped((prev) => (prev && prev.key === scopeFetchKey && prev.cards ? prev : { key: scopeFetchKey, cards: null, failed: false }));
    try {
      const batches = await Promise.all(scopeFetchKey.split(",").map(async (examId: string) => {
        const res = await fetch(`/api/reports?examId=${encodeURIComponent(examId)}`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.success) throw new Error("scope");
        const exam = body.exam || {};
        return (body.reportCards || []).map((card: any) => ({
          ...card,
          exam: { id: exam.id ?? card.examId, title: exam.title, term: exam.term, status: exam.status },
          student: { ...card.student, id: card.studentId, class: { ...(exam.class || {}), ...(card.student?.class || {}), id: exam.class?.id ?? exam.classId } },
        }));
      }));
      setScoped({ key: scopeFetchKey, cards: batches.flat(), failed: false });
    } catch {
      setScoped({ key: scopeFetchKey, cards: null, failed: true });
    }
  }, [scopeFetchKey]);
  useEffect(() => { if (data) void loadScoped(); }, [data, loadScoped]);
  const scopedCards = scoped && scoped.key === scopeFetchKey ? scoped : null;

  /* The list was a hard `.slice(0, 12)`. A teacher of four classes has well
     over a hundred report cards, and the other ninety-plus were simply
     unreachable from this screen — no search, no paging, no indication they
     existed at all. */
  const allCards: any[] = useMemo(() => scopedCards?.cards ?? data?.recentReportCards ?? [], [data, scopedCards]);
  const scopeLoading = Boolean(scopeFetchKey) && (!scopedCards || (!scopedCards.cards && !scopedCards.failed));
  const scopeFailed = Boolean(scopedCards?.failed);
  const visibleCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    return allCards.filter((report) => {
      if (examScope && report.exam?.id !== examScope) return false;
      if (classScope && report.student?.class?.id !== classScope) return false;
      if (statusFilter && (report.status || "") !== statusFilter) return false;
      if (!q) return true;
      return `${report.student?.fullName || ""} ${report.student?.rollNo || ""} ${report.exam?.title || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [allCards, cardQuery, statusFilter, examScope, classScope]);

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
            toast.error(ui("This report card isn't ready yet. Your academic lead generates final grades and report cards."));
          }
        } catch { toast.error(ui("Could not open this report card. Please try again.")); }
      })();
    }
  }, [searchParams, data, academicYear, ui]);

  useEffect(() => {
    if (!data || selectedReportExamId) return;
    const locked: any[] = data.lockedExams || [];
    const linked = examParam ? locked.find((exam) => exam.id === examParam) : null;
    if (linked) setSelectedReportExamId(linked.id);
    else if (locked[0]?.id) setSelectedReportExamId(locked[0].id);
  }, [data, selectedReportExamId, examParam]);

  /* What the list is scoped to, in words ("Test: Term 1 quiz", "Class: Grade 7 A"). */
  const scopeLabel = useMemo(() => {
    if (examScope) {
      const exam = (data?.lockedExams || []).find((item: any) => item.id === examScope)
        || allCards.find((report) => report.exam?.id === examScope)?.exam;
      return exam?.title ? ui("Test: {0}", [exam.title]) : ui("One test");
    }
    if (classScope) {
      const cls = (data?.classHubs || []).find((item: any) => item.id === classScope)
        || allCards.find((report) => report.student?.class?.id === classScope)?.student?.class;
      return cls ? ui("Class: {0}", [classLabel(cls)]) : ui("One class");
    }
    return null;
  }, [examScope, classScope, data, allCards, ui]);

  const clearScope = useCallback(() => {
    setClearedScopeKey(scopeKey);
    router.replace("/teacher/reports", { scroll: false });
  }, [router, scopeKey]);

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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, ui("Could not draft remarks. Please try again.")));
      toast.success(ui("Remarks drafted for every pupil. Review each one before you save it."));
      await loadData();
    } catch (error: any) { toast.error(friendlyErrorMessage(error, ui("Could not draft remarks. Please try again."))); }
    finally { setRemarkBusy(false); }
  }, [selectedReportExamId, loadData, ui]);

  const handleGenerateStudentRemarks = useCallback(async (studentId: string, examId: string) => {
    setRemarkGeneratingFor(studentId);
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, studentId }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(apiErrorMessage(result.error, ui("Could not draft remarks for this pupil. Please try again.")));
      toast.success(ui("Remarks drafted for this pupil."));
      setSelectedReportCard(null);
    } catch (error: any) { toast.error(friendlyErrorMessage(error, ui("Could not draft remarks for this pupil. Please try again."))); }
    finally { setRemarkGeneratingFor(null); }
  }, [ui]);

  const sendReportCard = useCallback(async (reportId: string) => {
    setSendingReport(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/send`, { method: "POST" });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(apiErrorMessage(result.error, ui("Could not send this report card. Please try again.")));
      // M70: a background send stays on this screen; the toast offers the job's progress instead of
      // navigating away mid-task.
      if (result.jobId) {
        const jobId = String(result.jobId);
        toast.success(ui("Report card is being sent to the family."), {
          action: { label: ui("View progress"), onClick: () => router.push(`/jobs?id=${encodeURIComponent(jobId)}`) },
        });
      } else {
        toast.success(ui("Report card sent to the family."));
      }
      await loadData();
    } catch (error: any) { toast.error(friendlyErrorMessage(error, ui("Could not send this report card. Please try again."))); }
    finally { setSendingReport(null); }
  }, [loadData, router, ui]);

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
      if (!res.ok) throw new Error(apiErrorMessage(result.error, ui("Could not save remarks. Please try again.")));
      toast.success(ui("Remarks saved."));
      setSelectedReportCard((prev: any) => ({ ...prev, ...result.reportCard }));
      await loadData();
    } catch (error: any) { toast.error(friendlyErrorMessage(error, ui("Could not save remarks. Please try again."))); }
    finally { setSavingRemarks(false); }
  }, [selectedReportCard, loadData, ui]);

  if (loading && !data) return <ReportsSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={loadData} />;

  return (
    <TeacherPage
      icon={FileText}
      title="Report cards"
      description="Draft and save remarks for your locked tests. Your academic lead approves report cards before families see them."
      secondaryActions={[{
        id: "draft-with-ai",
        label: "Draft with AI",
        icon: BrainCircuit,
        onClick: handleGenerateRemarks,
        loading: remarkBusy,
        disabled: !selectedReportExamId,
        disabledReason: "Pick a locked test first.",
      }]}
    >
      <div className="space-y-3">

        {/* The test the AI drafts remarks for. */}
        <FormField
          name="reportExam"
          label={ui("Locked test")}
          description={ui("Only tests your academic lead has locked are listed.")}
          className="w-full min-w-0 sm:w-auto sm:max-w-md"
        >
          <Select value={selectedReportExamId} onChange={(e) => setSelectedReportExamId(e.target.value)} className="w-full sm:min-w-[280px]">
            {(data.lockedExams || []).map((exam: any) => (
              <option key={exam.id} value={exam.id}>{exam.title} — {classLabel(exam.class)}</option>
            ))}
            {!data.lockedExams?.length ? <option value="">{ui("No locked tests")}</option> : null}
          </Select>
        </FormField>

        {/* Locked exam cards */}
        <section aria-labelledby="locked-exams-heading">
          <h2 id="locked-exams-heading" className="mb-3 text-base font-bold text-ink-strong">{ui("Locked tests")}</h2>
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
                      {ui("{0} report cards", [rcCount])}
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
                  title={ui("No locked tests yet")}
                  description={ui("Finish entering marks for a test and lock it, or wait for your academic lead to lock an exam. Once locked it appears here, ready for remarks.")}
                  action={
                    <Button variant="secondary" type="button" onClick={() => router.push("/teacher/marks")} className="sk-nudge-trigger">
                      {ui("Go to Marks")}
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
              {ui("All published report cards")}
              <Badge variant="secondary" size="sm" aria-live="polite">
                <bdi data-numeric className="tabular-nums">
                  {cardQuery || statusFilter || scopeLabel ? ui("{0} of {1}", [visibleCards.length, allCards.length]) : allCards.length}
                </bdi>
              </Badge>
            </h2>
            {scopeLabel ? (
              <span className="flex flex-wrap items-center gap-1.5" data-report-scope>
                <Badge variant="secondary"><bdi>{scopeLabel}</bdi></Badge>
                <Button variant="ghost" size="sm" type="button" onClick={clearScope}>
                  <X aria-hidden="true" /> {ui("Show all report cards")}
                </Button>
              </span>
            ) : null}
            {allCards.length > 0 ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:ms-auto sm:w-auto">
                <InputGroup surfaceClassName="bg-card" className="w-full sm:w-64">
                  <Search aria-hidden="true" data-field-affix="start" className="pointer-events-none h-4 w-4 text-ink-subtle" />
                  <SystemInput
                    value={cardQuery}
                    onChange={(e) => setCardQuery(e.target.value)}
                    placeholder={ui("Pupil, roll number or test…")}
                    aria-label={ui("Search report cards")}
                    className={"w-full"}
                  />
                  {cardQuery ? (
                    <FieldAction data-field-affix="end" type="button" onClick={() => setCardQuery("")} label={ui("Clear report card search")}>
                      <X aria-hidden="true" />
                    </FieldAction>
                  ) : null}
                </InputGroup>
                {cardStatuses.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={ui("Filter report cards by status")}>
                    {["", ...cardStatuses].map((st) => (
                      <Button variant="choice" size="sm"
                        key={st || "all"}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        aria-pressed={statusFilter === st}
                      >
                        {st ? ui(statusLabel(String(st))) : ui("All")}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {scopeFailed ? (
            <ErrorState title={ui("Couldn't load the report cards for this link")} onRetry={loadScoped} retryLabel={ui("Try again")} />
          ) : scopeLoading ? <SkeletonList rows={4} label={ui("Loading report cards…")} /> : null}
          <div className={cn("sk-stagger space-y-2", (scopeLoading || scopeFailed) && "hidden")}>
            {(showAllCards ? visibleCards : visibleCards.slice(0, 12)).map((report: any) => (
              <Button variant="choice" key={report.id} type="button" onClick={() => openReportCard(report)}
                className="group w-full flex-col items-start gap-2 p-4 text-start sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-strong transition-colors group-hover:text-primary"><bdi>{report.student?.fullName || ui("Pupil")}</bdi></p>
                  <p className="mt-0.5 text-xs font-normal text-ink-subtle"><bdi>{report.exam?.title || ui("Report card")}</bdi> — <bdi>{classLabel(report.student?.class)}</bdi></p>
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
                {showAllCards ? ui("Show fewer") : ui("Show all {0} report cards", [visibleCards.length])}
              </Button>
            ) : null}
            {/* `allCards.length && …` rendered a stray "0" when there were no cards. */}
            {allCards.length > 0 && visibleCards.length === 0 ? (
              <div className="sk-panel">
                <EmptyState
                  size="sm"
                  icon={SearchX}
                  title={ui("No report card matches that")}
                  description={ui("Try another name, roll number or test, or clear the filters.")}
                  action={
                    <Button variant="secondary" type="button" onClick={() => { setCardQuery(""); setStatusFilter(""); if (scopeLabel) clearScope(); }}>
                      <X aria-hidden="true" /> {ui("Clear filters")}
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
                  title={ui("No report cards yet")}
                  description={ui("Report cards appear here once your academic lead generates them.")}
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
    </TeacherPage>
  );
}
