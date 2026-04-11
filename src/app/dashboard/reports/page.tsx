"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { toast } from "sonner";
import {
  Sparkles,
  FileText,
  Send,
  Loader2,
  Check,
  Eye,
  Pencil,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface ReportCard {
  id: string;
  studentId: string;
  student: { fullName: string; rollNo: string };
  remarksEn?: string;
  remarksUr?: string;
  isSent: boolean;
  pdfUrl?: string;
}

interface Exam {
  id: string;
  title: string;
  isLocked: boolean;
  term: string;
  academicYear: number;
}

export default function ReportsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedRemarks, setEditedRemarks] = useState({ en: "", ur: "" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [tone, setTone] = useState<"formal" | "encouraging" | "constructive">("encouraging");
  const [language, setLanguage] = useState<"en" | "ur" | "both">("both");

  useEffect(() => {
    fetch("/api/exams")
      .then((r) => r.json())
      .then((d) => setExams((d.exams || []).filter((e: Exam) => e.isLocked)));
  }, []);

  const loadReportCards = async (exam: Exam) => {
    setSelectedExam(exam);
    const res = await fetch(`/api/reports?examId=${exam.id}`);
    const data = await res.json();
    setReportCards(data.reportCards || []);
  };

  const generateBatchRemarks = async () => {
    if (!selectedExam) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch: true,
          examId: selectedExam.id,
          campusId: "",
          language,
          tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Generated remarks for ${data.succeeded} students`);
      await loadReportCards(selectedExam);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveEditedRemark = async (reportCardId: string) => {
    const rc = reportCards.find((r) => r.id === reportCardId);
    if (!rc) return;

    await fetch(`/api/reports/${reportCardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remarksEn: editedRemarks.en, remarksUr: editedRemarks.ur }),
    });
    setReportCards((prev) =>
      prev.map((r) =>
        r.id === reportCardId
          ? { ...r, remarksEn: editedRemarks.en, remarksUr: editedRemarks.ur }
          : r
      )
    );
    setEditingId(null);
    toast.success("Remarks saved");
  };

  const bulkSend = async () => {
    if (!selectedExam) return;
    setIsSending(true);
    try {
      const res = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExam.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Sent report cards to ${data.sent} parents via WhatsApp/Email`);
      await loadReportCards(selectedExam);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send reports");
    } finally {
      setIsSending(false);
    }
  };

  const generatePdfs = async () => {
    if (!selectedExam) return;
    setIsGeneratingPdf(true);
    try {
      await fetch("/api/reports/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExam.id }),
      });
      toast.success("PDFs queued for generation");
    } catch {
      toast.error("PDF generation failed");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const sentCount = reportCards.filter((r) => r.isSent).length;
  const withRemarks = reportCards.filter((r) => r.remarksEn || r.remarksUr).length;

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Report Cards"
        description="Review AI remarks · Generate PDFs · Bulk send to parents"
        actions={
          selectedExam ? (
            <div className="flex items-center gap-2">
              <Button onClick={generatePdfs} disabled={isGeneratingPdf} variant="outline" size="sm">
                {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Generate PDFs
              </Button>
              <Button onClick={bulkSend} disabled={isSending} size="sm">
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Bulk Send
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="p-6 space-y-6">
        {/* Exam selector — only locked exams */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Locked Exam</CardTitle>
            <CardDescription>Only locked exams can generate report cards</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {exams.map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => loadReportCards(exam)}
                  className={`px-4 py-2 rounded-lg border-2 text-sm transition-all ${
                    selectedExam?.id === exam.id ? "border-primary bg-primary/5 font-semibold" : "border-border hover:border-primary/40"
                  }`}
                >
                  {exam.title} — {exam.term} {exam.academicYear}
                </button>
              ))}
              {exams.length === 0 && (
                <p className="text-sm text-muted-foreground">No locked exams yet. Lock an exam from the Marks Entry page first.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedExam && (
          <>
            {/* AI Generation Controls */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      AI Remark Generation
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {withRemarks}/{reportCards.length} remarks generated · {sentCount} sent
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value as any)}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="encouraging">Encouraging</option>
                      <option value="formal">Formal</option>
                      <option value="constructive">Constructive</option>
                    </select>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as any)}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="both">English + Urdu</option>
                      <option value="en">English only</option>
                      <option value="ur">Urdu only</option>
                    </select>
                    <Button onClick={generateBatchRemarks} disabled={isGenerating} size="sm">
                      {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Generate All
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Report Cards list — Review & Edit */}
            <div className="space-y-3">
              {reportCards.map((rc) => (
                <Card key={rc.id} className={`transition-all ${rc.isSent ? "border-green-200 bg-green-50/30" : ""}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-semibold">{rc.student.fullName}</span>
                          <span className="text-xs text-muted-foreground">#{rc.student.rollNo}</span>
                          {rc.isSent && (
                            <Badge className="bg-green-100 text-green-700 text-xs">
                              <Check className="h-3 w-3 mr-1" /> Sent
                            </Badge>
                          )}
                          {rc.pdfUrl && (
                            <Badge variant="secondary" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" /> PDF Ready
                            </Badge>
                          )}
                        </div>

                        {editingId === rc.id ? (
                          <div className="space-y-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Globe className="h-3.5 w-3.5 text-blue-500" />
                                <span className="text-xs font-medium text-blue-600">English Remarks</span>
                              </div>
                              <Textarea
                                value={editedRemarks.en}
                                onChange={(e) => setEditedRemarks((prev) => ({ ...prev, en: e.target.value }))}
                                rows={2}
                                className="text-sm"
                              />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Globe className="h-3.5 w-3.5 text-green-500" />
                                <span className="text-xs font-medium text-green-600">اردو ریمارکس</span>
                              </div>
                              <Textarea
                                value={editedRemarks.ur}
                                onChange={(e) => setEditedRemarks((prev) => ({ ...prev, ur: e.target.value }))}
                                rows={2}
                                dir="rtl"
                                className="text-sm font-urdu"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveEditedRemark(rc.id)}>Save</Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {rc.remarksEn && (
                              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                                <p className="text-xs text-blue-500 mb-0.5">English</p>
                                <p className="text-sm">{rc.remarksEn}</p>
                              </div>
                            )}
                            {rc.remarksUr && (
                              <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2">
                                <p className="text-xs text-green-500 mb-0.5">اردو</p>
                                <p className="text-sm" dir="rtl">{rc.remarksUr}</p>
                              </div>
                            )}
                            {!rc.remarksEn && !rc.remarksUr && (
                              <p className="text-sm text-muted-foreground italic">No remarks generated yet</p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {editingId !== rc.id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingId(rc.id);
                              setEditedRemarks({ en: rc.remarksEn || "", ur: rc.remarksUr || "" });
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {rc.pdfUrl && (
                          <a href={rc.pdfUrl} target="_blank" rel="noreferrer">
                            <Button size="icon" variant="ghost" className="h-8 w-8">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {reportCards.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="mx-auto h-10 w-10 mb-3 opacity-30" />
                  <p>No report cards yet. Select an exam above.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
