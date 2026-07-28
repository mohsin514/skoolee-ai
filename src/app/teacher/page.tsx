"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  Loader2,
  LogOut,
  Mail,
  School,
  Send,
  Star,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getTeacherDashboardData } from "@/app/actions/dashboard";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { Select } from "@/components/ui/select";
import {
  AiActionPanel,
  BrandButton,
  EmptyState,
  RoleShell,
  StatCard,
  type RoleNavItem,
} from "@/components/role-dashboard";
import { SingleSubjectReportCard } from "@/components/report-card/single-subject";
import { CombinedReportCard } from "@/components/report-card/combined";

type TeacherView = "academics" | "attendance" | "marks" | "reports" | "ai";
type AttendanceStatus = "PRESENT" | "ABSENT" | "LEAVE";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function classLabel(item: any) {
  if (!item) return "Unassigned";
  return [item.name, item.section].filter(Boolean).join(" ");
}

function formatStatus(status?: string) {
  return (status || "Pending").replaceAll("_", " ");
}

function statusTone(status?: string) {
  if (["ACTIVE", "MARKS_ENTRY", "PUBLISHED", "SENT", "APPROVED", "PRESENT"].includes(status || "")) {
    return "bg-emerald-50 text-emerald-600";
  }
  if (["LOCKED", "PRINCIPAL_REVIEWED", "REVIEWED", "LEAVE"].includes(status || "")) {
    return "bg-[#fbf0fe] text-[#8127cf]";
  }
  if (["ABSENT", "FAILED", "BLOCKED"].includes(status || "")) {
    return "bg-rose-50 text-rose-600";
  }
  return "bg-[#f3f4f9] text-[#4d4354]/70";
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<TeacherView>("academics");
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(todayIso());
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [attendanceHistoryLoading, setAttendanceHistoryLoading] = useState(false);
  const [attendanceExists, setAttendanceExists] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [markSheet, setMarkSheet] = useState<any>(null);
  const [marksByKey, setMarksByKey] = useState<Record<string, string>>({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);
  const [selectedReportExamId, setSelectedReportExamId] = useState("");
  const [remarkBusy, setRemarkBusy] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedReportCard, setSelectedReportCard] = useState<any>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("all");
  const [studentPage, setStudentPage] = useState(1);
  const [sendingReport, setSendingReport] = useState<string | null>(null);
  const [remarkGeneratingFor, setRemarkGeneratingFor] = useState<string | null>(null);
  const [showExamModal, setShowExamModal] = useState(false);
  const [showGradeConfigModal, setShowGradeConfigModal] = useState(false);
  const [showGradeOverviewModal, setShowGradeOverviewModal] = useState(false);
  const [examForm, setExamForm] = useState({
    title: "",
    term: "",
    classId: "",
    subjectId: "" as string,
    examType: "CLASS_TEST" as string,
  });
  const [creatingExam, setCreatingExam] = useState(false);
  const [gradeConfig, setGradeConfig] = useState<Record<string, number>>({});
  const [gradeConfigLoading, setGradeConfigLoading] = useState(false);
  const [gradeConfigSaving, setGradeConfigSaving] = useState(false);
  const [weightedGradeResult, setWeightedGradeResult] = useState<any>(null);
  const [weightedGradeLoading, setWeightedGradeLoading] = useState(false);
  const [selectedGradeClassId, setSelectedGradeClassId] = useState("");
  const [generatingReportCards, setGeneratingReportCards] = useState(false);
  const [reportCardsGenerated, setReportCardsGenerated] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getTeacherDashboardData());
    } catch (error: any) {
      toast.error(`Access denied: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!data) return;
    if (!attendanceClassId && data.classHubs?.[0]?.id) setAttendanceClassId(data.classHubs[0].id);
    if (!selectedExamId && (data.activeExams?.[0]?.id || data.exams?.[0]?.id)) {
      setSelectedExamId(data.activeExams?.[0]?.id || data.exams?.[0]?.id);
    }
    if (!selectedReportExamId && data.lockedExams?.[0]?.id) setSelectedReportExamId(data.lockedExams[0].id);
  }, [attendanceClassId, data, selectedExamId, selectedReportExamId]);

  const teacherSubjects = data?.subjects || [];
  const classHubs = data?.classHubs || [];
  const activeExam = (data?.exams || []).find((exam: any) => exam.id === selectedExamId);
  const selectedAttendanceClass = classHubs.find((cls: any) => cls.id === attendanceClassId);
  const missingMarksTotal = (data?.activeExams || []).reduce((sum: number, exam: any) => sum + (exam.missingMarks || 0), 0);
  const aiCampusId = teacherSubjects[0]?.campusId || classHubs[0]?.campusId;
  const isEditingAttendance = attendanceExists && attendanceDate !== todayIso();

  const attendanceStats = useMemo(() => {
    const summary = attendanceSummary || data?.attendanceSummary || {};
    return {
      total: summary.total || 0,
      present: summary.present || 0,
      absent: summary.absent || 0,
      leave: summary.leave || 0,
      unmarked: summary.unmarked || 0,
    };
  }, [attendanceSummary, data?.attendanceSummary]);

  const loadAttendance = useCallback(async () => {
    if (!attendanceClassId) return;
    setAttendanceLoading(true);
    try {
      const res = await fetch(`/api/attendance?classId=${encodeURIComponent(attendanceClassId)}&date=${encodeURIComponent(attendanceDate)}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Attendance could not be loaded");
      setAttendanceSummary(result.summary);
      setAttendanceRows(
        (result.students || []).map((student: any) => ({
          ...student,
          status: (student.attendance?.status || "PRESENT") as AttendanceStatus,
        }))
      );
      setAttendanceExists((result.summary?.unmarked ?? 0) < (result.summary?.total ?? 0));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attendance could not be loaded");
    } finally {
      setAttendanceLoading(false);
    }
  }, [attendanceClassId, attendanceDate]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const loadAttendanceHistory = useCallback(async () => {
    if (!attendanceClassId) return;
    setAttendanceHistoryLoading(true);
    try {
      const res = await fetch(`/api/attendance/history?classId=${encodeURIComponent(attendanceClassId)}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "History could not be loaded");
      setAttendanceHistory(result.history || []);
    } catch {
      setAttendanceHistory([]);
    } finally {
      setAttendanceHistoryLoading(false);
    }
  }, [attendanceClassId]);

  useEffect(() => {
    loadAttendanceHistory();
  }, [loadAttendanceHistory]);

  const loadMarks = useCallback(async () => {
    if (!selectedExamId) return;
    setMarksLoading(true);
    try {
      const res = await fetch(`/api/marks?examId=${encodeURIComponent(selectedExamId)}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Marks could not be loaded");
      const selectedSummary = (data?.exams || []).find((exam: any) => exam.id === selectedExamId);
      const editableIds = new Set((selectedSummary?.editableSubjects || []).map((subject: any) => subject.id));
      const subjects = editableIds.size
        ? (result.subjects || []).filter((subject: any) => editableIds.has(subject.id))
        : result.subjects || [];
      const nextMarks: Record<string, string> = {};
      for (const mark of result.marks || []) {
        if (!editableIds.size || editableIds.has(mark.subjectId)) {
          nextMarks[`${mark.studentId}:${mark.subjectId}`] = String(mark.marksObtained);
        }
      }
      setMarksByKey(nextMarks);
      setMarkSheet({ ...result, subjects });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Marks could not be loaded");
    } finally {
      setMarksLoading(false);
    }
  }, [data, selectedExamId]);

  useEffect(() => {
    loadMarks();
  }, [loadMarks]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const focusView = (view: TeacherView) => {
    setActiveView(view);
    window.requestAnimationFrame(() => {
      document.getElementById(`teacher-${view}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const saveAttendance = async () => {
    if (!attendanceClassId || attendanceRows.length === 0) return;
    setAttendanceSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: attendanceClassId,
          date: attendanceDate,
          entries: attendanceRows.map((student) => ({ studentId: student.id, status: student.status })),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Attendance could not be saved");
      toast.success(`Attendance saved for ${result.summary?.total || attendanceRows.length} students`);
      await loadAttendance();
      await loadAttendanceHistory();
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attendance could not be saved");
    } finally {
      setAttendanceSaving(false);
    }
  };

  const saveMarks = async () => {
    if (!selectedExamId || !markSheet?.subjects?.length) return;
    const entries = [];
    for (const student of markSheet.students || []) {
      for (const subject of markSheet.subjects || []) {
        const value = marksByKey[`${student.id}:${subject.id}`];
        if (value === undefined || value === "") continue;
        entries.push({ studentId: student.id, subjectId: subject.id, marksObtained: Number(value) });
      }
    }
    if (!entries.length) return toast.error("Enter at least one mark");

    setMarksSaving(true);
    try {
      const res = await fetch("/api/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExamId, entries }),
      });
      const bodyText = await res.text();
      let result;
      try {
        result = JSON.parse(bodyText);
      } catch {
        throw new Error(bodyText ? `Server error: ${bodyText.slice(0, 200)}` : `HTTP ${res.status} – empty response`);
      }
      if (!res.ok) throw new Error(result.error || "Marks could not be saved");
      toast.success(`Saved ${result.count || entries.length} mark entries`);
      await loadMarks();
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Marks could not be saved");
    } finally {
      setMarksSaving(false);
    }
  };

  const handleGenerateRemarks = async (examId?: string) => {
    const targetExamId = examId || selectedReportExamId || data?.lockedExams?.[0]?.id;
    if (!targetExamId) return toast.error("No locked exam is available");

    setRemarkBusy(true);
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: true, examId: targetExamId, language: "both", tone: "encouraging" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Remark generation failed");
      toast.success(`Generated ${result.succeeded || 0} remark drafts`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Remark generation failed");
    } finally {
      setRemarkBusy(false);
    }
  };

  const handleGenerateStudentRemarks = async (studentId: string, examId: string) => {
    setRemarkGeneratingFor(studentId);
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, examId, language: "both", tone: "encouraging" }),
      });
      const bodyText = await res.text();
      const result = JSON.parse(bodyText);
      if (!res.ok) throw new Error(result.error || "Remark generation failed");
      toast.success(`Remarks generated for student`);
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setRemarkGeneratingFor(null);
    }
  };

  const markAllAttendance = (status: AttendanceStatus) => {
    setAttendanceRows((rows) => rows.map((row) => ({ ...row, status })));
  };

  const exportMarksCSV = () => {
    if (!markSheet?.students?.length || !markSheet?.subjects?.length) {
      return toast.error("No marks data to export");
    }
    const headers = ["Student Name,Roll No," + markSheet.subjects.map((s: any) => s.name).join(",")];
    const rows = markSheet.students.map((student: any) => {
      const marks = markSheet.subjects.map((subject: any) => marksByKey[`${student.id}:${subject.id}`] || "");
      return `"${student.fullName}",${student.rollNo || ""},${marks.join(",")}`;
    });
    const csv = [...headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marks_${activeExam?.title?.replace(/\s+/g, "_") || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} student marks exported`);
  };

  const sendReportCard = async (reportId: string) => {
    setSendingReport(reportId);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", reportId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to send report card");
      toast.success("Report card sent to guardian");
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSendingReport(null);
    }
  };

  const filteredStudents = useMemo(() => {
    let list = data?.students || [];
    if (studentClassFilter !== "all") {
      list = list.filter((s: any) => s.class?.id === studentClassFilter);
    }
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      list = list.filter((s: any) =>
        s.fullName?.toLowerCase().includes(q) ||
        s.rollNo?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data?.students, studentClassFilter, studentSearch]);

  const studentsPerPage = 12;
  const totalStudentPages = Math.max(1, Math.ceil(filteredStudents.length / studentsPerPage));
  const safeStudentPage = Math.min(studentPage, totalStudentPages);
  const pagedStudents = filteredStudents.slice((safeStudentPage - 1) * studentsPerPage, safeStudentPage * studentsPerPage);

  useEffect(() => { setStudentPage(1); }, [studentClassFilter, studentSearch]);

  const handleCreateExam = async () => {
    if (!examForm.title.trim()) return toast.error("Exam title is required");
    if (!examForm.classId) return toast.error("Select a class");
    if (!examForm.term.trim()) return toast.error("Term is required");

    setCreatingExam(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: examForm.title.trim(),
          term: examForm.term.trim(),
          classId: examForm.classId,
          academicYear: new Date().getFullYear(),
          examType: examForm.examType,
          subjectId: examForm.subjectId || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Exam creation failed");
      toast.success(`"${examForm.title}" created as ${examForm.examType.replace(/_/g, " ")}`);
      setShowExamModal(false);
      setExamForm({ title: "", term: "", classId: "", subjectId: "", examType: "CLASS_TEST" });
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreatingExam(false);
    }
  };

  const loadGradeConfig = async (classId: string) => {
    if (!classId) return;
    setGradeConfigLoading(true);
    try {
      const res = await fetch(`/api/grade-config?classId=${encodeURIComponent(classId)}`);
      const bodyText = await res.text();
      let result;
      try {
        result = JSON.parse(bodyText);
      } catch {
        throw new Error("Invalid response from server");
      }
      if (res.ok) {
        const cfg = result.exists ? result.config : result.config;
        setGradeConfig({
          quizWeight: cfg.quizWeight ?? 10,
          classTestWeight: cfg.classTestWeight ?? 20,
          midTermWeight: cfg.midTermWeight ?? 30,
          finalWeight: cfg.finalWeight ?? 40,
          passingPercentage: cfg.passingPercentage ?? 50,
          gradeAplus: cfg.gradeAplus ?? 90,
          gradeA: cfg.gradeA ?? 80,
          gradeB: cfg.gradeB ?? 70,
          gradeC: cfg.gradeC ?? 60,
          gradeD: cfg.gradeD ?? 50,
        });
      }
    } catch {
      toast.error("Could not load grade configuration");
    } finally {
      setGradeConfigLoading(false);
    }
  };

  const saveGradeConfig = async () => {
    if (!selectedGradeClassId) return;
    setGradeConfigSaving(true);
    try {
      const res = await fetch("/api/grade-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedGradeClassId,
          academicYear: new Date().getFullYear(),
          ...gradeConfig,
        }),
      });
      const bodyText = await res.text();
      let result;
      try {
        result = JSON.parse(bodyText);
      } catch {
        throw new Error(bodyText ? `Server error: ${bodyText.slice(0, 200)}` : `HTTP ${res.status} – empty response`);
      }
      if (!res.ok) throw new Error(result.error || "Failed to save");
      toast.success("Grade configuration saved");
      setShowGradeConfigModal(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setGradeConfigSaving(false);
    }
  };

  const loadWeightedGrade = async (classId: string) => {
    if (!classId) return;
    setWeightedGradeLoading(true);
    setWeightedGradeResult(null);
    setReportCardsGenerated(false);
    try {
      const res = await fetch(`/api/calculated-grades?classId=${encodeURIComponent(classId)}`);
      const bodyText = await res.text();
      const result = JSON.parse(bodyText);
      if (!res.ok) throw new Error(result.error || "Calculation failed");
      setWeightedGradeResult(result.grades || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setWeightedGradeLoading(false);
    }
  };

  const handleGenerateReportCards = async () => {
    if (!selectedGradeClassId || !weightedGradeResult?.length) return;
    setGeneratingReportCards(true);
    try {
      const res = await fetch("/api/reports/generate-from-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedGradeClassId,
          academicYear: new Date().getFullYear(),
        }),
      });
      const bodyText = await res.text();
      const result = JSON.parse(bodyText);
      if (!res.ok) throw new Error(result.error || "Report card generation failed");
      toast.success(`Generated ${result.count || 0} report cards`);
      setReportCardsGenerated(true);
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setGeneratingReportCards(false);
    }
  };

  const navItems: RoleNavItem[] = [
    { icon: BookOpen, label: "Academics", active: activeView === "academics", onClick: () => focusView("academics") },
    { icon: CalendarCheck, label: "Attendance", active: activeView === "attendance", onClick: () => focusView("attendance") },
    { icon: Star, label: "Marks & Tests", active: activeView === "marks", onClick: () => focusView("marks") },
    { icon: FileText, label: "Reports", active: activeView === "reports", onClick: () => focusView("reports") },
    { icon: Zap, label: "AI Insights", active: activeView === "ai", onClick: () => focusView("ai") },
  ];
  const bottomItems: RoleNavItem[] = [
    { icon: HelpCircle, label: "Support", onClick: () => toast.info("Teacher support is available from this role workspace.") },
    { icon: LogOut, label: "Logout", onClick: handleLogout },
  ];
  const teacherAIFeatures = [
    { feature: "weak_topics", label: "Weak Topics", placeholder: "Subject or exam context" },
    { feature: "homework_suggestions", label: "Homework", placeholder: "Student group or weak area" },
    { feature: "lesson_plan", label: "Lesson Plan", field: "topic" as const, placeholder: "Topic, class, duration" },
    { feature: "rewrite_remark", label: "Rewrite Remark", placeholder: "Paste remark draft" },
    { feature: "translate_remark", label: "Translate", placeholder: "Paste remark text" },
  ];

  if (loading && !data) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4">
        <Loader2 className="h-12 w-12 text-[#8127cf] animate-spin" />
        <p className="text-sm font-black text-[#1f1a23] uppercase tracking-normal text-center">Syncing Teacher Console...</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <RoleShell
      navItems={navItems}
      bottomItems={bottomItems}
      eyebrow="Teacher Academic Workspace"
      userName={data.teacherName}
      userRole="Teacher Console"
      avatarSeed={data.teacherName}
      dashboardHref="/teacher"
    >
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
        <div className="p-7 px-9 border-b border-[#f3f4f9] bg-white z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase text-[#8127cf] tracking-normal mb-2">
              {classHubs.length ? `${classHubs.length} class hubs assigned` : "No class assignment yet"}
            </p>
            <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal">Teacher Dashboard</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-[#4d4354]/60 leading-relaxed">
              Attendance, marks, test cycles, report cards, remarks, subjects, and AI assistance in one workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BrandButton variant="soft" icon={<History className="w-4 h-4" />} onClick={() => focusView("reports")}>
              Report History
            </BrandButton>
            <BrandButton variant="soft" icon={<Star className="w-4 h-4" />} onClick={() => setShowExamModal(true)}>
              Create Assessment
            </BrandButton>
            <BrandButton variant="soft" icon={<FileText className="w-4 h-4" />} onClick={() => {
              if (classHubs[0]) setSelectedGradeClassId(classHubs[0].id);
              setShowGradeConfigModal(true);
            }}>
              Grade Config
            </BrandButton>
            <BrandButton variant="dark" icon={<BarChart3 className="w-4 h-4" />} onClick={() => {
              if (classHubs[0]) setSelectedGradeClassId(classHubs[0].id);
              setShowGradeOverviewModal(true);
            }}>
              Final Grades
            </BrandButton>
            <BrandButton variant="dark" icon={<Send className="w-4 h-4" />} onClick={() => focusView("marks")}>
              Enter Marks
            </BrandButton>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-5 mb-8">
            <StatCard icon={BookOpen} label="Subjects" value={teacherSubjects.length} onClick={() => focusView("academics")} />
            <StatCard icon={GraduationCap} label="Classes" value={classHubs.length} tone="rose" onClick={() => focusView("academics")} />
            <StatCard icon={Users} label="Students" value={data.totalStudents} tone="green" onClick={() => focusView("attendance")} />
            <StatCard icon={ClipboardList} label="Active Tests" value={data.activeExams?.length || 0} tone="purple" onClick={() => focusView("marks")} />
            <StatCard icon={AlertCircle} label="Missing Marks" value={missingMarksTotal} tone="rose" onClick={() => focusView("marks")} />
            <StatCard icon={CalendarCheck} label="Unmarked Today" value={attendanceStats.unmarked} tone="dark" onClick={() => focusView("attendance")} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8">
            <div className="space-y-8">
              <section id="teacher-academics" className="scroll-mt-6">
                <CollapsiblePanel icon={BookOpen} title="Classes & Subjects" subtitle={`${classHubs.length} Hubs`} defaultOpen>
                  {classHubs.length ? (
                    <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {classHubs.map((cls: any) => (
                        <ClassHubCard
                          key={cls.id}
                          cls={cls}
                          students={data.students.filter((student: any) => student.class?.id === cls.id)}
                          onViewStudent={setSelectedStudent}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={BookOpen}
                      title="No academic hub assigned"
                      description="Classes appear here when you are the class teacher or when a subject is assigned to you."
                    />
                  )}

                  <div className="mt-6 border-t border-[#cfc2d6]/10 pt-6">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1 max-w-xs">
                          <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Search Students</span>
                          <div className="flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 h-12 w-full">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#4d4354]/40">
                              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                            </svg>
                            <input
                              type="text" placeholder="Search by name or roll no..." value={studentSearch}
                              onChange={(e) => setStudentSearch(e.target.value)}
                              className="ml-2 h-full w-full bg-transparent border-none outline-none text-sm font-bold placeholder:text-[#4d4354]/35"
                            />
                          </div>
                        </div>
                        <div className="w-full sm:w-44">
                          <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Class Filter</span>
                          <select
                            value={studentClassFilter}
                            onChange={(e) => setStudentClassFilter(e.target.value)}
                            className="h-12 w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white"
                          >
                            <option value="all">All classes</option>
                            {classHubs.map((cls: any) => (
                              <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold text-[#4d4354]/40">{filteredStudents.length} students</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {pagedStudents.map((student: any) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => setSelectedStudent(student)}
                          className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[#fbf0fe]/55 px-4 py-3 text-left transition-all hover:bg-white hover:shadow-md"
                        >
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-white shadow-sm">
                            <img
                              src={student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
                            <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                              Roll {student.rollNo || "N/A"} - {classLabel(student.class)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="rounded-full bg-white px-2.5 py-0.5 text-[8px] font-black text-[#8127cf]">
                              {student.marks?.length || 0} marks
                            </span>
                          </div>
                        </button>
                      ))}
                      {pagedStudents.length === 0 ? <EmptyInline text="No students match your search and filters." /> : null}
                    </div>
                    {totalStudentPages > 1 ? (
                      <div className="mt-4 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                          disabled={safeStudentPage <= 1}
                          className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Previous
                        </button>
                        <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/50">
                          Page {safeStudentPage} of {totalStudentPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStudentPage((p) => Math.min(totalStudentPages, p + 1))}
                          disabled={safeStudentPage >= totalStudentPages}
                          className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    ) : null}
                  </div>
                </CollapsiblePanel>
              </section>

              <section id="teacher-attendance" className="scroll-mt-6">
                <CollapsiblePanel icon={CalendarCheck} title="Daily Attendance" subtitle={selectedAttendanceClass ? classLabel(selectedAttendanceClass) : "No class"} defaultOpen>
                  {isEditingAttendance && (
                    <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#fbf0fe] px-4 py-2.5">
                      <History className="h-4 w-4 text-[#8127cf]" />
                      <p className="text-xs font-black text-[#8127cf]">Editing past attendance</p>
                      <span className="text-[9px] font-bold text-[#4d4354]/50">— {attendanceDate}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[460px]">
                      <label className="block">
                        <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Class</span>
                        <Select value={attendanceClassId} onChange={(event) => setAttendanceClassId(event.target.value)}>
                          {classHubs.map((cls: any) => (
                            <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
                          ))}
                          {!classHubs.length ? <option value="">No classes</option> : null}
                        </Select>
                      </label>
                      <label className="block">
                        <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Date</span>
                        <input
                          type="date"
                          value={attendanceDate}
                          onChange={(event) => setAttendanceDate(event.target.value)}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
                    <MiniMetric label="Total" value={attendanceStats.total} />
                    <MiniMetric label="Present" value={attendanceStats.present} active />
                    <MiniMetric label="Absent" value={attendanceStats.absent} danger />
                    <MiniMetric label="Leave" value={attendanceStats.leave} />
                    <MiniMetric label="Unmarked" value={attendanceStats.unmarked} />
                  </div>

                  {attendanceRows.length > 0 && [
                    { label: "All Present", status: "PRESENT" as AttendanceStatus, cls: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
                    { label: "All Absent", status: "ABSENT" as AttendanceStatus, cls: "bg-rose-50 text-rose-600 hover:bg-rose-100" },
                    { label: "All Leave", status: "LEAVE" as AttendanceStatus, cls: "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e0f8]" },
                  ].map(({ label, status, cls: btnCls }) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => markAllAttendance(status)}
                      className={`mt-3 mr-2 inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-3 text-[8px] font-black uppercase tracking-normal transition-all ${btnCls}`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {label}
                    </button>
                  ))}

                  <div className="mt-5 overflow-hidden rounded-[26px] border border-[#f3f4f9]">
                    {attendanceLoading ? (
                      <LoadingBlock label="Loading attendance..." />
                    ) : attendanceRows.length ? (
                      <div className="divide-y divide-[#f3f4f9]">
                        {attendanceRows.map((student) => (
                          <div key={student.id} className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[1fr_180px] sm:items-center">
                            <StudentMini student={student} />
                            <Select
                              value={student.status}
                              onChange={(event) =>
                                setAttendanceRows((rows) =>
                                  rows.map((row) => (row.id === student.id ? { ...row, status: event.target.value as AttendanceStatus } : row))
                                )
                              }
                            >
                              <option value="PRESENT">Present</option>
                              <option value="ABSENT">Absent</option>
                              <option value="LEAVE">Leave</option>
                            </Select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyInline text="No students are available for this attendance roster." />
                    )}
                  </div>

                  <div className="mt-5 flex justify-end">
                    <BrandButton
                      variant="dark"
                      icon={attendanceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
                      onClick={saveAttendance}
                      disabled={attendanceSaving || !attendanceRows.length}
                    >
                      {attendanceSaving ? "Saving" : isEditingAttendance ? "Update Attendance" : "Save Attendance"}
                    </BrandButton>
                  </div>

                  {attendanceHistory.length > 0 && (
                    <div className="mt-6">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Recent Attendance</p>
                        {attendanceHistoryLoading && <Loader2 className="h-3 w-3 animate-spin text-[#8127cf]" />}
                      </div>
                      <div className="overflow-hidden rounded-[26px] border border-[#f3f4f9]">
                        <div className="divide-y divide-[#f3f4f9]">
                          {attendanceHistory.slice(0, 10).map((entry) => {
                            const isSelected = entry.date === attendanceDate;
                            return (
                              <button
                                key={entry.date}
                                type="button"
                                onClick={() => setAttendanceDate(entry.date)}
                                className={`w-full cursor-pointer px-5 py-3 text-left transition-all hover:bg-[#fbf0fe]/50 ${isSelected ? "bg-[#fbf0fe]" : ""}`}
                              >
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isSelected ? "bg-[#8127cf] text-white" : "bg-[#fbf0fe] text-[#8127cf]"}`}>
                                      <CalendarCheck className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-[#1f1a23]">{entry.date}</p>
                                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/40">
                                        {entry.marked ? "Complete" : `${entry.unmarked} unmarked`}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[8px] font-black text-emerald-600">{entry.present}P</span>
                                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[8px] font-black text-rose-600">{entry.absent}A</span>
                                    <span className="rounded-full bg-[#fbf0fe] px-2.5 py-0.5 text-[8px] font-black text-[#8127cf]">{entry.leave}L</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </CollapsiblePanel>
              </section>

              <section id="teacher-marks" className="scroll-mt-6">
                <CollapsiblePanel icon={Star} title="Tests, Exams & Marks" subtitle={`${data.exams?.length || 0} Cycles`} defaultOpen>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="w-full lg:w-[360px]">
                      <Select value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
                        {(data.exams || []).map((exam: any) => (
                          <option key={exam.id} value={exam.id}>
                            {exam.title}{exam.subject ? ` (${exam.subject.name})` : ""} - {classLabel(exam.class)}
                          </option>
                        ))}
                        {!data.exams?.length ? <option value="">No exams</option> : null}
                      </Select>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(data.exams || []).slice(0, 6).map((exam: any) => (
                      <button
                        type="button"
                        key={exam.id}
                        onClick={() => setSelectedExamId(exam.id)}
                        className={`cursor-pointer rounded-[24px] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                          selectedExamId === exam.id ? "border-[#8127cf]/30 bg-[#fbf0fe]" : "border-[#cfc2d6]/10 bg-[#fbf0fe]/35"
                        }`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[#1f1a23]">{exam.title}</p>
                            <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{exam.subject ? `${exam.subject.name} · ` : ""}{classLabel(exam.class)}</p>
                          </div>
                          <StatusPill status={exam.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <MiniMetric label="Entered" value={exam.enteredMarks || 0} active />
                          <MiniMetric label="Missing" value={exam.missingMarks || 0} danger={exam.missingMarks > 0} />
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 overflow-auto rounded-[26px] border border-[#f3f4f9]">
                    {marksLoading ? (
                      <LoadingBlock label="Loading marks..." />
                    ) : markSheet?.subjects?.length && markSheet?.students?.length ? (
                      <table className="w-full min-w-[720px] text-left">
                        <thead>
                          <tr className="bg-[#f3f4f9]/45 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
                            <th className="px-5 py-4">Student</th>
                            {markSheet.subjects.map((subject: any) => (
                              <th key={subject.id} className="px-4 py-4 text-center">{subject.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f3f4f9]">
                          {markSheet.students.map((student: any) => (
                            <tr key={student.id}>
                              <td className="px-5 py-4">
                                <StudentMini student={student} />
                              </td>
                              {markSheet.subjects.map((subject: any) => {
                                const key = `${student.id}:${subject.id}`;
                                return (
                                  <td key={subject.id} className="px-4 py-4">
                                    <input
                                      type="number"
                                      min={0}
                                      max={subject.totalMarks || 100}
                                      value={marksByKey[key] || ""}
                                      disabled={activeExam?.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(activeExam?.status || "")}
                                      onChange={(event) => setMarksByKey((current) => ({ ...current, [key]: event.target.value }))}
                                      className="h-11 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/45 px-3 text-center text-sm font-black outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white disabled:opacity-50"
                                    />
                                    <p className="mt-1 text-center text-[8px] font-bold uppercase tracking-normal text-[#4d4354]/35">
                                      / {subject.totalMarks || 100}
                                    </p>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <EmptyInline text="No editable subjects are available for this exam. Assign subjects to this teacher first." />
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-bold text-[#4d4354]/50">
                      {activeExam ? `${activeExam.enteredMarks || 0}/${activeExam.expectedMarks || 0} marks entered for your assigned subjects.` : "Select an exam to enter marks."}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {markSheet?.students?.length ? (
                        <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={exportMarksCSV}>
                          Export CSV
                        </BrandButton>
                      ) : null}
                      <BrandButton
                        variant="dark"
                        icon={marksSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        onClick={saveMarks}
                        disabled={marksSaving || !markSheet?.subjects?.length || activeExam?.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(activeExam?.status || "")}
                      >
                        {marksSaving ? "Saving" : "Save Marks"}
                      </BrandButton>
                    </div>
                  </div>
                </CollapsiblePanel>
              </section>

              <section id="teacher-reports" className="scroll-mt-6">
                <CollapsiblePanel icon={FileText} title="Report Cards & Remarks" subtitle={`${data.recentReportCards?.length || 0} Recent`} defaultOpen>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Select value={selectedReportExamId} onChange={(event) => setSelectedReportExamId(event.target.value)}>
                        {(data.lockedExams || []).map((exam: any) => (
                          <option key={exam.id} value={exam.id}>{exam.title} - {classLabel(exam.class)}</option>
                        ))}
                        {!data.lockedExams?.length ? <option value="">No locked exams</option> : null}
                      </Select>
                      <BrandButton
                        variant="soft"
                        icon={remarkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                        onClick={() => handleGenerateRemarks()}
                        disabled={remarkBusy || !selectedReportExamId}
                      >
                        Draft Remarks
                      </BrandButton>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {(data.lockedExams || []).slice(0, 6).map((exam: any) => (
                      <div key={exam.id} className="rounded-[24px] bg-[#fbf0fe]/45 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[#1f1a23]">{exam.title}</p>
                            <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                              {classLabel(exam.class)} - {exam.reportCards || 0} cards
                            </p>
                          </div>
                          <StatusPill status={exam.status} />
                        </div>
                      </div>
                    ))}
                    {!data.lockedExams?.length ? <EmptyInline text="Locked exams will appear here for remarks and report-card work." /> : null}
                  </div>

                  <div className="mt-6 space-y-3">
                    {(data.recentReportCards || []).slice(0, 8).map((report: any) => (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() => setSelectedReportCard(report)}
                        className="flex w-full cursor-pointer flex-col gap-3 rounded-[22px] bg-[#fbf0fe]/45 p-4 text-left transition-all hover:bg-[#f0e0f8] hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#1f1a23]">{report.student?.fullName || "Student"}</p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                            {report.exam?.title || "Report"} - {classLabel(report.student?.class)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-[#8127cf]">
                            {Math.round(report.percentage || 0)}%
                          </span>
                          <StatusPill status={report.status} />
                        </div>
                      </button>
                    ))}
                    {!data.recentReportCards?.length ? <EmptyInline text="Report cards will appear after exams are processed." /> : null}
                  </div>
                </CollapsiblePanel>
              </section>

              <section id="teacher-marks" className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg scroll-mt-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <PanelHeader icon={Star} title="Tests, Exams & Marks" status={`${data.exams?.length || 0} Cycles`} />
                  <div className="w-full lg:w-[360px]">
                    <Select value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
                      {(data.exams || []).map((exam: any) => (
                        <option key={exam.id} value={exam.id}>
                          {exam.title}{exam.subject ? ` (${exam.subject.name})` : ""} - {classLabel(exam.class)}
                        </option>
                      ))}
                      {!data.exams?.length ? <option value="">No exams</option> : null}
                    </Select>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(data.exams || []).slice(0, 6).map((exam: any) => (
                    <button
                      type="button"
                      key={exam.id}
                      onClick={() => setSelectedExamId(exam.id)}
                      className={`cursor-pointer rounded-[24px] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                        selectedExamId === exam.id ? "border-[#8127cf]/30 bg-[#fbf0fe]" : "border-[#cfc2d6]/10 bg-[#fbf0fe]/35"
                      }`}
                    >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[#1f1a23]">{exam.title}</p>
                            <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{exam.subject ? `${exam.subject.name} · ` : ""}{classLabel(exam.class)}</p>
                          </div>
                          <StatusPill status={exam.status} />
                        </div>
                      <div className="grid grid-cols-2 gap-2">
                        <MiniMetric label="Entered" value={exam.enteredMarks || 0} active />
                        <MiniMetric label="Missing" value={exam.missingMarks || 0} danger={exam.missingMarks > 0} />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-6 overflow-auto rounded-[26px] border border-[#f3f4f9]">
                  {marksLoading ? (
                    <LoadingBlock label="Loading marks..." />
                  ) : markSheet?.subjects?.length && markSheet?.students?.length ? (
                    <table className="w-full min-w-[720px] text-left">
                      <thead>
                        <tr className="bg-[#f3f4f9]/45 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
                          <th className="px-5 py-4">Student</th>
                          {markSheet.subjects.map((subject: any) => (
                            <th key={subject.id} className="px-4 py-4 text-center">{subject.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f3f4f9]">
                        {markSheet.students.map((student: any) => (
                          <tr key={student.id}>
                            <td className="px-5 py-4">
                              <StudentMini student={student} />
                            </td>
                            {markSheet.subjects.map((subject: any) => {
                              const key = `${student.id}:${subject.id}`;
                              return (
                                <td key={subject.id} className="px-4 py-4">
                                  <input
                                    type="number"
                                    min={0}
                                    max={subject.totalMarks || 100}
                                    value={marksByKey[key] || ""}
                                    disabled={activeExam?.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(activeExam?.status || "")}
                                    onChange={(event) => setMarksByKey((current) => ({ ...current, [key]: event.target.value }))}
                                    className="h-11 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/45 px-3 text-center text-sm font-black outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white disabled:opacity-50"
                                  />
                                  <p className="mt-1 text-center text-[8px] font-bold uppercase tracking-normal text-[#4d4354]/35">
                                    / {subject.totalMarks || 100}
                                  </p>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyInline text="No editable subjects are available for this exam. Assign subjects to this teacher first." />
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-bold text-[#4d4354]/50">
                    {activeExam ? `${activeExam.enteredMarks || 0}/${activeExam.expectedMarks || 0} marks entered for your assigned subjects.` : "Select an exam to enter marks."}
                  </p>
                  <BrandButton
                    variant="dark"
                    icon={marksSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    onClick={saveMarks}
                    disabled={marksSaving || !markSheet?.subjects?.length || activeExam?.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(activeExam?.status || "")}
                  >
                    {marksSaving ? "Saving" : "Save Marks"}
                  </BrandButton>
                </div>
              </section>

              <section id="teacher-reports" className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg scroll-mt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <PanelHeader icon={FileText} title="Report Cards & Remarks" status={`${data.recentReportCards?.length || 0} Recent`} />
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Select value={selectedReportExamId} onChange={(event) => setSelectedReportExamId(event.target.value)}>
                      {(data.lockedExams || []).map((exam: any) => (
                        <option key={exam.id} value={exam.id}>{exam.title} - {classLabel(exam.class)}</option>
                      ))}
                      {!data.lockedExams?.length ? <option value="">No locked exams</option> : null}
                    </Select>
                    <BrandButton
                      variant="soft"
                      icon={remarkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                      onClick={() => handleGenerateRemarks()}
                      disabled={remarkBusy || !selectedReportExamId}
                    >
                      Draft Remarks
                    </BrandButton>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(data.lockedExams || []).slice(0, 6).map((exam: any) => (
                    <div key={exam.id} className="rounded-[24px] bg-[#fbf0fe]/45 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#1f1a23]">{exam.title}</p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                            {classLabel(exam.class)} - {exam.reportCards || 0} cards
                          </p>
                        </div>
                        <StatusPill status={exam.status} />
                      </div>
                    </div>
                  ))}
                  {!data.lockedExams?.length ? <EmptyInline text="Locked exams will appear here for remarks and report-card work." /> : null}
                </div>

                <div className="mt-6 space-y-3">
                  {(data.recentReportCards || []).slice(0, 8).map((report: any) => (
                    <div key={report.id} className="flex flex-col gap-3 rounded-[22px] bg-[#fbf0fe]/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#1f1a23]">{report.student?.fullName || "Student"}</p>
                        <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                          {report.exam?.title || "Report"} - {classLabel(report.student?.class)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-[#8127cf]">
                          {Math.round(report.percentage || 0)}%
                        </span>
                        <StatusPill status={report.status} />
                      </div>
                    </div>
                  ))}
                  {!data.recentReportCards?.length ? <EmptyInline text="Report cards will appear after exams are processed." /> : null}
                </div>
              </section>
            </div>

            <aside id="teacher-ai" className="space-y-6 scroll-mt-6">
              <div className="bg-[#1f1a23] p-6 rounded-[32px] text-white relative overflow-hidden">
                <p className="text-[10px] font-black uppercase tracking-normal text-white/50 mb-2">Academic Capacity</p>
                <h4 className="text-4xl font-black mb-1">{data.totalStudents}</h4>
                <p className="text-[9px] font-bold text-white/40 uppercase tracking-normal">Students in assigned classes</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <SideMetric label="Present" value={attendanceStats.present} />
                  <SideMetric label="Reports" value={data.recentReportCards?.length || 0} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-[32px] border border-[#cfc2d6]/10 shadow-lg">
                <div className="flex items-start gap-4 mb-6">
                  <div className="h-10 w-10 bg-[#fbf0fe] rounded-2xl flex items-center justify-center text-[#8127cf]">
                    <BrainCircuit className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black tracking-normal leading-none mb-1">AI Engine</h4>
                    <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-normal">Teacher assistant</p>
                  </div>
                </div>
                <AiActionPanel
                  title="Teacher AI"
                  options={teacherAIFeatures}
                  campusId={aiCampusId}
                  compact
                  onComplete={loadData}
                  className="mb-6"
                />
                {data.aiInsights?.length ? (
                  <div className="space-y-3">
                    {data.aiInsights.map((insight: any) => (
                      <div key={insight.id} className="p-4 rounded-2xl bg-[#fbf0fe]/50 border border-[#8127cf]/10">
                        <p className="text-[9px] font-black text-[#8127cf] uppercase tracking-normal mb-1">
                          {insight.feature.replaceAll("_", " ")}
                        </p>
                        <p className="text-[11px] font-semibold leading-relaxed text-[#1f1a23] line-clamp-3">
                          {insight.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="p-4 rounded-2xl bg-[#fbf0fe]/50 border border-[#8127cf]/10 text-[11px] font-medium leading-relaxed italic text-[#1f1a23]">
                    AI drafts for remarks, weak topics, homework, and lesson planning will appear here.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {selectedStudent ? (
        <StudentDetailModal
          student={selectedStudent}
          exams={data.exams || []}
          onClose={() => setSelectedStudent(null)}
        />
      ) : null}

      {selectedReportCard ? (
        <ReportCardDetailModal
          report={selectedReportCard}
          busy={sendingReport === selectedReportCard.id}
          remarkBusy={remarkGeneratingFor}
          onClose={() => setSelectedReportCard(null)}
          onSend={() => sendReportCard(selectedReportCard.id)}
          onGenerateRemarks={(studentId, examId) => handleGenerateStudentRemarks(studentId, examId)}
        />
      ) : null}

      {showExamModal ? (
        <ModalFrame title="Create Assessment" eyebrow="Exam / Test setup" onClose={() => setShowExamModal(false)}>
          <div className="space-y-4">
            <FormInput
              label="Assessment Title"
              value={examForm.title}
              placeholder="e.g. Week 3 Quiz, First Mid Term"
              onChange={(value) => setExamForm((f) => ({ ...f, title: value }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormSelect
                label="Type"
                value={examForm.examType}
                onChange={(value) => setExamForm((f) => ({ ...f, examType: value }))}
              >
                <option value="CLASS_TEST">Class Test</option>
                <option value="QUIZ">Quiz</option>
                <option value="MID_TERM">Mid Term</option>
                <option value="FINAL">Final Exam</option>
                <option value="CUSTOM">Custom</option>
              </FormSelect>
              <FormSelect
                label="Class"
                value={examForm.classId}
                onChange={(value) => setExamForm((f) => ({ ...f, classId: value }))}
              >
                <option value="">Select class</option>
                {classHubs.map((cls: any) => (
                  <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
                ))}
              </FormSelect>
            </div>
            <FormInput
              label="Term"
              value={examForm.term}
              placeholder="e.g. First Term, Annual"
              onChange={(value) => setExamForm((f) => ({ ...f, term: value }))}
            />
            <FormSelect
              label="Subject (optional)"
              value={examForm.subjectId}
              onChange={(value) => setExamForm((f) => ({ ...f, subjectId: value }))}
            >
              <option value="">All Subjects</option>
              {classHubs
                .find((c: any) => c.id === examForm.classId)
                ?.subjects?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </FormSelect>
          </div>
          <ModalActions
            busy={creatingExam}
            busyLabel="Creating..."
            actionLabel="Create Assessment"
            onClose={() => setShowExamModal(false)}
            onSave={handleCreateExam}
          />
        </ModalFrame>
      ) : null}

      {showGradeConfigModal ? (
        <ModalFrame title="Grade Weight Configuration" eyebrow="Final grade calculation" onClose={() => setShowGradeConfigModal(false)} wide>
          <div className="mb-4">
            <FormSelect label="Class" value={selectedGradeClassId} onChange={(value) => { setSelectedGradeClassId(value); loadGradeConfig(value); }}>
              <option value="">Select class</option>
              {classHubs.map((cls: any) => (
                <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
              ))}
            </FormSelect>
          </div>
          {gradeConfigLoading ? (
            <LoadingBlock label="Loading config..." />
          ) : selectedGradeClassId ? (
            <div className="space-y-5">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Exam Type Weights (must total 100%)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ConfigField label="Quiz Weight (%)" value={gradeConfig.quizWeight} onChange={(v) => setGradeConfig((f) => ({ ...f, quizWeight: v }))} />
                <ConfigField label="Class Test Weight (%)" value={gradeConfig.classTestWeight} onChange={(v) => setGradeConfig((f) => ({ ...f, classTestWeight: v }))} />
                <ConfigField label="Mid Term Weight (%)" value={gradeConfig.midTermWeight} onChange={(v) => setGradeConfig((f) => ({ ...f, midTermWeight: v }))} />
                <ConfigField label="Final Exam Weight (%)" value={gradeConfig.finalWeight} onChange={(v) => setGradeConfig((f) => ({ ...f, finalWeight: v }))} />
              </div>
              <div className="rounded-2xl bg-[#fbf0fe]/60 p-4">
                <p className="text-[10px] font-bold">Total: {Object.entries(gradeConfig).filter(([k]) => k.endsWith("Weight")).reduce((s, [, v]) => s + (v as number), 0)}%</p>
              </div>
              <div className="border-t border-[#cfc2d6]/10 pt-5">
                <p className="mb-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Grade Thresholds</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ConfigField label="A+ ≥" value={gradeConfig.gradeAplus} onChange={(v) => setGradeConfig((f) => ({ ...f, gradeAplus: v }))} />
                  <ConfigField label="A ≥" value={gradeConfig.gradeA} onChange={(v) => setGradeConfig((f) => ({ ...f, gradeA: v }))} />
                  <ConfigField label="B ≥" value={gradeConfig.gradeB} onChange={(v) => setGradeConfig((f) => ({ ...f, gradeB: v }))} />
                  <ConfigField label="C ≥" value={gradeConfig.gradeC} onChange={(v) => setGradeConfig((f) => ({ ...f, gradeC: v }))} />
                  <ConfigField label="D ≥" value={gradeConfig.gradeD} onChange={(v) => setGradeConfig((f) => ({ ...f, gradeD: v }))} />
                  <ConfigField label="Pass % ≥" value={gradeConfig.passingPercentage} onChange={(v) => setGradeConfig((f) => ({ ...f, passingPercentage: v }))} />
                </div>
              </div>
            </div>
          ) : (
            <EmptyInline text="Select a class to configure grade weights." />
          )}
          <ModalActions
            busy={gradeConfigSaving}
            busyLabel="Saving..."
            actionLabel="Save Grade Configuration"
            onClose={() => setShowGradeConfigModal(false)}
            onSave={saveGradeConfig}
          />
        </ModalFrame>
      ) : null}

      {showGradeOverviewModal ? (
        <ModalFrame title="Final Grades" eyebrow="Weighted grade calculation" onClose={() => setShowGradeOverviewModal(false)} wide>
          <div className="mb-4">
            <FormSelect
              label="Class"
              value={selectedGradeClassId}
              onChange={(value) => { setSelectedGradeClassId(value); loadWeightedGrade(value); }}
            >
              <option value="">Select class</option>
              {classHubs.map((cls: any) => (
                <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
              ))}
            </FormSelect>
          </div>

          {!weightedGradeResult && !weightedGradeLoading && selectedGradeClassId ? (
            <div className="mb-4">
              <BrandButton variant="dark" icon={<BarChart3 className="w-4 h-4" />} onClick={() => loadWeightedGrade(selectedGradeClassId)}>
                Generate Final Grades
              </BrandButton>
            </div>
          ) : null}

          {weightedGradeLoading ? (
            <LoadingBlock label="Calculating grades..." />
          ) : weightedGradeResult?.length ? (
            <>
              <div className="overflow-auto rounded-[26px] border border-[#f3f4f9]">
                <table className="w-full min-w-[600px] text-left">
                  <thead>
                    <tr className="bg-[#f3f4f9]/45 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
                      <th className="px-5 py-4">Rank</th>
                      <th className="px-5 py-4">Student</th>
                      <th className="px-4 py-4 text-center">Roll No</th>
                      <th className="px-4 py-4 text-center">Percentage</th>
                      <th className="px-4 py-4 text-center">Grade</th>
                      <th className="px-4 py-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f3f4f9]">
                    {weightedGradeResult.map((grade: any, i: number) => (
                      <tr key={grade.studentId} className="hover:bg-[#fbf0fe]/30 cursor-pointer transition-colors" onClick={async () => {
                        const cls = classHubs.find((c: any) => c.id === selectedGradeClassId);
                        // Fetch the actual report card to get exam.id for remarks generation
                        try {
                          const rcRes = await fetch(`/api/reports/generate-from-grades?studentId=${grade.studentId}&classId=${selectedGradeClassId}&academicYear=${new Date().getFullYear()}`);
                          const rcBody = await rcRes.text();
                          const rcResult = JSON.parse(rcBody);
                          const reportCard = rcResult.reportCard || null;
                          setSelectedReportCard({
                            ...grade,
                            student: {
                              id: grade.studentId,
                              fullName: grade.studentName,
                              rollNo: grade.rollNo || "",
                              class: cls || {},
                              profileImageUrl: "",
                            },
                            exam: reportCard?.exam || { title: "Final Grade", term: `Academic Year ${new Date().getFullYear()}` },
                            status: "PUBLISHED",
                            marks: reportCard?.subjectBreakdown?.map((sb: any) => ({
                              subjectId: sb.subjectId,
                              subject: { name: sb.subjectName, totalMarks: sb.totalMarks },
                              marksObtained: sb.obtainedMarks,
                            })) || [],
                            totalMarks: grade.subjectBreakdown?.reduce((s: number, sb: any) => s + sb.totalMarks, 0) || 0,
                            obtainedMarks: grade.subjectBreakdown?.reduce((s: number, sb: any) => s + sb.obtainedMarks, 0) || 0,
                            percentage: grade.overallPercentage,
                            grade: grade.overallGrade,
                            passed: grade.passed,
                            remarksEn: reportCard?.remarksEn || null,
                            remarksUr: reportCard?.remarksUr || null,
                          });
                        } catch {
                          setSelectedReportCard({
                            ...grade,
                            student: { id: grade.studentId, fullName: grade.studentName, rollNo: grade.rollNo || "", class: cls || {} },
                            exam: { title: "Final Grade", term: `Academic Year ${new Date().getFullYear()}` },
                            status: "PUBLISHED",
                            percentage: grade.overallPercentage,
                            grade: grade.overallGrade,
                            passed: grade.passed,
                          });
                        }
                      }}>
                        <td className="px-5 py-4">
                          <span className="text-sm font-black text-[#4d4354]/60">#{grade.rank || i + 1}</span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-black text-[#1f1a23]">{grade.studentName}</p>
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-bold text-[#4d4354]/60">{grade.rollNo || "—"}</td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-lg font-black text-[#8127cf]">{grade.overallPercentage}%</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="rounded-full bg-white px-3 py-1 text-[9px] font-black uppercase tracking-normal text-[#1f1a23]">{grade.overallGrade}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${grade.passed ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                            {grade.passed ? "PASS" : "FAIL"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold text-[#4d4354]/50">{weightedGradeResult.length} students</p>
                <div className="flex flex-wrap gap-3">
                  <BrandButton
                    variant="dark"
                    icon={generatingReportCards ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    onClick={handleGenerateReportCards}
                    disabled={generatingReportCards || reportCardsGenerated}
                  >
                    {generatingReportCards ? "Generating..." : reportCardsGenerated ? "Report Cards Generated" : "Generate Report Cards"}
                  </BrandButton>
                  <BrandButton
                    variant="dark"
                    icon={<Download className="w-4 h-4" />}
                    onClick={() => window.print()}
                  >
                    Print / Download PDF
                  </BrandButton>
                </div>
              </div>
            </>
          ) : selectedGradeClassId ? (
            <div className="space-y-4">
              <EmptyInline text="Click 'Generate Final Grades' to calculate weighted grades from locked exams." />
              <BrandButton variant="dark" icon={<BarChart3 className="w-4 h-4" />} onClick={() => loadWeightedGrade(selectedGradeClassId)}>
                Generate Final Grades
              </BrandButton>
            </div>
          ) : (
            <EmptyInline text="Select a class to view final grades." />
          )}
        </ModalFrame>
      ) : null}
    </RoleShell>
  );
}

function PanelHeader({ icon: Icon, title, status }: { icon: any; title: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-black text-[#1f1a23]">{title}</h3>
      </div>
      <StatusPill status={status} />
    </div>
  );
}

function ClassHubCard({ cls, students, onViewStudent }: { cls: any; students: any[]; onViewStudent?: (student: any) => void }) {
  const [showStudents, setShowStudents] = useState(false);
  return (
    <div className="rounded-[30px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">{cls.role || "Teacher"}</p>
          <h3 className="mt-1 truncate text-xl font-black text-[#1f1a23]">{classLabel(cls)}</h3>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
            Academic year {cls.academicYear || "N/A"}
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
          <GraduationCap className="h-6 w-6" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MiniMetric label="Students" value={students.length || cls._count?.students || 0} active />
        <MiniMetric label="Subjects" value={cls.subjects?.length || cls._count?.subjects || 0} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {(cls.subjects || []).slice(0, 6).map((subject: any) => (
          <span key={subject.id} className="rounded-full bg-[#fbf0fe] px-3 py-1 text-[8px] font-black uppercase tracking-normal text-[#8127cf]">
            {subject.name}
          </span>
        ))}
        {!cls.subjects?.length ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-[8px] font-black uppercase tracking-normal text-amber-600">
            No subjects
          </span>
        ) : null}
      </div>
      {students.length > 0 ? (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowStudents(!showStudents)}
            className="flex w-full cursor-pointer items-center justify-between rounded-2xl bg-[#fbf0fe]/50 px-4 py-2.5 text-left transition-all hover:bg-[#fbf0fe]"
          >
            <span className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">
              {students.length} Student{students.length !== 1 ? "s" : ""}
            </span>
            <span className="text-[8px] font-bold text-[#4d4354]/40">{showStudents ? "Hide" : "View"}</span>
          </button>
          {showStudents ? (
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto custom-scrollbar">
              {students.slice(0, 20).map((student: any) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => onViewStudent?.(student)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-3 py-2 text-left text-xs font-bold text-[#1f1a23] transition-all hover:bg-white hover:shadow-sm"
                >
                  <span className="text-[9px] font-black text-[#4d4354]/40">{student.rollNo || "#"}</span>
                  <span className="truncate">{student.fullName}</span>
                </button>
              ))}
              {students.length > 20 ? (
                <p className="px-3 py-1 text-[9px] font-bold text-[#4d4354]/40">+{students.length - 20} more</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StudentMini({ student }: { student: any }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-slate-50 shadow-sm">
        <img
          src={student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
          {student.rollNo || "No roll"} {student.class ? `- ${classLabel(student.class)}` : ""}
        </p>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, active, danger }: { label: string; value: any; active?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/70 px-3 py-3">
      <p className="text-[7px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p>
      <p className={`mt-1 truncate text-base font-black ${danger ? "text-rose-600" : active ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{value}</p>
    </div>
  );
}

function SideMetric({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-3">
      <p className="text-[7px] font-black uppercase tracking-normal text-white/40">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-white">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status?: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${statusTone(status)}`}>
      {formatStatus(status)}
    </span>
  );
}

function EmptyInline({ text }: { text: string }) {
  return <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">{text}</p>;
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex h-32 items-center justify-center gap-3 text-sm font-black uppercase tracking-normal text-[#8127cf]">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

function ModalFrame({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5">
      <div className={`bg-white w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar`}>
        <div className="flex justify-between items-start gap-5 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase text-[#8127cf]">{eyebrow}</p>
            <h3 className="mt-1 text-2xl font-black text-[#1f1a23] tracking-normal">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-[#fbf0fe] hover:text-rose-500 cursor-pointer transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-black tracking-normal text-[#1f1a23]">{title}</h3>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3">
      <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-black text-[#1f1a23]">{value}</span>
    </div>
  );
}

function formatDate(value?: string | Date | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function StudentDetailModal({ student, exams, onClose }: { student: any; exams: any[]; onClose: () => void }) {
  const report = student.reportCards?.[0];
  const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;
  const latestMarks = (student.marks || []).slice(0, 8);

  return (
    <ModalFrame title={student.fullName} eyebrow="Student profile" onClose={onClose} wide>
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#fbf0fe]/65 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Student Record</p>
          <h3 className="mt-1 truncate text-3xl font-black tracking-normal text-[#1f1a23]">{student.fullName}</h3>
          <p className="mt-2 text-sm font-semibold uppercase tracking-normal text-[#4d4354]/55">
            {student.rollNo || "No roll number"} - {classLabel(student.class)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniMetric label="Roll No" value={student.rollNo || "N/A"} active />
        <MiniMetric label="Class" value={classLabel(student.class)} />
        <MiniMetric label="Latest" value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Users} title="Guardian" />
          <div className="mt-4 space-y-3">
            <DetailRow label="Name" value={student.guardianName || "N/A"} />
            <DetailRow label="Phone" value={student.guardianPhone || student.guardianWhatsapp || "N/A"} />
            <DetailRow label="Email" value={student.guardianEmail || "N/A"} />
          </div>
        </div>

        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={FileText} title="Latest Report Card" />
          {report ? (
            <div className="mt-4 space-y-3">
              <DetailRow label="Exam" value={report.exam?.title || "N/A"} />
              <DetailRow label="Status" value={<StatusPill status={report.status} />} />
              <DetailRow label="Grade" value={report.grade || `${Math.round(report.percentage || 0)}%`} />
              <DetailRow label="Generated" value={formatDate(report.generatedAt)} />
            </div>
          ) : (
            <div className="mt-4">
              <EmptyInline text="No report card generated yet." />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-[#fbf0fe]/60 p-5">
        <PanelTitle icon={Star} title="Recent Marks" />
        {latestMarks.length > 0 ? (
          <div className="mt-4 space-y-2">
            {latestMarks.map((mark: any, idx: number) => (
              <DetailRow
                key={mark.id || idx}
                label={`${mark.subject?.name || "Subject"} - ${mark.exam?.title || "Exam"}`}
                value={`${mark.marksObtained}/${mark.subject?.totalMarks || 100}`}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyInline text="No marks recorded for this student yet." />
          </div>
        )}
      </div>

      <div className="mt-6 rounded-3xl bg-[#fbf0fe]/60 p-5">
        <PanelTitle icon={CalendarCheck} title="Recent Attendance" />
        {(student.attendance || []).slice(0, 5).length > 0 ? (
          <div className="mt-4 space-y-2">
            {(student.attendance || []).slice(0, 5).map((att: any) => (
              <DetailRow
                key={att.id}
                label={formatDate(att.date)}
                value={<StatusPill status={att.status} />}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyInline text="No attendance records available." />
          </div>
        )}
      </div>
    </ModalFrame>
  );
}

function FormInput({ label, value, placeholder, type = "text", onChange }: { label: string; value: string; placeholder: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white"
      />
    </label>
  );
}

function FormSelect({ label, value, children, onChange }: { label: string; value: string; children: ReactNode; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white"
      >
        {children}
      </select>
    </label>
  );
}

function ModalActions({ busy, busyLabel, actionLabel, onClose, onSave }: { busy: boolean; busyLabel: string; actionLabel: string; onClose: () => void; onSave: () => void }) {
  return (
    <div className="mt-8 flex gap-4">
      <BrandButton variant="soft" className="flex-1 h-14" onClick={onClose}>
        Cancel
      </BrandButton>
      <BrandButton variant="dark" className="flex-[2] h-14" onClick={onSave} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {busyLabel}
          </>
        ) : (
          actionLabel
        )}
      </BrandButton>
    </div>
  );
}

function ConfigField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</span>
      <input
        type="number" min={0} max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white"
      />
    </div>
  );
}

function ReportCardDetailModal({ report, busy, remarkBusy, onClose, onSend, onGenerateRemarks }: {
  report: any; busy: boolean; remarkBusy: string | null;
  onClose: () => void; onSend: () => void;
  onGenerateRemarks?: (studentId: string, examId: string) => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const avatar = report.student?.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(report.student?.fullName || "Student")}`;

  return (
    <ModalFrame title={`${report.student?.fullName || "Student"} - Report Card`} eyebrow="Academic result" onClose={onClose} wide>
      <div ref={printRef} id="report-card-print" className="space-y-6">
        {/* Header with student info */}
        <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#fbf0fe]/65 p-5 sm:flex-row sm:items-center">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[28px] border-4 border-white bg-white shadow-xl">
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">{report.exam?.title || "Final Grade"} · {report.exam?.term || ""}</p>
            <h3 className="mt-1 truncate text-3xl font-black tracking-normal text-[#1f1a23]">{report.student?.fullName || "Student"}</h3>
            <p className="mt-2 text-sm font-semibold uppercase tracking-normal text-[#4d4354]/55">
              {report.student?.rollNo ? `Roll No: ${report.student.rollNo}` : ""} · {classLabel(report.student?.class)} · Class {report.student?.class?.name || ""}
            </p>
            <p className="mt-1 text-[10px] font-bold text-[#4d4354]/45">{report.exam?.term || "Term"} · Generated {formatDate(report.generatedAt)}</p>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-center">
              <p className="text-4xl font-black text-[#8127cf]">{Math.round(report.percentage || 0)}%</p>
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Percentage</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-black text-[#1f1a23]">{report.grade || "—"}</p>
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Grade</p>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniMetric label="Roll No" value={report.student?.rollNo || "N/A"} active />
          <MiniMetric label="Class" value={classLabel(report.student?.class)} />
          <MiniMetric label="Status" value={<StatusPill status={report.status} />} />
          <MiniMetric label="Delivery" value={report.deliveryStatus || "Pending"} />
        </div>

        {/* Total Marks Summary */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={BarChart3} title="Final Result" />
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-white/70 p-4 text-center">
              <p className="text-2xl font-black text-[#1f1a23]">{report.totalMarks || "—"}</p>
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Total Marks</p>
            </div>
            <div className="rounded-2xl bg-white/70 p-4 text-center">
              <p className="text-2xl font-black text-[#8127cf]">{report.obtainedMarks || "—"}</p>
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Obtained</p>
            </div>
            <div className="rounded-2xl bg-white/70 p-4 text-center">
              <p className="text-2xl font-black text-[#8127cf]">{Math.round(report.percentage || 0)}%</p>
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Percentage</p>
            </div>
            <div className="rounded-2xl bg-white/70 p-4 text-center">
              <p className={`text-2xl font-black ${report.passed !== false ? "text-emerald-600" : "text-rose-600"}`}>{report.grade || "—"}</p>
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Grade</p>
            </div>
          </div>
        </div>

        {/* Marks Summary */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={BookOpen} title="Subject Marks" />
          {report.marks?.length ? (
            <div className="mt-4 space-y-2">
              {report.marks.map((mark: any) => (
                <DetailRow key={mark.id || mark.subjectId} label={mark.subject?.name || "Subject"} value={`${mark.marksObtained}/${mark.subject?.totalMarks || 100}`} />
              ))}
            </div>
          ) : report.subjectBreakdown?.length ? (
            <div className="mt-4 space-y-2">
              {report.subjectBreakdown.map((sb: any) => (
                <DetailRow key={sb.subjectId} label={sb.subjectName || "Subject"} value={`${sb.obtainedMarks}/${sb.totalMarks} (${sb.percentage}% - ${sb.grade})`} />
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyInline text="Marks breakdown not available." />
            </div>
          )}
        </div>

        {/* Remarks */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={FileText} title="Remarks" />
          {report.remarksEn || report.remarksUr ? (
            <div className="mt-4 space-y-3">
              {report.remarksEn ? (
                <div className="rounded-2xl bg-white/70 px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">English</p>
                  <p className="mt-1 text-sm font-semibold text-[#1f1a23]">{report.remarksEn}</p>
                </div>
              ) : null}
              {report.remarksUr ? (
                <div className="rounded-2xl bg-white/70 px-4 py-3" dir="rtl">
                  <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Urdu</p>
                  <p className="mt-1 text-sm font-semibold text-[#1f1a23]">{report.remarksUr}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyInline text="No remarks drafted yet." />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[#cfc2d6]/10 pt-5">
        {/* Generate individual remarks */}
        {report.exam?.id && report.student?.id && onGenerateRemarks ? (
          <BrandButton
            variant="soft"
            icon={<BrainCircuit className="w-4 h-4" />}
            onClick={() => onGenerateRemarks(report.student.id, report.exam.id)}
            disabled={remarkBusy === report.student.id}
          >
            {remarkBusy === report.student.id ? "Generating..." : "Generate Remarks"}
          </BrandButton>
        ) : null}

        {report.isSent ? (
          <span className="rounded-full bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase tracking-normal text-emerald-600">
            Already Sent
          </span>
        ) : (
          <BrandButton
            variant="dark"
            icon={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            onClick={onSend}
            disabled={busy}
          >
            {busy ? "Sending" : "Send to Guardian"}
          </BrandButton>
        )}
        <BrandButton
          variant="soft"
          icon={<Download className="w-4 h-4" />}
          onClick={() => window.print()}
        >
          Download PDF
        </BrandButton>
      </div>
    </ModalFrame>
  );
}
