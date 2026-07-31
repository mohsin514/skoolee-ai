"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle, Award, BookOpen, Briefcase, Building, Calendar, CalendarCheck, Check, CheckCircle2, ChevronDown, ClipboardList, Clock, Copy, Download,
  ExternalLink, FileText, GraduationCap, Heart, HelpCircle, History, LayoutGrid, Loader2, LogOut, Mail, MapPin, MessageSquare, Pencil, Plus,
  Receipt, School, Send, Shield, ShieldCheck, Sparkles, Trash2, TrendingUp, Upload, User, UserCheck, Users, X, type LucideIcon,
} from "lucide-react";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelInvitation, removeStaff, resendInvitation } from "@/app/actions/invite";
import {
  AiActionPanel, AIReviewQueue, BrandButton, EmptyState, ManagementCard, RoleShell, StatCard, type RoleNavItem,
} from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { CornerSparkles } from "@/components/CornerSparkles";
import { usePrincipalData } from "./principal-data-context";
import { AdmissionForm } from "@/app/dashboard/students/admission-form";
import { BulkImportDialog } from "@/app/dashboard/students/bulk-import-dialog";
import { AddTeacherForm } from "@/components/teacher/add-teacher-form";
import { AddStaffForm } from "@/components/staff/add-staff-form";
import { AttendanceOverview } from "@/components/attendance/attendance-overview";
import { FeesPanel } from "@/components/fees/FeesPanel";
import { TimetablePanel } from "@/components/timetable/TimetablePanel";
import { AcademicYearPanel } from "@/components/academic-year/AcademicYearPanel";
import { CycleManagementPanel } from "@/components/academic-year/CycleManagementPanel";
import { TeacherAttendancePanel } from "@/components/academic-year/TeacherAttendancePanel";
import { TeacherPerformancePanel } from "@/components/academic-year/TeacherPerformancePanel";

type PrincipalView = "overview" | "academics" | "faculty" | "reports" | "engagement" | "students" | "attendance" | "ai" | "fees" | "timetable" | "year-cycle" | "teacher-performance";
type ReportAction = "generate" | "pdf" | "review" | "publish" | "send";
type ClassFormState = { name: string; section: string; sections: string; academicYear: number; classTeacherId: string; };
type StudentFormState = { fullName: string; rollNo: string; gender: string; classId: string; guardianName: string; guardianPhone: string; guardianEmail: string; };

const viewCopy: Record<PrincipalView, { title: string; description: string }> = {
  overview: { title: "Academic Review", description: "Live review of students, teachers, exams, report cards, engagement, and AI drafts." },
  academics: { title: "Academic Plan", description: "Manage class structure, teachers, subjects, enrollment, attendance, and fees." },
  faculty: { title: "Faculty Review", description: "Inspect and manage teachers, subject ownership, and class leadership." },
  reports: { title: "Reports Hub", description: "Approve remarks, mark exams reviewed, publish report cards, and send parent delivery." },
  engagement: { title: "Parent Engagement", description: "Track parent communication delivery, blocked messages, no-contact records, and automation runs." },
  students: { title: "Student Directory", description: "Search, filter, and manage student profiles across classes and sections." },
  attendance: { title: "Attendance Tracker", description: "Monitor daily attendance, view class-wise and school-wide reports, and identify at-risk students." },
  ai: { title: "AI Insights", description: "AI-powered analysis and review items for academic oversight." },
  fees: { title: "Fee Management", description: "Manage fee structures, generate invoices, and process payments." },
  timetable: { title: "Timetable Manager", description: "Create and publish class schedules, assign subjects and teachers, and detect scheduling conflicts." },
  "year-cycle": { title: "Academic Year Cycle", description: "Close academic years, promote students to next class, and view historical records." },
  "teacher-performance": { title: "Teacher Performance", description: "Evaluate teacher accountability based on class results and attendance." },
};

const principalAIFeatures = [
  { feature: "at_risk_students", label: "At-risk Students", placeholder: "Optional exam, class, or attendance focus" },
  { feature: "class_performance_summary", label: "Class Summary", placeholder: "Class or exam focus" },
  { feature: "teacher_class_comparison", label: "Class Comparison", placeholder: "Classes, teachers, or term to compare" },
  { feature: "intervention_suggestions", label: "Intervention Plan", placeholder: "Student or class concern" },
  { feature: "pending_review_queue", label: "Review Queue", placeholder: "Optional priority note" },
];

function statusTone(status?: string) {
  if (status === "PUBLISHED" || status === "SENT" || status === "APPROVED" || status === "CONNECTED" || status === "ACTIVE") return "bg-emerald-50 text-emerald-600";
  if (status === "PRINCIPAL_REVIEWED" || status === "REVIEWED" || status === "ONBOARDING") return "bg-[#fbf0fe] text-[#8127cf]";
  if (status === "FAILED" || status === "BLOCKED") return "bg-rose-50 text-rose-600";
  if (status === "NO_RECIPIENT" || status === "LOCKED" || status === "NO_REPORT") return "bg-amber-50 text-amber-600";
  return "bg-[#f3f4f9] text-[#4d4354]/70";
}

function formatStatus(status?: string) { return (status || "Pending").replaceAll("_", " "); }
function formatDate(value?: string | Date | null) { if (!value) return "Not yet"; return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function sectionLabel(cls: any) { if (!cls) return ""; return [cls.name, cls.section].filter(Boolean).join(" - "); }
function classLabel(item: any) { if (!item) return "Unassigned"; return [item.name, item.section].filter(Boolean).join(" "); }
function classGroupKey(item: any) { return `${item?.academicYear || ""}::${item?.name || ""}`; }
function groupClasses(classes: any[]) {
  const groups = new Map<string, { key: string; name: string; academicYear: number | string; sections: any[] }>();
  for (const cls of classes || []) {
    const key = classGroupKey(cls);
    const existing = groups.get(key);
    if (existing) { existing.sections.push(cls); }
    else { groups.set(key, { key, name: cls.name || "Class", academicYear: cls.academicYear || "N/A", sections: [cls] }); }
  }
  return [...groups.values()].map((group) => ({ ...group, sections: group.sections.sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b))) }));
}
function percentLabel(value?: number | null) { return `${Number(value || 0).toFixed(1)}%`; }
function formatPendingInviteFromInvite(invite: any) { return { inviteId: invite.id, email: invite.email, role: invite.role, status: new Date() > invite.expiresAt ? "Expired" : "Invited", expiresAt: invite.expiresAt }; }

export default function PrincipalDashboard() {
  const router = useRouter();
  const { data, loading, refetch } = usePrincipalData();
  const [activeView, setActiveView] = useState<PrincipalView>("overview");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editedRemarks, setEditedRemarks] = useState({ en: "", ur: "" });
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [showMoveStudentModal, setShowMoveStudentModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showAddTeacherForm, setShowAddTeacherForm] = useState(false);
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [showAddPrincipalForm, setShowAddPrincipalForm] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [classForm, setClassForm] = useState<ClassFormState>({ name: "", section: "", sections: "", academicYear: new Date().getFullYear(), classTeacherId: "" });
  const [moveClassId, setMoveClassId] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [movingStudentBusy, setMovingStudentBusy] = useState(false);
  const [savingClassTeacherId, setSavingClassTeacherId] = useState<string | null>(null);
  const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
  const [creatingSubjectClassId, setCreatingSubjectClassId] = useState<string | null>(null);
  const [applyingSubjectClassId, setApplyingSubjectClassId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; description: string; confirmLabel: string; run: () => Promise<void> } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [savingClassUpdate, setSavingClassUpdate] = useState(false);
  const [savingStudentUpdate, setSavingStudentUpdate] = useState(false);
  const [savingSubjectUpdateId, setSavingSubjectUpdateId] = useState<string | null>(null);

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); };

  const exportStudentsCSV = () => {
    const students = data?.students || [];
    if (!students.length) return toast.error("No student data to export");
    const headers = ["Full Name,Roll No,Gender,Class,Guardian Name,Guardian Phone,Guardian Email"];
    const rows = students.map((s: any) => [`"${s.fullName}"`, s.rollNo, s.gender || "MALE", s.class ? `${s.class.name} ${s.class.section || ""}`.trim() : "", `"${s.guardianName || ""}"`, s.guardianPhone || "", s.guardianEmail || ""].join(","));
    const csv = [...headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${data.campusName.replace(/\s+/g, "_")}_students.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const handleCreateClass = async () => {
    if (!classForm.name) return toast.error("Class name is required");
    setSavingClass(true);
    try {
      const sectionList = classForm.sections ? classForm.sections.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) : classForm.section ? [classForm.section.trim()] : [""];
      const res = await fetch("/api/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: classForm.name, sections: sectionList, academicYear: classForm.academicYear, classTeacherId: classForm.classTeacherId || undefined }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create class");
      toast.success(`Created ${sectionList.length} section(s)`);
      setShowClassModal(false);
      setClassForm({ name: "", section: "", sections: "", academicYear: new Date().getFullYear(), classTeacherId: "" });
      await refetch();
    } catch (error: any) { toast.error(error.message); } finally { setSavingClass(false); }
  };

  const handleAdmissionSuccess = () => {
    setShowAdmissionForm(false);
    refetch();
  };

  const handleMoveStudent = async () => {
    if (!selectedStudent || !moveClassId || moveClassId === (selectedStudent.class?.id || selectedStudent.classId)) return;
    setMovingStudentBusy(true);
    try {
      const res = await fetch("/api/students", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedStudent.id, classId: moveClassId }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to move student");
      const moved = result.data;
      const cls = moved?.class ? [moved.class.name, moved.class.section].filter(Boolean).join(" ") : "";
      toast.success(moved?.rollNo ? `Moved to ${cls} — new roll: ${moved.rollNo}` : "Student moved");
      setShowMoveStudentModal(false); setSelectedStudent(null); await refetch();
    } catch (error: any) { toast.error(error.message); } finally { setMovingStudentBusy(false); }
  };

  const handleStaffAdded = async () => {
    setShowAddAdminForm(false);
    setShowAddPrincipalForm(false);
    await refetch();
  };

  const handleRemove = async (userId: string, label: string) => {
    setConfirmAction({ title: `Remove ${label}`, description: `Are you sure you want to remove this ${label.toLowerCase()}? This action cannot be undone.`, confirmLabel: "Remove", run: async () => { setConfirmBusy(true); try { await removeStaff(userId); toast.success(`${label} removed`); await refetch(); } catch (error: any) { toast.error(error.message); } finally { setConfirmBusy(false); } } });
  };

  const handleResendInvite = async (inviteId: string) => { try { await resendInvitation(inviteId); toast.success("Invitation resent"); await refetch(); } catch (error: any) { toast.error(error.message); } };
  const handleCancelInvite = async (inviteId: string) => { try { await cancelInvitation(inviteId); toast.success("Invitation cancelled"); await refetch(); } catch (error: any) { toast.error(error.message); } };

  const handleChangeClassTeacher = async (classId: string, teacherId: string) => {
    setSavingClassTeacherId(classId);
    try { const res = await fetch(`/api/classes/${classId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classTeacherId: teacherId || null }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to update class teacher"); toast.success("Class teacher updated"); await refetch(); }
    catch (error: any) { toast.error(error.message); } finally { setSavingClassTeacherId(null); }
  };

  const handleUpdateClass = async (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => {
    setSavingClassUpdate(true);
    try { const res = await fetch(`/api/classes/${classId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to update class"); toast.success("Class updated"); await refetch(); }
    catch (error: any) { toast.error(error.message); } finally { setSavingClassUpdate(false); }
  };

  const handleUpdateStudent = async (studentId: string, updates: { fullName?: string; rollNo?: number; guardianName?: string; guardianPhone?: string; guardianEmail?: string }) => {
    setSavingStudentUpdate(true);
    try { const res = await fetch(`/api/students/${studentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to update student"); toast.success("Student updated"); await refetch(); }
    catch (error: any) { toast.error(error.message); } finally { setSavingStudentUpdate(false); }
  };

  const handleCreateSubject = async (classId: string, subject: { name: string; totalMarks: number; teacherId: string }) => {
    if (!subject.name.trim()) { toast.error("Subject name is required"); return false; }
    setCreatingSubjectClassId(classId);
    try { const res = await fetch("/api/subjects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId, name: subject.name.trim(), totalMarks: subject.totalMarks || 100, teacherId: subject.teacherId || undefined }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to create subject"); toast.success("Subject added"); await refetch(); return true; }
    catch (error: any) { toast.error(error.message); return false; } finally { setCreatingSubjectClassId(null); }
  };

  const handleUpdateSubject = async (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => {
    setSavingSubjectUpdateId(subjectId);
    try { const res = await fetch("/api/subjects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subjectId, ...updates }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to update subject"); toast.success("Subject updated"); await refetch(); }
    catch (error: any) { toast.error(error.message); } finally { setSavingSubjectUpdateId(null); }
  };

  const handleDeleteClass = (cls: any) => {
    const studentCount = cls._count?.students || 0;
    setConfirmAction({ title: "Delete Class", description: `Delete "${cls.name}${cls.section ? ` - ${cls.section}` : ""}"? This affects ${studentCount} student(s) and all subjects/exams.`, confirmLabel: "Delete", run: async () => { setConfirmBusy(true); try { const res = await fetch(`/api/classes/${cls.id}`, { method: "DELETE" }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to delete class"); toast.success("Class deleted"); await refetch(); } catch (error: any) { toast.error(error.message); } finally { setConfirmBusy(false); } } });
  };

  const handleDeleteStudent = (student: any) => {
    setConfirmAction({ title: "Delete Student", description: `Delete "${student.fullName}" (Roll: ${student.rollNo})? All associated records will be removed.`, confirmLabel: "Delete", run: async () => { setConfirmBusy(true); try { const res = await fetch(`/api/students/${student.id}`, { method: "DELETE" }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to delete student"); toast.success("Student deleted"); await refetch(); } catch (error: any) { toast.error(error.message); } finally { setConfirmBusy(false); } } });
  };

  const handleDeleteSubject = (subject: any) => {
    setConfirmAction({ title: "Delete Subject", description: `Delete "${subject.name}"? This will also remove all marks associated with this subject.`, confirmLabel: "Delete", run: async () => { setConfirmBusy(true); try { const res = await fetch(`/api/subjects?id=${subject.id}`, { method: "DELETE" }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to delete subject"); toast.success("Subject deleted"); await refetch(); } catch (error: any) { toast.error(error.message); } finally { setConfirmBusy(false); } } });
  };

  const handleUpdateTeacher = async (teacherId: string, updates: Record<string, any>) => {
    try { const res = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: teacherId, ...updates }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to update teacher"); toast.success("Teacher updated"); await refetch(); }
    catch (error: any) { toast.error(error.message); }
  };

  const runReportAction = async (examId: string, action: ReportAction, successMessage: string) => {
    setBusyAction(`${action}-${examId}`);
    try { const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId, action }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Report action failed"); toast.success(successMessage); await refetch(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Report action failed"); } finally { setBusyAction(null); }
  };

  const runRemarkDrafts = async (examId: string) => {
    setBusyAction(`ai-remarks-${examId}`);
    try { const res = await fetch("/api/ai/generate-remarks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch: true, examId, language: "both", tone: "encouraging" }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Remark generation failed"); toast.success(`Generated ${result.succeeded || 0} remark drafts`); await refetch(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Remark generation failed"); } finally { setBusyAction(null); }
  };

  const saveRemark = async (report: any, approve = false) => {
    setBusyAction(`remark-${report.id}`);
    try { const res = await fetch(`/api/reports/${report.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ remarksEn: editedRemarks.en, remarksUr: editedRemarks.ur, approve }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Could not save remarks"); toast.success(approve ? "Remarks approved" : "Remarks saved"); setEditingReportId(null); await refetch(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save remarks"); } finally { setBusyAction(null); }
  };

  const runAutomation = async () => {
    setBusyAction("communications");
    try { const res = await fetch("/api/communications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run-automation" }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Automation failed"); toast.success(`Processed ${result.processed} communication actions`); await refetch(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Automation failed"); } finally { setBusyAction(null); }
  };

  const openAdmissionForm = () => { setShowAdmissionForm(true); };
  const openAddStaff = (role: "CAMPUS_ADMIN" | "PRINCIPAL") => {
    if (role === "CAMPUS_ADMIN") setShowAddAdminForm(true);
    else setShowAddPrincipalForm(true);
  };

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Overview", active: activeView === "overview", onClick: () => setActiveView("overview") },
    { icon: School, label: "Academics", active: activeView === "academics", onClick: () => setActiveView("academics") },
    { icon: Users, label: "Faculty", active: activeView === "faculty", onClick: () => setActiveView("faculty") },
    { icon: GraduationCap, label: "Students", active: activeView === "students", onClick: () => setActiveView("students") },
    { icon: CalendarCheck, label: "Attendance", active: activeView === "attendance", onClick: () => setActiveView("attendance") },
    { icon: Receipt, label: "Fees", active: activeView === "fees", onClick: () => setActiveView("fees") },
    { icon: Calendar, label: "Timetable", active: activeView === "timetable", onClick: () => setActiveView("timetable") },
    { icon: FileText, label: "Reports", active: activeView === "reports", onClick: () => setActiveView("reports") },
    { icon: MessageSquare, label: "Engagement", active: activeView === "engagement", onClick: () => setActiveView("engagement") },
    { icon: Sparkles, label: "AI Insights", active: activeView === "ai", onClick: () => setActiveView("ai") },
    { icon: History, label: "Year Cycle", active: activeView === "year-cycle", onClick: () => setActiveView("year-cycle") },
    { icon: Award, label: "Teacher Performance", active: activeView === "teacher-performance", onClick: () => setActiveView("teacher-performance") },
  ];
  const bottomItems: RoleNavItem[] = [];
  const communicationTotals = useMemo(() => { const s = data?.communicationSummary || {}; return { sent: s.SENT || 0, failed: s.FAILED || 0, blocked: s.BLOCKED || 0, noContact: s.NO_RECIPIENT || 0 }; }, [data]);

  if (loading && !data) return <PrincipalSkeleton />;
  if (!data) return <PrincipalSkeleton />;

  const totalCollected = data.invoiceSummary?.byStatus?.reduce((sum: number, g: any) => { const paid = g.status === "PAID" || g.status === "PARTIAL"; return paid ? sum + (g._sum?.totalAmount || 0) : sum; }, 0) || 0;

  return (
    <RoleShell navItems={navItems} bottomItems={bottomItems} eyebrow={`${data.schoolName} - ${data.campusName}`} userName={data.principalName} userRole="Principal Authority" avatarSeed={data.principalName} dashboardHref="/principal">
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-[10px] font-black text-[#8127cf] uppercase tracking-normal mb-3">{data.schoolName} - {data.campusName}</p>
            <h2 className="text-4xl font-black tracking-normal text-[#1f1a23]">{viewCopy[activeView].title}</h2>
            <p className="text-sm font-semibold text-[#4d4354]/60 mt-3 max-w-2xl leading-relaxed">{viewCopy[activeView].description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeView === "academics" || activeView === "overview" ? <BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={() => setShowClassModal(true)}>Add Class</BrandButton> : null}
            {activeView === "students" || activeView === "overview" ? <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openAdmissionForm()} disabled={data.classes.length === 0}>Add Student</BrandButton> : null}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
          <StatCard icon={GraduationCap} label="Students" value={data.totalStudents} tone="green" onClick={() => setActiveView("students")} />
          <StatCard icon={Users} label="Teachers" value={data.totalTeachers} tone="purple" onClick={() => setActiveView("faculty")} />
          <StatCard icon={School} label="Classes" value={data.totalClasses} tone="rose" onClick={() => setActiveView("academics")} />
          <StatCard icon={FileText} label="Pending Reviews" value={data.pendingRemarkReviews} tone="dark" onClick={() => setActiveView("reports")} />
          <StatCard icon={Sparkles} label="AI Queue" value={data.pendingAIReviews || 0} tone="green" onClick={() => setActiveView("ai")} />
        </div>
        {activeView === "overview" ? <OverviewPanel data={data} communicationTotals={communicationTotals} onViewReports={() => setActiveView("reports")} onViewEngagement={() => setActiveView("engagement")} onComplete={() => { refetch(); }} /> : null}
        {activeView === "academics" ? <AcademicPanel classes={data.classes} exams={data.recentExams} reports={data.recentReportCards} teachers={data.teachers} students={data.students} attendanceRecords={data.attendanceRecords} attendanceSummary={data.attendanceSummary} invoiceSummary={data.invoiceSummary} campusName={data.campusName} onAddClass={() => setShowClassModal(true)} onAddStudent={openAdmissionForm} onViewClass={setSelectedClass} onChangeTeacher={handleChangeClassTeacher} onDeleteClass={handleDeleteClass} onUpdateClass={handleUpdateClass} onDeleteSubject={handleDeleteSubject} onUpdateSubject={handleUpdateSubject} /> : null}
        {activeView === "faculty" ? <FacultyPanel teachers={data.teachers} pendingInvites={data.pendingTeacherInvitations} campusAdmins={data.campusAdmins} pendingAdminInvites={data.pendingAdminInvitations} onInvite={(role) => { if (role === "TEACHER") { setShowAddTeacherForm(true); } else { openAddStaff(role as "CAMPUS_ADMIN" | "PRINCIPAL"); } }} onRemove={(id, label) => handleRemove(id, label)} onViewTeacher={setSelectedTeacher} onResend={handleResendInvite} onCancel={handleCancelInvite} /> : null}
        {activeView === "students" ? <StudentsPanel students={data.students} classes={data.classes} onAddStudent={openAdmissionForm} onMoveStudent={(student) => { setSelectedStudent(student); setMoveClassId(""); setShowMoveStudentModal(true); }} onViewStudent={setSelectedStudent} onBulkImport={() => setShowBulkImportModal(true)} onExport={exportStudentsCSV} onDeleteStudent={handleDeleteStudent} /> : null}
        {activeView === "attendance" ? (
          <div className="space-y-8">
            <AttendanceOverview />
            <div className="border-t border-[#cfc2d6]/15 pt-6">
              <h3 className="text-sm font-bold text-[#1d1b20] mb-4">Teacher Attendance</h3>
              <TeacherAttendancePanel readOnly />
            </div>
          </div>
        ) : null}
        {activeView === "reports" ? <ReportsPanel data={data} busyAction={busyAction} editingReportId={editingReportId} editedRemarks={editedRemarks} onRunAction={runReportAction} onGenerateRemarks={runRemarkDrafts} onEdit={(report) => { setEditingReportId(report.id); setEditedRemarks({ en: report.remarksEn || "", ur: report.remarksUr || "" }); }} onCancelEdit={() => setEditingReportId(null)} onRemarkChange={setEditedRemarks} onSaveRemark={saveRemark} /> : null}
        {activeView === "engagement" ? <EngagementPanel data={data} totals={communicationTotals} busy={busyAction === "communications"} onRunAutomation={runAutomation} /> : null}
        {activeView === "ai" ? <AIPanel insights={data.aiInsights} reviewItems={data.pendingAIReviewItems} onComplete={() => { refetch(); }} /> : null}
        {activeView === "fees" ? <FeesPanel /> : null}
        {activeView === "timetable" ? <TimetablePanel /> : null}
        {activeView === "year-cycle" ? (
          <div className="space-y-8">
            <CycleManagementPanel />
            <div className="border-t border-[#cfc2d6]/15 pt-6">
              <h3 className="text-sm font-bold text-[#1d1b20] mb-4">Year History & Student Promotion</h3>
              <AcademicYearPanel />
            </div>
          </div>
        ) : null}
        {activeView === "teacher-performance" ? <TeacherPerformancePanel /> : null}
      </section>

      <ClassModal open={showClassModal} onClose={() => setShowClassModal(false)} form={classForm} onChange={setClassForm} onSave={handleCreateClass} saving={savingClass} teachers={data.teachers} />
      {showAdmissionForm && (
        <AdmissionForm
          classes={data.classes || []}
          classGroups={groupClasses(data.classes || [])}
          onSuccess={handleAdmissionSuccess}
          onClose={() => setShowAdmissionForm(false)}
        />
      )}
      {selectedStudent && showMoveStudentModal ? <MoveStudentModal student={selectedStudent} classes={data.classes} selectedClassId={moveClassId} onSelectClass={setMoveClassId} onMove={handleMoveStudent} busy={movingStudentBusy} onClose={() => { setShowMoveStudentModal(false); setSelectedStudent(null); }} /> : null}
      {selectedClass ? <ClassDetailModal cls={selectedClass} teachers={data.teachers} onChangeTeacher={handleChangeClassTeacher} onUpdateClass={handleUpdateClass} onDeleteClass={handleDeleteClass} onCreateSubject={handleCreateSubject} creatingSubject={creatingSubjectClassId === selectedClass.id} onDeleteSubject={handleDeleteSubject} onUpdateSubject={handleUpdateSubject} onClose={() => setSelectedClass(null)} /> : null}
      {selectedStudent && !showMoveStudentModal ? <StudentDetailModal student={selectedStudent} busy={savingStudentUpdate} onUpdate={handleUpdateStudent} onDelete={handleDeleteStudent} onMove={() => { setMoveClassId(""); setShowMoveStudentModal(true); }} onClose={() => { setSelectedStudent(null); }} /> : null}
      {selectedTeacher ? <TeacherDetailModal teacher={selectedTeacher} onUpdate={handleUpdateTeacher} onClose={() => setSelectedTeacher(null)} /> : null}
      {showAddTeacherForm && (
        <AddTeacherForm
          onSuccess={() => { setShowAddTeacherForm(false); refetch(); }}
          onClose={() => setShowAddTeacherForm(false)}
        />
      )}
      {showAddAdminForm && (
        <AddStaffForm role="CAMPUS_ADMIN" onSuccess={handleStaffAdded} onClose={() => setShowAddAdminForm(false)} />
      )}
      {showAddPrincipalForm && (
        <AddStaffForm role="PRINCIPAL" onSuccess={handleStaffAdded} onClose={() => setShowAddPrincipalForm(false)} />
      )}
      <BulkImportDialog
        open={showBulkImportModal}
        onOpenChange={setShowBulkImportModal}
        classes={data.classes || []}
        defaultClassId={data.classes?.[0]?.id || ""}
        onSuccess={refetch}
      />
      {showActivityLogModal ? <ActivityLogModal onClose={() => setShowActivityLogModal(false)} /> : null}
      {showHelpModal ? <HelpModal onClose={() => setShowHelpModal(false)} /> : null}
      <ConfirmAction open={!!confirmAction} title={confirmAction?.title || ""} description={confirmAction?.description || ""} confirmLabel={confirmAction?.confirmLabel} busy={confirmBusy} onConfirm={async () => { if (confirmAction) { await confirmAction.run(); setConfirmAction(null); } }} onCancel={() => setConfirmAction(null)} />
    </RoleShell>
  );
}

function OverviewPanel({ data, communicationTotals, onViewReports, onViewEngagement, onComplete }: {
  data: any; communicationTotals: { sent: number; failed: number; blocked: number; noContact: number };
  onViewReports: () => void; onViewEngagement: () => void; onComplete: () => void | Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <div className="xl:col-span-2">
        <CollapsiblePanel icon={FileText} title="Report Card Queue" subtitle="Recent generated academic records"
          headerRight={<BrandButton variant="soft" onClick={onViewReports} icon={<FileText className="w-4 h-4" />}>Open Review</BrandButton>} defaultOpen>
          {data.recentReportCards.length > 0 ? (<div className="space-y-3">{data.recentReportCards.slice(0, 6).map((card: any) => (<div key={card.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-[#fbf0fe]/55 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 px-4 py-3"><div className="min-w-0"><p className="text-xs font-black text-[#1f1a23] truncate">{card.student?.fullName || "Student"}</p><p className="text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{card.exam?.title} · {card.grade || `${Math.round(card.percentage || 0)}%`}</p></div><StatusPill status={card.status} /></div>))}</div>) : (<EmptyState icon={FileText} title="No report cards yet" description="Locked exams and generated marks will appear here for academic review." />)}
        </CollapsiblePanel>
      </div>
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-white via-[#fbf0fe]/20 to-white p-6 rounded-[28px] border border-[#cfc2d6]/10 shadow-lg transition-all duration-300 hover:shadow-xl hover:border-[#8127cf]/15">
          <div className="flex items-center justify-between mb-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm"><MessageSquare className="w-5 h-5" /></div><p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-normal">Parent Engagement</p></div><button type="button" onClick={onViewEngagement} className="cursor-pointer text-[10px] font-black uppercase tracking-normal text-[#8127cf] hover:text-[#9c48ea]">View</button></div>
          <div className="space-y-3"><EngagementMetric icon={CheckCircle2} label="Sent" value={communicationTotals.sent} /><EngagementMetric icon={AlertCircle} label="Needs Attention" value={communicationTotals.failed + communicationTotals.blocked + communicationTotals.noContact} /><EngagementMetric icon={Sparkles} label="AI Review" value={data.pendingAIReviews || 0} /></div>
        </div>
        <div className="bg-gradient-to-br from-white via-[#fbf0fe]/20 to-white p-6 rounded-[28px] border border-[#cfc2d6]/10 shadow-lg relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:border-[#8127cf]/15"><CornerSparkles /><AiActionPanel title="Principal AI" options={principalAIFeatures} compact onComplete={onComplete} /></div>
        <div className="bg-gradient-to-br from-[#fbf0fe]/40 via-[#fbf0fe]/20 to-white p-6 rounded-[28px] border border-[#8127cf]/10 shadow-lg transition-all duration-300 hover:shadow-xl hover:border-[#8127cf]/20"><div className="flex items-center gap-3 mb-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 text-[#8127cf] shadow-sm"><Sparkles className="w-5 h-5" /></div><p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-normal">AI Review</p></div><AIReviewQueue items={data.pendingAIReviewItems} onComplete={onComplete} /></div>
        <div className="bg-gradient-to-br from-[#1f1a23] to-[#2d2533] p-8 rounded-[32px] text-white shadow-2xl relative overflow-hidden"><div className="absolute -top-16 -right-16 w-32 h-32 bg-gradient-to-bl from-[#8127cf]/15 to-transparent rounded-full blur-[60px] pointer-events-none" /><div className="absolute -bottom-8 -left-8 w-24 h-24 bg-gradient-to-tr from-[#b876f0]/10 to-transparent rounded-full blur-[40px] pointer-events-none" /><div className="relative"><p className="text-[10px] font-black uppercase tracking-normal text-white/50 mb-5">Campus Yield</p><div className="flex items-end gap-3 mb-4"><span className="text-5xl font-black tracking-normal">{data.averageMarks}%</span><TrendingUp className="w-8 h-8 text-emerald-400 mb-1" /></div><p className="text-[10px] font-bold text-white/40 uppercase tracking-normal">Average marks across submitted assessments</p></div></div>
      </div>
    </div>
  );
}

function AcademicPanel({ classes, exams, reports, teachers, students, attendanceRecords, attendanceSummary, invoiceSummary, campusName, onAddClass, onAddStudent, onViewClass, onChangeTeacher, onDeleteClass, onUpdateClass, onDeleteSubject, onUpdateSubject }: {
  classes: any[]; exams: any[]; reports: any[]; teachers: any[]; students?: any[]; attendanceRecords?: any[]; attendanceSummary?: { present: number; absent: number; leave: number }; invoiceSummary?: { total: number; totalAmount: number; byStatus: any[] }; campusName?: string; onAddClass: () => void; onAddStudent: (classId?: string) => void; onViewClass: (cls: any) => void; onChangeTeacher: (classId: string, teacherId: string) => Promise<void>; onDeleteClass?: (cls: any) => void; onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>; onDeleteSubject?: (subject: any) => void; onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const classGroups = groupClasses(classes);
  const [showAllExams, setShowAllExams] = useState(false);
  const [showAllReports, setShowAllReports] = useState(false);
  const [generatingExamId, setGeneratingExamId] = useState<string | null>(null);
  const lockedExams = exams.filter((e) => e.isLocked);
  const displayExams = showAllExams ? exams : exams.slice(0, 6);
  const displayReports = showAllReports ? reports : reports.slice(0, 6);
  const totalCollected = invoiceSummary?.byStatus?.reduce((sum: number, g: any) => { const paid = g.status === "PAID" || g.status === "PARTIAL"; return paid ? sum + (g._sum?.totalAmount || 0) : sum; }, 0) || 0;
  const generateReportCards = async (examId: string) => {
    setGeneratingExamId(examId);
    try { const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", examId }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Generation failed"); toast.success("Report cards generated"); }
    catch (error: any) { toast.error(error.message); } finally { setGeneratingExamId(null); }
  };
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-end gap-3"><BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={onAddClass}>Add Class</BrandButton><BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => onAddStudent()} disabled={classes.length === 0}>Add Student</BrandButton></div>
      <AttendanceView attendanceRecords={attendanceRecords || []} classes={classes} students={students || []} invoiceSummary={invoiceSummary} totalCollected={totalCollected} />
      {classGroups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">{classGroups.map((group) => (<ClassGroupCard key={group.key} group={group} teachers={teachers} students={students || []} onAddStudent={onAddStudent} onViewClass={onViewClass} onChangeTeacher={onChangeTeacher} onDeleteClass={onDeleteClass} onUpdateClass={onUpdateClass} onDeleteSubject={onDeleteSubject} onUpdateSubject={onUpdateSubject} />))}</div>
      ) : (<EmptyState icon={BookOpen} title="No classes defined" description="Create classes during onboarding or from the class management flow." action={<BrandButton onClick={onAddClass}>Add Class</BrandButton>} />)}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <SnapshotColumn icon={FileText} title="Exam Cycles" after={exams.length > 6 ? (<button type="button" onClick={() => setShowAllExams(!showAllExams)} className="text-[9px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer">{showAllExams ? "Show Less" : `View All (${exams.length})`}</button>) : null}>
          {displayExams.map((exam: any) => (<div key={exam.id} className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 px-4 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-[#1f1a23]">{exam.title}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">{exam.term} - {classLabel(exam.class)}</p></div><div className="flex items-center gap-2 shrink-0"><StatusPill status={exam.status} />{exam.isLocked && exam._count?.reportCards === 0 ? (<button type="button" onClick={() => generateReportCards(exam.id)} disabled={generatingExamId === exam.id} className="flex h-7 items-center gap-1 rounded-lg bg-[#8127cf] px-2 text-[8px] font-black uppercase tracking-normal text-white transition-all hover:bg-[#6a1fad] cursor-pointer disabled:opacity-50">{generatingExamId === exam.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Generate"}</button>) : null}</div></div></div>))}
          {exams.length === 0 ? <EmptyInline text="No exam cycles available yet." /> : null}
        </SnapshotColumn>
        <SnapshotColumn icon={GraduationCap} title="Report Cards" after={reports.length > 6 ? (<button type="button" onClick={() => setShowAllReports(!showAllReports)} className="text-[9px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer">{showAllReports ? "Show Less" : `View All (${reports.length})`}</button>) : null}>
          {displayReports.map((report: any) => (<div key={report.id} className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 px-4 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-[#1f1a23]">{report.student?.fullName || "Student"}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">{report.exam?.title || "Report"} - {report.grade || Math.round(report.percentage || 0) + "%"}</p></div><StatusPill status={report.status} /></div></div>))}
          {reports.length === 0 ? <EmptyInline text="Report cards will appear after exams are processed." /> : null}
        </SnapshotColumn>
      </div>
    </div>
  );
}

function AttendanceView({ attendanceRecords, classes, students, invoiceSummary, totalCollected }: {
  attendanceRecords: any[]; classes: any[]; students: any[]; invoiceSummary?: { total: number; totalAmount: number; byStatus: any[] }; totalCollected: number;
}) {
  const sections = useMemo(() => classes.map((c) => ({ id: c.id, label: `${c.name} ${c.section || ""}`.trim() })), [classes]);
  const [selectedSectionId, setSelectedSectionId] = useState(sections[0]?.id || "");
  useEffect(() => { setSelectedSectionId((prev: string) => sections.some((s) => s.id === prev) ? prev : sections[0]?.id || ""); }, [sections]);
  const [open, setOpen] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dateAttendance, setDateAttendance] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const sectionStudents = useMemo(() => students.filter((s) => s.class?.id === selectedSectionId), [students, selectedSectionId]);
  const fetchAttendance = useCallback(async (classId: string, date: string) => { setLoadingAtt(true); try { const res = await fetch(`/api/attendance?classId=${classId}&date=${date}`); const json = await res.json(); if (json.success) setDateAttendance(json.students || []); } catch {} finally { setLoadingAtt(false); } }, []);
  const fetchInvoices = useCallback(async (classId: string) => { try { const res = await fetch(`/api/billing/invoices?classId=${classId}`); const json = await res.json(); if (json.success) setInvoices(json.invoices || []); } catch {} }, []);
  useEffect(() => { if (selectedSectionId) { fetchAttendance(selectedSectionId, selectedDate); fetchInvoices(selectedSectionId); } }, [selectedSectionId, selectedDate, fetchAttendance, fetchInvoices]);
  const roster = dateAttendance;
  const present = roster.filter((s: any) => s.attendance?.status === "PRESENT").length;
  const absent = roster.filter((s: any) => s.attendance?.status === "ABSENT").length;
  const leave = roster.filter((s: any) => s.attendance?.status === "LEAVE").length;
  const unmarked = roster.filter((s: any) => !s.attendance).length;
  return (
    <div className={cn("rounded-[32px] border bg-white shadow-lg transition-all", open ? "border-[#cfc2d6]/10 hover:border-[#8127cf]/20 hover:shadow-2xl" : "border-[#cfc2d6]/5 hover:border-[#8127cf]/10")}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={cn("flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-all", open ? "p-5" : "px-4 py-3")} aria-expanded={open}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm transition-all", open ? "h-10 w-10" : "h-8 w-8")}><Users className={cn("transition-all", open ? "h-5 w-5" : "h-4 w-4")} /></div>
          <div className="min-w-0"><p className={cn("truncate font-black text-[#1f1a23] transition-all", open ? "text-base" : "text-sm")}>Attendance &amp; Fees</p>{open ? <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{sections.find((s) => s.id === selectedSectionId)?.label || "Select a section"}</p> : null}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {sections.length > 1 ? (<select value={selectedSectionId} onChange={(e) => { e.stopPropagation(); setSelectedSectionId(e.target.value); }} onClick={(e) => e.stopPropagation()} className="h-9 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354] outline-none cursor-pointer border border-[#cfc2d6]/10">{sections.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}</select>) : null}
          <ChevronDown className={cn("text-[#8127cf] transition-all duration-200 shrink-0", open ? "h-5 w-5 rotate-180" : "h-4 w-4")} />
        </div>
      </button>
      {open ? (<div className="border-t border-[#cfc2d6]/10 px-5 pb-5 pt-4 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60">Attendance</p><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} onClick={(e) => e.stopPropagation()} className="h-8 rounded-lg border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354] outline-none cursor-pointer" /></div>
            {loadingAtt ? (<Loader2 className="h-4 w-4 animate-spin text-[#8127cf]" />) : (<div className="flex items-center gap-2"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-normal text-emerald-700">P {present}</span><span className="rounded-full bg-rose-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-normal text-rose-700">A {absent}</span><span className="rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-normal text-amber-700">L {leave}</span><span className="rounded-full bg-[#f3f4f9] px-2 py-0.5 text-[8px] font-black uppercase tracking-normal text-[#4d4354]/60">? {unmarked}</span></div>)}
          </div>
          {selectedSectionId && roster.length > 0 ? (<div className="max-h-80 overflow-y-auto rounded-2xl border border-[#cfc2d6]/10 divide-y divide-[#cfc2d6]/5">
            <div className="flex items-center gap-2 bg-[#fbf0fe]/40 px-4 py-2 text-[8px] font-black uppercase tracking-normal text-[#4d4354]/60 sticky top-0"><span className="w-7 text-center">#</span><span className="flex-[2]">Student</span><span className="w-14 text-center">Date</span><span className="w-12 text-center">%</span><span className="w-20 text-center">Fee</span><span className="w-16 text-center">Balance</span></div>
            {roster.map((entry: any, i: number) => { const student = sectionStudents.find((s) => s.id === entry.id); const totalAtt = student?.attendance?.length || 0; const presentAtt = student?.attendance?.filter((a: any) => a.status === "PRESENT").length || 0; const pct = totalAtt ? Math.round((presentAtt / totalAtt) * 100) : null; const inv = invoices.find((inv) => inv.studentId === entry.id); return (<div key={entry.id} className="flex items-center gap-2 px-4 py-2.5 text-xs"><span className="w-7 text-center text-[#4d4354]/40 font-black">{i + 1}</span><span className="flex-[2] font-black text-[#1f1a23] truncate">{entry.fullName}</span><span className="w-14 flex justify-center">{entry.attendance ? (<span className={cn("rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-normal", entry.attendance.status === "PRESENT" && "bg-emerald-50 text-emerald-700", entry.attendance.status === "ABSENT" && "bg-rose-50 text-rose-700", entry.attendance.status === "LEAVE" && "bg-amber-50 text-amber-700")}>{entry.attendance.status === "PRESENT" ? "P" : entry.attendance.status === "ABSENT" ? "A" : "L"}</span>) : (<span className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/30">—</span>)}</span><span className="w-12 flex justify-center"><span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-black", pct === null ? "text-[#4d4354]/30" : pct >= 80 ? "bg-emerald-50 text-emerald-700" : pct >= 60 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700")}>{pct !== null ? `${pct}%` : "—"}</span></span><span className="w-20 flex justify-center">{inv ? (<StatusPill status={inv.status} />) : (<span className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/30">—</span>)}</span><span className="w-16 text-right font-black text-[#1f1a23]">{inv ? (inv.balanceDue || 0).toLocaleString() : "—"}</span></div>); })}
          </div>) : selectedSectionId ? (<div className="rounded-2xl border border-[#cfc2d6]/10 px-4 py-6 text-center"><p className="text-[10px] font-bold text-[#4d4354]/45">{loadingAtt ? "Loading..." : "No students enrolled in this section."}</p></div>) : null}
        </div>
        <div className="border-t border-[#cfc2d6]/10 pt-4">
          <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 mb-3">Fee Summary</p>
          <div className="grid grid-cols-2 gap-4"><div className="rounded-2xl border border-[#cfc2d6]/10 px-4 py-3"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60">Total Invoices</p><p className="mt-1 text-xl font-black text-[#1f1a23]">{invoiceSummary?.total ?? "—"}</p></div><div className="rounded-2xl border border-[#cfc2d6]/10 px-4 py-3"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60">Total Collected</p><p className="mt-1 text-xl font-black text-[#1f1a23]">{totalCollected ? `${(totalCollected / 100).toLocaleString()}` : "—"}</p></div></div>
          {invoiceSummary?.byStatus?.length ? (<div className="mt-3 flex flex-wrap gap-2">{invoiceSummary.byStatus.map((g: any) => (<div key={g.status} className="rounded-xl bg-[#fbf0fe]/50 px-3 py-2"><p className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/60">{g.status}</p><p className="text-xs font-black text-[#1f1a23]">{g._count} ({((g._sum?.totalAmount || 0) / 100).toLocaleString()})</p></div>))}</div>) : null}
        </div>
      </div>) : null}
    </div>
  );
}

function FacultyPanel({ teachers, pendingInvites, campusAdmins, pendingAdminInvites, onInvite, onRemove, onViewTeacher, onResend, onCancel }: {
  teachers: any[]; pendingInvites: any[]; campusAdmins: any[]; pendingAdminInvites: any[];
  onInvite: (role: string) => void; onRemove: (id: string, label: string) => void; onViewTeacher: (teacher: any) => void; onResend: (id: string) => void; onCancel: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const filtered = teachers.filter((t) => { if (!searchQuery.trim()) return true; const q = searchQuery.toLowerCase(); return t.fullName?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q); });
  if (teachers.length === 0 && pendingInvites.length === 0 && campusAdmins.length === 0 && pendingAdminInvites.length === 0) return (<EmptyState icon={Users} title="No faculty records found" description="Invite teachers so subjects and classes can be assigned from the central model." action={<BrandButton onClick={() => onInvite("TEACHER")}>Add Teacher</BrandButton>} />);
  return (
    <div className="space-y-8">
      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-gradient-to-br from-[#fbf0fe]/30 via-white to-[#fbf0fe]/20 p-6 shadow-lg">
        <div className="flex items-center justify-between gap-4 mb-5"><PanelTitle icon={ShieldCheck} title="Campus Admins" /><div className="flex gap-2"></div></div>
        {campusAdmins.length > 0 ? (<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{campusAdmins.map((admin: any) => (<AdminRow key={admin.id} admin={admin} onRemove={admin.id ? () => onRemove(admin.id, "Admin") : undefined} />))}</div>) : null}
        {pendingAdminInvites.length > 0 ? (<div className="mt-4 space-y-2"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 px-2">Pending Invitations</p>{pendingAdminInvites.map((invite: any) => (<PendingFacultyRow key={invite.inviteId || invite.id} invite={invite} onResend={() => onResend(invite.inviteId || invite.id)} onCancel={() => onCancel(invite.inviteId || invite.id)} />))}</div>) : null}
        {campusAdmins.length === 0 && pendingAdminInvites.length === 0 ? (<p className="rounded-2xl bg-white/70 px-4 py-3 text-[10px] font-bold text-[#4d4354]/45">No admins yet. Invite campus administrators to manage this campus.</p>) : null}
      </div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <PanelTitle icon={Users} title="Teacher Profiles" />
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 h-12 shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#4d4354]/40"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg><input type="text" placeholder="Search teachers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="ml-2 h-full w-40 bg-transparent border-none outline-none text-sm font-bold placeholder:text-[#4d4354]/35" /></div>
            <BrandButton variant="soft" onClick={() => onInvite("TEACHER")}>Add Teacher</BrandButton>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((teacher: any) => (<FacultyRow key={teacher.id} teacher={teacher} onView={() => onViewTeacher(teacher)} onRemove={() => onRemove(teacher.id, "Teacher")} />))}
          {filtered.length === 0 ? (<div className="md:col-span-2 xl:col-span-3"><EmptyState icon={Users} title={searchQuery ? "No matching teachers" : "No active teachers"} description={searchQuery ? "Try a different search term." : "Assigned teachers will appear here for principal oversight."} /></div>) : null}
        </div>
        {pendingInvites.length > 0 ? (<div className="mt-6 space-y-2"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 px-2">Pending Teacher Invitations ({pendingInvites.length})</p><div className="space-y-2">{pendingInvites.map((invite: any) => (<PendingFacultyRow key={invite.inviteId || invite.id} invite={invite} onResend={() => onResend(invite.inviteId || invite.id)} onCancel={() => onCancel(invite.inviteId || invite.id)} />))}</div></div>) : null}
      </div>
    </div>
  );
}

function StudentsPanel({ students, classes, onAddStudent, onMoveStudent, onViewStudent, onBulkImport, onExport, onDeleteStudent }: {
  students: any[]; classes: any[]; onAddStudent: (classId?: string) => void; onMoveStudent: (student: any) => void; onViewStudent: (student: any) => void; onBulkImport?: () => void; onExport?: () => void; onDeleteStudent?: (student: any) => void;
}) {
  const [classFilter, setClassFilter] = useState("all"); const [sectionFilter, setSectionFilter] = useState("all"); const [searchQuery, setSearchQuery] = useState(""); const [page, setPage] = useState(1); const perPage = 12;
  const classGroups = groupClasses(classes); const selectedGroup = classGroups.find((g) => g.key === classFilter);
  const filteredStudents = students.filter((s) => { if (sectionFilter !== "all") return s.class?.id === sectionFilter; if (classFilter !== "all") return classGroupKey(s.class) === classFilter; return true; }).filter((s) => { if (!searchQuery.trim()) return true; const q = searchQuery.toLowerCase(); return s.fullName?.toLowerCase().includes(q) || s.rollNo?.toLowerCase().includes(q) || s.guardianName?.toLowerCase().includes(q) || s.guardianPhone?.includes(q); });
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / perPage)); const safePage = Math.min(page, totalPages); const pagedStudents = filteredStudents.slice((safePage - 1) * perPage, safePage * perPage);
  useEffect(() => { setPage(1); }, [classFilter, sectionFilter, searchQuery]);
  if (students.length === 0) return (<EmptyState icon={GraduationCap} title="No students linked yet" description="Student profiles will appear here after classes and enrollment records are created." action={<BrandButton onClick={() => onAddStudent()} disabled={classes.length === 0}>Add Student</BrandButton>} />);
  return (
    <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-4"><PanelTitle icon={GraduationCap} title="Student Directory" /><div className="flex items-center gap-2"><BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={() => onAddStudent()}>Add Student</BrandButton>{onBulkImport ? <BrandButton variant="soft" icon={<FileText className="w-4 h-4" />} onClick={onBulkImport}>Bulk Import</BrandButton> : null}{onExport ? <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={onExport}>Export CSV</BrandButton> : null}</div></div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] max-w-xs"><span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Search</span><div className="flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 h-14 w-full"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#4d4354]/40"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg><input type="text" placeholder="Search students..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="ml-2 h-full w-full bg-transparent border-none outline-none text-sm font-bold placeholder:text-[#4d4354]/35" /></div></div>
          <FormSelect label="Class" value={classFilter} onChange={(v) => { setClassFilter(v); setSectionFilter("all"); }}><option value="all">All classes</option>{classGroups.map((g) => (<option key={g.key} value={g.key}>{g.name} - {g.academicYear}</option>))}</FormSelect>
          <FormSelect label="Section" value={sectionFilter} onChange={setSectionFilter}><option value="all">All sections</option>{(selectedGroup?.sections || classes).map((cls) => (<option key={cls.id} value={cls.id}>{classLabel(cls)}</option>))}</FormSelect>
          <div className="pb-1.5"><StatusPill status={`${filteredStudents.length} Shown`} /></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{pagedStudents.map((student: any) => { const report = student.reportCards?.[0]; const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`; return (<div key={student.id} className="rounded-[24px] bg-white border border-[#cfc2d6]/10 p-5 shadow-sm transition-all hover:border-[#8127cf]/20 hover:shadow-lg hover:-translate-y-0.5"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3.5"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-[#fbf0fe] shadow-sm"><img src={avatar} alt="" className="h-full w-full object-cover" /></div><div className="min-w-0"><p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/40">{student.rollNo} · {classLabel(student.class)}</p></div></div><StatusPill status={report ? report.status : "NO_REPORT"} /></div><div className="mt-4 grid grid-cols-2 gap-3"><MiniMetric label="Guardian" value={student.guardianName || "N/A"} /><MiniMetric label="Latest" value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} active /></div><div className="mt-4 flex gap-3"><button type="button" onClick={() => onViewStudent(student)} className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#fbf0fe] text-[10px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white">View Profile</button><button type="button" onClick={() => onMoveStudent(student)} className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#fbf0fe] text-[10px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white">Move</button>{onDeleteStudent ? (<button type="button" onClick={() => onDeleteStudent(student)} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-rose-50 text-rose-500 transition-all hover:bg-rose-100"><Trash2 className="h-4 w-4" /></button>) : null}</div></div>); })}</div>
      {totalPages > 1 ? (<div className="mt-6 flex items-center justify-between gap-3"><StatusPill status={`Page ${safePage} of ${totalPages}`} /><div className="flex gap-2"><button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="h-9 cursor-pointer rounded-xl bg-[#f3f4f9] px-4 text-[9px] font-black uppercase tracking-normal text-[#4d4354] transition-all hover:bg-[#fbf0fe] disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="h-9 cursor-pointer rounded-xl bg-[#f3f4f9] px-4 text-[9px] font-black uppercase tracking-normal text-[#4d4354] transition-all hover:bg-[#fbf0fe] disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div>) : null}
    </div>
  );
}

function AIPanel({ insights, reviewItems, onComplete }: { insights: any[]; reviewItems: any[]; onComplete: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? insights : insights.slice(0, 5);
  return (<div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-8">
    <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg relative overflow-hidden">
      <CornerSparkles />
      <AiActionPanel title="Principal AI" options={principalAIFeatures} compact onComplete={onComplete} />
    </div>
    <div className="space-y-8">
      <SnapshotColumn icon={ClipboardList} title="AI Review Queue">
        <AIReviewQueue items={reviewItems} onComplete={onComplete} />
      </SnapshotColumn>
      <SnapshotColumn icon={Sparkles} title="AI Insights" after={insights.length > 5 ? (<button type="button" onClick={() => setShowAll(!showAll)} className="text-[9px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer">{showAll ? "Show Less" : `View All (${insights.length})`}</button>) : null}>
        {insights.length > 0 ? (<div className="space-y-3">{display.map((insight: any) => (<div key={insight.id} className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 px-4 py-3 border border-[#cfc2d6]/10"><p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">{insight.category}</p><p className="mt-1 text-sm font-black text-[#1f1a23]">{insight.title}</p><p className="mt-1 text-xs font-semibold leading-relaxed text-[#4d4354]/60">{insight.description}</p><p className="mt-2 text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">{insight.severity}</p></div>))}</div>) : (<EmptyState icon={Sparkles} title="No AI insights yet" description="AI insights will appear as campus data accumulates." />)}
      </SnapshotColumn>
    </div>
  </div>);
}

function ReportsPanel({ data, busyAction, editingReportId, editedRemarks, onRunAction, onGenerateRemarks, onEdit, onCancelEdit, onRemarkChange, onSaveRemark }: {
  data: any; busyAction: string | null; editingReportId: string | null; editedRemarks: { en: string; ur: string };
  onRunAction: (examId: string, action: ReportAction, successMessage: string) => void; onGenerateRemarks: (examId: string) => void; onEdit: (report: any) => void; onCancelEdit: () => void; onRemarkChange: (value: { en: string; ur: string }) => void; onSaveRemark: (report: any, approve?: boolean) => void;
}) {
  return (<div className="grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-8"><div className="space-y-4"><PanelTitle icon={ShieldCheck} title="Exam Review Actions" />{data.reviewExams.map((exam: any) => (<div key={exam.id} className="rounded-[28px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/35 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-black text-[#1f1a23]">{exam.title}</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">{exam.term} - {classLabel(exam.class)}</p></div><StatusPill status={exam.status} /></div><div className="mt-4 grid grid-cols-2 gap-2"><ActionButton label="Generate" icon={FileText} busy={busyAction === `generate-${exam.id}`} onClick={() => onRunAction(exam.id, "generate", "Report cards generated")} /><ActionButton label="PDFs" icon={FileText} busy={busyAction === `pdf-${exam.id}`} onClick={() => onRunAction(exam.id, "pdf", "PDFs generated")} /><ActionButton label="AI Remarks" icon={Sparkles} busy={busyAction === `ai-remarks-${exam.id}`} onClick={() => onGenerateRemarks(exam.id)} /><ActionButton label="Review" icon={ShieldCheck} busy={busyAction === `review-${exam.id}`} onClick={() => onRunAction(exam.id, "review", "Exam marked as principal reviewed")} /><ActionButton label="Publish" icon={Upload} busy={busyAction === `publish-${exam.id}`} onClick={() => onRunAction(exam.id, "publish", "Reports published")} /><div className="col-span-2"><ActionButton label="Send To Parents" icon={Send} busy={busyAction === `send-${exam.id}`} onClick={() => onRunAction(exam.id, "send", "Delivery attempted")} /></div></div></div>))}{data.reviewExams.length === 0 ? (<p className="rounded-[24px] bg-[#fbf0fe]/50 p-5 text-sm font-semibold text-[#4d4354]/55">No locked exams are ready for principal review.</p>) : null}</div><div className="space-y-4"><PanelTitle icon={FileText} title="Report Card Remarks" />{data.recentReportCards.map((report: any) => (<ReportReviewCard key={report.id} report={report} busy={busyAction === `remark-${report.id}`} editing={editingReportId === report.id} editedRemarks={editedRemarks} onEdit={() => onEdit(report)} onCancel={onCancelEdit} onChange={onRemarkChange} onSave={() => onSaveRemark(report)} onApprove={() => onSaveRemark(report, true)} />))}{data.recentReportCards.length === 0 ? (<EmptyState icon={FileText} title="No report cards" description="Generated report cards will appear here for remark approval." />) : null}</div></div>);
}

function EngagementPanel({ data, totals, busy, onRunAutomation }: { data: any; totals: { sent: number; failed: number; blocked: number; noContact: number }; busy: boolean; onRunAutomation: () => void; }) {
  return (<div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><EngagementStat icon={CheckCircle2} label="Sent" value={totals.sent} tone="green" /><EngagementStat icon={AlertCircle} label="Failed" value={totals.failed} tone="rose" /><EngagementStat icon={ShieldCheck} label="Blocked" value={totals.blocked} tone="purple" /><EngagementStat icon={MessageSquare} label="No Contact" value={totals.noContact} tone="amber" /></div><div className="rounded-[32px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/30 p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6"><PanelTitle icon={MessageSquare} title="Recent Parent Communication" /><BrandButton variant="soft" onClick={onRunAutomation} disabled={busy} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}>Run Automation</BrandButton></div><div className="space-y-3">{data.recentCommunications.map((item: any) => (<div key={item.id} className="rounded-[24px] border border-[#cfc2d6]/10 bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-sm font-black text-[#1f1a23]">{formatStatus(item.templateKey)}</p><p className="mt-1 truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">{item.student?.fullName || item.recipientName || "Parent"} - {item.channel}</p><p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-[#4d4354]/60">{item.body}</p></div><div className="flex shrink-0 flex-col items-start gap-2 sm:items-end"><StatusPill status={item.status} /><span className="text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/35">{formatDate(item.sentAt || item.createdAt)}</span></div></div></div>))}{data.recentCommunications.length === 0 ? (<p className="rounded-[24px] bg-white p-6 text-sm font-semibold text-[#4d4354]/55">No parent communication has been generated yet.</p>) : null}</div></div></div>);
}

function ClassModal({ open, onClose, form, onChange, onSave, saving, teachers }: { open: boolean; onClose: () => void; form: ClassFormState; onChange: (f: ClassFormState) => void; onSave: () => void; saving: boolean; teachers: any[]; }) {
  if (!open) return null;
  return (<ModalFrame title="Create Class" onClose={onClose}><div className="space-y-4"><FormInput label="Class Name" value={form.name} placeholder="e.g. Class 10" onChange={(v) => onChange({ ...form, name: v })} /><FormInput label="Sections (one per line)" value={form.sections} placeholder="A\nB\nC" onChange={(v) => onChange({ ...form, sections: v })} textarea /><FormInput label="Academic Year" value={String(form.academicYear)} placeholder="2026" onChange={(v) => onChange({ ...form, academicYear: Number(v) || new Date().getFullYear() })} /><FormSelect label="Class Teacher (optional)" value={form.classTeacherId} onChange={(v) => onChange({ ...form, classTeacherId: v })}><option value="">No teacher</option>{teachers.map((t) => (<option key={t.id} value={t.id}>{t.fullName}</option>))}</FormSelect></div><ModalActions onCancel={onClose} onSave={onSave} saving={saving} /></ModalFrame>);
}

function StudentModal({ open, onClose, form, onChange, onSave, saving, classes }: { open: boolean; onClose: () => void; form: StudentFormState; onChange: (f: StudentFormState) => void; onSave: () => void; saving: boolean; classes: any[]; }) {
  if (!open) return null;
  const sections = classes.map((c) => ({ id: c.id, label: classLabel(c) }));
  return (<ModalFrame title="Add Student" onClose={onClose}><div className="space-y-4"><div className="grid grid-cols-2 gap-4"><FormInput label="Full Name" value={form.fullName} placeholder="e.g. John Doe" onChange={(v) => onChange({ ...form, fullName: v })} /><FormInput label="Roll No" value={form.rollNo} placeholder="e.g. 1" onChange={(v) => onChange({ ...form, rollNo: v })} /></div><FormSelect label="Gender" value={form.gender} onChange={(v) => onChange({ ...form, gender: v })}><option value="MALE">Male</option><option value="FEMALE">Female</option></FormSelect><FormSelect label="Class" value={form.classId} onChange={(v) => onChange({ ...form, classId: v })}><option value="">Select a class</option>{sections.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}</FormSelect><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Guardian Info</p><div className="grid grid-cols-2 gap-4"><FormInput label="Guardian Name" value={form.guardianName} placeholder="Parent/Guardian" onChange={(v) => onChange({ ...form, guardianName: v })} /><FormInput label="Guardian Phone" value={form.guardianPhone} placeholder="03XX-XXXXXXX" onChange={(v) => onChange({ ...form, guardianPhone: v })} /></div><FormInput label="Guardian Email" value={form.guardianEmail} placeholder="parent@example.com" onChange={(v) => onChange({ ...form, guardianEmail: v })} /></div><ModalActions onCancel={onClose} onSave={onSave} saving={saving} /></ModalFrame>);
}

function MoveStudentModal({ student, classes, selectedClassId, onSelectClass, onMove, busy, onClose }: { student: any; classes: any[]; selectedClassId: string; onSelectClass: (id: string) => void; onMove: () => void; busy: boolean; onClose: () => void; }) {
  const currentClassId = student.class?.id || student.classId;
  const isSameClass = selectedClassId === currentClassId;
  const canMove = selectedClassId && !isSameClass;
  return (<ModalFrame title={`Move ${student.fullName}`} onClose={onClose}>
    <div className="rounded-3xl bg-[#fbf0fe]/65 p-5 mb-5"><p className="text-sm font-black text-[#1f1a23]">{student.fullName}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">Current: {classLabel(student.class)} · Roll: {student.rollNo}</p></div>
    <p className="text-xs font-semibold text-[#4d4354]/60 mb-4">Select a new class for this student. A new roll number will be auto-generated.</p>
    <FormSelect label="Destination Class" value={selectedClassId} onChange={onSelectClass}><option value="">Select class</option>{classes.filter((cls) => cls.id !== currentClassId).map((cls) => (<option key={cls.id} value={cls.id}>{classLabel(cls)}</option>))}</FormSelect>
    <ModalActions onCancel={onClose} onSave={onMove} saving={busy || !canMove} saveLabel="Move" />
  </ModalFrame>);
}


function ClassGroupCard({ group, teachers, students, onAddStudent, onViewClass, onChangeTeacher, onDeleteClass, onUpdateClass, onDeleteSubject, onUpdateSubject }: {
  group: { name: string; academicYear: number | string; sections: any[] }; teachers: any[]; students: any[]; onAddStudent: (classId?: string) => void; onViewClass: (cls: any) => void; onChangeTeacher: (classId: string, teacherId: string) => Promise<void>; onDeleteClass?: (cls: any) => void; onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>; onDeleteSubject?: (subject: any) => void; onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const [open, setOpen] = useState(true); const studentCount = group.sections.reduce((sum, cls) => sum + (cls._count?.students || 0), 0); const subjectCount = group.sections.reduce((sum, cls) => sum + (cls._count?.subjects || cls.subjects?.length || 0), 0);
  return (<div className={cn("rounded-[32px] border bg-white shadow-lg transition-all self-start relative overflow-hidden", open ? "border-[#cfc2d6]/10 hover:border-[#8127cf]/20 hover:shadow-2xl" : "border-[#cfc2d6]/5 hover:border-[#8127cf]/10")}><button type="button" onClick={() => setOpen((v) => !v)} className={cn("flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-all", open ? "p-5" : "px-4 py-3")} aria-expanded={open}><div className="flex items-center gap-3 min-w-0"><div className={cn("flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm transition-all", open ? "h-10 w-10" : "h-8 w-8")}><BookOpen className={cn("transition-all", open ? "h-5 w-5" : "h-4 w-4")} /></div><div className="min-w-0"><p className={cn("truncate font-black text-[#1f1a23] transition-all", open ? "text-base" : "text-sm")}>{group.name}</p>{open ? (<p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{group.academicYear} - {group.sections.length} section{group.sections.length === 1 ? "" : "s"} · {studentCount} student{studentCount === 1 ? "" : "s"} · {subjectCount} subject{subjectCount === 1 ? "" : "s"}</p>) : null}</div></div><div className="flex shrink-0 items-center gap-2">{onDeleteClass ? (<button type="button" onClick={(e) => { e.stopPropagation(); onDeleteClass(group.sections[0]); }} className="flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-2 text-[8px] font-black uppercase tracking-normal text-rose-600 transition-all hover:bg-rose-100 cursor-pointer"><Trash2 className="h-3 w-3" />Delete</button>) : null}<span className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">{group.sections.length} cls</span><ChevronDown className={cn("text-[#8127cf] transition-all duration-200", open ? "h-5 w-5 rotate-180" : "h-4 w-4")} /></div></button>{open ? (<div className="border-t border-[#cfc2d6]/10 p-5 space-y-3"><div className="grid grid-cols-2 gap-3"><MiniMetric label="Students" value={studentCount} active /><MiniMetric label="Subjects" value={subjectCount} /></div>{group.sections.map((cls) => (<SectionCard key={cls.id} cls={cls} teachers={teachers} classTeacherId={cls.classTeacher?.id || ""} students={(students || []).filter((s: any) => s.class?.id === cls.id || s.classId === cls.id)} onViewClass={onViewClass} onAddStudent={onAddStudent} onChangeTeacher={onChangeTeacher} onDeleteClass={onDeleteClass} onUpdateClass={onUpdateClass} onDeleteSubject={onDeleteSubject} onUpdateSubject={onUpdateSubject} />))}</div>) : null}</div>);
}

function SectionCard({ cls, teachers, classTeacherId, students, onViewClass, onAddStudent, onChangeTeacher, onDeleteClass, onUpdateClass, onDeleteSubject, onUpdateSubject }: {
  cls: any; teachers: any[]; classTeacherId: string; students: any[]; onViewClass: (cls: any) => void; onAddStudent: (classId?: string) => void; onChangeTeacher: (classId: string, teacherId: string) => Promise<void>; onDeleteClass?: (cls: any) => void; onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>; onDeleteSubject?: (subject: any) => void; onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [changingTeacher, setChangingTeacher] = useState(false);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const subjectCount = cls.subjects?.length || cls._count?.subjects || 0;
  const studentCount = students.length || cls._count?.students || 0;
  const displayStudents = showAllStudents ? students : students.slice(0, 6);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/55 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-[#1f1a23]">Section {sectionLabel(cls)}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
              <UserCheck className="h-3 w-3" />
              {cls.classTeacher?.fullName || "No class teacher"}
            </span>
            <span className="text-[#4d4354]/20">|</span>
            <span className="text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{studentCount} student{studentCount !== 1 ? "s" : ""}</span>
            <span className="text-[#4d4354]/20">|</span>
            <span className="text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{subjectCount} subject{subjectCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={(e) => { e.stopPropagation(); onViewClass(cls); }} className="flex h-8 items-center gap-1 rounded-lg bg-[#8127cf]/10 px-2.5 text-[8px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white cursor-pointer" title="Edit section details">
            <Pencil className="h-3 w-3" />Edit
          </button>
          {onDeleteClass ? (<button type="button" onClick={(e) => { e.stopPropagation(); onDeleteClass(cls); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-rose-500 cursor-pointer" title="Delete section"><Trash2 className="h-3.5 w-3.5" /></button>) : null}
          {changingTeacher ? (
            <select value={classTeacherId || ""} onChange={(e) => { const val = e.target.value; if (val !== classTeacherId) onChangeTeacher(cls.id, val); setChangingTeacher(false); }} className="h-9 rounded-xl bg-white px-3 text-[9px] font-black uppercase tracking-normal text-[#8127cf] border border-[#8127cf]/20 outline-none cursor-pointer" autoFocus onBlur={() => setChangingTeacher(false)}>
              <option value="">No teacher</option>{teachers.map((t) => (<option key={t.id} value={t.id}>{t.fullName}</option>))}
            </select>
          ) : (
            <button type="button" onClick={(e) => { e.stopPropagation(); setChangingTeacher(true); }} className={cn("flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-[8px] font-black uppercase tracking-normal transition-all", cls.classTeacher ? "bg-emerald-50 text-emerald-700 hover:bg-amber-50 hover:text-amber-700" : "bg-amber-50 text-amber-700 hover:bg-emerald-50 hover:text-emerald-700")}><Users className="h-3 w-3" />{cls.classTeacher ? "Chg" : "Asgn"}</button>
          )}
          {onAddStudent ? (<button type="button" onClick={(e) => { e.stopPropagation(); onAddStudent(cls.id); }} className="h-8 cursor-pointer rounded-lg bg-white px-2 text-[8px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white">+ Student</button>) : null}
          <button type="button" onClick={() => setDetailsOpen((v) => !v)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8127cf] transition-all hover:bg-white cursor-pointer"><ChevronDown className={cn("h-4 w-4 transition-transform duration-200", detailsOpen && "rotate-180")} /></button>
        </div>
      </div>

      {detailsOpen ? (
        <div className="border-t border-[#cfc2d6]/10">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 flex items-center gap-1"><BookOpen className="h-3 w-3" />Subjects ({subjectCount})</p>
            </div>
            {cls.subjects?.length ? (
              <div className="space-y-1.5">
                {cls.subjects.map((subject: any) => (
                  <div key={subject.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 group/subj">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-[#1f1a23] truncate">{subject.name}</p>
                      <p className="text-[8px] font-bold uppercase tracking-normal text-[#4d4354]/40 mt-0.5">{subject.teacher?.fullName || "No teacher"} · {subject.totalMarks || 100} marks</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[7px] font-black uppercase tracking-normal", subject.teacher?.id ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", subject.teacher?.id ? "bg-emerald-500" : "bg-amber-500")} />
                        {subject.teacher?.id ? "Assigned" : "Unassigned"}
                      </span>
                      {onDeleteSubject ? (<button type="button" onClick={(e) => { e.stopPropagation(); onDeleteSubject(subject); }} className="flex h-6 w-6 items-center justify-center rounded-md text-[#4d4354]/20 transition-all opacity-0 group-hover/subj:opacity-100 hover:bg-rose-50 hover:text-rose-500 cursor-pointer"><Trash2 className="h-3 w-3" /></button>) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (<p className="rounded-xl bg-white/70 px-3 py-2 text-[10px] font-bold text-[#4d4354]/45">No subjects yet. Click Edit to add subjects and assign teachers.</p>)}
          </div>

          <div className="border-t border-[#cfc2d6]/10 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 flex items-center gap-1"><GraduationCap className="h-3 w-3" />Students ({studentCount})</p>
              {students.length > 6 ? (<button type="button" onClick={() => setShowAllStudents(!showAllStudents)} className="text-[8px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer">{showAllStudents ? "Show Less" : `View All ${students.length}`}</button>) : null}
            </div>
            {students.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {displayStudents.map((student: any) => (
                  <div key={student.id} className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2">
                    <div className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-[#fbf0fe] border border-white">
                      <img src={student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-[#1f1a23] truncate">{student.fullName}</p>
                      <p className="text-[7px] font-bold uppercase tracking-normal text-[#4d4354]/35">Roll {student.rollNo || "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (<p className="rounded-xl bg-white/70 px-3 py-2 text-[10px] font-bold text-[#4d4354]/45">No students enrolled yet. Click + Student to add.</p>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PendingFacultyRow({ invite, onResend, onCancel }: { invite: any; onResend: () => void; onCancel: () => void }) {
  const expired = invite.expiresAt ? new Date() > new Date(invite.expiresAt) : false;
  const expiryLabel = invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  return (<div className="bg-gradient-to-br from-amber-50 via-amber-50/80 to-white p-5 rounded-[28px] border border-amber-100/80 flex items-center justify-between gap-4 group hover:shadow-lg transition-all duration-300"><div className="flex items-center gap-5 min-w-0"><div className="h-12 w-12 bg-white rounded-xl border-2 border-white shadow-sm flex items-center justify-center shrink-0"><Clock className="w-5 h-5 text-amber-500" /></div><div className="min-w-0"><h4 className="text-base font-black text-[#1f1a23] tracking-normal leading-none mb-1 truncate">Invitation pending</h4><p className="text-[9px] font-bold text-[#4d4354]/50 uppercase tracking-normal leading-none truncate">{invite.email}</p>{expiryLabel ? (<p className={`mt-2 text-[8px] font-black uppercase tracking-normal ${expired ? "text-rose-600" : "text-amber-600"}`}>{expired ? "Expired" : "Expires"} {expiryLabel}</p>) : null}</div></div><div className="flex flex-wrap items-center justify-end gap-2 shrink-0"><StatusPill status={expired ? "Expired" : formatStatus(invite.role)} /><button type="button" onClick={onResend} className="h-9 rounded-lg bg-white px-3 text-[9px] font-black uppercase tracking-normal text-[#8127cf] flex items-center gap-1.5 justify-center border border-[#8127cf]/10 shadow-sm hover:bg-[#8127cf] hover:text-white hover:border-[#8127cf] hover:shadow-md transition-all cursor-pointer"><Send className="w-3.5 h-3.5" />Resend</button><button type="button" onClick={onCancel} className="h-9 rounded-lg bg-white px-3 text-[9px] font-black uppercase tracking-normal text-rose-500 flex items-center gap-1.5 justify-center border border-rose-100 shadow-sm hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md transition-all cursor-pointer"><X className="w-4 h-4" />Cancel</button></div></div>);
}

function FacultyRow({ teacher, onView, onRemove }: { teacher: any; onView: () => void; onRemove: () => void }) {
  const avatar = teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teacher.fullName)}`;
  return (<div className="bg-gradient-to-br from-white via-[#fbf0fe]/20 to-white p-5 rounded-[28px] border border-[#cfc2d6]/10 hover:border-[#8127cf]/20 hover:shadow-xl transition-all duration-300 flex items-center justify-between group"><div className="flex items-center gap-5 min-w-0"><div className="h-12 w-12 bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] rounded-xl overflow-hidden border-2 border-white shadow-sm flex items-center justify-center shrink-0"><img src={avatar} alt="" className="h-full w-full object-cover" /></div><div className="min-w-0"><h4 className="text-base font-black text-[#1f1a23] tracking-normal leading-none mb-1 truncate">{teacher.fullName}</h4><p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-normal leading-none truncate">{teacher.email}</p></div></div><div className="flex items-center gap-6 shrink-0"><span className="text-[8px] font-black uppercase tracking-normal bg-emerald-50 text-emerald-600 rounded-full px-2.5 py-1">{teacher._count?.taughtSubjects || 0} subjects</span><button type="button" onClick={onView} className="h-9 rounded-lg bg-[#fbf0fe] px-3 text-[9px] font-black uppercase tracking-normal text-[#8127cf] border border-[#8127cf]/10 shadow-sm hover:bg-[#8127cf] hover:text-white hover:border-[#8127cf] hover:shadow-md transition-all cursor-pointer">View</button><button type="button" onClick={onRemove} className="h-9 rounded-lg bg-rose-50 px-3 text-[9px] font-black uppercase tracking-normal text-rose-500 border border-rose-100 shadow-sm hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md transition-all cursor-pointer"><Trash2 className="w-3.5 h-3.5" />Revoke</button></div></div>);
}

function AdminRow({ admin, currentUserId, onRemove }: { admin: any; currentUserId?: string; onRemove?: () => void }) {
  const isCurrentUser = admin.id === currentUserId;
  return (<div className="bg-gradient-to-br from-[#fbf0fe]/45 via-white to-[#fbf0fe]/20 p-5 rounded-[28px] border border-[#cfc2d6]/10 hover:border-[#8127cf]/20 hover:shadow-lg transition-all duration-300 flex items-center justify-between gap-4"><div className="flex items-center gap-5 min-w-0"><div className="h-12 w-12 bg-white rounded-xl overflow-hidden border-2 border-white shadow-sm flex items-center justify-center shrink-0"><img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(admin.email)}`} alt="" /></div><div className="min-w-0"><div className="flex items-center gap-2"><h4 className="text-base font-black text-[#1f1a23] tracking-normal leading-none mb-1 truncate">{admin.fullName}</h4>{isCurrentUser ? <span className="inline-flex items-center rounded-full bg-[#8127cf]/10 px-2 py-0.5 text-[7px] font-black uppercase tracking-wider text-[#8127cf]">You</span> : null}</div><p className="text-[9px] font-bold text-[#4d4354]/45 uppercase tracking-normal leading-none truncate">{admin.email}</p><p className="mt-2 text-[8px] font-black uppercase tracking-normal text-[#8127cf]">{isCurrentUser ? "Current owner session" : formatStatus(admin.role)}</p></div></div>{!isCurrentUser && onRemove ? (<button type="button" onClick={onRemove} className="shrink-0 h-9 rounded-xl bg-rose-50 px-3 text-[10px] font-black uppercase tracking-normal text-rose-600 border border-rose-100 shadow-sm transition-all hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md cursor-pointer">Remove</button>) : null}</div>);
}

function SnapshotColumn({ icon: Icon, title, after, children }: { icon: LucideIcon; title: string; after?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const childCount = useMemo(() => { let count = 0; if (Array.isArray(children)) { count = children.filter(Boolean).length; } else if (children) { count = 1; } return count; }, [children]);
  return (<div className={cn("rounded-[32px] border bg-white shadow-lg transition-all self-start relative overflow-hidden", open ? "border-[#cfc2d6]/10 hover:border-[#8127cf]/20 hover:shadow-2xl" : "border-[#cfc2d6]/5 hover:border-[#8127cf]/10")}><CornerSparkles /><button type="button" onClick={() => setOpen((v) => !v)} className={cn("flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-all", open ? "p-5" : "px-4 py-3")} aria-expanded={open}><div className="flex items-center gap-3 min-w-0"><div className={cn("flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm transition-all", open ? "h-10 w-10" : "h-8 w-8")}><Icon className={cn("transition-all", open ? "h-5 w-5" : "h-4 w-4")} /></div><div className="min-w-0"><p className={cn("truncate font-black text-[#1f1a23] transition-all", open ? "text-base" : "text-sm")}>{title}</p>{open ? (<p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{childCount} item{childCount === 1 ? "" : "s"}</p>) : null}</div></div><div className="flex shrink-0 items-center gap-2">{open ? null : (<span className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">{childCount} items</span>)}<ChevronDown className={cn("text-[#8127cf] transition-all duration-200", open ? "h-5 w-5 rotate-180" : "h-4 w-4")} /></div></button>{open ? (<div className="border-t border-[#cfc2d6]/10 p-5">{after ? (<div className="mb-3 flex justify-end">{after}</div>) : null}<div className="space-y-3">{children}</div></div>) : null}</div>);
}

function ModalFrame({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (<div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5"><div className={`bg-white w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar`}><div className="flex justify-between items-start gap-5 mb-8"><div>{eyebrow ? <p className="text-[10px] font-black uppercase text-[#8127cf]">{eyebrow}</p> : null}<h3 className="mt-1 text-2xl font-black text-[#1f1a23] tracking-normal">{title}</h3></div><button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-[#fbf0fe] hover:text-rose-500 cursor-pointer transition-all"><X className="w-5 h-5" /></button></div>{children}</div></div>);
}

function ModalActions({ saving, saveLabel, onCancel, onSave }: { saving?: boolean; saveLabel?: string; onCancel: () => void; onSave: () => void }) {
  return (<div className="mt-8 flex gap-4"><BrandButton variant="soft" className="flex-1 h-14" onClick={onCancel}>Cancel</BrandButton><BrandButton variant="dark" className="flex-[2] h-14" onClick={onSave} disabled={saving}>{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : saveLabel || "Save"}</BrandButton></div>);
}

function FormInput({ label, value, placeholder, type = "text", textarea, onChange }: { label: string; value: string; placeholder?: string; type?: string; textarea?: boolean; onChange: (value: string) => void }) {
  if (textarea) return (<label className="block"><span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</span><textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-24 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 py-3 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white resize-none" /></label>);
  return (<label className="block"><span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white" /></label>);
}

function FormSelect({ label, value, children, onChange }: { label: string; value: string; children: ReactNode; onChange: (value: string) => void }) {
  return (<label className="block"><span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="h-14 w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white">{children}</select></label>);
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (<div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</span><span className="text-xs font-black text-[#1f1a23] text-right">{value}</span></div>);
}

function PanelTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (<div className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 text-[#8127cf] shadow-sm"><Icon className="h-4 w-4" /></div><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{title}</p></div>);
}

function MiniMetric({ label, value, active }: { label: string; value: any; active?: boolean }) {
  return (<div className={`rounded-2xl p-3 transition-all ${active ? "bg-gradient-to-br from-[#fbf0fe] via-[#fbf0fe]/80 to-white border border-[#8127cf]/10 shadow-sm" : "bg-[#f3f4f9]/50"}`}><p className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p><p className="mt-0.5 text-sm font-black text-[#1f1a23] truncate">{value}</p></div>);
}

function StatusPill({ status }: { status?: string }) {
  const tone = statusTone(status);
  const dotColor = tone.includes("emerald") ? "bg-emerald-500" : tone.includes("rose") ? "bg-rose-500" : tone.includes("amber") ? "bg-amber-500" : tone.includes("8127cf") ? "bg-[#8127cf]" : "bg-[#4d4354]/40";
  return (<span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${tone}`}><span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />{formatStatus(status)}</span>);
}

function EmptyInline({ text }: { text: string }) {
  return (<p className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/60 via-[#fbf0fe]/30 to-white border border-[#cfc2d6]/10 p-4 text-sm font-semibold text-[#4d4354]/55">{text}</p>);
}

function ActionButton({ label, icon: Icon, busy, onClick }: { label: string; icon: LucideIcon; busy: boolean; onClick: () => void }) {
  return (<button type="button" onClick={onClick} disabled={busy} className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe] text-[9px] font-black uppercase tracking-normal text-[#8127cf] shadow-sm transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-md hover:shadow-[#8127cf]/20 disabled:opacity-40 disabled:cursor-not-allowed">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{label}</button>);
}

function ReportReviewCard({ report, busy, editing, editedRemarks, onEdit, onCancel, onChange, onSave, onApprove }: {
  report: any; busy: boolean; editing: boolean; editedRemarks: { en: string; ur: string }; onEdit: () => void; onCancel: () => void; onChange: (v: { en: string; ur: string }) => void; onSave: () => void; onApprove: () => void;
}) {
  return (<div className="rounded-[24px] border border-[#cfc2d6]/10 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-[#8127cf]/15"><div className="flex items-start justify-between gap-3 mb-3"><div className="min-w-0"><p className="text-xs font-black text-[#1f1a23]">{report.student?.fullName || "Student"}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{report.exam?.title || "Exam"} · {report.grade || `${Math.round(report.percentage || 0)}%`}</p></div><StatusPill status={report.status} /></div>{editing ? (<div className="space-y-3"><div><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 mb-1">English Remarks</p><textarea value={editedRemarks.en} onChange={(e) => onChange({ ...editedRemarks, en: e.target.value })} className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/30 p-3 text-xs font-bold outline-none resize-none h-20 focus:border-[#8127cf]/35 focus:bg-white transition-all" /></div><div><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 mb-1">Urdu Remarks</p><textarea value={editedRemarks.ur} onChange={(e) => onChange({ ...editedRemarks, ur: e.target.value })} className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/30 p-3 text-xs font-bold outline-none resize-none h-20 focus:border-[#8127cf]/35 focus:bg-white transition-all" /></div><div className="flex gap-2"><BrandButton variant="soft" onClick={onSave} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</BrandButton><BrandButton variant="dark" onClick={onApprove} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save & Approve"}</BrandButton><button type="button" onClick={onCancel} className="h-10 rounded-xl bg-[#f3f4f9] px-4 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 cursor-pointer transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]">Cancel</button></div></div>) : (<div className="flex gap-2"><button type="button" onClick={onEdit} className="h-9 cursor-pointer rounded-lg bg-[#fbf0fe] px-3 text-[9px] font-black uppercase tracking-normal text-[#8127cf] border border-[#8127cf]/10 shadow-sm transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-md">Edit Remarks</button></div>)}</div>);
}

function EngagementStat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  const toneStyles: Record<string, string> = { green: "bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-700", rose: "bg-gradient-to-br from-rose-50 to-rose-100/50 text-rose-700", purple: "bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf]", amber: "bg-gradient-to-br from-amber-50 to-amber-100/50 text-amber-700" };
  return (<div className="rounded-3xl bg-white border border-[#cfc2d6]/10 p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"><div className="flex items-center gap-3 mb-3"><div className={`rounded-xl p-2 ${toneStyles[tone] || "bg-gradient-to-br from-[#f3f4f9] to-[#f3f4f9]/50 text-[#4d4354]/60"} shadow-sm`}><Icon className="w-4 h-4" /></div><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p></div><p className="text-3xl font-black tracking-normal text-[#1f1a23]">{value}</p></div>);
}

function EngagementMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (<div className="flex items-center justify-between p-1 transition-all hover:bg-[#fbf0fe]/40 rounded-xl -mx-1"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm"><Icon className="h-4 w-4" /></div><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p></div><p className="text-sm font-black text-[#1f1a23]">{value}</p></div>);
}

function BulkStudentImport({ campusName, classes, onClose, onComplete }: { campusName: string; classes: any[]; onClose: () => void; onComplete: () => Promise<any>; }) {
  const [csvText, setCsvText] = useState(""); const [preview, setPreview] = useState<any[]>([]); const [parsedError, setParsedError] = useState(""); const [importing, setImporting] = useState(false);
  const parseCSVRow = (line: string): string[] => { const cols: string[] = []; let current = ""; let inQuotes = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { inQuotes = !inQuotes; } else if (ch === "," && !inQuotes) { cols.push(current.trim()); current = ""; } else { current += ch; } } cols.push(current.trim()); return cols; };
  const downloadTemplate = () => { const csv = "Full Name,Roll No,Gender,Class,Guardian Name,Guardian Phone,Guardian Email\nJohn Doe,101,MALE,Grade 8 A,Jane Doe,+923001234567,jane@example.com\nJane Smith,102,FEMALE,Grade 8 A,,+923001234568,\nAlex Lee,103,OTHER,Grade 8 B,,,"; const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "student_import_template.csv"; a.click(); URL.revokeObjectURL(url); };
  const parseCSV = (text: string) => { setParsedError(""); const lines = text.trim().split("\n").filter(Boolean); if (lines.length < 2) { setPreview([]); return; } const headers = parseCSVRow(lines[0]).map((h) => h.trim().toLowerCase()); const nameIdx = headers.findIndex((h) => h.includes("name") || h === "fullname" || h === "full_name"); const rollIdx = headers.findIndex((h) => h.includes("roll") || h === "rollno" || h === "roll_no"); const genderIdx = headers.findIndex((h) => h.includes("gender")); const classIdx = headers.findIndex((h) => h.includes("class")); const guardianIdx = headers.findIndex((h) => h.includes("guardian") && h.includes("name")); const guardianPhoneIdx = headers.findIndex((h) => h.includes("guardian") && (h.includes("phone") || h.includes("whatsapp"))); const guardianEmailIdx = headers.findIndex((h) => h.includes("guardian") && h.includes("email")); if (nameIdx === -1 || rollIdx === -1) { setParsedError("CSV must have at least \"Full Name\" and \"Roll No\" columns"); setPreview([]); return; } const rows = []; for (let i = 1; i < lines.length; i++) { const cols = parseCSVRow(lines[i]).map((c) => c.trim()); const name = cols[nameIdx] || ""; const rollNo = cols[rollIdx] || ""; if (!name || !rollNo) continue; const className = classIdx >= 0 ? cols[classIdx] || "" : ""; const matchedClass = className ? classes.find((c) => `${c.name} ${c.section || ""}`.trim().toLowerCase() === className.toLowerCase()) : null; rows.push({ fullName: name, rollNo, gender: genderIdx >= 0 ? (cols[genderIdx]?.toUpperCase() === "F" || cols[genderIdx]?.toUpperCase() === "FEMALE" ? "FEMALE" : cols[genderIdx]?.toUpperCase() === "OTHER" ? "OTHER" : "MALE") : "MALE", classId: matchedClass?.id || (classIdx >= 0 ? "__unknown__" : classes[0]?.id || ""), className: matchedClass ? `${matchedClass.name} ${matchedClass.section || ""}`.trim() : className || (classes[0] ? `${classes[0].name} ${classes[0].section || ""}`.trim() : "Unknown"), guardianName: guardianIdx >= 0 ? cols[guardianIdx] || "" : "", guardianPhone: guardianPhoneIdx >= 0 ? cols[guardianPhoneIdx] || "" : "", guardianEmail: guardianEmailIdx >= 0 ? cols[guardianEmailIdx] || "" : "", _unknownClass: !matchedClass && className ? className : "", }); } setPreview(rows); };
  const handleImport = async () => { if (preview.length === 0) return toast.error("No valid rows to import"); const unknownClasses = [...new Set(preview.filter((r) => r._unknownClass).map((r) => r._unknownClass))]; if (unknownClasses.length > 0) { return toast.error(`Unknown classes: ${unknownClasses.join(", ")}. Check the class names or add them first.`); } setImporting(true); try { const res = await fetch("/api/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ students: preview.map(({ _unknownClass, className, ...rest }) => rest) }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Import failed"); toast.success(result.message || `${preview.length} students imported`); setCsvText(""); setPreview([]); await onComplete(); onClose(); } catch (error: any) { toast.error(error.message); } finally { setImporting(false); } };
  return (<ModalFrame title={`Bulk Import Students — ${campusName}`} eyebrow="Student enrollment" onClose={onClose} wide><div className="mb-4 rounded-2xl bg-[#fbf0fe]/60 p-4"><p className="text-[10px] font-bold text-[#4d4354]/60">Paste CSV data with columns: Full Name, Roll No, Gender (MALE/FEMALE/OTHER), Class (e.g. &quot;Grade 8 A&quot;), Guardian Name, Guardian Phone, Guardian Email</p><button type="button" onClick={downloadTemplate} className="mt-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer"><Download className="h-3 w-3" />Download CSV Template</button></div><textarea value={csvText} onChange={(e) => { setCsvText(e.target.value); parseCSV(e.target.value); }} placeholder={`Full Name, Roll No, Gender, Class, Guardian Name, Guardian Phone, Guardian Email\nJohn Doe, 101, MALE, Grade 8 A, Jane Doe, +923001234567, jane@example.com`} className="h-40 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/30 p-4 text-sm font-bold outline-none resize-none transition-all focus:border-[#8127cf]/35 focus:bg-white" />{parsedError ? (<p className="mt-2 text-xs font-bold text-rose-600">{parsedError}</p>) : null}{preview.length > 0 ? (<div className="mt-4"><p className="mb-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Preview: {preview.length} students</p><div className="max-h-48 overflow-y-auto rounded-2xl border border-[#cfc2d6]/10 custom-scrollbar"><table className="w-full text-left text-[11px]"><thead><tr className="bg-[#f3f4f9]/60 text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40"><th className="px-4 py-2">Name</th><th className="px-4 py-2">Roll</th><th className="px-4 py-2">Class</th><th className="px-4 py-2">Guardian</th></tr></thead><tbody className="divide-y divide-[#f3f4f9]">{preview.slice(0, 20).map((row, i) => (<tr key={i}><td className="px-4 py-2 font-bold text-[#1f1a23]">{row.fullName}</td><td className="px-4 py-2 text-[#4d4354]/60">{row.rollNo}</td><td className="px-4 py-2 text-[#4d4354]/60">{row.className}</td><td className="px-4 py-2 text-[#4d4354]/60">{row.guardianName || "—"}</td></tr>))}</tbody></table>{preview.length > 20 ? (<p className="p-3 text-center text-[10px] font-bold text-[#4d4354]/40">+{preview.length - 20} more rows</p>) : null}</div><div className="mt-5 flex justify-end gap-3"><BrandButton variant="soft" onClick={() => { setCsvText(""); setPreview([]); }}>Clear</BrandButton><BrandButton variant="dark" onClick={handleImport} disabled={importing}>{importing ? <Loader2 className="w-4 h-4 animate-spin" /> : `Import ${preview.length} Students`}</BrandButton></div></div>) : null}</ModalFrame>);
}

function ActivityLogModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [filter, setFilter] = useState("all"); const [page, setPage] = useState(1); const perPage = 25;
  const fetchLogs = async () => { setLoading(true); try { const params = new URLSearchParams({ limit: "200" }); if (filter !== "all") params.set("tableName", filter); const res = await fetch(`/api/audit-log?${params}`); const result = await res.json(); if (res.ok) setLogs(result.data || []); } catch { setLogs([]); } finally { setLoading(false); } };
  useEffect(() => { fetchLogs(); }, [filter]);
  const filtered = logs; const totalPages = Math.max(1, Math.ceil(filtered.length / perPage)); const safePage = Math.min(page, totalPages); const pagedLogs = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  useEffect(() => { setPage(1); }, [filter]);
  const tableOptions = [{ value: "all", label: "All Events" }, { value: "student", label: "Students" }, { value: "class", label: "Classes" }, { value: "subject", label: "Subjects" }, { value: "invitation", label: "Invitations" }, { value: "marks", label: "Marks" }];
  const describeLog = (log: any): { label: string; detail: string; userName: string } => { const userName = log.user?.fullName || log.user?.email || "System"; const table = log.tableName.replace(/_/g, " "); const isCreate = !log.oldValue; const isDelete = !log.newValue; const oldV = log.oldValue || {}; const newV = log.newValue || {}; if (table === "student") { const name = newV.fullName || oldV.fullName || "a student"; if (isCreate) return { label: `Added ${name}`, detail: `Roll ${newV.rollNo || ""}`, userName }; if (oldV.classId && newV.classId && oldV.classId !== newV.classId) return { label: `Moved ${name}`, detail: `Class changed`, userName }; return { label: `Updated ${name}`, detail: "", userName }; } if (table === "class") { const name = newV.name || oldV.name || ""; const section = newV.section || oldV.section || ""; if (isCreate) return { label: `Created class ${name}`, detail: `Section ${section}, ${newV.academicYear || ""}`, userName }; const oldTeacher = oldV.classTeacherId; const newTeacher = newV.classTeacherId; if (oldTeacher !== undefined && newTeacher !== undefined && oldTeacher !== newTeacher) return { label: `Changed teacher for ${name}`, detail: `Teacher assigned`, userName }; return { label: `Updated class ${name}`, detail: `Section ${section}`, userName }; } if (table === "subject") { const name = newV.name || oldV.name || ""; if (isCreate) return { label: `Added subject ${name}`, detail: "", userName }; if (isDelete) return { label: `Removed subject ${name}`, detail: "", userName }; const oldT = oldV.teacherId; const newT = newV.teacherId; if (oldT !== newT) return { label: `Changed teacher for ${name}`, detail: newT ? `Teacher assigned` : "Unassigned", userName }; return { label: `Updated subject ${name}`, detail: "", userName }; } if (table === "invitation") { const email = newV.email || oldV.email || ""; const role = newV.role || oldV.role || ""; if (isCreate) return { label: `Invited ${role?.replace(/_/g, " ")}`, detail: email, userName }; return { label: `Updated invitation`, detail: email, userName }; } if (table === "marks") { return { label: `Entered marks`, detail: `${Object.keys(newV).length} subjects`, userName }; } return { label: `${isCreate ? "Created" : isDelete ? "Deleted" : "Updated"} ${table}`, detail: "", userName }; };
  return (<ModalFrame title="Activity Log" eyebrow="Campus audit trail" onClose={onClose} wide><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1">{tableOptions.map((opt) => (<button key={opt.value} type="button" onClick={() => setFilter(opt.value)} className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-normal transition-all cursor-pointer ${filter === opt.value ? "bg-white text-[#8127cf] shadow-sm" : "text-[#4d4354]/50 hover:text-[#8127cf]"}`}>{opt.label}</button>))}</div><span className="text-[9px] font-bold text-[#4d4354]/40">{filtered.length} entries</span></div>{loading ? (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" /></div>) : pagedLogs.length === 0 ? (<p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">No activity recorded yet.</p>) : (<><div className="max-h-80 overflow-y-auto custom-scrollbar space-y-2">{pagedLogs.map((log) => { const { label, detail, userName } = describeLog(log); return (<div key={log.id} className="rounded-2xl bg-[#fbf0fe]/50 px-4 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black text-[#1f1a23]">{label}</p>{detail ? (<p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{detail}</p>) : null}<p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/35">by {userName}</p></div><span className="shrink-0 whitespace-nowrap text-[9px] font-bold text-[#4d4354]/40">{new Date(log.createdAt).toLocaleString()}</span></div></div>); })}</div>{totalPages > 1 ? (<div className="mt-4 flex items-center justify-center gap-3"><button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">Previous</button><span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/50">Page {safePage} of {totalPages}</span><button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">Next</button></div>) : null}</>)}</ModalFrame>);
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (<ModalFrame title="Help Center" eyebrow="Campus support" onClose={onClose}><div className="space-y-5"><div className="rounded-3xl bg-[#fbf0fe]/65 p-5"><p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Getting Started</p><p className="mt-2 text-sm font-semibold leading-relaxed text-[#4d4354]/70">This is your principal workspace. From here you can manage classes, teachers, students, exams, report cards, and AI-powered insights.</p></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4"><p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Academics</p><p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Manage class structure, sections, teachers, and subjects. Access attendance records and fee summaries.</p></div><div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4"><p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Faculty</p><p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Invite teachers and campus admins, view profiles, and manage subject assignments.</p></div><div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4"><p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Students</p><p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Search, filter, and manage student profiles. Bulk import via CSV and export to CSV.</p></div><div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4"><p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Reports & AI</p><p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Review and publish report cards, approve remarks, and leverage AI insights for academic oversight.</p></div></div><div className="rounded-3xl bg-[#fbf0fe]/50 p-5"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Need more help?</p><p className="mt-1 text-xs font-semibold text-[#4d4354]/55">Contact your school administration for advanced support. Additional documentation and FAQs are available through your school&apos;s IT department.</p></div></div></ModalFrame>);
}

function StudentDetailModal({ student, busy, onClose, onMove, onDelete, onUpdate }: {
  student: any; busy: boolean; onClose: () => void; onMove: () => void; onDelete: (student: any) => void; onUpdate: (studentId: string, updates: Record<string, any>) => Promise<void>;
}) {
  const report = student.reportCards?.[0];
  const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [parentLink, setParentLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  const generateParentLink = async () => {
    setGeneratingLink(true);
    try {
      const res = await fetch("/api/parent/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
      });
      const json = await res.json();
      if (json.success) {
        setParentLink(json.portalUrl);
        toast.success("Parent portal link generated (valid 30 days)");
      } else {
        toast.error(json.error || "Failed to generate link");
      }
    } catch {
      toast.error("Failed to generate parent link");
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyParentLink = () => {
    if (!parentLink) return;
    navigator.clipboard.writeText(parentLink);
    setLinkCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setLinkCopied(false), 2000);
  };

  useEffect(() => {
    setEdits({
      fullName: student.fullName || "", nameUr: student.nameUr || "", rollNo: student.rollNo || "",
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split("T")[0] : "",
      gender: student.gender || "", bloodType: student.bloodType || "", nationality: student.nationality || "",
      phone: student.phone || "", guardianName: student.guardianName || "", guardianNameUr: student.guardianNameUr || "",
      guardianPhone: student.guardianPhone || "", guardianEmail: student.guardianEmail || "",
      guardianRelationship: student.guardianRelationship || "", guardianOccupation: student.guardianOccupation || "",
      city: student.city || "", province: student.province || "", postalCode: student.postalCode || "",
      address: student.address || "", medicalNotes: student.medicalNotes || "", specialNeeds: student.specialNeeds || "",
      allergies: student.allergies || "", medications: student.medications || "", previousSchool: student.previousSchool || "",
    });
  }, [student.id]);

  const ed = (field: string) => edits[field] || "";
  const setEd = (field: string, value: string) => setEdits((p) => ({ ...p, [field]: value }));

  const saveEdits = async () => {
    const updates: Record<string, any> = {};
    const strFields = ["fullName","nameUr","rollNo","gender","bloodType","nationality","phone","guardianName","guardianNameUr","guardianPhone","guardianEmail","guardianRelationship","guardianOccupation","city","province","postalCode","address","medicalNotes","specialNeeds","allergies","medications","previousSchool"];
    for (const f of strFields) updates[f] = edits[f] || null;
    if (edits.fullName) updates.fullName = edits.fullName;
    if (edits.rollNo) updates.rollNo = edits.rollNo;
    if (edits.dateOfBirth) updates.dateOfBirth = edits.dateOfBirth;
    await onUpdate(student.id, updates);
    setEditing(false);
  };

  const formatDob = (d: any) => { if (!d) return "N/A"; try { return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" }); } catch { return "N/A"; } };
  const genderLabel = (g: string) => { if (g === "MALE") return "Male"; if (g === "FEMALE") return "Female"; if (g === "OTHER") return "Other"; return g || "N/A"; };
  const relationshipLabel = (r: string) => { const m: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian", UNCLE: "Uncle", AUNT: "Aunt", GRANDPARENT: "Grandparent", SIBLING: "Sibling" }; return m[r] || r || "N/A"; };

  return (
    <ModalFrame title={student.fullName} eyebrow="Student profile" onClose={onClose} wide>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onDelete(student)} className="flex h-9 items-center gap-1.5 rounded-xl bg-rose-50 px-3 text-[10px] font-black uppercase tracking-normal text-rose-600 transition-all hover:bg-rose-100 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />Delete Student
          </button>
          <button type="button" onClick={generateParentLink} disabled={generatingLink} className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-normal text-emerald-600 transition-all hover:bg-emerald-100 cursor-pointer disabled:opacity-50">
            {generatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            Parent Portal Link
          </button>
        </div>
        <button type="button" onClick={() => setEditing(!editing)} className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-normal transition-all cursor-pointer ${editing ? "bg-[#f3f4f9] text-[#4d4354]/60" : "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e0f8]"}`}>
          <Pencil className="h-3.5 w-3.5" />{editing ? "Cancel" : "Edit Details"}
        </button>
      </div>

      {parentLink && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200/50 p-3">
          <ExternalLink className="h-4 w-4 text-emerald-600 shrink-0" />
          <input type="text" readOnly value={parentLink} className="flex-1 bg-transparent text-xs font-mono text-emerald-800 outline-none truncate" />
          <button type="button" onClick={copyParentLink} className="flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[9px] font-black uppercase text-white hover:bg-emerald-700 transition-colors cursor-pointer shrink-0">
            {linkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {linkCopied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-gradient-to-br from-[#fbf0fe]/65 via-[#fbf0fe]/40 to-white border border-[#cfc2d6]/10 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Full Name (English)" value={ed("fullName")} placeholder="Student name" onChange={(v) => setEd("fullName", v)} />
                <FormInput label="Full Name (Urdu)" value={ed("nameUr")} placeholder="اردو نام" onChange={(v) => setEd("nameUr", v)} />
              </div>
              <FormInput label="Roll Number" value={ed("rollNo")} placeholder="Roll number" onChange={(v) => setEd("rollNo", v)} />
            </div>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Student Record</p>
              <h3 className="mt-1 truncate text-3xl font-black tracking-normal text-[#1f1a23]">{student.fullName}</h3>
              {student.nameUr ? <p className="mt-0.5 text-lg font-semibold text-[#4d4354]/70" dir="rtl">{student.nameUr}</p> : null}
              <p className="mt-2 text-sm font-semibold uppercase tracking-normal text-[#4d4354]/55">{student.rollNo || "No roll number"} - {classLabel(student.class)}</p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Roll No" value={student.rollNo || "N/A"} active />
        <MiniMetric label="Class" value={classLabel(student.class)} />
        <MiniMetric label="Status" value={student.status === "active" ? "Active" : student.status || "Active"} />
        <MiniMetric label="Latest Result" value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 p-5 shadow-sm">
          <PanelTitle icon={User} title="Personal Info" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Date of Birth" value={ed("dateOfBirth")} placeholder="YYYY-MM-DD" onChange={(v) => setEd("dateOfBirth", v)} />
              <FormSelect label="Gender" value={ed("gender")} onChange={(v) => setEd("gender", v)}>
                <option value="">Not specified</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
              </FormSelect>
              <FormSelect label="Blood Type" value={ed("bloodType")} onChange={(v) => setEd("bloodType", v)}>
                <option value="">Not known</option>{["A+","A-","B+","B-","O+","O-","AB+","AB-"].map((bt) => <option key={bt} value={bt}>{bt}</option>)}
              </FormSelect>
              <FormInput label="Nationality" value={ed("nationality")} placeholder="Pakistan" onChange={(v) => setEd("nationality", v)} />
              <FormInput label="Phone" value={ed("phone")} placeholder="+92 300 1234567" onChange={(v) => setEd("phone", v)} />
              <FormInput label="Previous School" value={ed("previousSchool")} placeholder="Previous school" onChange={(v) => setEd("previousSchool", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Student Login" value={student.studentUser?.email || "Not linked"} />
              <DetailRow label="Date of Birth" value={formatDob(student.dateOfBirth)} />
              <DetailRow label="Gender" value={genderLabel(student.gender)} />
              <DetailRow label="Blood Type" value={student.bloodType || "N/A"} />
              <DetailRow label="Nationality" value={student.nationality || "N/A"} />
              <DetailRow label="Phone" value={student.phone || "N/A"} />
              <DetailRow label="Previous School" value={student.previousSchool || "N/A"} />
              <DetailRow label="Enrolled" value={formatDob(student.enrollmentDate)} />
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 p-5 shadow-sm">
          <PanelTitle icon={Users} title="Guardian" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Name (English)" value={ed("guardianName")} placeholder="Guardian name" onChange={(v) => setEd("guardianName", v)} />
                <FormInput label="Name (Urdu)" value={ed("guardianNameUr")} placeholder="سرپرست کا نام" onChange={(v) => setEd("guardianNameUr", v)} />
              </div>
              <FormSelect label="Relationship" value={ed("guardianRelationship")} onChange={(v) => setEd("guardianRelationship", v)}>
                <option value="">Select</option>{["FATHER","MOTHER","GUARDIAN","UNCLE","AUNT","GRANDPARENT","SIBLING"].map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
              </FormSelect>
              <FormInput label="Occupation" value={ed("guardianOccupation")} placeholder="Occupation" onChange={(v) => setEd("guardianOccupation", v)} />
              <FormInput label="Phone" value={ed("guardianPhone")} placeholder="Guardian phone" onChange={(v) => setEd("guardianPhone", v)} />
              <FormInput label="Email" value={ed("guardianEmail")} placeholder="Guardian email" onChange={(v) => setEd("guardianEmail", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Name" value={student.guardianName || "N/A"} />
              {student.guardianNameUr ? <DetailRow label="Name (Urdu)" value={<span dir="rtl">{student.guardianNameUr}</span>} /> : null}
              <DetailRow label="Relationship" value={relationshipLabel(student.guardianRelationship)} />
              <DetailRow label="Occupation" value={student.guardianOccupation || "N/A"} />
              <DetailRow label="Phone" value={student.guardianPhone || student.guardianWhatsapp || "N/A"} />
              <DetailRow label="Email" value={student.guardianEmail || "N/A"} />
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 p-5 shadow-sm">
          <PanelTitle icon={MapPin} title="Address" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Address" value={ed("address")} placeholder="Street address" onChange={(v) => setEd("address", v)} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="City" value={ed("city")} placeholder="City" onChange={(v) => setEd("city", v)} />
                <FormInput label="Province" value={ed("province")} placeholder="Province" onChange={(v) => setEd("province", v)} />
              </div>
              <FormInput label="Postal Code" value={ed("postalCode")} placeholder="Postal code" onChange={(v) => setEd("postalCode", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Address" value={student.address || "N/A"} />
              <DetailRow label="City" value={student.city || "N/A"} />
              <DetailRow label="Province" value={student.province || "N/A"} />
              <DetailRow label="Postal Code" value={student.postalCode || "N/A"} />
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 p-5 shadow-sm">
          <PanelTitle icon={Heart} title="Medical & Health" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Medical Notes" value={ed("medicalNotes")} placeholder="Medical conditions" onChange={(v) => setEd("medicalNotes", v)} />
              <FormInput label="Special Needs" value={ed("specialNeeds")} placeholder="Special needs" onChange={(v) => setEd("specialNeeds", v)} />
              <FormInput label="Allergies" value={ed("allergies")} placeholder="Allergies" onChange={(v) => setEd("allergies", v)} />
              <FormInput label="Medications" value={ed("medications")} placeholder="Medications" onChange={(v) => setEd("medications", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Medical Notes" value={student.medicalNotes || "None"} />
              <DetailRow label="Special Needs" value={student.specialNeeds || "None"} />
              <DetailRow label="Allergies" value={student.allergies || "None"} />
              <DetailRow label="Medications" value={student.medications || "None"} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-3xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 p-5 shadow-sm">
        <PanelTitle icon={FileText} title="Report Card" />
        {report ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DetailRow label="Exam" value={report.exam?.title || "N/A"} />
            <DetailRow label="Status" value={<StatusPill status={report.status} />} />
            <DetailRow label="Generated" value={formatDate(report.generatedAt)} />
          </div>
        ) : (
          <div className="mt-4"><EmptyInline text="No report card has been generated for this student yet." /></div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {editing ? (
          <BrandButton variant="dark" className="h-12" onClick={saveEdits} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </BrandButton>
        ) : null}
        <BrandButton variant="soft" icon={<School className="w-4 h-4" />} onClick={onMove}>Move Class / Section</BrandButton>
      </div>
    </ModalFrame>
  );
}

function TeacherDetailModal({ teacher, onClose, onUpdate }: { teacher: any; onClose: () => void; onUpdate?: (teacherId: string, updates: Record<string, any>) => Promise<void> }) {
  const ledClasses = teacher.ledClasses || [];
  const taughtSubjects = teacher.taughtSubjects || [];
  const avatar = teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teacher.fullName)}`;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEdits({
      fullName: teacher.fullName || "",
      phone: teacher.phone || "",
      cnic: teacher.cnic || "",
      dateOfBirth: teacher.dateOfBirth ? new Date(teacher.dateOfBirth).toISOString().split("T")[0] : "",
      gender: teacher.gender || "",
      qualification: teacher.qualification || "",
      specialization: teacher.specialization || "",
      experience: teacher.experience || "",
      joiningDate: teacher.joiningDate ? new Date(teacher.joiningDate).toISOString().split("T")[0] : "",
      address: teacher.address || "",
      city: teacher.city || "",
      province: teacher.province || "",
      postalCode: teacher.postalCode || "",
      emergencyContact: teacher.emergencyContact || "",
      emergencyPhone: teacher.emergencyPhone || "",
    });
  }, [teacher.id]);

  const ed = (field: string) => edits[field] || "";
  const setEd = (field: string, value: string) => setEdits((p) => ({ ...p, [field]: value }));

  const saveEdits = async () => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      const strFields = [
        "fullName", "phone", "cnic", "gender", "qualification", "specialization",
        "experience", "address", "city", "province", "postalCode",
        "emergencyContact", "emergencyPhone",
      ];
      for (const f of strFields) updates[f] = edits[f] || null;
      if (edits.fullName) updates.fullName = edits.fullName;
      if (edits.dateOfBirth) updates.dateOfBirth = edits.dateOfBirth;
      if (edits.joiningDate) updates.joiningDate = edits.joiningDate;
      await onUpdate(teacher.id, updates);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: any) => {
    if (!d) return "N/A";
    try { return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" }); } catch { return "N/A"; }
  };

  const genderLabel = (g: string) => {
    if (g === "MALE") return "Male";
    if (g === "FEMALE") return "Female";
    if (g === "OTHER") return "Other";
    return g || "N/A";
  };

  return (
    <ModalFrame title={teacher.fullName} eyebrow="Teacher profile" onClose={onClose} wide>
      <div className="mb-4 flex justify-end">
        {onUpdate ? (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-normal transition-all cursor-pointer ${
              editing ? "bg-[#f3f4f9] text-[#4d4354]/60" : "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e0f8]"
            }`}
          >
            <Pencil className="h-3 w-3" />
            {editing ? "Cancel" : "Edit Details"}
          </button>
        ) : null}
      </div>

      {/* ── Header Card ── */}
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-gradient-to-br from-[#fbf0fe]/65 via-[#fbf0fe]/40 to-white border border-[#cfc2d6]/10 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <FormInput label="Full Name" value={ed("fullName")} placeholder="Teacher name" onChange={(v) => setEd("fullName", v)} />
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Faculty Record</p>
              <h3 className="mt-1 truncate text-3xl font-black tracking-normal text-[#1f1a23]">{teacher.fullName}</h3>
              <p className="mt-2 text-sm font-semibold uppercase tracking-normal text-[#4d4354]/55">{teacher.email || "No email"}</p>
            </>
          )}
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Subjects" value={teacher._count?.taughtSubjects || taughtSubjects.length} active />
        <MiniMetric label="Class Teacher" value={teacher._count?.ledClasses || ledClasses.length} />
        <MiniMetric label="Status" value={teacher.isActive ? "Active" : "Inactive"} />
        <MiniMetric label="Onboarding" value={teacher.onboardingComplete ? "Done" : "Pending"} />
      </div>

      {/* ── Profile Sections ── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal Info */}
        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 p-5">
          <PanelTitle icon={User} title="Personal Info" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Email" value={teacher.email || ""} placeholder="Email" onChange={() => {}} />
              <FormInput label="Phone" value={ed("phone")} placeholder="+92 300 1234567" onChange={(v) => setEd("phone", v)} />
              <FormInput label="CNIC" value={ed("cnic")} placeholder="12345-1234567-1" onChange={(v) => setEd("cnic", v)} />
              <FormInput label="Date of Birth" value={ed("dateOfBirth")} placeholder="YYYY-MM-DD" onChange={(v) => setEd("dateOfBirth", v)} />
              <FormSelect label="Gender" value={ed("gender")} onChange={(v) => setEd("gender", v)}>
                <option value="">Not specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </FormSelect>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Email" value={teacher.email || "N/A"} />
              <DetailRow label="Phone" value={teacher.phone || "N/A"} />
              <DetailRow label="CNIC" value={teacher.cnic || "N/A"} />
              <DetailRow label="Date of Birth" value={formatDate(teacher.dateOfBirth)} />
              <DetailRow label="Gender" value={genderLabel(teacher.gender)} />
            </div>
          )}
        </div>

        {/* Professional Details */}
        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 p-5">
          <PanelTitle icon={Briefcase} title="Professional" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormSelect label="Qualification" value={ed("qualification")} onChange={(v) => setEd("qualification", v)}>
                <option value="">Select qualification</option>
                <option value="Matric">Matric</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Bachelors">Bachelors</option>
                <option value="Masters">Masters</option>
                <option value="MPhil">MPhil</option>
                <option value="PhD">PhD</option>
                <option value="B.Ed">B.Ed</option>
                <option value="M.Ed">M.Ed</option>
              </FormSelect>
              <FormInput label="Specialization" value={ed("specialization")} placeholder="e.g. Mathematics" onChange={(v) => setEd("specialization", v)} />
              <FormInput label="Experience" value={ed("experience")} placeholder="e.g. 5 years" onChange={(v) => setEd("experience", v)} />
              <FormInput label="Joining Date" value={ed("joiningDate")} placeholder="YYYY-MM-DD" onChange={(v) => setEd("joiningDate", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Qualification" value={teacher.qualification || "N/A"} />
              <DetailRow label="Specialization" value={teacher.specialization || "N/A"} />
              <DetailRow label="Experience" value={teacher.experience || "N/A"} />
              <DetailRow label="Joining Date" value={formatDate(teacher.joiningDate)} />
            </div>
          )}
        </div>

        {/* Address */}
        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 p-5">
          <PanelTitle icon={MapPin} title="Address" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Address" value={ed("address")} placeholder="Street address" onChange={(v) => setEd("address", v)} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="City" value={ed("city")} placeholder="City" onChange={(v) => setEd("city", v)} />
                <FormSelect label="Province" value={ed("province")} onChange={(v) => setEd("province", v)}>
                  <option value="">Select province</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Sindh">Sindh</option>
                  <option value="KPK">KPK</option>
                  <option value="Balochistan">Balochistan</option>
                  <option value="Islamabad">Islamabad</option>
                  <option value="AJK">AJK</option>
                  <option value="Gilgit-Baltistan">Gilgit-Baltistan</option>
                </FormSelect>
              </div>
              <FormInput label="Postal Code" value={ed("postalCode")} placeholder="Postal code" onChange={(v) => setEd("postalCode", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Address" value={teacher.address || "N/A"} />
              <DetailRow label="City" value={teacher.city || "N/A"} />
              <DetailRow label="Province" value={teacher.province || "N/A"} />
              <DetailRow label="Postal Code" value={teacher.postalCode || "N/A"} />
            </div>
          )}
        </div>

        {/* Emergency Contact */}
        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 p-5">
          <PanelTitle icon={Shield} title="Emergency Contact" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Contact Person" value={ed("emergencyContact")} placeholder="Emergency contact name" onChange={(v) => setEd("emergencyContact", v)} />
              <FormInput label="Contact Phone" value={ed("emergencyPhone")} placeholder="Emergency phone" onChange={(v) => setEd("emergencyPhone", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Contact Person" value={teacher.emergencyContact || "N/A"} />
              <DetailRow label="Contact Phone" value={teacher.emergencyPhone || "N/A"} />
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-6 flex justify-end">
          <BrandButton variant="dark" className="h-12" onClick={saveEdits} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </BrandButton>
        </div>
      ) : null}

      {/* ── Led Classes & Taught Subjects ── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={School} title="Led Classes" />
            <StatusPill status={`${ledClasses.length} Classes`} />
          </div>
          <div className="space-y-2">
            {ledClasses.map((cls: any) => (
              <div key={cls.id} className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/55 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 px-4 py-3">
                <p className="text-sm font-black text-[#1f1a23]">{classLabel(cls)}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                  {cls._count?.students || 0} students - {cls._count?.subjects || 0} subjects
                </p>
              </div>
            ))}
            {ledClasses.length === 0 ? <EmptyInline text="This teacher is not the class teacher for any class yet." /> : null}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={BookOpen} title="Taught Subjects" />
            <StatusPill status={`${taughtSubjects.length} Subjects`} />
          </div>
          <div className="space-y-2">
            {taughtSubjects.map((subj: any) => (
              <div key={subj.id} className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/55 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 px-4 py-3">
                <p className="text-sm font-black text-[#1f1a23]">{subj.name}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                  {classLabel(subj.class)} · {subj.totalMarks || 100} marks
                </p>
              </div>
            ))}
            {taughtSubjects.length === 0 ? <EmptyInline text="This teacher has no subject assignments yet." /> : null}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-[#e8e0ec] rounded-2xl ${className}`} />;
}

function PrincipalSkeleton() {
  return (
    <div className="min-h-screen bg-[#f3f4f9] flex font-sans">
      <div className="hidden md:flex w-64 shrink-0 flex-col bg-white border-r border-[#cfc2d6]/10 p-5 gap-6">
        <SkeletonBlock className="h-8 w-32 rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <SkeletonBlock key={i} className="h-11 w-full rounded-2xl" />
          ))}
        </div>
        <div className="mt-auto space-y-3">
          <SkeletonBlock className="h-11 w-full rounded-2xl" />
          <SkeletonBlock className="h-11 w-full rounded-2xl" />
        </div>
      </div>
      <main className="flex-1 p-4 md:p-8 flex flex-col h-screen">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-4 w-36" />
          </div>
          <div className="flex gap-3">
            <SkeletonBlock className="h-10 w-10 rounded-full" />
            <SkeletonBlock className="h-10 w-10 rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonBlock key={i} className="h-24 rounded-[20px]" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2">
            <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-5">
              <div className="flex items-center gap-3 mb-4">
                <SkeletonBlock className="h-10 w-10 rounded-2xl" />
                <div className="space-y-2">
                  <SkeletonBlock className="h-4 w-36" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
              </div>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <SkeletonBlock key={i} className="h-16 w-full rounded-2xl" />
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <SkeletonBlock className="h-40 w-full rounded-[28px]" />
            <SkeletonBlock className="h-32 w-full rounded-[28px]" />
            <SkeletonBlock className="h-32 w-full rounded-[28px]" />
            <SkeletonBlock className="h-28 w-full rounded-[32px]" />
          </div>
        </div>
      </main>
    </div>
  );
}

function ClassDetailModal({ cls, teachers, onChangeTeacher, onUpdateClass, onDeleteClass, onCreateSubject, creatingSubject, onDeleteSubject, onUpdateSubject, onClose }: {
  cls: any; teachers: any[]; onChangeTeacher: (classId: string, teacherId: string) => Promise<void>; onUpdateClass: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>; onDeleteClass: (cls: any) => void; onCreateSubject: (classId: string, subject: { name: string; totalMarks: number; teacherId: string }) => Promise<boolean>; creatingSubject: boolean; onDeleteSubject: (subject: any) => void; onUpdateSubject: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>; onClose: () => void;
}) {
  const [editing, setEditing] = useState(false); const [editName, setEditName] = useState(cls.name || ""); const [editSection, setEditSection] = useState(cls.section || ""); const [editYear, setEditYear] = useState(cls.academicYear || new Date().getFullYear()); const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null); const [editSubjectName, setEditSubjectName] = useState(""); const [editSubjectMarks, setEditSubjectMarks] = useState(100); const [teachingMode, setTeachingMode] = useState<"one" | "multi">("one"); const [teacherId, setTeacherId] = useState(cls.classTeacher?.id || ""); const [saving, setSaving] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState(""); const [newSubjectMarks, setNewSubjectMarks] = useState("100"); const [newSubjectTeacherId, setNewSubjectTeacherId] = useState(cls.classTeacher?.id || "");
  const handleSave = async () => { setSaving(true); try { await onChangeTeacher(cls.id, teacherId); await onUpdateClass(cls.id, { name: editName, section: editSection, academicYear: editYear }); toast.success("Class updated"); setEditing(false); } finally { setSaving(false); } };
  const handleUpdateSubject = async (subjectId: string) => { await onUpdateSubject(cls.id, subjectId, { name: editSubjectName, totalMarks: editSubjectMarks }); setEditingSubjectId(null); };
  const handleAddSubject = async () => { const created = await onCreateSubject(cls.id, { name: newSubjectName, totalMarks: Number(newSubjectMarks) || 100, teacherId: newSubjectTeacherId }); if (created) { setNewSubjectName(""); setNewSubjectMarks("100"); } };
  return (<ModalFrame title={classLabel(cls)} onClose={onClose}><div className="space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
    <div><div className="flex items-center justify-between gap-3 mb-3"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Class Details</p><button type="button" onClick={() => setEditing(!editing)} className="text-[9px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer">{editing ? "Cancel" : "Edit"}</button></div>
    {editing ? (<div className="space-y-3"><div className="grid grid-cols-3 gap-3"><FormInput label="Name" value={editName} onChange={setEditName} /><FormInput label="Section" value={editSection} onChange={setEditSection} /><FormInput label="Year" value={String(editYear)} onChange={(v) => setEditYear(Number(v) || new Date().getFullYear())} /></div><FormSelect label="Class Teacher" value={teacherId} onChange={setTeacherId}><option value="">No teacher</option>{teachers.map((t) => (<option key={t.id} value={t.id}>{t.fullName}</option>))}</FormSelect><div className="flex gap-2"><BrandButton variant="soft" onClick={handleSave} disabled={saving}>Save</BrandButton><BrandButton variant="danger" onClick={() => onDeleteClass(cls)}>Delete Class</BrandButton></div></div>) : (<div className="space-y-2"><DetailRow label="Name" value={cls.name} /><DetailRow label="Section" value={cls.section || "—"} /><DetailRow label="Year" value={cls.academicYear} /><DetailRow label="Class Teacher" value={cls.classTeacher?.fullName || "Unassigned"} /><DetailRow label="Students" value={cls._count?.students || 0} /><DetailRow label="Subjects" value={cls._count?.subjects || 0} /><DetailRow label="Exams" value={cls.exams?.length || 0} /></div>)}
    </div>
    <div><div className="flex items-center justify-between mb-3"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Teacher Assignment</p><div className="flex gap-1"><button type="button" onClick={() => setTeachingMode("one")} className={cn("px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-normal cursor-pointer transition-all", teachingMode === "one" ? "bg-[#8127cf] text-white" : "bg-[#f3f4f9] text-[#4d4354]/60")}>One Teacher</button><button type="button" onClick={() => setTeachingMode("multi")} className={cn("px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-normal cursor-pointer transition-all", teachingMode === "multi" ? "bg-[#8127cf] text-white" : "bg-[#f3f4f9] text-[#4d4354]/60")}>Subject Teachers</button></div></div>
    {teachingMode === "one" ? (<div className="space-y-3"><select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none cursor-pointer"><option value="">No teacher</option>{teachers.map((t) => (<option key={t.id} value={t.id}>{t.fullName}</option>))}</select><BrandButton variant="soft" onClick={async () => { await onChangeTeacher(cls.id, teacherId); toast.success("Teacher assigned"); }}>Apply</BrandButton></div>) : null}
    </div>
    <div><div className="flex items-center justify-between mb-3"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Subjects</p></div><div className="space-y-2">{cls.subjects?.map((subject: any) => (<div key={subject.id}>{editingSubjectId === subject.id ? (<div className="rounded-2xl bg-white border border-[#8127cf]/20 p-3 space-y-2"><div className="grid grid-cols-2 gap-2"><FormInput label="Name" value={editSubjectName} onChange={setEditSubjectName} /><FormInput label="Marks" value={String(editSubjectMarks)} onChange={(v) => setEditSubjectMarks(Number(v) || 100)} /></div><div className="flex gap-2"><BrandButton variant="soft" onClick={() => handleUpdateSubject(subject.id)}>Save</BrandButton><button type="button" onClick={() => setEditingSubjectId(null)} className="h-10 rounded-xl bg-[#f3f4f9] px-4 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 cursor-pointer">Cancel</button></div></div>) : (<div className="flex items-center justify-between gap-2 rounded-2xl bg-gradient-to-br from-[#fbf0fe]/60 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 px-4 py-3"><div className="min-w-0"><p className="text-xs font-black text-[#1f1a23]">{subject.name}</p><p className="text-[8px] font-bold uppercase tracking-normal text-[#4d4354]/45">{subject.teacher?.fullName || "Unassigned"} · {subject.totalMarks || 100} marks</p></div><div className="flex gap-1"><button type="button" onClick={() => { setEditingSubjectId(subject.id); setEditSubjectName(subject.name); setEditSubjectMarks(subject.totalMarks || 100); }} className="h-8 w-8 rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-[#8127cf] cursor-pointer"><Pencil className="h-3.5 w-3.5 mx-auto" /></button>{onDeleteSubject ? (<button type="button" onClick={() => onDeleteSubject(subject)} className="h-8 w-8 rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-rose-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5 mx-auto" /></button>) : null}</div></div>)}</div>))}{(!cls.subjects?.length) ? <p className="text-[10px] font-bold text-[#4d4354]/45">No subjects yet.</p> : null}
      <div className="mt-4 rounded-2xl border border-[#cfc2d6]/10 bg-white p-4">
        <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 mb-3">Add Subject</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <FormInput label="Name" value={newSubjectName} placeholder="e.g. Mathematics" onChange={setNewSubjectName} />
          <FormInput label="Marks" type="number" value={newSubjectMarks} placeholder="100" onChange={setNewSubjectMarks} />
        </div>
        <div className="flex items-end gap-3">
          <FormSelect label="Teacher" value={newSubjectTeacherId} onChange={setNewSubjectTeacherId}>
            <option value="">Unassigned</option>
            {teachers.map((t) => (<option key={t.id} value={t.id}>{t.fullName}</option>))}
          </FormSelect>
          <BrandButton variant="soft" onClick={handleAddSubject} disabled={creatingSubject || !newSubjectName.trim()}>
            {creatingSubject ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </BrandButton>
        </div>
      </div>
    </div></div>
    <div><div className="flex items-center justify-between mb-3"><p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Students ({cls.students?.length || 0})</p></div><div className="space-y-2 max-h-40 overflow-y-auto">{cls.students?.map((student: any) => (<div key={student.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-[#fbf0fe]/40 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/10 px-4 py-2"><div className="min-w-0"><p className="truncate text-xs font-black text-[#1f1a23]">{student.fullName}</p><p className="text-[8px] font-bold uppercase tracking-normal text-[#4d4354]/45">Roll {student.rollNo}</p></div><StatusPill status={student.reportCards?.[0]?.status || "NO_REPORT"} /></div>))}{!cls.students?.length ? <p className="text-[10px] font-bold text-[#4d4354]/45">No students enrolled.</p> : null}</div></div>
  </div></ModalFrame>);
}
