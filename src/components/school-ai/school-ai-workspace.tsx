"use client";
import { AskWorkspace } from "@/components/ai-workflows/ask-workspace";

import { roleGuideCopy } from "@/components/onboarding/role-guide-copy";
import { canConfigureCampus, roleAllowsWorkflowTab } from "@/lib/school-ai/setup-role";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDown, ArrowLeft, ArrowRight, BookOpen, Building2, CalendarClock, ChevronDown, ClipboardCheck, ClipboardList, Clock3, FileCheck2, FileText, GraduationCap, History, LayoutDashboard, Library, ListChecks, ListTodo, Lock, Megaphone, MessagesSquare, ReceiptText, RefreshCw, ShieldCheck, Sparkles, Users, Wallet } from "lucide-react";
import { InkHeading } from "@/components/ui/ink-heading";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/tooltip";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { LiveAnnouncer } from "@/components/ui/live-announcer";
import { ClassMark } from "@/components/ai-workflows/workflow-marks";
import { Num } from "@/components/ai-workflows/workflow-format";
import { InboxCountChip } from "@/components/ai-workflows/inbox-count-chip";
import { CLASS_WORDS, UI, t as runText } from "@/components/ai-workflows/run-copy";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { FlagshipChip } from "@/components/ui/flagship";
import { normalizeUserRole } from "@/lib/roles";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { TaskFeedback, TaskStatus } from "@/components/ui/task-patterns";
import { cn } from "@/lib/utils";
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
  { id: "overview", Icon: LayoutDashboard }, { id: "schoolSetup", Icon: Users }, { id: "schoolOperations", Icon: Building2 }, { id: "financeOperations", Icon: Wallet }, { id: "runs", Icon: Activity }, { id: "sources", Icon: FileText }, { id: "curriculum", Icon: BookOpen }, { id: "academicSetup", Icon: GraduationCap }, { id: "timetableSetup", Icon: Clock3 }, { id: "announcements", Icon: Megaphone }, { id: "examPlanning", Icon: CalendarClock }, { id: "feeInvoices", Icon: ReceiptText }, { id: "setupTasks", Icon: ListTodo }, { id: "work", Icon: ClipboardList }, { id: "policies", Icon: ShieldCheck }, {id:"knowledge",Icon:Library}, { id: "history", Icon: History },
] as const;

type Words = { en: string; ar: string; ur: string };
// Frame copy for the staff /ai command deck and its lower dashboard (EN / AR / UR).
const FRAME = {
  heroSub: { en: "Say what you need. Skoolee plans it within your role and checks with you before anything is saved.", ar: "قل ما تحتاجه. يخطط سكولي له ضمن صلاحيات دورك ويرجع إليك قبل أي حفظ.", ur: "بتائیں آپ کو کیا چاہیے۔ اسکولی آپ کے کردار کی حدود میں منصوبہ بناتا ہے اور محفوظ کرنے سے پہلے آپ سے پوچھتا ہے۔" },
  askLocked: { en: "Choose a campus to start asking", ar: "اختر فرعًا لتبدأ بالسؤال", ur: "پوچھنا شروع کرنے کے لیے شاخ منتخب کریں" },
  superNote: { en: "Workflows and saved records below need a campus.", ar: "تحتاج مسارات العمل والسجلات المحفوظة أدناه إلى فرع.", ur: "نیچے کے ورک فلوز اور محفوظ ریکارڈ کے لیے شاخ درکار ہے۔" },
  nowWorkingIn: { en: "Now working in {0}", ar: "تعمل الآن ضمن {0}", ur: "اب {0} میں کام ہو رہا ہے" },
  legend: { en: "What happens after you ask", ar: "ماذا يحدث بعد أن تسأل", ur: "پوچھنے کے بعد کیا ہوتا ہے" },
  secondary: { en: "More in AI Workflows", ar: "المزيد في مسارات الذكاء الاصطناعي", ur: "اے آئی ورک فلوز میں مزید" },
  delivery: { en: "Delivery & results", ar: "التسليم والنتائج", ur: "ترسیل اور نتائج" },
  status: { en: "Workspace status", ar: "حالة مساحة العمل", ur: "ورک اسپیس کی صورتحال" },
  glance: { en: "Your AI work at a glance", ar: "عملك مع الذكاء الاصطناعي في لمحة", ur: "آپ کا اے آئی کام ایک نظر میں" },
  pendingCampus: { en: "Choose a campus to see counts", ar: "اختر فرعًا لعرض الأعداد", ur: "گنتی دیکھنے کے لیے شاخ منتخب کریں" },
  pendingSubject: { en: "Choose a subject to see counts", ar: "اختر مادة لعرض الأعداد", ur: "گنتی دیکھنے کے لیے مضمون منتخب کریں" },
  aiServices: { en: "AI services", ar: "خدمات الذكاء الاصطناعي", ur: "اے آئی خدمات" },
  examDelivery: { en: "Exam delivery", ar: "تقديم الاختبارات", ur: "امتحان کی ترسیل" },
  checkAgain: { en: "Check again", ar: "تحقّق مجددًا", ur: "دوبارہ جانچیں" },
  chat: { en: "Chat and drafting only", ar: "محادثة وصياغة فقط", ur: "گفتگو اور مسودہ فقط" },
  chatHint: { en: "Ask questions or draft text without starting a workflow.", ar: "اطرح أسئلة أو اكتب مسودات دون بدء مسار عمل.", ur: "ورک فلو شروع کیے بغیر سوال پوچھیں یا متن کا مسودہ بنائیں۔" },
  readyGroups: { en: "{0} of {1} areas ready", ar: "{0} من {1} مجالات جاهزة", ur: "{1} میں سے {0} حصے تیار" },
} satisfies Record<string, Words>;
const AI_SERVICE_KEYS = ["documentUpload", "documentExtraction", "voiceTranscription", "assistant", "paperGeneration"] as const;
const EXAM_DELIVERY_KEYS = ["secureBrowser", "proctoring", "optionalRecording"] as const;

export function SchoolAIWorkspace(props: { role?: string; campusId?: string | null; examOnly?: boolean; workflowsV2?: { practiceMode: boolean } | null; askExamples?: string[]; askInitialMessage?: string } = {}) {
  return <WorkspaceDraftBoundary><SchoolAIWorkspaceContent {...props} /></WorkspaceDraftBoundary>;
}

function SchoolAIWorkspaceContent({ role: initialRole, campusId: initialCampusId, examOnly = false, workflowsV2 = null, askExamples, askInitialMessage }: { role?: string; campusId?: string | null; examOnly?: boolean; workflowsV2?: { practiceMode: boolean } | null; askExamples?: string[]; askInitialMessage?: string }) {
  const searchParams = useSearchParams();
  const setupIntent = searchParams.get("setup") === "1" && !searchParams.has("workflow");
  const { language } = useLocale();
  const ui = useUiText();
  const c = schoolAICopy(language);
  const launchCopy = workspaceLaunchCopy(language);
  const prototype = prototypeCopy(language);
  const studioCopy = studioShellCopy(language);
  const guard = useWorkspaceDraftNavigation();
  const format = useLocaleFormat();
  const f = (words: Words, ...values: string[]) => values.reduce((text, value, index) => text.replace(`{${index}}`, value), words[language as keyof Words] ?? words.en);
  const [scopeAnnouncement, setScopeAnnouncement] = useState<string | null>(null);
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
  if (loading && examOnly) return <div role="status" aria-busy="true" className="space-y-6"><span className="sr-only">{c.loading}</span><SkeletonBar className="h-48 w-full rounded-3xl sm:h-56" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <SkeletonBar key={i} className="h-40 rounded-2xl" delay={i * 80} />)}</div></div>;
  // Mirrors the command deck (ink cover, overlapping Ask, chip row) and the launchpad, so nothing jumps when it arrives.
  if (loading) return <SkeletonRegion label={c.loading} className={cn(styles.workspace, styles.overviewStack)}>
    <div className={styles.commandDeck}>
      <div className="sk-ink-cover h-40 p-5 sm:h-44 sm:p-8" aria-hidden="true"><SkeletonBar tone="dark" className="h-6 w-40 rounded-full" /><SkeletonBar tone="dark" className="mt-5 h-9 w-2/3 rounded-xl" delay={60} /></div>
      <div className={styles.askStage}><Skeleton className="h-44 w-full rounded-3xl" delay={120} /></div>
      <div className={cn(styles.secondaryLinks, "flex flex-wrap gap-2")}>{[0, 1, 2].map(i => <Skeleton key={i} className="h-11 w-32 rounded-xl" delay={180 + i * 60} />)}</div>
    </div>
    <Skeleton className="h-20 w-full rounded-3xl" delay={240} />
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-2xl sm:h-44" delay={i * 60} />)}</div>
  </SkeletonRegion>;
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
  // Ask is the overview's one primary (UI pass). While setup is unfinished the launchpad's setup button is the hero's
  // first step; otherwise "See all workflows" is.
  const setupMode = canRunQuestionnaire && setupUnfinished;
  const featureState: "checking" | "unknown" | "live" | "prototype" = featureStatusKnown ? features.assistant ? "live" : "prototype" : featureStatusFailed ? "unknown" : "checking";
  const featureChecking = featureState === "checking";
  const capabilityGroups = [{ id: "ai", title: FRAME.aiServices, keys: AI_SERVICE_KEYS as readonly (keyof AIFeatureCapabilities)[] }, ...(hasKind("PAPER") ? [{ id: "exam", title: FRAME.examDelivery, keys: EXAM_DELIVERY_KEYS as readonly (keyof AIFeatureCapabilities)[] }] : [])];
  const statsPending = needsCampus || needsSubject;
  const stats = [
    { id: "saved-plans", label: c.savedPlans, count: active.filter(record => record.kind === "WORKFLOW").length, tab: "work" as Tab, Icon: ClipboardList },
    { id: "in-review", label: c.reviewCount, count: active.filter(record => record.status === "IN_REVIEW").length, tab: "history" as Tab, Icon: History },
    { id: "approved-sources", label: c.approvedSources, count: active.filter(record => record.kind === "SOURCE" && record.status === "APPROVED").length, tab: "sources" as Tab, Icon: FileText },
  ];
  const readinessGroups = onboarding ? setupReadiness(setupAnswers) : [];
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
  const guide = roleGuideCopy(normalizeUserRole(role) ?? "ADMIN", language);
  const campusName = capabilities.campuses.find(item => item.id === campusId)?.name;
  const onCampusChange = (value: string) => {
    if (value === selectedCampus) return;
    changeScope(() => {
      setSelectedCampus(value);
      const name = capabilities.campuses.find(item => item.id === value)?.name;
      setScopeAnnouncement(name ? f(FRAME.nowWorkingIn, name) : null);
    });
  };
  // One campus select only: on the cover (AI Workflows) or in its own panel (Exam Studio). Label and combobox name stay
  // exactly c.workspaceCampus.
  const campusField = (onCover: boolean) => <FormField name="ai-campus-scope" label={onCover ? <span className="sk-eyebrow text-brand-100">{c.workspaceCampus}</span> : c.workspaceCampus} tooltip={onCover ? c.workspaceCampusHint : undefined} hint={onCover ? <span className="text-brand-200 sm:sr-only">{c.workspaceCampusHint}</span> : c.workspaceCampusHint}>
    <div className="relative" data-ai-scope data-attention={needsCampus || undefined}>
      {onCover ? <Building2 aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-3 z-10 my-auto size-4 text-ink-muted" /> : null}
      <Select dir="auto" className={onCover ? "min-h-11 ps-10 sm:w-auto sm:min-w-[16rem] sm:max-w-md" : undefined} value={selectedCampus} onChange={event => onCampusChange(event.target.value)}><option value="">{c.chooseCampus}</option>{capabilities.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select>
    </div>
  </FormField>;
  const subjectField = <FormField name="ai-teaching-scope" label={c.subject} hint={c.selectSubjectHint}><Select value={selectedSubject} onChange={event => { const value = event.target.value; if (value !== selectedSubject) changeScope(() => setSelectedSubject(value)); }}><option value="">{c.chooseSubject}</option>{subjects.filter(item => role === "TEACHER" || item.campusId === campusId).map(item => <option key={item.id} value={item.id}>{item.className} · {item.name}</option>)}</Select></FormField>;
  const overview = tab === "overview";
  const deckHeader = <header className={cn("sk-ink-cover", overview ? "px-5 pb-14 pt-5 sm:px-8 sm:pb-16 sm:pt-7" : "mb-5 p-4 sm:p-5")} data-ai-workflows-hero data-compact={!overview || undefined}>
    <span className="sk-quiz-orb" data-tone="brand" aria-hidden="true" />
    <span className="sk-quiz-orb" data-tone="berry" aria-hidden="true" />
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-white/15"><FlagshipChip />{ui("AI Workflows")}</p>
      {manager ? <div className={cn(styles.scopeField, needsCampus && styles.scopeAttention, "sm:w-auto")}>{campusField(true)}</div> : null}
    </div>
    <InkHeading as="h1" text={guide.title} className={overview ? "mt-3 text-3xl sm:text-4xl" : "mt-2 text-[1.75rem]"} />
    {overview ? <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-brand-100 sm:line-clamp-none sm:text-base">{f(FRAME.heroSub)}</p> : null}
  </header>;
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
    <LiveAnnouncer message={scopeAnnouncement} />
    {/* The command deck (UI pass): a compact ink cover with the scope control; Ask overlaps its lower edge. */}
    {!examOnly && tab !== "overview" && deckHeader}
    {manager && examOnly && <section className="sk-panel mt-3 p-3 sm:mt-5 sm:p-5">{campusField(false)}{needsCampus && <p className="mt-3 text-sm text-ink-muted">{setupAfterCampus || setupIntent ? ui("Choose a campus to open the setup questionnaire.") : c.selectCampusToStart}</p>}</section>}
    {/* SKO-500: in Exam Studio a principal or admin also picks a class and subject, to start a brief or read a map. On the
        AI Workflows overview a teacher's subject lives in the launchpad instead (the deck stays about Ask). */}
    {(examOnly ? manager && Boolean(campusId) || role === "TEACHER" : role === "TEACHER" && tab !== "overview") && <section className={`sk-panel ${examOnly ? "mt-3 p-3 sm:mt-5 sm:p-5" : "mb-5 p-5"}`}>{subjectField}</section>}
    {(examOnly || tab !== "overview") && <><nav className={styles.mobileNavigation} aria-label={c.workspace}><FormField name="ai-workspace-tool" label={prototype.navigation}><Select value={tab} onChange={event => selectTab(event.target.value as Tab)}>{visibleTabs.map(({ id }) => <option key={id} value={id}>{examOnly ? studioCopy[id as StudioWorkspaceTab] : c[id]}</option>)}</Select></FormField></nav>
    <nav className={`${styles.tabs} ${examOnly ? studioStyles.workspaceTabs : ""}`} aria-label={c.workspace}>{visibleTabs.map(({ id, Icon }) => <Button key={id} type="button" variant="choice" aria-pressed={tab === id} className={styles.tab} onClick={() => selectTab(id)}><Icon aria-hidden="true" />{examOnly ? studioCopy[id as StudioWorkspaceTab] : c[id]}</Button>)}</nav></>}
    {/* Exam Studio is the second flagship with its own row; from the AI Workflows landing it is a quiet link, never a second primary. */}
    {!examOnly && overview && <section data-ai-command-deck className={cn(styles.commandDeck, "mb-6 lg:mb-8")}>
      {deckHeader}
      <div className={`${styles.askStage} sk-enter`} key={`stage-${campusId}`}>
        {(!needsCampus || role === "SUPER_ADMIN") ? <AskWorkspace key={`ask-${campusId}`} campusId={campusId ?? null} practiceMode={workflowsV2?.practiceMode ?? false} enabled={Boolean(workflowsV2)} examples={askExamples} initialMessage={askInitialMessage} />
          : <section data-ai-ask-locked className="sk-panel flex items-start gap-4 rounded-3xl p-5 shadow-md sm:p-6" aria-labelledby="ai-ask-locked-title">
            <span aria-hidden="true" className="sk-icon-tile grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-200/60"><Lock className="size-5" /></span>
            <div className="min-w-0"><h2 id="ai-ask-locked-title" className="font-semibold text-ink-strong">{f(FRAME.askLocked)}</h2><p className="mt-1 text-sm leading-relaxed text-ink-muted">{setupAfterCampus || setupIntent ? ui("Choose a campus to open the setup questionnaire.") : c.selectCampusToStart}</p></div>
          </section>}
        {needsCampus && role === "SUPER_ADMIN" ? <p className="mt-3 text-xs text-ink-muted">{setupAfterCampus || setupIntent ? ui("Choose a campus to open the setup questionnaire.") : f(FRAME.superNote)}</p> : null}
        {!needsCampus || role === "SUPER_ADMIN" ? <div className="mt-4 flex flex-wrap items-center gap-2" data-ai-trust-legend>
          <span className="sk-eyebrow text-ink-muted">{f(FRAME.legend)}</span>
          {(["A", "B", "C"] as const).map(cls => <ClassMark key={cls} cls={cls} size="long" language={language} />)}
          <InfoTip label={runText(UI, "howItFinishes", language)} content={<ul className="grid gap-1.5">{(["A", "B", "C"] as const).map(cls => <li key={cls}><strong className="font-semibold">{CLASS_WORDS[cls].short[language]}</strong> — {CLASS_WORDS[cls].help[language]}</li>)}</ul>} />
        </div> : null}
      </div>
      <nav aria-label={f(FRAME.secondary)} data-ai-secondary-links className={cn(styles.secondaryLinks, "flex flex-wrap gap-2")}>
        {hasKind("PAPER") && <Link className={buttonVariants({ variant: "outline", size: "sm", className: "sk-nudge-trigger" })} href={EXAM_STUDIO_HREF}><FileCheck2 aria-hidden="true" />{studioCopy.openStudio}<FlagshipChip /><ArrowRight className="sk-nudge rtl:rotate-180" aria-hidden="true" /></Link>}
        {hasKind("PAPER") && <Link className={buttonVariants({ variant: "outline", size: "sm", className: "sk-nudge-trigger" })} href="/ai/exams"><ClipboardCheck aria-hidden="true" />{f(FRAME.delivery)}<ArrowRight className="sk-nudge rtl:rotate-180" aria-hidden="true" /></Link>}
        {workflowsV2 ? <InboxCountChip tone="paper" /> : null}
        {runsVisible && campusId ? <Button type="button" variant="outline" size="sm" className="sk-nudge-trigger" onClick={() => selectTab("runs")}><Activity aria-hidden="true" />{ui("Run history")}<ArrowRight className="sk-nudge rtl:rotate-180" aria-hidden="true" /></Button> : null}
        <Button type="button" variant="outline" size="sm" className="sk-nudge-trigger" onClick={scrollToWorkflows} data-ai-hero-action={setupMode ? undefined : true}>{ui("See all workflows")}<ArrowDown className="sk-nudge" aria-hidden="true" /></Button>
      </nav>
    </section>}
    {error && <div className="mb-5"><TaskFeedback kind="error" title={c[error as "failed" | "serviceUnavailable" | "uploadInvalid"] || c.failed} action={<Button variant="outline" onClick={() => guard(() => void refresh())}><RefreshCw aria-hidden="true" />{c.reload}</Button>} /></div>}
    {notice && <Alert tone="success" compact className="mb-5" onDismiss={() => setNotice("")} data-ai-notice>{notice}</Alert>}
    <div ref={toolContent} tabIndex={-1} data-ai-workspace-tool-content>
    {unavailableWorkflow && <Alert tone="warning" compact className="mb-5" onDismiss={() => setUnavailableWorkflow(false)}>{launchCopy.unavailable}</Alert>}
    {!examOnly && tab !== "overview" && <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Button variant="outline" onClick={() => selectTab("overview")}><ArrowLeft className="rtl:rotate-180" aria-hidden="true" />{launchCopy.back}</Button><p className="text-sm font-semibold text-ink-muted">{capabilities.campuses.find(item => item.id === campusId)?.name}{subject ? ` · ${subject.className} · ${subject.name}` : ""}</p></div>}
    {tab === "overview" && examOnly && capabilities && <StudioSpaces language={language} capabilities={capabilities} records={visibleRecords} reload={() => void refresh()} openTool={navigateStudio}
      scope={resolveStudioScope(capabilities, { campusId: campusId ?? "", subjectId: selectedSubject })}>
      <StudioOverview records={visibleRecords} language={language} scopeReady={!needsCampus && !needsSubject} canReadSources={hasKind("SOURCE")} canReadPapers={hasKind("PAPER")} onNavigate={navigateStudio} />
    </StudioSpaces>}
    {/* SKO-500: the sample sits below the rail, folded, and goes away once a live AI provider is configured. */}
    {examOnly && !(featureStatusKnown && features.assistant) && <details className="sk-panel mt-5 p-3 sm:p-4" data-studio-sample><summary className="cursor-pointer text-sm font-semibold text-ink-muted">{studioHomeCopy(language).sampleDisclosure}</summary><div className="mt-3"><DemoWorkflowPanel language={language} initialWorkflow="paper" /></div></details>}
    {overview && !examOnly && <div className={styles.overviewStack}>
      <WorkspaceLaunchpad language={language} tabs={visibleTabs} onboarding={onboarding} scopeName={subject ? `${subject.className} · ${subject.name}` : campusName} needsCampus={needsCampus} needsSubject={needsSubject} hasCampuses={capabilities.campuses.length > 0} hasSubjects={subjects.length > 0} canCreate={canCreate} canOnboard={canRunQuestionnaire} openingSetup={openingSetup} featureState={featureState} onSetup={beginSetup} onOpen={selectTab} onRefreshFeatures={() => void refreshFeatures()} setupVariant={setupMode ? "secondary" : "outline"} heroAction={setupMode} scopeControl={role === "TEACHER" ? subjectField : undefined} />
      <section aria-labelledby="ai-health-title" className="grid gap-4">
        <h2 id="ai-health-title" className="text-xl font-semibold text-ink-strong">{f(FRAME.status)}</h2>
        <div className={styles.healthGrid}>
          <section data-ai-stats data-ai-stats-pending={statsPending || undefined} className={cn("sk-panel p-5 sm:p-6", styles.healthSpan7)} data-static="" aria-labelledby="ai-stats-title" aria-describedby={nextCursor && !statsPending ? "ai-stats-caption" : undefined}>
            <h3 id="ai-stats-title" className="sk-eyebrow text-ink-muted">{f(FRAME.glance)}</h3>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-border-subtle rtl:divide-x-reverse">{stats.map(stat => {
              const tile = <span aria-hidden="true" className="sk-icon-tile hidden size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-primary ring-1 ring-brand-200/60 sm:grid"><stat.Icon className="size-4" /></span>;
              const value = statsPending ? <span aria-hidden="true" className="text-2xl font-bold text-ink-faint sm:text-3xl">—</span> : <Num value={stat.count} className="text-2xl font-bold text-ink-strong sm:text-3xl" />;
              return <div key={stat.id} className={cn(styles.statCell, "grid min-w-0 content-start gap-2")} data-ai-stat={stat.id}>
                <dt className="sk-eyebrow min-w-0 text-ink-muted [overflow-wrap:anywhere]">{stat.label}</dt>
                <dd className="min-w-0">{!statsPending && visibleTabs.some(item => item.id === stat.tab)
                  ? <Button type="button" variant="ghost" size="sm" className="-ms-2 h-auto gap-3 px-2 py-1" aria-label={`${stat.label}: ${format.number(stat.count)}`} onClick={() => selectTab(stat.tab)}>{tile}{value}</Button>
                  : <span className="flex items-center gap-3">{tile}{value}</span>}</dd>
              </div>;
            })}</dl>
            {statsPending ? <p className="mt-4 text-xs text-ink-muted">{f(needsCampus ? FRAME.pendingCampus : FRAME.pendingSubject)}</p> : nextCursor ? <p id="ai-stats-caption" className="mt-4 text-xs text-ink-muted">{c.loadedRecords}</p> : null}
          </section>
          <section className={cn("sk-panel p-5 sm:p-6", styles.healthSpan5)} data-static="" data-ai-overview-readiness aria-labelledby={onboarding ? "ai-readiness-title" : undefined} aria-label={onboarding ? undefined : c.readiness}>
            {onboarding ? <>
              <h3 id="ai-readiness-title" className="font-semibold text-ink-strong">{c.readiness}</h3>
              <Progress className="mt-3" size="sm" value={readinessGroups.filter(group => !group.missing.length).length} max={readinessGroups.length} label={c.readiness} valueText={f(FRAME.readyGroups, format.number(readinessGroups.filter(group => !group.missing.length).length), format.number(readinessGroups.length))} />
              <div className="mt-2">{readinessGroups.map(group => <div className={styles.recordRow} key={group.label}><span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{c[group.label]}</span><TaskStatus attention={Boolean(group.missing.length)}>{group.missing.length ? c.needsInformation : c.readyDraft}</TaskStatus></div>)}</div>
            </> : <>
              <EmptyState size="sm" icon={ListChecks} title={c.readiness} description={canRunQuestionnaire ? c.setupHint : c.setupRestricted} action={canRunQuestionnaire ? <Button variant="ghost" size="sm" disabled={needsCampus} onClick={beginSetup}>{c.startSetup}</Button> : undefined} />
            </>}
          </section>
          <section className={cn("sk-panel p-5 sm:p-6", styles.healthSpanFull)} data-static="" aria-labelledby="ai-capabilities-title">
            <h3 id="ai-capabilities-title" className="font-semibold text-ink-strong">{c.capabilities}</h3>
            {featureStatusFailed ? <Alert className="mt-3" tone="warning" compact actions={<Button variant="ghost" size="sm" onClick={() => void refreshFeatures()}><RefreshCw aria-hidden="true" />{f(FRAME.checkAgain)}</Button>}>{c.capabilityUnknown}</Alert> : null}
            <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2" role={featureChecking ? "status" : undefined} aria-busy={featureChecking || undefined}>
              {capabilityGroups.map(group => <div key={group.id} className="min-w-0">
                <h4 className="sk-eyebrow text-ink-muted">{f(group.title)}</h4>
                <dl className="mt-1">{group.keys.map(key => <div className={cn(styles.recordRow, "items-center")} key={key} data-ai-capability={key}>
                  <dt className="min-w-0 text-sm font-medium text-ink [overflow-wrap:anywhere]">{c[key]}</dt>
                  <dd className="shrink-0">{featureChecking ? <Skeleton className="h-5 w-24 rounded-full" /> : featureStatusFailed ? <Badge size="sm" variant="neutral"><span aria-hidden="true">—</span><span className="sr-only">{c.capabilityUnknown}</span></Badge> : <Badge size="sm" dot variant={features[key] ? "success" : key === "secureBrowser" || key === "proctoring" ? "outline" : "neutral"}>{features[key] ? prototype.configured : key === "secureBrowser" || key === "proctoring" ? c.notAvailable : c.notConfigured}</Badge>}</dd>
                </div>)}</dl>
              </div>)}
              {featureChecking ? <span className="sr-only">{c.loading}</span> : null}
            </div>
          </section>
          {!needsCampus && !needsSubject && <details className={cn("sk-panel", styles.disclosure, styles.healthSpanFull)} data-static="" data-ai-chat-disclosure>
            <summary>
              <span aria-hidden="true" className="sk-icon-tile grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-200/60"><MessagesSquare className="size-5" /></span>
              <span className="grid min-w-0"><span className="text-sm font-semibold text-ink-strong">{f(FRAME.chat)}</span><span className="text-xs text-ink-muted">{f(FRAME.chatHint)}</span></span>
              <ChevronDown aria-hidden="true" className={cn(styles.disclosureChevron, "size-5 text-ink-muted")} />
            </summary>
            <div className={styles.disclosureBody}><PrivateAssistant language={language} campusId={campusId} {...scope} canCreate={canCreate} assistantAvailable={features.assistant} voiceAvailable={features.voiceTranscription} disabled={uploading} onUpload={upload} onRecord={putRecord} /></div>
          </details>}
        </div>
      </section>
      {manager && campusId && <WorkspaceInsights key={campusId} language={language} campusId={campusId} />}
      <DemoWorkflowPanel language={language} />
    </div>}
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
