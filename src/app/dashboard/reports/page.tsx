"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Lock,
  Mail,
  MessageCircle,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { InfoTip, Tooltip } from "@/components/ui/tooltip";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonCards, SkeletonList } from "@/components/ui/skeleton";
import { StatCard } from "@/components/role-dashboard/StatCard";
import { cn } from "@/lib/utils";

interface ReportCard {
  id: string;
  studentId: string;
  student: {
    fullName: string;
    rollNo: string;
    guardianWhatsapp?: string | null;
    guardianEmail?: string | null;
    class?: { name: string; section?: string | null };
  };
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade?: string | null;
  rank?: number | null;
  attendancePresent: number;
  attendanceTotal: number;
  remarksEn?: string | null;
  remarksUr?: string | null;
  remarksApproved: boolean;
  status: string;
  isSent: boolean;
  sentVia?: string | null;
  deliveryStatus: string;
  deliveryError?: string | null;
  pdfUrl?: string | null;
}

interface Exam {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "MARKS_ENTRY" | "LOCKED" | "PRINCIPAL_REVIEWED" | "PUBLISHED";
  isLocked: boolean;
  term: string;
  academicYear: number;
  class?: { name: string; section?: string | null };
}

interface Analytics {
  classAverage: number;
  passCount: number;
  failCount: number;
  subjectAverages: Array<{ subjectId: string; subject: string; average: number; entries: number }>;
  topStudents: Array<{ studentId: string; name: string; rollNo: string; percentage: number; rank?: number | null }>;
  studentsNeedingAttention: Array<{ studentId: string; name: string; rollNo: string; percentage: number; attendancePercentage: number | null }>;
  campusSummary: { lockedExams: number; publishedExams: number; reportCardsGenerated: number; reportsSent: number };
}

type BadgeVariant = NonNullable<BadgeProps["variant"]>;
type ReportAction = "generate" | "pdf" | "review" | "publish" | "send";
type ConfirmKind = "publish" | "send" | "remarks";

const deliveryMeta: Record<string, { label: string; variant: BadgeVariant }> = {
  NOT_SENT: { label: "Not sent", variant: "neutral" },
  NO_CONTACT: { label: "No contact", variant: "warning" },
  SENT: { label: "Sent", variant: "success" },
  FAILED: { label: "Failed", variant: "danger" },
  BLOCKED: { label: "Blocked", variant: "secondary" },
};

const examStatusLabel: Record<Exam["status"], string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  MARKS_ENTRY: "Marks entry",
  LOCKED: "Locked",
  PRINCIPAL_REVIEWED: "Principal reviewed",
  PUBLISHED: "Published",
};

function classLabel(exam: Exam) {
  if (!exam.class) return "";
  return [exam.class.name, exam.class.section].filter(Boolean).join(" - ");
}

function statusVariant(status: Exam["status"]): BadgeVariant {
  if (status === "PUBLISHED") return "secondary";
  if (status === "PRINCIPAL_REVIEWED") return "success";
  if (status === "LOCKED") return "warning";
  return "neutral";
}

const delay = (ms: number) => ({ "--sk-delay": `${ms}ms` }) as CSSProperties;

const CONFIRM_COPY: Record<ConfirmKind, { title: string; description: string; confirmLabel: string; tone: "primary" | "warning" }> = {
  publish: {
    title: "Publish report cards?",
    description: "This publishes the current approved version of every report card in this exam. Sending them to guardians is a separate step.",
    confirmLabel: "Publish",
    tone: "primary",
  },
  send: {
    title: "Send report cards to guardians?",
    description: "Each guardian is notified that their child's report card is ready. Messages that have gone out cannot be recalled.",
    confirmLabel: "Send to guardians",
    tone: "primary",
  },
  remarks: {
    title: "Replace existing remarks?",
    description: "New AI drafts replace the current remarks of every student with marks in this exam. Their approvals are cleared and their PDFs must be generated again.",
    confirmLabel: "Replace remarks",
    tone: "warning",
  },
};

export default function ReportsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedRemarks, setEditedRemarks] = useState({ en: "", ur: "" });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [tone, setTone] = useState<"formal" | "encouraging" | "constructive">("encouraging");
  const [language, setLanguage] = useState<"en" | "ur" | "both">("both");
  const [loadingExams, setLoadingExams] = useState(true);
  const [examsError, setExamsError] = useState(false);
  const [reportsError, setReportsError] = useState(false);
  const [approvingRemark, setApprovingRemark] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmKind | null>(null);

  const fetchExams = useCallback(() => {
    return fetch("/api/exams")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load exams");
        return data;
      })
      .then((data) => {
        setExams((data.exams || []).filter((exam: Exam) => exam.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(exam.status)));
        setExamsError(false);
      })
      .catch(() => {
        setExamsError(true);
        toast.error("Could not load exams. Please try again.");
      })
      .finally(() => setLoadingExams(false));
  }, []);

  useEffect(() => {
    void fetchExams();
  }, [fetchExams]);

  const retryExams = () => {
    setLoadingExams(true);
    setExamsError(false);
    void fetchExams();
  };

  const loadReportCards = async (exam: Exam) => {
    setSelectedExam(exam);
    setBusyAction("load");
    try {
      const res = await fetch(`/api/reports?examId=${exam.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the report cards for this exam.");
      setSelectedExam(data.exam || exam);
      setReportCards(data.reportCards || []);
      setAnalytics(data.analytics || null);
      setReportsError(false);
    } catch (error) {
      setReportsError(true);
      toast.error(error instanceof Error ? error.message : "Could not load the report cards for this exam.");
    } finally {
      setBusyAction(null);
    }
  };

  const runReportAction = async (action: ReportAction, successMessage: string) => {
    if (!selectedExam) return;
    setBusyAction(action);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExam.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not complete this action. Please try again.");
      if (data.jobId) { window.location.assign(`/jobs?id=${data.jobId}`); return; }
      toast.success(successMessage);
      await loadReportCards(selectedExam);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete this action. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const generateBatchRemarks = async () => {
    if (!selectedExam) return;
    setBusyAction("remarks");
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: true, examId: selectedExam.id, language, tone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not draft remarks right now. Please try again.");
      toast.success(typeof data.total === "number"
        ? `Drafted remarks for ${data.succeeded} of ${data.total} students`
        : `Drafted remarks for ${data.succeeded} students`);
      if (Array.isArray(data.failed) && data.failed.length > 0) {
        toast.warning(`${data.failed.length} remarks could not be drafted. Write those by hand.`);
      }
      await loadReportCards(selectedExam);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not draft remarks right now. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const saveEditedRemark = async (reportCardId: string, approve = false) => {
    setBusyAction(`remark-${reportCardId}`);
    setApprovingRemark(approve);
    try {
      const res = await fetch(`/api/reports/${reportCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarksEn: editedRemarks.en, remarksUr: editedRemarks.ur, approve }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the remarks. Please try again.");
      setReportCards((prev) => prev.map((report) => (report.id === reportCardId ? { ...report, ...data.reportCard, student: report.student } : report)));
      setEditingId(null);
      toast.success(approve ? "Remarks saved and approved" : "Remarks saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the remarks. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const approvedCount = reportCards.filter((report) => report.remarksApproved).length;
  const pdfCount = reportCards.filter((report) => report.pdfUrl).length;
  const sentCount = reportCards.filter((report) => report.isSent).length;
  const withRemarks = reportCards.filter((report) => report.remarksEn || report.remarksUr).length;
  const loadingReports = busyAction === "load";

  const actionIcon = (action: string, Icon: LucideIcon) => (busyAction === action ? null : <Icon aria-hidden="true" />);

  const confirmCurrent = async () => {
    if (confirming === "remarks") await generateBatchRemarks();
    else if (confirming === "publish") await runReportAction("publish", "Report cards published");
    else if (confirming === "send") await runReportAction("send", "Delivery started");
    setConfirming(null);
  };

  const requestRemarks = () => {
    if (withRemarks > 0) setConfirming("remarks");
    else void generateBatchRemarks();
  };

  const confirmCopy = confirming ? CONFIRM_COPY[confirming] : null;

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Report Cards"
        description="Review remarks, generate PDFs, publish results, and track parent delivery"
        actions={
          selectedExam ? (
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip content="Creates a PDF of every report card in this exam. You follow its progress on the Jobs page.">
                <Button onClick={() => runReportAction("pdf", "PDF generation started")} loading={busyAction === "pdf"} variant="outline" size="sm">
                  {actionIcon("pdf", FileText)}
                  Generate PDFs
                </Button>
              </Tooltip>
              <Tooltip content="Records the principal's review of this exam. Every report card must be approved first.">
                <Button onClick={() => runReportAction("review", "Exam marked as principal reviewed")} loading={busyAction === "review"} variant="outline" size="sm">
                  {actionIcon("review", ShieldCheck)}
                  Mark reviewed
                </Button>
              </Tooltip>
              <Tooltip content="Publishes the approved report cards. The exam needs principal review first.">
                <Button onClick={() => setConfirming("publish")} loading={busyAction === "publish"} variant="outline" size="sm">
                  {actionIcon("publish", Upload)}
                  Publish
                </Button>
              </Tooltip>
              <Tooltip content="Notifies each guardian that the report card is ready. Publish the exam first.">
                <Button onClick={() => setConfirming("send")} loading={busyAction === "send"} size="sm">
                  {actionIcon("send", Send)}
                  Send to guardians
                </Button>
              </Tooltip>
            </div>
          ) : undefined
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <Card className="sk-enter">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Locked Exams</CardTitle>
            <CardDescription>Report cards are generated from locked exams only. Choose one to review it.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingExams ? (
              <SkeletonCards count={4} label="Loading exams" />
            ) : examsError ? (
              <ErrorState
                title="Could not load exams"
                description="The list of locked exams did not load. Check your connection and try again."
                onRetry={retryExams}
              />
            ) : exams.length === 0 ? (
              <EmptyState
                size="sm"
                icon={Lock}
                title="No locked exams yet"
                description="Report cards are built from locked exams. Lock an exam in Academic Engine once its marks are final."
                action={
                  <Link href="/dashboard/marks" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <ClipboardList aria-hidden="true" />
                    Open Academic Engine
                  </Link>
                }
              />
            ) : (
              <div className="sk-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {exams.map((exam) => (
                  <Button aria-pressed={selectedExam?.id === exam.id} variant="choice"
                    key={exam.id}
                    onClick={() => loadReportCards(exam)}
                    className="block h-auto w-full p-4 text-start"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 text-sm font-semibold text-ink-strong">{exam.title}</span>
                      <Badge size="sm" variant={statusVariant(exam.status)} dot>{examStatusLabel[exam.status] ?? exam.status.replaceAll("_", " ")}</Badge>
                    </span>
                    <span className="mt-1 block text-xs font-normal text-ink-muted">
                      <span data-numeric>{exam.term} {exam.academicYear}</span>
                      {classLabel(exam) ? ` · ${classLabel(exam)}` : ""}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedExam ? (
          <>
            <div className="sk-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={BarChart3} label="Class Average" value={`${analytics?.classAverage || 0}%`} sub="Mean percentage across report cards" />
              <StatCard icon={CheckCircle2} tone="green" label="Pass / Fail" value={`${analytics?.passCount || 0} / ${analytics?.failCount || 0}`} sub="Pass mark is 50%" />
              <StatCard icon={Check} label="Approved Remarks" value={`${approvedCount}/${reportCards.length}`} sub="Report cards with approved remarks" />
              <StatCard icon={FileText} tone="dark" label="PDFs / Sent" value={`${pdfCount}/${sentCount}`} sub="PDFs generated / sent to guardians" />
            </div>

            <Card variant="featured" className="sk-enter" style={delay(120)}>
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="flex items-center gap-2 text-base font-bold text-ink-strong">
                        <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
                        AI Remarks
                      </h2>
                      <InfoTip content="Drafts a remark for each student with marks in this exam. Review and approve every draft before the exam is published." />
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                      <span data-numeric>{withRemarks}/{reportCards.length}</span> drafted · <span data-numeric>{approvedCount}</span> approved
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end lg:w-auto">
                    <FormField name="remark-tone" label="Tone" className="min-w-0 sm:w-40">
                      <Select value={tone} onChange={(event) => setTone(event.target.value as typeof tone)}>
                        <option value="encouraging">Encouraging</option>
                        <option value="formal">Formal</option>
                        <option value="constructive">Constructive</option>
                      </Select>
                    </FormField>
                    <FormField name="remark-language" label="Language" className="min-w-0 sm:w-44">
                      <Select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
                        <option value="both">English + Urdu</option>
                        <option value="en">English only</option>
                        <option value="ur">Urdu only</option>
                      </Select>
                    </FormField>
                    <Button onClick={requestRemarks} loading={busyAction === "remarks"} className="w-full sm:w-auto">
                      {actionIcon("remarks", Sparkles)}
                      Generate
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
              <div className="min-w-0 space-y-3">
                {loadingReports ? (
                  <SkeletonList rows={4} label="Loading report cards" />
                ) : reportsError ? (
                  <Card>
                    <ErrorState
                      title="Could not load report cards"
                      description="The report cards for this exam did not load. Check your connection and try again."
                      onRetry={() => { void loadReportCards(selectedExam); }}
                    />
                  </Card>
                ) : reportCards.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={FileText}
                      title="No report cards for this exam yet"
                      description="Generate them from the exam's locked marks. Locking an exam normally does this for you."
                      action={
                        <Button onClick={() => runReportAction("generate", "Report cards generated for this exam")} loading={busyAction === "generate"}>
                          {actionIcon("generate", FileText)}
                          Generate report cards
                        </Button>
                      }
                    />
                  </Card>
                ) : (
                  reportCards.map((report, index) => {
                    const delivery = deliveryMeta[report.deliveryStatus] || deliveryMeta.NOT_SENT;
                    const attendance = report.attendanceTotal ? `${report.attendancePresent}/${report.attendanceTotal}` : "Not recorded";
                    const remarkBusy = busyAction === `remark-${report.id}`;
                    return (
                      <Card
                        key={report.id}
                        className={cn("sk-enter overflow-hidden", report.isSent && "border-status-success-border")}
                        style={delay(Math.min(index, 8) * 40)}
                      >
                        <CardContent className="p-4 sm:p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-3 flex flex-wrap items-center gap-2">
                                <h3 className="min-w-0 break-words text-base font-semibold text-ink-strong">{report.student.fullName}</h3>
                                <span data-numeric className="text-xs text-ink-subtle">#{report.student.rollNo}</span>
                                <Badge variant="secondary" size="sm"><span data-numeric>Rank {report.rank || "-"}</span></Badge>
                                <Badge variant="secondary" size="sm"><span data-numeric>{report.percentage.toFixed(1)}% - {report.grade || "-"}</span></Badge>
                                <Badge variant={delivery.variant} size="sm" dot>{delivery.label}</Badge>
                                {report.remarksApproved ? (
                                  <Badge variant="success" size="sm">
                                    <Check aria-hidden="true" /> Approved
                                  </Badge>
                                ) : null}
                              </div>

                              <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-ink-muted sm:grid-cols-4">
                                <span>Total: <span data-numeric>{report.obtainedMarks}/{report.totalMarks}</span></span>
                                <span>Attendance: <span data-numeric>{attendance}</span></span>
                                <span className="flex items-center gap-1">
                                  <MessageCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> {report.student.guardianWhatsapp ? "WhatsApp" : "No WhatsApp"}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> {report.student.guardianEmail ? "Email" : "No email"}
                                </span>
                              </div>

                              {editingId === report.id ? (
                                <div className="space-y-3">
                                  <FormField name={`remarks-en-${report.id}`} label="English remarks">
                                    <Textarea
                                      value={editedRemarks.en}
                                      onChange={(event) => setEditedRemarks((prev) => ({ ...prev, en: event.target.value }))}
                                      rows={3}
                                    />
                                  </FormField>
                                  <FormField name={`remarks-ur-${report.id}`} label="Urdu remarks">
                                    <Textarea
                                      value={editedRemarks.ur}
                                      onChange={(event) => setEditedRemarks((prev) => ({ ...prev, ur: event.target.value }))}
                                      rows={3}
                                      dir="rtl"
                                      lang="ur"
                                    />
                                  </FormField>
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                    <Button size="sm" variant="outline" onClick={() => saveEditedRemark(report.id)} loading={remarkBusy && !approvingRemark} disabled={remarkBusy}>Save</Button>
                                    <Button size="sm" onClick={() => saveEditedRemark(report.id, true)} loading={remarkBusy && approvingRemark} disabled={remarkBusy}>
                                      {remarkBusy && approvingRemark ? null : <Check aria-hidden="true" />}
                                      Save and approve
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {report.remarksEn ? (
                                    <div className="rounded-xl border border-status-info-border bg-status-info-surface px-3 py-2">
                                      <p className="mb-0.5 text-2xs font-semibold text-status-info-text">English</p>
                                      <p className="text-sm leading-relaxed text-ink">{report.remarksEn}</p>
                                    </div>
                                  ) : null}
                                  {report.remarksUr ? (
                                    <div className="rounded-xl border border-status-success-border bg-status-success-surface px-3 py-2">
                                      <p className="mb-0.5 text-2xs font-semibold text-status-success-text">Urdu</p>
                                      <p className="text-sm leading-relaxed text-ink" dir="rtl" lang="ur">{report.remarksUr}</p>
                                    </div>
                                  ) : null}
                                  {!report.remarksEn && !report.remarksUr ? (
                                    <p className="text-sm text-ink-subtle">No remarks yet. Generate AI drafts above or write them with Edit remarks.</p>
                                  ) : null}
                                  {report.deliveryError ? (
                                    <p className="flex items-start gap-2 text-xs leading-relaxed text-status-error-text">
                                      <AlertCircle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                                      {report.deliveryError}
                                    </p>
                                  ) : null}
                                </div>
                              )}
                            </div>

                            <div className="flex shrink-0 flex-col gap-1">
                              {editingId !== report.id ? (
                                <IconButton
                                  label="Edit remarks"
                                  onClick={() => {
                                    setEditingId(report.id);
                                    setEditedRemarks({ en: report.remarksEn || "", ur: report.remarksUr || "" });
                                  }}
                                >
                                  <Pencil aria-hidden="true" />
                                </IconButton>
                              ) : null}
                              {report.pdfUrl ? (
                                <Tooltip content="Open PDF" describe={false}>
                                  <a
                                    href={report.pdfUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Open PDF"
                                    className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "min-h-10 min-w-10 p-0")}
                                  >
                                    <Eye aria-hidden="true" />
                                  </a>
                                </Tooltip>
                              ) : null}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>

              <div className="min-w-0 space-y-3">
                <Card className="sk-enter" style={delay(80)}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy aria-hidden="true" className="h-4 w-4 text-primary" />
                      Top Students
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(analytics?.topStudents || []).length === 0 ? (
                      <EmptyState size="sm" icon={Trophy} className="py-6" title="No rankings yet" description="The top five appear once report cards are generated." />
                    ) : (
                      <ol className="space-y-2">
                        {(analytics?.topStudents || []).map((student) => (
                          <li key={student.studentId} className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-2 text-sm">
                            <span className="min-w-0 truncate text-ink">
                              <span data-numeric className="me-1.5 font-semibold text-ink-subtle">{student.rank ?? "-"}.</span>
                              {student.name}
                            </span>
                            <span data-numeric className="shrink-0 font-semibold text-ink-strong">{student.percentage}%</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>

                <Card className="sk-enter" style={delay(160)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertCircle aria-hidden="true" className="h-4 w-4 text-status-warning-text" />
                        Needs Attention
                      </CardTitle>
                      <InfoTip content="Students below 50% overall, or with attendance under 75%. Shows up to eight." />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(analytics?.studentsNeedingAttention || []).length === 0 ? (
                      <EmptyState size="sm" icon={CheckCircle2} className="py-6" title="Nobody flagged" description="No student is below 50% or under 75% attendance in this exam." />
                    ) : (
                      <ul className="space-y-2">
                        {(analytics?.studentsNeedingAttention || []).map((student) => (
                          <li key={student.studentId} className="rounded-xl border border-border-subtle px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate text-ink">{student.name}</span>
                              <span data-numeric className="shrink-0 font-semibold text-ink-strong">{student.percentage}%</span>
                            </div>
                            <p className="mt-0.5 text-xs text-ink-subtle">
                              Attendance: <span data-numeric>{student.attendancePercentage === null ? "Not recorded" : `${student.attendancePercentage}%`}</span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card className="sk-enter" style={delay(240)}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 aria-hidden="true" className="h-4 w-4 text-primary" />
                      Subject Averages
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(analytics?.subjectAverages || []).length === 0 ? (
                      <EmptyState size="sm" icon={BarChart3} className="py-6" title="No subject marks yet" description="Averages appear once marks are entered for this exam." />
                    ) : (
                      <ul className="space-y-2">
                        {(analytics?.subjectAverages || []).map((subject) => (
                          <li key={subject.subjectId} className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-2 text-sm">
                            <span className="min-w-0 truncate text-ink">{subject.subject}</span>
                            <span data-numeric className="shrink-0 font-semibold text-ink-strong">{subject.average}%</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card className="sk-enter" style={delay(320)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="text-base">Campus Summary</CardTitle>
                      <InfoTip content="Exam counts cover this academic year. Report counts cover every year on this campus." />
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { label: "Locked Exams", value: analytics?.campusSummary.lockedExams || 0 },
                      { label: "Published", value: analytics?.campusSummary.publishedExams || 0 },
                      { label: "Reports", value: analytics?.campusSummary.reportCardsGenerated || 0 },
                      { label: "Sent", value: analytics?.campusSummary.reportsSent || 0 },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 rounded-xl border border-border-subtle bg-surface-subtle p-3">
                        <p className="truncate text-xs text-ink-muted">{item.label}</p>
                        <p data-numeric className="text-xl font-bold text-ink-strong">{item.value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {confirmCopy ? (
        <ConfirmAction
          open
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          tone={confirmCopy.tone}
          busy={busyAction === confirming}
          detail={selectedExam ? [selectedExam.title, classLabel(selectedExam)].filter(Boolean).join(" · ") : undefined}
          onConfirm={() => { void confirmCurrent(); }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}
