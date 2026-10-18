"use client";
import { ActionQueue } from "@/components/principal/action-queue";
import { PurchasingPanel } from "@/components/purchasing/purchasing-panel";
import { LearningActions } from "@/components/learning/learning-actions";
import { PolicyManager } from "@/components/policies/policy-manager";
import { AdmissionsDesk } from "@/components/admissions/admissions-desk";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

import { pageCardSurface } from "@/components/ui/page-card";

import { moduleForView } from "@/lib/navigation/modules";
import { useCallback, useEffect, useState } from "react";
import {
  Award,
  ArrowRightLeft,
  BookOpen,
  Building2,
  Bus,
  Calendar,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  DoorOpen,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  LayoutGrid,
  CalendarRange,
  MessageCircle,
  Package,
  PhoneCall,
  Mail,
  Plane,
  Receipt,
  Landmark,
  Scale,
  School,
  Shield,
  Sparkles,
  Tags,
  UserCog,
  Users,
  Wrench,
  ShieldCheck,
  Trophy,
  Network,
} from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { apiErrorMessage, userMessage } from "@/lib/errors";
import { getCampusDashboardData } from "@/app/actions/dashboard";
import { cancelInvitation, removeStaff, resendInvitation } from "@/app/actions/invite";
import { RoleShell, type RoleNavItem, BrandButton } from "@/components/role-dashboard";
import { CampusOverview } from "@/components/insights";
import { CommandCentreSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import type { SidebarEntry } from "@/components/role-dashboard/RoleSidebar";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { AdmissionForm } from "@/app/dashboard/students/admission-form";
import { BulkImportDialog } from "@/app/dashboard/students/bulk-import-dialog";
import { PlansPanel } from "@/components/billing/PlansPanel";
import { SubscriptionLifecyclePanel } from "@/components/billing/SubscriptionLifecyclePanel";
import { QuickCreateClass } from "@/components/shared-admin/quick-create-class";
import { ClassManager } from "@/components/shared-admin/class-manager";
import { ArchivedClassesPanel } from "@/components/shared-admin/archived-classes-panel";
import { classArchiveText, studentArchiveText, fetchAcademicImpact, subjectRemovalText, teacherChangeText } from "@/components/shared-admin/academic-impact";
import { useUiText } from "@/components/locale/LocaleProvider";
import { AddTeacherForm } from "@/components/teacher/add-teacher-form";
import { AddStaffForm } from "@/components/staff/add-staff-form";
import { StaffHierarchyPanel } from "@/components/staff/hierarchy-panel";
import { UnifiedAttendancePanel } from "@/components/attendance/unified-attendance-panel";
import { FeesPanel } from "@/components/fees/FeesPanel";
import { TimetableStudio } from "@/components/timetable/TimetableStudio";
import { AcademicHub } from "@/components/academic/AcademicHub";
import { AcademicSubnav, ACADEMIC_VIEWS, ACADEMIC_VIEW_MODULE } from "@/components/academic/AcademicSubnav";
import { StaffSubnav, STAFF_VIEWS, STAFF_VIEW_MODULE } from "@/components/staff/StaffSubnav";
import { StudentSubnav, STUDENT_VIEWS, STUDENT_VIEW_MODULE } from "@/components/student/StudentSubnav";
import { YearSetupWizard } from "@/components/academic/YearSetupWizard";
import { ExamsWorkspace } from "@/components/academic/exams/ExamsWorkspace";
import { GradingRulesPanel } from "@/components/academic/GradingRulesPanel";
import { AcademicModelPanel } from "@/components/academic/AcademicModelPanel";
import { RoomsManager } from "@/components/academic/RoomsManager";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { YearEndPanel } from "@/components/academic/YearEndPanel";
import { RolloverReview } from "@/components/academic/rollover-review";
import { AcademicYearPanel } from "@/components/academic-year/AcademicYearPanel";
import { TeacherPerformancePanel } from "@/components/academic-year/TeacherPerformancePanel";
import { CycleManagementPanel } from "@/components/academic-year/CycleManagementPanel";
import { ReportCardDetailModal } from "@/components/teacher/teacher-components";
import {
  TransportPanel,
  DormitoryPanel,
  ComplaintsPanel,
  PhoneCallsPanel,
  PostalPanel,
  CertificatesPanel,
  InventoryPanel,
  LibraryPanel,
} from "@/components/operations";
import {
  AcademicPanel,
  ActivityLogModal,
  AdmissionQueriesPanel,
  AIPanel,
  ArchivedStudentsPanel,
  exportStudentsToCSV,
  classGroupKey,
  ExamDetailModal,
  FacultyPanel,
  groupClasses,
  HelpModal,
  LeadershipPanel,
  LeaveManagementPanel,
  MoveStudentModal,
  PeriodsPanel,
  RolePermissionsPanel,
  ReportCardsPanel,
  StudentDetailModal,
  StudentsPanel,
  StudentSetupPanel,
  TeacherConflictsBanner,
  TeacherDetailModal,
  classLabel,
} from "@/components/shared-admin";
import { LocaleSettingsPanel } from "@/components/settings/LocaleSettingsPanel";
import { InstitutionSettingsPanel } from "@/components/settings/InstitutionSettingsPanel";

type AdminView =
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
  | "ai"
  | "fees"
  | "timetable"
  | "class-rooms"
  | "period-setup"
  | "school-calendar"
  | "year-cycle"
  | "teacher-performance"
  | "exam-cycles"
  | "grading-rules"
  | "billing"
  | "report-cards"
  | "transport"
  | "dormitory"
  | "complaints"
  | "phone-calls"
  | "postal"
  | "certificates"
  | "inventory"
  | "library"
  | "academic-hub"
  | "year-setup"
  | "academic-model"
  | "institution"
  ;

/** Land on the command centre: it answers "how is the campus doing right now"
 *  in one screen, and every other area is one click from it. Academic Overview
 *  is still where the year's setup lives; Campus Control is account
 *  administration, not a daily starting point. */
const DEFAULT_VIEW: AdminView = "overview";

const ADMIN_VIEWS: readonly AdminView[] = [
  "overview",
  "leadership", "classes", "teachers", "staff-hierarchy", "students", "admission-queries", "applications",
  "student-setup", "promote-archive", "leave", "permissions", "attendance",
  "ai", "fees", "timetable", "class-rooms", "period-setup", "school-calendar",
  "year-cycle", "teacher-performance", "exam-cycles", "grading-rules", "billing", "report-cards",
  "transport", "dormitory", "complaints", "phone-calls", "postal", "certificates", "inventory", "library", "academic-hub", "year-setup", "academic-model",
  "institution",
];

function isAdminView(value: string | null): value is AdminView {
  return !!value && (ADMIN_VIEWS as readonly string[]).includes(value);
}

function viewFromLocation(): AdminView {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  const v = new URLSearchParams(window.location.search).get("view");
  return isAdminView(v) ? v : DEFAULT_VIEW;
}

/**
 * The section the admin is looking at, mirrored into `?view=`.
 *
 * Kept in the URL rather than in component state alone so a refresh, a browser
 * Back, or a pasted link all land on the same section instead of bouncing the
 * user back to the overview. We drive it with the History API directly instead
 * of the Next router so switching sections does not re-run the route's data
 * loading — it is a purely client-side panel swap.
 */
function useAdminView(): [AdminView, (next: AdminView) => void] {
  const [activeView, setActiveViewState] = useState<AdminView>(viewFromLocation);

  useEffect(() => {
    const onPop = () => setActiveViewState(viewFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Stamp the default onto the URL so the first Back does not leave a bare
  // /admin entry that would silently reset the section.
  useEffect(() => {
    if (!isAdminView(new URLSearchParams(window.location.search).get("view"))) {
      // Keep the rest of the query (e.g. ?settings=language) so a deep link still reaches its target.
      const url = new URL(window.location.href);
      url.searchParams.set("view", activeView);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  // The history write stays outside the state updater: updaters must be pure,
  // and pushing from inside one makes React warn about updating the Router
  // while another component renders.
  const setActiveView = useCallback((next: AdminView) => {
    if (viewFromLocation() !== next) {
      window.history.pushState(null, "", `/admin?view=${next}`);
    }
    setActiveViewState(next);
  }, []);

  return [activeView, setActiveView];
}

/** Shown when a section is reachable by URL but not permitted for this role. */
function RestrictedView({ onBack }: { onBack: () => void }) {
  const ui = useUiText();
  return (
    <div className="sk-panel">
      <EmptyState
        icon={Shield}
        title={ui("Not available for your role")}
        description={ui("Billing is managed at the school level. Ask a school administrator if you need changes to the plan.")}
        action={
          <Button variant="default" type="button" onClick={onBack}>
            {ui("Back to overview")}
          </Button>
        }
      />
    </div>
  );
}

/**
 * Staff rows hand over either a readable label ("Admin", "Teacher") or the raw
 * role ("ACCOUNTANT"); the confirm dialog and toast always show the readable one.
 */
const STAFF_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  CAMPUS_ADMIN: "Admin",
  PRINCIPAL: "Principal",
  TEACHER: "Teacher",
  ACCOUNTANT: "Accountant",
  LIBRARIAN: "Librarian",
  RECEPTIONIST: "Receptionist",
};

export default function CampusAdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useAdminView();
  const [showClassWizard, setShowClassWizard] = useState(false);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [admissionClassId, setAdmissionClassId] = useState("");
  const [bulkImportClassId, setBulkImportClassId] = useState("");
  const [movingStudent, setMovingStudent] = useState<any>(null);
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
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [showAddPrincipalForm, setShowAddPrincipalForm] = useState(false);
  const [showAddAccountantForm, setShowAddAccountantForm] = useState(false);
  const [showAddLibrarianForm, setShowAddLibrarianForm] = useState(false);
  const [showAddReceptionistForm, setShowAddReceptionistForm] = useState(false);
  const [moveClassId, setMoveClassId] = useState("");
  const [movingStudentBusy, setMovingStudentBusy] = useState(false);
  const [savingClassTeacherId, setSavingClassTeacherId] = useState<string | null>(null);
  const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
  const [creatingSubjectClassId, setCreatingSubjectClassId] = useState<string | null>(null);
  const [creatingSections, setCreatingSections] = useState(false);
  const [applyingSubjectClassId, setApplyingSubjectClassId] = useState<string | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showAddTeacherForm, setShowAddTeacherForm] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const ui = useUiText();
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: "danger" | "warning" | "primary";
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
  const [admissionQueriesVersion, setAdmissionQueriesVersion] = useState(0);
  const [studentsVersion, setStudentsVersion] = useState(0);
  const [convertingQuery, setConvertingQuery] = useState<any>(null);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const nextData = await getCampusDashboardData();
      setData(nextData);
      return nextData;
    } catch (error: any) {
      // Server-action failures arrive as raw engine errors — query text,
      // absolute build paths, database host. Never straight into a toast.
      toast.error(userMessage(error, "Could not load the campus dashboard."));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sign-out lives in RoleHeader, which this console renders via RoleShell.
  // An unreachable handleLogout() used to sit here (RoleShell takes no onLogout
  // prop, so nothing could call it); its router.push("/login") would also have
  // left this console renderable via Back after sign-out.
  // Exports exactly what the directory is showing, so a filtered view exports
  // the filtered roster rather than silently dumping every student.
  const exportStudentsCSV = (visible?: any[]) =>
    exportStudentsToCSV(visible ?? data?.students ?? [], data?.campusName);

  const openAddStaff = (role: "CAMPUS_ADMIN" | "PRINCIPAL" | "ACCOUNTANT" | "LIBRARIAN" | "RECEPTIONIST") => {
    if (role === "CAMPUS_ADMIN") setShowAddAdminForm(true);
    else if (role === "PRINCIPAL") setShowAddPrincipalForm(true);
    else if (role === "ACCOUNTANT") setShowAddAccountantForm(true);
    else if (role === "LIBRARIAN") setShowAddLibrarianForm(true);
    else if (role === "RECEPTIONIST") setShowAddReceptionistForm(true);
  };

  const openAdmissionForm = (classId?: string) => {
    setAdmissionClassId(classId || "");
    setConvertingQuery(null);
    setShowAdmissionForm(true);
  };

  const openConvertQuery = (query: any) => {
    setConvertingQuery(query);
    setAdmissionClassId(query.classInterested?.id || "");
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

  const handleAdmissionSuccess = (createdStudent?: any) => {
    // Close the modal immediately so the student-creation toast isn't stranded
    // behind the (slow) "mark query converted" PATCH and the campus-wide
    // refresh. Those run in the background after the modal is gone.
    setShowAdmissionForm(false);
    const studentId = createdStudent?.id;
    if (convertingQuery && studentId) {
      const queryId = convertingQuery.id;
      setConvertingQuery(null);
      // The student already exists at this point, so a failure here is only
      // about the enquiry; say so rather than implying nothing was saved.
      const notConverted = ui("The student was added, but the enquiry could not be marked as converted.");
      (async () => {
        try {
          const res = await fetch("/api/admission-queries", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: queryId, convertedStudentId: studentId }),
          });
          const data = await res.json();
          if (res.ok) {
            toast.success(ui("Enquiry marked as converted for {0}", [createdStudent.fullName]));
          } else {
            toast.error(friendlyErrorMessage(apiErrorMessage(data.error, ""), notConverted));
          }
        } catch {
          toast.error(notConverted);
        }
        // loadData() refreshes campus-wide counts but not the enquiries
        // panel's own list — that only re-fetches when this version bumps,
        // which is why the query kept showing ACTIVE until a manual reload.
        setAdmissionQueriesVersion((v) => v + 1);
        loadData();
      })();
    } else {
      loadData();
    }
  };

  const handleAddSection = async (name: string, section: string, academicYear: number, convertClassId?: string) => {
    const failed = ui("Could not create the section. Please try again.");
    try {
      // Converting: the class had no sections, so rename that row rather than
      // spawning a sibling and stranding its students on an unnamed class.
      const res = convertClassId
        ? await fetch("/api/classes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: convertClassId, section }),
          })
        : await fetch("/api/classes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, section, sections: [section], academicYear }),
          });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(
        convertClassId
          ? ui("\"{0}\" now has section \"{1}\" — existing students moved into it", [name, section])
          : ui("Section \"{0}\" created", [section])
      );
      await loadData();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    }
  };

  const handleMoveStudent = async () => {
    if (!movingStudent || !moveClassId || moveClassId === (movingStudent.class?.id || movingStudent.classId)) return;
    setMovingStudentBusy(true);
    const failed = ui("Could not move the student. Please try again.");
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: movingStudent.id, classId: moveClassId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      const moved = result.data;
      const cls = moved?.class ? [moved.class.name, moved.class.section].filter(Boolean).join(" ") : "";
      toast.success(moved?.rollNo ? ui("Moved to {0}. New roll number: {1}", [cls, moved.rollNo]) : ui("Student moved"));
      setMovingStudent(null);
      setMoveClassId("");
      await loadData();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    } finally {
      setMovingStudentBusy(false);
    }
  };

  const handleChangeClassTeacher = async (classId: string, classTeacherId: string) => {
    setSavingClassTeacherId(classId);
    const failed = ui("Could not change the class teacher. Please try again.");
    try {
      const res = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, classTeacherId: classTeacherId || null }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Class teacher updated"));
      (result.clashes || []).forEach((c: any) => toast.warning(c?.teacherName && c?.label ? ui("{0} already teaches at {1}", [c.teacherName, c.label]) : ui("This teacher already has a lesson at this time")));
      setSelectedClass((current: any) =>
        current?.id === classId
          ? { ...current, classTeacher: result.data?.classTeacher || null, _count: result.data?._count || current._count }
          : current
      );
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    } finally {
      setSavingClassTeacherId(null);
    }
  };

  const handleCreateSubject = async (
    classId: string,
    subject: { name: string; totalMarks: number; teacherId: string; applyToAllSections?: boolean }
  ) => {
    if (!subject.name.trim()) {
      toast.error(ui("Enter a subject name before adding it."));
      return false;
    }

    setCreatingSubjectClassId(classId);
    const failed = ui("Could not add the subject. Please try again.");
    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          name: subject.name.trim(),
          totalMarks: subject.totalMarks || 100,
          teacherId: subject.teacherId || undefined,
          applyToAllSections: subject.applyToAllSections || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(
        result.createdCount > 1 ? ui("Subject added to {0} sections", [result.createdCount]) : ui("Subject added")
      );
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
      return true;
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
      return false;
    } finally {
      setCreatingSubjectClassId(null);
    }
  };

  /**
   * Add one or more sections to a class that already exists.
   *
   * The class manager could rename, retire and re-teacher a section but never
   * create one — so "Grade 8 now needs a B" meant leaving the manager, opening
   * Quick Setup, and re-entering a class that was already there (which the
   * duplicate check then rejected). Sections are created against the existing
   * class name and year, and can carry a copy of another section's subjects,
   * which is what adding a parallel section almost always means.
   */
  const handleCreateSections = async (
    source: any,
    input: { sections: string[]; cloneFromClassId?: string; teacherId?: string },
  ): Promise<boolean> => {
    if (input.sections.length === 0) return false;

    setCreatingSections(true);
    const failed = ui("Could not add the section. Please try again.");
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: source.name,
          academicYear: Number(source.academicYear) || new Date().getFullYear(),
          sections: input.sections,
          teachingMode: source.teachingMode || "SINGLE",
          classTeacherId: input.teacherId || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));

      const created: any[] = Array.isArray(result.data) ? result.data : [result.data];

      // Copy the chosen section's subjects across, if asked. Bounded
      // concurrency for the same reason the setup wizard uses it: the database
      // sits behind a pooler.
      const cloneFrom = input.cloneFromClassId
        ? (data?.classes || []).find((c: any) => c.id === input.cloneFromClassId)
        : null;
      const template: any[] = cloneFrom?.subjects || [];

      if (template.length > 0) {
        const jobs: (() => Promise<void>)[] = [];
        for (const cls of created) {
          if (!cls?.id) continue;
          for (const subject of template) {
            jobs.push(async () => {
              await fetch("/api/subjects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  classId: cls.id,
                  name: subject.name,
                  totalMarks: subject.totalMarks || 100,
                  teacherId: subject.teacher?.id || undefined,
                }),
              });
            });
          }
        }
        let cursor = 0;
        await Promise.all(
          Array.from({ length: Math.min(6, jobs.length) }, async () => {
            while (cursor < jobs.length) await jobs[cursor++]();
          }),
        );
      }

      toast.success(
        created.length > 1
          ? ui("{0} sections added to {1}", [created.length, source.name])
          : ui("Section {0} added to {1}", [input.sections[0], source.name]),
      );

      const nextData = await loadData();
      // Stay in the manager, on the section that was just created.
      const landing = nextData?.classes?.find((c: any) => c.id === created[0]?.id);
      if (landing) setSelectedClass(landing);
      else syncSelectedClass(nextData, source.id);
      return true;
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
      return false;
    } finally {
      setCreatingSections(false);
    }
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
    const failed = ui("Could not change the subject teacher. Please try again.");
    try {
      const res = await fetch("/api/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subjectId, teacherId: teacherId || null, ...(effectiveFrom ? { effectiveFrom } : {}) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Subject teacher updated"));
      (result.clashes || []).forEach((c: any) => toast.warning(c?.teacherName && c?.label ? ui("{0} already teaches at {1}", [c.teacherName, c.label]) : ui("This teacher already has a lesson at this time")));
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    } finally {
      setSavingSubjectId(null);
    }
  };

  // Switching to SINGLE makes the API propagate the class teacher across every
  // subject in one call, so the two can never drift out of sync.
  const handleChangeTeachingMode = async (classId: string, mode: "SINGLE" | "SUBJECT") => {
    setApplyingSubjectClassId(classId);
    const failed = ui("Could not change the teaching mode. Please try again.");
    try {
      const res = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, teachingMode: mode }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(mode === "SINGLE" ? ui("All subjects now follow the class teacher") : ui("Each subject can now have its own teacher"));
      (result.clashes || []).forEach((c: any) => toast.warning(c?.teacherName && c?.label ? ui("{0} already teaches at {1}", [c.teacherName, c.label]) : ui("This teacher already has a lesson at this time")));
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    } finally {
      setApplyingSubjectClassId(null);
    }
  };

  const handleStaffAdded = async () => {
    setShowAddAdminForm(false);
    setShowAddPrincipalForm(false);
    setShowAddAccountantForm(false);
    setShowAddLibrarianForm(false);
    setShowAddReceptionistForm(false);
    await loadData();
  };

  const handleRemove = async (userId: string, label: string) => {
    if (userId === data?.currentUserId) {
      toast.info(ui("Your owner account stays active so this campus remains manageable."));
      return;
    }

    const roleLabel = ui(STAFF_ROLE_LABELS[label] ?? label);
    setConfirmAction({
      title: ui("Revoke {0} access?", [roleLabel]),
      // removeStaff deactivates the account and ends its sessions; nothing is deleted.
      description: ui("They will be signed out and can no longer use this campus workspace. Their records are kept."),
      confirmLabel: ui("Revoke access"),
      run: async () => {
        await removeStaff(userId);
        toast.success(ui("{0} access revoked", [roleLabel]));
        await loadData();
      },
    });
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      await resendInvitation(inviteId);
      toast.success(ui("Invitation resent"));
      await loadData();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not resend the invitation. Please try again.")));
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    setConfirmAction({
      title: ui("Cancel invitation?"),
      description: ui("The invited person will no longer be able to use this invitation link."),
      confirmLabel: ui("Cancel invitation"),
      cancelLabel: ui("Keep invitation"),
      run: async () => {
        await cancelInvitation(inviteId);
        toast.success(ui("Invitation cancelled"));
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
    } catch (error) {
      // The dialog stays open so the admin can retry or cancel.
      toast.error(friendlyErrorMessage(error, ui("This action could not be completed. Please try again.")));
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleDeleteClass = async (cls: any) => {
    const previewResponse = await fetch(`/api/classes?id=${encodeURIComponent(cls.id)}&preview=true`, { method: "DELETE" });
    const preview = await previewResponse.json();
    if (!previewResponse.ok) throw new Error(apiErrorMessage(preview.error, ui("Could not check what archiving this class affects. Please try again.")));
    const enrolled = Number(preview.dependencies?.students || 0);
    setConfirmAction({
      title: ui("Archive {0}?", [classLabel(cls)]),
      description: classArchiveText(preview.dependencies || {}, ui),
      confirmLabel: enrolled ? ui("Close") : ui("Archive Class"),
      tone: enrolled ? "primary" : "warning",
      run: async () => {
        if (enrolled) return;
        const res = await fetch(`/api/classes?id=${cls.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Archived by administrator" }) });
        const result = await res.json();
        if (!res.ok) throw new Error(apiErrorMessage(result.error, ui("Could not archive the class. Please try again.")));
        toast.success(ui("Class archived; history preserved"));
        setSelectedClass(null);
        await loadData();
      },
    });
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
        // runConfirmedAction keeps the dialog open and reports the server error if this throws.
        const res = await fetch(`/api/students?id=${encodeURIComponent(student.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Archived by administrator" }) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || ui("Student could not be archived"));
        toast.success(ui("Student archived; history preserved"));
        setSelectedStudent(null);
        await loadData();
      },
    });
  };


  const handleDeleteSubject = async (subject: any) => {
    // SKO-462: the real impact, fetched before anything is confirmed.
    const impact = await fetchAcademicImpact("subject", subject.id).catch((error: unknown) => {
      toast.error(friendlyErrorMessage(error, ui("Could not check what deleting this subject affects. Please try again.")));
      return null;
    });
    if (!impact) return;
    const blocked = Boolean(impact.counts.marks || impact.counts.exams || impact.counts.examSchedules);
    setConfirmAction({
      title: ui("Delete {0}?", [subject.name]),
      description: subjectRemovalText(impact, ui),
      confirmLabel: blocked ? ui("Close") : ui("Delete Subject"),
      tone: blocked ? "primary" : "danger",
      run: async () => {
        if (blocked) return;
        const res = await fetch(`/api/subjects?id=${subject.id}`, { method: "DELETE" });
        const result = await res.json();
        if (!res.ok) throw new Error(apiErrorMessage(result.error, ui("Could not delete the subject. Please try again.")));
        toast.success(ui("Subject deleted · {0}", [new Date().toLocaleString()]));
        await loadData();
      },
    });
  };

  const handleUpdateClass = async (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => {
    setSavingClassUpdate(true);
    const failed = ui("Could not save the class changes. Please try again.");
    try {
      const res = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Class updated"));
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    } finally {
      setSavingClassUpdate(false);
    }
  };

  const handleUpdateStudent = async (studentId: string, updates: Record<string, any>) => {
    setSavingStudentUpdate(true);
    const failed = ui("Could not save the student's changes. Please try again.");
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: studentId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Student updated"));
      setSelectedStudent((current: any) =>
        current?.id === studentId ? { ...current, ...result.data } : current
      );
      await loadData();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    } finally {
      setSavingStudentUpdate(false);
    }
  };

  const handleUpdateSubject = async (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => {
    setSavingSubjectUpdateId(subjectId);
    const failed = ui("Could not save the subject changes. Please try again.");
    try {
      const res = await fetch("/api/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subjectId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Subject updated"));
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    } finally {
      setSavingSubjectUpdateId(null);
    }
  };

  const handleUpdateTeacher = async (teacherId: string, updates: Record<string, any>) => {
    const failed = ui("Could not save the teacher's changes. Please try again.");
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: teacherId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Teacher updated"));
      setSelectedTeacher((current: any) =>
        current?.id === teacherId ? { ...current, ...result.data } : current
      );
      await loadData();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    }
  };

  const handleSendReportCard = async (reportCardId: string) => {
    setSendingReport(reportCardId);
    const failed = ui("Could not send the report card. Please try again.");
    try {
      const res = await fetch(`/api/reports/${reportCardId}/send`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      if (result.jobId) { window.location.assign(`/jobs?id=${result.jobId}`); return; }
      await loadData();
    } catch (error) { toast.error(friendlyErrorMessage(error, failed)); }
    finally { setSendingReport(null); }
  };

  const handleSaveReportRemarks = async (reportCardId: string, remarks: { en: string; ur: string }) => {
    setSavingRemarks(true);
    const failed = ui("Could not save the remarks. Please try again.");
    try {
      const res = await fetch(`/api/reports/${reportCardId}/remarks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarksEn: remarks.en, remarksUr: remarks.ur }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Remarks saved"));
      setSelectedReportCard((c: any) => c ? { ...c, remarksEn: remarks.en, remarksUr: remarks.ur } : c);
    } catch (error) { toast.error(friendlyErrorMessage(error, failed)); }
    finally { setSavingRemarks(false); }
  };

  const handleGenerateStudentRemarks = async (studentId: string, examId: string) => {
    setRemarkGeneratingFor(studentId);
    const failed = ui("Could not generate remarks. Please try again.");
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, examId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Remarks generated"));
    } catch (error) { toast.error(friendlyErrorMessage(error, failed)); }
    finally { setRemarkGeneratingFor(null); }
  };

  /*
   * Ordered by how often an admin actually needs each area: academics and
   * students first, day-to-day operations next, and account administration
   * last. Campus Control used to sit at the top even though it is a settings
   * screen most admins open once a term.
   */
  const navItems: SidebarEntry[] = [
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
        { icon: MessageCircle, label: "Complaints", active: activeView === "complaints", module: moduleForView("complaints"), onClick: () => setActiveView("complaints") },
        { icon: ShieldCheck, label: "Pickup desk", href: "/pickup" },
        { icon: Trophy, label: "Activities", href: "/activities" },
        { icon: PhoneCall, label: "Phone Calls", active: activeView === "phone-calls", module: moduleForView("phone-calls"), onClick: () => setActiveView("phone-calls") },
        { icon: Mail, label: "Postal", active: activeView === "postal", module: moduleForView("postal"), onClick: () => setActiveView("postal") },
        { icon: FileText, label: "Certificates", active: activeView === "certificates", module: moduleForView("certificates"), onClick: () => setActiveView("certificates") },
        { icon: Package, label: "Inventory", active: activeView === "inventory", module: moduleForView("inventory"), onClick: () => setActiveView("inventory") },
        { icon: BookOpen, label: "Library", active: activeView === "library", module: moduleForView("library"), onClick: () => setActiveView("library") },
      ],
    },
    { icon: Sparkles, label: "AI Assistant", active: activeView === "ai", module: moduleForView("ai"), onClick: () => setActiveView("ai") },
    { icon: LayoutGrid, label: "Admins & Access", active: activeView === "leadership", module: moduleForView("leadership"), onClick: () => setActiveView("leadership") },
    { icon: Landmark, label: "School & Campus", active: activeView === "institution", module: moduleForView("institution"), onClick: () => setActiveView("institution") },
  ];

  // A standalone campus (single-campus school) has no separate school owner —
  // its top admin IS the school's super admin, so plan buying belongs here too.
  // In a school group, plan management stays with the owner at /dashboard/billing.
  const canManagePlans =
    data?.role === "ADMIN" || (data?.role === "CAMPUS_ADMIN" && data?.isStandaloneCampus);
  if (canManagePlans) {
    navItems.push(
      { icon: CreditCard, label: "Billing & plan", active: activeView === "billing", module: moduleForView("billing"), onClick: () => setActiveView("billing") },
    );
  }
  const filteredNavItems: SidebarEntry[] = navItems;

  // Messaging is a shell destination, separate from academic module access.
  filteredNavItems.push({ icon: MessageCircle, label: "Messages", href: "/messages" });

  // Same reasoning, at the other end of the list: the command centre is the
  // landing screen for every admin, so it sits outside the module permissions
  // rather than being graded against one of them.
  filteredNavItems.unshift({
    icon: LayoutDashboard,
    label: "Command Centre",
    active: activeView === "overview", module: moduleForView("overview"),
    onClick: () => setActiveView("overview"),
  });

  const bottomItems: RoleNavItem[] = [];
  const adminAIFeatures = [
    { feature: "at_risk_students", label: "At-risk Students", placeholder: "Class, exam, or attendance focus" },
    { feature: "class_performance_summary", label: "Class Summary", placeholder: "Class or term" },
    { feature: "teacher_class_comparison", label: "Class Comparison", placeholder: "Classes or teachers to compare" },
    { feature: "intervention_suggestions", label: "Intervention", placeholder: "Student or class concern" },
    { feature: "pending_review_queue", label: "Review Queue", placeholder: "Optional priority note" },
  ];

  if (loading && !data) {
    return (
      <RoleShellSkeleton navRows={9} label={ui("Loading the campus command centre")}>
        <CommandCentreSkeleton />
      </RoleShellSkeleton>
    );
  }

  // `return null` here rendered a blank page whenever the dashboard load
  // failed — a white screen and a toast that disappears after five seconds,
  // with no way back other than guessing to reload.
  if (!data) {
    // Offline gets its own wording: "try again in a moment" is not the fix
    // when the device has no connection at all.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-6 sm:p-6">
        <h1 className="sr-only">{ui("Command Centre")}</h1>
        <ErrorState
          variant="page"
          offline={offline}
          title={offline ? undefined : ui("Couldn't load your dashboard")}
          description={offline ? undefined : ui("The campus data didn't come back. This is usually temporary — try again in a moment.")}
          onRetry={() => loadData()}
        />
      </div>
    );
  }

  const canInvitePrincipal = !data.principal;

  return (
    <RoleShell
      tagline={data.campusName ? `${data.campusName}${data.campusCity ? ` · ${data.campusCity}` : ""}` : ui("Campus")}
      navItems={filteredNavItems}
      bottomItems={bottomItems}
      searchPlaceholder={ui("Search campus records...")}
      userName={data.adminName}
      userRole={ui("School Group Campus")}
      logoUrl={data.logoUrl}
      avatarSeed={data.adminEmail || data.adminName}
      dashboardHref="/admin"
      headerActions={null}
    >
      <section className={cn(pageCardSurface, "p-0 sm:p-0", "flex-1 relative overflow-hidden flex flex-col")} >
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 bg-brand-50/20">
          {/* Academics is ten screens deep. This keeps them one click from each
              other instead of one sidebar expansion away. */}
          {ACADEMIC_VIEWS.has(activeView) ? (
            <AcademicSubnav
              active={activeView}
              onNavigate={(v) => setActiveView(v as AdminView)}
            />
          ) : null}

          {/* Staff and Students are multi-screen areas too, and were the two
              places left where moving between screens meant going back to the
              sidebar. Same strip, so all three areas behave the same. */}
          {STAFF_VIEWS.has(activeView) ? (
            <StaffSubnav
              active={activeView}
              onNavigate={(v) => setActiveView(v as AdminView)}
            />
          ) : null}

          {STUDENT_VIEWS.has(activeView) ? (
            <StudentSubnav
              active={activeView}
              onNavigate={(v) => setActiveView(v as AdminView)}
            />
          ) : null}

          {/* The command centre's panels are separate cards; without the gap
              they sat edge to edge and read as one block. */}
          {activeView === "overview" ? (
            <div className="space-y-5">
              <ActionQueue campusId={data.campusId} />
              <LearningActions />
              <PolicyManager />
              <CampusOverview
                data={data}
                onNavigate={(view) => setActiveView(view as AdminView)}
                onAddStudent={data.classes.length > 0 ? () => openAdmissionForm() : undefined}
                onAddClass={() => setShowClassWizard(true)}
              />
            </div>
          ) : null}

          {activeView === "institution" ? (
            <div className="space-y-6">
              <header className="min-w-0">
                <p className="sk-eyebrow text-primary">{ui("Institution record")}</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{ui("School & Campus")}</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
                  {ui("Name, branding and contact details. School-wide details are owned by the institution owner.")}
                </p>
              </header>
              {/* scope="editable" keeps a branch admin's view to their own campus
                  rather than listing every sibling campus in the group. */}
              <InstitutionSettingsPanel scope="editable" onSaved={loadData} />
              <LocaleSettingsPanel />
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
              onDeleteSubject={handleDeleteSubject}
              onUpdateSubject={handleUpdateSubject}
              onAddSection={handleAddSection}
            />
          </>
          ) : null}

          {activeView === "teachers" ? (
            <FacultyPanel
              teachers={data.teachers}
              pendingInvites={data.pendingTeacherInvitations}
              onInvite={() => setShowAddTeacherForm(true)}
              onRemove={(id) => handleRemove(id, "Teacher")}
              onViewTeacher={(teacher, visible) => {
              setSelectedTeacher(teacher);
              setTeacherSequence(visible || []);
            }}
              onResend={handleResendInvite}
              onCancel={handleCancelInvite}
            />
          ) : null}

          {activeView === "staff-hierarchy" ? (
            <StaffHierarchyPanel campusId={data.campusId} />
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
              onRefresh={loadData}
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

          {activeView === "student-setup" ? (
            <StudentSetupPanel
              studentCount={data.students?.length}
              onViewStudents={(filter) => {
                setRosterFilter(filter);
                setActiveView("students");
              }}
            />
          ) : null}

          {/*
            Year-end work leads. This view is reached from a nav item called
            "Promote Students", so opening on the archived-students list put the
            promised action below the fold and behind a list that is empty for
            most of the year. Archived students are the follow-up, not the
            headline.
          */}
          {activeView === "promote-archive" ? (
            <div className="space-y-6">
              <RolloverReview campusId={data.campusId} />
              <YearEndPanel campusId={data.campusId} />
              <ArchivedStudentsPanel version={studentsVersion} onVersionBump={() => setStudentsVersion((v) => v + 1)} />
              <ArchivedClassesPanel version={studentsVersion} onRestored={() => setStudentsVersion((v) => v + 1)} />
            </div>
          ) : null}

          {activeView === "leave" ? (
          <LeaveManagementPanel campusId={data.campusId} />
        ) : null}

          {activeView === "permissions" ? (
            <RolePermissionsPanel />
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
            <FeesPanel campusId={data.campusId} />
          ) : null}

          {activeView === "academic-hub" ? (
            <AcademicHub campusId={data.campusId} onNavigate={(v) => setActiveView(v as AdminView)} />
          ) : null}

          {activeView === "year-setup" ? (
            <YearSetupWizard campusId={data.campusId} onComplete={() => setActiveView("academic-hub")} />
          ) : null}

          {activeView === "academic-model" ? <AcademicModelPanel campusId={data.campusId} /> : null}

          {activeView === "timetable" ? (
            <TimetableStudio campusId={data.campusId} />
          ) : null}

          {activeView === "class-rooms" ? (
            <RoomsManager campusId={data.campusId} />
          ) : null}

          {activeView === "period-setup" ? (
            <PeriodsPanel />
          ) : null}

          {activeView === "school-calendar" ? (
            <AcademicCalendar campusId={data.campusId} />
          ) : null}

          {activeView === "year-cycle" ? (
            <div className="space-y-8">
              <CycleManagementPanel
                campusId={data.campusId}
                onNavigate={(v) => setActiveView(v as AdminView)}
              />
              <section className="border-t border-edge/15 pt-6" aria-labelledby="admin-year-history-heading">
                <h3 id="admin-year-history-heading" className="mb-4 text-base font-bold text-ink-strong">{ui("Year History & Student Promotion")}</h3>
                <AcademicYearPanel />
              </section>
            </div>
          ) : null}

          {activeView === "teacher-performance" ? (
            <TeacherPerformancePanel />
          ) : null}

          {activeView === "exam-cycles" ? (
            <ExamsWorkspace campusId={data.campusId} />
          ) : null}

          {activeView === "grading-rules" ? (
            <GradingRulesPanel campusId={data.campusId} />
          ) : null}

          {activeView === "report-cards" ? (
            <ReportCardsPanel reports={data.recentReportCards} onSelect={setSelectedReportCard} />
          ) : null}

          {activeView === "transport" ? <TransportPanel /> : null}
          {activeView === "dormitory" ? <DormitoryPanel /> : null}
          {activeView === "complaints" ? <ComplaintsPanel /> : null}
          {activeView === "phone-calls" ? <PhoneCallsPanel /> : null}
          {activeView === "postal" ? <PostalPanel /> : null}
          {activeView === "certificates" ? <CertificatesPanel /> : null}
          {activeView === "inventory" ? (
            <div className="space-y-5">
              <InventoryPanel />
              <PurchasingPanel />
            </div>
          ) : null}
          {activeView === "library" ? <LibraryPanel /> : null}
          {/* Plan buying is only in the sidebar for standalone top admins, but
              the section also lives at ?view=billing, so a campus admin could
              reach it by URL. Gate the view on the same condition as the nav
              entry. Fee management lives under the Fees view, so this view is
              plan buying only — the two never mix. */}
          {activeView === "billing"
            ? canManagePlans
              ? <div className="space-y-5"><SubscriptionLifecyclePanel /><PlansPanel /></div>
              : <RestrictedView onBack={() => setActiveView(DEFAULT_VIEW)} />
            : null}
        </div>
      </section>

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

      {showClassWizard ? (
        <QuickCreateClass
          teachers={data.teachers || []}
          classes={data.classes || []}
          onClose={() => setShowClassWizard(false)}
          onCreated={async (createdClasses: any[]) => {
            setShowClassWizard(false);
            const nextData = await loadData();
            if (createdClasses.length > 0) {
              const freshClass = (nextData?.classes || []).find(
                (c: any) => c.id === createdClasses[0].id
              );
              if (freshClass) setSelectedClass(freshClass);
            }
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
        <ClassManager
          cls={selectedClass}
          allSections={(data.classes || []).filter(
            (c: any) => classGroupKey(c) === classGroupKey(selectedClass)
          )}
          students={data.students.filter((student: any) => student.class?.id === selectedClass.id)}
          allStudents={(data.students || []).filter((student: any) =>
            (data.classes || [])
              .filter((c: any) => classGroupKey(c) === classGroupKey(selectedClass))
              .some((c: any) => c.id === student.class?.id || c.id === student.classId)
          )}
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
          onAddStudent={() => {
            openAdmissionForm(selectedClass.id);
          }}
          onViewStudent={(student) => {
            setSelectedClass(null);
            setSelectedStudent(student);
          }}
          creatingSections={creatingSections}
          onCreateSections={handleCreateSections}
          onDeleteClass={handleDeleteClass}
          onUpdateClass={handleUpdateClass}
          onDeleteSubject={handleDeleteSubject}
          onUpdateSubject={handleUpdateSubject}
          onRefresh={loadData}
        />
      ) : null}

      {selectedStudent ? (
        <StudentDetailModal
          student={selectedStudent}
          busy={savingStudentUpdate}
          sequence={studentSequence.map((s: any) => ({ id: s.id, label: s.fullName }))}
          onNavigate={(id) => {
            const next = studentSequence.find((s: any) => s.id === id);
            if (next) setSelectedStudent(next);
          }}
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
        <TeacherDetailModal
          teacher={selectedTeacher}
          sequence={teacherSequence.map((t: any) => ({ id: t.id, label: t.fullName }))}
          onNavigate={(id) => {
            const next = teacherSequence.find((t: any) => t.id === id);
            if (next) setSelectedTeacher(next);
          }}
          onClose={() => setSelectedTeacher(null)}
          onUpdate={handleUpdateTeacher}
        />
      ) : null}

      <BulkImportDialog
        open={showBulkImportModal}
        onOpenChange={setShowBulkImportModal}
        classes={data.classes || []}
        defaultClassId={bulkImportClassId || data.classes?.[0]?.id || ""}
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
        confirmLabel={confirmAction?.confirmLabel || ui("Confirm")}
        cancelLabel={confirmAction?.cancelLabel}
        tone={confirmAction?.tone ?? "danger"}
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
