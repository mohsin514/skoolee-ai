"use client";

import { ScenarioPlanner } from "@/components/planning/scenario-planner";
import { QuestionNetwork } from "@/components/question-network/question-network";
import { PathwayPanel } from "@/components/pathways/pathway-panel";
import { BoardingOperations, CampusPackagesPanel, CanteenPanel, usePackageStates } from "@/components/campus-packages/campus-packages";
import { ActionQueue } from "@/components/principal/action-queue";
import { PurchasingPanel } from "@/components/purchasing/purchasing-panel";
import { LearningActions } from "@/components/learning/learning-actions";
import { PolicyManager } from "@/components/policies/policy-manager";
import { useWorkspaceView } from "@/components/nav/useWorkspaceView";
import { AdmissionsDesk } from "@/components/admissions/admissions-desk";
import { Button } from "@/components/ui/button";
import { ReportCardPipeline } from "@/components/academic/ReportCardPipeline";

import { pageCardSurface } from "@/components/ui/page-card";

import { moduleForView } from "@/lib/navigation/modules";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
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
  Mail,
  Plane,
  Shield,
  GraduationCap,
  Heart,
  History,
  LayoutGrid,
  LayoutDashboard,
  CalendarRange,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  Receipt,
  Scale,
  School,
  Search,
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
  Network,
  UtensilsCrossed,
} from "lucide-react";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { InputGroup } from "@/components/ui/input-group";
import { InfoTip, Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { SignOutLink } from "@/app/403/sign-out-link";
import { cancelInvitation, removeStaff, resendInvitation } from "@/app/actions/invite";
import {
  AiActionPanel,
  AIReviewQueue,
  BrandButton,
  EmptyState,
  RoleShell,
  type RoleNavItem,
} from "@/components/role-dashboard";
import type { SidebarEntry } from "@/components/role-dashboard/RoleSidebar";
import { AcademicOverview } from "@/components/insights";
import { CommandCentreSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { CornerSparkles } from "@/components/CornerSparkles";
import { usePrincipalData } from "./principal-data-context";
import { AdmissionForm } from "@/app/dashboard/students/admission-form";
import { BulkImportDialog } from "@/app/dashboard/students/bulk-import-dialog";
import { CreateClassWizard } from "@/components/shared-admin/create-class-wizard";
import { AddTeacherForm } from "@/components/teacher/add-teacher-form";
import { AddStaffForm } from "@/components/staff/add-staff-form";
import { StaffHierarchyPanel } from "@/components/staff/hierarchy-panel";
import { UnifiedAttendancePanel } from "@/components/attendance/unified-attendance-panel";
import { FeeOverviewTab } from "@/components/fees/FeeOverviewTab";
import {
  TransportPanel,
  DormitoryPanel,
  ComplaintsPanel,
  PhoneCallsPanel,
  PostalPanel,
  CertificatesPanel,
  LibraryPanel,
  InventoryPanel,
} from "@/components/operations";
import { TimetableStudio } from "@/components/timetable/TimetableStudio";
import { ExamsWorkspace } from "@/components/academic/exams/ExamsWorkspace";
import { GradingRulesPanel } from "@/components/academic/GradingRulesPanel";
import { AcademicModelPanel } from "@/components/academic/AcademicModelPanel";
import { RoomsManager } from "@/components/academic/RoomsManager";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { AcademicHub } from "@/components/academic/AcademicHub";
import { AcademicSubnav, ACADEMIC_VIEWS } from "@/components/academic/AcademicSubnav";
import { StaffSubnav, STAFF_VIEWS } from "@/components/staff/StaffSubnav";
import { StudentSubnav, STUDENT_VIEWS } from "@/components/student/StudentSubnav";
import { YearSetupWizard } from "@/components/academic/YearSetupWizard";
import { AcademicYearPanel } from "@/components/academic-year/AcademicYearPanel";
import { RolloverReview } from "@/components/academic/rollover-review";
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
import { Input as SystemInput } from "@/components/ui/input";
import { ArchivedClassesPanel } from "@/components/shared-admin/archived-classes-panel";
import { classArchiveText, studentArchiveText, fetchAcademicImpact, subjectRemovalText, teacherChangeText } from "@/components/shared-admin/academic-impact";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Textarea as SystemTextarea } from "@/components/ui/textarea";

type PrincipalView =
  | "overview"
  | "leadership"
  | "classes"
  | "teachers"
  | "staff-hierarchy"
  | "students"
  | "admission-queries"
  | "applications"
  | "student-setup"
  | "promote-archive"
  | "leave"

  | "permissions"
  | "attendance"
  | "year-cycle"
  | "academic-hub"
  | "year-setup"
  | "academic-model"
  | "exam-cycles"
  | "grading-rules"
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
  | "canteen"
  | "complaints"
  | "phone-calls"
  | "postal"
  | "certificates"
  | "library"
  | "inventory"
;
const WORKSPACE_VIEWS: readonly PrincipalView[] = ["overview", "leadership", "classes", "teachers", "staff-hierarchy", "students", "admission-queries", "applications", "student-setup", "promote-archive", "leave", "permissions", "attendance", "year-cycle", "academic-hub", "year-setup", "academic-model", "exam-cycles", "grading-rules", "fees", "timetable", "class-rooms", "period-setup", "school-calendar", "teacher-performance", "report-cards", "ai", "engagement", "transport", "dormitory", "canteen", "complaints", "phone-calls", "postal", "certificates", "library", "inventory"];
type ReportAction = "generate" | "pdf" | "review" | "publish" | "send";

const principalAIFeatures = [
  { feature: "at_risk_students", label: "At-risk Students", placeholder: "Optional exam, class, or attendance focus" },
  { feature: "class_performance_summary", label: "Class Summary", placeholder: "Class or exam focus" },
  { feature: "teacher_class_comparison", label: "Class Comparison", placeholder: "Classes, teachers, or term to compare" },
  { feature: "intervention_suggestions", label: "Intervention Plan", placeholder: "Student or class concern" },
  { feature: "pending_review_queue", label: "Review Queue", placeholder: "Optional priority note" },
];

export default function PrincipalDashboard() {
  // `loading` is not read: the provider hands back null until the first
  // payload lands, and null is what the skeleton keys off. `error` is: a
  // failed load also leaves data null, which used to hold the skeleton up
  // forever with no way forward.
  const { data, error, refetch } = usePrincipalData();
  const [activeView, setActiveView] = useWorkspaceView(WORKSPACE_VIEWS, "overview");
  const packageNav = usePackageStates();
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
  const [confirmAction, setConfirmAction] = useState<{ title: string; description: string; confirmLabel: string; tone?: "danger" | "warning" | "primary"; run: () => Promise<void> } | null>(null);
  const ui = useUiText();
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [savingClassUpdate, setSavingClassUpdate] = useState(false);
  const [savingStudentUpdate, setSavingStudentUpdate] = useState(false);
  const [savingSubjectUpdateId, setSavingSubjectUpdateId] = useState<string | null>(null);

  // Sign-out lives in RoleHeader, which this console renders via RoleShell.
  // An unreachable handleLogout() used to sit here (RoleShell takes no onLogout
  // prop, so nothing could call it); its router.push("/login") would also have
  // left this console renderable via Back after sign-out.
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
    setConfirmAction({ title: ui("Remove {0}", [ui(label)]), description: ui("Are you sure you want to remove this {0}? This action cannot be undone.", [ui(label).toLowerCase()]), confirmLabel: ui("Remove"), tone: "danger", run: async () => { setConfirmBusy(true); try { await removeStaff(userId); toast.success(ui("{0} removed", [ui(label)])); await refetch(); } catch (error: any) { toast.error(error); } finally { setConfirmBusy(false); } } });
  };

  const handleResendInvite = async (inviteId: string) => { try { await resendInvitation(inviteId); toast.success("Invitation resent"); await refetch(); } catch (error: any) { toast.error(error.message); } };
  const handleCancelInvite = async (inviteId: string) => { try { await cancelInvitation(inviteId); toast.success("Invitation cancelled"); await refetch(); } catch (error: any) { toast.error(error.message); } };

  const handleChangeClassTeacher = async (classId: string, teacherId: string) => {
    setSavingClassTeacherId(classId);
    try { const res = await fetch("/api/classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: classId, classTeacherId: teacherId || null }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to update class teacher"); toast.success("Class teacher updated"); await refetch(); }
    catch (error: any) { toast.error(error.message); } finally { setSavingClassTeacherId(null); }
  };

  const handleUpdateClass = async (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => {
    setSavingClassUpdate(true);
    try { const res = await fetch("/api/classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...updates, id: classId }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to update class"); toast.success("Class updated"); await refetch(); }
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

  const handleChangeSubjectTeacher = async (classId: string, subjectId: string, teacherId: string, effectiveFrom?: string) => {
    // SKO-462: a scheduled or already-marked subject shows what moves before the teacher changes.
    const impact = await fetchAcademicImpact("subject", subjectId).catch(() => null);
    if (impact && (impact.counts.timetableSlots || impact.counts.marks)) {
      setConfirmAction({ title: ui("Change the teacher of {0}?", [impact.label]), description: teacherChangeText(impact, ui, effectiveFrom), confirmLabel: ui("Change Teacher"), tone: "warning", run: async () => { await saveSubjectTeacher(classId, subjectId, teacherId, effectiveFrom); } });
      return;
    }
    await saveSubjectTeacher(classId, subjectId, teacherId, effectiveFrom);
  };
  const saveSubjectTeacher = async (classId: string, subjectId: string, teacherId: string, effectiveFrom?: string) => {
    setSavingSubjectId(subjectId);
    try { const res = await fetch("/api/subjects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subjectId, teacherId: teacherId || null, ...(effectiveFrom ? { effectiveFrom } : {}) }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Subject teacher could not be updated"); toast.success("Subject teacher updated"); (result.clashes || []).forEach((c: any) => toast.warning(c.message)); await refetch(); }
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

  const handleDeleteClass = async (cls: any) => {
    try {
      const previewResponse = await fetch(`/api/classes?id=${encodeURIComponent(cls.id)}&preview=true`, { method: "DELETE" });
      const preview = await previewResponse.json();
      if (!previewResponse.ok) throw new Error(preview.error || "Could not calculate class impact");
      const label = `${cls.name}${cls.section ? ` · ${cls.section}` : ""}`;
      setConfirmAction({
        title: ui("Archive {0}?", [label]),
        description: classArchiveText(preview.dependencies || {}, ui),
        confirmLabel: Number(preview.dependencies?.students || 0) ? ui("Close") : ui("Archive Class"),
        tone: Number(preview.dependencies?.students || 0) ? "primary" : "warning",
        run: async () => {
          if (Number(preview.dependencies?.students || 0)) return;
          setConfirmBusy(true);
          try {
            const response = await fetch(`/api/classes?id=${encodeURIComponent(cls.id)}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: "Archived by administrator" }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Class could not be archived");
            toast.success(result.message || "Class archived; history preserved");
            setSelectedClass(null);
            await refetch();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Class could not be archived");
          } finally {
            setConfirmBusy(false);
          }
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not calculate class impact");
    }
  };

  const handleDeleteStudent = async (student: any) => {
    // SKO-389: pupils are archived, never deleted; the server's dependency counts are shown before confirming.
    let preview: { dependencies?: Record<string, number> };
    try {
      const previewResponse = await fetch(`/api/students?id=${encodeURIComponent(student.id)}&preview=true`, { method: "DELETE" });
      preview = await previewResponse.json();
      if (!previewResponse.ok) throw new Error((preview as { error?: string }).error || ui("Could not calculate student impact"));
    } catch (error) { toast.error(error instanceof Error ? error.message : ui("Could not calculate student impact")); return; }
    setConfirmAction({
      title: ui("Archive {0}?", [student.fullName]),
      description: studentArchiveText(student.fullName, preview.dependencies || {}, ui),
      confirmLabel: ui("Archive Student"),
      tone: "warning",
      run: async () => {
        setConfirmBusy(true);
        try {
          const res = await fetch(`/api/students?id=${encodeURIComponent(student.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Archived by administrator" }) });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || ui("Student could not be archived"));
          toast.success(ui("Student archived; history preserved"));
                    await refetch();
        } catch (error) { toast.error(error instanceof Error ? error.message : ui("Student could not be archived")); } finally { setConfirmBusy(false); }
      },
    });
  };

  const handleDeleteSubject = async (subject: any) => {
    // SKO-462: the real impact, fetched before anything is confirmed (marks are never silently removed).
    const impact = await fetchAcademicImpact("subject", subject.id).catch((error: Error) => { toast.error(error.message); return null; });
    if (!impact) return;
    const blocked = Boolean(impact.counts.marks || impact.counts.exams || impact.counts.examSchedules);
    setConfirmAction({ title: ui("Delete {0}?", [subject.name]), description: subjectRemovalText(impact, ui), confirmLabel: blocked ? ui("Close") : ui("Delete Subject"), tone: blocked ? "primary" : "danger", run: async () => { if (blocked) return; setConfirmBusy(true); try { const res = await fetch(`/api/subjects?id=${subject.id}`, { method: "DELETE" }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to delete subject"); toast.success(ui("Subject deleted · {0}", [new Date().toLocaleString()])); await refetch(); } catch (error: any) { toast.error(error.message); } finally { setConfirmBusy(false); } } });
  };

  const handleUpdateTeacher = async (teacherId: string, updates: Record<string, any>) => {
    try { const res = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: teacherId, ...updates }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Failed to update teacher"); toast.success("Teacher updated"); await refetch(); }
    catch (error: any) { toast.error(error.message); }
  };

  const runReportAction = async (examId: string, action: ReportAction, successMessage: string) => {
    setBusyAction(`${action}-${examId}`);
    try { const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId, action }) }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Report action failed"); if (result.jobId) { window.location.assign(`/jobs?id=${result.jobId}`); return; } toast.success(successMessage); await refetch(); }
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
    { icon: LayoutGrid, label: "Overview", active: activeView === "overview", module: moduleForView("overview"), onClick: () => setActiveView("overview") },
    {
      icon: GraduationCap, label: "Students", children: [
        { icon: GraduationCap, label: "Student List", active: activeView === "students", module: moduleForView("students"), onClick: () => setActiveView("students") },
        { icon: PhoneCall, label: "Admission Enquiries", active: activeView === "admission-queries", module: moduleForView("admission-queries"), onClick: () => setActiveView("admission-queries") },
        { icon: ClipboardList, label: "Applications", active: activeView === "applications", module: moduleForView("applications"), onClick: () => setActiveView("applications") },
        { icon: Tags, label: "Student Categories", active: activeView === "student-setup", module: moduleForView("student-setup"), onClick: () => setActiveView("student-setup") },
        { icon: ArrowRightLeft, label: "Promote Students", active: activeView === "promote-archive", module: moduleForView("promote-archive"), onClick: () => setActiveView("promote-archive") },
      ],
    },
    {
      icon: BookOpen, label: "Academics", children: [
        { icon: LayoutDashboard, label: "Academic Overview", active: activeView === "academic-hub", module: moduleForView("academic-hub"), onClick: () => setActiveView("academic-hub") },
        { icon: CalendarRange, label: "Set Up New Year", active: activeView === "year-setup", module: moduleForView("year-setup"), onClick: () => setActiveView("year-setup") },
        { icon: BookOpen, label: "Curriculum & Terms", active: activeView === "academic-model", module: moduleForView("academic-model"), onClick: () => setActiveView("academic-model") },
        { icon: School, label: "Classes & Subjects", active: activeView === "classes", module: moduleForView("classes"), onClick: () => setActiveView("classes") },
        { icon: History, label: "Academic Years", active: activeView === "year-cycle", module: moduleForView("year-cycle"), onClick: () => setActiveView("year-cycle") },
        { icon: CalendarDays, label: "Holidays & Calendar", active: activeView === "school-calendar", module: moduleForView("school-calendar"), onClick: () => setActiveView("school-calendar") },
        { icon: Calendar, label: "Class Timetable", active: activeView === "timetable", module: moduleForView("timetable"), onClick: () => setActiveView("timetable") },
        { icon: Clock, label: "Daily Periods", active: activeView === "period-setup", module: moduleForView("period-setup"), onClick: () => setActiveView("period-setup") },
        { icon: DoorOpen, label: "Rooms", active: activeView === "class-rooms", module: moduleForView("class-rooms"), onClick: () => setActiveView("class-rooms") },
        { icon: FileText, label: "Exams & Results", active: activeView === "exam-cycles", module: moduleForView("exam-cycles"), onClick: () => setActiveView("exam-cycles") },
        { icon: Scale, label: "Grading Rules", active: activeView === "grading-rules", module: moduleForView("grading-rules"), onClick: () => setActiveView("grading-rules") },
        { icon: ClipboardList, label: "Report Cards", active: activeView === "report-cards", module: moduleForView("report-cards"), onClick: () => setActiveView("report-cards") },
      ],
    },
    {
      icon: UserCog, label: "Staff", children: [
        { icon: Users, label: "Teachers", active: activeView === "teachers", module: moduleForView("teachers"), onClick: () => setActiveView("teachers") },
        { icon: Network, label: "Staff Hierarchy", active: activeView === "staff-hierarchy", module: moduleForView("staff-hierarchy"), onClick: () => setActiveView("staff-hierarchy") },
        { icon: Plane, label: "Staff Leave", active: activeView === "leave", module: moduleForView("leave"), onClick: () => setActiveView("leave") },
        { icon: Award, label: "Teacher Performance", active: activeView === "teacher-performance", module: moduleForView("teacher-performance"), onClick: () => setActiveView("teacher-performance") },
        { icon: Shield, label: "Staff Permissions", active: activeView === "permissions", module: moduleForView("permissions"), onClick: () => setActiveView("permissions") },
      ],
    },
    { icon: CalendarCheck, label: "Attendance", active: activeView === "attendance", module: moduleForView("attendance"), onClick: () => setActiveView("attendance") },
    { icon: Receipt, label: "Fees", active: activeView === "fees", module: moduleForView("fees"), onClick: () => setActiveView("fees") },
    {
      icon: Wrench, label: "Operations", children: [
        { icon: Bus, label: "Transport", active: activeView === "transport", module: moduleForView("transport"), onClick: () => setActiveView("transport") },
        { icon: Building2, label: "Hostel", active: activeView === "dormitory", module: moduleForView("dormitory"), onClick: () => setActiveView("dormitory") },
        ...(packageNav.canteen ? [{ icon: UtensilsCrossed, label: "Canteen", active: activeView === "canteen", onClick: () => setActiveView("canteen") }] : []),
        { icon: MessageSquare, label: "Complaints", active: activeView === "complaints", module: moduleForView("complaints"), onClick: () => setActiveView("complaints") },
        { icon: PhoneCall, label: "Phone Calls", active: activeView === "phone-calls", module: moduleForView("phone-calls"), onClick: () => setActiveView("phone-calls") },
        { icon: Mail, label: "Postal", active: activeView === "postal", module: moduleForView("postal"), onClick: () => setActiveView("postal") },
        { icon: FileText, label: "Certificates", active: activeView === "certificates", module: moduleForView("certificates"), onClick: () => setActiveView("certificates") },
        { icon: Package, label: "Inventory", active: activeView === "inventory", module: moduleForView("inventory"), onClick: () => setActiveView("inventory") },
        { icon: BookOpen, label: "Library", active: activeView === "library", module: moduleForView("library"), onClick: () => setActiveView("library") },
      ],
    },
    { icon: MessageSquare, label: "Engagement", active: activeView === "engagement", module: moduleForView("engagement"), onClick: () => setActiveView("engagement") },
    { icon: Sparkles, label: "AI Assistant", active: activeView === "ai", module: moduleForView("ai"), onClick: () => setActiveView("ai") },
    { icon: MessageCircle, label: "Messages", href: "/messages" },
    { icon: Users, label: "Guardians and access", href: "/dashboard/guardians" },
    { icon: School, label: "Admins & Access", active: activeView === "leadership", module: moduleForView("leadership"), onClick: () => setActiveView("leadership") },
  ];
  const bottomItems: RoleNavItem[] = [];
  const communicationTotals = useMemo(() => { const s = data?.communicationSummary || {}; return { sent: s.SENT || 0, failed: s.FAILED || 0, blocked: s.BLOCKED || 0, noContact: s.NO_RECIPIENT || 0 }; }, [data]);

  if (!data) {
    if (error) {
      return (
        <main className="sk-app-canvas flex min-h-dvh items-center justify-center p-4 sm:p-6">
          <ErrorState
            variant="page"
            onRetry={refetch}
            action={<div className="w-full sm:w-auto"><SignOutLink label={ui("Sign out")} /></div>}
          />
        </main>
      );
    }
    return (
      <RoleShellSkeleton navRows={8} label="Loading the academic command centre">
        <CommandCentreSkeleton />
      </RoleShellSkeleton>
    );
  }

  const totalCollected = data.invoiceSummary?.byStatus?.reduce((sum: number, g: any) => { const paid = g.status === "PAID" || g.status === "PARTIAL"; return paid ? sum + (g._sum?.totalAmount || 0) : sum; }, 0) || 0;

  return (
    <RoleShell navItems={navItems} bottomItems={bottomItems} eyebrow={`${data.schoolName} - ${data.campusName}`} userName={data.principalName} userRole="Principal Authority" avatarSeed={data.principalName} dashboardHref="/principal" logoUrl={data.logoUrl}>
      <section className={cn(pageCardSurface, "p-0 sm:p-0", "flex-1 p-4 sm:p-5 overflow-y-auto custom-scrollbar")} >
        {/* Academics is ten screens deep. This keeps them one click from each
            other instead of one sidebar expansion away. */}
        {ACADEMIC_VIEWS.has(activeView) ? (
          <AcademicSubnav
            active={activeView}
            onNavigate={(v) => setActiveView(v as PrincipalView)}
          />
        ) : null}
        {STAFF_VIEWS.has(activeView) ? (
          <StaffSubnav
            active={activeView}
            onNavigate={(v) => setActiveView(v as PrincipalView)}
          />
        ) : null}
        {STUDENT_VIEWS.has(activeView) ? (
          <StudentSubnav
            active={activeView}
            onNavigate={(v) => setActiveView(v as PrincipalView)}
          />
        ) : null}
        {activeView === "overview" ? (
          <div className="space-y-6">
            <ActionQueue campusId={data.campusId} />
            <LearningActions />
            <PolicyManager />
            <AcademicOverview
              data={data}
              onNavigate={(view) => setActiveView(view as PrincipalView)}
              onAddClass={() => setShowClassWizard(true)}
              onAddStudent={data.classes.length > 0 ? () => openAdmissionForm() : undefined}
            />
            <OverviewPanel data={data} onViewReports={() => setActiveView("report-cards")} onComplete={() => { refetch(); }} />
          </div>
        ) : null}
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
        {activeView === "leadership" ? <CampusPackagesPanel /> : null}
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
        {activeView === "applications" ? <AdmissionsDesk /> : null}
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
        {activeView === "students" ? <PathwayPanel /> : null}
        {activeView === "student-setup" ? <StudentSetupPanel
              studentCount={data.students?.length}
              onViewStudents={(filter) => {
                setRosterFilter(filter);
                setActiveView("students");
              }}
            /> : null}
        {/*
          Year-end work leads, matching /admin. This view is reached from a nav
          item called "Promote Students", so opening on the archived list put
          the promised action below the fold behind a list that is empty for
          most of the year.
        */}
        {activeView === "promote-archive" ? (
          <div className="space-y-6">
            <RolloverReview campusId={data.campusId} />
            <ArchivedStudentsPanel version={studentsVersion} onVersionBump={() => setStudentsVersion((v) => v + 1)} />
              <ArchivedClassesPanel version={studentsVersion} onRestored={() => setStudentsVersion((v) => v + 1)} />
          </div>
        ) : null}
        {activeView === "attendance" ? <UnifiedAttendancePanel /> : null}
        {activeView === "staff-hierarchy" ? <StaffHierarchyPanel campusId={data.campusId} /> : null}

        {activeView === "leave" ? <LeaveManagementPanel campusId={data.campusId} /> : null}

        {activeView === "permissions" ? <RolePermissionsPanel /> : null}
        {activeView === "year-cycle" ? (
          <div className="space-y-8">
            <CycleManagementPanel
              campusId={data.campusId}
              canForceClose
              onNavigate={(v) => setActiveView(v as PrincipalView)}
            />
            <div className="border-t border-edge/15 pt-6">
              <h3 className="mb-4 text-base font-bold text-ink-strong">Year History & Student Promotion</h3>
              <AcademicYearPanel />
            </div>
          </div>
        ) : null}
        {activeView === "academic-hub" ? (
          <div className="space-y-6">
            <AcademicHub
              campusId={data.campusId}
              onNavigate={(v) => setActiveView(v as PrincipalView)}
            />
            <ScenarioPlanner />
          </div>
        ) : null}

        {activeView === "year-setup" ? (
          <YearSetupWizard
            campusId={data.campusId}
            onComplete={() => setActiveView("academic-hub")}
          />
        ) : null}

        {activeView === "academic-model" ? <AcademicModelPanel campusId={data.campusId} /> : null}

        {activeView === "exam-cycles" ? <div className="space-y-6"><ExamsWorkspace campusId={data.campusId} /><QuestionNetwork /></div> : null}

        {activeView === "grading-rules" ? <GradingRulesPanel campusId={data.campusId} /> : null}
        {activeView === "fees" ? <FeeOverviewTab /> : null}
        {activeView === "timetable" ? <TimetableStudio campusId={data.campusId} /> : null}

        {activeView === "class-rooms" ? <RoomsManager campusId={data.campusId} /> : null}

        {activeView === "period-setup" ? <PeriodsPanel /> : null}

        {activeView === "school-calendar" ? <AcademicCalendar campusId={data.campusId} role="PRINCIPAL" /> : null}
        {activeView === "teacher-performance" ? <TeacherPerformancePanel /> : null}
        {activeView === "report-cards" ? (
          <div className="space-y-8">
            <ReportsPanel data={data} onOpenExams={() => setActiveView("exam-cycles")} busyAction={busyAction} editingReportId={editingReportId} editedRemarks={editedRemarks} onRunAction={runReportAction} onGenerateRemarks={runRemarkDrafts} onEdit={(report) => { setEditingReportId(report.id); setEditedRemarks({ en: report.remarksEn || "", ur: report.remarksUr || "" }); }} onCancelEdit={() => setEditingReportId(null)} onRemarkChange={setEditedRemarks} onSaveRemark={saveRemark} />

          </div>
        ) : null}
        {activeView === "ai" ? <AIPanel features={principalAIFeatures} insights={data.aiInsights} reviewItems={data.pendingAIReviewItems} onComplete={() => { refetch(); }} title="Principal AI" /> : null}
        {activeView === "engagement" ? <EngagementPanel data={data} totals={communicationTotals} busy={busyAction === "communications"} onRunAutomation={runAutomation} /> : null}

        {activeView === "transport" ? <TransportPanel /> : null}
        {activeView === "dormitory" ? <div className="space-y-6"><DormitoryPanel />{packageNav.boarding ? <BoardingOperations /> : null}</div> : null}
        {activeView === "canteen" && packageNav.canteen ? <CanteenPanel /> : null}
          {activeView === "complaints" ? <ComplaintsPanel /> : null}
          {activeView === "phone-calls" ? <PhoneCallsPanel /> : null}
          {activeView === "postal" ? <PostalPanel /> : null}
          {activeView === "certificates" ? <CertificatesPanel /> : null}
        {activeView === "library" ? <LibraryPanel /> : null}
        {activeView === "inventory" ? <InventoryPanel /> : null}
        {activeView === "inventory" ? <PurchasingPanel /> : null}
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
      <ConfirmAction open={!!confirmAction} title={confirmAction?.title || ""} description={confirmAction?.description || ""} confirmLabel={confirmAction?.confirmLabel} tone={confirmAction?.tone} busy={confirmBusy} onConfirm={async () => { if (confirmAction) { await confirmAction.run(); setConfirmAction(null); } }} onCancel={() => setConfirmAction(null)} />
    </RoleShell>
  );
}

/** What the overview deck above does not cover: the review queue itself, and
 *  the two AI panels that act on it. */
function OverviewPanel({ data, onViewReports, onComplete }: {
  data: any;
  onViewReports: () => void; onComplete: () => void | Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-8">
      <div className="min-w-0 xl:col-span-2">
        <CollapsiblePanel icon={FileText} title="Report Card Queue" subtitle="Recent generated academic records"
          headerRight={<BrandButton variant="soft" onClick={onViewReports} icon={<FileText aria-hidden="true" className="w-4 h-4" />}>Open Review</BrandButton>} defaultOpen>
          {data.recentReportCards.length > 0 ? (
            <div className="sk-stagger space-y-2.5">
              {data.recentReportCards.slice(0, 6).map((card: any) => (
                <div key={card.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-strong">{card.student?.fullName || "Student"}</p>
                    <p className="truncate text-xs text-ink-subtle"><bdi>{card.exam?.title}</bdi> · <span className="tabular-nums">{card.grade || `${Math.round(card.percentage || 0)}%`}</span></p>
                  </div>
                  <StatusPill status={card.status} />
                </div>
              ))}
            </div>
          ) : (<EmptyState size="sm" icon={FileText} title="No report cards yet" description="Locked exams and generated marks will appear here for academic review." />)}
        </CollapsiblePanel>
      </div>
      <div className="min-w-0 space-y-6">
        <Card variant="featured" className="sk-rise relative overflow-hidden p-5 sm:p-6" style={{ animationDelay: "240ms" }}><CornerSparkles /><AiActionPanel title="Principal AI" options={principalAIFeatures} compact onComplete={onComplete} /></Card>
        <Card className="sk-rise p-5 sm:p-6" style={{ animationDelay: "320ms" }}>
          <div className="mb-5 flex items-center gap-3">
            <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary shadow-xs"><Sparkles className="w-5 h-5" /></div>
            <h3 className="text-base font-bold text-ink-strong">AI Review</h3>
          </div>
          <AIReviewQueue items={data.pendingAIReviewItems} onComplete={onComplete} />
        </Card>
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
  const ui = useUiText();
  const [searchQuery, setSearchQuery] = useState("");
  const filtered = teachers.filter((t) => { if (!searchQuery.trim()) return true; const q = searchQuery.toLowerCase(); return t.fullName?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q); });
  if (teachers.length === 0 && pendingInvites.length === 0 && campusAdmins.length === 0 && pendingAdminInvites.length === 0) return (<EmptyState icon={Users} title="No faculty records found" description="Invite teachers so subjects and classes can be assigned from the central model." action={<BrandButton onClick={() => onInvite("TEACHER")}>Add Teacher</BrandButton>} />);
  return (
    <div className="space-y-8">
      <Card className="sk-rise p-4 sm:p-6" style={{ animationDelay: "80ms" }}>
        <div className="mb-5"><PanelTitle icon={ShieldCheck} title="Campus Admins" /></div>
        {campusAdmins.length > 0 ? (<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{campusAdmins.map((admin: any) => (<AdminRow key={admin.id} admin={admin} onRemove={admin.id ? () => onRemove(admin.id, "Admin") : undefined} />))}</div>) : null}
        {pendingAdminInvites.length > 0 ? (<div className="mt-4 space-y-2"><p className="sk-eyebrow px-2">Pending Invitations</p>{pendingAdminInvites.map((invite: any) => (<PendingFacultyRow key={invite.inviteId || invite.id} invite={invite} onResend={() => onResend(invite.inviteId || invite.id)} onCancel={() => onCancel(invite.inviteId || invite.id)} />))}</div>) : null}
        {campusAdmins.length === 0 && pendingAdminInvites.length === 0 ? (
          <EmptyState
            size="sm"
            icon={ShieldCheck}
            title={ui("No campus admins yet")}
            description={ui("Invite campus administrators to manage this campus.")}
            action={<BrandButton variant="soft" onClick={() => onInvite("CAMPUS_ADMIN")}>{ui("Invite Admin")}</BrandButton>}
          />
        ) : null}
      </Card>
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <PanelTitle icon={Users} title="Teacher Profiles" />
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <InputGroup className="min-w-0 flex-1 sm:w-64 sm:flex-none">
              <Search data-field-affix="start" aria-hidden="true" className="size-4 text-ink-subtle" />
              <SystemInput type="text" aria-label={ui("Search teachers")} placeholder="Search teachers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </InputGroup>
            <BrandButton variant="soft" onClick={() => onInvite("TEACHER")}>Add Teacher</BrandButton>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((teacher: any) => (<FacultyRow key={teacher.id} teacher={teacher} onView={() => onViewTeacher(teacher, filtered)} onRemove={() => onRemove(teacher.id, "Teacher")} />))}
          {filtered.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState
                icon={Users}
                title={searchQuery ? "No matching teachers" : "No active teachers"}
                description={searchQuery ? "Try a different search term." : "Assigned teachers will appear here for principal oversight."}
                action={searchQuery
                  ? <Button variant="outline" type="button" onClick={() => setSearchQuery("")}>{ui("Clear search")}</Button>
                  : <BrandButton variant="soft" onClick={() => onInvite("TEACHER")}>Add Teacher</BrandButton>}
              />
            </div>
          ) : null}
        </div>
        {pendingInvites.length > 0 ? (<div className="mt-6 space-y-2"><p className="sk-eyebrow px-2">Pending Teacher Invitations (<span className="tabular-nums">{pendingInvites.length}</span>)</p><div className="space-y-2">{pendingInvites.map((invite: any) => (<PendingFacultyRow key={invite.inviteId || invite.id} invite={invite} onResend={() => onResend(invite.inviteId || invite.id)} onCancel={() => onCancel(invite.inviteId || invite.id)} />))}</div></div>) : null}
      </div>
    </div>
  );
}

function ReportsPanel({ data, onOpenExams, busyAction, editingReportId, editedRemarks, onRunAction, onGenerateRemarks, onEdit, onCancelEdit, onRemarkChange, onSaveRemark }: {
  data: any; onOpenExams: () => void; busyAction: string | null; editingReportId: string | null; editedRemarks: { en: string; ur: string };
  onRunAction: (examId: string, action: ReportAction, successMessage: string) => void; onGenerateRemarks: (examId: string) => void; onEdit: (report: any) => void; onCancelEdit: () => void; onRemarkChange: (value: { en: string; ur: string }) => void; onSaveRemark: (report: any, approve?: boolean) => void;
}) {
  const ui = useUiText();
  // An exam joins this list once its marks are locked (or it has moved on to
  // review or publication), so an empty list points back to where that happens.
  if (!data.reviewExams.length) {
    return (
      <div className="sk-panel">
        <EmptyState
          icon={ClipboardList}
          title={ui("No exams ready for review")}
          description={ui("An exam appears here once its marks are locked.")}
          action={<Button variant="outline" type="button" onClick={onOpenExams}>{ui("Open Exams & Results")}</Button>}
        />
      </div>
    );
  }
  return <div className="space-y-6">{data.reviewExams.map((exam: any) => <div key={exam.id} className="sk-panel p-4"><ReportCardPipeline exam={exam} campusId={data.campusId} /></div>)}</div>;
}

function EngagementPanel({ data, totals, busy, onRunAutomation }: { data: any; totals: { sent: number; failed: number; blocked: number; noContact: number }; busy: boolean; onRunAutomation: () => void; }) {
  const ui = useUiText();
  return (
    <div className="space-y-6">
      <div className="sk-stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <EngagementStat icon={CheckCircle2} label="Sent" value={totals.sent} tone="green" />
        <EngagementStat icon={AlertCircle} label="Failed" value={totals.failed} tone="rose" />
        <EngagementStat icon={ShieldCheck} label="Blocked" value={totals.blocked} tone="purple" info={ui("Held back before sending, for example because the plan does not include this channel, the subscription is suspended or approved school data is still needed.")} />
        <EngagementStat icon={MessageSquare} label="No Contact" value={totals.noContact} tone="amber" info={ui("Not sent because the guardian has no contact details on file for that channel.")} />
      </div>
      <Card variant="muted" className="sk-rise p-4 sm:p-6" style={{ animationDelay: "160ms" }}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PanelTitle icon={MessageSquare} title="Recent Parent Communication" />
          <Tooltip content={ui("Runs this campus's reminders now: fees due in 3 days or overdue, marks-entry deadlines that are near, and reports waiting for principal review.")}>
            <Button variant="secondary" type="button" onClick={onRunAutomation} loading={busy}>
              {busy ? null : <Clock aria-hidden="true" className="h-4 w-4" />}
              Run Automation
            </Button>
          </Tooltip>
        </div>
        {data.recentCommunications.length === 0 ? (
          <EmptyState
            size="sm"
            icon={MessageSquare}
            title={ui("No parent messages yet")}
            description={ui("Messages created for guardians, such as fee reminders and report notices, appear here.")}
          />
        ) : (
          <div className="sk-stagger space-y-3">
            {data.recentCommunications.map((item: any) => (
              <div key={item.id} className="sk-panel p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-strong">{formatStatus(item.templateKey)}</p>
                    <p className="mt-1 truncate text-xs text-ink-subtle"><bdi>{item.student?.fullName || item.recipientName || "Parent"}</bdi> · {item.channel}</p>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted" dir="auto">{item.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                    <StatusPill status={item.status} />
                    <span className="text-xs tabular-nums text-ink-subtle">{formatDate(item.sentAt || item.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}


function ActionButton({ label, icon: Icon, busy, onClick }: { label: string; icon: LucideIcon; busy: boolean; onClick: () => void }) {
  return (<Button variant="default" type="button" onClick={onClick} loading={busy} className="w-full">{busy ? null : <Icon aria-hidden="true" className="h-3.5 w-3.5" />}{label}</Button>);
}

function ReportReviewCard({ report, busy, editing, editedRemarks, onEdit, onCancel, onChange, onSave, onApprove }: {
  report: any; busy: boolean; editing: boolean; editedRemarks: { en: string; ur: string }; onEdit: () => void; onCancel: () => void; onChange: (v: { en: string; ur: string }) => void; onSave: () => void; onApprove: () => void;
}) {
  const fieldId = useId();
  return (
    <div className="sk-panel p-5 transition-[border-color,box-shadow] duration-300 hover:border-primary/25 hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-strong">{report.student?.fullName || "Student"}</p>
          <p className="mt-1 text-xs text-ink-subtle">{report.exam?.title || "Exam"} · <span className="tabular-nums">{report.grade || `${Math.round(report.percentage || 0)}%`}</span></p>
        </div>
        <StatusPill status={report.status} />
      </div>
      {editing ? (
        <div className="space-y-3">
          <div>
            <label htmlFor={`${fieldId}-en`} className="mb-1 block text-sm font-semibold text-ink-strong">English Remarks</label>
            <SystemTextarea id={`${fieldId}-en`} value={editedRemarks.en} onChange={(e) => onChange({ ...editedRemarks, en: e.target.value })} className={"w-full resize-none"} />
          </div>
          <div>
            <label htmlFor={`${fieldId}-ur`} className="mb-1 block text-sm font-semibold text-ink-strong">Urdu Remarks</label>
            <SystemTextarea id={`${fieldId}-ur`} dir="auto" value={editedRemarks.ur} onChange={(e) => onChange({ ...editedRemarks, ur: e.target.value })} className={"w-full resize-none"} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button variant="secondary" type="button" onClick={onSave} loading={busy}>Save</Button>
            <Button variant="dark" type="button" onClick={onApprove} loading={busy}>Save & Approve</Button>
          </div>
        </div>
      ) : (<div className="flex gap-2"><Button variant="default" type="button" onClick={onEdit}>Edit Remarks</Button></div>)}
    </div>
  );
}

function EngagementStat({ icon: Icon, label, value, tone, info }: { icon: LucideIcon; label: string; value: number; tone: string; info?: string }) {
  const toneStyles: Record<string, string> = { green: "bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-700", rose: "bg-gradient-to-br from-rose-50 to-rose-100/50 text-rose-700", purple: "bg-gradient-to-br from-brand-50 to-brand-100 text-primary", amber: "bg-gradient-to-br from-amber-50 to-amber-100/50 text-amber-700" };
  return (
    <div className="sk-panel min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex min-w-0 items-center gap-2.5">
        <div aria-hidden="true" className={`shrink-0 rounded-xl p-2 shadow-xs ${toneStyles[tone] || "bg-surface-subtle text-ink-muted"}`}><Icon className="w-4 h-4" /></div>
        <p className="sk-eyebrow min-w-0 truncate">{label}</p>
        {info ? <InfoTip content={info} className="-ms-1" /> : null}
      </div>
      <p className="text-3xl font-bold tracking-tight tabular-nums text-ink-strong">{value}</p>
    </div>
  );
}
