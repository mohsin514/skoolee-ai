"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, History, LayoutDashboard, Mail, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { TaskFeedback, TaskLoading, TaskStatus } from "@/components/ui/task-patterns";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { readSetupDraft, setupReadiness, type SetupDraft, type SetupAnswers } from "@/lib/school-ai/onboarding";
import type { AiWorkspaceRecord, SourceData, WorkspaceCapabilities } from "@/lib/school-ai/types";
import { moduleWorkspaceHref } from "@/lib/school-ai/navigation";
import { boundedAssistantHistory } from "@/lib/school-ai/assistant-context";
import { AssessmentStudio } from "./assessment-studio";
import { AcademicSetupPanel, isAcademicSetupPlan } from "./academic-setup-panel";
import { TimetableSetupPanel, isTimetableSetupPlan } from "./timetable-setup-panel";
import { RevisionHistoryPanel } from "./revision-history";
import { AnnouncementPanel, isAnnouncementPlan } from "./announcement-panel";
import { GuidedSetup } from "./guided-setup";
import { MultimodalComposer } from "./multimodal-composer";
import { SourceLibrary } from "./source-library";
import { PolicyPanel, WorkPanel } from "./planning-panels";
import { UNCONFIGURED_CAPABILITIES, workspaceRequest, type AIFeatureCapabilities, type RecordAction, type SaveRecord } from "./workspace-client";
import styles from "./school-ai.module.css";
import { WorkspaceDraftBoundary, useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";

type Tab = "overview" | "sources" | "curriculum" | "academicSetup" | "timetableSetup" | "announcements" | "work" | "policies" | "history";
type Capabilities = WorkspaceCapabilities & { setupDefaults?: SetupAnswers };
interface WorkspaceResponse { records: AiWorkspaceRecord[]; capabilities: Capabilities; nextCursor?: string | null }
const tabs = [
  { id: "overview", Icon: LayoutDashboard }, { id: "sources", Icon: FileText }, { id: "curriculum", Icon: BookOpen }, { id: "academicSetup", Icon: CalendarDays }, { id: "timetableSetup", Icon: Clock3 }, { id: "announcements", Icon: Mail }, { id: "work", Icon: ClipboardList }, { id: "policies", Icon: ShieldCheck }, { id: "history", Icon: History },
] as const;

export function SchoolAIWorkspace(props: { role?: string; campusId?: string | null } = {}) {
  return <WorkspaceDraftBoundary><SchoolAIWorkspaceContent {...props} /></WorkspaceDraftBoundary>;
}

function SchoolAIWorkspaceContent({ role: initialRole, campusId: initialCampusId }: { role?: string; campusId?: string | null }) {
  const { language } = useLocale();
  const c = schoolAICopy(language);
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
  const [setup, setSetup] = useState(false);
  const [setupRecord, setSetupRecord] = useState<AiWorkspaceRecord | undefined>();
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedCampus, setSelectedCampus] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<{ id: string; role: "user" | "assistant"; text: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const mounted = useRef(true);
  const setupRequested = useRef(false);
  const setupCreateKey = useRef<string | null>(null);
  const scopeInitialized = useRef(false);
  const scopeEpoch = useRef(0);
  const assistantAbort = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const assistantRequest = useRef<{ fingerprint: string; key: string; failed: boolean } | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const role = capabilities?.role || initialRole || "";
  const manager = ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(role);
  const subjects = capabilities?.subjects || [];
  const subject = subjects.find(item => item.id === selectedSubject);
  const campusId = subject?.campusId || (manager ? selectedCampus || null : capabilities?.campusId || initialCampusId || null);
  const scope = subject ? { subjectId: subject.id, classId: subject.classId } : {};
  const needsSubject = role === "TEACHER" && !subject;
  const needsCampus = manager && !campusId;
  const canCreate = Boolean(capabilities?.canCreate && !needsSubject && !needsCampus);
  const visibleRecords = records.filter(record => !needsCampus && record.campusId === campusId && (!needsSubject && (role !== "TEACHER" || record.data.subjectId === subject?.id && record.data.classId === subject?.classId)));
  useWorkspaceDraft(Boolean(message.trim()) || asking || uploading || voiceBusy);
  const hasKind = (kind: AiWorkspaceRecord["kind"]) => capabilities?.kinds.includes(kind) ?? false;
  const putRecord = useCallback((record: AiWorkspaceRecord) => setRecords(previous => [record, ...previous.filter(item => item.id !== record.id)]), []);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const result = await workspaceRequest<WorkspaceResponse>("/api/school-ai/workspace");
      if (!mounted.current || sequence !== requestSequence.current) return;
      setRecords(result.records); setCapabilities(result.capabilities); setNextCursor(result.nextCursor || null); setError("");
      if (!scopeInitialized.current) { scopeInitialized.current = true; setSelectedCampus(result.capabilities.campuses.length === 1 ? result.capabilities.campuses[0].id : ""); }
    } catch { if (mounted.current && sequence === requestSequence.current) setError("failed"); }
    finally { if (mounted.current && sequence === requestSequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const abort = new AbortController();
    void workspaceRequest<AIFeatureCapabilities | { capabilities: AIFeatureCapabilities }>("/api/school-ai/capabilities", { signal: abort.signal }).then(result => {
      if (mounted.current) { setFeatures({ ...UNCONFIGURED_CAPABILITIES, ...("capabilities" in result ? result.capabilities : result) }); setFeatureStatusKnown(true); }
    }).catch(() => { if (mounted.current) setFeatures(UNCONFIGURED_CAPABILITIES); });
    return () => { mounted.current = false; abort.abort(); assistantAbort.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (!capabilities || setupRequested.current || needsCampus) return;
    setupRequested.current = true;
    if (new URLSearchParams(window.location.search).get("setup") === "1" && capabilities.kinds.includes("ONBOARDING")) {
      setSetupRecord(records.find(record => record.kind === "ONBOARDING" && record.status !== "ARCHIVED" && record.campusId === campusId)); setSetup(true);
    }
  }, [capabilities, records, campusId, needsCampus]);
  useEffect(() => { conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "instant" }); }, [conversation.length]);
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
  const ask = async () => {
    if (!message.trim() || asking || !canCreate) return;
    if (!features.assistant) { setError("serviceUnavailable"); return; }
    setAsking(true); setError("");
    const text = message.trim();
    const history = boundedAssistantHistory(conversation);
    const fingerprint = JSON.stringify({ text, language, campusId, scope, history });
    const epoch = scopeEpoch.current;
    const controller = new AbortController(); assistantAbort.current = controller;
    if (assistantRequest.current?.fingerprint !== fingerprint) assistantRequest.current = { fingerprint, key: crypto.randomUUID(), failed: false };
    try {
      const result = await workspaceRequest<{ reply: string; record?: AiWorkspaceRecord }>("/api/school-ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ message: text, language, campusId, ...scope, history, idempotencyKey: assistantRequest.current.key, retryFailed: assistantRequest.current.failed }) });
      if (!mounted.current || controller.signal.aborted || scopeEpoch.current !== epoch) return;
      setConversation(previous => [...previous, { id: crypto.randomUUID(), role: "user", text }, { id: crypto.randomUUID(), role: "assistant", text: result.reply }]);
      setMessage(""); assistantRequest.current = null; if (result.record) putRecord(result.record);
    } catch (error) { if (!controller.signal.aborted && scopeEpoch.current === epoch) { if (assistantRequest.current?.fingerprint === fingerprint) assistantRequest.current.failed = true; if (mounted.current) setError(error instanceof Error && error.message === "unavailable" ? "serviceUnavailable" : "failed"); } }
    finally { if (mounted.current && scopeEpoch.current === epoch) setAsking(false); }
  };
  const clearComposer = () => {
    assistantAbort.current?.abort(); assistantAbort.current = null; scopeEpoch.current += 1;
    setMessage(""); setAsking(false); setVoiceBusy(false); assistantRequest.current = null;
  };
  const changeScope = (next: () => void) => guard(() => {
    clearComposer(); setConversation([]); setError(""); setNotice(""); setSetupRecord(undefined); setupCreateKey.current = null; setAcademicRecordId(null); setTimetableRecordId(null); setAnnouncementRecordId(null); next();
  });
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try { const result = await workspaceRequest<WorkspaceResponse>(`/api/school-ai/workspace?cursor=${encodeURIComponent(nextCursor)}`); setRecords(previous => [...previous, ...result.records.filter(item => !previous.some(record => record.id === item.id))]); setNextCursor(result.nextCursor || null); }
    catch { setError("failed"); } finally { setLoadingMore(false); }
  };
  const beginSetup = () => guard(() => { clearComposer(); setSetupRecord(visibleRecords.find(record => record.kind === "ONBOARDING" && record.status !== "ARCHIVED")); setSetup(true); setError(""); setNotice(""); });
  const saveSetup = async (draft: SetupDraft, existing?: AiWorkspaceRecord) => {
    if (!setupCreateKey.current) setupCreateKey.current = crypto.randomUUID();
    const record = await saveRecord("ONBOARDING", draft.answers.schoolName || c.setupTitle, { ...draft }, existing, setupCreateKey.current);
    setSetupRecord(record); return record;
  };
  const openRecord = (record: AiWorkspaceRecord) => {
    if (isAcademicSetupPlan(record)) { setAcademicRecordId(record.id); setTab("academicSetup"); }
    else if (isTimetableSetupPlan(record)) { setTimetableRecordId(record.id); setTab("timetableSetup"); }
    else if (isAnnouncementPlan(record)) { setAnnouncementRecordId(record.id); setTab("announcements"); }
    else if (record.kind === "ONBOARDING") { setSetupRecord(record); setSetup(true); }
    else if (record.kind === "SOURCE") setTab("sources");
    else if (record.kind === "POLICY") setTab("policies");
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
  const announcementsVisible = canQueueAnnouncement || active.some(isAnnouncementPlan);
  const setupDefaults = role === "SUPER_ADMIN" ? { schoolName: capabilities.setupDefaults?.schoolName, timezone: capabilities.setupDefaults?.timezone, campuses: capabilities.campuses.find(item => item.id === campusId)?.name } : capabilities.setupDefaults;
  const visibleTabs = tabs.filter(item => item.id === "overview" || item.id === "history" || item.id === "sources" && hasKind("SOURCE") || item.id === "curriculum" && (hasKind("PAPER") || hasKind("CURRICULUM")) || item.id === "academicSetup" && academicPlansVisible || item.id === "timetableSetup" && timetablePlansVisible || item.id === "announcements" && announcementsVisible || item.id === "work" && hasKind("WORKFLOW") || item.id === "policies" && hasKind("POLICY"));
  return <><div className={styles.workspace} dir={language === "en" ? "ltr" : "rtl"}>
    <header className={styles.hero}><p className={styles.eyebrow}>{c.eyebrow}</p><h1 className={styles.heroTitle}>{c.headline}</h1><p className={styles.heroDescription}>{c.introduction}</p>{hasKind("ONBOARDING") && <Button className="mt-6" disabled={needsCampus} onClick={beginSetup}><Sparkles aria-hidden="true" />{onboarding ? c.resumeSetup : c.startSetup}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Button>}</header>
    {manager && <section className="sk-panel mt-5 p-5"><FormField name="ai-campus-scope" label={c.workspaceCampus} hint={c.workspaceCampusHint}><Select value={selectedCampus} onChange={event => { const value = event.target.value; if (value !== selectedCampus) changeScope(() => setSelectedCampus(value)); }}><option value="">{c.chooseCampus}</option>{capabilities.campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select></FormField>{needsCampus && <p className="mt-3 text-sm text-ink-muted">{c.selectCampusToStart}</p>}</section>}
    {role === "TEACHER" && <section className="sk-panel mt-5 p-5"><FormField name="ai-teaching-scope" label={c.subject} hint={c.selectSubjectHint}><Select value={selectedSubject} onChange={event => { const value = event.target.value; if (value !== selectedSubject) changeScope(() => setSelectedSubject(value)); }}><option value="">{c.chooseSubject}</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.className} · {item.name}</option>)}</Select></FormField></section>}
    <nav className={styles.tabs} aria-label={c.workspace}>{visibleTabs.map(({ id, Icon }) => <Button key={id} variant={tab === id ? "secondary" : "ghost"} aria-pressed={tab === id} className={styles.tab} onClick={() => { if (tab !== id) guard(() => { clearComposer(); setTab(id); setAcademicRecordId(null); setTimetableRecordId(null); setAnnouncementRecordId(null); setError(""); setNotice(""); }); }}><Icon aria-hidden="true" />{c[id]}</Button>)}</nav>
    {hasKind("PAPER") && <div className="mb-5"><Link className={buttonVariants({ variant: "outline" })} href="/ai/exams"><BookOpen aria-hidden="true" />{c.exams}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></Link></div>}
    {error && <div className="mb-5"><TaskFeedback kind="error" title={c[error as "failed" | "serviceUnavailable" | "uploadInvalid"] || c.failed} action={<Button variant="outline" onClick={() => guard(() => void refresh())}><RefreshCw aria-hidden="true" />{c.reload}</Button>} /></div>}
    {notice && <p role="status" className={`${styles.notice} mb-5`}><CheckCircle2 className="mt-1 size-4 shrink-0" aria-hidden="true" />{notice}</p>}
    {tab === "overview" && <>
      {nextCursor && <p className="text-xs text-ink-muted">{c.loadedRecords}</p>}
      <div className={styles.metrics}>{[{ label: c.savedPlans, count: active.filter(record => record.kind === "WORKFLOW").length }, { label: c.reviewCount, count: active.filter(record => record.status === "IN_REVIEW").length }, { label: c.approvedSources, count: active.filter(record => record.kind === "SOURCE" && record.status === "APPROVED").length }].map(metric => <div className={`sk-panel ${styles.metric}`} key={metric.label}><span className={styles.metricNumber}>{new Intl.NumberFormat(language).format(metric.count)}</span><span className={styles.metricLabel}>{metric.label}</span></div>)}</div>
      <div className={styles.columns}><section className={`sk-panel ${styles.panel}`}><div className="mb-2 flex items-center gap-2"><Sparkles className="size-5 text-primary" aria-hidden="true" /><h2 className={styles.sectionTitle}>{c.ask}</h2></div><p className={styles.description}>{c.askHint}</p>
        {!features.assistant && <p className={`${styles.notice} mb-5`}>{c.serviceUnavailable}</p>}
        {!!conversation.length && <div ref={conversationRef} className={styles.conversation} role="log" aria-label={c.ask} aria-live="polite">{conversation.map(item => <div key={item.id} className={`${styles.message} ${item.role === "user" ? styles.userMessage : styles.assistantMessage}`}>{item.text}</div>)}</div>}
        <MultimodalComposer key={`${campusId || "none"}:${selectedSubject}`} language={language} value={message} onChange={setMessage} onSubmit={ask} onUpload={upload} voiceAvailable={features.voiceTranscription} disabled={!canCreate || uploading} busy={asking} onActivityChange={setVoiceBusy} /><p className="mt-3 text-xs leading-relaxed text-ink-muted">{c.sessionConversationHint}</p>
      </section><aside className="space-y-5"><section className={`sk-panel ${styles.panel}`}><h2 className={styles.sectionTitle}>{c.readiness}</h2>{onboarding ? setupReadiness(setupAnswers).map(group => <div className={styles.recordRow} key={group.label}><span className="text-sm font-semibold">{c[group.label]}</span><TaskStatus attention={Boolean(group.missing.length)}>{group.missing.length ? c.needsInformation : c.readyDraft}</TaskStatus></div>) : <><p className={styles.description}>{hasKind("ONBOARDING") ? c.setupHint : c.setupRestricted}</p>{hasKind("ONBOARDING") && <Button variant="outline" disabled={needsCampus} onClick={beginSetup}>{c.startSetup}</Button>}</>}</section>
        <section className={`sk-panel ${styles.panel}`}><h2 className="mb-3 font-bold">{c.capabilities}</h2>{(Object.keys(UNCONFIGURED_CAPABILITIES) as (keyof AIFeatureCapabilities)[]).map(key => <div className={styles.recordRow} key={key}><span className="text-xs font-semibold">{c[key]}</span><span className={`text-xs ${features[key] ? "text-primary" : "text-ink-muted"}`}>{!featureStatusKnown ? c.capabilityUnknown : features[key] ? c.configured : key === "secureBrowser" || key === "proctoring" ? c.notAvailable : c.notConfigured}</span></div>)}</section>
      </aside></div>
    </>}
    {tab === "sources" && <SourceLibrary key={`${campusId}:${selectedSubject}`} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} onUpload={upload} scope={scope} uploading={uploading} campusId={campusId} canImportRoster={capabilities.canImportRoster} />}
    {tab === "curriculum" && <AssessmentStudio key={`${campusId}:${selectedSubject}`} records={visibleRecords} locale={language} onRefresh={refresh} campusId={campusId} subjects={subjects.filter(item => item.campusId === campusId && (role !== "TEACHER" || item.id === selectedSubject))} canCreate={canCreate} canApprove={capabilities.canApprove} />}
    {tab === "academicSetup" && academicPlansVisible && <AcademicSetupPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={academicRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canApply={canSetUpAcademics && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "timetableSetup" && timetablePlansVisible && <TimetableSetupPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={timetableRecordId} canCreate={canCreate} canApprove={capabilities.canApprove} canApply={canSetUpTimetable && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "announcements" && announcementsVisible && <AnnouncementPanel key={campusId || "none"} language={language} records={visibleRecords} campuses={capabilities.campuses.filter(item => item.id === campusId)} campusId={campusId} initialRecordId={announcementRecordId} canCreate={canCreate && canQueueAnnouncement} canApprove={capabilities.canApprove} canQueue={canQueueAnnouncement && !needsCampus} onRecord={putRecord} onAction={recordAction} />}
    {tab === "work" && <WorkPanel key={`${campusId}:${selectedSubject}`} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} scope={scope} onOpenRecord={openRecord} moduleHref={module => moduleWorkspaceHref(role, module)} />}
    {tab === "policies" && <PolicyPanel key={campusId || "none"} language={language} records={visibleRecords} canCreate={canCreate} canApprove={capabilities.canApprove} onSave={saveRecord} onAction={recordAction} />}
    {tab === "history" && <RevisionHistoryPanel key={`${campusId}:${selectedSubject}`} language={language} records={visibleRecords} onRecord={putRecord} onAction={recordAction} />}
    {nextCursor && <div className="mt-6 flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? c.loading : c.loadMore}</Button></div>}
  </div>{setup && hasKind("ONBOARDING") && !needsCampus && <GuidedSetup key={campusId || "school"} language={language} record={setupRecord} defaults={setupDefaults} voiceAvailable={features.voiceTranscription} assistantAvailable={features.assistant} campusId={campusId} canApprove={capabilities.canApprove} onAction={recordAction} onSave={saveSetup} onClose={() => setSetup(false)} onUpload={upload} />}</>;
}
