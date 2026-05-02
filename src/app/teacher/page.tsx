"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  Loader2,
  LogOut,
  Send,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getTeacherDashboardData } from "@/app/actions/dashboard";
import { Select } from "@/components/ui/select";
import {
  AiActionPanel,
  BrandButton,
  EmptyState,
  RoleShell,
  StatCard,
  type RoleNavItem,
} from "@/components/role-dashboard";

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
  const [selectedExamId, setSelectedExamId] = useState("");
  const [markSheet, setMarkSheet] = useState<any>(null);
  const [marksByKey, setMarksByKey] = useState<Record<string, string>>({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);
  const [selectedReportExamId, setSelectedReportExamId] = useState("");
  const [remarkBusy, setRemarkBusy] = useState(false);

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attendance could not be loaded");
    } finally {
      setAttendanceLoading(false);
    }
  }, [attendanceClassId, attendanceDate]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

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
      const result = await res.json();
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
                <PanelHeader icon={BookOpen} title="Classes & Subjects" status={`${classHubs.length} Hubs`} />
                {classHubs.length ? (
                  <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {classHubs.map((cls: any) => (
                      <ClassHubCard key={cls.id} cls={cls} students={data.students.filter((student: any) => student.class?.id === cls.id)} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={BookOpen}
                    title="No academic hub assigned"
                    description="Classes appear here when you are the class teacher or when a subject is assigned to you."
                  />
                )}
              </section>

              <section id="teacher-attendance" className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg scroll-mt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <PanelHeader icon={CalendarCheck} title="Daily Attendance" status={selectedAttendanceClass ? classLabel(selectedAttendanceClass) : "No class"} />
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
                                rows.map((row) => row.id === student.id ? { ...row, status: event.target.value as AttendanceStatus } : row)
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
                    {attendanceSaving ? "Saving" : "Save Attendance"}
                  </BrandButton>
                </div>
              </section>

              <section id="teacher-marks" className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg scroll-mt-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <PanelHeader icon={Star} title="Tests, Exams & Marks" status={`${data.exams?.length || 0} Cycles`} />
                  <div className="w-full lg:w-[360px]">
                    <Select value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
                      {(data.exams || []).map((exam: any) => (
                        <option key={exam.id} value={exam.id}>
                          {exam.title} - {classLabel(exam.class)}
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
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{classLabel(exam.class)}</p>
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

function ClassHubCard({ cls, students }: { cls: any; students: any[] }) {
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
