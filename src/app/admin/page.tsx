"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
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
  Network,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { userMessage } from "@/lib/errors";
import { getCampusDashboardData } from "@/app/actions/dashboard";
import { cancelInvitation, removeStaff, resendInvitation } from "@/app/actions/invite";
import { RoleShell, type RoleNavItem, BrandButton } from "@/components/role-dashboard";
import type { SidebarEntry } from "@/components/role-dashboard/RoleSidebar";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { AdmissionForm } from "@/app/dashboard/students/admission-form";
import { BulkImportDialog } from "@/app/dashboard/students/bulk-import-dialog";
import { PlansPanel } from "@/components/billing/PlansPanel";
import { QuickCreateClass } from "@/components/shared-admin/quick-create-class";
import { ClassManager } from "@/components/shared-admin/class-manager";
import { AddTeacherForm } from "@/components/teacher/add-teacher-form";
import { AddStaffForm } from "@/components/staff/add-staff-form";
import { StaffHierarchyPanel } from "@/components/staff/hierarchy-panel";
import { UnifiedAttendancePanel } from "@/components/attendance/unified-attendance-panel";
import { FeesPanel } from "@/components/fees/FeesPanel";
import { TimetableStudio } from "@/components/timetable/TimetableStudio";
import { AcademicHub } from "@/components/academic/AcademicHub";
import { AcademicSubnav, ACADEMIC_VIEWS, ACADEMIC_VIEW_MODULE } from "@/components/academic/AcademicSubnav";
import { YearSetupWizard } from "@/components/academic/YearSetupWizard";
import { ExamsWorkspace } from "@/components/academic/exams/ExamsWorkspace";
import { GradingRulesPanel } from "@/components/academic/GradingRulesPanel";
import { RoomsManager } from "@/components/academic/RoomsManager";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { YearEndPanel } from "@/components/academic/YearEndPanel";
import { AcademicYearPanel } from "@/components/academic-year/AcademicYearPanel";
import { TeacherPerformancePanel } from "@/components/academic-year/TeacherPerformancePanel";
import { CycleManagementPanel } from "@/components/academic-year/CycleManagementPanel";
import { ReportCardDetailModal } from "@/components/teacher/teacher-components";
import {
  TransportPanel,
  DormitoryPanel,
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

type AdminView =
  | "leadership"
  | "classes"
  | "teachers"
  | "staff-hierarchy"
  | "students"
  | "admission-queries"
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
  | "inventory"
  | "library"
  | "academic-hub"
  | "year-setup"
  | "institution"
  ;

/** Land on the academic overview: it shows where the year stands and what to do
 *  next. Campus Control is account administration, not a daily starting point. */
import { InstitutionSettingsPanel } from "@/components/settings/InstitutionSettingsPanel";

const DEFAULT_VIEW: AdminView = "academic-hub";

const ADMIN_VIEWS: readonly AdminView[] = [
  "leadership", "classes", "teachers", "staff-hierarchy", "students", "admission-queries",
  "student-setup", "promote-archive", "leave", "permissions", "attendance",
  "ai", "fees", "timetable", "class-rooms", "period-setup", "school-calendar",
  "year-cycle", "teacher-performance", "exam-cycles", "grading-rules", "billing", "report-cards",
  "transport", "dormitory", "inventory", "library", "academic-hub", "year-setup",
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
      window.history.replaceState(null, "", `/admin?view=${activeView}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  return (
    <div className="rounded-[28px] border border-[#cfc2d6]/25 bg-white p-10 text-center shadow-[0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
        <Shield className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-black tracking-tight text-[#1f1a23]">Not available for your role</h2>
      <p className="mx-auto mt-2 max-w-sm text-xs font-semibold leading-relaxed text-ink-muted">
        Billing is managed at the school level. Ask a school administrator if you need changes to the plan.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-6 rounded-2xl bg-[#8127cf] px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:bg-[#6a1fb0] active:scale-95"
      >
        Back to overview
      </button>
    </div>
  );
}

export default function CampusAdminDashboard() {
  const router = useRouter();
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
  const [admissionQueriesVersion, setAdmissionQueriesVersion] = useState(0);
  const [studentsVersion, setStudentsVersion] = useState(0);
  const [convertingQuery, setConvertingQuery] = useState<any>(null);
  const [permMatrix, setPermMatrix] = useState<any>(null);
  const [callerRole, setCallerRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/roles/permissions")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setPermMatrix(json.data.matrix);
          setCallerRole(json.data.callerRole || null);
        }
      })
      .catch(() => {});
  }, []);

  const canViewModule = useCallback(
    (module: string) => {
      if (!callerRole || !permMatrix) return true;
      const flags = permMatrix[callerRole]?.[module];
      return flags ? flags.canView : true;
    },
    [permMatrix, callerRole]
  );

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

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

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
      (async () => {
        try {
          const res = await fetch("/api/admission-queries", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: queryId, convertedStudentId: studentId }),
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
      if (!res.ok) throw new Error(result.error || "Section could not be created");
      toast.success(
        convertClassId
          ? `"${name}" now has section "${section}" — existing students moved into it`
          : `Section "${section}" created`
      );
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
      (result.clashes || []).forEach((c: any) => toast.warning(c.message));
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
    subject: { name: string; totalMarks: number; teacherId: string; applyToAllSections?: boolean }
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
          applyToAllSections: subject.applyToAllSections || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Subject could not be created");
      toast.success(
        result.createdCount > 1 ? `Subject added to ${result.createdCount} sections` : "Subject added"
      );
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
      if (!res.ok) throw new Error(result.error || "Section could not be created");

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
          ? `${created.length} sections added to ${source.name}`
          : `Section ${input.sections[0]} added to ${source.name}`,
      );

      const nextData = await loadData();
      // Stay in the manager, on the section that was just created.
      const landing = nextData?.classes?.find((c: any) => c.id === created[0]?.id);
      if (landing) setSelectedClass(landing);
      else syncSelectedClass(nextData, source.id);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Section could not be created");
      return false;
    } finally {
      setCreatingSections(false);
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
      (result.clashes || []).forEach((c: any) => toast.warning(c.message));
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subject teacher could not be updated");
    } finally {
      setSavingSubjectId(null);
    }
  };

  // Switching to SINGLE makes the API propagate the class teacher across every
  // subject in one call, so the two can never drift out of sync.
  const handleChangeTeachingMode = async (classId: string, mode: "SINGLE" | "SUBJECT") => {
    setApplyingSubjectClassId(classId);
    try {
      const res = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, teachingMode: mode }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Teaching mode could not be updated");
      toast.success(mode === "SINGLE" ? "All subjects now follow the class teacher" : "Each subject can now have its own teacher");
      (result.clashes || []).forEach((c: any) => toast.warning(c.message));
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Teaching mode could not be updated");
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

  /*
   * Ordered by how often an admin actually needs each area: academics and
   * students first, day-to-day operations next, and account administration
   * last. Campus Control used to sit at the top even though it is a settings
   * screen most admins open once a term.
   */
  const navItems: SidebarEntry[] = [
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
        { icon: Scale, label: "Grading Rules", active: activeView === "grading-rules", onClick: () => setActiveView("grading-rules") },
        { icon: ClipboardList, label: "Report Cards", active: activeView === "report-cards", onClick: () => setActiveView("report-cards") },
      ],
    },
    {
      icon: UserCog, label: "Staff", children: [
        { icon: Users, label: "Teachers", active: activeView === "teachers", onClick: () => setActiveView("teachers") },
        { icon: Network, label: "Staff Hierarchy", active: activeView === "staff-hierarchy", onClick: () => setActiveView("staff-hierarchy") },
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
    { icon: Sparkles, label: "AI Assistant", active: activeView === "ai", onClick: () => setActiveView("ai") },
    { icon: LayoutGrid, label: "Admins & Access", active: activeView === "leadership", onClick: () => setActiveView("leadership") },
    { icon: Landmark, label: "School & Campus", active: activeView === "institution", onClick: () => setActiveView("institution") },
  ];

  // A standalone campus (single-campus school) has no separate school owner —
  // its top admin IS the school's super admin, so plan buying belongs here too.
  // In a school group, plan management stays with the owner at /dashboard/billing.
  const canManagePlans =
    data?.role === "ADMIN" || (data?.role === "CAMPUS_ADMIN" && data?.isStandaloneCampus);
  if (canManagePlans) {
    navItems.push(
      { icon: CreditCard, label: "Plans & Billing", active: activeView === "billing", onClick: () => setActiveView("billing") },
    );
  }
  const VIEW_MODULE: Record<string, string> = {
    "Academic Overview": "timetable",
    "Set Up New Year": "timetable",
    "Classes & Subjects": "timetable",
    "Class Timetable": "timetable",
    Rooms: "timetable",
    "Daily Periods": "timetable",
    "Holidays & Calendar": "timetable",
    "Exams & Results": "exams",
    "Report Cards": "reports",
    "Academic Years": "students",
    "Student List": "students",
    "Admission Enquiries": "admissions",
    "Student Categories": "students",
    "Promote Students": "students",
    Teachers: "staff",
    "Staff Hierarchy": "staff",
    Attendance: "attendance",
    "Teacher Performance": "staff",
    "Staff Leave": "leave",
    "Staff Permissions": "staff",
    Fees: "fees",
    "AI Assistant": "ai",
    "Admins & Access": "staff",
    // Was unmapped and silently fell back to the students module.
    "Plans & Billing": "accounts",
    Transport: "staff",
    Hostel: "staff",
    Inventory: "staff",
    Library: "staff",
  };
  const filteredNavItems: SidebarEntry[] = navItems
    .map((entry) => {
      if ("children" in entry) {
        const children = entry.children.filter((child) => canViewModule(VIEW_MODULE[child.label] ?? "students"));
        return children.length ? { ...entry, children } : null;
      }
      return canViewModule(VIEW_MODULE[entry.label] ?? "students") ? entry : null;
    })
    .filter(Boolean) as SidebarEntry[];

  // Appended after the permission filter on purpose: messaging is not one of
  // the permission modules, and VIEW_MODULE's fallback would have graded it
  // against "students" — hiding the inbox from anyone without roster access.
  filteredNavItems.push({ icon: MessageCircle, label: "Messages", href: "/messages" });

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

  // `return null` here rendered a blank page whenever the dashboard load
  // failed — a white screen and a toast that disappears after five seconds,
  // with no way back other than guessing to reload.
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf7fc] p-6">
        <div className="w-full max-w-sm rounded-[28px] border border-[#cfc2d6]/25 bg-white p-8 text-center shadow-[0_12px_32px_-12px_rgba(129,39,207,0.20)]">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-black tracking-tight text-[#1f1a23]">Couldn&apos;t load your dashboard</h1>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-ink-muted">
            The campus data didn&apos;t come back. This is usually temporary — try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => loadData()}
            className="mt-6 w-full rounded-2xl bg-[#8127cf] px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition-all hover:bg-[#6a1fb0] active:scale-95"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const canInvitePrincipal = !data.principal;

  return (
    <RoleShell
      tagline={data.campusName ? `${data.campusName}${data.campusCity ? ` · ${data.campusCity}` : ""}` : "Campus"}
      navItems={filteredNavItems}
      bottomItems={bottomItems}
      searchPlaceholder="Search campus records..."
      userName={data.adminName}
      userRole="School Group Campus"
      logoUrl={data.logoUrl}
      avatarSeed={data.adminEmail || data.adminName}
      dashboardHref="/admin"
      headerActions={null}
    >
      <section className="bg-white rounded-[32px] shadow-[0_2px_8px_rgba(31,26,35,0.06),0_24px_60px_-24px_rgba(31,26,35,0.35)] flex-1 relative overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 bg-[#fbf0fe]/20">
          {/* Academics is ten screens deep. This keeps them one click from each
              other instead of one sidebar expansion away. */}
          {ACADEMIC_VIEWS.has(activeView) ? (
            <AcademicSubnav
              active={activeView}
              onNavigate={(v) => setActiveView(v as AdminView)}
              allowed={(v) => canViewModule(ACADEMIC_VIEW_MODULE[v] ?? "timetable")}
            />
          ) : null}

          {activeView === "institution" ? (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Institution record</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#1f1a23]">School &amp; Campus</h2>
                <p className="mt-1.5 text-sm font-semibold text-ink-muted">
                  Name, branding and contact details. School-wide details are owned by the institution owner.
                </p>
              </div>
              {/* scope="editable" keeps a branch admin's view to their own campus
                  rather than listing every sibling campus in the group. */}
              <InstitutionSettingsPanel scope="editable" onSaved={loadData} />
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
              <YearEndPanel campusId={data.campusId} />
              <ArchivedStudentsPanel version={studentsVersion} onVersionBump={() => setStudentsVersion((v) => v + 1)} />
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
          {activeView === "inventory" ? <InventoryPanel /> : null}
          {activeView === "library" ? <LibraryPanel /> : null}
          {/* Plan buying is only in the sidebar for standalone top admins, but
              the section also lives at ?view=billing, so a campus admin could
              reach it by URL. Gate the view on the same condition as the nav
              entry. Fee management lives under the Fees view, so this view is
              plan buying only — the two never mix. */}
          {activeView === "billing"
            ? canManagePlans
              ? <PlansPanel />
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
        <div className="bg-white rounded-[32px] shadow-[0_2px_8px_rgba(31,26,35,0.06),0_24px_60px_-24px_rgba(31,26,35,0.35)] flex-1 overflow-hidden p-5">
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
