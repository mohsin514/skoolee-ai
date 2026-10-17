"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, History, LayoutDashboard, Mail, ReceiptText, ListChecks, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { TaskFeedback, TaskLoading, TaskStatus } from "@/components/ui/task-patterns";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { readSetupDraft, setupReadiness, type SetupDraft, type SetupAnswers } from "@/lib/school-ai/onboarding";
import type { AiWorkspaceRecord, SourceData, WorkspaceCapabilities } from "@/lib/school-ai/types";
import { StudioOverview, type StudioWorkspaceTab } from "./exam-studio/studio-overview";
import { StudioSpaces } from "./exam-studio/studio-spaces";
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
  const { language } = useLocale();
  const c = schoolAICopy(language);
  const studioCopy = studioShellCopy(language);
  const guard = useWorkspaceDraftNavigation();
  const [records, setRecords] = useState<AiWorkspaceRecord[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [features, setFeatures] = useState<AIFeatureCapabilities>(UNCONFIGURED_CAPABILITIES);
  const [featureStatusKnown, setFeatureStatusKnown] = useState(false);
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
  const [setup, setSetup] = useState(false);
  const [setupRecord, setSetupRecord] = useState<AiWorkspaceRecord | undefined>();
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedCampus, setSelectedCampus] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mounted = useRef(true);
  const setupRequested = useRef(false);
  const setupCreateKey = useRef<string | null>(null);
  const scopeInitialized = useRef(false);
  const requestSequence = useRef(0);
  const role = capabilities?.role || initialRole || "";
  const manager = ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(role);
  const subjects = capabilities?.subjects || [];
  const subject = subjects.find(item => item.id === selectedSubject);
  const campusId = subject?.campusId || (manager ? selectedCampus || null : capabilities?.campusId || initialCampusId || null);
  const scope = subject ? { subjectId: subject.id, classId: subject.classId } : {};
  const needsSubject = role === "TEACHER" && !subject;
  const needsCampus = manager && !campusId;
  const canCreate = Boolean(capabilities?.canCreate && !needsSubject && !needsCampus);
  const visibleRecords = records.filter(record => (!examOnly || ["SOURCE", "CURRICULUM", "PAPER", "BRIEF", "PRACTICE"].includes(record.kind) || isExamSessionPlan(record)) && !needsCampus && record.campusId === campusId && (!needsSubject && (role !== "TEACHER" || record.data.subjectId === subject?.id && record.data.classId === subject?.classId)));
  useWorkspaceDraft(uploading);
  const hasKind = (kind: AiWorkspaceRecord["kind"]) => capabilities?.kinds.includes(kind) ?? false;
  const putRecord = useCallback((record: AiWorkspaceRecord) => setRecords(previous => [record, ...previous.filter(item => item.id !== record.id)]), []);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const result = await workspaceRequest<WorkspaceResponse>("/api/school-ai/workspace");
      if (!mounted.current || sequence !== requestSequence.current) return;
      setRecords(result.records); setCapabilities(result.capabilities); setNextCursor(result.nextCursor || null); setError("");
      if (!scopeInitialized.current) {
        scopeInitialized.current = true; setSelectedCampus(result.capabilities.campuses.length === 1 ? result.capabilities.campuses[0].id : "");
        // Exam Studio: a teacher with exactly one assigned subject works in it, as `resolveStudioScope` does.
        if (examOnly && result.capabilities.role === "TEACHER" && result.capabilities.subjects.length === 1) setSelectedSubject(result.capabilities.subjects[0].id);
      }
    } catch { if (mounted.current && sequence === requestSequence.current) setError("failed"); }
    finally { if (mounted.current && sequence === requestSequence.current) setLoading(false); }
  }, [examOnly]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const abort = new AbortController();
    void workspaceRequest<AIFeatureCapabilities | { capabilities: AIFeatureCapabilities }>("/api/school-ai/capabilities", { signal: abort.signal }).then(result => {
      if (mounted.current) { setFeatures({ ...UNCONFIGURED_CAPABILITIES, ...("capabilities" in result ? result.capabilities : result) }); setFeatureStatusKnown(true); }
    }).catch(() => { if (mounted.current) setFeatures(UNCONFIGURED_CAPABILITIES); });
    return () => { mounted.current = false; abort.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (examOnly || !capabilities || setupRequested.current || needsCampus) return;
    setupRequested.current = true;
    if (new URLSearchParams(window.location.search).get("setup") === "1" && capabilities.kinds.includes("ONBOARDING")) {
      setSetupRecord(records.find(record => record.kind === "ONBOARDING" && record.status !== "ARCHIVED" && record.campusId === campusId)); setSetup(true);
    }
  }, [capabilities, records, campusId, needsCampus, examOnly]);
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
    setError(""); setNotice(""); setSetupRecord(undefined); setupCreateKey.current = null; setAcademicRecordId(null); setTimetableRecordId(null); setAnnouncementRecordId(null); setFeeRecordId(null); setExamPlanRecordId(null); setOperationRecordId(null); setFinanceOperationRecordId(null); setSchoolSetupRecordId(null); next();
  });
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try { const result = await workspaceRequest<WorkspaceResponse>(`/api/school-ai/workspace?cursor=${encodeURIComponent(nextCursor)}`); setRecords(previous => [...previous, ...result.records.filter(item => !previous.some(record => record.id === item.id))]); setNextCursor(result.nextCursor || null); }
    catch { setError("failed"); } finally { setLoadingMore(false); }
  };
  const beginSetup = () => guard(() => { setSetupRecord(visibleRecords.find(record => record.kind === "ONBOARDING" && record.status !== "ARCHIVED")); setSetup(true); setError(""); setNotice(""); });
  const saveSetup = async (draft: SetupDraft, existing?: AiWorkspaceRecord) => {
    if (!setupCreateKey.current) setupCreateKey.current = crypto.randomUUID();
    const record = await saveRecord("ONBOARDING", draft.answers.schoolName || c.setupTitle, { ...draft }, existing, setupCreateKey.current);
    setSetupRecord(record); return record;
  };
  const openRecord = (record: AiWorkspaceRecord) => {
    if (isSchoolSetupPlan(record)) {setSchoolSetupRecordId(record.id);setTab("schoolSetup");}
    else if (isAcademicSetupPlan(record)) { setAcademicRecordId(record.id); setTab("academicSetup"); }
    else if (isTimetableSetupPlan(record)) { setTimetableRecordId(record.id); setTab("timetableSetup"); }
    else if (isAnnouncementPlan(record)) { setAnnouncementRecordId(record.id); setTab("announcements"); }
    else if (isSchoolOperationsPlan(record)) { setOperationRecordId(record.id); setTab("schoolOperations"); }
    else if ((record.data.proposal as { operation?: string } | undefined)?.operation === "finance.apply_operation") { setFinanceOperationRecordId(record.id); setTab("financeOperations"); }
    else if (isFeeInvoicePlan(record)) { setFeeRecordId(record.id); setTab("feeInvoices"); }
    else if (isExamSessionPlan(record)) { setExamPlanRecordId(record.id); setTab("examPlanning"); }
    else if (record.kind === "ONBOARDING") { setSetupRecord(record); setSetup(true); }
    else if (record.kind === "SOURCE") setTab("sources");
    else if (record.kind === "POLICY") setTab(record.data.knowledge?"knowledge":"policies");
    else if (record.kind === "CURRICULUM" || record.kind === "PAPER") setTab("curriculum");
  };

  if (loading) return <TaskLoading label={c.loading} />;
  if (!capabilities) return <TaskFeedback kind="error" title={c.failed} action={<Button onClick={() => { setLoading(true); void refresh(); }}><RefreshCw aria-hidden="true" />{c.retry}</Button>} />;
  const active = visibleRecords.filter(record => record.status !== "ARCHIVED");
  const onboarding = active.find(record => record.kind === "ONBOARDING");
  const setupAnswers = readSetupDraft(onboarding?.data).answers;
  const canSetUpAcademics = capabilities.tools?.some(tool => tool.operation === "academics.setup_year") ?? false;
  const academicPlansVisible = canSetUpAcademics || active.some(isAcademicSetupPlan);
  const canSetUpTimetable = capabilities.tools?.some(tool => tool.operation === "timetable.create_draft") ?? false;
  const timetablePlansVisible = manager && hasKind("WORKFLOW") || active.some(isTimetableSetupPlan);
  const canQueueAnnouncement = capabilities.tools?.some(tool => tool.operation === "communications.queue_announcement") ?? false;
  const canGenerateInvoices = capabilities.tools?.some(tool => tool.operation === "fees.generate_invoices") ?? false;
  const canPlanExams = capabilities.tools?.some(tool => tool.operation === "exams.create_session_plan") ?? false;
  const feesVisible = canGenerateInvoices || active.some(isFeeInvoicePlan);
  const examPlansVisible = canPlanExams || active.some(isExamSessionPlan);
  const announcementsVisible = canQueueAnnouncement || active.some(isAnnouncementPlan);
  const setupDefaults = role === "SUPER_ADMIN" ? { schoolName: capabilities.setupDefaults?.schoolName, timezone: capabilities.setupDefaults?.timezone, campuses: capabilities.campuses.find(item => item.id === campusId)?.name } : capabilities.setupDefaults;
  const executableOperations = capabilities.tools?.map(tool => tool.operation) ?? [];
  const schoolSetupVisible = executableOperations.includes("setup.apply_changes");
  const schoolOperations = executableOperations.filter(isSchoolOperationsOperation);
  const financeOperationsVisible = executableOperations.includes("finance.apply_operation");
  const permittedTabs = tabs.filter(item => item.id === "schoolSetup" && schoolSetupVisible || item.id === "schoolOperations" && schoolOperations.length > 0 || item.id === "financeOperations" && financeOperationsVisible || item.id === "runs" && manager && executableOperations.length > 0 || item.id === "overview" || item.id === "setupTasks" || item.id === "feeInvoices" && feesVisible || item.id === "examPlanning" && examPlansVisible || item.id === "history" || item.id === "sources" && hasKind("SOURCE") || item.id === "curriculum" && (hasKind("PAPER") || hasKind("CURRICULUM")) || item.id === "academicSetup" && academicPlansVisible || item.id === "timetableSetup" && timetablePlansVisible || item.id === "announcements" && announcementsVisible || item.id === "work" && hasKind("WORKFLOW") || (item.id === "knowledge" || item.id === "policies") && hasKind("POLICY"));
  const visibleTabs = examOnly ? permittedTabs.filter(item => ["overview", "sources", "curriculum", "examPlanning", "history"].includes(item.id)) : permittedTabs;
  const navigateStudio = (next: StudioWorkspaceTab) => guard(() => {
    if (!visibleTabs.some(item => item.id === next)) return;
    setTab(next); setError(""); setNotice("");
  });
  return <><div className={`${styles.workspace} ${examOnly ? "p-3 sm:p-6" : ""}`} dir={language === "en" ? "ltr" : "rtl"}>
    {!examOnly && <header className={styles.hero}><p className={styles.eyebrow}>{c.eyebrow}</p><h1 className={styles.heroTitle}>{c.headline}</h1><p className={styles.heroDescription}>{c.introduction}</p>{hasKind("ONBOARDING") && <Button className="mt-6" disabled={needsCampus} onClick={beginSetup}><Sparkles aria-hidden="true" />{onboarding ? c.resumeSetup : c.startSetup}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button>}</header>}
    {manager && <section className={`sk-panel ${examOnly ? "mt-3 p-3 sm:mt-5 sm:p-5" : "mt-5 p-5"}`}><FormField name="ai-campus-scope" label={c.workspaceCampus} hint={c.workspaceCampusHint}><Select value={selectedCampus} onChange={event => { const value = event.target.value; if (value !== selectedCampus) changeScope(() => setSelectedCampus(value)); }}><option value="">{c.chooseCampus}</option>{capabilities.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select></FormField>{needsCampus && <p className="mt-3 text-sm text-ink-muted">{c.selectCampusToStart}</p>}</section>}
    {role === "TEACHER" && <section className={`sk-panel ${examOnly ? "mt-3 p-3 sm:mt-5 sm:p-5" : "mt-5 p-5"}`}><FormField name="ai-teaching-scope" label={c.subject} hint={c.selectSubjectHint}><Select value={selectedSubject} onChange={event => { const value = event.target.value; if (value !== selectedSubject) changeScope(() => setSelectedSubject(value)); }}><option value="">{c.chooseSubject}</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.className} · {item.name}</option>)}</Select></FormField></section>}
    <nav className={`${styles.tabs} ${examOnly ? studioStyles.workspaceTabs : ""}`} aria-label={c.workspace}>{visibleTabs.map(({ id, Icon }) => <Button key={id} variant={tab === id ? "secondary" : "ghost"} aria-pressed={tab === id} className={styles.tab} onClick={() => { if (tab !== id) guard(() => { setTab(id); setAcademicRecordId(null); setTimetableRecordId(null); setAnnouncementRecordId(null); setFeeRecordId(null); setExamPlanRecordId(null); setOperationRecordId(null); setFinanceOperationRecordId(null); setSchoolSetupRecordId(null); setError(""); setNotice(""); }); }}><Icon aria-hidden="true" />{examOnly ? studioCopy[id as StudioWorkspaceTab] : c[id]}</Button>)}</nav>
    {!examOnly && hasKind("PAPER") && <div className="mb-5 flex flex-wrap gap-3"><Link className={buttonVariants({ variant: "default" })} href={EXAM_STUDIO_HREF}><Sparkles aria-hidden="true" />{studioCopy.openStudio}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Link><Link className={buttonVariants({ variant: "outline" })} href="/ai/exams"><BookOpen aria-hidden="true" />{c.exams}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Link></div>}
    {error && <div className="mb-5"><TaskFeedback kind="error" title={c[error as "failed" | "serviceUnavailable" | "uploadInvalid"] || c.failed} action={<Button variant="outline" onClick={() => guard(() => void refresh())}><RefreshCw aria-hidden="true" />{c.reload}</Button>} /></div>}
    {notice && <p role="status" className={`${styles.notice} mb-5`}><CheckCircle2 className="mt-1 size-4 shrink-0" aria-hidden="true" />{notice}</p>}
    {tab === "overview" && examOnly && capabilities && <StudioSpaces language={language} capabilities={capabilities} records={visibleRecords} reload={() => void refresh()} openTool={navigateStudio}
      scope={resolveStudioScope(capabilities, { campusId: campusId ?? "", subjectId: selectedSubject })}>
      <StudioOverview records={visibleRecords} language={language} scopeReady={!needsCampus && !needsSubject} canReadSources={hasKind("SOURCE")} canReadPapers={hasKind("PAPER")} onNavigate={navigateStudio} />
    </StudioSpaces>}
    {tab === "overview" && !examOnly && <>
      {nextCursor && <p className="text-xs text-ink-muted">{c.loadedRecords}</p>}
      <div className={styles.metrics}>{[{ label: c.savedPlans, count: active.filter(record => record.kind === "WORKFLOW").length }, { label: c.reviewCount, count: active.filter(record => record.status === "IN_REVIEW").length }, { label: c.approvedSources, count: active.filter(record => record.kind === "SOURCE" && record.status === "APPROVED").length }].map(metric => <div className={`sk-panel ${styles.metric}`} key={metric.label}><span className={styles.metricNumber}>{new Intl.NumberFormat(language).format(metric.count)}</span><span className={styles.metricLabel}>{metric.label}</span></div>)}</div>
      <div className={styles.columns}><section className={`sk-panel ${styles.panel}`}>
        {!needsCampus && !needsSubject && <PrivateAssistant language={language} campusId={campusId} {...scope} canCreate={canCreate} assistantAvailable={features.assistant} voiceAvailable={features.voiceTranscription} disabled={uploading} onUpload={upload} onRecord={putRecord} />}
        {(needsCampus || needsSubject) && <p className={styles.description}>{needsCampus ? c.selectCampusToStart : c.selectSubjectHint}</p>}
      </section><aside className="space-y-5"><section className={`sk-panel ${styles.panel}`}><h2 className={styles.sectionTitle}>{c.readiness}</h2>{onboarding ? setupReadiness(setupAnswers).map(group => <div className={styles.recordRow} key={group.label}><span className="text-sm font-semibold">{c[group.label]}</span><TaskStatus attention={Boolean(group.missing.length)}>{group.missing.length ? c.needsInformation : c.readyDraft}</TaskStatus></div>) : <><p className={styles.description}>{hasKind("ONBOARDING") ? c.setupHint : c.setupRestricted}</p>{hasKind("ONBOARDING") && <Button variant="outline" disabled={needsCampus} onClick={beginSetup}>{c.startSetup}</Button>}</>}</section>
        <section className={`sk-panel ${styles.panel}`}><h2 className="mb-3 font-bold">{c.capabilities}</h2>{(Object.keys(UNCONFIGURED_CAPABILITIES) as (keyof AIFeatureCapabilities)[]).map(key => <div className={styles.recordRow} key={key}><span className="text-xs font-semibold">{c[key]}</span><span className={`text-xs ${features[key] ? "text-primary" : "text-ink-muted"}`}>{!featureStatusKnown ? c.capabilityUnknown : features[key] ? c.configured : key === "secureBrowser" || key === "proctoring" ? c.notAvailable : c.notConfigured}</span></div>)}</section>
      </aside></div>
      {manager && campusId && <WorkspaceInsights key={campusId} language={language} campusId={campusId} />}
    </>}
    {tab === "sources" && <SourceLibrary onRecord={putRecord} canArchive={capabilities.canArchive} key={`${campusId}:${selectedSubject}`} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} onUpload={upload} scope={scope} uploading={uploading} campusId={campusId} canImportRoster={!examOnly && capabilities.canImportRoster} />}
    {tab !== "overview" && tab !== "history" && !needsCampus && !needsSubject && <DomainAssistant key={`${campusId}:${selectedSubject}:${tab}`} domain={tab} title={c[tab]} records={visibleRecords} language={language} campusId={campusId} {...scope} canCreate={canCreate} assistantAvailable={features.assistant} voiceAvailable={features.voiceTranscription} disabled={uploading} onUpload={upload} onRecord={putRecord}/> }
    {tab === "curriculum" && <AssessmentStudio key={`${campusId}:${selectedSubject}`} records={visibleRecords} locale={language} onRefresh={refresh} campusId={campusId} subjects={subjects.filter(item => item.campusId === campusId && (role !== "TEACHER" || item.id === selectedSubject))} canCreate={canCreate} canApprove={capabilities.canApprove} />}
    {tab === "academicSetup" && academicPlansVisible && <AcademicSetupPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={academicRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canApply={canSetUpAcademics && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "timetableSetup" && timetablePlansVisible && <TimetableSetupPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={timetableRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canApply={canSetUpTimetable && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "announcements" && announcementsVisible && <AnnouncementPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={announcementRecordId} canCreate={canCreate && canQueueAnnouncement} canApprove={capabilities.canApprove} canQueue={canQueueAnnouncement && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "feeInvoices" && feesVisible && <FeeInvoicePanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={feeRecordId} canCreate={canCreate && canGenerateInvoices} canApprove={capabilities.canApprove} canGenerate={canGenerateInvoices && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "examPlanning" && examPlansVisible && <ExamSessionPlanPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={examPlanRecordId} canCreate={canCreate && canPlanExams} canApprove={capabilities.canApprove} canApply={canPlanExams && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "schoolSetup" && schoolSetupVisible && <SchoolSetupPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id===campusId)} campusId={campusId} initialRecordId={schoolSetupRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canExecute={!needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "schoolOperations" && schoolOperations.length > 0 && <SchoolOperationsPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={operationRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canExecute={!needsCampus} allowedOperations={schoolOperations} onRecord={putRecord} onAction={recordAction} />}
    {tab === "financeOperations" && financeOperationsVisible && <FinanceOperationsPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={financeOperationRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canExecute={!needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "runs" && manager && campusId && <RunsPanel key={campusId} language={language} campusId={campusId} records={visibleRecords} operations={executableOperations} />}
    {tab === "setupTasks" && <SetupTasksPanel key={campusId || "none"} language={language} campusId={campusId} records={visibleRecords} canManage={manager && canCreate} onRecord={putRecord} />}
    {tab === "work" && <WorkPanel key={`${campusId}:${selectedSubject}`} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} scope={scope} onOpenRecord={openRecord} moduleHref={module => moduleWorkspaceHref(role, module)} />}
    {tab === "knowledge" && <KnowledgePanel key={campusId || "none"} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} />}
    {tab === "policies" && <PolicyPanel key={campusId || "none"} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} />}
    {tab === "history" && <RevisionHistoryPanel key={`${campusId}:${selectedSubject}`} language={language} records={visibleRecords} onRecord={putRecord} onAction={recordAction} />}
    {nextCursor && <div className="mt-6 flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? c.loading : c.loadMore}</Button></div>}
  </div>{setup && hasKind("ONBOARDING") && !needsCampus && <GuidedSetup key={campusId || "school"} language={language} record={setupRecord} defaults={setupDefaults} voiceAvailable={features.voiceTranscription} assistantAvailable={features.assistant} campusId={campusId} canApprove={capabilities.canApprove} onAction={recordAction} onSave={saveSetup} onClose={() => setSetup(false)} onUpload={upload} />}</>;
}
