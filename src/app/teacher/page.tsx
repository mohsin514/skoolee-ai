"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle, ArrowRight, BarChart3, BookOpen, Calendar, CalendarCheck, CheckCircle2,
  ClipboardList, Clock, FileText, GraduationCap, Loader2, Send, Star, TrendingUp, UserCheck, Users, Zap,
} from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { BrandButton } from "@/components/role-dashboard";
import {
  classLabel, CreateAssessmentModal, DashboardSkeleton, FinalGradesModal, GradeConfigModal,
  ReportCardDetailModal, StudentDetailModal, TeacherErrorState,
} from "@/components/teacher/teacher-components";
import { useTeacherData } from "./teacher-data-context";

interface TimetableSlot {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  slotType: string;
  subject: { id: string; name: string } | null;
  className: string;
  classSection: string | null;
  classId: string;
  roomNumber: string | null;
}

export default function TeacherDashboardHub() {
  const router = useRouter();
  const { data, loading, error, refetch } = useTeacherData();

  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedReportCard, setSelectedReportCard] = useState<any>(null);
  const [sendingReport, setSendingReport] = useState<string | null>(null);
  const [remarkGeneratingFor, setRemarkGeneratingFor] = useState<string | null>(null);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [showGradeConfigModal, setShowGradeConfigModal] = useState(false);
  const [showGradeOverviewModal, setShowGradeOverviewModal] = useState(false);
  const [examForm, setExamForm] = useState({ title: "", term: "", classId: "", subjectId: "" as string, examType: "CLASS_TEST" as string });
  const [creatingExam, setCreatingExam] = useState(false);
  const [gradeConfig, setGradeConfig] = useState<Record<string, number>>({});
  const [gradeConfigLoading, setGradeConfigLoading] = useState(false);
  const [gradeConfigSaving, setGradeConfigSaving] = useState(false);
  const [weightedGradeResult, setWeightedGradeResult] = useState<any>(null);
  const [weightedGradeLoading, setWeightedGradeLoading] = useState(false);
  const [selectedGradeClassId, setSelectedGradeClassId] = useState("");
  const [generatingReportCards, setGeneratingReportCards] = useState(false);
  const [reportCardsGenerated, setReportCardsGenerated] = useState(false);

  const [todaySlots, setTodaySlots] = useState<TimetableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [selfAttendanceStatus, setSelfAttendanceStatus] = useState<"loading" | "unmarked" | "marked">("loading");
  const [selfAttendanceTime, setSelfAttendanceTime] = useState<string | null>(null);
  const [markingSelf, setMarkingSelf] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toLocaleDateString("en-CA");
        const res = await fetch(`/api/teacher-attendance?userId=self&date=${today}`);
        const json = await res.json();
        if (json.success && json.data?.length > 0) {
          setSelfAttendanceStatus("marked");
          setSelfAttendanceTime(json.data[0].checkInTime);
        } else {
          setSelfAttendanceStatus("unmarked");
        }
      } catch { setSelfAttendanceStatus("unmarked"); }
    })();
  }, []);

  const handleMarkSelfAttendance = useCallback(async () => {
    setMarkingSelf(true);
    try {
      const res = await fetch("/api/teacher-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to mark attendance");
      setSelfAttendanceStatus("marked");
      setSelfAttendanceTime(json.data?.checkInTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
      toast.success(json.alreadyMarked ? "Already marked today" : "Attendance marked successfully!");
    } catch (err: any) { toast.error(err.message); }
    finally { setMarkingSelf(false); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/timetable/teacher");
        const json = await res.json();
        if (json.success) {
          const today = new Date().getDay();
          const dayNum = today === 0 ? 7 : today;
          setTodaySlots(
            (json.data as TimetableSlot[])
              .filter((s) => s.dayOfWeek === dayNum && s.slotType === "CLASS" && s.subject)
              .sort((a, b) => a.periodNumber - b.periodNumber)
          );
        }
      } catch { /* timetable not critical */ }
      finally { setSlotsLoading(false); }
    })();
  }, []);

  const classHubs = data?.classHubs || [];
  const teacherSubjects = data?.subjects || [];
  const missingMarksTotal = (data?.activeExams || []).reduce((sum: number, exam: any) => sum + (exam.missingMarks || 0), 0);
  const attendanceStats = data?.attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };

  const attendanceChartData = useMemo(() => [
    { name: "Present", value: attendanceStats.present, color: "#10b981" },
    { name: "Absent", value: attendanceStats.absent, color: "#ef4444" },
    { name: "Leave", value: attendanceStats.leave, color: "#f59e0b" },
    { name: "Unmarked", value: attendanceStats.unmarked, color: "#d1d5db" },
  ].filter((d) => d.value > 0), [attendanceStats]);

  const marksProgressData = useMemo(() => {
    const exams = (data?.exams || []).slice(0, 5);
    return exams.map((exam: any) => ({
      name: exam.title.length > 12 ? exam.title.slice(0, 12) + "…" : exam.title,
      Entered: exam.enteredMarks || 0,
      Missing: exam.missingMarks || 0,
      total: (exam.enteredMarks || 0) + (exam.missingMarks || 0),
    }));
  }, [data]);

  const activeExamCount = data?.activeExams?.length || 0;
  const reportCardCount = data?.recentReportCards?.length || 0;
  const completionRate = marksProgressData.length
    ? Math.round(marksProgressData.reduce((s: number, d: any) => s + d.Entered, 0) / Math.max(marksProgressData.reduce((s: number, d: any) => s + d.total, 0), 1) * 100)
    : 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const hasUnmarkedAttendance = attendanceStats.unmarked > 0;
  const hasMissingMarks = missingMarksTotal > 0;

  /* ── Handlers ── */
  const handleCreateExam = useCallback(async () => {
    if (!examForm.title || !examForm.classId) { toast.error("Title and class are required"); return; }
    setCreatingExam(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...examForm, academicYear: new Date().getFullYear() }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "Failed to create assessment");
      toast.success(`Assessment "${examForm.title}" created`);
      setShowExamModal(false);
      setExamForm({ title: "", term: "", classId: "", subjectId: "", examType: "CLASS_TEST" });
      await refetch();
    } catch (error: any) { toast.error(error.message); }
    finally { setCreatingExam(false); }
  }, [examForm, refetch]);

  const loadGradeConfig = useCallback(async (classId: string) => {
    if (!classId) return;
    setGradeConfigLoading(true);
    try {
      const res = await fetch(`/api/grade-config?classId=${classId}&academicYear=${new Date().getFullYear()}`);
      const text = await res.text();
      const result = JSON.parse(text);
      if (result.config) {
        const { quizWeight, classTestWeight, midTermWeight, finalWeight, passingPercentage, gradeAplus, gradeA, gradeB, gradeC, gradeD } = result.config;
        setGradeConfig({ quizWeight, classTestWeight, midTermWeight, finalWeight, passingPercentage, gradeAplus, gradeA, gradeB, gradeC, gradeD });
      }
    } catch { setGradeConfig({ quizWeight: 10, classTestWeight: 20, midTermWeight: 30, finalWeight: 40, passingPercentage: 50, gradeAplus: 90, gradeA: 80, gradeB: 70, gradeC: 60, gradeD: 50 }); }
    finally { setGradeConfigLoading(false); }
  }, []);

  const saveGradeConfig = useCallback(async () => {
    if (!selectedGradeClassId) return;
    setGradeConfigSaving(true);
    try {
      const res = await fetch("/api/grade-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selectedGradeClassId, academicYear: new Date().getFullYear(), ...gradeConfig }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "Failed to save");
      toast.success("Grade configuration saved");
      setShowGradeConfigModal(false);
    } catch (error: any) { toast.error(error.message); }
    finally { setGradeConfigSaving(false); }
  }, [selectedGradeClassId, gradeConfig]);

  const loadWeightedGrade = useCallback(async (classId: string) => {
    if (!classId) return;
    setWeightedGradeLoading(true);
    setWeightedGradeResult(null);
    try {
      const res = await fetch(`/api/grade-config/weighted-result?classId=${classId}&academicYear=${new Date().getFullYear()}`);
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "No grades available");
      setWeightedGradeResult(result.grades || []);
    } catch (error: any) { toast.error(error.message); }
    finally { setWeightedGradeLoading(false); }
  }, []);

  const handleGenerateReportCards = useCallback(async () => {
    if (!selectedGradeClassId) return;
    setGeneratingReportCards(true);
    try {
      const res = await fetch("/api/reports/generate-from-grades", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selectedGradeClassId, academicYear: new Date().getFullYear() }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "Report card generation failed");
      toast.success(`Generated ${result.count || 0} report cards`);
      setReportCardsGenerated(true);
      await refetch();
    } catch (error: any) { toast.error(error.message); }
    finally { setGeneratingReportCards(false); }
  }, [selectedGradeClassId, refetch]);

  const sendReportCard = useCallback(async (reportId: string) => {
    setSendingReport(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/send`, { method: "POST" });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(result.error || "Failed to send");
      toast.success("Report card sent");
      await refetch();
    } catch (error: any) { toast.error(error.message); }
    finally { setSendingReport(null); }
  }, [refetch]);

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

  const handleSaveReportRemarks = useCallback(async (remarks: { en: string; ur: string }) => {
    if (!selectedReportCard) return;
    setSavingRemarks(true);
    try {
      const res = await fetch(`/api/reports/${selectedReportCard.id}/remarks`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarksEn: remarks.en, remarksUr: remarks.ur }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save remarks");
      toast.success("Remarks saved");
      setSelectedReportCard((c: any) => c ? { ...c, remarksEn: remarks.en, remarksUr: remarks.ur } : c);
    } catch (error: any) { toast.error(error.message); }
    finally { setSavingRemarks(false); }
  }, [selectedReportCard]);

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* ── Header ── */}
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative p-7 px-9 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg shadow-[#8127cf]/20">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#8127cf]">
                  {greeting}, {data.teacherName?.split(" ")[0] || "Teacher"}
                </p>
                <p className="text-[10px] font-semibold text-[#4d4354]/50">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {[
                { label: "Subjects", value: teacherSubjects.length, color: "bg-[#8127cf]/10 text-[#8127cf]" },
                { label: "Classes", value: classHubs.length, color: "bg-rose-50 text-rose-600" },
                { label: "Students", value: data.totalStudents, color: "bg-emerald-50 text-emerald-600" },
              ].map((pill) => (
                <span key={pill.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${pill.color}`}>
                  <span className="font-bold">{pill.value}</span>
                  <span className="opacity-60">{pill.label}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <BrandButton variant="soft" icon={<Star className="w-4 h-4" />} onClick={() => setShowExamModal(true)}>
              <span title="Create a new exam or test">New Assessment</span>
            </BrandButton>
            <BrandButton variant="soft" icon={<FileText className="w-4 h-4" />} onClick={() => {
              if (classHubs[0]) { setSelectedGradeClassId(classHubs[0].id); loadGradeConfig(classHubs[0].id); }
              setShowGradeConfigModal(true);
            }}>
              <span title="Configure grading weights">Grade Config</span>
            </BrandButton>
            <BrandButton variant="dark" icon={<BarChart3 className="w-4 h-4" />} onClick={() => {
              if (classHubs[0]) setSelectedGradeClassId(classHubs[0].id);
              setWeightedGradeResult(null);
              setReportCardsGenerated(false);
              setShowGradeOverviewModal(true);
            }}>
              <span title="View weighted final grades">Final Grades</span>
            </BrandButton>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 bg-[#fbf0fe]/20 space-y-7">

        {/* ── Self Attendance Card ── */}
        {selfAttendanceStatus === "loading" ? (
          <div className="rounded-[28px] overflow-hidden border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] p-5 flex items-center gap-4 animate-skeleton-in">
            <div className="skeleton-shimmer h-12 w-12 shrink-0 rounded-2xl bg-[#e8e0ec]/60" />
            <div className="flex-1 space-y-2">
              <div className="skeleton-shimmer h-4 w-52 rounded-full bg-[#e8e0ec]/50" />
              <div className="skeleton-shimmer h-3 w-72 rounded-full bg-[#e8e0ec]/40" />
            </div>
            <div className="skeleton-shimmer h-10 w-28 shrink-0 rounded-2xl bg-[#e8e0ec]/50" />
          </div>
        ) : (
          <div className="rounded-[28px] overflow-hidden border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center shadow-sm ${selfAttendanceStatus === "marked" ? "bg-emerald-100 text-emerald-600" : "bg-[#fbf0fe] text-[#8127cf]"}`}>
                  {selfAttendanceStatus === "marked" ? <CheckCircle2 className="h-6 w-6" /> : <UserCheck className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1d1b20]">
                    {selfAttendanceStatus === "marked" ? "You're Checked In Today" : "Mark Your Attendance"}
                  </p>
                  <p className="text-[10px] font-semibold text-[#4d4354]/50 mt-0.5">
                    {selfAttendanceStatus === "marked" && selfAttendanceTime
                      ? `Checked in at ${selfAttendanceTime}`
                      : "Tap to mark yourself present for today"}
                  </p>
                </div>
              </div>
              {selfAttendanceStatus === "unmarked" && (
                <BrandButton variant="dark" onClick={handleMarkSelfAttendance} disabled={markingSelf}>
                  {markingSelf ? <Loader2 className="w-4 h-4 animate-spin" /> : "I'm Present"}
                </BrandButton>
              )}
              {selfAttendanceStatus === "marked" && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600">Present</span>
              )}
            </div>
          </div>
        )}

        {/* ── Action Alerts ── */}
        {(hasUnmarkedAttendance || hasMissingMarks) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hasUnmarkedAttendance && (
              <button type="button" onClick={() => router.push("/teacher/attendance")}
                className="group flex items-center gap-4 rounded-[28px] bg-gradient-to-r from-amber-50 to-amber-50/30 border border-amber-200/50 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm">
                  <CalendarCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-amber-800">Unmarked Attendance</p>
                  <p className="text-xs font-semibold text-amber-600/70 mt-0.5">
                    {attendanceStats.unmarked} student{attendanceStats.unmarked !== 1 ? "s" : ""} not marked today
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-amber-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all shrink-0" />
              </button>
            )}
            {hasMissingMarks && (
              <button type="button" onClick={() => router.push("/teacher/marks")}
                className="group flex items-center gap-4 rounded-[28px] bg-gradient-to-r from-rose-50 to-rose-50/30 border border-rose-200/50 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-sm">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-rose-800">Missing Marks</p>
                  <p className="text-xs font-semibold text-rose-600/70 mt-0.5">
                    {missingMarksTotal} mark{missingMarksTotal !== 1 ? "s" : ""} pending across {activeExamCount} active test{activeExamCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-rose-400 group-hover:text-rose-600 group-hover:translate-x-1 transition-all shrink-0" />
              </button>
            )}
          </div>
        )}

        {/* ── Today's Schedule Strip ── */}
        {slotsLoading ? (
          <div className="rounded-[28px] bg-gradient-to-r from-[#8127cf]/[0.04] to-[#fbf0fe]/60 border border-[#8127cf]/10 p-5 animate-skeleton-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="skeleton-shimmer h-8 w-8 rounded-xl bg-[#e8e0ec]/60" />
                <div className="skeleton-shimmer h-4 w-36 rounded-full bg-[#e8e0ec]/50" />
              </div>
              <div className="skeleton-shimmer h-3 w-20 rounded-full bg-[#e8e0ec]/40" />
            </div>
            <div className="flex gap-3 overflow-hidden">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton-shimmer h-[76px] w-[160px] shrink-0 rounded-2xl bg-[#e8e0ec]/50" />
              ))}
            </div>
          </div>
        ) : todaySlots.length > 0 ? (
          <div className="rounded-[28px] bg-gradient-to-r from-[#8127cf]/[0.04] to-[#fbf0fe]/60 border border-[#8127cf]/10 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-[#8127cf] flex items-center justify-center shadow-md shadow-[#8127cf]/20">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[#1d1b20]">Today&apos;s Schedule</h3>
                <span className="text-[10px] font-semibold text-[#4d4354]/40">{todaySlots.length} class{todaySlots.length !== 1 ? "es" : ""}</span>
              </div>
              <button type="button" onClick={() => router.push("/teacher/timetable")}
                className="text-[10px] font-bold uppercase tracking-wider text-[#8127cf] hover:text-[#6a1fb0] transition-colors cursor-pointer">
                Full timetable
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-1">
              {todaySlots.map((slot) => {
                const now = new Date();
                const [startH, startM] = slot.startTime.split(":").map(Number);
                const [endH, endM] = slot.endTime.split(":").map(Number);
                const slotStart = new Date(); slotStart.setHours(startH, startM, 0, 0);
                const slotEnd = new Date(); slotEnd.setHours(endH, endM, 0, 0);
                const isActive = now >= slotStart && now < slotEnd;
                const isPast = now >= slotEnd;

                return (
                  <div key={slot.id}
                    className={`shrink-0 rounded-2xl border px-4 py-3 min-w-[160px] transition-all ${
                      isActive
                        ? "bg-[#8127cf] border-[#8127cf] shadow-lg shadow-[#8127cf]/25"
                        : isPast
                        ? "bg-white/60 border-[#cfc2d6]/15"
                        : "bg-white border-[#cfc2d6]/15 hover:border-[#8127cf]/20 hover:shadow-sm"
                    }`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-black ${isActive ? "text-white/70" : isPast ? "text-[#4d4354]/30" : "text-[#8127cf]"}`}>
                        {slot.startTime} - {slot.endTime}
                      </span>
                      {isActive && (
                        <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[8px] font-bold uppercase text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                          Now
                        </span>
                      )}
                    </div>
                    <p className={`text-sm font-bold truncate ${isActive ? "text-white" : isPast ? "text-[#4d4354]/40" : "text-[#1d1b20]"}`}>
                      {slot.subject?.name}
                    </p>
                    <p className={`text-[10px] font-semibold mt-0.5 ${isActive ? "text-white/60" : "text-[#4d4354]/40"}`}>
                      {slot.className}{slot.classSection ? ` - ${slot.classSection}` : ""}
                      {slot.roomNumber ? ` · ${slot.roomNumber}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            { icon: BookOpen, label: "Subjects", value: teacherSubjects.length, color: "from-[#8127cf] to-[#9c48ea]", onClick: () => router.push("/teacher/marks") },
            { icon: GraduationCap, label: "Classes", value: classHubs.length, color: "from-rose-500 to-rose-600", onClick: () => router.push("/teacher/marks") },
            { icon: Users, label: "Students", value: data.totalStudents, color: "from-emerald-500 to-emerald-600", onClick: () => router.push("/teacher/students") },
            { icon: ClipboardList, label: "Active Tests", value: activeExamCount, color: "from-violet-500 to-violet-600", onClick: () => router.push("/teacher/marks") },
            { icon: AlertCircle, label: "Missing Marks", value: missingMarksTotal, color: missingMarksTotal > 0 ? "from-rose-500 to-rose-600" : "from-emerald-500 to-emerald-600", onClick: () => router.push("/teacher/marks") },
            { icon: CalendarCheck, label: "Unmarked Today", value: attendanceStats.unmarked, color: attendanceStats.unmarked > 0 ? "from-amber-500 to-amber-600" : "from-emerald-500 to-emerald-600", onClick: () => router.push("/teacher/attendance") },
          ].map((card, index) => (
            <button key={card.label} type="button" onClick={card.onClick}
              title={`${card.value} ${card.label} — click to view`}
              style={{ animationDelay: `${index * 70}ms` }}
              className="sk-rise group relative cursor-pointer rounded-3xl bg-white p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-[#cfc2d6]/10 overflow-hidden active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-300`} />
              <div className="relative mb-3">
                <div className={`absolute -inset-2 rounded-xl bg-gradient-to-br ${card.color} opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-20`} />
                <div className={`relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${card.color} shadow-md`}>
                  <card.icon className="h-5 w-5 text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors">{card.value}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">{card.label}</p>
            </button>
          ))}
        </div>

        {/* ── Charts & Insights ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Attendance Donut */}
          <div className="sk-rise bg-white rounded-[32px] p-6 border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "120ms" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Daily Overview</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Attendance Breakdown</h3>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf]">
                <CalendarCheck className="h-5 w-5" />
              </div>
            </div>
            {attendanceChartData.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="shrink-0">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={attendanceChartData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value" stroke="none">
                        {attendanceChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {[
                    { label: "Present", value: attendanceStats.present, color: "#10b981" },
                    { label: "Absent", value: attendanceStats.absent, color: "#ef4444" },
                    { label: "Leave", value: attendanceStats.leave, color: "#f59e0b" },
                    { label: "Unmarked", value: attendanceStats.unmarked, color: "#d1d5db" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] font-semibold text-[#4d4354]/60 uppercase tracking-wider">{item.label}</span>
                      </div>
                      <span className="text-xs font-bold text-[#1d1b20]">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[140px] rounded-2xl bg-[#fbf0fe]/40">
                <p className="text-xs font-bold text-[#4d4354]/40">No attendance data yet</p>
              </div>
            )}
          </div>

          {/* Marks Progress Bar Chart */}
          <div className="sk-rise bg-white rounded-[32px] p-6 border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "190ms" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Entry Status</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Marks Progress</h3>
              </div>
              <div className={`px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${completionRate >= 80 ? "bg-emerald-50 text-emerald-600" : completionRate >= 50 ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"}`}>
                {completionRate}% Complete
              </div>
            </div>
            {marksProgressData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={marksProgressData} barCategoryGap="20%" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fontWeight: 700 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", fontSize: 12, fontWeight: 700 }} cursor={{ fill: "#fbf0fe" }} />
                  <Bar dataKey="Entered" stackId="a" fill="#8127cf" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Missing" stackId="a" fill="#e8e0ec" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[160px] rounded-2xl bg-[#fbf0fe]/40">
                <p className="text-xs font-bold text-[#4d4354]/40">No exam data yet</p>
              </div>
            )}
          </div>

          {/* Performance Summary */}
          <div className="sk-rise bg-white rounded-[32px] p-6 border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "260ms" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Snapshot</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Quick Insights</h3>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="space-y-4">
              {[
                {
                  label: "Marks Completion", value: `${completionRate}%`, sub: `${marksProgressData.reduce((s: number, d: any) => s + d.Entered, 0)} of ${marksProgressData.reduce((s: number, d: any) => s + d.total, 0)} entries`,
                  progress: completionRate, color: "bg-[#8127cf]",
                },
                {
                  label: "Attendance Rate", value: attendanceStats.total ? `${Math.round(attendanceStats.present / Math.max(attendanceStats.total, 1) * 100)}%` : "—",
                  sub: `${attendanceStats.present} present out of ${attendanceStats.total}`,
                  progress: attendanceStats.total ? Math.round(attendanceStats.present / attendanceStats.total * 100) : 0, color: "bg-emerald-500",
                },
                {
                  label: "Report Cards", value: String(reportCardCount), sub: "Generated",
                  progress: Math.min(reportCardCount * 20, 100), color: "bg-rose-500",
                },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-[#4d4354]/60 uppercase tracking-wider">{item.label}</span>
                    <span className="text-sm font-bold text-[#1d1b20]">{item.value}</span>
                  </div>
                  <div className="h-2 bg-[#f3f4f9] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${item.color}`} style={{ width: `${item.progress}%` }} />
                  </div>
                  {item.sub ? <p className="mt-0.5 text-[10px] font-semibold text-[#4d4354]/45 uppercase tracking-wider">{item.sub}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Class Hubs ── */}
        {classHubs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#1d1b20] uppercase tracking-wider">My Classes</h3>
              <span className="text-[10px] font-semibold text-[#4d4354]/50">{classHubs.length} active</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {classHubs.map((cls: any) => {
                const clsStudents = (data.students || []).filter((s: any) => s.class?.id === cls.id);
                const clsExams = (data.activeExams || []).filter((e: any) => e.classId === cls.id);
                const clsMissingMarks = clsExams.reduce((sum: number, e: any) => sum + (e.missingMarks || 0), 0);
                return (
                  <div key={cls.id} className="rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:-translate-y-0.5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8127cf]">{cls.role || "Teacher"}</p>
                        <h4 className="mt-0.5 truncate text-lg font-bold text-[#1d1b20] tracking-tight">{classLabel(cls)}</h4>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
                        <GraduationCap className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2 text-center">
                        <p className="text-lg font-bold text-[#8127cf]">{clsStudents.length}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-[#4d4354]/40">Students</p>
                      </div>
                      <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2 text-center">
                        <p className="text-lg font-bold text-[#1d1b20]">{cls.subjects?.length || 0}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-[#4d4354]/40">Subjects</p>
                      </div>
                      <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2 text-center">
                        <p className={`text-lg font-bold ${clsMissingMarks > 0 ? "text-rose-600" : "text-emerald-600"}`}>{clsMissingMarks}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-[#4d4354]/40">Pending</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {(cls.subjects || []).slice(0, 4).map((subject: any) => (
                        <span key={subject.id} className="rounded-full bg-[#fbf0fe] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#8127cf]">{subject.name}</span>
                      ))}
                      {(cls.subjects?.length || 0) > 4 && (
                        <span className="rounded-full bg-[#fbf0fe] px-2.5 py-1 text-[9px] font-semibold text-[#4d4354]/40">+{cls.subjects.length - 4}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
<button type="button" onClick={() => router.push("/teacher/attendance")}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                      <CalendarCheck className="h-3.5 w-3.5" /> Attendance
                    </button>
                    <button type="button" onClick={() => router.push("/teacher/marks")}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                      <Star className="h-3.5 w-3.5" /> Marks
                    </button>
                    <button type="button" onClick={() => router.push("/teacher/reports")}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                      <FileText className="h-3.5 w-3.5" /> Reports
                    </button>
                    <button type="button" onClick={() => router.push("/teacher/students")}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                      <Users className="h-3.5 w-3.5" /> Students
                    </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Quick Nav Cards ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#1d1b20] uppercase tracking-wider">Quick Navigation</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {[
              { icon: CalendarCheck, label: "Attendance", desc: "Mark daily attendance", href: "/teacher/attendance", color: "from-emerald-500 to-emerald-600" },
              { icon: Star, label: "Marks", desc: "Enter marks & tests", href: "/teacher/marks", color: "from-[#8127cf] to-[#9c48ea]" },
              { icon: Users, label: "Students", desc: "View student directory", href: "/teacher/students", color: "from-blue-500 to-blue-600" },
              { icon: FileText, label: "Reports", desc: "Report cards & results", href: "/teacher/reports", color: "from-rose-500 to-rose-600" },
              { icon: Calendar, label: "Timetable", desc: "Weekly schedule", href: "/teacher/timetable", color: "from-violet-500 to-violet-600" },
              { icon: Zap, label: "AI Insights", desc: "AI-powered analysis", href: "/teacher/ai", color: "from-amber-500 to-amber-600" },
            ].map((card) => (
              <button key={card.label} type="button" onClick={() => router.push(card.href)}
                title={`Go to ${card.label}`}
                className="group relative cursor-pointer rounded-[24px] p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-white border border-[#cfc2d6]/10 overflow-hidden active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-[0.04] group-hover:opacity-[0.08] transition-opacity`} />
                <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.color} shadow-md`}>
                  <card.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-sm font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors">{card.label}</h3>
                <p className="mt-0.5 text-[10px] font-semibold text-[#4d4354]/50 leading-relaxed">{card.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <CreateAssessmentModal open={showExamModal} classHubs={classHubs} examForm={examForm} creatingExam={creatingExam}
        onClose={() => setShowExamModal(false)}
        onFormChange={(field, value) => setExamForm((f) => ({ ...f, [field]: value }))} onCreate={handleCreateExam} />
      <GradeConfigModal open={showGradeConfigModal} classHubs={classHubs} selectedGradeClassId={selectedGradeClassId}
        gradeConfig={gradeConfig} gradeConfigLoading={gradeConfigLoading} gradeConfigSaving={gradeConfigSaving}
        onClose={() => setShowGradeConfigModal(false)}
        onClassChange={(id) => { setSelectedGradeClassId(id); loadGradeConfig(id); }}
        onConfigChange={setGradeConfig} onSave={saveGradeConfig} />
      <FinalGradesModal open={showGradeOverviewModal} classHubs={classHubs} selectedGradeClassId={selectedGradeClassId}
        weightedGradeResult={weightedGradeResult} weightedGradeLoading={weightedGradeLoading}
        generatingReportCards={generatingReportCards} reportCardsGenerated={reportCardsGenerated}
        onClose={() => setShowGradeOverviewModal(false)}
        onClassChange={(id) => { setSelectedGradeClassId(id); setWeightedGradeResult(null); setReportCardsGenerated(false); }}
        onGenerate={loadWeightedGrade} onGenerateReportCards={handleGenerateReportCards} />
      {selectedStudent ? <StudentDetailModal student={selectedStudent} exams={data.exams || []} onClose={() => setSelectedStudent(null)} /> : null}
      {selectedReportCard ? (
        <ReportCardDetailModal report={selectedReportCard} busy={sendingReport === selectedReportCard.id} remarkBusy={remarkGeneratingFor}
          savingRemarks={savingRemarks}
          onClose={() => setSelectedReportCard(null)} onSend={() => sendReportCard(selectedReportCard.id)}
          onGenerateRemarks={(studentId, examId) => handleGenerateStudentRemarks(studentId, examId)}
          onSaveRemarks={handleSaveReportRemarks} />
      ) : null}
    </section>
  );
}
