"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  BarChart3,
  Check,
  Eye,
  FileText,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

const deliveryMeta: Record<string, { label: string; className: string }> = {
  NOT_SENT: { label: "Not sent", className: "bg-slate-100 text-slate-700" },
  NO_CONTACT: { label: "No contact", className: "bg-amber-100 text-amber-700" },
  SENT: { label: "Sent", className: "bg-emerald-100 text-emerald-700" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-700" },
  BLOCKED: { label: "Blocked", className: "bg-violet-100 text-violet-700" },
};

function classLabel(exam: Exam) {
  if (!exam.class) return "";
  return [exam.class.name, exam.class.section].filter(Boolean).join(" - ");
}

function statusBadge(status: Exam["status"]) {
  if (status === "PUBLISHED") return "bg-violet-100 text-violet-700";
  if (status === "PRINCIPAL_REVIEWED") return "bg-emerald-100 text-emerald-700";
  if (status === "LOCKED") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

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

  useEffect(() => {
    fetch("/api/exams")
      .then((res) => res.json())
      .then((data) => {
        setExams((data.exams || []).filter((exam: Exam) => exam.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(exam.status)));
      })
      .catch(() => toast.error("Could not load locked exams"))
      .finally(() => setLoadingExams(false));
  }, []);

  const loadReportCards = async (exam: Exam) => {
    setSelectedExam(exam);
    setBusyAction("load");
    try {
      const res = await fetch(`/api/reports?examId=${exam.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load reports");
      setSelectedExam(data.exam || exam);
      setReportCards(data.reportCards || []);
      setAnalytics(data.analytics || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load reports");
    } finally {
      setBusyAction(null);
    }
  };

  const runReportAction = async (action: "generate" | "pdf" | "review" | "publish" | "send", successMessage: string) => {
    if (!selectedExam) return;
    setBusyAction(action);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExam.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Report action failed");
      toast.success(successMessage);
      await loadReportCards(selectedExam);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report action failed");
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
      if (!res.ok) throw new Error(data.error || "AI generation failed");
      toast.success(`Generated remarks for ${data.succeeded} students`);
      await loadReportCards(selectedExam);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI generation failed");
    } finally {
      setBusyAction(null);
    }
  };

  const saveEditedRemark = async (reportCardId: string, approve = false) => {
    setBusyAction(`remark-${reportCardId}`);
    try {
      const res = await fetch(`/api/reports/${reportCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarksEn: editedRemarks.en, remarksUr: editedRemarks.ur, approve }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save remarks");
      setReportCards((prev) => prev.map((report) => (report.id === reportCardId ? { ...report, ...data.reportCard, student: report.student } : report)));
      setEditingId(null);
      toast.success(approve ? "Remarks approved" : "Remarks saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save remarks");
    } finally {
      setBusyAction(null);
    }
  };

  const approvedCount = reportCards.filter((report) => report.remarksApproved).length;
  const pdfCount = reportCards.filter((report) => report.pdfUrl).length;
  const sentCount = reportCards.filter((report) => report.isSent).length;
  const withRemarks = reportCards.filter((report) => report.remarksEn || report.remarksUr).length;

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Report Cards"
        description="Review remarks, generate PDFs, publish results, and track parent delivery"
        actions={
          selectedExam ? (
            <div className="flex items-center gap-2">
              <Button onClick={() => runReportAction("pdf", "PDFs generated")} disabled={busyAction === "pdf"} variant="outline" size="sm">
                {busyAction === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                PDFs
              </Button>
              <Button onClick={() => runReportAction("review", "Exam marked as principal reviewed")} disabled={busyAction === "review"} variant="outline" size="sm">
                {busyAction === "review" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Review
              </Button>
              <Button onClick={() => runReportAction("publish", "Reports published")} disabled={busyAction === "publish"} variant="outline" size="sm">
                {busyAction === "publish" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Publish
              </Button>
              <Button onClick={() => runReportAction("send", "Delivery attempted")} disabled={busyAction === "send"} size="sm">
                {busyAction === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="p-6 space-y-6">
        <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "0ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Locked Exams</CardTitle>
            <CardDescription>Report cards are generated from locked exams only</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingExams ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
            <div className="flex flex-wrap gap-3">
              {exams.map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => loadReportCards(exam)}
                  className={`px-4 py-3 rounded-lg border text-left transition-all ${
                    selectedExam?.id === exam.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{exam.title}</span>
                    <Badge className={`text-xs ${statusBadge(exam.status)}`}>{exam.status.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {exam.term} {exam.academicYear} {classLabel(exam) ? `| ${classLabel(exam)}` : ""}
                  </p>
                </button>
              ))}
              {exams.length === 0 ? (
                <p className="text-sm text-muted-foreground">No locked exams yet. Lock an exam from Academic Engine first.</p>
              ) : null}
            </div>
            )}
          </CardContent>
        </Card>

        {selectedExam ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "0ms" }}>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Class Average</p>
                  <p className="text-2xl font-semibold">{analytics?.classAverage || 0}%</p>
                </CardContent>
              </Card>
              <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "60ms" }}>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Pass / Fail</p>
                  <p className="text-2xl font-semibold">{analytics?.passCount || 0} / {analytics?.failCount || 0}</p>
                </CardContent>
              </Card>
              <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "120ms" }}>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Approved Remarks</p>
                  <p className="text-2xl font-semibold">{approvedCount}/{reportCards.length}</p>
                </CardContent>
              </Card>
              <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "180ms" }}>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">PDFs / Sent</p>
                  <p className="text-2xl font-semibold">{pdfCount}/{sentCount}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="sk-rise border-primary/20 bg-primary/5" style={{ animationDelay: "200ms" }}>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex-1">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      AI Remarks
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {withRemarks}/{reportCards.length} drafted, {approvedCount} approved
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Select value={tone} onChange={(event) => setTone(event.target.value as typeof tone)} className="w-[150px]">
                      <option value="encouraging">Encouraging</option>
                      <option value="formal">Formal</option>
                      <option value="constructive">Constructive</option>
                    </Select>
                    <Select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} className="w-[160px]">
                      <option value="both">English + Urdu</option>
                      <option value="en">English only</option>
                      <option value="ur">Urdu only</option>
                    </Select>
                    <Button onClick={generateBatchRemarks} disabled={busyAction === "remarks"} size="sm">
                      {busyAction === "remarks" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Generate
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
              <div className="space-y-3">
                {busyAction === "load" ? (
                  <Card>
                    <CardContent className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </CardContent>
                  </Card>
                ) : null}

                {reportCards.map((report, index) => {
                  const delivery = deliveryMeta[report.deliveryStatus] || deliveryMeta.NOT_SENT;
                  const attendance = report.attendanceTotal ? `${report.attendancePresent}/${report.attendanceTotal}` : "Not recorded";
                  return (
                    <Card
                      key={report.id}
                      className={`sk-rise overflow-hidden border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] ${report.isSent ? "border-green-200 bg-green-50/30" : ""}`}
                      style={{ animationDelay: `${index * 60}ms` }}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <span className="font-semibold">{report.student.fullName}</span>
                              <span className="text-xs text-muted-foreground">#{report.student.rollNo}</span>
                              <Badge variant="secondary" className="text-xs">Rank {report.rank || "-"}</Badge>
                              <Badge variant="secondary" className="text-xs">{report.percentage.toFixed(1)}% - {report.grade || "-"}</Badge>
                              <Badge className={`text-xs ${delivery.className}`}>{delivery.label}</Badge>
                              {report.remarksApproved ? (
                                <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                                  <Check className="h-3 w-3 mr-1" /> Approved
                                </Badge>
                              ) : null}
                            </div>

                            <div className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                              <span>Total: {report.obtainedMarks}/{report.totalMarks}</span>
                              <span>Attendance: {attendance}</span>
                              <span className="flex items-center gap-1">
                                <MessageCircle className="h-3.5 w-3.5" /> {report.student.guardianWhatsapp ? "WhatsApp" : "No WhatsApp"}
                              </span>
                              <span className="flex items-center gap-1">
                                <Mail className="h-3.5 w-3.5" /> {report.student.guardianEmail ? "Email" : "No email"}
                              </span>
                            </div>

                            {editingId === report.id ? (
                              <div className="space-y-3">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Globe className="h-3.5 w-3.5 text-blue-500" />
                                    <span className="text-xs font-medium text-blue-600">English Remarks</span>
                                  </div>
                                  <Textarea
                                    value={editedRemarks.en}
                                    onChange={(event) => setEditedRemarks((prev) => ({ ...prev, en: event.target.value }))}
                                    rows={3}
                                    className="text-sm"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Globe className="h-3.5 w-3.5 text-green-500" />
                                    <span className="text-xs font-medium text-green-600">Urdu Remarks</span>
                                  </div>
                                  <Textarea
                                    value={editedRemarks.ur}
                                    onChange={(event) => setEditedRemarks((prev) => ({ ...prev, ur: event.target.value }))}
                                    rows={3}
                                    dir="rtl"
                                    className="text-sm"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => saveEditedRemark(report.id)} disabled={busyAction === `remark-${report.id}`}>Save</Button>
                                  <Button size="sm" onClick={() => saveEditedRemark(report.id, true)} disabled={busyAction === `remark-${report.id}`}>
                                    Approve
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {report.remarksEn ? (
                                  <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                                    <p className="text-xs text-blue-500 mb-0.5">English</p>
                                    <p className="text-sm">{report.remarksEn}</p>
                                  </div>
                                ) : null}
                                {report.remarksUr ? (
                                  <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2">
                                    <p className="text-xs text-green-500 mb-0.5">Urdu</p>
                                    <p className="text-sm" dir="rtl">{report.remarksUr}</p>
                                  </div>
                                ) : null}
                                {!report.remarksEn && !report.remarksUr ? (
                                  <p className="text-sm text-muted-foreground italic">No remarks generated yet</p>
                                ) : null}
                                {report.deliveryError ? (
                                  <p className="flex items-center gap-2 text-xs text-red-600">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    {report.deliveryError}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            {editingId !== report.id ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditingId(report.id);
                                  setEditedRemarks({ en: report.remarksEn || "", ur: report.remarksUr || "" });
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {report.pdfUrl ? (
                              <a href={report.pdfUrl} target="_blank" rel="noreferrer">
                                <Button size="icon" variant="ghost" className="h-8 w-8">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {reportCards.length === 0 && busyAction !== "load" ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="mx-auto h-10 w-10 mb-3 opacity-30" />
                    <p>No report cards yet. Select a locked exam above.</p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "80ms" }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Top Students
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(analytics?.topStudents || []).map((student) => (
                      <div key={student.studentId} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span>{student.rank}. {student.name}</span>
                        <span className="font-semibold">{student.percentage}%</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "160ms" }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Needs Attention
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(analytics?.studentsNeedingAttention || []).map((student) => (
                      <div key={student.studentId} className="rounded-lg border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span>{student.name}</span>
                          <span className="font-semibold">{student.percentage}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Attendance: {student.attendancePercentage === null ? "Not recorded" : `${student.attendancePercentage}%`}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "240ms" }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Subject Averages
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(analytics?.subjectAverages || []).map((subject) => (
                      <div key={subject.subjectId} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span>{subject.subject}</span>
                        <span className="font-semibold">{subject.average}%</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "320ms" }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Campus Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Locked Exams</p>
                      <p className="text-xl font-semibold">{analytics?.campusSummary.lockedExams || 0}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Published</p>
                      <p className="text-xl font-semibold">{analytics?.campusSummary.publishedExams || 0}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Reports</p>
                      <p className="text-xl font-semibold">{analytics?.campusSummary.reportCardsGenerated || 0}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Sent</p>
                      <p className="text-xl font-semibold">{analytics?.campusSummary.reportsSent || 0}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
