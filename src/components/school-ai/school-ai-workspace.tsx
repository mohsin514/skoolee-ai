"use client";
import { AutomaticWorkspace } from "@/components/automation/automatic-workspace";

import { roleGuideCopy } from "@/components/onboarding/role-guide-copy";
import { canConfigureCampus, roleAllowsWorkflowTab } from "@/lib/school-ai/setup-role";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, History, LayoutDashboard, Mail, ReceiptText, ListChecks, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { FlagshipChip } from "@/components/ui/flagship";
import { normalizeUserRole } from "@/lib/roles";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { TaskFeedback, TaskStatus } from "@/components/ui/task-patterns";
import { Alert } from "@/components/ui/alert";
import { SkeletonBar } from "@/components/ui/skeleton";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { readSetupDraft, setupReadiness, type SetupDraft, type SetupAnswers } from "@/lib/school-ai/onboarding";
import type { AiWorkspaceRecord, SourceData, WorkspaceCapabilities } from "@/lib/school-ai/types";
import { StudioOverview, type StudioWorkspaceTab } from "./exam-studio/studio-overview";
import { StudioSpaces } from "./exam-studio/studio-spaces";
import { STUDIO_SCOPE_EVENT } from "./exam-studio/studio-scope";
import { resolveStudioScope } from "./exam-studio/studio-scope";
import { studioShellCopy } from "./exam-studio/studio-shell-copy";
import { EXAM_STUDIO_HREF } from "@/lib/school-ai/navigation";
import { moduleWorkspaceHref } from "@/lib/school-ai/navigation";
import { AssessmentStudio } from "./assessment-studio";
import { AcademicSetupPanel, isAcademicSetupPlan } from "./academic-setup-panel";
import { TimetableSetupPanel, isTimetableSetupPlan } from "./timetable-setup-panel";
import { RevisionHistoryPanel } from "./revision-history";
import { AnnouncementPanel, isAnnouncementPlan } from "./announcement-panel";
import { FeeInvoicePanel, isFeeInvoicePlan } from "./fee-invoice-panel";
import { ExamSessionPlanPanel, isExamSessionPlan } from "./exam-session-plan-panel";
import { RunsPanel } from "./runs-panel";
import { SchoolOperationsPanel, isSchoolOperationsPlan } from "./school-operations-panel";
import { isSchoolOperationsOperation } from "@/lib/school-ai/school-operations";
import { SchoolSetupPanel,isSchoolSetupPlan } from "./school-setup-panel";
import { FinanceOperationsPanel } from "./finance-operations-panel";
import { SetupTasksPanel } from "./setup-tasks-panel";
import { GuidedSetup } from "./guided-setup";
import { PrivateAssistant } from "./private-assistant";
import { DomainAssistant } from "./domain-assistant";
import { SourceLibrary } from "./source-library";
import { KnowledgePanel } from "./knowledge-panel";
import { WorkspaceInsights } from "./workspace-insights";
import { PolicyPanel, WorkPanel } from "./planning-panels";
import { UNCONFIGURED_CAPABILITIES, workspaceRequest, type AIFeatureCapabilities, type RecordAction, type SaveRecord } from "./workspace-client";
import styles from "./school-ai.module.css";
import studioStyles from "./exam-studio/studio-shell.module.css";
import { WorkspaceDraftBoundary, useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { DemoWorkflowPanel } from "./demo-workflow-panel";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import { prototypeCopy } from "./prototype-copy";
import { useSearchParams } from "next/navigation";
import { START_CAMPUS_SETUP_EVENT } from "@/lib/onboarding/launch-plan";
import { WorkspaceLaunchpad } from "./workspace-launchpad";
import { workspaceLaunchCopy } from "./workspace-launch-copy";
import { WorkspaceIntent, replaceWorkspaceIntent } from "./workspace-intent";

type Tab = "overview" | "sources" | "curriculum" | "academicSetup" | "timetableSetup" | "announcements" | "work" | "policies" | "history" | "feeInvoices" | "examPlanning" | "setupTasks" | "schoolOperations" | "financeOperations" | "runs" | "schoolSetup" | "knowledge";
type Capabilities = WorkspaceCapabilities & { setupDefaults?: SetupAnswers };
interface WorkspaceResponse { records: AiWorkspaceRecord[]; capabilities: Capabilities; nextCursor?: string | null }
const tabs = [
  { id: "overview", Icon: LayoutDashboard }, { id: "schoolSetup", Icon: ListChecks }, { id: "schoolOperations", Icon: CalendarDays }, { id: "financeOperations", Icon: ReceiptText }, { id: "runs", Icon: ListChecks }, { id: "sources", Icon: FileText }, { id: "curriculum", Icon: BookOpen }, { id: "academicSetup", Icon: CalendarDays }, { id: "timetableSetup", Icon: Clock3 }, { id: "announcements", Icon: Mail }, { id: "examPlanning", Icon: CalendarDays }, { id: "feeInvoices", Icon: ReceiptText }, { id: "setupTasks", Icon: ListChecks }, { id: "work", Icon: ClipboardList }, { id: "policies", Icon: ShieldCheck }, {id:"knowledge",Icon:BookOpen}, { id: "history", Icon: History },
] as const;

export function SchoolAIWorkspace(props: { role?: string; campusId?: string | null; examOnly?: boolean } = {}) {
  return <WorkspaceDraftBoundary><SchoolAIWorkspaceContent {...props} /></WorkspaceDraftBoundary>;
}

function SchoolAIWorkspaceContent({ role: initialRole, campusId: initialCampusId, examOnly = false }: { role?: string; campusId?: string | null; examOnly?: boolean }) {
  const searchParams = useSearchParams();
  const setupIntent = searchParams.get("setup") === "1" && !searchParams.has("workflow");
  const { language } = useLocale();
  const ui = useUiText();
  const c = schoolAICopy(language);
  const launchCopy = workspaceLaunchCopy(language);
  const prototype = prototypeCopy(language);
  const studioCopy = studioShellCopy(language);
  const guard = useWorkspaceDraftNavigation();
  const [records, setRecords] = useState<AiWorkspaceRecord[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [features, setFeatures] = useState<AIFeatureCapabilities>(UNCONFIGURED_CAPABILITIES);
  const [featureStatusKnown, setFeatureStatusKnown] = useState(false);
  const [featureStatusFailed, setFeatureStatusFailed] = useState(false);
  const [unavailableWorkflow, setUnavailableWorkflow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [academicRecordId, setAcademicRecordId] = useState<string | null>(null);
  const [timetableRecordId, setTimetableRecordId] = useState<string | null>(null);
  const [announcementRecordId, setAnnouncementRecordId] = useState<string | null>(null);
  const [feeRecordId, setFeeRecordId] = useState<string | null>(null);
  const [examPlanRecordId, setExamPlanRecordId] = useState<string | null>(null);
  const [operationRecordId, setOperationRecordId] = useState<string | null>(null);
  const [schoolSetupRecordId,setSchoolSetupRecordId] = useState<string | null>(null);
  const [financeOperationRecordId, setFinanceOperationRecordId] = useState<string | null>(null);
  const [workflowRecordId, setWorkflowRecordId] = useState<string | null>(null);
  const [policyRecordId, setPolicyRecordId] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [openingSetup, setOpeningSetup] = useState(false);
  const [setupRecord, setSetupRecord] = useState<AiWorkspaceRecord | undefined>();
  // /ai?workflow=schoolSetup reached before a campus is chosen (a group admin with several campuses): the
  // questionnaire opens as soon as one is picked.
  const [setupAfterCampus, setSetupAfterCampus] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedCampus, setSelectedCampus] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mounted = useRef(true);
  const setupRequested = useRef(false);
  const setupCreateKey = useRef<string | null>(null);
  const setupLoad = useRef<AbortController | null>(null);
  const featureLoad = useRef<AbortController | null>(null);
  const scopeInitialized = useRef(false);
  const requestSequence = useRef(0);
  const toolContent = useRef<HTMLDivElement>(null);
  const focusOpenedRecord = useRef(false);
  const role = capabilities?.role || initialRole || "";
  const manager = ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(role);
  const subjects = capabilities?.subjects || [];
  const subject = subjects.find(item => item.id === selectedSubject);
  const campusId = subject?.campusId || (manager ? capabilities?.campuses.find(item => item.id === selectedCampus)?.id || null : capabilities?.campusId || initialCampusId || null);
  const scope = subject ? { subjectId: subject.id, classId: subject.classId } : {};
  const needsSubject = role === "TEACHER" && !subject;
  const needsCampus = manager && !campusId;
  const canCreate = Boolean(capabilities?.canCreate && !needsSubject && !needsCampus);
  const visibleRecords = records.filter(record => (!examOnly || ["SOURCE", "CURRICULUM", "PAPER", "BRIEF", "PRACTICE"].includes(record.kind) || isExamSessionPlan(record)) && !needsCampus && record.campusId === campusId && (!needsSubject && (role !== "TEACHER" || record.data.subjectId === subject?.id && record.data.classId === subject?.classId)));
  useWorkspaceDraft(uploading);
  const hasKind = (kind: AiWorkspaceRecord["kind"]) => capabilities?.kinds.includes(kind) ?? false;
  const putRecord = useCallback((record: AiWorkspaceRecord) => setRecords(previous => [record, ...previous.filter(item => item.id !== record.id)]), []);
  const putRecords = useCallback((generated: AiWorkspaceRecord[]) => setRecords(previous => [...generated, ...previous.filter(item => !generated.some(record => record.id === item.id))]), []);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const result = await workspaceRequest<WorkspaceResponse>("/api/school-ai/workspace");
      if (!mounted.current || sequence !== requestSequence.current) return;
      setRecords(result.records); setCapabilities(result.capabilities); setNextCursor(result.nextCursor || null); setError("");
      if (!scopeInitialized.current) {
        scopeInitialized.current = true;
        const assignedCampus = result.capabilities.campuses.find(campus => campus.id === initialCampusId);
        setSelectedCampus(assignedCampus?.id || (result.capabilities.campuses.length === 1 ? result.capabilities.campuses[0].id : ""));
        if (result.capabilities.role === "TEACHER" && result.capabilities.subjects.length === 1) setSelectedSubject(result.capabilities.subjects[0].id);
      }
    } catch { if (mounted.current && sequence === requestSequence.current) setError("failed"); }
    finally { if (mounted.current && sequence === requestSequence.current) setLoading(false); }
  }, [initialCampusId, setError]);
  const refreshFeatures = useCallback(async () => {
    featureLoad.current?.abort();
    const abort = new AbortController();
    featureLoad.current = abort;
    setFeatureStatusKnown(false); setFeatureStatusFailed(false);
    try {
      const result = await workspaceRequest<AIFeatureCapabilities | { capabilities: AIFeatureCapabilities }>("/api/school-ai/capabilities", { signal: abort.signal });
      if (mounted.current && !abort.signal.aborted) { setFeatures({ ...UNCONFIGURED_CAPABILITIES, ...("capabilities" in result ? result.capabilities : result) }); setFeatureStatusKnown(true); }
    } catch { if (mounted.current && !abort.signal.aborted) { setFeatures(UNCONFIGURED_CAPABILITIES); setFeatureStatusFailed(true); } }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh(); void refreshFeatures();
    return () => { mounted.current = false; featureLoad.current?.abort(); };
  }, [refresh, refreshFeatures]);
  const loadSetup = useCallback(async () => {
    if (!canConfigureCampus(role) || !campusId || !capabilities?.canCreate || !capabilities.kinds.includes("ONBOARDING")) return;
    setupLoad.current?.abort();
    const controller = new AbortController(); setupLoad.current = controller;
    setOpeningSetup(true); setError(""); setNotice("");
    try {
      // Query the selected campus directly: an older interview can be absent from the latest workspace page.
      const result = await workspaceRequest<WorkspaceResponse>(`/api/school-ai/workspace?kind=ONBOARDING&activeOnly=1&limit=1&campusId=${encodeURIComponent(campusId)}`, { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      setSetupRecord(result.records[0]);
      if (result.records[0]) putRecord(result.records[0]);
      setSetup(true);
    } catch { if (mounted.current && !controller.signal.aborted) setError("failed"); }
    finally { if (mounted.current && !controller.signal.aborted) setOpeningSetup(false); }
  }, [role, campusId, capabilities, putRecord, setSetup, setError, setNotice]);
  useEffect(() => () => { setupLoad.current?.abort(); }, [campusId]);
  useEffect(() => {
    const start = () => { if (!examOnly) guard(() => { void loadSetup(); }); };
    window.addEventListener(START_CAMPUS_SETUP_EVENT, start);
    return () => window.removeEventListener(START_CAMPUS_SETUP_EVENT, start);
  }, [examOnly, guard, loadSetup]);
  useEffect(() => {
    if (!setupIntent) { setupRequested.current = false; return; }
    if (examOnly || !capabilities || !capabilities.canCreate || setupRequested.current || needsCampus) return;
    setupRequested.current = true;
    // Only a questionnaire owner (see canRunQuestionnaire below) is taken straight into it.
    const ownsSetup = canConfigureCampus(role) && Boolean(capabilities.tools?.some(tool => tool.operation === "setup.apply_changes"));
    if (capabilities.kinds.includes("ONBOARDING") && ownsSetup) {
      void loadSetup();
    }
  }, [role, capabilities, campusId, needsCampus, examOnly, setupIntent, loadSetup]);
  useEffect(() => {
    if (!setupAfterCampus || needsCampus || examOnly) return;
    const frame = requestAnimationFrame(() => { setSetupAfterCampus(false); void loadSetup(); });
    return () => cancelAnimationFrame(frame);
  }, [setupAfterCampus, needsCampus, examOnly, loadSetup]);
  const saveRecord: SaveRecord = async (kind, title, data, existing, idempotencyKey) => {
    const result = await workspaceRequest<{ record: AiWorkspaceRecord }>(existing ? `/api/school-ai/workspace/${encodeURIComponent(existing.id)}` : "/api/school-ai/workspace", {
      method: existing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing ? { version: existing.version, title, data, action: "save" } : { kind, title, campusId, data, idempotencyKey: idempotencyKey || crypto.randomUUID() }),
    });
    if (mounted.current) putRecord(result.record);
    return result.record;
  };
  const recordAction: RecordAction = async (record, action) => {
    const result = await workspaceRequest<{ record: AiWorkspaceRecord }>(`/api/school-ai/workspace/${encodeURIComponent(record.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: record.version, action }) });
    if (mounted.current) putRecord(result.record);
    return result.record;
  };
  const upload = async (file: File, origin: "upload" | "camera", documentKind: SourceData["documentKind"] = "other", signal?: AbortSignal) => {
    if (!canCreate || uploading) throw new Error("failed");
    if (!file.size || file.size > 10 * 1024 * 1024) { setError("uploadInvalid"); throw new Error("invalid"); }
    if (!features.documentUpload) { setError("serviceUnavailable"); throw new Error("unavailable"); }
    setUploading(true); setError(""); setNotice("");
    try {
      const body = new FormData(); body.append("file", file); body.append("documentKind", documentKind); body.append("language", language); body.append("origin", origin);
      if (campusId) body.append("campusId", campusId);
      if (subject) { body.append("subjectId", subject.id); body.append("classId", subject.classId); }
      const result = await workspaceRequest<{ record: AiWorkspaceRecord }>("/api/school-ai/intake", { method: "POST", body, signal });
      if (mounted.current) { putRecord(result.record); setNotice(c.sourceAdded); }
    } catch (error) { if (mounted.current) setError(error instanceof Error && error.message === "unavailable" ? "serviceUnavailable" : "failed"); throw error; }
    finally { if (mounted.current) setUploading(false); }
  };
  const changeScope = (next: () => void) => guard(() => {
    setupLoad.current?.abort(); setOpeningSetup(false); setupRequested.current = false;
    setError(""); setNotice(""); setSetupRecord(undefined); setupCreateKey.current = null; setAcademicRecordId(null); setTimetableRecordId(null); setAnnouncementRecordId(null); setFeeRecordId(null); setExamPlanRecordId(null); setOperationRecordId(null); setFinanceOperationRecordId(null); setSchoolSetupRecordId(null); setWorkflowRecordId(null); setPolicyRecordId(null); next();
  });
  // SKO-500: a Studio space may move the scope to a subject this person can open (a requested paper's class).
  useEffect(() => {
    const onScope = (event: Event) => {
      const subjectId = (event as CustomEvent<{ subjectId?: string }>).detail?.subjectId;
      if (subjectId && subjectId !== selectedSubject && subjects.some(item => item.id === subjectId)) changeScope(() => setSelectedSubject(subjectId));
    };
    window.addEventListener(STUDIO_SCOPE_EVENT, onScope);
    return () => window.removeEventListener(STUDIO_SCOPE_EVENT, onScope);
  });
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try { const result = await workspaceRequest<WorkspaceResponse>(`/api/school-ai/workspace?cursor=${encodeURIComponent(nextCursor)}`); setRecords(previous => [...previous, ...result.records.filter(item => !previous.some(record => record.id === item.id))]); setNextCursor(result.nextCursor || null); }
    catch { setError("failed"); } finally { setLoadingMore(false); }
  };
  const beginSetup = () => guard(() => { replaceWorkspaceIntent(); void loadSetup(); });
  const saveSetup = async (draft: SetupDraft, existing?: AiWorkspaceRecord) => {
    if (!setupCreateKey.current) setupCreateKey.current = crypto.randomUUID();
    const record = await saveRecord("ONBOARDING", draft.answers.schoolName || c.setupTitle, { ...draft }, existing, setupCreateKey.current);
    setSetupRecord(record); return record;
  };
  const [sourceRecordId, setSourceRecordId] = useState<string | null>(null);
  const openRecord = (record: AiWorkspaceRecord) => {
    if (role === "SUPER_ADMIN" && !["SOURCE", "POLICY"].includes(record.kind)) { setTab("history"); return; }
    if (record.kind === "ONBOARDING" && !canConfigureCampus(role)) { setTab("history"); return; }
    focusOpenedRecord.current = record.kind !== "ONBOARDING";
    if (isSchoolSetupPlan(record)) {setSchoolSetupRecordId(record.id);setTab("schoolSetup");}
    else if (isAcademicSetupPlan(record)) { setAcademicRecordId(record.id); setTab("academicSetup"); }
    else if (isTimetableSetupPlan(record)) { setTimetableRecordId(record.id); setTab("timetableSetup"); }
    else if (isAnnouncementPlan(record)) { setAnnouncementRecordId(record.id); setTab("announcements"); }
    else if (isSchoolOperationsPlan(record)) { setOperationRecordId(record.id); setTab("schoolOperations"); }
    else if ((record.data.proposal as { operation?: string } | undefined)?.operation === "finance.apply_operation") { setFinanceOperationRecordId(record.id); setTab("financeOperations"); }
    else if (isFeeInvoicePlan(record)) { setFeeRecordId(record.id); setTab("feeInvoices"); }
    else if (isExamSessionPlan(record)) { setExamPlanRecordId(record.id); setTab("examPlanning"); }
    else if (record.kind === "ONBOARDING") { setSetupRecord(record); setSetup(true); }
    else if (record.kind === "SOURCE") { setSourceRecordId(record.id); setTab("sources"); }
    else if (record.kind === "POLICY") { setPolicyRecordId(record.id); setTab(record.data.knowledge?"knowledge":"policies"); }
    else if (record.kind === "WORKFLOW") { setWorkflowRecordId(record.id); setTab("work"); }
    else if (record.kind === "CURRICULUM" || record.kind === "PAPER") setTab("curriculum");
  };
  useEffect(() => {
    if (!focusOpenedRecord.current || setup) return;
    focusOpenedRecord.current = false;
    toolContent.current?.focus({ preventScroll: true });
    toolContent.current?.scrollIntoView({ block: "start" });
  }, [tab, setup, academicRecordId, schoolSetupRecordId, workflowRecordId, policyRecordId]);

  // SKO-470: a shared run link (#run-<id>) reopens the runs tab, where the panel focuses that run.
  const runsVisible = !examOnly && manager && Boolean(capabilities?.tools?.length);
  useEffect(() => { if (!runsVisible || !window.location.hash.startsWith("#run-")) return; const frame = requestAnimationFrame(() => setTab("runs")); return () => cancelAnimationFrame(frame); }, [runsVisible]);
  // Shaped like the landing it stands in for (hero band + workflow cards), so nothing shifts when it arrives.
  if (loading) return <div role="status" aria-busy="true" className="space-y-6"><span className="sr-only">{c.loading}</span><SkeletonBar className="h-48 w-full rounded-3xl sm:h-56" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <SkeletonBar key={i} className="h-40 rounded-2xl" delay={i * 80} />)}</div></div>;
  if (!capabilities) return <div className={styles.workspace}><TaskFeedback kind="error" title={c.failed} action={<Button onClick={() => { setLoading(true); void refresh(); }}><RefreshCw aria-hidden="true" />{c.retry}</Button>} /><DemoWorkflowPanel language={language} initialWorkflow={examOnly ? "paper" : "assistant"} /></div>;
  const active = visibleRecords.filter(record => record.status !== "ARCHIVED");
  const onboarding = active.find(record => record.kind === "ONBOARDING");
  const setupAnswers = readSetupDraft(onboarding?.data).answers;
  const canSetUpAcademics = capabilities.tools?.some(tool => tool.operation === "academics.setup_year") ?? false;
  const academicPlansVisible = canSetUpAcademics || active.some(isAcademicSetupPlan);
  const canSetUpTimetable = capabilities.tools?.some(tool => tool.operation === "timetable.create_draft") ?? false;
  const timetablePlansVisible = canSetUpTimetable || active.some(isTimetableSetupPlan);
  const canQueueAnnouncement = capabilities.tools?.some(tool => tool.operation === "communications.queue_announcement") ?? false;
  const canGenerateInvoices = capabilities.tools?.some(tool => tool.operation === "fees.generate_invoices") ?? false;
  const canPlanExams = capabilities.tools?.some(tool => tool.operation === "exams.create_session_plan") ?? false;
  const feesVisible = canGenerateInvoices || active.some(isFeeInvoicePlan);
  const examPlansVisible = canPlanExams || active.some(isExamSessionPlan);
  const announcementsVisible = canQueueAnnouncement || active.some(isAnnouncementPlan);
  const setupDefaults = role === "SUPER_ADMIN" ? { schoolName: capabilities.setupDefaults?.schoolName, timezone: capabilities.setupDefaults?.timezone, campuses: capabilities.campuses.find(item => item.id === campusId)?.name } : capabilities.setupDefaults;
  const executableOperations = capabilities.tools?.map(tool => tool.operation) ?? [];
  const schoolSetupApply = executableOperations.includes("setup.apply_changes");
  const schoolOperations = executableOperations.filter(isSchoolOperationsOperation);
  const financeOperationsVisible = executableOperations.includes("finance.apply_operation");
  // G42: "Setup tasks" (delegating and accepting setup facts) is offered only to the institution authority or
  // the named readiness lead; assignees reach their own task through its notification link to /setup/readiness.
  const setupTasksVisible = (capabilities as { setupTasks?: boolean }).setupTasks === true;
  // Readiness delegation does not grant permission to configure a campus.
  const canRunQuestionnaire = canConfigureCampus(role) && !examOnly && hasKind("ONBOARDING") && capabilities.canCreate && (schoolSetupApply || setupTasksVisible);
  const schoolSetupVisible = schoolSetupApply || canRunQuestionnaire;
  const permittedTabs = tabs.filter(item => item.id === "schoolSetup" && schoolSetupVisible || item.id === "schoolOperations" && schoolOperations.length > 0 || item.id === "financeOperations" && financeOperationsVisible || item.id === "runs" && manager && executableOperations.length > 0 || item.id === "overview" || item.id === "setupTasks" && setupTasksVisible || item.id === "feeInvoices" && feesVisible || item.id === "examPlanning" && examPlansVisible || item.id === "history" || item.id === "sources" && hasKind("SOURCE") || item.id === "curriculum" && (hasKind("PAPER") || hasKind("CURRICULUM")) || item.id === "academicSetup" && academicPlansVisible || item.id === "timetableSetup" && timetablePlansVisible || item.id === "announcements" && announcementsVisible || item.id === "work" && hasKind("WORKFLOW") || (item.id === "knowledge" || item.id === "policies") && hasKind("POLICY"));
  const visibleTabs = examOnly ? permittedTabs.filter(item => ["overview", "sources", "curriculum", "examPlanning", "history"].includes(item.id)) : permittedTabs.filter(item => roleAllowsWorkflowTab(role, item.id));
  // The landing's ONE first step (addendum 2026-10-22): a role that runs the setup questionnaire and has not finished
  // it starts there; everyone else picks a workflow below (and, with tools, sees past runs).
  const setupUnfinished = !onboarding || readSetupDraft(onboarding.data).step !== "review";
  const scrollToWorkflows = () => {
    const target = document.querySelector<HTMLElement>("[data-ai-workflow-launchpad]");
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  // Plain values only (no handler objects built during render — react-hooks/refs): which first step, its label and
  // its one outline secondary; the buttons below pick the handler for the mode.
  const heroMode: "setup" | "workflows" | null = examOnly ? null : canRunQuestionnaire && setupUnfinished ? "setup" : "workflows";
  const heroLabel = heroMode === "setup" ? ui(onboarding ? "Continue setting up your school with AI" : "Set up your school with AI") : role === "SUPER_ADMIN" ? (language === "ar" ? "مراجعة مسارات المجموعة" : language === "ur" ? "گروپ ورک فلوز کا جائزہ" : "Review group workflows") : ui("Run an AI workflow");
  const heroSecondary: "workflows" | "runs" | null = heroMode === "setup" ? "workflows" : heroMode === "workflows" && runsVisible && campusId ? "runs" : null;
  const navigateStudio = (next: StudioWorkspaceTab) => guard(() => {
    if (!visibleTabs.some(item => item.id === next)) return;
    setTab(next); setError(""); setNotice("");
  });
  const selectTab = (id: Tab) => {
    if (tab === id || !visibleTabs.some(item => item.id === id)) return;
    guard(() => {
      setupLoad.current?.abort(); setOpeningSetup(false);
      focusOpenedRecord.current = true;
      setSetup(false); setTab(id); setUnavailableWorkflow(false); replaceWorkspaceIntent(id);
      setAcademicRecordId(null); setTimetableRecordId(null); setAnnouncementRecordId(null); setFeeRecordId(null); setExamPlanRecordId(null); setOperationRecordId(null); setFinanceOperationRecordId(null); setSchoolSetupRecordId(null); setWorkflowRecordId(null); setPolicyRecordId(null); setError(""); setNotice("");
    });
  };
  return <><div className={styles.workspace} dir={language === "en" ? "ltr" : "rtl"}>
    <WorkspaceIntent permitted={visibleTabs.map(item => item.id)} onOpen={(next, unavailable) => {
      setUnavailableWorkflow(unavailable);
      // Addendum 2026-10-22: "Set up your school with AI" (/ai?workflow=schoolSetup) starts with the setup
      // questionnaire while it is unfinished — a new school answers it first, then reviews the drafts it produces.
      // Before a campus is chosen, an authorized campus operator waits for the scope picker.
      if (next === "schoolSetup" && canRunQuestionnaire && (setupUnfinished || !schoolSetupApply)) {
        if (setup || openingSetup) return;
        setError(""); setNotice(""); replaceWorkspaceIntent();
        if (needsCampus) { setSetupAfterCampus(true); return; }
        void loadSetup();
        return;
      }
      if (next !== tab || setup || openingSetup) {
        setupLoad.current?.abort(); setOpeningSetup(false); focusOpenedRecord.current = true;
        setSetup(false); setTab(next); setError(""); setNotice("");
      }
    }} />
    {/* The flagship hero (addendum 2026-10-22): full on the landing, compact above a workflow so the tool stays in view. */}
    {!examOnly && <header className={`relative isolate mb-5 overflow-hidden rounded-3xl bg-brand-50 ring-1 ring-brand-100 ${tab === "overview" ? "p-5 sm:p-8" : "p-4 sm:p-5"}`} data-ai-workflows-hero data-compact={tab !== "overview" || undefined}>
      {/* A soft brand glow at the end edge (mirrors in RTL), never behind text that needs contrast. */}
      <div aria-hidden="true" className="pointer-events-none absolute -end-24 -top-28 -z-10 size-80 rounded-full bg-brand-200/50 blur-3xl" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className={`min-w-0 max-w-3xl ${tab === "overview" ? "space-y-3" : "space-y-1.5"}`}>
          <p className="flex flex-wrap items-center gap-2"><FlagshipChip /><span className="text-xs font-semibold text-brand-700">{ui("AI Workflows")}</span></p>
          <h1 className={`font-bold tracking-tight text-ink-strong [overflow-wrap:anywhere] ${tab === "overview" ? "text-2xl sm:text-3xl lg:text-4xl" : "text-xl sm:text-2xl"}`}>{roleGuideCopy(normalizeUserRole(role) ?? "ADMIN", language).title}</h1>
          {tab === "overview" ? <p className="text-sm leading-relaxed text-ink-muted sm:text-base">{roleGuideCopy(normalizeUserRole(role) ?? "ADMIN", language).introduction}</p> : null}
          <p className="flex items-start gap-1.5 text-xs font-semibold text-status-success-text"><ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{(language === "ar" ? "ينفذ الذكاء الاصطناعي طلبك ضمن صلاحيات دورك ويسأل عن التفاصيل الناقصة." : language === "ur" ? "اے آئی آپ کے کردار کی اجازت کے مطابق کام کرتا ہے اور نامکمل تفصیل پوچھتا ہے۔" : "AI carries out your request within your role and asks for missing details.")}</p>
        </div>
        {tab === "overview" && heroMode ? <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row lg:flex-col xl:flex-row">
          {heroSecondary ? <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => { if (heroSecondary === "runs") selectTab("runs"); else scrollToWorkflows(); }}>{ui(heroSecondary === "runs" ? "Run history" : "See all workflows")}</Button> : null}
          <Button type="button" className="order-first w-full gap-2 sm:order-none sm:w-auto" disabled={heroMode === "setup" && (needsCampus || !canCreate)} loading={heroMode === "setup" && openingSetup} onClick={() => { if (heroMode === "setup") beginSetup(); else scrollToWorkflows(); }} data-ai-hero-action>
            {heroMode === "setup" && openingSetup ? null : <Sparkles aria-hidden="true" />}{heroLabel}<ArrowRight aria-hidden="true" className="rtl:rotate-180" />
          </Button>
        </div> : null}
      </div>
    </header>}
    {manager && <section className={`sk-panel ${examOnly ? "mt-3 p-3 sm:mt-5 sm:p-5" : "mb-5 p-5"}`}><FormField name="ai-campus-scope" label={c.workspaceCampus} hint={c.workspaceCampusHint}><Select value={selectedCampus} onChange={event => { const value = event.target.value; if (value !== selectedCampus) changeScope(() => setSelectedCampus(value)); }}><option value="">{c.chooseCampus}</option>{capabilities.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select></FormField>{needsCampus && <p className="mt-3 text-sm text-ink-muted">{setupAfterCampus || setupIntent ? ui("Choose a campus to open the setup questionnaire.") : c.selectCampusToStart}</p>}</section>}
    {/* SKO-500: in Exam Studio a principal or admin also picks a class and subject, to start a brief or read a map. */}
    {(role === "TEACHER" || (examOnly && manager && Boolean(campusId))) && <section className={`sk-panel ${examOnly ? "mt-3 p-3 sm:mt-5 sm:p-5" : "mb-5 p-5"}`}><FormField name="ai-teaching-scope" label={c.subject} hint={c.selectSubjectHint}><Select value={selectedSubject} onChange={event => { const value = event.target.value; if (value !== selectedSubject) changeScope(() => setSelectedSubject(value)); }}><option value="">{c.chooseSubject}</option>{subjects.filter(item => role === "TEACHER" || item.campusId === campusId).map(item => <option key={item.id} value={item.id}>{item.className} · {item.name}</option>)}</Select></FormField></section>}
    {(examOnly || tab !== "overview") && <><nav className={styles.mobileNavigation} aria-label={c.workspace}><FormField name="ai-workspace-tool" label={prototype.navigation}><Select value={tab} onChange={event => selectTab(event.target.value as Tab)}>{visibleTabs.map(({ id }) => <option key={id} value={id}>{examOnly ? studioCopy[id as StudioWorkspaceTab] : c[id]}</option>)}</Select></FormField></nav>
    <nav className={`${styles.tabs} ${examOnly ? studioStyles.workspaceTabs : ""}`} aria-label={c.workspace}>{visibleTabs.map(({ id, Icon }) => <Button key={id} type="button" variant="choice" aria-pressed={tab === id} className={styles.tab} onClick={() => selectTab(id)}><Icon aria-hidden="true" />{examOnly ? studioCopy[id as StudioWorkspaceTab] : c[id]}</Button>)}</nav></>}
    {/* Exam Studio is the second flagship with its own row; from the AI Workflows landing it is a quiet link, never a second primary. */}
    {!examOnly && tab === "overview" && hasKind("PAPER") && <div className="mb-5 flex flex-wrap gap-3"><Link className={buttonVariants({ variant: "outline" })} href={EXAM_STUDIO_HREF}><Sparkles aria-hidden="true" />{studioCopy.openStudio}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Link><Link className={buttonVariants({ variant: "outline" })} href="/ai/exams"><BookOpen aria-hidden="true" />{c.exams}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Link></div>}
    {error && <div className="mb-5"><TaskFeedback kind="error" title={c[error as "failed" | "serviceUnavailable" | "uploadInvalid"] || c.failed} action={<Button variant="outline" onClick={() => guard(() => void refresh())}><RefreshCw aria-hidden="true" />{c.reload}</Button>} /></div>}
    {notice && <p role="status" className={`${styles.notice} mb-5`}><CheckCircle2 className="mt-1 size-4 shrink-0" aria-hidden="true" />{notice}</p>}
    <div ref={toolContent} tabIndex={-1} data-ai-workspace-tool-content>
    {unavailableWorkflow && <TaskFeedback kind="error" title={launchCopy.unavailable} />}
    {!examOnly && tab !== "overview" && <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Button variant="outline" onClick={() => selectTab("overview")}><ArrowLeft className="rtl:rotate-180" aria-hidden="true" />{launchCopy.back}</Button><p className="text-sm font-semibold text-ink-muted">{capabilities.campuses.find(item => item.id === campusId)?.name}{subject ? ` · ${subject.className} · ${subject.name}` : ""}</p></div>}
    {tab === "overview" && examOnly && capabilities && <StudioSpaces language={language} capabilities={capabilities} records={visibleRecords} reload={() => void refresh()} openTool={navigateStudio}
      scope={resolveStudioScope(capabilities, { campusId: campusId ?? "", subjectId: selectedSubject })}>
      <StudioOverview records={visibleRecords} language={language} scopeReady={!needsCampus && !needsSubject} canReadSources={hasKind("SOURCE")} canReadPapers={hasKind("PAPER")} onNavigate={navigateStudio} />
    </StudioSpaces>}
    {/* SKO-500: the sample sits below the rail, folded, and goes away once a live AI provider is configured. */}
    {examOnly && !(featureStatusKnown && features.assistant) && <details className="sk-panel mt-5 p-3 sm:p-4" data-studio-sample><summary className="cursor-pointer text-sm font-semibold text-ink-muted">{studioHomeCopy(language).sampleDisclosure}</summary><div className="mt-3"><DemoWorkflowPanel language={language} initialWorkflow="paper" /></div></details>}
    {tab === "overview" && !examOnly && <>
      {(!needsCampus || role === "SUPER_ADMIN") && <AutomaticWorkspace key={`automatic-${campusId}`} campusId={campusId} role={role} roleSetup={!canConfigureCampus(role) && setupIntent} autoStart={!canConfigureCampus(role) && setupIntent} />}
      <WorkspaceLaunchpad language={language} tabs={visibleTabs} onboarding={onboarding} scopeName={subject ? `${subject.className} · ${subject.name}` : capabilities.campuses.find(item => item.id === campusId)?.name} needsCampus={needsCampus} needsSubject={needsSubject} hasCampuses={capabilities.campuses.length > 0} hasSubjects={subjects.length > 0} canCreate={canCreate} canOnboard={canRunQuestionnaire} openingSetup={openingSetup} featureState={featureStatusKnown ? features.assistant ? "live" : "prototype" : featureStatusFailed ? "unknown" : "checking"} onSetup={beginSetup} onOpen={selectTab} onRefreshFeatures={() => void refreshFeatures()} setupVariant={heroMode ? "outline" : "default"} />
      {nextCursor && <p className="text-xs text-ink-muted">{c.loadedRecords}</p>}
      <div className={styles.metrics}>{[{ label: c.savedPlans, count: active.filter(record => record.kind === "WORKFLOW").length }, { label: c.reviewCount, count: active.filter(record => record.status === "IN_REVIEW").length }, { label: c.approvedSources, count: active.filter(record => record.kind === "SOURCE" && record.status === "APPROVED").length }].map(metric => <div className={`sk-panel ${styles.metric}`} key={metric.label}><span className={styles.metricNumber}>{new Intl.NumberFormat(language).format(metric.count)}</span><span className={styles.metricLabel}>{metric.label}</span></div>)}</div>
      <div className={styles.columns}><section className={`sk-panel ${styles.panel}`}>
        {!needsCampus && !needsSubject && <details><summary className="cursor-pointer text-sm font-semibold">{language === "ar" ? "محادثة وصياغة فقط" : language === "ur" ? "گفتگو اور مسودہ فقط" : "Chat and drafting only"}</summary><PrivateAssistant language={language} campusId={campusId} {...scope} canCreate={canCreate} assistantAvailable={features.assistant} voiceAvailable={features.voiceTranscription} disabled={uploading} onUpload={upload} onRecord={putRecord} /></details>}
        {(needsCampus || needsSubject) && <p className={styles.description}>{needsCampus ? c.selectCampusToStart : c.selectSubjectHint}</p>}
      </section><aside className="space-y-5"><section className={`sk-panel ${styles.panel}`}><h2 className={styles.sectionTitle}>{c.readiness}</h2>{onboarding ? setupReadiness(setupAnswers).map(group => <div className={styles.recordRow} key={group.label}><span className="text-sm font-semibold">{c[group.label]}</span><TaskStatus attention={Boolean(group.missing.length)}>{group.missing.length ? c.needsInformation : c.readyDraft}</TaskStatus></div>) : <><p className={styles.description}>{canRunQuestionnaire ? c.setupHint : c.setupRestricted}</p>{canRunQuestionnaire && <Button variant="outline" disabled={needsCampus} onClick={beginSetup}>{c.startSetup}</Button>}</>}</section>
        <section className={`sk-panel ${styles.panel}`}><h2 className="mb-3 font-bold">{c.capabilities}</h2>{(Object.keys(UNCONFIGURED_CAPABILITIES) as (keyof AIFeatureCapabilities)[]).map(key => <div className={styles.recordRow} key={key}><span className="text-xs font-semibold">{c[key]}</span><span className={`text-xs ${features[key] ? "text-primary" : "text-ink-muted"}`}>{!featureStatusKnown ? c.capabilityUnknown : features[key] ? prototype.configured : key === "secureBrowser" || key === "proctoring" ? c.notAvailable : c.notConfigured}</span></div>)}</section>
      </aside></div>
      {manager && campusId && <WorkspaceInsights key={campusId} language={language} campusId={campusId} />}
      {role !== "SUPER_ADMIN" && <DemoWorkflowPanel language={language} />}
    </>}
    {tab === "sources" && <SourceLibrary initialRecordId={sourceRecordId} onRecord={putRecord} canArchive={capabilities.canArchive} key={`${campusId}:${selectedSubject}:${sourceRecordId}`} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} onUpload={upload} scope={scope} uploading={uploading} campusId={campusId} canImportRoster={!examOnly && capabilities.canImportRoster} />}
    {tab !== "overview" && tab !== "history" && !needsCampus && !needsSubject && <DomainAssistant key={`${campusId}:${selectedSubject}:${tab}`} domain={tab} title={c[tab]} records={visibleRecords} language={language} campusId={campusId} {...scope} canCreate={canCreate} assistantAvailable={features.assistant} voiceAvailable={features.voiceTranscription} disabled={uploading} onUpload={upload} onRecord={putRecord}/> }
    {tab === "curriculum" && <AssessmentStudio key={`${campusId}:${selectedSubject}`} records={visibleRecords} locale={language} onRefresh={refresh} campusId={campusId} subjects={subjects.filter(item => item.campusId === campusId && (role !== "TEACHER" || item.id === selectedSubject))} canCreate={canCreate} canApprove={capabilities.canApprove} />}
    {tab === "academicSetup" && academicPlansVisible && <AcademicSetupPanel key={`${campusId}:${academicRecordId || "none"}`} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={academicRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canApply={canSetUpAcademics && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "timetableSetup" && timetablePlansVisible && <TimetableSetupPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={timetableRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canApply={canSetUpTimetable && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "announcements" && announcementsVisible && <AnnouncementPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={announcementRecordId} canCreate={canCreate && canQueueAnnouncement} canApprove={capabilities.canApprove} canQueue={canQueueAnnouncement && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "feeInvoices" && feesVisible && <FeeInvoicePanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={feeRecordId} canCreate={canCreate && canGenerateInvoices} canApprove={capabilities.canApprove} canGenerate={canGenerateInvoices && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "examPlanning" && examPlansVisible && <ExamSessionPlanPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={examPlanRecordId} canCreate={canCreate && canPlanExams} canApprove={capabilities.canApprove} canApply={canPlanExams && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "schoolSetup" && schoolSetupVisible && !schoolSetupApply && <Alert className="mb-5" tone="info" compact>{ui("You draft and approve set-up changes here. The campus team applies them.")}</Alert>}
    {tab === "schoolSetup" && schoolSetupVisible && <SchoolSetupPanel key={`${campusId}:${schoolSetupRecordId || "none"}`} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id===campusId)} campusId={campusId} initialRecordId={schoolSetupRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canExecute={schoolSetupApply && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "schoolOperations" && schoolOperations.length > 0 && <SchoolOperationsPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={operationRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canExecute={!needsCampus} allowedOperations={schoolOperations} onRecord={putRecord} onAction={recordAction} />}
    {tab === "financeOperations" && financeOperationsVisible && <FinanceOperationsPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={financeOperationRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canExecute={!needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "runs" && manager && campusId && <RunsPanel key={campusId} language={language} campusId={campusId} records={visibleRecords} operations={executableOperations} />}
    {tab === "setupTasks" && <SetupTasksPanel key={campusId || "none"} language={language} campusId={campusId} records={visibleRecords} canManage={manager && canCreate} onRecord={putRecord} />}
    {tab === "work" && <WorkPanel key={`${campusId}:${selectedSubject}:${workflowRecordId || "none"}`} initialRecordId={workflowRecordId} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} scope={scope} onOpenRecord={openRecord} moduleHref={module => moduleWorkspaceHref(role, module)} />}
    {tab === "knowledge" && <KnowledgePanel key={campusId || "none"} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} />}
    {tab === "policies" && <PolicyPanel key={`${campusId}:${policyRecordId || "none"}`} initialRecordId={policyRecordId} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} />}
    {tab === "history" && <RevisionHistoryPanel key={`${campusId}:${selectedSubject}`} language={language} records={visibleRecords} onRecord={putRecord} onAction={recordAction} />}
    </div>
    {nextCursor && <div className="mt-6 flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? c.loading : c.loadMore}</Button></div>}
  </div>{setup && canRunQuestionnaire && hasKind("ONBOARDING") && !needsCampus && <GuidedSetup key={campusId || "school"} language={language} role={normalizeUserRole(role) ?? undefined} sources={visibleRecords.filter(record => record.kind === "SOURCE" && record.campusId === campusId && record.status !== "ARCHIVED")} workspaceRecords={visibleRecords} allowedOperations={executableOperations} workflows={visibleTabs.map(item => item.id)} onOpenWorkflow={workflow => { if (!visibleTabs.some(item => item.id === workflow)) return; setSetup(false); setTab(workflow as Tab); setUnavailableWorkflow(false); replaceWorkspaceIntent(workflow as Tab); setSchoolSetupRecordId(null); setAcademicRecordId(null); setTimetableRecordId(null); setError(""); setNotice(""); }} canImportRoster={capabilities.canImportRoster} record={setupRecord} defaults={setupDefaults} voiceAvailable={features.voiceTranscription} assistantAvailable={features.assistant} campusId={campusId} campusName={capabilities.campuses.find(campus => campus.id === campusId)?.name} canApprove={capabilities.canApprove} onAction={recordAction} onSave={saveSetup} onGenerated={putRecords} onOpenRecord={record => { setSetup(false); replaceWorkspaceIntent(); openRecord(record); }} onClose={() => { setSetup(false); replaceWorkspaceIntent("overview"); setTab("overview"); }} onUpload={upload} />}</>;
}
