"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Calendar,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  History,
  LayoutGrid,
  Receipt,
  School,
  Sparkles,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getCampusDashboardData } from "@/app/actions/dashboard";
import { cancelInvitation, removeStaff, resendInvitation } from "@/app/actions/invite";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { AdmissionForm } from "@/app/dashboard/students/admission-form";
import { BulkImportDialog } from "@/app/dashboard/students/bulk-import-dialog";
import { AddTeacherForm } from "@/components/teacher/add-teacher-form";
import { AddStaffForm } from "@/components/staff/add-staff-form";
import { UnifiedAttendancePanel } from "@/components/attendance/unified-attendance-panel";
import { FeesPanel } from "@/components/fees/FeesPanel";
import { TimetablePanel } from "@/components/timetable/TimetablePanel";
import { AcademicYearPanel } from "@/components/academic-year/AcademicYearPanel";
import { TeacherPerformancePanel } from "@/components/academic-year/TeacherPerformancePanel";
import { CycleManagementPanel } from "@/components/academic-year/CycleManagementPanel";
import { ReportCardDetailModal } from "@/components/teacher/teacher-components";
import {
  AcademicPanel,
  ActivityLogModal,
  AIPanel,
  ClassDetailModal,
  ClassModal,
  ExamCyclesPanel,
  ExamDetailModal,
  FacultyPanel,
  groupClasses,
  HelpModal,
  LeadershipPanel,
  MoveStudentModal,
  ReportCardsPanel,
  StudentDetailModal,
  StudentsPanel,
  TeacherDetailModal,
  classLabel,
  type ClassFormState,
} from "@/components/shared-admin";

type AdminView =
  | "leadership"
  | "classes"
  | "teachers"
  | "students"
  | "attendance"
  | "ai"
  | "fees"
  | "timetable"
  | "year-cycle"
  | "teacher-performance"
  | "exam-cycles"
  | "report-cards";

export default function CampusAdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<AdminView>("leadership");
  const [showClassModal, setShowClassModal] = useState(false);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [movingStudent, setMovingStudent] = useState<any>(null);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [showAddPrincipalForm, setShowAddPrincipalForm] = useState(false);
  const [classForm, setClassForm] = useState<ClassFormState>({
    name: "",
    section: "",
    academicYear: new Date().getFullYear(),
    classTeacherId: "",
  });
  const [moveClassId, setMoveClassId] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [movingStudentBusy, setMovingStudentBusy] = useState(false);
  const [savingClassTeacherId, setSavingClassTeacherId] = useState<string | null>(null);
  const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
  const [creatingSubjectClassId, setCreatingSubjectClassId] = useState<string | null>(null);
  const [applyingSubjectClassId, setApplyingSubjectClassId] = useState<string | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showAddTeacherForm, setShowAddTeacherForm] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [savingClassUpdate, setSavingClassUpdate] = useState(false);
  const [savingStudentUpdate, setSavingStudentUpdate] = useState(false);
  const [savingSubjectUpdateId, setSavingSubjectUpdateId] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [selectedReportCard, setSelectedReportCard] = useState<any>(null);
  const [sendingReport, setSendingReport] = useState<string | null>(null);
  const [remarkGeneratingFor, setRemarkGeneratingFor] = useState<string | null>(null);
  const [savingRemarks, setSavingRemarks] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const nextData = await getCampusDashboardData();
      setData(nextData);
      return nextData;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const exportStudentsCSV = () => {
    const students = data?.students || [];
    if (!students.length) return toast.error("No student data to export");
    const headers = ["Full Name,Roll No,Gender,Class,Guardian Name,Guardian Phone,Guardian Email"];
    const rows = students.map((s: any) =>
      [
        `"${s.fullName}"`,
        s.rollNo,
        s.gender || "MALE",
        s.class ? `${s.class.name} ${s.class.section || ""}`.trim() : "",
        `"${s.guardianName || ""}"`,
        s.guardianPhone || "",
        s.guardianEmail || "",
      ].join(",")
    );
    const csv = [...headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.campusName.replace(/\s+/g, "_")}_students.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${students.length} students exported`);
  };

  const openAddStaff = (role: "CAMPUS_ADMIN" | "PRINCIPAL") => {
    if (role === "CAMPUS_ADMIN") setShowAddAdminForm(true);
    else setShowAddPrincipalForm(true);
  };

  const openAdmissionForm = () => {
    setShowAdmissionForm(true);
  };

  const openMoveStudent = (student: any) => {
    setMovingStudent(student);
    setMoveClassId("");
  };

  const syncSelectedClass = (nextData: any, classId: string) => {
    const nextClass = nextData?.classes?.find((item: any) => item.id === classId);
    if (nextClass) setSelectedClass(nextClass);
  };

  const handleCreateClass = async () => {
    if (!classForm.name.trim()) return toast.error("Class name is required");
    setSavingClass(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: classForm.name.trim(),
          section: "",
          academicYear: classForm.academicYear,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Class could not be created");
      toast.success("Class created");
      setShowClassModal(false);
      setClassForm({ name: "", section: "", academicYear: new Date().getFullYear(), classTeacherId: "" });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Class could not be created");
    } finally {
      setSavingClass(false);
    }
  };

  const handleAdmissionSuccess = () => {
    setShowAdmissionForm(false);
    loadData();
  };

  const handleAddSection = async (name: string, section: string, academicYear: number) => {
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, section, sections: [section], academicYear }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Section could not be created");
      toast.success(`Section "${section}" created`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Section could not be created");
    }
  };

  const handleMoveStudent = async () => {
    if (!movingStudent || !moveClassId || moveClassId === (movingStudent.class?.id || movingStudent.classId)) return;
    setMovingStudentBusy(true);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: movingStudent.id, classId: moveClassId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Student could not be moved");
      const moved = result.data;
      const cls = moved?.class ? [moved.class.name, moved.class.section].filter(Boolean).join(" ") : "";
      toast.success(moved?.rollNo ? `Moved to ${cls} — new roll: ${moved.rollNo}` : "Student moved");
      setMovingStudent(null);
      setMoveClassId("");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Student could not be moved");
    } finally {
      setMovingStudentBusy(false);
    }
  };

  const handleChangeClassTeacher = async (classId: string, classTeacherId: string) => {
    setSavingClassTeacherId(classId);
    try {
      const res = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, classTeacherId: classTeacherId || null }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Class teacher could not be updated");
      toast.success("Class teacher updated");
      setSelectedClass((current: any) =>
        current?.id === classId
          ? { ...current, classTeacher: result.data?.classTeacher || null, _count: result.data?._count || current._count }
          : current
      );
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Class teacher could not be updated");
    } finally {
      setSavingClassTeacherId(null);
    }
  };

  const handleCreateSubject = async (
    classId: string,
    subject: { name: string; totalMarks: number; teacherId: string }
  ) => {
    if (!subject.name.trim()) {
      toast.error("Subject name is required");
      return false;
    }

    setCreatingSubjectClassId(classId);
    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          name: subject.name.trim(),
          totalMarks: subject.totalMarks || 100,
          teacherId: subject.teacherId || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Subject could not be created");
      toast.success("Subject added");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subject could not be created");
      return false;
    } finally {
      setCreatingSubjectClassId(null);
    }
  };

  const handleChangeSubjectTeacher = async (classId: string, subjectId: string, teacherId: string) => {
    setSavingSubjectId(subjectId);
    try {
      const res = await fetch("/api/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subjectId, teacherId: teacherId || null }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Subject teacher could not be updated");
      toast.success("Subject teacher updated");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subject teacher could not be updated");
    } finally {
      setSavingSubjectId(null);
    }
  };

  const handleApplyClassTeacherToSubjects = async (classId: string, classTeacherId: string, subjects: any[]) => {
    if (!classTeacherId) return toast.error("Select a class teacher first");
    if (!subjects.length) return toast.info("Add subjects first, then apply the class teacher.");

    setApplyingSubjectClassId(classId);
    try {
      const classRes = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, classTeacherId }),
      });
      const classResult = await classRes.json();
      if (!classRes.ok) throw new Error(classResult.error || "Class teacher could not be updated");

      await Promise.all(
        subjects.map(async (subject) => {
          const res = await fetch("/api/subjects", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: subject.id, teacherId: classTeacherId }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "One subject could not be updated");
        })
      );

      toast.success("Class teacher applied to all subjects");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Teacher assignment could not be applied");
    } finally {
      setApplyingSubjectClassId(null);
    }
  };

  const handleStaffAdded = async () => {
    setShowAddAdminForm(false);
    setShowAddPrincipalForm(false);
    await loadData();
  };

  const handleRemove = async (userId: string, label: string) => {
    if (userId === data?.currentUserId) {
      toast.info("Your owner account stays active so this campus remains manageable.");
      return;
    }

    setConfirmAction({
      title: `Revoke ${label} access?`,
      description: `This will remove the selected ${label.toLowerCase()} from this campus workspace.`,
      confirmLabel: "Revoke access",
      run: async () => {
        await removeStaff(userId);
        toast.success(`${label} access revoked`);
        await loadData();
      },
    });
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      await resendInvitation(inviteId);
      toast.success("Invitation resent");
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    setConfirmAction({
      title: "Cancel invitation?",
      description: "The invited person will no longer be able to use this invitation link.",
      confirmLabel: "Cancel invite",
      run: async () => {
        await cancelInvitation(inviteId);
        toast.success("Invitation cancelled");
        await loadData();
      },
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction.run();
      setConfirmAction(null);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleDeleteClass = (cls: any) => {
    setConfirmAction({
      title: `Delete ${classLabel(cls)}?`,
      description: "This will permanently remove this class and all its subjects if no marks exist. Students must be moved first.",
      confirmLabel: "Delete Class",
      run: async () => {
        const res = await fetch(`/api/classes?id=${cls.id}`, { method: "DELETE" });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Class could not be deleted");
        toast.success("Class deleted");
        setSelectedClass(null);
        await loadData();
      },
    });
  };

  const handleDeleteStudent = (student: any) => {
    setConfirmAction({
      title: `Delete ${student.fullName}?`,
      description: "This will permanently remove this student record. This cannot be undone.",
      confirmLabel: "Delete Student",
      run: async () => {
        const res = await fetch(`/api/students?id=${student.id}`, { method: "DELETE" });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Student could not be deleted");
        toast.success("Student deleted");
        setSelectedStudent(null);
        await loadData();
      },
    });
  };

  const handleDeleteSubject = (subject: any) => {
    setConfirmAction({
      title: `Delete ${subject.name}?`,
      description: "This will permanently remove this subject. Subjects with existing marks cannot be deleted.",
      confirmLabel: "Delete Subject",
      run: async () => {
        const res = await fetch(`/api/subjects?id=${subject.id}`, { method: "DELETE" });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Subject could not be deleted");
        toast.success("Subject deleted");
        await loadData();
      },
    });
  };

  const handleUpdateClass = async (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => {
    setSavingClassUpdate(true);
    try {
      const res = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Class could not be updated");
      toast.success("Class updated");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Class could not be updated");
    } finally {
      setSavingClassUpdate(false);
    }
  };

  const handleUpdateStudent = async (studentId: string, updates: Record<string, any>) => {
    setSavingStudentUpdate(true);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: studentId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Student could not be updated");
      toast.success("Student updated");
      setSelectedStudent((current: any) =>
        current?.id === studentId ? { ...current, ...result.data } : current
      );
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Student could not be updated");
    } finally {
      setSavingStudentUpdate(false);
    }
  };

  const handleUpdateSubject = async (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => {
    setSavingSubjectUpdateId(subjectId);
    try {
      const res = await fetch("/api/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subjectId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Subject could not be updated");
      toast.success("Subject updated");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subject could not be updated");
    } finally {
      setSavingSubjectUpdateId(null);
    }
  };

  const handleUpdateTeacher = async (teacherId: string, updates: Record<string, any>) => {
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: teacherId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Teacher could not be updated");
      toast.success("Teacher updated");
      setSelectedTeacher((current: any) =>
        current?.id === teacherId ? { ...current, ...result.data } : current
      );
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Teacher could not be updated");
    }
  };

  const handleSendReportCard = async (reportCardId: string) => {
    setSendingReport(reportCardId);
    try {
      const res = await fetch(`/api/reports/${reportCardId}/send`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to send");
      toast.success(result.message || "Report card sent");
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setSendingReport(null); }
  };

  const handleSaveReportRemarks = async (reportCardId: string, remarks: { en: string; ur: string }) => {
    setSavingRemarks(true);
    try {
      const res = await fetch(`/api/reports/${reportCardId}/remarks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarksEn: remarks.en, remarksUr: remarks.ur }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save remarks");
      toast.success("Remarks saved");
      setSelectedReportCard((c: any) => c ? { ...c, remarksEn: remarks.en, remarksUr: remarks.ur } : c);
    } catch (error: any) { toast.error(error.message); }
    finally { setSavingRemarks(false); }
  };

  const handleGenerateStudentRemarks = async (studentId: string, examId: string) => {
    setRemarkGeneratingFor(studentId);
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, examId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to generate remarks");
      toast.success("Remarks generated");
    } catch (error: any) { toast.error(error.message); }
    finally { setRemarkGeneratingFor(null); }
  };

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Campus Control", active: activeView === "leadership", onClick: () => setActiveView("leadership") },
    { icon: School, label: "Academic Plan", active: activeView === "classes", onClick: () => setActiveView("classes") },
    { icon: Users, label: "Faculty Hub", active: activeView === "teachers", onClick: () => setActiveView("teachers") },
    { icon: GraduationCap, label: "Students", active: activeView === "students", onClick: () => setActiveView("students") },
    { icon: CalendarCheck, label: "Attendance", active: activeView === "attendance", onClick: () => setActiveView("attendance") },
    { icon: History, label: "Year Cycle", active: activeView === "year-cycle", onClick: () => setActiveView("year-cycle") },
    { icon: FileText, label: "Exam Cycles", active: activeView === "exam-cycles", onClick: () => setActiveView("exam-cycles") },
    { icon: Receipt, label: "Fees", active: activeView === "fees", onClick: () => setActiveView("fees") },
    { icon: Calendar, label: "Timetable", active: activeView === "timetable", onClick: () => setActiveView("timetable") },
    { icon: Award, label: "Teacher Performance", active: activeView === "teacher-performance", onClick: () => setActiveView("teacher-performance") },
    { icon: ClipboardList, label: "Report Cards", active: activeView === "report-cards", onClick: () => setActiveView("report-cards") },
    { icon: Sparkles, label: "AI Engine", active: activeView === "ai", onClick: () => setActiveView("ai") },
  ];
  const bottomItems: RoleNavItem[] = [];
  const adminAIFeatures = [
    { feature: "at_risk_students", label: "At-risk Students", placeholder: "Class, exam, or attendance focus" },
    { feature: "class_performance_summary", label: "Class Summary", placeholder: "Class or term" },
    { feature: "teacher_class_comparison", label: "Class Comparison", placeholder: "Classes or teachers to compare" },
    { feature: "intervention_suggestions", label: "Intervention", placeholder: "Student or class concern" },
    { feature: "pending_review_queue", label: "Review Queue", placeholder: "Optional priority note" },
  ];

  if (loading && !data) {
    return <AdminSkeleton standalone={true} />;
  }

  if (!data) return null;

  const canInvitePrincipal = !data.principal;

  return (
    <RoleShell
      tagline={data.campusName ? `${data.campusName}${data.campusCity ? ` · ${data.campusCity}` : ""}` : "Campus"}
      navItems={navItems}
      bottomItems={bottomItems}
      searchPlaceholder="Search campus records..."
      userName={data.adminName}
      userRole="School Group Campus"
      avatarSeed={data.adminEmail || data.adminName}
      dashboardHref="/admin"
      headerActions={null}
    >
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20">
          {activeView === "leadership" ? (
            <LeadershipPanel
              data={data}
              onInviteAdmin={() => openAddStaff("CAMPUS_ADMIN")}
              onInvitePrincipal={() => openAddStaff("PRINCIPAL")}
              onRemove={handleRemove}
              onResend={handleResendInvite}
              onCancel={handleCancelInvite}
              onActivityLog={() => setShowActivityLogModal(true)}
            />
          ) : null}

          {activeView === "classes" ? (
            <AcademicPanel
              classes={data.classes}
              exams={data.recentExams}
              reports={data.recentReportCards}
              teachers={data.teachers}
              students={data.students}
              campusName={data.campusName}
              onAddClass={() => setShowClassModal(true)}
              onAddStudent={openAdmissionForm}
              onViewClass={setSelectedClass}
              onChangeTeacher={handleChangeClassTeacher}
              onDeleteClass={handleDeleteClass}
              onUpdateClass={handleUpdateClass}
              onDeleteSubject={handleDeleteSubject}
              onUpdateSubject={handleUpdateSubject}
              onAddSection={(name, section, academicYear) => handleAddSection(name, section, academicYear)}
            />
          ) : null}

          {activeView === "teachers" ? (
            <FacultyPanel
              teachers={data.teachers}
              pendingInvites={data.pendingTeacherInvitations}
              onInvite={() => setShowAddTeacherForm(true)}
              onRemove={(id) => handleRemove(id, "Teacher")}
              onViewTeacher={setSelectedTeacher}
              onResend={handleResendInvite}
              onCancel={handleCancelInvite}
            />
          ) : null}

          {activeView === "students" ? (
            <StudentsPanel
              students={data.students}
              classes={data.classes}
              onAddStudent={openAdmissionForm}
              onViewStudent={setSelectedStudent}
              onBulkImport={() => setShowBulkImportModal(true)}
              onExport={exportStudentsCSV}
            />
          ) : null}

          {activeView === "attendance" ? (
            <UnifiedAttendancePanel />
          ) : null}

          {activeView === "ai" ? (
            <AIPanel
              features={adminAIFeatures}
              insights={data.aiInsights}
              reviewItems={data.pendingAIReviewItems}
              onComplete={loadData}
            />
          ) : null}

          {activeView === "fees" ? (
            <FeesPanel />
          ) : null}

          {activeView === "timetable" ? (
            <TimetablePanel />
          ) : null}

          {activeView === "year-cycle" ? (
            <div className="space-y-8">
              <CycleManagementPanel />
              <div className="border-t border-[#cfc2d6]/15 pt-6">
                <h3 className="text-sm font-bold text-[#1d1b20] mb-4">Year History & Student Promotion</h3>
                <AcademicYearPanel />
              </div>
            </div>
          ) : null}

          {activeView === "teacher-performance" ? (
            <TeacherPerformancePanel />
          ) : null}

          {activeView === "exam-cycles" ? (
            <ExamCyclesPanel exams={data.recentExams} onSelect={setSelectedExam} />
          ) : null}

          {activeView === "report-cards" ? (
            <ReportCardsPanel reports={data.recentReportCards} onSelect={setSelectedReportCard} />
          ) : null}
        </div>
      </section>

      {showAddAdminForm && (
        <AddStaffForm role="CAMPUS_ADMIN" onSuccess={handleStaffAdded} onClose={() => setShowAddAdminForm(false)} />
      )}

      {showAddPrincipalForm && (
        <AddStaffForm role="PRINCIPAL" onSuccess={handleStaffAdded} onClose={() => setShowAddPrincipalForm(false)} />
      )}

      {showClassModal ? (
        <ClassModal
          form={classForm}
          teachers={data.teachers}
          busy={savingClass}
          onChange={setClassForm}
          onClose={() => setShowClassModal(false)}
          onSave={handleCreateClass}
        />
      ) : null}

      {showAdmissionForm && (
        <AdmissionForm
          classes={data.classes || []}
          classGroups={groupClasses(data.classes || [])}
          onSuccess={handleAdmissionSuccess}
          onClose={() => setShowAdmissionForm(false)}
        />
      )}

      {showAddTeacherForm && (
        <AddTeacherForm
          onSuccess={() => { setShowAddTeacherForm(false); loadData(); }}
          onClose={() => setShowAddTeacherForm(false)}
        />
      )}

      {movingStudent ? (
        <MoveStudentModal
          student={movingStudent}
          classes={data.classes}
          classId={moveClassId}
          busy={movingStudentBusy}
          onClassChange={setMoveClassId}
          onClose={() => setMovingStudent(null)}
          onSave={handleMoveStudent}
        />
      ) : null}

      {selectedClass ? (
        <ClassDetailModal
          cls={selectedClass}
          students={data.students.filter((student: any) => student.class?.id === selectedClass.id)}
          teachers={data.teachers}
          teacherBusy={savingClassTeacherId === selectedClass.id}
          subjectBusyId={savingSubjectId}
          creatingSubject={creatingSubjectClassId === selectedClass.id}
          applyingSubjects={applyingSubjectClassId === selectedClass.id}
          classUpdateBusy={savingClassUpdate}
          subjectUpdateBusyId={savingSubjectUpdateId}
          onClose={() => setSelectedClass(null)}
          onChangeTeacher={handleChangeClassTeacher}
          onCreateSubject={handleCreateSubject}
          onChangeSubjectTeacher={handleChangeSubjectTeacher}
          onApplyClassTeacherToSubjects={handleApplyClassTeacherToSubjects}
          onAddStudent={() => {
            setSelectedClass(null);
            openAdmissionForm();
          }}
          onViewStudent={(student) => {
            setSelectedClass(null);
            setSelectedStudent(student);
          }}
          onDeleteClass={handleDeleteClass}
          onUpdateClass={handleUpdateClass}
          onDeleteSubject={handleDeleteSubject}
          onUpdateSubject={handleUpdateSubject}
        />
      ) : null}

      {selectedStudent ? (
        <StudentDetailModal
          student={selectedStudent}
          busy={savingStudentUpdate}
          onClose={() => setSelectedStudent(null)}
          onMove={() => {
            openMoveStudent(selectedStudent);
            setSelectedStudent(null);
          }}
          onDelete={handleDeleteStudent}
          onUpdate={handleUpdateStudent}
        />
      ) : null}

      {selectedTeacher ? (
        <TeacherDetailModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} onUpdate={handleUpdateTeacher} />
      ) : null}

      <BulkImportDialog
        open={showBulkImportModal}
        onOpenChange={setShowBulkImportModal}
        classes={data.classes || []}
        defaultClassId={data.classes?.[0]?.id || ""}
        onSuccess={loadData}
      />

      {showActivityLogModal ? (
        <ActivityLogModal onClose={() => setShowActivityLogModal(false)} />
      ) : null}

      {showHelpModal ? <HelpModal onClose={() => setShowHelpModal(false)} /> : null}

      <ConfirmAction
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ""}
        description={confirmAction?.description || ""}
        confirmLabel={confirmAction?.confirmLabel || "Confirm"}
        tone="danger"
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />

      {selectedExam ? (
        <ExamDetailModal
          exam={selectedExam}
          onClose={() => setSelectedExam(null)}
          onViewReportCard={setSelectedReportCard}
          onRefresh={loadData}
        />
      ) : null}

      {selectedReportCard ? (
        <ReportCardDetailModal
          report={selectedReportCard}
          busy={sendingReport === selectedReportCard.id}
          remarkBusy={remarkGeneratingFor}
          savingRemarks={savingRemarks}
          onClose={() => setSelectedReportCard(null)}
          onSend={() => handleSendReportCard(selectedReportCard.id)}
          onGenerateRemarks={(studentId, examId) => handleGenerateStudentRemarks(studentId, examId)}
          onSaveRemarks={(remarks) => handleSaveReportRemarks(selectedReportCard.id, remarks)}
        />
      ) : null}
    </RoleShell>
  );
}
function SkeletonBlock({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div
      className={`skeleton-shimmer rounded-2xl bg-[#e8e0ec]/40 animate-skeleton-in ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    />
  );
}

function SkeletonCircle({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div
      className={`skeleton-shimmer rounded-full bg-[#e8e0ec]/40 animate-skeleton-in ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    />
  );
}

function AdminSkeleton({ standalone }: { standalone?: boolean }) {
  return (
    <div className="min-h-screen bg-[#fbf0fe] flex font-sans">
      {/* Sidebar Skeleton */}
      <div className="hidden md:flex w-64 shrink-0 flex-col bg-white/70 border-r border-[#cfc2d6]/15 p-6 gap-4">
        <div className="flex items-center gap-3 mb-6">
          <SkeletonBlock className="h-10 w-10 rounded-xl" />
          <SkeletonBlock className="h-6 w-28 rounded-lg" delay={50} />
        </div>
        <SkeletonBlock className="h-3 w-20 rounded-md" delay={80} />
        <div className="space-y-2 mt-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${100 + i * 30}ms` }}>
              <SkeletonBlock className="h-5 w-5 rounded-lg shrink-0" delay={100 + i * 30} />
              <SkeletonBlock className={`h-4 rounded-lg ${i % 3 === 0 ? "w-28" : i % 3 === 1 ? "w-24" : "w-20"}`} delay={120 + i * 30} />
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Skeleton */}
      <main className="flex-1 p-4 md:p-8 flex flex-col h-screen md:ml-0">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-8 rounded-[28px] bg-white/40 border border-[#cfc2d6]/10 px-5 py-3">
          <div className="flex items-center gap-4">
            <SkeletonBlock className="h-9 w-9 rounded-xl" />
            <div className="hidden sm:block space-y-1.5">
              <SkeletonBlock className="h-4 w-44 rounded-lg" delay={40} />
              <SkeletonBlock className="h-3 w-56 rounded-md" delay={60} />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <SkeletonBlock className="h-7 w-20 rounded-full" delay={80} />
            <SkeletonBlock className="h-9 w-9 rounded-xl" delay={100} />
            <SkeletonBlock className="h-9 w-9 rounded-xl" delay={120} />
            <div className="flex items-center gap-2 rounded-2xl border border-[#cfc2d6]/10 p-1 pr-3">
              <SkeletonCircle className="h-8 w-8" delay={140} />
              <SkeletonBlock className="h-3 w-16 rounded-md hidden sm:block" delay={160} />
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="bg-white rounded-[40px] shadow-2xl flex-1 overflow-hidden p-8">
          {/* Page Header Banner Skeleton */}
          <div className="rounded-[32px] bg-gradient-to-br from-[#fbf0fe]/80 via-white to-[#f3eeff]/50 border border-[#cfc2d6]/10 p-7 mb-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-10 w-10 rounded-2xl" />
                <div className="space-y-2">
                  <SkeletonBlock className="h-3 w-24 rounded-md" delay={40} />
                  <SkeletonBlock className="h-4 w-32 rounded-md" delay={60} />
                  <SkeletonBlock className="h-2.5 w-64 rounded-md" delay={80} />
                </div>
              </div>
              <div className="flex gap-2">
                <SkeletonBlock className="h-10 w-28 rounded-2xl" delay={100} />
                <SkeletonBlock className="h-10 w-36 rounded-2xl" delay={120} />
                <SkeletonBlock className="h-10 w-28 rounded-2xl" delay={140} />
              </div>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_2.2fr] gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Donut Chart Card Skeleton */}
              <div className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <div className="space-y-1.5">
                    <SkeletonBlock className="h-3 w-16 rounded-md" delay={160} />
                    <SkeletonBlock className="h-5 w-28 rounded-md" delay={180} />
                  </div>
                  <SkeletonBlock className="h-10 w-10 rounded-2xl" delay={200} />
                </div>
                <div className="flex items-center gap-6">
                  <SkeletonCircle className="h-[130px] w-[130px] shrink-0" delay={220} />
                  <div className="flex-1 space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <SkeletonCircle className="h-2.5 w-2.5" delay={240 + i * 30} />
                          <SkeletonBlock className="h-3 w-14 rounded-md" delay={260 + i * 30} />
                        </div>
                        <SkeletonBlock className="h-3 w-6 rounded-md" delay={280 + i * 30} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Campus Identity Card Skeleton */}
              <div className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <div className="space-y-1.5">
                    <SkeletonBlock className="h-3 w-14 rounded-md" delay={300} />
                    <SkeletonBlock className="h-5 w-32 rounded-md" delay={320} />
                  </div>
                  <SkeletonBlock className="h-10 w-10 rounded-2xl" delay={340} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl bg-[#fbf0fe]/20 px-3 py-2.5">
                      <SkeletonBlock className="h-6 w-6 rounded-lg shrink-0" delay={360 + i * 25} />
                      <div className="space-y-1 flex-1">
                        <SkeletonBlock className="h-2 w-10 rounded-sm" delay={380 + i * 25} />
                        <SkeletonBlock className="h-3 w-16 rounded-sm" delay={400 + i * 25} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Admin Team Card Skeleton */}
              <div className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <div className="space-y-1.5">
                    <SkeletonBlock className="h-3 w-10 rounded-md" delay={180} />
                    <SkeletonBlock className="h-5 w-24 rounded-md" delay={200} />
                  </div>
                  <div className="flex items-center gap-2">
                    <SkeletonBlock className="h-6 w-16 rounded-full" delay={220} />
                    <SkeletonBlock className="h-6 w-24 rounded-full" delay={240} />
                  </div>
                </div>
                <div className="space-y-3">
                  {[0, 1].map((i) => (
                    <div key={i} className="bg-[#fbf0fe]/20 p-5 rounded-[28px]">
                      <div className="flex items-center gap-5">
                        <SkeletonBlock className="h-14 w-14 rounded-2xl shrink-0" delay={260 + i * 60} />
                        <div className="flex-1 min-w-0 space-y-2">
                          <SkeletonBlock className="h-4 w-36 rounded-md" delay={280 + i * 60} />
                          <SkeletonBlock className="h-3 w-48 rounded-md" delay={300 + i * 60} />
                          <SkeletonBlock className="h-3 w-24 rounded-md" delay={320 + i * 60} />
                        </div>
                        <SkeletonBlock className="h-10 w-20 rounded-xl shrink-0" delay={340 + i * 60} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Principal Card Skeleton */}
              <div className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <div className="space-y-1.5">
                    <SkeletonBlock className="h-3 w-16 rounded-md" delay={400} />
                    <SkeletonBlock className="h-5 w-20 rounded-md" delay={420} />
                  </div>
                  <SkeletonBlock className="h-10 w-10 rounded-2xl" delay={440} />
                </div>
                <div className="flex items-center gap-5">
                  <SkeletonBlock className="h-16 w-16 rounded-2xl shrink-0" delay={460} />
                  <div className="flex-1 min-w-0 space-y-2">
                    <SkeletonBlock className="h-4 w-40 rounded-md" delay={480} />
                    <SkeletonBlock className="h-3 w-48 rounded-md" delay={500} />
                    <SkeletonBlock className="h-5 w-16 rounded-full" delay={520} />
                  </div>
                  <SkeletonBlock className="h-10 w-20 rounded-xl shrink-0" delay={540} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
