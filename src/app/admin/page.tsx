"use client";

/**
 * The Campus console (CAMPUS_ADMIN, and an ADMIN of a school group) and, for the ADMIN of a single school,
 * the School console: the same daily campus work plus the "Your school" group (Billing & plan, Approvals,
 * People & access, School settings). The variant is decided by the server-computed capability keys
 * (`standaloneOwner`, `billing`, `institutionAuthority`, …), never by role or campus count.
 *
 * Navigation, the eyebrow, mobile slots and the access fence come from the registry
 * (`src/lib/navigation/role-nav.ts`, console "admin"); this page renders one view at a time with exactly
 * one PageHeader, at most one primary action, and in-view tabs synced to `?tab=`.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  BadgeCheck,
  Bus,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  Compass,
  ConciergeBell,
  Contact,
  CreditCard,
  Download,
  Eye,
  FileCheck2,
  FileText,
  GraduationCap,
  History,
  Inbox,
  Landmark,
  Library,
  ListChecks,
  Network,
  Package,
  Plane,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  School,
  Settings,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  BedDouble,
  ArrowRightLeft,
  Award,
  Banknote,
  type LucideIcon,
} from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/errors";
import { downloadCSV } from "@/lib/csv";
import { getCampusDashboardData } from "@/app/actions/dashboard";
import { cancelInvitation, removeStaff, resendInvitation } from "@/app/actions/invite";
import { RoleShell } from "@/components/role-dashboard";
import { CommandCentreSkeleton, PAGE_CARD_BODY, PageSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { useConsoleView, WORKSPACE_VIEW_CHANGE } from "@/components/nav/useConsoleView";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { leafForView, labelFor } from "@/lib/navigation/role-nav";
import { PageHeader, type PageAction } from "@/components/ui/page-header";
import { ViewTabs, type ViewTabItem } from "@/components/ui/view-tabs";
import { AccessNotice } from "@/components/ui/access-notice";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { DegradedNotice } from "@/components/role-dashboard/DegradedNotice";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { FlagshipCard } from "@/components/ui/flagship";
import { cn } from "@/lib/utils";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { ActionQueue } from "@/components/principal/action-queue";
import { CampusOverview } from "@/components/insights";
import { PurchasingPanel } from "@/components/purchasing/purchasing-panel";
import { LearningActions } from "@/components/learning/learning-actions";
import { PolicyManager } from "@/components/policies/policy-manager";
import { AdmissionsDesk } from "@/components/admissions/admissions-desk";
import { GuardianAccessManager } from "@/components/GuardianAccessManager";
import { ConsentStatusPanel } from "@/components/family/guardian-consent";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";
import { CampusPackagesPanel, CanteenPanel } from "@/components/campus-packages/campus-packages";
import { AdmissionForm } from "@/components/students/admission-form";
import { BulkImportDialog } from "@/components/students/bulk-import-dialog";
import { QuickCreateClass } from "@/components/shared-admin/quick-create-class";
import { ClassManager } from "@/components/shared-admin/class-manager";
import { ArchivedClassesPanel } from "@/components/shared-admin/archived-classes-panel";
import { classArchiveText, studentArchiveText, fetchAcademicImpact, subjectRemovalText, teacherChangeText } from "@/components/shared-admin/academic-impact";
import { AddTeacherForm } from "@/components/teacher/add-teacher-form";
import { AddStaffForm } from "@/components/staff/add-staff-form";
import { StaffHierarchyPanel, STAFF_STRUCTURE_TABS, type StaffStructureTab } from "@/components/staff/hierarchy-panel";
import { AuditHistoryModal } from "@/components/audit/audit-history-modal";
import { UnifiedAttendancePanel, type AttendanceTab } from "@/components/attendance/unified-attendance-panel";
import { FeesPanel, feeTabItems } from "@/components/fees/FeesPanel";
import type { FeeTab } from "@/components/fees/fee-types";
import { TimetableStudio, type TimetableCommand, type TimetableDraftState } from "@/components/timetable/TimetableStudio";
import type { YearCloseCommand, YearClosureState } from "@/components/academic/YearClosureChecklist";
import { AcademicHub } from "@/components/academic/AcademicHub";
import { YearSetupWizard } from "@/components/academic/YearSetupWizard";
import { ExamsWorkspace } from "@/components/academic/exams/ExamsWorkspace";
import { GradingRulesPanel } from "@/components/academic/GradingRulesPanel";
import { AcademicModelPanel } from "@/components/academic/AcademicModelPanel";
import { RoomsManager } from "@/components/academic/RoomsManager";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { YearEndPanel } from "@/components/academic/YearEndPanel";
import { RolloverReview } from "@/components/academic/rollover-review";
import { ReportCardPipeline, type ReportSelectionState } from "@/components/academic/ReportCardPipeline";
import { AcademicYearPanel } from "@/components/academic-year/AcademicYearPanel";
import { TeacherPerformancePanel } from "@/components/academic-year/TeacherPerformancePanel";
import { CycleManagementPanel } from "@/components/academic-year/CycleManagementPanel";
import { QuestionNetwork } from "@/components/question-network/question-network";
import { EngagementPanel, type EngagementCommand } from "@/components/communications/engagement-panel";
import { TransportPanel, DormitoryPanel, InventoryPanel, LibraryPanel } from "@/components/operations";
import { ComplaintsDesk } from "@/components/operations/complaints-desk";
import { CertificatesDesk } from "@/components/operations/certificates-desk";
import { VisitorRegister } from "@/components/operations/visitor-register";
import { PhoneCallLog } from "@/components/operations/phone-call-log";
import { PostalRegister } from "@/components/operations/postal-register";
import { LendingDesk } from "@/components/library/lending-desk";
import { PickupGate } from "@/components/pickup/pickup";
import { PayrollRunsPanel } from "@/components/payroll/payroll-runs-panel";
import { TaxPackages } from "@/components/tax/tax-packages";
import { CampusPolicy } from "@/components/group-policy/group-policy";
import { SubscriptionWorkspace } from "@/components/billing/SubscriptionWorkspace";
import { SupportApprovalsPanel } from "@/components/institution/support-approvals";
import { MembershipsPanel } from "@/components/memberships/memberships-panel";
import { AuditHistoryPanel } from "@/components/audit/audit-history-panel";
import { IdentityAdmin } from "@/components/identity/identity-admin";
import { Integrations } from "@/components/integrations/integrations";
import { WhatsAppConnectionPanel } from "@/components/whatsapp/whatsapp-connection-panel";
import { ManagedSendingPanel } from "@/components/whatsapp/managed-sending-panel";
import { DataLifecyclePanel } from "@/components/settings/DataLifecyclePanel";
import { ReadinessHome } from "@/components/readiness/ReadinessHome";
import { LocaleSettingsPanel } from "@/components/settings/LocaleSettingsPanel";
import { InstitutionSettingsPanel } from "@/components/settings/InstitutionSettingsPanel";
import {
  AcademicPanel,
  AdmissionQueriesPanel,
  AIPanel,
  ArchivedStudentsPanel,
  exportStudentsToCSV,
  classGroupKey,
  FacultyPanel,
  groupClasses,
  LeadershipPanel,
  LeaveManagementPanel,
  MoveStudentModal,
  PeriodsPanel,
  RolePermissionsPanel,
  StudentDetailModal,
  StudentsPanel,
  StudentSetupPanel,
  TeacherConflictsBanner,
  TeacherDetailModal,
  classLabel,
} from "@/components/shared-admin";
import { AI_COMPOSER_INPUT_ID } from "@/components/ai-workflows/AiWorkflowsHome";
import { readApiError } from "@/lib/api/envelope-client";

/* ────────────────────────── Session (names for "Managed by" copy) ────────────────────────── */

type ConsoleInstitution = {
  kind?: "GROUP" | "STANDALONE";
  isAuthority?: boolean;
  standaloneOwner?: boolean;
  isOwner?: boolean;
  schoolName?: string | null;
  authorityName?: string | null;
  subscriptionOwnerName?: string | null;
};
type ConsoleSession = {
  id: string;
  fullName: string;
  email: string;
  schoolName: string | null;
  campusName: string | null;
  institution?: ConsoleInstitution;
};

/** The signed-in person and their institution names. Never an email in "Managed by" copy (§1.5). */
function useConsoleSession(): ConsoleSession | null {
  const [session, setSession] = useState<ConsoleSession | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { if (live && json?.user) setSession(json.user as ConsoleSession); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  return session;
}

/** A suspended school answers the loader with a 402. In development the message says so (G51 wording). */
function looksSuspended(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return /suspend|paused|402|SUBSCRIPTION_SUSPENDED/i.test(text);
}

/**
 * Production builds strip server-action error messages, so the loader failure alone cannot say "suspended".
 * Any school API that is not on the suspended allow-list answers 402 with `code: "SUBSCRIPTION_SUSPENDED"`
 * from the proxy while the school is paused; a HEAD request is the cheapest way to ask.
 */
async function probeSuspended(): Promise<boolean> {
  try {
    const response = await fetch("/api/classes", { method: "HEAD", cache: "no-store" });
    return response.status === 402;
  } catch {
    return false;
  }
}

/**
 * Replaces the current history entry with another view of this console. A redirect (an old address that now lives
 * elsewhere) must not leave a Back step that bounces straight forward again (§3.1).
 */
function replaceConsoleView(view: string, tab?: string | null) {
  const params = new URLSearchParams(window.location.search);
  params.set("view", view);
  if (tab) params.set("tab", tab);
  else params.delete("tab");
  window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  window.dispatchEvent(new Event(WORKSPACE_VIEW_CHANGE));
}

/**
 * P1 need (report): `removeStaff(userId, reason?)` records the typed reason in its audit row. Until it does, the
 * server action ignores the extra argument; the reason is still asked for, because revoking access is a
 * membership decision (R3, §4.5.5).
 */
const revokeStaff = removeStaff as (userId: string, reason?: string) => ReturnType<typeof removeStaff>;

/**
 * Staff rows hand over either a readable label ("Admin", "Teacher") or the raw role ("ACCOUNTANT"); the
 * confirm dialog and toast always show the readable one.
 */
const STAFF_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Campus admin",
  CAMPUS_ADMIN: "Campus admin",
  Admin: "Campus admin",
  PRINCIPAL: "Principal",
  TEACHER: "Teacher",
  ACCOUNTANT: "Accountant",
  LIBRARIAN: "Librarian",
  RECEPTIONIST: "Receptionist",
};

type StaffInviteRole = "CAMPUS_ADMIN" | "PRINCIPAL" | "ACCOUNTANT" | "LIBRARIAN" | "RECEPTIONIST";

/** AI features offered on the admin AI assistant (campus-level; academic ones only for the academic lead). */
const ADMIN_AI_FEATURES = [
  { feature: "at_risk_students", label: "At-risk students", placeholder: "Class, exam, or attendance focus" },
  { feature: "class_performance_summary", label: "Class summary", placeholder: "Class or term" },
  { feature: "teacher_class_comparison", label: "Class comparison", placeholder: "Classes or teachers to compare" },
  { feature: "intervention_suggestions", label: "Intervention", placeholder: "Student or class concern" },
  { feature: "pending_review_queue", label: "Review queue", placeholder: "Optional priority note" },
];

export default function CampusConsolePage() {
  const ui = useUiText();
  const { view, tab, setView, setTab, retiredNotice } = useConsoleView("admin");
  const session = useConsoleSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<{ suspended: boolean } | null>(null);
  const [showClassWizard, setShowClassWizard] = useState(false);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [admissionClassId, setAdmissionClassId] = useState("");
  const [bulkImportClassId, setBulkImportClassId] = useState("");
  const [movingStudent, setMovingStudent] = useState<any>(null);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  // Set when a category or group card asks to see its students, cleared as soon as the roster has taken
  // it — a hand-off, not a sticky filter.
  const [rosterFilter, setRosterFilter] = useState<{ categoryId?: string; groupId?: string } | null>(null);
  // What the roster / faculty list is showing, so a profile dialog can page through the same set.
  const [studentSequence, setStudentSequence] = useState<any[]>([]);
  const [teacherSequence, setTeacherSequence] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [inviteRole, setInviteRole] = useState<StaffInviteRole | null>(null);
  const [showInviteChooser, setShowInviteChooser] = useState(false);
  const [moveClassId, setMoveClassId] = useState("");
  const [movingStudentBusy, setMovingStudentBusy] = useState(false);
  const [savingClassTeacherId, setSavingClassTeacherId] = useState<string | null>(null);
  const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
  const [creatingSubjectClassId, setCreatingSubjectClassId] = useState<string | null>(null);
  const [creatingSections, setCreatingSections] = useState(false);
  const [applyingSubjectClassId, setApplyingSubjectClassId] = useState<string | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showAddTeacherForm, setShowAddTeacherForm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: "danger" | "warning" | "primary";
    /** A typed reason for decisions that need one (R3: permissions, membership, money). */
    requireReason?: { label: string; minLength?: number };
    run: (reason?: string) => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [savingClassUpdate, setSavingClassUpdate] = useState(false);
  const [savingStudentUpdate, setSavingStudentUpdate] = useState(false);
  const [savingSubjectUpdateId, setSavingSubjectUpdateId] = useState<string | null>(null);
  const [admissionQueriesVersion, setAdmissionQueriesVersion] = useState(0);
  const [studentsVersion, setStudentsVersion] = useState(0);
  const [convertingQuery, setConvertingQuery] = useState<any>(null);
  const [guardianAddRequest, setGuardianAddRequest] = useState(0);

  // R4: a load failure is an inline ErrorState with retry (never a toast, never a forced sign-out).
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const nextData = await getCampusDashboardData();
      setData(nextData);
      setLoadFailure(null);
      return nextData;
    } catch (error) {
      setLoadFailure({ suspended: looksSuspended(error) || (await probeSuspended()) });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Exports exactly what the directory is showing, so a filtered view exports the filtered roster.
  const exportStudentsCSV = (visible?: any[]) => exportStudentsToCSV(visible ?? data?.students ?? [], data?.campusName);

  const exportTeachersCSV = () => {
    const teachers: any[] = data?.teachers ?? [];
    if (!teachers.length) {
      toast.error(ui("Nothing to export yet."));
      return;
    }
    downloadCSV(`${(data?.campusName || "campus").replace(/\s+/g, "_")}_teachers.csv`, [
      [ui("Name"), ui("Email"), ui("Phone"), ui("Subjects"), ui("Classes led")],
      ...teachers.map((t) => [
        t.fullName,
        t.email,
        t.phone || "",
        t._count?.taughtSubjects ?? t.taughtSubjects?.length ?? 0,
        t._count?.ledClasses ?? t.ledClasses?.length ?? 0,
      ]),
    ]);
    toast.success(ui("{0} teachers exported", [teachers.length]));
  };

  const openAdmissionForm = (classId?: string) => {
    setAdmissionClassId(classId || "");
    setConvertingQuery(null);
    setShowAdmissionForm(true);
  };

  const openBulkImport = (classId?: string) => {
    setBulkImportClassId(classId || "");
    setShowBulkImportModal(true);
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
    // Close the modal immediately so the student-creation toast isn't stranded behind the (slow) "mark
    // query converted" PATCH and the campus-wide refresh. Those run in the background.
    setShowAdmissionForm(false);
    const studentId = createdStudent?.id;
    if (convertingQuery && studentId) {
      const queryId = convertingQuery.id;
      setConvertingQuery(null);
      // The student already exists at this point, so a failure here is only about the enquiry.
      const notConverted = ui("The student was added, but the enquiry could not be marked as converted.");
      (async () => {
        try {
          const res = await fetch("/api/admission-queries", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: queryId, convertedStudentId: studentId }),
          });
          const result = await res.json();
          if (res.ok) {
            toast.success(ui("Enquiry marked as converted for {0}", [createdStudent.fullName]));
          } else {
            toast.error(friendlyErrorMessage(apiErrorMessage(result.error, ""), notConverted));
          }
        } catch {
          toast.error(notConverted);
        }
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
      // Converting: the class had no sections, so rename that row rather than spawning a sibling and
      // stranding its students on an unnamed class.
      const res = convertClassId
        ? await fetch("/api/classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: convertClassId, section }) })
        : await fetch("/api/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, section, sections: [section], academicYear }) });
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

  const reportClashes = (clashes: any[] | undefined) => {
    (clashes || []).forEach((c: any) => toast.warning(c?.teacherName && c?.label ? ui("{0} already teaches at {1}", [c.teacherName, c.label]) : ui("This teacher already has a lesson at this time")));
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
      reportClashes(result.clashes);
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
      toast.success(result.createdCount > 1 ? ui("Subject added to {0} sections", [result.createdCount]) : ui("Subject added"));
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
   * Add one or more sections to a class that already exists. Sections are created against the existing
   * class name and year, and can carry a copy of another section's subjects.
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
      // Copy the chosen section's subjects across, with bounded concurrency (the database sits behind a pooler).
      const cloneFrom = input.cloneFromClassId ? (data?.classes || []).find((c: any) => c.id === input.cloneFromClassId) : null;
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
                body: JSON.stringify({ classId: cls.id, name: subject.name, totalMarks: subject.totalMarks || 100, teacherId: subject.teacher?.id || undefined }),
              });
            });
          }
        }
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, async () => { while (cursor < jobs.length) await jobs[cursor++](); }));
      }
      toast.success(
        created.length > 1
          ? ui("{0} sections added to {1}", [created.length, source.name])
          : ui("Section {0} added to {1}", [input.sections[0], source.name]),
      );
      const nextData = await loadData();
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
      reportClashes(result.clashes);
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    } finally {
      setSavingSubjectId(null);
    }
  };

  const handleChangeSubjectTeacher = async (classId: string, subjectId: string, teacherId: string, effectiveFrom?: string) => {
    // SKO-462: a scheduled or already-marked subject shows what moves before the teacher changes.
    const impact = await fetchAcademicImpact("subject", subjectId).catch(() => null);
    if (impact && (impact.counts.timetableSlots || impact.counts.marks)) {
      setConfirmAction({
        title: ui("Change the teacher of {0}?", [impact.label]),
        description: teacherChangeText(impact, ui, effectiveFrom),
        confirmLabel: ui("Change teacher"),
        tone: "warning",
        run: async () => { await saveSubjectTeacher(classId, subjectId, teacherId, effectiveFrom); },
      });
      return;
    }
    await saveSubjectTeacher(classId, subjectId, teacherId, effectiveFrom);
  };

  // Switching to SINGLE makes the API propagate the class teacher across every subject in one call.
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
      reportClashes(result.clashes);
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    } finally {
      setApplyingSubjectClassId(null);
    }
  };

  const handleStaffAdded = async () => {
    setInviteRole(null);
    await loadData();
  };

  const handleRemove = async (userId: string, label: string) => {
    if (userId === data?.currentUserId) {
      toast.info(ui("Your own account stays active so this campus remains manageable."));
      return;
    }
    const roleLabel = ui(STAFF_ROLE_LABELS[label] ?? label);
    setConfirmAction({
      title: ui("Revoke {0} access?", [roleLabel]),
      // removeStaff deactivates the account and ends its sessions; nothing is deleted.
      description: ui("They will be signed out and can no longer use this campus workspace. Their records are kept."),
      confirmLabel: ui("Revoke access"),
      cancelLabel: ui("Keep access"),
      requireReason: { label: ui("Why are you revoking access?"), minLength: 10 },
      run: async (reason) => {
        await revokeStaff(userId, reason);
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

  const runConfirmedAction = async (reason?: string) => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction.run(reason);
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
      confirmLabel: enrolled ? ui("Close") : ui("Archive class"),
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
    } catch (error) { toast.error(friendlyErrorMessage(error, ui("Could not calculate student impact"))); return; }
    setConfirmAction({
      title: ui("Archive {0}?", [student.fullName]),
      description: studentArchiveText(student.fullName, preview.dependencies || {}, ui),
      confirmLabel: ui("Archive student"),
      tone: "warning",
      run: async () => {
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
      confirmLabel: blocked ? ui("Close") : ui("Delete subject"),
      tone: blocked ? "primary" : "danger",
      run: async () => {
        if (blocked) return;
        const res = await fetch(`/api/subjects?id=${subject.id}`, { method: "DELETE" });
        const result = await res.json();
        if (!res.ok) throw new Error(apiErrorMessage(result.error, ui("Could not delete the subject. Please try again.")));
        toast.success(ui("Subject deleted"));
        await loadData();
      },
    });
  };

  const handleUpdateClass = async (classId: string, updates: { name?: string; section?: string; academicYear?: number }): Promise<boolean> => {
    setSavingClassUpdate(true);
    const failed = ui("Could not save the class changes. Please try again.");
    try {
      const res = await fetch("/api/classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: classId, ...updates }) });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Class updated"));
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
      return true;
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
      return false;
    } finally {
      setSavingClassUpdate(false);
    }
  };

  const handleUpdateStudent = async (studentId: string, updates: Record<string, any>) => {
    setSavingStudentUpdate(true);
    const failed = ui("Could not save the student's changes. Please try again.");
    try {
      const res = await fetch("/api/students", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: studentId, ...updates }) });
      const result = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(result.error, failed));
      toast.success(ui("Student updated"));
      setSelectedStudent((current: any) => (current?.id === studentId ? { ...current, ...result.data } : current));
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
      const res = await fetch("/api/subjects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subjectId, ...updates }) });
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
      const res = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: teacherId, ...updates }) });
      const result = await res.json();
      if (!res.ok) throw new Error(readApiError(result, failed));
      toast.success(ui("Teacher updated"));
      setSelectedTeacher((current: any) => (current?.id === teacherId ? { ...current, ...result.data } : current));
      await loadData();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
    }
  };

  /** M34: StudentDetailModal "Guardians" → `?view=guardians&student=<id>`. */
  const openGuardiansFor = (studentId: string) => {
    setView("guardians");
    // setView keeps only shell params; the student lands as a follow-up param on the same entry.
    const params = new URLSearchParams(window.location.search);
    params.set("student", studentId);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}`);
    window.dispatchEvent(new Event("skoolee:workspace-view-change"));
  };

  // F3: Billing & plan renders before, and independent of, the campus loader, so a suspended school's
  // payer reaches it from the console. Every other view waits for the campus data.
  const billingFirst = view === "billing";
  if (loading && !data && !billingFirst) {
    // The first paint: the shell's furniture plus a body shaped like the view being opened (addendum 3).
    return (
      <RoleShellSkeleton navRows={9} label={ui("Loading your console")}>
        {view === "overview" ? <CommandCentreSkeleton tiles={4} /> : <PageSkeleton />}
      </RoleShellSkeleton>
    );
  }

  const campusName = data?.campusName ?? session?.campusName ?? null;
  const tagline = campusName ? `${campusName}${data?.campusCity ? ` · ${data.campusCity}` : ""}` : ui("Campus");

  const ctx: AdminCtx = {
    data,
    loading,
    loadFailure,
    session,
    view,
    tab,
    setView,
    setTab,
    retiredNotice,
    reload: loadData,
    openAdmissionForm,
    openBulkImport,
    openConvertQuery,
    openClassWizard: () => setShowClassWizard(true),
    openAddTeacher: () => setShowAddTeacherForm(true),
    openInviteChooser: () => setShowInviteChooser(true),
    openInvite: (role) => setInviteRole(role),
    exportStudentsCSV,
    exportTeachersCSV,
    viewStudent: (student, visible) => { setSelectedStudent(student); setStudentSequence(visible || []); },
    viewTeacher: (teacher, visible) => { setSelectedTeacher(teacher); setTeacherSequence(visible || []); },
    viewClass: setSelectedClass,
    rosterFilter,
    setRosterFilter,
    admissionQueriesVersion,
    bumpAdmissionQueries: () => setAdmissionQueriesVersion((v) => v + 1),
    studentsVersion,
    bumpStudents: () => setStudentsVersion((v) => v + 1),
    guardianAddRequest,
    requestGuardianAdd: () => setGuardianAddRequest((v) => v + 1),
    handleChangeClassTeacher,
    handleDeleteClass,
    handleUpdateClass,
    handleDeleteSubject,
    handleUpdateSubject,
    handleAddSection,
    handleRemove,
    handleResendInvite,
    handleCancelInvite,
  };

  return (
    <RoleShell
      console="admin"
      activeView={view}
      onSelectView={setView}
      tagline={tagline}
      userName={data?.adminName ?? session?.fullName}
      logoUrl={data?.logoUrl}
      avatarSeed={data?.adminEmail || data?.adminName || session?.email}
      dashboardHref="/admin"
      // K-I14: no chat stream opens until the campus loader has answered, so the suspended minimal shell (and the
      // billing view rendered before the loader, F3) never opens one.
      chatDock={Boolean(data) && !loadFailure?.suspended}
    >
      {/* Addendum 2026-10-22: RoleShell draws the one page card (and owns #workspace-content); the console only
          supplies the card's scrolling body with the shared padding, so nothing double-wraps. */}
      <div data-admin-workspace className={cn("custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto", PAGE_CARD_BODY)}>
        {data?.degraded?.length ? <div className="mb-4"><DegradedNotice degraded={data.degraded} onRetry={() => void loadData()} /></div> : null}
        <AdminWorkspace ctx={ctx} />
      </div>

      {data && inviteRole ? <AddStaffForm role={inviteRole} onSuccess={handleStaffAdded} onClose={() => setInviteRole(null)} /> : null}

      {showInviteChooser ? (
        <InviteStaffChooser
          onClose={() => setShowInviteChooser(false)}
          onChoose={(role) => { setShowInviteChooser(false); setInviteRole(role); }}
        />
      ) : null}

      {data && showClassWizard ? (
        <QuickCreateClass
          teachers={data.teachers || []}
          classes={data.classes || []}
          onClose={() => setShowClassWizard(false)}
          onCreated={async (createdClasses: any[]) => {
            setShowClassWizard(false);
            const nextData = await loadData();
            if (createdClasses.length > 0) {
              const freshClass = (nextData?.classes || []).find((c: any) => c.id === createdClasses[0].id);
              if (freshClass) setSelectedClass(freshClass);
            }
          }}
        />
      ) : null}

      {data && showAdmissionForm ? (
        <AdmissionForm
          classes={data.classes || []}
          classGroups={groupClasses(data.classes || [])}
          initialClassId={admissionClassId || undefined}
          initialPrefill={convertingQuery ? { fullName: convertingQuery.name, guardianPhone: convertingQuery.phone, guardianEmail: convertingQuery.email || "" } : undefined}
          onSuccess={handleAdmissionSuccess}
          onClose={() => setShowAdmissionForm(false)}
        />
      ) : null}

      {data && showAddTeacherForm ? (
        <AddTeacherForm
          onSuccess={() => { setShowAddTeacherForm(false); loadData(); }}
          onClose={() => setShowAddTeacherForm(false)}
        />
      ) : null}

      {data && movingStudent ? (
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

      {data && selectedClass ? (
        <ClassManager
          cls={selectedClass}
          allSections={(data.classes || []).filter((c: any) => classGroupKey(c) === classGroupKey(selectedClass))}
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
          onAddStudent={() => openAdmissionForm(selectedClass.id)}
          onViewStudent={(student) => { setSelectedClass(null); setSelectedStudent(student); }}
          creatingSections={creatingSections}
          onCreateSections={handleCreateSections}
          onDeleteClass={handleDeleteClass}
          onUpdateClass={handleUpdateClass}
          onDeleteSubject={handleDeleteSubject}
          onUpdateSubject={handleUpdateSubject}
          onRefresh={loadData}
        />
      ) : null}

      {data && selectedStudent ? (
        <StudentDetailModal
          student={selectedStudent}
          busy={savingStudentUpdate}
          sequence={studentSequence.map((s: any) => ({ id: s.id, label: s.fullName }))}
          onNavigate={(id) => {
            const next = studentSequence.find((s: any) => s.id === id);
            if (next) setSelectedStudent(next);
          }}
          onClose={() => setSelectedStudent(null)}
          onMove={() => { openMoveStudent(selectedStudent); setSelectedStudent(null); }}
          onDelete={handleDeleteStudent}
          onUpdate={handleUpdateStudent}
          onOpenGuardians={() => {
            const id = selectedStudent.id;
            setSelectedStudent(null);
            openGuardiansFor(id);
          }}
        />
      ) : null}

      {data && selectedTeacher ? (
        <TeacherDetailModal
          teacher={selectedTeacher}
          showStaffRecord
          sequence={teacherSequence.map((t: any) => ({ id: t.id, label: t.fullName }))}
          onNavigate={(id) => {
            const next = teacherSequence.find((t: any) => t.id === id);
            if (next) setSelectedTeacher(next);
          }}
          onClose={() => setSelectedTeacher(null)}
          onUpdate={handleUpdateTeacher}
        />
      ) : null}

      {data ? (
        <BulkImportDialog
          open={showBulkImportModal}
          onOpenChange={setShowBulkImportModal}
          classes={data.classes || []}
          defaultClassId={bulkImportClassId || data.classes?.[0]?.id || ""}
          onSuccess={loadData}
        />
      ) : null}

      <ConfirmAction
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ""}
        description={confirmAction?.description || ""}
        confirmLabel={confirmAction?.confirmLabel || ui("Confirm")}
        cancelLabel={confirmAction?.cancelLabel ?? ui("Keep editing")}
        tone={confirmAction?.tone ?? "danger"}
        busy={confirmBusy}
        requireReason={confirmAction?.requireReason}
        onCancel={() => setConfirmAction(null)}
        onConfirm={(reason) => runConfirmedAction(reason)}
      />

    </RoleShell>
  );

}

/* ────────────────────────── Workspace (inside RoleShell, so access is available) ────────────────────────── */

interface AdminCtx {
  data: any;
  loading: boolean;
  loadFailure: { suspended: boolean } | null;
  session: ConsoleSession | null;
  view: string;
  tab: string | null;
  setView: (view: string, tab?: string | null) => void;
  setTab: (tab: string | null) => void;
  retiredNotice: string | null;
  reload: () => Promise<any>;
  openAdmissionForm: (classId?: string) => void;
  openBulkImport: (classId?: string) => void;
  openConvertQuery: (query: any) => void;
  openClassWizard: () => void;
  openAddTeacher: () => void;
  openInviteChooser: () => void;
  openInvite: (role: StaffInviteRole) => void;
  exportStudentsCSV: (visible?: any[]) => void;
  exportTeachersCSV: () => void;
  viewStudent: (student: any, visible?: any[]) => void;
  viewTeacher: (teacher: any, visible?: any[]) => void;
  viewClass: (cls: any) => void;
  rosterFilter: { categoryId?: string; groupId?: string } | null;
  setRosterFilter: (filter: { categoryId?: string; groupId?: string } | null) => void;
  admissionQueriesVersion: number;
  bumpAdmissionQueries: () => void;
  studentsVersion: number;
  bumpStudents: () => void;
  guardianAddRequest: number;
  requestGuardianAdd: () => void;
  handleChangeClassTeacher: (classId: string, teacherId: string) => Promise<void>;
  handleDeleteClass: (cls: any) => Promise<void>;
  handleUpdateClass: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<boolean>;
  handleDeleteSubject: (subject: any) => Promise<void>;
  handleUpdateSubject: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
  handleAddSection: (name: string, section: string, academicYear: number, convertClassId?: string) => Promise<void>;
  handleRemove: (userId: string, label: string) => Promise<void>;
  handleResendInvite: (inviteId: string) => Promise<void>;
  handleCancelInvite: (inviteId: string) => Promise<void>;
}

/** Capability keys whose value changes a registry label (`labelWhen`) in this console. */
const LABEL_KEYS = ["standaloneOwner"] as const;

function ViewFrame({
  title,
  description,
  icon,
  primaryAction,
  secondaryActions,
  status,
  tabs,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  primaryAction?: PageAction;
  secondaryActions?: PageAction[];
  status?: React.ReactNode;
  tabs?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeader title={title} description={description} icon={icon} primaryAction={primaryAction} secondaryActions={secondaryActions} status={status} tabs={tabs} />
      {children}
    </div>
  );
}

/** Picks the visible tab: the URL's `?tab=` when it is one of them, else the first visible tab. */
function pickTab(items: ViewTabItem[], requested: string | null): string {
  const visible = items.filter((item) => !item.hidden);
  return visible.some((item) => item.id === requested) ? (requested as string) : visible[0]?.id ?? "";
}

function AdminWorkspace({ ctx }: { ctx: AdminCtx }) {
  const ui = useUiText();
  const { language } = useLocale();
  const access = useConsoleAccess();
  const has = access.has;
  const { data, setView, setTab, session } = ctx;
  // SO's school profile lives in School settings; Campus setup never shows a second copy (§3.1). The old address
  // (`settings&tab=profile`) renders School settings at once and is replaced in history before paint, so Back never
  // bounces forward and Year setup never flashes.
  const standaloneOwner = has("standaloneOwner");
  const profileRedirect = ctx.view === "settings" && ctx.tab === "profile" && standaloneOwner;
  useLayoutEffect(() => {
    if (profileRedirect) replaceConsoleView("school-settings", "profile");
  }, [profileRedirect]);
  const view = profileRedirect ? "school-settings" : ctx.view;
  const tab = profileRedirect ? "profile" : ctx.tab;
  const authorityName = session?.institution?.authorityName ?? null;
  const subscriptionOwnerName = session?.institution?.subscriptionOwnerName ?? null;

  const labelAccess = useMemo(() => Object.fromEntries(LABEL_KEYS.map((key) => [key, has(key)])) as Record<string, boolean>, [has]);
  // Header commands handed to the panel that owns the flow ("Record payment", "New enquiry", …). A command is
  // scoped to the view/tab that sent it, so a panel mounted later never replays another screen's command.
  const [panelCommand, setPanelCommand] = useState<{ scope: string; id: string; nonce: number } | null>(null);
  const sendCommand = useCallback((scope: string, id: string) => setPanelCommand({ scope, id, nonce: Date.now() }), []);
  const commandFor = (scope: string) => (panelCommand?.scope === scope ? panelCommand : null);
  // Learned from the panels that own the data behind a header action's enabled state.
  const [publishedForms, setPublishedForms] = useState<number | null>(null);
  const [canAddMeal, setCanAddMeal] = useState(false);
  // Counter-style requests for panels that take them (each change runs once; the first render never fires).
  const [requests, setRequests] = useState<Record<string, number>>({});
  const bump = useCallback((key: string) => setRequests((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 })), []);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  // §4.4b host-owned headers for the academic lead's Timetable (Publish when a draft exists · Print · Unpublish)
  // and Academic year (Close year · Checklist · Refresh · Close anyway…), driven through the panels' commands.
  const [timetableCommand, setTimetableCommand] = useState<TimetableCommand | undefined>(undefined);
  const [timetableState, setTimetableState] = useState<TimetableDraftState | null>(null);
  const onTimetableState = useCallback((_hasDraft: boolean, state: TimetableDraftState) => setTimetableState(state), []);
  const runTimetable = (id: TimetableCommand["id"]) => setTimetableCommand((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  const [yearCommand, setYearCommand] = useState<YearCloseCommand | undefined>(undefined);
  const [closure, setClosure] = useState<YearClosureState | null>(null);
  const runYear = (id: YearCloseCommand["id"]) => setYearCommand((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  // Family communication (§4.4b): Run reminders (the panel confirms it) · Export, with Refresh in the overflow.
  const [engagementCommand, setEngagementCommand] = useState<EngagementCommand | undefined>(undefined);
  const runEngagement = (id: EngagementCommand["id"]) => setEngagementCommand((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  // A header command belongs to the screen it was pressed on: leaving the view drops every pending command, so a
  // panel that mounts again later never replays one (state adjusted while rendering, React's documented pattern).
  const [commandView, setCommandView] = useState(view);
  if (commandView !== view) {
    setCommandView(view);
    setPanelCommand(null);
    setTimetableCommand(undefined);
    setYearCommand(undefined);
    setEngagementCommand(undefined);
  }
  // Report cards (§4.4b): the lead approves the versions ticked across every exam from the PageHeader; the office
  // queues delivery from it when one exam is in question (the linked `?exam=` or the only one).
  const [reportSelections, setReportSelections] = useState<Record<string, ReportSelectionState>>({});
  const onReportSelection = useCallback((state: ReportSelectionState) => {
    setReportSelections((previous) => {
      const known = previous[state.examId];
      if (known && known.selected === state.selected && known.canApprove === state.canApprove && known.reason === state.reason) return previous;
      return { ...previous, [state.examId]: state };
    });
  }, []);
  const [deliveryStates, setDeliveryStates] = useState<Record<string, { canGenerate: boolean; canDeliver: boolean }>>({});
  const onDeliveryState = useCallback((state: { examId: string; canGenerate: boolean; canDeliver: boolean }) => {
    setDeliveryStates((previous) => {
      const known = previous[state.examId];
      if (known && known.canGenerate === state.canGenerate && known.canDeliver === state.canDeliver) return previous;
      return { ...previous, [state.examId]: { canGenerate: state.canGenerate, canDeliver: state.canDeliver } };
    });
  }, []);
  // Year end (§4.4b): "Archive year" is offered only while a cycle is active, since the panel has nothing to archive
  // otherwise (§4.5.11: no control that does nothing). The same read the panel makes; null until it answers.
  const yearEndCampusId = data?.campusId ?? null;
  const [hasActiveCycle, setHasActiveCycle] = useState<boolean | null>(null);
  useEffect(() => {
    if (view !== "promote-archive") return;
    let live = true;
    const query = yearEndCampusId ? `?campusId=${encodeURIComponent(yearEndCampusId)}` : "";
    fetch(`/api/academic-cycle${query}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { if (live) setHasActiveCycle(Boolean(json?.success && json.active)); })
      .catch(() => { if (live) setHasActiveCycle(null); });
    return () => { live = false; };
  }, [view, yearEndCampusId]);
  // §3.1: School settings keeps its "Setup checklist" tab only until readiness is approved (status READY).
  const [readinessDone, setReadinessDone] = useState(false);
  useEffect(() => {
    if (view !== "school-settings") return;
    let live = true;
    fetch("/api/readiness", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { if (live) setReadinessDone(json?.readiness?.status === "READY"); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [view]);
  const leaf = leafForView("admin", view);
  const title = leaf ? labelFor(leaf, labelAccess) : "Today";
  const description = leaf?.summary;
  const icon = leaf?.icon;

  /** Staff invitations for a campus admin without the membership delegation (never a disabled ghost, §4.5.6). */
  const inviteNote = has("standaloneDeputy")
    ? authorityName
      ? ui("Staff invitations are managed by {0}, your school admin, who can let you invite.", [authorityName])
      : ui("Staff invitations are managed by your school admin, who can let you invite.")
    : authorityName
      ? ui("Staff invitations are managed by {0}, your group admin, who can let you invite.", [authorityName])
      : ui("Staff invitations are managed by your group admin, who can let you invite.");

  /** "Managed by" copy for a campus admin, worded for a group campus or a deputy in a single school. */
  const leadersNote = has("standaloneDeputy")
    ? authorityName
      ? ui("Leaders and school-wide settings are managed by {0}, your school admin.", [authorityName])
      : ui("Leaders and school-wide settings are managed by your school admin.")
    : authorityName
      ? ui("Leaders and school-wide settings are managed by {0}, your group admin.", [authorityName])
      : ui("Leaders and school-wide settings are managed by your group admin.");

  // Addendum 3: shaped like the view that is coming (Today vs any other page). With the shell's cached access this
  // shows only on a session's very first load, never on a ?view= switch.
  const viewSkeleton = view === "overview" ? <CommandCentreSkeleton tiles={4} /> : <PageSkeleton />;
  if (!access.ready && !(view === "billing")) return viewSkeleton;

  /* ── Billing & plan: independent of the campus loader (F3) ── */
  if (view === "billing") {
    if (access.ready && !has("billing")) {
      return (
        <AccessNotice
          title="Billing & plan"
          reason={subscriptionOwnerName ? "The SkooleeAI subscription is managed by the account owner." : "Contact SkooleeAI support to restore billing access."}
          owner={subscriptionOwnerName}
        />
      );
    }
    if (!access.ready) return <PageSkeleton />;
    // The workspace owns the view's one PageHeader ("Billing & plan", primary "Change plan", §4.4), as in /super.
    return <SubscriptionWorkspace />;
  }

  /* ── The campus data failed to load ── */
  if (!data) {
    if (ctx.loading) return viewSkeleton;
    if (ctx.loadFailure?.suspended) {
      return has("billing") ? (
        <Alert
          tone="warning"
          title={ui("Your plan is paused")}
          actions={<Button type="button" onClick={() => setView("billing")}><CreditCard aria-hidden="true" />{ui("Open Billing & plan")}</Button>}
        >
          {ui("Renew the subscription to reopen the campus console. Your records are safe.")}
        </Alert>
      ) : (
        <AccessNotice
          title="Your plan is paused"
          reason={subscriptionOwnerName
            ? ui("Your plan is paused. {0} can renew it.", [subscriptionOwnerName])
            : ui("Contact SkooleeAI support to restore billing access.")}
        />
      );
    }
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <ErrorState
        variant="panel"
        offline={offline}
        title={offline ? undefined : ui("Couldn't load your console")}
        description={offline ? undefined : ui("The campus data didn't come back. This is usually temporary — try again in a moment.")}
        onRetry={() => void ctx.reload()}
      />
    );
  }

  const classes: any[] = data.classes || [];
  // SD3 (§2.5): this operator is the campus's sole checker when no other active campus admin is pinned here.
  const campusAdmins: Array<{ id: string }> = data.campusAdmins || [];
  const soleCampusOperator = has("campusOps")
    && campusAdmins.some((admin) => admin.id === data.currentUserId)
    && campusAdmins.every((admin) => admin.id === data.currentUserId);
  /** A hand-off from a panel to another view of this console: only views this operator can open (§4.5.11). */
  const openReachable = (next: string) => {
    if (access.leafVisible("admin", next)) {
      setView(next);
      return;
    }
    const denied = leafForView("admin", next)?.deniedReason;
    toast.info(ui(denied ?? "This workspace is not available with your current access."));
  };

  switch (view) {
    /* ── Today ── */
    case "overview": {
      // Addendum 2026-10-22 (flagships): AI Workflows and Exam Studio lead Today for the roles that may use them.
      // While the school is not set up yet, "Set up your school with AI" is THE primary action of this screen
      // (only the institution authority ever sees `aiSetupPending`), so Add student steps down to a secondary.
      const showAiCard = has("schoolAi");
      const setupFirst = showAiCard && data.aiSetupPending === true;
      // `schoolAiExams` is the Exam Studio page gate; P1 grants it to a campus operator only while it is the academic
      // lead (no principal appointed), which is when the tour's `admin.today.flagship-exams` step runs too.
      const showExamCard = has("schoolAiExams");
      const flagships = showAiCard || showExamCard ? (
        <div className={cn("grid gap-4", showAiCard && showExamCard && "lg:grid-cols-2")}>
          {showAiCard ? (
            setupFirst ? (
              <FlagshipCard
                kind="ai-workflows"
                title="Let AI draft your school's setup"
                description="Answer a short questionnaire. AI drafts your academic year, classes, calendar, timetable, fees and family messages; you review every part, and nothing applies until you approve it."
                action={{ label: "Set up your school with AI", href: "/ai?setup=1" }}
                tourAnchor="admin.today.flagship-ai"
              />
            ) : (
              <FlagshipCard
                kind="ai-workflows"
                title="AI Workflows"
                description="Let AI draft the timetable, invoices, announcements or promotions. You review each run and approve it before anything changes."
                action={{ label: "Run an AI workflow", href: "/ai" }}
                tourAnchor="admin.today.flagship-ai"
              />
            )
          ) : null}
          {showExamCard ? (
            <FlagshipCard
              kind="exam-studio"
              title="Exam Studio"
              description="Until a principal is appointed, create exams here: AI builds the paper from your material, you review it, then it is delivered and marked securely."
              action={{ label: "Create an exam in Exam Studio", href: "/ai/studio" }}
              tourAnchor="admin.today.flagship-exams"
            />
          ) : null}
        </div>
      ) : null;
      return (
        <ViewFrame
          title={title}
          description={description}
          icon={icon}
          // The flagship cards lead Today; admitting students lives on the Students screen.
          status={
            <>
              {ctx.retiredNotice ? <Alert tone="info" live="polite">{ui(ctx.retiredNotice)}</Alert> : null}
              {/* The Exam Studio card already says no principal is appointed; the note shows only without it. */}
              {has("academicLead") && has("campusOps") && !showExamCard ? (
                <Alert tone="brand" compact>{ui("No principal is appointed, so academic approvals also come to you here.")}</Alert>
              ) : null}
            </>
          }
        >
          {flagships}
          <ActionQueue campusId={data.campusId} />
          <CampusOverview
            data={data}
            showFinance={has("fees")}
            onNavigate={openReachable}
          />
        </ViewFrame>
      );
    }

    /* ── Students ── */
    case "students":
      return (
        <StudentsPanel
          title={title}
          headingLevel={1}
          students={data.students}
          classes={classes}
          onAddStudent={ctx.openAdmissionForm}
          onViewStudent={ctx.viewStudent}
          onBulkImport={() => ctx.openBulkImport()}
          onExport={ctx.exportStudentsCSV}
          incomingFilter={ctx.rosterFilter}
          onIncomingFilterApplied={() => ctx.setRosterFilter(null)}
          onRefresh={ctx.reload}
        />
      );

    case "admissions": {
      const items: ViewTabItem[] = [
        { id: "enquiries", label: "Enquiries" },
        { id: "applications", label: "Applications" },
        { id: "forms", label: "Forms", hidden: !has("campusOps") },
      ];
      const active = pickTab(items, tab);
      const scope = `admissions:${active}`;
      // §4.4: the tab's create action is the one primary; Export sits beside it on the enquiries list.
      const primary: PageAction | undefined = active === "enquiries"
        ? { id: "new-enquiry", label: "New enquiry", icon: Plus, onClick: () => sendCommand(scope, "new-enquiry") }
        : active === "applications"
          ? { id: "enter-application", label: "Enter an application", icon: Plus, onClick: () => sendCommand(scope, "enter-application"), disabled: publishedForms === 0, disabledReason: "Publish an application form first." }
          : undefined;
      return (
        <ViewFrame
          title={title}
          description={description}
          icon={icon}
          primaryAction={primary}
          secondaryActions={active === "enquiries" ? [{ id: "export-enquiries", label: "Export", icon: Download, onClick: () => sendCommand(scope, "export") }] : undefined}
          tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Admissions sections" />}
        >
          {active === "enquiries" ? (
            <AdmissionQueriesSection ctx={ctx} command={commandFor(scope)} />
          ) : active === "applications" ? (
            <AdmissionsDesk section="applications" showForms={false} canDecide entryInHeader command={commandFor(scope)} onPublishedForms={setPublishedForms} />
          ) : (
            <AdmissionsDesk section="forms" onPublishedForms={setPublishedForms} />
          )}
        </ViewFrame>
      );
    }

    case "guardians": {
      const initialStudentId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("student") ?? undefined : undefined;
      const students = (data.students || []).map((s: any) => ({
        id: s.id,
        fullName: s.fullName,
        rollNo: s.rollNo || "",
        campus: { name: data.campusName || "" },
        class: { name: s.class?.name || "", section: s.class?.section ?? null },
      }));
      return (
        <ViewFrame
          title={title}
          description={description}
          icon={icon ?? Contact}
          primaryAction={{ id: "add-guardian", label: "Add guardian", icon: UserPlus, onClick: ctx.requestGuardianAdd, disabled: students.length === 0, disabledReason: "Enrol a student first." }}
        >
          <GuardianAccessManager
            students={students}
            locale={language === "ar" || language === "ur" ? language : "en"}
            initialStudentId={initialStudentId}
            addRequest={ctx.guardianAddRequest}
          />
        </ViewFrame>
      );
    }

    case "guardian-consent":
      return (
        <ViewFrame title={title} description={description} icon={icon ?? ShieldCheck}>
          <ConsentStatusPanel />
        </ViewFrame>
      );

    case "communications":
      return (
        <ViewFrame
          title={title}
          description={description}
          icon={icon ?? Inbox}
          // §4.4b: a monitoring screen (no primary); the sweep and the export sit in the PageHeader, the panel keeps
          // only its status filters. "Run reminders" messages families, so the panel asks before it runs.
          secondaryActions={[
            { id: "run-reminders", label: "Run reminders", icon: Send, onClick: () => runEngagement("run-reminders") },
            { id: "export-communication", label: "Export", icon: Download, onClick: () => runEngagement("export") },
            { id: "refresh-communication", label: "Refresh", icon: RefreshCw, onClick: () => runEngagement("refresh") },
          ]}
        >
          <EngagementPanel mode="office" hideActions command={engagementCommand} />
        </ViewFrame>
      );

    case "learning-actions":
      return (
        <ViewFrame title={title} description={description ?? "Learning actions teachers drafted, waiting for you to activate or return."} icon={icon ?? Target}>
          <LearningActions mode="review" />
        </ViewFrame>
      );

    case "promote-archive":
      // Year-end work leads; archived students and classes are the follow-up, not the headline.
      return (
        <ViewFrame
          title={title}
          description={description ?? "Promote students to next year's classes and look after leavers and archived records."}
          icon={icon ?? ArrowRightLeft}
          // §4.4b: archiving the year is the header secondary (typed confirmation in the panel, never a red button
          // in the body). "Prepare plan" stays beside its effective-date field in the promotion plan (see report).
          secondaryActions={hasActiveCycle ? [{ id: "archive-year", label: "Archive year", icon: Archive, onClick: () => bump("archive-year") }] : undefined}
        >
          <RolloverReview campusId={data.campusId} />
          <YearEndPanel campusId={data.campusId} hideArchive archiveRequest={requests["archive-year"]} />
          <ArchivedStudentsPanel version={ctx.studentsVersion} onVersionBump={ctx.bumpStudents} />
          <ArchivedClassesPanel version={ctx.studentsVersion} onRestored={ctx.bumpStudents} />
        </ViewFrame>
      );

    case "attendance": {
      // §3.1/§4.3: the section row lives in the PageHeader (kept in `?tab=`) and the panel shows the one section
      // asked for, so the screen has one tab row. §4.4b: "Export" downloads the student register on screen, so it
      // is offered on the Students tab only (never a header button that does nothing on the other three).
      const items: ViewTabItem[] = [
        { id: "students", label: "Students" },
        { id: "teachers", label: "Teacher check-ins" },
        { id: "rules", label: "Attendance rules" },
        { id: "trips", label: "Trips" },
      ];
      const active = pickTab(items, tab) as AttendanceTab;
      return (
        <ViewFrame
          title={title}
          description={description ?? "Student and staff registers for this campus, and the rules behind them."}
          icon={icon ?? CalendarCheck}
          secondaryActions={active === "students" ? [{ id: "export-attendance", label: "Export", icon: Download, onClick: () => bump("attendance-export") }] : undefined}
          tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Attendance sections" />}
        >
          <UnifiedAttendancePanel tabs={[active]} exportRequest={requests["attendance-export"] ?? 0} />
        </ViewFrame>
      );
    }

    /* ── Staff ── */
    case "teachers":
      return (
        <ViewFrame
          title={title}
          description={description ?? "Everyone who teaches on this campus, what they teach and who still has to finish setting up."}
          icon={icon ?? Users}
          primaryAction={has("memberships") ? { id: "invite-teacher", label: "Invite teacher", icon: UserPlus, onClick: ctx.openAddTeacher } : undefined}
          secondaryActions={[{ id: "export-teachers", label: "Export", icon: Download, onClick: ctx.exportTeachersCSV }]}
          status={!has("memberships") ? <Alert tone="neutral" compact>{inviteNote}</Alert> : undefined}
        >
          <FacultyPanel
            teachers={data.teachers}
            pendingInvites={data.pendingTeacherInvitations}
            canInvite={has("memberships")}
            onInvite={ctx.openAddTeacher}
            onRemove={(id) => void ctx.handleRemove(id, "Teacher")}
            onViewTeacher={ctx.viewTeacher}
            onResend={ctx.handleResendInvite}
            onCancel={ctx.handleCancelInvite}
          />
        </ViewFrame>
      );

    case "leadership": {
      const canInvite = has("memberships");
      const canAppoint = has("inviteLeaders");
      const inviteStaff: PageAction = { id: "invite-staff", label: "Invite staff member", icon: UserPlus, onClick: ctx.openInviteChooser };
      // §4.4: a vacant principal seat is the single-school owner's first job here; otherwise inviting office staff is.
      const appointPrincipal: PageAction | null = canAppoint && !data.principal
        ? { id: "appoint-principal", label: "Appoint principal", icon: GraduationCap, onClick: () => ctx.openInvite("PRINCIPAL") }
        : null;
      const primary = appointPrincipal ?? (canInvite ? inviteStaff : undefined);
      const activityLog: PageAction = { id: "activity-log", label: "Activity log", icon: History, onClick: () => setActivityLogOpen(true) };
      return (
        <ViewFrame
          title={title}
          description={standaloneOwner ? "Your principal, deputy admins and office staff, and the invitations still open." : "Office staff on this campus and the invitations still open."}
          icon={icon ?? BadgeCheck}
          primaryAction={primary}
          secondaryActions={[...(appointPrincipal && canInvite ? [inviteStaff] : []), activityLog]}
          status={!canAppoint || !canInvite ? (
            <Alert tone="neutral" compact>{!canAppoint && !canInvite ? `${leadersNote} ${inviteNote}` : !canAppoint ? leadersNote : inviteNote}</Alert>
          ) : undefined}
        >
          {activityLogOpen ? <AuditHistoryModal onClose={() => setActivityLogOpen(false)} /> : null}
          <LeadershipPanel
            data={data}
            canInvite={canInvite}
            canAppointLeaders={canAppoint}
            onInviteAdmin={canAppoint ? () => ctx.openInvite("CAMPUS_ADMIN") : undefined}
            onInvitePrincipal={canAppoint ? () => ctx.openInvite("PRINCIPAL") : undefined}
            onRemove={(id, label) => void ctx.handleRemove(id, label)}
            onResend={ctx.handleResendInvite}
            onCancel={ctx.handleCancelInvite}
          />
        </ViewFrame>
      );
    }

    case "leave":
      return (
        <LeaveManagementPanel
          campusId={data.campusId}
          title={title}
          description={description ?? "Decide staff leave, set leave types and allowances, and see what everyone has left."}
          headingLevel={1}
          tabs={["queue", "balances", "types", "allocations"]}
          activeTab={tab}
          onTabChange={(next) => setTab(next)}
        />
      );

    case "staff-hierarchy": {
      const items: ViewTabItem[] = STAFF_STRUCTURE_TABS.map((item) => ({ id: item.id, label: item.label }));
      const active = pickTab(items, tab) as StaffStructureTab;
      // §4.4b: the section's create action is the one primary (Departments "Add unit", Rank ladder "Add rank");
      // the chart and workload are for looking and moving people, so they carry none.
      const structurePrimary: PageAction | undefined = active === "departments"
        ? { id: "add-unit", label: "Add unit", icon: Plus, onClick: () => bump("add-unit") }
        : active === "ladder"
          ? { id: "add-rank", label: "Add rank", icon: Plus, onClick: () => bump("add-rank") }
          : undefined;
      return (
        <ViewFrame
          title={title}
          description={description ?? "Departments, ranks and positions on this campus, and who covers whom."}
          icon={icon ?? Network}
          primaryAction={structurePrimary}
          tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Staff structure sections" />}
        >
          <StaffHierarchyPanel
            campusId={data.campusId}
            tab={active}
            onTabChange={(next) => setTab(next)}
            addUnitRequest={requests["add-unit"] ?? 0}
            addRankRequest={requests["add-rank"] ?? 0}
          />
        </ViewFrame>
      );
    }

    case "teacher-performance":
      return (
        <ViewFrame
          title={title}
          description={description ?? "Teaching evidence and support notes for each teacher."}
          icon={icon ?? Award}
          // §4.4b: no primary here (rows carry "Add note"); Export is the one secondary.
          secondaryActions={[{ id: "export-evidence", label: "Export", icon: Download, onClick: () => bump("export-evidence") }]}
        >
          <TeacherPerformancePanel hideHeading exportRequest={requests["export-evidence"]} />
        </ViewFrame>
      );

    /* ── Academics ── */
    case "academic-hub":
      return (
        <ViewFrame
          title={title}
          description={description ?? "How this year's classes, subjects, timetable and assessments are set up."}
          icon={icon ?? Compass}
          // §4.5.11: the readiness checklist is the institution authority's; anyone else reaches an assigned task
          // through its notification link, so the secondary is not offered to them (matrix #18).
          secondaryActions={has("institutionAuthority") ? [{ id: "school-readiness", label: "School readiness", icon: ClipboardCheck, href: "/setup/readiness" }] : undefined}
        >
          <AcademicHub campusId={data.campusId} onNavigate={openReachable} />
          <section aria-labelledby="admin-insights-heading" className="space-y-3">
            <h2 id="admin-insights-heading" className="text-lg font-bold text-ink-strong">{ui("Insights")}</h2>
            <AnalyticsCharts />
          </section>
        </ViewFrame>
      );

    case "classes":
      return (
        <>
          <AcademicPanel
            notice={<TeacherConflictsBanner />}
            title={title}
            description={description ?? "Create classes and sections, and choose who teaches each class and subject."}
            headingLevel={1}
            classes={classes}
            teachers={data.teachers}
            students={data.students}
            campusName={data.campusName}
            onAddClass={ctx.openClassWizard}
            onAddStudent={ctx.openAdmissionForm}
            onBulkImport={ctx.openBulkImport}
            onViewClass={ctx.viewClass}
            onChangeTeacher={ctx.handleChangeClassTeacher}
            onDeleteClass={ctx.handleDeleteClass}
            onUpdateClass={ctx.handleUpdateClass}
            onDeleteSubject={ctx.handleDeleteSubject}
            onUpdateSubject={ctx.handleUpdateSubject}
            onAddSection={ctx.handleAddSection}
          />
        </>
      );

    case "timetable": {
      // §4.4b: Publish only while the chosen class has a draft (disabled with its reason while edits are unsaved);
      // Print always; Unpublish (the studio's own confirmation) only for a published timetable.
      const tt = timetableState;
      const secondaries: PageAction[] = [{ id: "print-timetable", label: "Print", icon: Printer, onClick: () => runTimetable("print") }];
      if (tt?.published) secondaries.push({ id: "unpublish-timetable", label: "Unpublish", tone: "danger", onClick: () => runTimetable("unpublish") });
      return (
        <ViewFrame
          title={title}
          description={description ?? "Build, publish and adjust this campus's timetable."}
          icon={icon ?? CalendarRange}
          primaryAction={tt?.hasDraft ? {
            id: "publish-timetable",
            label: "Publish",
            icon: Upload,
            disabled: !tt.canPublish,
            disabledReason: tt.unsavedChanges > 0 ? "Save your changes before you publish." : "Open the class view of a timetable to publish it.",
            onClick: () => runTimetable("publish"),
          } : undefined}
          secondaryActions={secondaries}
        >
          <TimetableStudio campusId={data.campusId} periodsHref="/admin?view=settings&tab=periods" hideActions command={timetableCommand} onDraftState={onTimetableState} />
        </ViewFrame>
      );
    }

    case "exam-cycles": {
      const items: ViewTabItem[] = [
        { id: "exams", label: "Exams" },
        { id: "shared-questions", label: "Shared questions" },
      ];
      const active = pickTab(items, tab);
      const examsTab = active !== "shared-questions";
      return (
        <ViewFrame
          title={title}
          description={description ?? "Schedule exams, lock marks and publish results."}
          icon={icon ?? FileCheck2}
          // §4.4b: "Schedule exam" (primary) and "Refresh" on the exams tab; shared questions is a review queue.
          primaryAction={examsTab ? { id: "schedule-exam", label: "Schedule exam", icon: Plus, onClick: () => bump("schedule-exam") } : undefined}
          secondaryActions={examsTab ? [{ id: "refresh-exams", label: "Refresh", icon: History, onClick: () => bump("refresh-exams") }] : undefined}
          tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Exams sections" />}
        >
          {examsTab
            ? <ExamsWorkspace campusId={data.campusId} hideActions scheduleRequest={requests["schedule-exam"]} refreshRequest={requests["refresh-exams"]} />
            : <QuestionNetwork />}
        </ViewFrame>
      );
    }

    case "report-cards": {
      const lead = has("academicLead");
      // Notification and job links name one exam (`?exam=<id>`): it is shown first and outlined.
      const focusExam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("exam") : null;
      const exams = (data.recentExams || [])
        .filter((exam: any) => exam.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(exam.status))
        .sort((a: any, b: any) => (a.id === focusExam ? -1 : b.id === focusExam ? 1 : 0));
      // Lead: "Approve selected" approves what is ticked in every exam below; "Preview release" opens the first one.
      const picked = exams.filter((exam: any) => (reportSelections[exam.id]?.selected ?? 0) > 0);
      const selectedCount = picked.reduce((sum: number, exam: any) => sum + (reportSelections[exam.id]?.selected ?? 0), 0);
      const blockedBy = picked.map((exam: any) => reportSelections[exam.id]).find((state: ReportSelectionState | undefined) => state && !state.canApprove)?.reason ?? null;
      const previewExamId = picked[0]?.id ?? exams[0]?.id ?? null;
      // Office: the header queues delivery only when it is clear which exam (the linked one, or the only one);
      // otherwise each exam keeps its own delivery row.
      const deliveryExamId: string | null = lead ? null
        : focusExam && exams.some((exam: any) => exam.id === focusExam) ? focusExam
        : exams.length === 1 ? exams[0].id : null;
      const delivery = deliveryExamId ? deliveryStates[deliveryExamId] : undefined;
      const primary: PageAction | undefined = lead
        ? exams.length ? {
          id: "approve-selected",
          label: selectedCount > 0 ? ui("Approve selected ({0})", [selectedCount]) : "Approve selected",
          icon: CheckCheck,
          disabled: selectedCount === 0 || Boolean(blockedBy),
          disabledReason: blockedBy ?? "Tick the report versions to approve first.",
          onClick: () => bump("approve-reports"),
        } : undefined
        : deliveryExamId ? {
          id: "queue-delivery",
          label: "Queue delivery",
          icon: Send,
          disabled: !delivery?.canDeliver,
          disabledReason: "Report cards can be sent once they are published.",
          onClick: () => bump("deliver-reports"),
        } : undefined;
      const secondaries: PageAction[] | undefined = lead
        ? exams.length ? [{ id: "preview-release", label: "Preview release", icon: Eye, onClick: () => bump("preview-reports") }] : undefined
        : deliveryExamId ? [{ id: "generate-pdfs", label: "Generate PDFs", icon: FileText, disabled: !delivery?.canGenerate, disabledReason: "Nothing to generate yet.", onClick: () => bump("generate-reports") }] : undefined;
      return (
        <ViewFrame
          title={title}
          description={lead ? "Approve report versions and release them to families." : "Report cards your principal has approved, ready to generate and send to families."}
          icon={icon ?? ClipboardList}
          primaryAction={primary}
          secondaryActions={secondaries}
        >
          {exams.length === 0 ? (
            // R5: an empty list is an EmptyState, never an access notice.
            <div className="sk-panel">
              <EmptyState
                icon={ClipboardList}
                title={ui("No report cards yet")}
                description={ui("An exam appears here once its marks are locked.")}
                action={lead ? <Button type="button" variant="outline" onClick={() => setView("exam-cycles")}>{ui("Open Exams & results")}</Button> : undefined}
              />
            </div>
          ) : (
            <div className="space-y-6">
              {exams.map((exam: any, index: number) => (
                <div key={exam.id} id={`report-exam-${exam.id}`} aria-current={exam.id === focusExam ? "true" : undefined} className={cn("sk-panel scroll-mt-4 p-4 sm:p-5", exam.id === focusExam && "ring-2 ring-primary/40")}>
                  {/* §9.4: the first pipeline carries the spotlight anchor, so it stays unique on the page. */}
                  <ReportCardPipeline
                    exam={exam}
                    campusId={data.campusId}
                    mode={lead ? "lead" : "delivery"}
                    tourAnchor={index === 0}
                    onChanged={() => void ctx.reload()}
                    {...(lead
                      ? { hideApprove: true, approveRequest: requests["approve-reports"], previewRequest: exam.id === previewExamId ? requests["preview-reports"] : undefined, onSelectionChange: onReportSelection }
                      : exam.id === deliveryExamId
                        ? { hideDelivery: true, deliverRequest: requests["deliver-reports"], generateRequest: requests["generate-reports"], onDeliveryState }
                        : {})}
                  />
                </div>
              ))}
            </div>
          )}
        </ViewFrame>
      );
    }

    case "year-cycle": {
      // §4.4b: Close year (ConfirmAction inside the checklist) is the primary, disabled with its reason until the
      // checklist is green; Checklist and Refresh are secondaries; "Close anyway…" (typed reason) sits in the overflow
      // and only for the academic lead (here: only while no principal is appointed).
      const cs = closure;
      const yearSecondaries: PageAction[] = [];
      if (cs?.hasOpenYear) {
        yearSecondaries.push({ id: "year-refresh", label: "Refresh checklist", icon: RefreshCw, onClick: () => runYear("refresh") });
        if (cs.canForce) yearSecondaries.push({ id: "year-force", label: "Close anyway…", tone: "danger", onClick: () => runYear("force") });
      }
      return (
        <ViewFrame
          title={title}
          description={description ?? "Open, run and close the academic year."}
          icon={icon ?? CalendarDays}
          primaryAction={cs?.hasOpenYear ? {
            id: "close-year",
            label: "Close year",
            icon: ShieldCheck,
            disabled: !cs.ready || cs.loading,
            disabledReason: "Finish the checklist below before closing the year.",
            onClick: () => runYear("close"),
          } : undefined}
          secondaryActions={yearSecondaries.length ? yearSecondaries : undefined}
        >
          <CycleManagementPanel
            campusId={data.campusId}
            canForceClose={has("academicLead")}
            onNavigate={openReachable}
            canOpen={(next) => access.leafVisible("admin", next)}
            hideCloseActions
            closeCommand={yearCommand}
            onClosureState={setClosure}
          />
          <section className="border-t border-border pt-6" aria-labelledby="admin-year-history-heading">
            <h2 id="admin-year-history-heading" className="mb-4 text-lg font-bold text-ink-strong">{ui("Year history")}</h2>
            <AcademicYearPanel />
          </section>
        </ViewFrame>
      );
    }

    case "ai":
      return (
        <ViewFrame
          title={title}
          description={description ?? "Ask the campus assistant for summaries and drafts; nothing is sent without your review."}
          icon={icon ?? Sparkles}
          // §4.4b: "New request" focuses the composer; the full AI workspace (/ai) is linked from the panel (M32).
          primaryAction={{
            id: "new-ai-request",
            label: "New request",
            icon: Sparkles,
            onClick: () => {
              const field = document.getElementById(AI_COMPOSER_INPUT_ID);
              field?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
              field?.focus({ preventScroll: true });
            },
          }}
        >
          <AIPanel
            // The PageHeader above owns the title and the one primary ("New request"): no second headline.
            hideHeading
            title={ui("AI assistant")}
            features={has("academicLead") ? ADMIN_AI_FEATURES : ADMIN_AI_FEATURES.filter((f) => f.feature !== "pending_review_queue")}
            insights={data.aiInsights}
            // Only the academic lead approves AI-written remarks; everyone else sees no review queue.
            reviewItems={has("academicLead") ? data.pendingAIReviewItems ?? [] : undefined}
            campusId={data.campusId}
            onComplete={() => void ctx.reload()}
          />
        </ViewFrame>
      );

    /* ── Money ── */
    case "fees": {
      const desk = has("financeDesk");
      const feeTabs: FeeTab[] = desk ? ["overview", "structures", "invoices", "payments", "reports", "accounts", "tax"] : ["overview", "invoices", "reports"];
      const items = feeTabItems(feeTabs);
      const active = pickTab(items, tab);
      return (
        <ViewFrame
          title={title}
          description={desk ? description : "Follow collection and approve refunds; your accountant records payments."}
          icon={icon ?? Receipt}
          // §4.4: "Record payment" only while this operator holds the finance desk; otherwise no primary.
          primaryAction={desk ? { id: "record-payment", label: "Record payment", icon: Wallet, onClick: () => sendCommand("fees", "record-payment") } : undefined}
          // §4.3: the one tab row sits in the PageHeader; the panel follows `?tab=` and draws none of its own.
          tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Fee sections" />}
        >
          <FeesPanel
            campusId={data.campusId}
            tabs={feeTabs}
            hideTabs
            tab={active}
            onTabChange={setTab}
            command={commandFor("fees")}
          />
        </ViewFrame>
      );
    }

    case "payroll":
      return (
        <ViewFrame
          title={title}
          description={has("financeDesk") ? "Prepare the payroll run and approve it." : "Approve the payroll run your accountant prepared."}
          icon={icon ?? Banknote}
          // §4.4: approval is a queue, so there is no primary; "Export" is the secondary, and "Prepare run" stays
          // reachable beside it only while this operator holds the finance desk.
          // With no accountant the admin prepares the run too, so "Prepare run" is the primary.
          primaryAction={has("financeDesk") ? { id: "prepare-run", label: "Prepare run", icon: Plus, onClick: () => sendCommand("payroll", "prepare-run") } : undefined}
          secondaryActions={[
            { id: "export-payroll", label: "Export", icon: Download, onClick: () => sendCommand("payroll", "export") },
          ]}
        >
          <PayrollRunsPanel mode={has("financeDesk") ? "both" : "approve"} hideHeader command={commandFor("payroll")} />
        </ViewFrame>
      );

    /* ── Campus services ── */
    case "front-desk": {
      const desk = has("frontDesk");
      const items: ViewTabItem[] = [
        { id: "complaints", label: "Complaints" },
        { id: "certificates", label: "Certificates" },
        { id: "visitors", label: "Visitors", hidden: !desk },
        { id: "calls", label: "Phone calls", hidden: !desk },
        { id: "post", label: "Post", hidden: !desk },
      ];
      const active = pickTab(items, tab);
      const scope = `front-desk:${active}`;
      const run = (id: string) => () => sendCommand(scope, id);
      // §4.4b: each tab's create action is the view's one primary; the desks render no header of their own.
      const primary: PageAction = active === "certificates" ? { id: "issue-certificate", label: "Issue certificate", icon: Plus, onClick: run("issue-certificate") }
        : active === "visitors" ? { id: "check-in", label: "Check in visitor", icon: UserCheck, onClick: run("check-in") }
        : active === "calls" ? { id: "log-call", label: "Log call", icon: Plus, onClick: run("log-call") }
        : active === "post" ? { id: "record-item", label: "Record item", icon: Plus, onClick: run("record-item") }
        : { id: "record-complaint", label: "Record complaint", icon: Plus, onClick: run("record-complaint") };
      const secondary: PageAction[] = active === "visitors"
        ? [{ id: "refuse", label: "Record refused visitor", icon: UserCheck, onClick: run("refuse") }, { id: "export", label: "Export", icon: Download, onClick: run("export") }]
        : [];
      const command = commandFor(scope);
      return (
        <ViewFrame title={title} description={description} icon={icon ?? ConciergeBell} primaryAction={primary} secondaryActions={secondary} tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Front desk sections" />}>
          {active === "certificates" ? <CertificatesDesk showTemplates hideHeader command={command} />
            : active === "visitors" ? <VisitorRegister hideHeader command={command} />
            : active === "calls" ? <PhoneCallLog hideHeader command={command} />
            : active === "post" ? <PostalRegister hideHeader command={command} />
            : <ComplaintsDesk hideHeader command={command} />}
        </ViewFrame>
      );
    }

    case "pickup":
      return (
        <ViewFrame
          title={title}
          description={has("frontDesk") ? "Check pickup codes at the gate and decide exceptions." : "Decide pickup exceptions and restrictions; your receptionist runs the gate."}
          icon={icon ?? UserCheck}
          // §4.4b: lead mode is an exception queue (no primary); with the front desk, "Check code" leads.
          primaryAction={has("frontDesk") ? { id: "check-code", label: "Check code", icon: UserCheck, onClick: () => sendCommand("pickup", "check-code") } : undefined}
          secondaryActions={has("frontDesk") ? [{ id: "scan-photo", label: "Scan photo", icon: Upload, onClick: () => sendCommand("pickup", "scan-photo") }] : undefined}
        >
          <PickupGate mode={has("frontDesk") ? "both" : "lead"} hideHeader command={commandFor("pickup")} />
        </ViewFrame>
      );

    case "transport":
      return (
        <ViewFrame
          title={title}
          description={description ?? "Routes, vehicles, riders and today's trips."}
          icon={icon ?? Bus}
          primaryAction={{ id: "add-route", label: "Add route", icon: Plus, onClick: () => sendCommand("transport", "add-route") }}
          secondaryActions={[{ id: "transport-export", label: "Export", icon: Download, onClick: () => sendCommand("transport", "export") }]}
        >
          <TransportPanel hideHeader command={commandFor("transport")} />
        </ViewFrame>
      );

    case "dormitory":
      return (
        <ViewFrame
          title={title}
          description={description ?? "Rooms, room types and bed allocations."}
          icon={icon ?? BedDouble}
          primaryAction={{ id: "add-room-type", label: "Add room type", icon: Plus, onClick: () => sendCommand("dormitory", "add-room-type") }}
          secondaryActions={[{ id: "allocate-bed", label: "Allocate bed", icon: UserCheck, onClick: () => sendCommand("dormitory", "allocate-bed") }]}
        >
          <DormitoryPanel hideHeader command={commandFor("dormitory")} />
        </ViewFrame>
      );

    case "canteen":
      return (
        <ViewFrame
          title={title}
          description={description ?? "Menus, orders and allergy notes for the campus canteen."}
          icon={icon ?? UtensilsCrossed}
          primaryAction={canAddMeal ? { id: "add-meal", label: "Add meal", icon: Plus, onClick: () => sendCommand("canteen", "add-meal") } : undefined}
          secondaryActions={[{ id: "canteen-orders", label: "Orders", icon: ClipboardList, onClick: () => sendCommand("canteen", "orders") }]}
        >
          <CanteenPanel embedded command={commandFor("canteen")} onCanAddMeal={setCanAddMeal} />
        </ViewFrame>
      );

    case "inventory":
      return (
        <ViewFrame
          title={title}
          description={description ?? "Stock, stores and suppliers, and purchase requests waiting for a decision."}
          icon={icon ?? Package}
          primaryAction={{ id: "new-purchase-request", label: "New purchase request", icon: Plus, onClick: () => sendCommand("inventory", "new-request") }}
        >
          <PurchasingPanel createInHeader command={commandFor("inventory")} soleChecker={soleCampusOperator} />
          <InventoryPanel />
        </ViewFrame>
      );

    case "library": {
      const items: ViewTabItem[] = [
        { id: "lending", label: "Lending desk" },
        { id: "catalogue", label: "Catalogue & members" },
      ];
      const active = pickTab(items, tab);
      const scope = `library:${active}`;
      return (
        <ViewFrame
          title={title}
          description={description ?? "Lend and return books, and keep the catalogue and members up to date."}
          icon={icon ?? Library}
          // §4.4b: lending "Scan" focuses the scan field (secondary "Renew"); catalogue "Add book".
          primaryAction={active === "catalogue"
            ? { id: "add-book", label: "Add book", icon: Plus, onClick: () => sendCommand(scope, "add-book") }
            : { id: "scan", label: "Scan", icon: Library, onClick: () => sendCommand(scope, "scan") }}
          secondaryActions={active === "catalogue" ? undefined : [{ id: "renew", label: "Renew", icon: RefreshCw, onClick: () => sendCommand(scope, "renew") }]}
          tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Library sections" />}
        >
          {active === "catalogue" ? <LibraryPanel hideIssues hideHeader command={commandFor(scope)} /> : <LendingDesk hideHeader command={commandFor(scope)} />}
        </ViewFrame>
      );
    }

    /* ── Your school (the standalone owner's second hat) ── */
    case "approvals": {
      const items: ViewTabItem[] = [
        { id: "support", label: "Support access" },
        { id: "tax", label: "Tax sign-off" },
      ];
      const active = pickTab(items, tab);
      return (
        <ViewFrame
          title={title}
          description={description ?? "Support access and tax packages waiting for your decision."}
          icon={icon ?? ShieldCheck}
          // §4.4: a queue (rows Approve / Decline), so no primary; Refresh re-reads the open tab.
          secondaryActions={[{ id: "refresh-approvals", label: "Refresh", icon: RefreshCw, onClick: () => bump(`refresh-approvals:${active}`) }]}
          tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Approvals sections" />}
        >
          {/* A new key remounts the self-fetching panel, which loads its queue again. */}
          {active === "tax"
            ? <TaxPackages key={requests["refresh-approvals:tax"] ?? 0} mode="approve" hideHeader />
            : <SupportApprovalsPanel key={requests["refresh-approvals:support"] ?? 0} />}
        </ViewFrame>
      );
    }

    case "access": {
      const items: ViewTabItem[] = [
        { id: "members", label: "Members" },
        { id: "permissions", label: "Permissions" },
      ];
      const active = pickTab(items, tab);
      return (
        <ViewFrame title={title} description={description ?? "Who may manage members, and what each role can do."} icon={icon ?? UsersRound} tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="People and access sections" />}>
          {active === "permissions" ? <RolePermissionsPanel /> : <MembershipsPanel />}
        </ViewFrame>
      );
    }

    case "school-settings": {
      const items: ViewTabItem[] = [
        { id: "profile", label: "School profile" },
        { id: "locale", label: "Language & region" },
        { id: "identity", label: "Sign-in" },
        { id: "integrations", label: "Integrations" },
        { id: "whatsapp", label: "WhatsApp" },
        { id: "data", label: "Data & privacy" },
        { id: "activity", label: "Activity log" },
        { id: "setup", label: "Setup checklist", hidden: readinessDone },
      ];
      const active = pickTab(items, tab);
      return (
        <ViewFrame
          title={title}
          description={description ?? "School profile, language, sign-in, integrations, data rules and the activity log."}
          icon={icon ?? Landmark}
          // §4.4: "Change history" is the secondary; here it opens the Activity log tab (the school-wide record).
          secondaryActions={active === "activity" ? undefined : [{ id: "change-history", label: "Change history", icon: History, onClick: () => setTab("activity") }]}
          tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="School settings sections" />}
        >
          {active === "locale" ? <LocaleSettingsPanel scope="school" />
            : active === "identity" ? <IdentityAdmin />
            : active === "integrations" ? <Integrations />
            : active === "whatsapp" ? <div className="space-y-6"><WhatsAppConnectionPanel /><ManagedSendingPanel /></div>
            : active === "data" ? <DataLifecyclePanel userId={session?.id ?? data.currentUserId ?? ""} />
            : active === "activity" ? <AuditHistoryPanel />
            : active === "setup" ? <ReadinessHome />
            : <InstitutionSettingsPanel section="school-and-campus" onSaved={() => void ctx.reload()} />}
        </ViewFrame>
      );
    }

    case "settings": {
      const items: ViewTabItem[] = [
        { id: "profile", label: "Campus profile", hidden: standaloneOwner },
        { id: "year", label: "Year setup" },
        { id: "calendar", label: "Calendar & holidays" },
        { id: "periods", label: "Periods" },
        { id: "rooms", label: "Rooms" },
        { id: "categories", label: "Categories" },
        { id: "academic-rules", label: "Curriculum & grading", hidden: !has("academicLead") },
        { id: "policies", label: "Policies" },
        { id: "packages", label: "Packages" },
        { id: "group-standards", label: "Group policy", hidden: !has("groupCampus") },
      ];
      const active = pickTab(items, tab);
      // §4.4b: each tab saves its own form; the Policies tab's first job is writing one, so "New policy" leads there.
      const settingsPrimary: PageAction | undefined = active === "policies"
        ? { id: "new-policy", label: "New policy", icon: Plus, onClick: () => sendCommand("settings:policies", "new-policy") }
        : undefined;
      return (
        <ViewFrame
          title={title}
          description={description}
          icon={icon ?? Settings}
          primaryAction={settingsPrimary}
          secondaryActions={[{ id: "change-history", label: "Change history", icon: History, onClick: () => setActivityLogOpen(true) }]}
          status={standaloneOwner ? (
            // §2.1 ³ / D1: a single school does not open campuses itself; support converts it into a group.
            <Alert tone="neutral" compact>{ui("Opening another campus makes your school a school group. Contact SkooleeAI support to convert.")}</Alert>
          ) : undefined}
          tabs={<ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Campus setup sections" />}
        >
          {activityLogOpen ? <AuditHistoryModal onClose={() => setActivityLogOpen(false)} /> : null}
          {active === "profile" ? (
            <>
              <InstitutionSettingsPanel section="campus" campusId={data.campusId} onSaved={() => void ctx.reload()} />
              <LocaleSettingsPanel scope="campus-delegated" />
            </>
          ) : active === "year" ? <YearSetupWizard campusId={data.campusId} onComplete={() => setView("academic-hub")} />
            : active === "calendar" ? <AcademicCalendar campusId={data.campusId} />
            : active === "periods" ? <PeriodsPanel campusId={data.campusId} />
            : active === "rooms" ? <RoomsManager campusId={data.campusId} />
            : active === "categories" ? (
              <StudentSetupPanel
                studentCount={data.students?.length}
                onViewStudents={(filter) => { ctx.setRosterFilter(filter); setView("students"); }}
              />
            )
            : active === "academic-rules" ? (
              <div className="space-y-6">
                {/* §4.3: the view's PageHeader and tab already name this section, so the panels drop their heroes. */}
                <AcademicModelPanel campusId={data.campusId} hideHeading />
                <GradingRulesPanel campusId={data.campusId} hideHeading />
              </div>
            )
            : active === "policies" ? <PolicyManager command={commandFor("settings:policies")} />
            : active === "packages" ? <CampusPackagesPanel />
            : active === "group-standards" ? <CampusPolicy />
            : <YearSetupWizard campusId={data.campusId} onComplete={() => setView("academic-hub")} />}
        </ViewFrame>
      );
    }

    default:
      // A registry view with no renderer here is a defect; say so plainly instead of a blank panel.
      return <AccessNotice reason="This workspace is not available with your current access." />;
  }
}

/** Enquiries tab: "New enquiry" and "Export" live in the view's PageHeader; Convert opens the admission form. */
function AdmissionQueriesSection({ ctx, command }: { ctx: AdminCtx; command: { id: string; nonce: number } | null }) {
  return (
    <AdmissionQueriesPanel
      classes={ctx.data.classes}
      version={ctx.admissionQueriesVersion}
      onVersionBump={ctx.bumpAdmissionQueries}
      onConvert={ctx.openConvertQuery}
      headerless
      command={command}
    />
  );
}

/** "Invite staff member": one primary that asks which office role, instead of three buttons. */
function InviteStaffChooser({ onClose, onChoose }: { onClose: () => void; onChoose: (role: StaffInviteRole) => void }) {
  const ui = useUiText();
  const roles: { role: StaffInviteRole; label: string; hint: string; icon: LucideIcon }[] = [
    { role: "ACCOUNTANT", label: "Accountant", hint: "Records payments, invoices and payroll.", icon: Wallet },
    { role: "RECEPTIONIST", label: "Receptionist", hint: "Runs visitors, calls, post, pickup and enquiries.", icon: ConciergeBell },
    { role: "LIBRARIAN", label: "Librarian", hint: "Runs lending, the catalogue and members.", icon: Library },
  ];
  return (
    <Modal title={ui("Invite staff member")} eyebrow={ui("Staff")} subtitle={ui("Choose the role. They receive an email invitation to set up their account.")} icon={UserPlus} size="sm" onClose={onClose}>
      <ul className="grid gap-2">
        {roles.map(({ role, label, hint, icon: Icon }) => (
          <li key={role}>
            <Button type="button" variant="choice" className="h-auto w-full justify-start gap-3 px-4 py-3 text-start" onClick={() => onChoose(role)}>
              <Icon aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-semibold text-ink-strong">{ui(label)}</span>
                <span className="block text-xs font-medium text-ink-muted">{ui(hint)}</span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
