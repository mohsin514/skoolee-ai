"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle, ArrowRight, BarChart3, BookOpen, CalendarCheck, ClipboardList, FileText, GraduationCap, History, Send, Star, TrendingUp, Users, Zap,
} from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getTeacherDashboardData } from "@/app/actions/dashboard";
import { BrandButton } from "@/components/role-dashboard";
import {
  classLabel,  CreateAssessmentModal,  DashboardSkeleton,  FinalGradesModal,  GradeConfigModal,  ReportCardDetailModal,  StudentDetailModal,  todayIso,
} from "@/components/teacher/teacher-components";

const CHART_COLORS = ["#8127cf", "#9c48ea", "#b876f0", "#d4a8f7"];
const STATUS_COLORS = ["#10b981", "#ef4444", "#f59e0b", "#d1d5db"];

export default function TeacherDashboardHub() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modal + action states (preserved from original)
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedReportCard, setSelectedReportCard] = useState<any>(null);
  const [sendingReport, setSendingReport] = useState<string | null>(null);
  const [remarkGeneratingFor, setRemarkGeneratingFor] = useState<string | null>(null);
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

  useEffect(() => { loadData(); }, [loadData]);

  const classHubs = data?.classHubs || [];
  const teacherSubjects = data?.subjects || [];
  const missingMarksTotal = (data?.activeExams || []).reduce((sum: number, exam: any) => sum + (exam.missingMarks || 0), 0);
  const attendanceStats = data?.attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };

  // ── Chart data ──
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

  /* ── Handler functions (unchanged) ── */
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
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setCreatingExam(false); }
  }, [examForm, loadData]);

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
        body: JSON.stringify({ classId: selectedGradeClassId, academicYear: new Date().getFullYear(), config: gradeConfig }),
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
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setGeneratingReportCards(false); }
  }, [selectedGradeClassId, loadData]);

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

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return null;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* ── Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#8127cf]/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
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
          {/* ── Action Buttons (preserved exactly) ── */}
          <div className="flex flex-wrap gap-3">
            <BrandButton variant="soft" icon={<History className="w-4 h-4" />} onClick={() => router.push("/teacher/reports")}>
              <span title="View report history">Report History</span>
            </BrandButton>
            <BrandButton variant="soft" icon={<Star className="w-4 h-4" />} onClick={() => setShowExamModal(true)}>
              <span title="Create a new exam or test">Create Assessment</span>
            </BrandButton>
            <BrandButton variant="soft" icon={<FileText className="w-4 h-4" />} onClick={() => {
              if (classHubs[0]) { setSelectedGradeClassId(classHubs[0].id); loadGradeConfig(classHubs[0].id); }
              setShowGradeConfigModal(true);
            }}>
              <span title="Configure grading weights and thresholds">Grade Config</span>
            </BrandButton>
            <BrandButton variant="dark" icon={<BarChart3 className="w-4 h-4" />} onClick={() => {
              if (classHubs[0]) setSelectedGradeClassId(classHubs[0].id);
              setShowGradeOverviewModal(true);
            }}>
              <span title="View weighted final grades">Final Grades</span>
            </BrandButton>
            <BrandButton variant="dark" icon={<Send className="w-4 h-4" />} onClick={() => router.push("/teacher/marks")}>
              <span title="Enter marks for assessments">Enter Marks</span>
            </BrandButton>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 bg-[#fbf0fe]/20 space-y-7">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            { icon: BookOpen, label: "Subjects", value: teacherSubjects.length, color: "from-[#8127cf] to-[#9c48ea]", onClick: () => router.push("/teacher/marks") },
            { icon: GraduationCap, label: "Classes", value: classHubs.length, color: "from-rose-500 to-rose-600", onClick: () => router.push("/teacher/marks") },
            { icon: Users, label: "Students", value: data.totalStudents, color: "from-emerald-500 to-emerald-600", onClick: () => router.push("/teacher/attendance") },
            { icon: ClipboardList, label: "Active Tests", value: activeExamCount, color: "from-violet-500 to-violet-600", onClick: () => router.push("/teacher/marks") },
            { icon: AlertCircle, label: "Missing Marks", value: missingMarksTotal, color: "from-rose-500 to-rose-600", onClick: () => router.push("/teacher/marks") },
            { icon: CalendarCheck, label: "Unmarked Today", value: attendanceStats.unmarked, color: "from-slate-600 to-slate-700", onClick: () => router.push("/teacher/attendance") },
          ].map((card, i) => (
            <button key={card.label} type="button" onClick={card.onClick}
              title={`${card.value} ${card.label} — click to view`}
              className="group relative cursor-pointer rounded-3xl bg-white p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-[#cfc2d6]/10 overflow-hidden active:scale-[0.97]"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-300`} />
              <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${card.color} shadow-md shadow-${card.color.split(" ")[0].replace("from-", "")}/20`}>
                <card.icon className="h-5 w-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors">{card.value}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">{card.label}</p>
            </button>
          ))}
        </div>

        {/* ── Charts & Insights ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Attendance Donut */}
          <div className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-lg">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Daily Overview</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Attendance Breakdown</h3>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf]">
                <CalendarCheck className="h-5 w-5" />
              </div>
            </div>
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
          </div>

          {/* Marks Progress Bar Chart */}
          <div className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-lg">
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
                  <Tooltip
                    contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", fontSize: 12, fontWeight: 700 }}
                    cursor={{ fill: "#fbf0fe" }}
                  />
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
          <div className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-lg">
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

        {/* ── Quick Nav Cards ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#1d1b20] uppercase tracking-wider">Quick Navigation</h3>
            <span className="text-[10px] font-semibold text-[#4d4354]/50">{classHubs.length} classes active</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { icon: CalendarCheck, label: "Attendance", desc: "Mark daily attendance per class", href: "/teacher/attendance", color: "from-emerald-500 to-emerald-600", shadow: "shadow-emerald-500/15" },
              { icon: Star, label: "Marks & Tests", desc: "Enter marks & manage assessments", href: "/teacher/marks", color: "from-[#8127cf] to-[#9c48ea]", shadow: "shadow-[#8127cf]/15" },
              { icon: FileText, label: "Reports", desc: "Report cards, remarks & results", href: "/teacher/reports", color: "from-rose-500 to-rose-600", shadow: "shadow-rose-500/15" },
              { icon: Zap, label: "AI Insights", desc: "AI-powered weak topics & lesson plans", href: "/teacher/ai", color: "from-amber-500 to-amber-600", shadow: "shadow-amber-500/15" },
            ].map((card) => (
              <button key={card.label} type="button" onClick={() => router.push(card.href)}
                title={`Go to ${card.label}`}
                className="group relative cursor-pointer rounded-[28px] p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl bg-white border border-[#cfc2d6]/10 overflow-hidden active:scale-[0.97]"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-[0.04] group-hover:opacity-[0.08] transition-opacity`} />
                <div className="flex items-start justify-between mb-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.color} shadow-lg ${card.shadow}`}>
                    <card.icon className="h-6 w-6 text-white" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[#4d4354]/20 group-hover:text-[#8127cf] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="text-lg font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors">{card.label}</h3>
                <p className="mt-1 text-xs font-semibold text-[#4d4354]/60 leading-relaxed">{card.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modals (unchanged) ── */}
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
          onClose={() => setSelectedReportCard(null)} onSend={() => sendReportCard(selectedReportCard.id)}
          onGenerateRemarks={(studentId, examId) => handleGenerateStudentRemarks(studentId, examId)} />
      ) : null}
    </section>
  );
}
