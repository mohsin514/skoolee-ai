"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarImage } from "@/components/ui/avatar-image";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  Award,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Download,
  DoorOpen,
  ExternalLink,
  FileText,
  MessageCircle,
  PhoneCall,
  Plane,
  Shield,
  GraduationCap,
  Heart,
  History,
  LayoutGrid,
  LayoutDashboard,
  CalendarRange,
  Loader2,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  Receipt,
  School,
  Send,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  TrendingUp,
  Upload,
  User,
  Bus,
  Building2,
  Wrench,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelInvitation, removeStaff, resendInvitation } from "@/app/actions/invite";
import {
  AiActionPanel,
  AIReviewQueue,
  BrandButton,
  EmptyState,
  RoleShell,
  StatCard,
  type RoleNavItem,
} from "@/components/role-dashboard";
import type { SidebarEntry } from "@/components/role-dashboard/RoleSidebar";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { CornerSparkles } from "@/components/CornerSparkles";
import { usePrincipalData } from "./principal-data-context";
import { AdmissionForm } from "@/app/dashboard/students/admission-form";
import { BulkImportDialog } from "@/app/dashboard/students/bulk-import-dialog";
import { CreateClassWizard } from "@/components/shared-admin/create-class-wizard";
import { AddTeacherForm } from "@/components/teacher/add-teacher-form";
import { AddStaffForm } from "@/components/staff/add-staff-form";
import { UnifiedAttendancePanel } from "@/components/attendance/unified-attendance-panel";
import { FeeOverviewTab } from "@/components/fees/FeeOverviewTab";
import {
  TransportPanel,
  DormitoryPanel,
  LibraryPanel,
  InventoryPanel,
} from "@/components/operations";
import { TimetableStudio } from "@/components/timetable/TimetableStudio";
import { ExamCycleManager } from "@/components/academic/ExamCycleManager";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { AcademicHub } from "@/components/academic/AcademicHub";
import { AcademicSubnav, ACADEMIC_VIEWS } from "@/components/academic/AcademicSubnav";
import { YearSetupWizard } from "@/components/academic/YearSetupWizard";
import { AcademicYearPanel } from "@/components/academic-year/AcademicYearPanel";
import { CycleManagementPanel } from "@/components/academic-year/CycleManagementPanel";
import { TeacherPerformancePanel } from "@/components/academic-year/TeacherPerformancePanel";
import {
  AcademicPanel,
  ActivityLogModal,
  AdmissionQueriesPanel,
  AIPanel,
  ArchivedStudentsPanel,
  AdminRow,
  FacultyRow,
  PendingFacultyRow,
  StudentDetailModal,
  exportStudentsToCSV,
  ClassDetailModal,
  HelpModal,
  LeadershipPanel,
  LeaveManagementPanel,
  MoveStudentModal,
  PeriodsPanel,
  RolePermissionsPanel,
  ReportCardsPanel,
  RoomsPanel,
  StudentsPanel,
  StudentSetupPanel,
  TeacherConflictsBanner,
  TeacherDetailModal,
  classLabel,
  formatDate,
  formatStatus,
  groupClasses,
  DetailRow,
  EmptyInline,
  FormInput,
  FormSelect,
  MiniMetric,
  ModalActions,
  ModalFrame,
  PanelTitle,
  StatusPill,
} from "@/components/shared-admin";

type PrincipalView =
  | "overview"
  | "leadership"
  | "classes"
  | "teachers"
  | "students"
  | "admission-queries"
  | "student-setup"
  | "promote-archive"
  | "leave"

  | "permissions"
  | "attendance"
  | "year-cycle"
  | "academic-hub"
  | "year-setup"
  | "exam-cycles"
  | "fees"
  | "timetable"
  | "class-rooms"
  | "period-setup"
  | "school-calendar"
  | "teacher-performance"
  | "report-cards"
  | "ai"
  | "engagement"
  | "transport"
  | "dormitory"
  | "library"
  | "inventory"
;
type ReportAction = "generate" | "pdf" | "review" | "publish" | "send";

const principalAIFeatures = [
  { feature: "at_risk_students", label: "At-risk Students", placeholder: "Optional exam, class, or attendance focus" },
  { feature: "class_performance_summary", label: "Class Summary", placeholder: "Class or exam focus" },
  { feature: "teacher_class_comparison", label: "Class Comparison", placeholder: "Classes, teachers, or term to compare" },
  { feature: "intervention_suggestions", label: "Intervention Plan", placeholder: "Student or class concern" },
  { feature: "pending_review_queue", label: "Review Queue", placeholder: "Optional priority note" },
];

export default function PrincipalDashboard() {
  const router = useRouter();
  const { data, loading, refetch } = usePrincipalData();
  const [activeView, setActiveView] = useState<PrincipalView>("overview");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editedRemarks, setEditedRemarks] = useState({ en: "", ur: "" });
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  // Set when a category or group card asks to see its students, cleared as soon
  // as the roster has taken it — so it is a hand-off, not a sticky filter.
  const [rosterFilter, setRosterFilter] = useState<{ categoryId?: string; groupId?: string } | null>(null);
  // What the roster / faculty list is showing, so a profile dialog can page
  // through the same set rather than making the admin close and reopen it.
  const [studentSequence, setStudentSequence] = useState<any[]>([]);
  const [teacherSequence, setTeacherSequence] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [showClassWizard, setShowClassWizard] = useState(false);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [admissionClassId, setAdmissionClassId] = useState("");
  const [convertingQuery, setConvertingQuery] = useState<any>(null);
  const [admissionQueriesVersion, setAdmissionQueriesVersion] = useState(0);
  const [studentsVersion, setStudentsVersion] = useState(0);
  const [bulkImportClassId, setBulkImportClassId] = useState("");
  const [showMoveStudentModal, setShowMoveStudentModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showAddTeacherForm, setShowAddTeacherForm] = useState(false);
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [showAddPrincipalForm, setShowAddPrincipalForm] = useState(false);
  const [showAddAccountantForm, setShowAddAccountantForm] = useState(false);
  const [showAddLibrarianForm, setShowAddLibrarianForm] = useState(false);
  const [showAddReceptionistForm, setShowAddReceptionistForm] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [moveClassId, setMoveClassId] = useState("");
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

  // Exports exactly what the directory is showing, so a filtered view exports
  // the filtered roster rather than silently dumping every student.
  const exportStudentsCSV = (visible?: any[]) =>
    exportStudentsToCSV(visible ?? data?.students ?? [], data?.campusName);

  const handleAdmissionSuccess = async (createdStudent?: any) => {
    const studentId = createdStudent?.id;
    if (convertingQuery && studentId) {
      try {
        const res = await fetch("/api/admission-queries", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: convertingQuery.id, convertedStudentId: studentId }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(`Query converted to ${createdStudent.fullName}`);
        } else {
          toast.error(data.error || "Could not mark query as converted");
        }
      } catch {
        toast.error("Student created, but could not mark the query as converted");
      }
      setConvertingQuery(null);
      // refetch() refreshes campus-wide counts but not the enquiries panel's
      // own list — that only re-fetches when this version bumps, which is
      // why a just-converted query kept showing ACTIVE until manual reload.
      setAdmissionQueriesVersion((v) => v + 1);
    }
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
    setShowAddAccountantForm(false);
    setShowAddLibrarianForm(false);
    setShowAddReceptionistForm(false);
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

  const handleCreateSubject = async (classId: string, subject: { name: string; totalMarks: number; teacherId: string; applyToAllSections?: boolean }) => {
    if (!subject.name.trim()) { toast.error("Subject name is required"); return false; }
    setCreatingSubjectClassId(classId);
    try { const res = await fetch("/api/subjects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId, name: subject.name.trim(), totalMarks: subject.totalMarks || 100, teacherId: subject.teacherId || undefined, applyToAllSections: subject.applyToAllSections || undefined }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to create subject"); toast.success(result.createdCount > 1 ? `Subject added to ${result.createdCount} sections` : "Subject added"); await refetch(); return true; }
    catch (error: any) { toast.error(error.message); return false; } finally { setCreatingSubjectClassId(null); }
  };

  const handleUpdateSubject = async (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => {
    setSavingSubjectUpdateId(subjectId);
    try { const res = await fetch("/api/subjects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subjectId, ...updates }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to update subject"); toast.success("Subject updated"); await refetch(); }
    catch (error: any) { toast.error(error.message); } finally { setSavingSubjectUpdateId(null); }
  };

  const handleChangeSubjectTeacher = async (classId: string, subjectId: string, teacherId: string) => {
    setSavingSubjectId(subjectId);
    try { const res = await fetch("/api/subjects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subjectId, teacherId: teacherId || null }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Subject teacher could not be updated"); toast.success("Subject teacher updated"); (result.clashes || []).forEach((c: any) => toast.warning(c.message)); await refetch(); }
    catch (error: any) { toast.error(error.message); } finally { setSavingSubjectId(null); }
  };

  // Switching to SINGLE makes the API propagate the class teacher across every
  // subject in one call, so the two can never drift out of sync.
  const handleChangeTeachingMode = async (classId: string, mode: "SINGLE" | "SUBJECT") => {
    setApplyingSubjectClassId(classId);
    try {
      const res = await fetch("/api/classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: classId, teachingMode: mode }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Teaching mode could not be updated");
      toast.success(mode === "SINGLE" ? "All subjects now follow the class teacher" : "Each subject can now have its own teacher");
      (result.clashes || []).forEach((c: any) => toast.warning(c.message));
      await refetch();
    } catch (error: any) { toast.error(error.message); } finally { setApplyingSubjectClassId(null); }
  };

  const handleAddSection = async (name: string, section: string, academicYear: number, convertClassId?: string) => {
    try {
      // Converting: the class had no sections, so rename that row rather than
      // spawning a sibling and stranding its students on an unnamed class.
      const res = convertClassId
        ? await fetch("/api/classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: convertClassId, section }) })
        : await fetch("/api/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, section, sections: [section], academicYear }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Section could not be created");
      toast.success(convertClassId ? `"${name}" now has section "${section}" — existing students moved into it` : `Section "${section}" created`);
      await refetch();
    } catch (error: any) { toast.error(error.message); }
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

  const openAdmissionForm = (classId?: string) => { setAdmissionClassId(classId || ""); setConvertingQuery(null); setShowAdmissionForm(true); };

  const openConvertQuery = (query: any) => {
    setConvertingQuery(query);
    setAdmissionClassId(query.classInterested?.id || "");
    setShowAdmissionForm(true);
  };
  const openAddStaff = (role: "CAMPUS_ADMIN" | "PRINCIPAL" | "ACCOUNTANT" | "LIBRARIAN" | "RECEPTIONIST") => {
    if (role === "CAMPUS_ADMIN") setShowAddAdminForm(true);
    else if (role === "PRINCIPAL") setShowAddPrincipalForm(true);
    else if (role === "ACCOUNTANT") setShowAddAccountantForm(true);
    else if (role === "LIBRARIAN") setShowAddLibrarianForm(true);
    else if (role === "RECEPTIONIST") setShowAddReceptionistForm(true);
  };

  const navItems: SidebarEntry[] = [
    { icon: LayoutGrid, label: "Overview", active: activeView === "overview", onClick: () => setActiveView("overview") },
    {
      icon: GraduationCap, label: "Students", children: [
        { icon: GraduationCap, label: "Student List", active: activeView === "students", onClick: () => setActiveView("students") },
        { icon: PhoneCall, label: "Admission Enquiries", active: activeView === "admission-queries", onClick: () => setActiveView("admission-queries") },
        { icon: Tags, label: "Student Categories", active: activeView === "student-setup", onClick: () => setActiveView("student-setup") },
        { icon: ArrowRightLeft, label: "Promote Students", active: activeView === "promote-archive", onClick: () => setActiveView("promote-archive") },
      ],
    },
    {
      icon: BookOpen, label: "Academics", children: [
        { icon: LayoutDashboard, label: "Academic Overview", active: activeView === "academic-hub", onClick: () => setActiveView("academic-hub") },
        { icon: CalendarRange, label: "Set Up New Year", active: activeView === "year-setup", onClick: () => setActiveView("year-setup") },
        { icon: School, label: "Classes & Subjects", active: activeView === "classes", onClick: () => setActiveView("classes") },
        { icon: History, label: "Academic Years", active: activeView === "year-cycle", onClick: () => setActiveView("year-cycle") },
        { icon: CalendarDays, label: "Holidays & Calendar", active: activeView === "school-calendar", onClick: () => setActiveView("school-calendar") },
        { icon: Calendar, label: "Class Timetable", active: activeView === "timetable", onClick: () => setActiveView("timetable") },
        { icon: Clock, label: "Daily Periods", active: activeView === "period-setup", onClick: () => setActiveView("period-setup") },
        { icon: DoorOpen, label: "Rooms", active: activeView === "class-rooms", onClick: () => setActiveView("class-rooms") },
        { icon: FileText, label: "Exams & Results", active: activeView === "exam-cycles", onClick: () => setActiveView("exam-cycles") },
        { icon: ClipboardList, label: "Report Cards", active: activeView === "report-cards", onClick: () => setActiveView("report-cards") },
      ],
    },
    {
      icon: UserCog, label: "Staff", children: [
        { icon: Users, label: "Teachers", active: activeView === "teachers", onClick: () => setActiveView("teachers") },
        { icon: Plane, label: "Staff Leave", active: activeView === "leave", onClick: () => setActiveView("leave") },
        { icon: Award, label: "Teacher Performance", active: activeView === "teacher-performance", onClick: () => setActiveView("teacher-performance") },
        { icon: Shield, label: "Staff Permissions", active: activeView === "permissions", onClick: () => setActiveView("permissions") },
      ],
    },
    { icon: CalendarCheck, label: "Attendance", active: activeView === "attendance", onClick: () => setActiveView("attendance") },
    { icon: Receipt, label: "Fees", active: activeView === "fees", onClick: () => setActiveView("fees") },
    {
      icon: Wrench, label: "Operations", children: [
        { icon: Bus, label: "Transport", active: activeView === "transport", onClick: () => setActiveView("transport") },
        { icon: Building2, label: "Hostel", active: activeView === "dormitory", onClick: () => setActiveView("dormitory") },
        { icon: Package, label: "Inventory", active: activeView === "inventory", onClick: () => setActiveView("inventory") },
        { icon: BookOpen, label: "Library", active: activeView === "library", onClick: () => setActiveView("library") },
      ],
    },
    { icon: MessageSquare, label: "Engagement", active: activeView === "engagement", onClick: () => setActiveView("engagement") },
    { icon: Sparkles, label: "AI Assistant", active: activeView === "ai", onClick: () => setActiveView("ai") },
    { icon: MessageCircle, label: "Messages", href: "/messages" },
    { icon: School, label: "Admins & Access", active: activeView === "leadership", onClick: () => setActiveView("leadership") },
  ];
  const bottomItems: RoleNavItem[] = [];
  const communicationTotals = useMemo(() => { const s = data?.communicationSummary || {}; return { sent: s.SENT || 0, failed: s.FAILED || 0, blocked: s.BLOCKED || 0, noContact: s.NO_RECIPIENT || 0 }; }, [data]);

  if (loading && !data) return <PrincipalSkeleton />;
  if (!data) return <PrincipalSkeleton />;

  const totalCollected = data.invoiceSummary?.byStatus?.reduce((sum: number, g: any) => { const paid = g.status === "PAID" || g.status === "PARTIAL"; return paid ? sum + (g._sum?.totalAmount || 0) : sum; }, 0) || 0;

  return (
    <RoleShell navItems={navItems} bottomItems={bottomItems} eyebrow={`${data.schoolName} - ${data.campusName}`} userName={data.principalName} userRole="Principal Authority" avatarSeed={data.principalName} dashboardHref="/principal" logoUrl={data.logoUrl}>
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 p-8 overflow-y-auto custom-scrollbar">
        {/* Academics is ten screens deep. This keeps them one click from each
            other instead of one sidebar expansion away. */}
        {ACADEMIC_VIEWS.has(activeView) ? (
          <AcademicSubnav
            active={activeView}
            onNavigate={(v) => setActiveView(v as PrincipalView)}
          />
        ) : null}
        {activeView === "overview" ? (
          <div className="sk-rise flex flex-wrap justify-end gap-2 mb-8">
            <BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={() => setShowClassWizard(true)}>Add Class</BrandButton>
            <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openAdmissionForm()} disabled={data.classes.length === 0}>Add Student</BrandButton>
          </div>
        ) : null}
        {activeView === "overview" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
            <StatCard icon={GraduationCap} label="Students" value={data.totalStudents} tone="green" onClick={() => setActiveView("students")} entranceDelay={80} />
            <StatCard icon={Users} label="Teachers" value={data.totalTeachers} tone="purple" onClick={() => setActiveView("teachers")} entranceDelay={160} />
            <StatCard icon={School} label="Classes" value={data.totalClasses} tone="rose" onClick={() => setActiveView("classes")} entranceDelay={240} />
            <StatCard icon={FileText} label="Pending Reviews" value={data.pendingRemarkReviews} tone="dark" onClick={() => setActiveView("report-cards")} entranceDelay={320} />
            <StatCard icon={Sparkles} label="AI Queue" value={data.pendingAIReviews || 0} tone="green" onClick={() => setActiveView("ai")} entranceDelay={400} />
          </div>
        ) : null}
        {activeView === "overview" ? <OverviewPanel data={data} communicationTotals={communicationTotals} onViewReports={() => setActiveView("report-cards")} onViewEngagement={() => setActiveView("engagement")} onComplete={() => { refetch(); }} /> : null}
        {activeView === "leadership" ? (
          <LeadershipPanel
            data={data}
            onInviteAdmin={() => openAddStaff("CAMPUS_ADMIN")}
            onInvitePrincipal={() => openAddStaff("PRINCIPAL")}
            onInviteAccountant={() => openAddStaff("ACCOUNTANT")}
            onInviteLibrarian={() => openAddStaff("LIBRARIAN")}
            onInviteReceptionist={() => openAddStaff("RECEPTIONIST")}
            onRemove={handleRemove}
            onResend={handleResendInvite}
            onCancel={handleCancelInvite}
            onActivityLog={() => setShowActivityLogModal(true)}
          />
        ) : null}
        {activeView === "classes" ? (
          <>
          <TeacherConflictsBanner />
          <AcademicPanel
            classes={data.classes}
            teachers={data.teachers}
            students={data.students}
            campusName={data.campusName}
            onAddClass={() => setShowClassWizard(true)}
            onAddStudent={openAdmissionForm}
            onBulkImport={(classId) => {
              setBulkImportClassId(classId || "");
              setShowBulkImportModal(true);
            }}
            onViewClass={setSelectedClass}
            onChangeTeacher={handleChangeClassTeacher}
            onDeleteClass={handleDeleteClass}
            onUpdateClass={handleUpdateClass}
            onAddSection={handleAddSection}
            onDeleteSubject={handleDeleteSubject}
            onUpdateSubject={handleUpdateSubject}
          />
        </>
        ) : null}
        {activeView === "teachers" ? (
          <FacultyPanel
            teachers={data.teachers}
            pendingInvites={data.pendingTeacherInvitations}
            campusAdmins={data.campusAdmins}
            pendingAdminInvites={data.pendingAdminInvitations}
            onInvite={(role) => { if (role === "TEACHER") { setShowAddTeacherForm(true); } else { openAddStaff(role as "CAMPUS_ADMIN" | "PRINCIPAL"); } }}
            onRemove={(id, label) => handleRemove(id, label)}
            onViewTeacher={(teacher, visible) => {
              setSelectedTeacher(teacher);
              setTeacherSequence(visible || []);
            }}
            onResend={handleResendInvite}
            onCancel={handleCancelInvite}
          />
        ) : null}
        {activeView === "admission-queries" ? (
          <AdmissionQueriesPanel
            classes={data.classes}
            version={admissionQueriesVersion}
            onVersionBump={() => setAdmissionQueriesVersion((v) => v + 1)}
            onConvert={openConvertQuery}
          />
        ) : null}
        {activeView === "students" ? (
          <StudentsPanel
            students={data.students}
            classes={data.classes}
            onAddStudent={openAdmissionForm}
            onViewStudent={(student, visible) => {
              setSelectedStudent(student);
              setStudentSequence(visible || []);
            }}
            onBulkImport={() => setShowBulkImportModal(true)}
            onExport={exportStudentsCSV}
            incomingFilter={rosterFilter}
            onIncomingFilterApplied={() => setRosterFilter(null)}
            onRefresh={refetch}
          />
        ) : null}
        {activeView === "student-setup" ? <StudentSetupPanel
              studentCount={data.students?.length}
              onViewStudents={(filter) => {
                setRosterFilter(filter);
                setActiveView("students");
              }}
            /> : null}
        {activeView === "promote-archive" ? (
          <div className="space-y-6">
            <ArchivedStudentsPanel version={studentsVersion} onVersionBump={() => setStudentsVersion((v) => v + 1)} />
            <div className="rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#55208b] text-white shadow-[0_6px_16px_-4px_rgba(129,39,207,0.5)]">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-[#1f1a23]">Year-End Promotion</h3>
                    <p className="text-xs font-bold text-ink-muted">Batch promote students with final grades, pass/fail outcomes and fee carry-forward</p>
                  </div>
                </div>
                <BrandButton variant="dark" icon={<ArrowRightLeft className="w-4 h-4" />} onClick={() => setActiveView("year-cycle")}>
                  Open Promotion Wizard
                </BrandButton>
              </div>
            </div>
          </div>
        ) : null}
        {activeView === "attendance" ? <UnifiedAttendancePanel /> : null}
        {activeView === "leave" ? <LeaveManagementPanel campusId={data.campusId} /> : null}

        {activeView === "permissions" ? <RolePermissionsPanel /> : null}
        {activeView === "year-cycle" ? (
          <div className="space-y-8">
            <CycleManagementPanel
              campusId={data.campusId}
              canForceClose
              onNavigate={(v) => setActiveView(v as PrincipalView)}
            />
            <div className="border-t border-[#cfc2d6]/15 pt-6">
              <h3 className="text-sm font-bold text-[#1d1b20] mb-4">Year History & Student Promotion</h3>
              <AcademicYearPanel />
            </div>
          </div>
        ) : null}
        {activeView === "academic-hub" ? (
          <AcademicHub
            campusId={data.campusId}
            onNavigate={(v) => setActiveView(v as PrincipalView)}
          />
        ) : null}

        {activeView === "year-setup" ? (
          <YearSetupWizard
            campusId={data.campusId}
            onComplete={() => setActiveView("academic-hub")}
          />
        ) : null}

        {activeView === "exam-cycles" ? <ExamCycleManager campusId={data.campusId} /> : null}
        {activeView === "fees" ? <FeeOverviewTab /> : null}
        {activeView === "timetable" ? <TimetableStudio campusId={data.campusId} /> : null}

        {activeView === "class-rooms" ? <RoomsPanel /> : null}

        {activeView === "period-setup" ? <PeriodsPanel /> : null}

        {activeView === "school-calendar" ? <AcademicCalendar campusId={data.campusId} role="PRINCIPAL" /> : null}
        {activeView === "teacher-performance" ? <TeacherPerformancePanel /> : null}
        {activeView === "report-cards" ? (
          <div className="space-y-8">
            <ReportsPanel data={data} busyAction={busyAction} editingReportId={editingReportId} editedRemarks={editedRemarks} onRunAction={runReportAction} onGenerateRemarks={runRemarkDrafts} onEdit={(report) => { setEditingReportId(report.id); setEditedRemarks({ en: report.remarksEn || "", ur: report.remarksUr || "" }); }} onCancelEdit={() => setEditingReportId(null)} onRemarkChange={setEditedRemarks} onSaveRemark={saveRemark} />
            <ReportCardsPanel reports={data.recentReportCards} />
          </div>
        ) : null}
        {activeView === "ai" ? <AIPanel features={principalAIFeatures} insights={data.aiInsights} reviewItems={data.pendingAIReviewItems} onComplete={() => { refetch(); }} title="Principal AI" /> : null}
        {activeView === "engagement" ? <EngagementPanel data={data} totals={communicationTotals} busy={busyAction === "communications"} onRunAutomation={runAutomation} /> : null}

        {activeView === "transport" ? <TransportPanel /> : null}
        {activeView === "dormitory" ? <DormitoryPanel /> : null}
        {activeView === "library" ? <LibraryPanel /> : null}
        {activeView === "inventory" ? <InventoryPanel /> : null}
      </section>

      {showClassWizard ? (
        <CreateClassWizard
          teachers={data.teachers || []}
          classes={data.classes || []}
          onClose={() => setShowClassWizard(false)}
          onCreated={async () => {
            setShowClassWizard(false);
            await refetch();
          }}
        />
      ) : null}
      {showAdmissionForm && (
        <AdmissionForm
          classes={data.classes || []}
          classGroups={groupClasses(data.classes || [])}
          initialClassId={admissionClassId || undefined}
          initialPrefill={convertingQuery ? {
            fullName: convertingQuery.name,
            guardianPhone: convertingQuery.phone,
            guardianEmail: convertingQuery.email || "",
          } : undefined}
          onSuccess={handleAdmissionSuccess}
          onClose={() => setShowAdmissionForm(false)}
        />
      )}
      {selectedStudent && showMoveStudentModal ? <MoveStudentModal student={selectedStudent} classes={data.classes} classId={moveClassId} busy={movingStudentBusy} onClassChange={setMoveClassId} onSave={handleMoveStudent} onClose={() => { setShowMoveStudentModal(false); setSelectedStudent(null); }} /> : null}
      {selectedClass ? (
        <ClassDetailModal
          cls={selectedClass}
          students={data.students.filter((student: any) => student.class?.id === selectedClass.id)}
          teachers={data.teachers}
          classes={data.classes}
          teacherBusy={savingClassTeacherId === selectedClass.id}
          subjectBusyId={savingSubjectId}
          creatingSubject={creatingSubjectClassId === selectedClass.id}
          teachingModeBusy={applyingSubjectClassId === selectedClass.id}
          classUpdateBusy={savingClassUpdate}
          subjectUpdateBusyId={savingSubjectUpdateId}
          onClose={() => setSelectedClass(null)}
          onChangeTeacher={handleChangeClassTeacher}
          onChangeTeachingMode={handleChangeTeachingMode}
          onCreateSubject={handleCreateSubject}
          onChangeSubjectTeacher={handleChangeSubjectTeacher}
          onAddStudent={() => { setSelectedClass(null); openAdmissionForm(selectedClass.id); }}
          onViewStudent={(student) => { setSelectedClass(null); setSelectedStudent(student); }}
          onDeleteClass={handleDeleteClass}
          onUpdateClass={handleUpdateClass}
          onDeleteSubject={handleDeleteSubject}
          onUpdateSubject={handleUpdateSubject}
        />
      ) : null}
      {selectedStudent && !showMoveStudentModal ? (
        <StudentDetailModal
          student={selectedStudent}
          busy={savingStudentUpdate}
          sequence={studentSequence.map((s: any) => ({ id: s.id, label: s.fullName }))}
          onNavigate={(id) => {
            const next = studentSequence.find((s: any) => s.id === id);
            if (next) setSelectedStudent(next);
          }}
          onUpdate={handleUpdateStudent}
          onDelete={handleDeleteStudent}
          onMove={() => { setMoveClassId(""); setShowMoveStudentModal(true); }}
          onClose={() => { setSelectedStudent(null); }}
        />
      ) : null}
      {selectedTeacher ? (
        <TeacherDetailModal
          teacher={selectedTeacher}
          sequence={teacherSequence.map((t: any) => ({ id: t.id, label: t.fullName }))}
          onNavigate={(id) => {
            const next = teacherSequence.find((t: any) => t.id === id);
            if (next) setSelectedTeacher(next);
          }}
          onUpdate={handleUpdateTeacher}
          onClose={() => setSelectedTeacher(null)}
        />
      ) : null}
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
      {showAddAccountantForm && (
        <AddStaffForm role="ACCOUNTANT" onSuccess={handleStaffAdded} onClose={() => setShowAddAccountantForm(false)} />
      )}
      {showAddLibrarianForm && (
        <AddStaffForm role="LIBRARIAN" onSuccess={handleStaffAdded} onClose={() => setShowAddLibrarianForm(false)} />
      )}
      {showAddReceptionistForm && (
        <AddStaffForm role="RECEPTIONIST" onSuccess={handleStaffAdded} onClose={() => setShowAddReceptionistForm(false)} />
      )}
      <BulkImportDialog
        open={showBulkImportModal}
        onOpenChange={setShowBulkImportModal}
        classes={data.classes || []}
        defaultClassId={bulkImportClassId || data.classes?.[0]?.id || ""}
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
          {data.recentReportCards.length > 0 ? (<div className="space-y-3">{data.recentReportCards.slice(0, 6).map((card: any, index: number) => (<div key={card.id} className="sk-rise flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-[#fbf0fe]/55 via-white to-[#fbf0fe]/20 border border-[#cfc2d6]/25 px-4 py-3" style={{ animationDelay: `${index * 60}ms` }}><div className="min-w-0"><p className="text-xs font-black text-[#1f1a23] truncate">{card.student?.fullName || "Student"}</p><p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle">{card.exam?.title} · {card.grade || `${Math.round(card.percentage || 0)}%`}</p></div><StatusPill status={card.status} /></div>))}</div>) : (<EmptyState icon={FileText} title="No report cards yet" description="Locked exams and generated marks will appear here for academic review." />)}
        </CollapsiblePanel>
      </div>
      <div className="space-y-6">
        <div className="sk-rise bg-gradient-to-br from-white via-[#fbf0fe]/20 to-white p-6 rounded-[28px] border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center justify-between mb-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm"><MessageSquare className="w-5 h-5" /></div><p className="text-[10px] font-black text-ink-subtle uppercase tracking-wider">Parent Engagement</p></div><button type="button" onClick={onViewEngagement} className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] hover:text-[#9c48ea]">View</button></div>
          <div className="space-y-3"><EngagementMetric icon={CheckCircle2} label="Sent" value={communicationTotals.sent} /><EngagementMetric icon={AlertCircle} label="Needs Attention" value={communicationTotals.failed + communicationTotals.blocked + communicationTotals.noContact} /><EngagementMetric icon={Sparkles} label="AI Review" value={data.pendingAIReviews || 0} /></div>
        </div>
        <div className="sk-rise bg-gradient-to-br from-white via-[#fbf0fe]/20 to-white p-6 rounded-[28px] border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] relative overflow-hidden transition-all duration-300 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25" style={{ animationDelay: "240ms" }}><CornerSparkles /><AiActionPanel title="Principal AI" options={principalAIFeatures} compact onComplete={onComplete} /></div>
        <div className="sk-rise bg-gradient-to-br from-[#fbf0fe]/40 via-[#fbf0fe]/20 to-white p-6 rounded-[28px] border border-[#8127cf]/10 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25" style={{ animationDelay: "320ms" }}><div className="flex items-center gap-3 mb-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 text-[#8127cf] shadow-sm"><Sparkles className="w-5 h-5" /></div><p className="text-[10px] font-black text-ink-subtle uppercase tracking-wider">AI Review</p></div><AIReviewQueue items={data.pendingAIReviewItems} onComplete={onComplete} /></div>
        <div className="sk-rise bg-gradient-to-br from-[#1f1a23] to-[#2d2533] p-8 rounded-[32px] text-white shadow-[0_14px_36px_-10px_rgba(31,26,35,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset] relative overflow-hidden" style={{ animationDelay: "400ms" }}><div className="absolute -top-16 -right-16 w-32 h-32 bg-gradient-to-bl from-[#8127cf]/15 to-transparent rounded-full blur-[60px] pointer-events-none" /><div className="absolute -bottom-8 -left-8 w-24 h-24 bg-gradient-to-tr from-[#b876f0]/10 to-transparent rounded-full blur-[40px] pointer-events-none" /><div className="relative"><p className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-5">Campus Yield</p><div className="flex items-end gap-3 mb-4"><span className="text-5xl font-black tracking-wider">{data.averageMarks}%</span><TrendingUp className="w-8 h-8 text-emerald-400 mb-1" /></div><p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Average marks across submitted assessments</p></div></div>
      </div>
    </div>
  );
}

function FacultyPanel({ teachers, pendingInvites, campusAdmins, pendingAdminInvites, onInvite, onRemove, onViewTeacher, onResend, onCancel }: {
  teachers: any[]; pendingInvites: any[]; campusAdmins: any[]; pendingAdminInvites: any[];
  onInvite: (role: string) => void; onRemove: (id: string, label: string) => void;
  /** Receives the teacher and the list currently on screen, so the profile
   *  dialog can step through it. */
  onViewTeacher: (teacher: any, visible?: any[]) => void;
  onResend: (id: string) => void; onCancel: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const filtered = teachers.filter((t) => { if (!searchQuery.trim()) return true; const q = searchQuery.toLowerCase(); return t.fullName?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q); });
  if (teachers.length === 0 && pendingInvites.length === 0 && campusAdmins.length === 0 && pendingAdminInvites.length === 0) return (<EmptyState icon={Users} title="No faculty records found" description="Invite teachers so subjects and classes can be assigned from the central model." action={<BrandButton onClick={() => onInvite("TEACHER")}>Add Teacher</BrandButton>} />);
  return (
    <div className="space-y-8">
      <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-gradient-to-br from-[#fbf0fe]/30 via-white to-[#fbf0fe]/20 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center justify-between gap-4 mb-5"><PanelTitle icon={ShieldCheck} title="Campus Admins" /><div className="flex gap-2"></div></div>
        {campusAdmins.length > 0 ? (<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{campusAdmins.map((admin: any) => (<AdminRow key={admin.id} admin={admin} onRemove={admin.id ? () => onRemove(admin.id, "Admin") : undefined} />))}</div>) : null}
        {pendingAdminInvites.length > 0 ? (<div className="mt-4 space-y-2"><p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle px-2">Pending Invitations</p>{pendingAdminInvites.map((invite: any) => (<PendingFacultyRow key={invite.inviteId || invite.id} invite={invite} onResend={() => onResend(invite.inviteId || invite.id)} onCancel={() => onCancel(invite.inviteId || invite.id)} />))}</div>) : null}
        {campusAdmins.length === 0 && pendingAdminInvites.length === 0 ? (<p className="rounded-2xl bg-white/70 px-4 py-3 text-[10px] font-bold text-ink-subtle">No admins yet. Invite campus administrators to manage this campus.</p>) : null}
      </div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <PanelTitle icon={Users} title="Teacher Profiles" />
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 h-12 shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-ink-subtle"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg><input type="text" placeholder="Search teachers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="ml-2 h-full w-40 bg-transparent border-none outline-none text-sm font-bold placeholder:text-ink-subtle" /></div>
            <BrandButton variant="soft" onClick={() => onInvite("TEACHER")}>Add Teacher</BrandButton>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((teacher: any) => (<FacultyRow key={teacher.id} teacher={teacher} onView={() => onViewTeacher(teacher, filtered)} onRemove={() => onRemove(teacher.id, "Teacher")} />))}
          {filtered.length === 0 ? (<div className="md:col-span-2 xl:col-span-3"><EmptyState icon={Users} title={searchQuery ? "No matching teachers" : "No active teachers"} description={searchQuery ? "Try a different search term." : "Assigned teachers will appear here for principal oversight."} /></div>) : null}
        </div>
        {pendingInvites.length > 0 ? (<div className="mt-6 space-y-2"><p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle px-2">Pending Teacher Invitations ({pendingInvites.length})</p><div className="space-y-2">{pendingInvites.map((invite: any) => (<PendingFacultyRow key={invite.inviteId || invite.id} invite={invite} onResend={() => onResend(invite.inviteId || invite.id)} onCancel={() => onCancel(invite.inviteId || invite.id)} />))}</div></div>) : null}
      </div>
    </div>
  );
}

function ReportsPanel({ data, busyAction, editingReportId, editedRemarks, onRunAction, onGenerateRemarks, onEdit, onCancelEdit, onRemarkChange, onSaveRemark }: {
  data: any; busyAction: string | null; editingReportId: string | null; editedRemarks: { en: string; ur: string };
  onRunAction: (examId: string, action: ReportAction, successMessage: string) => void; onGenerateRemarks: (examId: string) => void; onEdit: (report: any) => void; onCancelEdit: () => void; onRemarkChange: (value: { en: string; ur: string }) => void; onSaveRemark: (report: any, approve?: boolean) => void;
}) {
  return (<div className="grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-8"><div className="space-y-4"><PanelTitle icon={ShieldCheck} title="Exam Review Actions" />{data.reviewExams.map((exam: any, i: number) => (<div key={exam.id} className="sk-rise rounded-[28px] border border-[#cfc2d6]/25 bg-[#fbf0fe]/35 p-5" style={{ animationDelay: `${i * 60}ms` }}><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-black text-[#1f1a23]">{exam.title}</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{exam.term} - {classLabel(exam.class)}</p></div><StatusPill status={exam.status} /></div><div className="mt-4 grid grid-cols-2 gap-2"><ActionButton label="Generate" icon={FileText} busy={busyAction === `generate-${exam.id}`} onClick={() => onRunAction(exam.id, "generate", "Report cards generated")} /><ActionButton label="PDFs" icon={FileText} busy={busyAction === `pdf-${exam.id}`} onClick={() => onRunAction(exam.id, "pdf", "PDFs generated")} /><ActionButton label="AI Remarks" icon={Sparkles} busy={busyAction === `ai-remarks-${exam.id}`} onClick={() => onGenerateRemarks(exam.id)} /><ActionButton label="Review" icon={ShieldCheck} busy={busyAction === `review-${exam.id}`} onClick={() => onRunAction(exam.id, "review", "Exam marked as principal reviewed")} /><ActionButton label="Publish" icon={Upload} busy={busyAction === `publish-${exam.id}`} onClick={() => onRunAction(exam.id, "publish", "Reports published")} /><div className="col-span-2"><ActionButton label="Send To Parents" icon={Send} busy={busyAction === `send-${exam.id}`} onClick={() => onRunAction(exam.id, "send", "Delivery attempted")} /></div></div></div>))}{data.reviewExams.length === 0 ? (<p className="rounded-[24px] bg-[#fbf0fe]/50 p-5 text-sm font-semibold text-ink-muted">No locked exams are ready for principal review.</p>) : null}</div><div className="space-y-4"><PanelTitle icon={FileText} title="Report Card Remarks" />{data.recentReportCards.map((report: any) => (<ReportReviewCard key={report.id} report={report} busy={busyAction === `remark-${report.id}`} editing={editingReportId === report.id} editedRemarks={editedRemarks} onEdit={() => onEdit(report)} onCancel={onCancelEdit} onChange={onRemarkChange} onSave={() => onSaveRemark(report)} onApprove={() => onSaveRemark(report, true)} />))}{data.recentReportCards.length === 0 ? (<EmptyState icon={FileText} title="No report cards" description="Generated report cards will appear here for remark approval." />) : null}</div></div>);
}

function EngagementPanel({ data, totals, busy, onRunAutomation }: { data: any; totals: { sent: number; failed: number; blocked: number; noContact: number }; busy: boolean; onRunAutomation: () => void; }) {
  return (<div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><EngagementStat icon={CheckCircle2} label="Sent" value={totals.sent} tone="green" /><EngagementStat icon={AlertCircle} label="Failed" value={totals.failed} tone="rose" /><EngagementStat icon={ShieldCheck} label="Blocked" value={totals.blocked} tone="purple" /><EngagementStat icon={MessageSquare} label="No Contact" value={totals.noContact} tone="amber" /></div><div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-[#fbf0fe]/30 p-6" style={{ animationDelay: "160ms" }}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6"><PanelTitle icon={MessageSquare} title="Recent Parent Communication" /><BrandButton variant="soft" onClick={onRunAutomation} disabled={busy} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}>Run Automation</BrandButton></div><div className="space-y-3">{data.recentCommunications.map((item: any, i: number) => (<div key={item.id} className="sk-rise rounded-[24px] border border-[#cfc2d6]/25 bg-white p-5" style={{ animationDelay: `${i * 60}ms` }}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-sm font-black text-[#1f1a23]">{formatStatus(item.templateKey)}</p><p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{item.student?.fullName || item.recipientName || "Parent"} - {item.channel}</p><p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-ink-muted">{item.body}</p></div><div className="flex shrink-0 flex-col items-start gap-2 sm:items-end"><StatusPill status={item.status} /><span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{formatDate(item.sentAt || item.createdAt)}</span></div></div></div>))}{data.recentCommunications.length === 0 ? (<p className="rounded-[24px] bg-white p-6 text-sm font-semibold text-ink-muted">No parent communication has been generated yet.</p>) : null}</div></div></div>);
}


function ActionButton({ label, icon: Icon, busy, onClick }: { label: string; icon: LucideIcon; busy: boolean; onClick: () => void }) {
  return (<button type="button" onClick={onClick} disabled={busy} className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe] text-[9px] font-black uppercase tracking-wider text-[#8127cf] shadow-sm transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-md hover:shadow-[#8127cf]/20 disabled:opacity-40 disabled:cursor-not-allowed">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{label}</button>);
}

function ReportReviewCard({ report, busy, editing, editedRemarks, onEdit, onCancel, onChange, onSave, onApprove }: {
  report: any; busy: boolean; editing: boolean; editedRemarks: { en: string; ur: string }; onEdit: () => void; onCancel: () => void; onChange: (v: { en: string; ur: string }) => void; onSave: () => void; onApprove: () => void;
}) {
  return (<div className="sk-rise rounded-[24px] border border-[#cfc2d6]/25 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-[#8127cf]/25"><div className="flex items-start justify-between gap-3 mb-3"><div className="min-w-0"><p className="text-xs font-black text-[#1f1a23]">{report.student?.fullName || "Student"}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-ink-subtle">{report.exam?.title || "Exam"} · {report.grade || `${Math.round(report.percentage || 0)}%`}</p></div><StatusPill status={report.status} /></div>{editing ? (<div className="space-y-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle mb-1">English Remarks</p><textarea value={editedRemarks.en} onChange={(e) => onChange({ ...editedRemarks, en: e.target.value })} className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/30 p-3 text-xs font-bold outline-none resize-none h-20 focus:border-[#8127cf]/35 focus:bg-white transition-all" /></div><div><p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle mb-1">Urdu Remarks</p><textarea value={editedRemarks.ur} onChange={(e) => onChange({ ...editedRemarks, ur: e.target.value })} className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/30 p-3 text-xs font-bold outline-none resize-none h-20 focus:border-[#8127cf]/35 focus:bg-white transition-all" /></div><div className="flex gap-2"><BrandButton variant="soft" onClick={onSave} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</BrandButton><BrandButton variant="dark" onClick={onApprove} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save & Approve"}</BrandButton><button type="button" onClick={onCancel} className="h-10 rounded-xl bg-[#f3f4f9] px-4 text-[9px] font-black uppercase tracking-wider text-ink-muted cursor-pointer transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]">Cancel</button></div></div>) : (<div className="flex gap-2"><button type="button" onClick={onEdit} className="h-9 cursor-pointer rounded-lg bg-[#fbf0fe] px-3 text-[9px] font-black uppercase tracking-wider text-[#8127cf] border border-[#8127cf]/10 shadow-sm transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-md">Edit Remarks</button></div>)}</div>);
}

function EngagementStat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  const toneStyles: Record<string, string> = { green: "bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-700", rose: "bg-gradient-to-br from-rose-50 to-rose-100/50 text-rose-700", purple: "bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf]", amber: "bg-gradient-to-br from-amber-50 to-amber-100/50 text-amber-700" };
  return (<div className="sk-rise rounded-3xl bg-white border border-[#cfc2d6]/25 p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"><div className="flex items-center gap-3 mb-3"><div className={`rounded-xl p-2 ${toneStyles[tone] || "bg-gradient-to-br from-[#f3f4f9] to-[#f3f4f9]/50 text-ink-muted"} shadow-sm`}><Icon className="w-4 h-4" /></div><p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">{label}</p></div><p className="text-3xl font-black tracking-wider text-[#1f1a23]">{value}</p></div>);
}

function EngagementMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (<div className="flex items-center justify-between p-1 transition-all hover:bg-[#fbf0fe]/40 rounded-xl -mx-1"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm"><Icon className="h-4 w-4" /></div><p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">{label}</p></div><p className="text-sm font-black text-[#1f1a23]">{value}</p></div>);
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
