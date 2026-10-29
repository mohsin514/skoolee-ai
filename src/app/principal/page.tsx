"use client";

/**
 * Academic console (PRINCIPAL) — SPEC §3 `ROLE_NAV.principal`, §3.1, §4.4/§4.4b, §5.3.
 *
 * - Navigation, eyebrow, mobile slots, account menu (My leave) and the access fence come from the registry
 *   (`console="principal"`); view and tab live in the URL through `useConsoleView("principal")`. Old view ids
 *   alias (`academic-model`, `grading-rules`, `academic-hub`); retired ones (fees, transport, admissions,
 *   leadership, permissions, …) land on Today with the registry's notice (M44–M55).
 * - The principal is academic only: no fee meter, no Add student / Add class, no staff record, no
 *   campus-operations writes (the server refuses them too, §7.6). Students, teacher profiles, the school
 *   calendar and the promotion plan are read-only here; the principal approves (results, report versions,
 *   teaching-staff leave, the promotion plan, AI drafts) and builds the timetable.
 * - Every view opens with one PageHeader and at most one primary action (§4.3, §4.4). Load failures are an
 *   inline ErrorState with retry inside the shell, never a forced sign-out (R4).
 * - Today warns when the campus has no campus admin (§2.6 vacancy, GROUP schools only).
 */

import { useCallback, useEffect, useState, useSyncExternalStore, type ComponentProps, type ComponentType } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Award,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  History,
  LayoutDashboard,
  Plane,
  Plus,
  Printer,
  Download,
  RefreshCw,
  Scale,
  Send,
  Sparkles,
  Target,
  Users,
  Eye,
  CheckCheck,
  ListChecks,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { RoleShell, useShellSession } from "@/components/role-dashboard";
import { DegradedNotice } from "@/components/role-dashboard/DegradedNotice";
import { useConsoleView } from "@/components/nav/useConsoleView";
import { subscribeWorkspaceNavigation } from "@/components/nav/useWorkspaceView";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import { leafForView } from "@/lib/navigation/role-nav";
import { PageHeader, type PageAction } from "@/components/ui/page-header";
import { ViewTabs, type ViewTabItem } from "@/components/ui/view-tabs";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { downloadCSV } from "@/lib/csv";
import { CommandCentreSkeleton, PageSkeleton, PAGE_CARD_BODY } from "@/components/role-dashboard/RoleShellSkeleton";
import { FlagshipCard } from "@/components/ui/flagship";
import { SetupPrompt } from "@/components/ai-workflows/setup-prompt";
import { ActionQueue } from "@/components/principal/action-queue";
import { AcademicOverview } from "@/components/insights/AcademicOverview";
import { ReportCardPipeline, type ReportSelectionState } from "@/components/academic/ReportCardPipeline";
import { ExamsWorkspace } from "@/components/academic/exams/ExamsWorkspace";
import { QuestionNetwork } from "@/components/question-network/question-network";
import { TimetableStudio, type TimetableCommand, type TimetableDraftState } from "@/components/timetable/TimetableStudio";
import { AcademicModelPanel, type AcademicModelActionState, type AcademicModelCommand } from "@/components/academic/AcademicModelPanel";
import { GradingRulesPanel } from "@/components/academic/GradingRulesPanel";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { TeacherPerformancePanel } from "@/components/academic-year/TeacherPerformancePanel";
import { CycleManagementPanel } from "@/components/academic-year/CycleManagementPanel";
import type { YearCloseCommand, YearClosureState } from "@/components/academic/YearClosureChecklist";
import { RolloverReview, type RolloverApprovalState } from "@/components/academic/rollover-review";
import { ScenarioPlanner } from "@/components/planning/scenario-planner";
import { UnifiedAttendancePanel } from "@/components/attendance/unified-attendance-panel";
import { LearningActions } from "@/components/learning/learning-actions";
import { EngagementPanel, type EngagementCommand } from "@/components/communications/engagement-panel";
import { AiWorkflowsHome, AI_COMPOSER_INPUT_ID } from "@/components/ai-workflows/AiWorkflowsHome";
import { PathwayPanel } from "@/components/pathways/pathway-panel";
import { MyLeavePanel } from "@/components/leave/my-leave";
import {
  AcademicPanel,
  ClassDetailModal,
  FacultyPanel,
  LeaveManagementPanel,
  StudentDetailModal,
  StudentsPanel,
  TeacherConflictsBanner,
  TeacherDetailModal,
  exportStudentsToCSV,
} from "@/components/shared-admin";
import { fetchAcademicImpact, subjectRemovalText, teacherChangeText } from "@/components/shared-admin/academic-impact";
import { cn } from "@/lib/utils";
import { usePrincipalData } from "./principal-data-context";

/** The principal's AI workflows (academic only; the group admin no longer has these, M6). */
const PRINCIPAL_AI_FEATURES = [
  { feature: "at_risk_students", label: "At-risk Students", placeholder: "Optional exam, class, or attendance focus" },
  { feature: "class_performance_summary", label: "Class Summary", placeholder: "Class or exam focus" },
  { feature: "teacher_class_comparison", label: "Class Comparison", placeholder: "Classes, teachers, or term to compare" },
  { feature: "intervention_suggestions", label: "Intervention Plan", placeholder: "Student or class concern" },
  { feature: "pending_review_queue", label: "Review Queue", placeholder: "Optional priority note" },
];

/** Icons for views whose registry leaf is not found (defensive; the registry always has one). */
const FALLBACK_ICON: Record<string, LucideIcon> = {
  overview: LayoutDashboard, "report-cards": ClipboardList, "exam-cycles": FileCheck2, timetable: CalendarRange,
  classes: GraduationCap, "academic-rules": Scale, "school-calendar": CalendarDays, teachers: Users,
  "teacher-performance": Award, leave: Plane, students: GraduationCap, attendance: CalendarCheck,
  "learning-actions": Target, "promote-archive": ArrowRightLeft, "year-cycle": History, ai: Sparkles,
  engagement: Send, "my-leave": Plane,
};

/** `?exam=<id>` — job and notification links point at one exam's report cards (P9 `jobSourceHref`). */
const searchSnapshot = () => window.location.search;
const serverSearchSnapshot = () => "";
function useExamParam(): string | null {
  const search = useSyncExternalStore(subscribeWorkspaceNavigation, searchSnapshot, serverSearchSnapshot);
  return new URLSearchParams(search).get("exam");
}

type PendingConfirm = { title: string; description: string; confirmLabel: string; tone?: "danger" | "warning" | "primary"; run: () => Promise<void> } | null;

export default function PrincipalConsole() {
  const { data, error, refetch } = usePrincipalData();
  const { view, tab, setView, setTab, retiredNotice } = useConsoleView("principal");
  const session = useShellSession();

  return (
    <RoleShell
      console="principal"
      activeView={view}
      onSelectView={setView}
      userName={data?.principalName ?? session?.fullName}
      avatarSeed={data?.principal?.email ?? data?.principalName ?? session?.fullName}
      logoUrl={data?.logoUrl}
      dashboardHref="/principal"
    >
      {/* The shell draws the one page card (addendum 2026-10-22); this is its scrolling body, with the shared padding. */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div className={cn("custom-scrollbar flex-1 overflow-y-auto", PAGE_CARD_BODY)}>
          <PrincipalWorkspace
            data={data}
            loadError={error}
            reload={refetch}
            view={view}
            tab={tab}
            setView={setView}
            setTab={setTab}
            retiredNotice={retiredNotice}
          />
        </div>
      </section>
    </RoleShell>
  );
}

/**
 * §4.4b principal · Classes & subjects ("none" primary, Export secondary, one-sentence description). AcademicPanel
 * (P5) owns the view's header; it gains `description` / `secondaryActions` for its WorkspaceHeader (P5 need in the
 * P6 report). Typed here so the principal's Export and description render as soon as the panel forwards them.
 */
const HostedAcademicPanel = AcademicPanel as ComponentType<ComponentProps<typeof AcademicPanel> & { description?: string; secondaryActions?: PageAction[] }>;

/* ────────────────────────── Workspace (inside RoleShell, so access is available) ────────────────────────── */

function PrincipalWorkspace({
  data,
  loadError,
  reload,
  view,
  tab,
  setView,
  setTab,
  retiredNotice,
}: {
  data: any;
  loadError: string | null;
  reload: () => void;
  view: string;
  tab: string | null;
  setView: (view: string, tab?: string | null) => void;
  setTab: (tab: string | null) => void;
  retiredNotice: string | null;
}) {
  const ui = useUiText();
  const access = useConsoleAccess();
  const accessMap = useNavigationAccess().access;
  const session = useShellSession();

  const leaf = leafForView("principal", view);
  const title = leaf?.label ?? "Today";
  const description = leaf?.summary;
  const icon = leaf?.icon ?? FALLBACK_ICON[view] ?? LayoutDashboard;

  // Read-only profile and class dialogs (the principal assigns teachers; campus ops edit records).
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentSequence, setStudentSequence] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [teacherSequence, setTeacherSequence] = useState<any[]>([]);
  const [savingClassTeacherId, setSavingClassTeacherId] = useState<string | null>(null);
  const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
  const [creatingSubjectClassId, setCreatingSubjectClassId] = useState<string | null>(null);
  const [applyingSubjectClassId, setApplyingSubjectClassId] = useState<string | null>(null);
  const [savingSubjectUpdateId, setSavingSubjectUpdateId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  // Header actions owned by this page and carried out by the panel beneath it (§4.4: one PageHeader per view).
  const [scheduleExamRequest, setScheduleExamRequest] = useState(0);
  const [refreshExamsRequest, setRefreshExamsRequest] = useState(0);
  const [noteRequest, setNoteRequest] = useState(0);
  const [exportEvidenceRequest, setExportEvidenceRequest] = useState(0);
  // Report cards (§4.4): the versions ticked across every exam's pipeline are approved from the PageHeader.
  const [selections, setSelections] = useState<Record<string, ReportSelectionState>>({});
  const [approveReportsRequest, setApproveReportsRequest] = useState(0);
  const [previewReportsRequest, setPreviewReportsRequest] = useState(0);
  const onReportSelection = useCallback((state: ReportSelectionState) => {
    setSelections((previous) => {
      const known = previous[state.examId];
      if (known && known.selected === state.selected && known.canApprove === state.canApprove && known.reason === state.reason) return previous;
      return { ...previous, [state.examId]: state };
    });
  }, []);
  // Timetable & cover (§4.4): Publish (when a draft exists), Print, and Unpublish behind its confirmation.
  const [timetableCommand, setTimetableCommand] = useState<TimetableCommand | undefined>(undefined);
  const [timetableState, setTimetableState] = useState<TimetableDraftState | null>(null);
  const onTimetableState = useCallback((_hasDraft: boolean, state: TimetableDraftState) => setTimetableState(state), []);
  const runTimetable = (id: TimetableCommand["id"]) => setTimetableCommand((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  // Curriculum & grading (§4.4b): Save (or Approve, once the draft is saved and reviewed) and Change history.
  const [modelCommand, setModelCommand] = useState<AcademicModelCommand | undefined>(undefined);
  const [modelState, setModelState] = useState<AcademicModelActionState | null>(null);
  const runModel = (id: AcademicModelCommand["id"]) => setModelCommand((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  // Promotion approval (§4.4b): Approve plan (ConfirmAction) and Preview.
  const [approvePlanRequest, setApprovePlanRequest] = useState(0);
  const [previewPlanRequest, setPreviewPlanRequest] = useState(0);
  const [planState, setPlanState] = useState<RolloverApprovalState | null>(null);
  // Academic year (§4.4b): Close year (ConfirmAction), Checklist, and Close anyway (reason) in the overflow.
  const [yearCommand, setYearCommand] = useState<YearCloseCommand | undefined>(undefined);
  const [closure, setClosure] = useState<YearClosureState | null>(null);
  const runYear = (id: YearCloseCommand["id"]) => setYearCommand((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  // Attendance and Report delivery (§4.4b): read-only views whose Export (and Refresh) sit in the PageHeader.
  const [attendanceExport, setAttendanceExport] = useState(0);
  const [engagementCommand, setEngagementCommand] = useState<EngagementCommand | undefined>(undefined);
  const runEngagement = (id: EngagementCommand["id"]) => setEngagementCommand((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  // A view reports its header state when it mounts; nothing from a previous visit may show in the meantime.
  // Reset while rendering (not in an effect): child effects run before the parent's, so an effect here would wipe
  // the state the newly mounted panel had just reported.
  const [headerStateView, setHeaderStateView] = useState(view);
  if (headerStateView !== view) {
    setHeaderStateView(view);
    setSelections({}); setTimetableState(null); setModelState(null); setPlanState(null); setClosure(null);
  }
  const { leafVisible } = access;
  const canOpen = useCallback((next: string) => leafVisible("principal", next), [leafVisible]);

  // A link to one exam's report cards opens the view with that exam first and in view.
  const examParam = useExamParam();
  const reviewReady = Boolean(data);
  useEffect(() => {
    if (view !== "report-cards" || !examParam || !reviewReady) return;
    const node = document.getElementById(`report-exam-${examParam}`);
    node?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [view, examParam, reviewReady]);

  /* ── Academic staffing (class and subject teachers, teaching mode, subjects) ── */
  const patchJson = async (url: string, body: Record<string, unknown>, method = "PATCH") => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof result.error === "string" ? result.error : "");
    return result;
  };

  const handleChangeClassTeacher = async (classId: string, teacherId: string) => {
    setSavingClassTeacherId(classId);
    try {
      const result = await patchJson("/api/classes", { id: classId, classTeacherId: teacherId || null });
      toast.success(ui("Class teacher updated"));
      (result.clashes || []).forEach((c: { message: string }) => toast.warning(c.message));
      await reload();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not change the class teacher. Please try again.")));
    } finally {
      setSavingClassTeacherId(null);
    }
  };

  const saveSubjectTeacher = async (subjectId: string, teacherId: string, effectiveFrom?: string) => {
    setSavingSubjectId(subjectId);
    try {
      const result = await patchJson("/api/subjects", { id: subjectId, teacherId: teacherId || null, ...(effectiveFrom ? { effectiveFrom } : {}) });
      toast.success(ui("Subject teacher updated"));
      (result.clashes || []).forEach((c: { message: string }) => toast.warning(c.message));
      await reload();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not change the subject teacher. Please try again.")));
    } finally {
      setSavingSubjectId(null);
    }
  };

  const handleChangeSubjectTeacher = async (_classId: string, subjectId: string, teacherId: string, effectiveFrom?: string) => {
    // SKO-462: a scheduled or already-marked subject shows what moves before the teacher changes.
    const impact = await fetchAcademicImpact("subject", subjectId).catch(() => null);
    if (impact && (impact.counts.timetableSlots || impact.counts.marks)) {
      setConfirm({
        title: ui("Change the teacher of {0}?", [impact.label]),
        description: teacherChangeText(impact, ui, effectiveFrom),
        confirmLabel: ui("Change teacher"),
        tone: "warning",
        run: () => saveSubjectTeacher(subjectId, teacherId, effectiveFrom),
      });
      return;
    }
    await saveSubjectTeacher(subjectId, teacherId, effectiveFrom);
  };

  // Switching to SINGLE makes the API propagate the class teacher across every subject in one call.
  const handleChangeTeachingMode = async (classId: string, mode: "SINGLE" | "SUBJECT") => {
    setApplyingSubjectClassId(classId);
    try {
      const result = await patchJson("/api/classes", { id: classId, teachingMode: mode });
      toast.success(ui(mode === "SINGLE" ? "All subjects now follow the class teacher" : "Each subject can now have its own teacher"));
      (result.clashes || []).forEach((c: { message: string }) => toast.warning(c.message));
      await reload();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not change the teaching mode. Please try again.")));
    } finally {
      setApplyingSubjectClassId(null);
    }
  };

  const handleCreateSubject = async (classId: string, subject: { name: string; totalMarks: number; teacherId: string; applyToAllSections?: boolean }) => {
    if (!subject.name.trim()) { toast.error(ui("Subject name is required")); return false; }
    setCreatingSubjectClassId(classId);
    try {
      const result = await patchJson("/api/subjects", { classId, name: subject.name.trim(), totalMarks: subject.totalMarks || 100, teacherId: subject.teacherId || undefined, applyToAllSections: subject.applyToAllSections || undefined }, "POST");
      toast.success(result.createdCount > 1 ? ui("Subject added to {0} sections", [String(result.createdCount)]) : ui("Subject added"));
      await reload();
      return true;
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not add the subject. Please try again.")));
      return false;
    } finally {
      setCreatingSubjectClassId(null);
    }
  };

  const handleUpdateSubject = async (_classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => {
    setSavingSubjectUpdateId(subjectId);
    try {
      await patchJson("/api/subjects", { id: subjectId, ...updates });
      toast.success(ui("Subject updated"));
      await reload();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not save the subject. Please try again.")));
    } finally {
      setSavingSubjectUpdateId(null);
    }
  };

  const handleDeleteSubject = async (subject: any) => {
    // SKO-462: the real impact, fetched before anything is confirmed (marks are never silently removed).
    const impact = await fetchAcademicImpact("subject", subject.id).catch((e: Error) => { toast.error(friendlyErrorMessage(e)); return null; });
    if (!impact) return;
    const blocked = Boolean(impact.counts.marks || impact.counts.exams || impact.counts.examSchedules);
    setConfirm({
      title: ui("Delete {0}?", [subject.name]),
      description: subjectRemovalText(impact, ui),
      confirmLabel: blocked ? ui("Close") : ui("Delete subject"),
      tone: blocked ? "primary" : "danger",
      run: async () => {
        if (blocked) return;
        const res = await fetch(`/api/subjects?id=${encodeURIComponent(subject.id)}`, { method: "DELETE" });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(friendlyErrorMessage(new Error(typeof result.error === "string" ? result.error : ""), ui("Could not delete the subject. Please try again."))); return; }
        toast.success(ui("Subject deleted"));
        await reload();
      },
    });
  };

  // §4.4b principal · Classes & subjects: Export (secondary) — one row per section with its staffing gaps.
  const exportClasses = () => {
    const rows = (data?.classes ?? []).map((c: any) => {
      const subjects: any[] = c.subjects ?? [];
      return [c.name ?? "", c.section ?? "", String(c.academicYear ?? ""), c.classTeacher?.fullName ?? "", String(subjects.length), String(subjects.filter((s) => !s.teacher && !s.teacherId).length), String((c.students ?? []).length)];
    });
    downloadCSV(`classes-${data?.campusName ?? "campus"}.csv`, [[ui("Class"), ui("Section"), ui("Academic year"), ui("Class teacher"), ui("Subjects"), ui("Subjects without a teacher"), ui("Students")], ...rows]);
  };

  const exportTeachers = () => {
    const rows = (data?.teachers ?? []).map((t: any) => [t.fullName ?? "", t.email ?? "", (t.taughtSubjects ?? []).map((s: any) => s.name ?? s).join("; "), (t.ledClasses ?? []).map((c: any) => [c.name, c.section].filter(Boolean).join(" ")).join("; ")]);
    downloadCSV(`teachers-${data?.campusName ?? "campus"}.csv`, [[ui("Teacher"), ui("Email"), ui("Subjects"), ui("Class teacher of")], ...rows]);
  };

  /* ── Frame states ── */
  // Shaped like the view being opened (addendum 2026-10-22, point 3): Today's tiles and charts, otherwise a
  // PageHeader over a list. The access provider keeps confirmed access for the session, so this shows on the very
  // first load only — never again on a ?view switch or window focus.
  const viewSkeleton = view === "overview" ? <CommandCentreSkeleton tiles={4} /> : <PageSkeleton />;
  if (!access.ready) return viewSkeleton;
  if (!data) {
    if (loadError) {
      return (
        <ErrorState
          title={ui("The academic console could not be loaded")}
          description={ui("Check your connection and try again. Nothing you entered was lost.")}
          onRetry={reload}
        />
      );
    }
    return viewSkeleton;
  }

  const frame = (node: React.ReactNode, opts: { primaryAction?: PageAction; secondaryActions?: PageAction[]; status?: React.ReactNode; tabs?: React.ReactNode; description?: string } = {}) => (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={opts.description ?? description}
        icon={icon}
        primaryAction={opts.primaryAction}
        secondaryActions={opts.secondaryActions}
        status={opts.status}
        tabs={opts.tabs}
      />
      <DegradedNotice degraded={data.degraded} onRetry={reload} />
      {node}
    </div>
  );

  const pickTab = (items: ViewTabItem[]) => (items.some((item) => item.id === tab) ? (tab as string) : items[0].id);

  let content: React.ReactNode;
  switch (view) {
    /* ── Today ── */
    case "overview": {
      const waiting = Number(data.pendingRemarkReviews ?? 0);
      const aiWaiting = Number(data.pendingAIReviews ?? 0);
      // §2.6: a GROUP campus without an active campus admin is a vacancy the group admin fills; the principal
      // never gains campus operations, so say plainly what waits.
      // Only an explicit `false` from the server counts (a missing key must never raise a false alarm).
      const vacancy = accessMap?.hasCampusAdmin === false && session?.institution?.kind === "GROUP";
      const authorityName = session?.institution?.authorityName ?? null;
      // §4.5.11: a secondary never leads into an access notice — each is offered only while its view is open.
      const secondary: PageAction[] = [];
      if (canOpen("timetable")) secondary.push({ id: "open-timetable", label: "Open timetable", icon: CalendarRange, onClick: () => setView("timetable") });
      if (aiWaiting > 0 && canOpen("ai")) secondary.push({ id: "ai-drafts", label: ui("AI drafts waiting ({0})", [aiWaiting]), icon: Sparkles, onClick: () => setView("ai") });
      // Addendum 2026-10-22 — the two flagships lead Today for the academic lead: AI Workflows (/ai) and Exam
      // Studio (/ai/studio). The principal is not the institution authority, so the school-setup questionnaire is
      // never offered here; the screen's one primary stays "Review report cards".
      const showAiCard = canOpen("ai-workflows");
      const showExamCard = canOpen("exam-studio");
      const flagships = showAiCard || showExamCard ? (
        <div className={cn("grid gap-4", showAiCard && showExamCard && "lg:grid-cols-2")}>
          {/* AI Workflows first-login sheet (Slice 7); hidden once ready or set aside. */}
          {showAiCard ? <div className={cn(showExamCard && "lg:col-span-2")}><SetupPrompt /></div> : null}
          {showAiCard ? (
            <FlagshipCard
              kind="ai-workflows"
              title="AI Workflows"
              description="Let AI draft timetables, exam sessions and announcements for your campus. You review every draft, and nothing applies until you approve it."
              action={{ label: "Run an AI workflow", href: "/ai" }}
              tourAnchor="principal.today.flagship-ai"
            />
          ) : null}
          {showExamCard ? (
            <FlagshipCard
              kind="exam-studio"
              title="Exam Studio"
              description="Create an exam with AI from your source material, review the paper, then deliver it securely and mark it."
              action={{ label: "Create an exam in Exam Studio", href: "/ai/studio" }}
              tourAnchor="principal.today.flagship-exams"
            />
          ) : null}
        </div>
      ) : null;
      content = frame(
        <>
          {flagships}
          <ActionQueue campusId={data.campusId} />
          <AcademicOverview data={data} variant="principal" onNavigate={(next) => setView(next)} canOpen={canOpen} />
        </>,
        {
          primaryAction: access.has("reports")
            ? { id: "review-report-cards", label: waiting > 0 ? ui("Review report cards ({0})", [waiting]) : "Review report cards", icon: ClipboardList, onClick: () => setView("report-cards") }
            : undefined,
          secondaryActions: secondary,
          status: retiredNotice || vacancy ? (
            <div className="space-y-2">
              {retiredNotice ? <Alert tone="info" live="polite" compact>{ui(retiredNotice)}</Alert> : null}
              {vacancy ? (
                <Alert tone="warning" live="off" icon={AlertTriangle} title={ui("No campus admin is appointed")}>
                  {authorityName
                    ? ui("Admissions, fee approvals and campus setup wait until {0} appoints one.", [authorityName])
                    : ui("Admissions, fee approvals and campus setup wait until your group admin appoints one.")}
                </Alert>
              ) : null}
            </div>
          ) : undefined,
        },
      );
      break;
    }

    /* ── Results ── */
    case "report-cards": {
      const waitingExams: any[] = data.reviewExams ?? [];
      // `?exam=<id>` (job and notification links): that exam first and outlined; the rest keep their order.
      const exams = examParam ? [...waitingExams.filter((exam) => exam.id === examParam), ...waitingExams.filter((exam) => exam.id !== examParam)] : waitingExams;
      const linkedGone = Boolean(examParam) && !waitingExams.some((exam) => exam.id === examParam);
      // §4.4: "Approve selected" approves the versions ticked in every exam below; "Preview release" opens the
      // first ticked version beside the last approved one (else the first exam's first version).
      const picked = exams.filter((exam) => (selections[exam.id]?.selected ?? 0) > 0);
      const selectedCount = picked.reduce((sum, exam) => sum + (selections[exam.id]?.selected ?? 0), 0);
      const blockedBy = picked.map((exam) => selections[exam.id]).find((state) => state && !state.canApprove)?.reason ?? null;
      const previewExamId = picked[0]?.id ?? exams[0]?.id ?? null;
      content = frame(
        exams.length ? (
          <div className="space-y-6">
            {exams.map((exam, index) => (
              <div key={exam.id} id={`report-exam-${exam.id}`} className={cn("sk-panel scroll-mt-4 p-4 sm:p-5", exam.id === examParam && "ring-2 ring-primary/40")}>
                {/* §9.4: the spotlight anchor stays unique on the page — the first pipeline carries it. */}
                <ReportCardPipeline
                  exam={exam}
                  campusId={data.campusId}
                  mode="lead"
                  tourAnchor={index === 0}
                  hideApprove
                  approveRequest={approveReportsRequest}
                  previewRequest={exam.id === previewExamId ? previewReportsRequest : undefined}
                  onSelectionChange={onReportSelection}
                  onChanged={() => void reload()}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title={ui("No exams ready for review")}
            description={ui("An exam appears here once its marks are locked.")}
            action={access.has("exams") ? <Button variant="outline" type="button" onClick={() => setView("exam-cycles")}>{ui("Open Exams & results")}</Button> : undefined}
          />
        ),
        {
          description: description ?? "Approve report versions; the office then sends them to families.",
          primaryAction: exams.length ? {
            id: "approve-selected",
            label: selectedCount > 0 ? ui("Approve selected ({0})", [selectedCount]) : "Approve selected",
            icon: CheckCheck,
            disabled: selectedCount === 0 || Boolean(blockedBy),
            disabledReason: blockedBy ?? "Tick the report versions to approve first.",
            onClick: () => setApproveReportsRequest((n) => n + 1),
          } : undefined,
          secondaryActions: exams.length ? [{ id: "preview-release", label: "Preview release", icon: Eye, onClick: () => setPreviewReportsRequest((n) => n + 1) }] : undefined,
          status: linkedGone ? <Alert tone="info" live="polite" compact>{ui("That exam's report cards are no longer waiting for your review.")}</Alert> : undefined,
        },
      );
      break;
    }

    case "exam-cycles": {
      const items: ViewTabItem[] = [
        { id: "exams", label: "Exams" },
        { id: "shared-questions", label: "Shared questions" },
      ];
      const active = pickTab(items);
      const examsTab = active === "exams";
      content = frame(
        examsTab
          ? <ExamsWorkspace campusId={data.campusId} hideActions scheduleRequest={scheduleExamRequest} refreshRequest={refreshExamsRequest} />
          : <QuestionNetwork />,
        {
          description: description ?? "Schedule exams, lock marks, review and publish results.",
          // §4.4: Schedule exam (primary) and Refresh belong to the Exams tab; shared questions are a queue.
          primaryAction: examsTab ? { id: "schedule-exam", label: "Schedule exam", icon: Plus, onClick: () => setScheduleExamRequest((n) => n + 1) } : undefined,
          secondaryActions: examsTab ? [{ id: "refresh-exams", label: "Refresh", icon: RefreshCw, onClick: () => setRefreshExamsRequest((n) => n + 1) }] : undefined,
          tabs: <ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Exams sections" />,
        },
      );
      break;
    }

    /* ── Teaching ── */
    case "timetable": {
      // §4.4: Publish only while the chosen class has a draft (disabled with its reason while edits are unsaved);
      // Print always; Unpublish (ConfirmAction inside the studio) only for a published timetable.
      const tt = timetableState;
      const secondaries: PageAction[] = [{ id: "print-timetable", label: "Print", icon: Printer, onClick: () => runTimetable("print") }];
      if (tt?.published) secondaries.push({ id: "unpublish-timetable", label: "Unpublish", tone: "danger", onClick: () => runTimetable("unpublish") });
      content = frame(<TimetableStudio campusId={data.campusId} hideActions command={timetableCommand} onDraftState={onTimetableState} />, {
        description: description ?? "Build and publish the timetable and arrange cover.",
        primaryAction: tt?.hasDraft ? {
          id: "publish-timetable",
          label: "Publish",
          icon: Upload,
          disabled: !tt.canPublish,
          disabledReason: tt.unsavedChanges > 0 ? "Save your changes before you publish." : "Open the class view of a timetable to publish it.",
          onClick: () => runTimetable("publish"),
        } : undefined,
        secondaryActions: secondaries,
      });
      break;
    }

    case "classes":
      content = (
        <div className="space-y-5">
          <HostedAcademicPanel
            title={title}
            headingLevel={1}
            description={description ?? "Assign class and subject teachers. Your campus admin creates and archives classes."}
            secondaryActions={[{ id: "export-classes", label: "Export", icon: Download, onClick: exportClasses, disabled: !(data.classes ?? []).length }]}
            // §4.3: the panel's header is the view's one h1; the conflicts banner sits under it, never above.
            notice={<TeacherConflictsBanner />}
            classes={data.classes ?? []}
            teachers={data.teachers ?? []}
            students={data.students ?? []}
            campusName={data.campusName}
            // Creating, renaming, sectioning and archiving classes and enrolling students are campus operations
            // (G23); without onAddClass / onAddStudent / onDeleteClass / onUpdateClass the panel renders none of
            // those controls.
            onViewClass={setSelectedClass}
            onChangeTeacher={handleChangeClassTeacher}
            onDeleteSubject={handleDeleteSubject}
            onUpdateSubject={handleUpdateSubject}
          />
        </div>
      );
      break;

    case "academic-rules": {
      const items: ViewTabItem[] = [
        { id: "curriculum", label: "Curriculum" },
        { id: "grading", label: "Grading rules" },
      ];
      const active = pickTab(items);
      const curriculum = active === "curriculum";
      // §4.4b: on the curriculum tab the one primary follows the workflow — Save draft while there are edits,
      // then Approve once the saved draft has been reviewed; Change history jumps to the version list. Grading
      // rules are edited class by class in their own dialog, which carries its own Save.
      const ms = modelState;
      const modelPrimary: PageAction | undefined = !curriculum || !ms ? undefined
        : ms.next === "approve"
          ? { id: "approve-model", label: "Approve version", icon: ShieldCheck, disabled: !ms.canApprove || ms.busy, disabledReason: ms.approveReason ?? undefined, onClick: () => runModel("approve") }
          : { id: "save-model", label: "Save draft", icon: CheckCheck, disabled: !ms.canSave || ms.busy, disabledReason: ms.saveReason ?? undefined, onClick: () => runModel("save") };
      content = frame(
        active === "grading"
          ? <GradingRulesPanel campusId={data.campusId} hideHeading />
          : <AcademicModelPanel campusId={data.campusId} hideHeading hideActions command={modelCommand} onActionState={setModelState} />,
        {
          description: description ?? "The curriculum model, terms and how marks become grades.",
          primaryAction: modelPrimary,
          secondaryActions: curriculum ? [{ id: "model-history", label: "Change history", icon: History, onClick: () => runModel("history") }] : undefined,
          tabs: <ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Curriculum and grading sections" />,
        },
      );
      break;
    }

    case "school-calendar":
      content = frame(<AcademicCalendar campusId={data.campusId} role="PRINCIPAL" readOnly />, {
        description: description ?? "Terms, holidays and exam dates. Your campus admin keeps the calendar.",
        secondaryActions: [{ id: "print", label: "Print", icon: Printer, onClick: () => window.print() }],
      });
      break;

    /* ── Teachers ── */
    case "teachers":
      content = frame(
        <FacultyPanel
          teachers={data.teachers ?? []}
          pendingInvites={[]}
          canInvite={false}
          onInvite={() => undefined}
          onRemove={() => undefined}
          onResend={() => undefined}
          onCancel={() => undefined}
          onViewTeacher={(teacher, visible) => { setSelectedTeacher(teacher); setTeacherSequence(visible || []); }}
        />,
        {
          description: description ?? "Who teaches what on this campus. Your campus admin invites staff and keeps their records.",
          secondaryActions: [{ id: "export-teachers", label: "Export", icon: Download, onClick: exportTeachers, disabled: !(data.teachers ?? []).length }],
        },
      );
      break;

    case "teacher-performance":
      content = frame(<TeacherPerformancePanel hideHeading noteRequest={noteRequest} exportRequest={exportEvidenceRequest} />, {
        description: description ?? "Record teaching evidence and support notes for each teacher.",
        // §4.4b: Add note (primary) for the chosen teacher; Export the rows on screen.
        primaryAction: { id: "add-note", label: "Add note", icon: Plus, onClick: () => setNoteRequest((n) => n + 1) },
        secondaryActions: [{ id: "export-evidence", label: "Export", icon: Download, onClick: () => setExportEvidenceRequest((n) => n + 1) }],
      });
      break;

    case "leave":
      // The leave panel hosts its own PageHeader; the principal decides teaching-staff leave only (G36).
      content = (
        <LeaveManagementPanel
          campusId={data.campusId}
          tabs={["queue"]}
          title={title}
          description="Decide teachers' leave with cover in mind. Office staff leave goes to your campus admin."
        />
      );
      break;

    /* ── Learners ── */
    case "students":
      content = (
        <div className="space-y-6">
          <StudentsPanel
            readOnly
            title={title}
            headingLevel={1}
            students={data.students ?? []}
            classes={data.classes ?? []}
            onViewStudent={(student, visible) => { setSelectedStudent(student); setStudentSequence(visible || []); }}
            onExport={(visible) => exportStudentsToCSV(visible ?? data.students ?? [], data.campusName)}
            onRefresh={reload}
          />
          <PathwayPanel />
        </div>
      );
      break;

    case "attendance":
      content = frame(<UnifiedAttendancePanel tabs={["students"]} exportRequest={attendanceExport} />, {
        description: description ?? "Today's registers, absences and the classes still to mark.",
        secondaryActions: [{ id: "export-attendance", label: "Export", icon: Download, onClick: () => setAttendanceExport((n) => n + 1) }],
      });
      break;

    case "learning-actions":
      content = frame(<LearningActions mode="review" />, {
        description: description ?? "Activate the support plans teachers propose for students.",
      });
      break;

    case "promote-archive": {
      // §4.4b: Approve plan (ConfirmAction inside the review) as the primary, disabled with its reason until the
      // plan is approvable; Preview shows every learner's decision.
      const ps = planState;
      content = frame(
        <RolloverReview
          campusId={data.campusId}
          mode="approve"
          hideApprove
          approveRequest={approvePlanRequest}
          previewRequest={previewPlanRequest}
          onApprovalState={setPlanState}
        />,
        {
          description: description ?? "Review the promotion plan your campus admin prepared and approve the exact version.",
          primaryAction: ps?.approver ? {
            id: "approve-plan",
            label: ps.version ? ui("Approve plan (version {0})", [ps.version]) : "Approve plan",
            icon: ShieldCheck,
            disabled: !ps.canApprove,
            disabledReason: ps.reason ?? undefined,
            onClick: () => setApprovePlanRequest((n) => n + 1),
          } : undefined,
          secondaryActions: ps?.hasPlan ? [{ id: "preview-plan", label: "Preview", icon: Eye, onClick: () => setPreviewPlanRequest((n) => n + 1) }] : undefined,
        },
      );
      break;
    }

    case "year-cycle": {
      // §4.4b: Close year (ConfirmAction) as the primary — disabled with its reason until the checklist is green;
      // Checklist and Refresh as secondaries; "Close anyway…" (typed reason) in the overflow for the academic lead.
      // M56: the "Next-year planning" tab shows the campus admin's capacity scenarios read-only.
      const items: ViewTabItem[] = [
        { id: "close", label: "Close the year" },
        { id: "planning", label: "Next-year planning" },
      ];
      const active = pickTab(items);
      const cs = closure;
      const closing = active === "close";
      const yearSecondaries: PageAction[] = [];
      if (closing && cs?.hasOpenYear) {
        yearSecondaries.push({ id: "year-checklist", label: "Checklist", icon: ListChecks, onClick: () => runYear("focus") });
        yearSecondaries.push({ id: "year-refresh", label: "Refresh checklist", icon: RefreshCw, onClick: () => runYear("refresh") });
        if (cs.canForce) yearSecondaries.push({ id: "year-force", label: "Close anyway…", tone: "danger", onClick: () => runYear("force") });
      }
      content = frame(
        closing ? (
          <CycleManagementPanel
            campusId={data.campusId}
            canForceClose={access.has("academicLead")}
            canManageCycles={false}
            onNavigate={(next) => setView(next)}
            canOpen={canOpen}
            hideCloseActions
            closeCommand={yearCommand}
            onClosureState={setClosure}
          />
        ) : <ScenarioPlanner readOnly />,
        {
          description: description ?? "Close the academic year when its checklist is complete.",
          primaryAction: closing && cs?.hasOpenYear ? {
            id: "close-year",
            label: "Close year",
            icon: ShieldCheck,
            disabled: !cs.ready || cs.loading,
            disabledReason: "Finish the checklist below before closing the year.",
            onClick: () => runYear("close"),
          } : undefined,
          secondaryActions: yearSecondaries.length ? yearSecondaries : undefined,
          tabs: <ViewTabs items={items} value={active} onChange={setTab} ariaLabel="Academic year sections" />,
        },
      );
      break;
    }

    /* ── More ── */
    case "ai":
      content = frame(
        <AiWorkflowsHome
          title="AI assistant"
          hideHeading
          features={PRINCIPAL_AI_FEATURES}
          insights={data.aiInsights}
          reviewItems={data.pendingAIReviewItems ?? []}
          campusId={data.campusId}
          onComplete={() => void reload()}
        />,
        {
          description: description ?? "Draft insights and review AI-written remarks before families see them.",
          primaryAction: {
            id: "new-ai-request",
            label: "New request",
            icon: Sparkles,
            onClick: () => {
              const field = document.getElementById(AI_COMPOSER_INPUT_ID);
              field?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
              field?.focus({ preventScroll: true });
            },
          },
        },
      );
      break;

    case "engagement":
      content = frame(<EngagementPanel mode="academic" hideActions command={engagementCommand} />, {
        description: description ?? "Report-card and exam notices sent to families. Your campus admin runs reminders.",
        secondaryActions: [
          { id: "export-delivery", label: "Export", icon: Download, onClick: () => runEngagement("export") },
          { id: "refresh-delivery", label: "Refresh", icon: RefreshCw, onClick: () => runEngagement("refresh") },
        ],
      });
      break;

    case "my-leave":
      content = frame(<MyLeavePanel />, { description: description ?? "Apply for leave and track your requests." });
      break;

    default:
      content = frame(
        <EmptyState icon={LayoutDashboard} title={ui("This workspace is not available")} description={ui("Choose a workspace from the menu.")} />,
      );
  }

  return (
    <>
      {content}

      {selectedClass ? (
        <ClassDetailModal
          cls={selectedClass}
          students={(data.students ?? []).filter((student: any) => student.class?.id === selectedClass.id)}
          teachers={data.teachers ?? []}
          classes={data.classes ?? []}
          teacherBusy={savingClassTeacherId === selectedClass.id}
          subjectBusyId={savingSubjectId}
          creatingSubject={creatingSubjectClassId === selectedClass.id}
          teachingModeBusy={applyingSubjectClassId === selectedClass.id}
          classUpdateBusy={false}
          subjectUpdateBusyId={savingSubjectUpdateId}
          onClose={() => setSelectedClass(null)}
          onChangeTeacher={(classId, teacherId) => void handleChangeClassTeacher(classId, teacherId)}
          onChangeTeachingMode={(classId, mode) => void handleChangeTeachingMode(classId, mode)}
          onCreateSubject={handleCreateSubject}
          onChangeSubjectTeacher={(classId, subjectId, teacherId) => void handleChangeSubjectTeacher(classId, subjectId, teacherId)}
          onViewStudent={(student) => { setSelectedClass(null); setSelectedStudent(student); }}
          onDeleteSubject={handleDeleteSubject}
          onUpdateSubject={handleUpdateSubject}
          // Enrolling, renaming and archiving classes are campus operations (G23; the server refuses them for the
          // principal). Without onAddStudent / onDeleteClass / onUpdateClass the dialog renders none of those
          // controls (§4.5.6, §4.5.11) — no ghost buttons, no info toast in their place.
        />
      ) : null}

      {selectedStudent ? (
        <StudentDetailModal
          student={selectedStudent}
          busy={false}
          readOnly
          sequence={studentSequence.map((s: any) => ({ id: s.id, label: s.fullName }))}
          onNavigate={(id) => { const next = studentSequence.find((s: any) => s.id === id); if (next) setSelectedStudent(next); }}
          onClose={() => setSelectedStudent(null)}
          onMove={() => undefined}
          onDelete={() => undefined}
          onUpdate={async () => undefined}
        />
      ) : null}

      {selectedTeacher ? (
        <TeacherDetailModal
          teacher={selectedTeacher}
          showStaffRecord={false}
          sequence={teacherSequence.map((t: any) => ({ id: t.id, label: t.fullName }))}
          onNavigate={(id) => { const next = teacherSequence.find((t: any) => t.id === id); if (next) setSelectedTeacher(next); }}
          onClose={() => setSelectedTeacher(null)}
        />
      ) : null}

      <ConfirmAction
        open={!!confirm}
        title={confirm?.title || ""}
        description={confirm?.description || ""}
        confirmLabel={confirm?.confirmLabel}
        cancelLabel={ui("Keep editing")}
        tone={confirm?.tone}
        busy={confirmBusy}
        onConfirm={async () => {
          if (!confirm) return;
          setConfirmBusy(true);
          try { await confirm.run(); } finally { setConfirmBusy(false); setConfirm(null); }
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

