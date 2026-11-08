"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Download, History, Loader2, MessageCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { VoiceConversation } from "./voice-conversation";
import { MultimodalComposer } from "./multimodal-composer";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { workspaceErrorText, workspaceRequest, WorkspaceRequestError } from "./workspace-client";
import { conversationCopy } from "@/lib/school-ai/conversation-copy";
import { schoolAICopy } from "@/lib/school-ai/copy";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import type { PrivateConversation, PrivateConversationList, PrivateConversationPage } from "@/lib/school-ai/conversations";
import styles from "./school-ai.module.css";
import type { AssistantFocus } from "@/lib/school-ai/assistant-focus";

import { assistantCatalogCopy } from "./assistant-catalog-copy";
import { AssistantEntityPicker } from "./assistant-entity-picker";
import { catalogOperationsForFocus, type AssistantCatalogSelection } from "@/lib/school-ai/assistant-catalog";
import { AssistantResponse } from "./assistant-response";
import { DemoWorkflowPanel } from "./demo-workflow-panel";
import { prototypeCopy } from "./prototype-copy";

export interface PrivateAssistantProps {
  language: Language; campusId?: string | null; subjectId?: string; classId?: string;
  canCreate: boolean; assistantAvailable: boolean; voiceAvailable: boolean; disabled?: boolean;
  onUpload: (file: File, origin: "upload" | "camera") => Promise<void>;
  onRecord?: (record: AiWorkspaceRecord) => void; onActivityChange?: (active: boolean) => void; onDraftChange?: (dirty: boolean) => void;
  purpose?: "WORKSPACE" | "SETUP"; topicKey?: string; promptPrefix?: string;
  focus?:AssistantFocus;
}
export function PrivateAssistant(props: PrivateAssistantProps) {
  const scope = JSON.stringify([props.campusId ?? null, props.subjectId ?? null, props.classId ?? null, props.purpose ?? "WORKSPACE", props.topicKey ?? null,props.focus ?? null]);
  return <ConversationPanel key={scope} {...props} />;
}
function ConversationPanel({ language, campusId, subjectId, classId, canCreate, assistantAvailable, voiceAvailable, disabled, onUpload, onRecord, onActivityChange, onDraftChange, purpose = "WORKSPACE", topicKey, promptPrefix,focus }: PrivateAssistantProps) {
  const c = conversationCopy(language), general = schoolAICopy(language), guard = useWorkspaceDraftNavigation();
  const prototype = prototypeCopy(language);
  const [catalog, setCatalog] = useState<AssistantCatalogSelection>();
  const [conversations, setConversations] = useState<PrivateConversation[]>([]), [page, setPage] = useState<PrivateConversationPage | null>(null);
  const [archived, setArchived] = useState(false), [nextCursor, setNextCursor] = useState<string | null>(null);
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [voiceBusy, setVoiceBusy] = useState(false), [liveVoiceBusy, setLiveVoiceBusy] = useState(false);
  const createKey = useRef<{ fingerprint: string; key: string } | null>(null), requestKey = useRef<{ text: string; id: string; failed: boolean; language: Language; catalog?: AssistantCatalogSelection } | null>(null);
  const mounted = useRef(true), controller = useRef<AbortController | null>(null);
  // SKO-460: an unsent message survives a reload in this tab only, keyed to the signed-in user, the
  // assistant scope and the conversation, so another person signing in here never sees it.
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  useEffect(() => { let live = true; void fetch("/api/auth/session", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(data => { if (live) setDraftOwner(typeof data?.user?.id === "string" ? data.user.id : null); }).catch(() => undefined); return () => { live = false; }; }, []);
  const scopeKey = JSON.stringify([campusId ?? null, subjectId ?? null, classId ?? null, purpose, topicKey ?? null]);
  const draftKey = draftOwner ? `skoolee.ai-draft.v1:${draftOwner}:${scopeKey}:${page?.conversation.id ?? "new"}` : null;
  const clearDraft = () => { if (draftKey) { try { sessionStorage.removeItem(draftKey); } catch { /* storage unavailable */ } } };
  // A key is written only after it has been read back once, so a reload can never erase the saved
  // draft before restoring it.
  const hydratedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!draftKey || loading || hydratedKey.current === draftKey) return;
    hydratedKey.current = draftKey;
    if (message || page?.recovery) return; // never over text the user is typing or a recovered turn
    try { const saved = sessionStorage.getItem(draftKey); if (saved) setMessage(saved.slice(0, 4000)); } catch { /* storage unavailable */ }
  }, [draftKey, loading, message, page?.recovery]);
  useEffect(() => {
    if (!draftKey || hydratedKey.current !== draftKey) return;
    try { if (message.trim()) sessionStorage.setItem(draftKey, message.slice(0, 4000)); else sessionStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
  }, [draftKey, message]);
  const dirty = Boolean(message.trim()) || busy || voiceBusy || liveVoiceBusy;
  useWorkspaceDraft(dirty);
  useEffect(() => { onDraftChange?.(dirty); return () => onDraftChange?.(false); }, [dirty, onDraftChange]);
  useEffect(() => { onActivityChange?.(busy || voiceBusy || liveVoiceBusy); return () => onActivityChange?.(false); }, [busy, voiceBusy, liveVoiceBusy, onActivityChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const query = useCallback((before?: string, includeArchived = archived) => { const value = new URLSearchParams({ purpose, archived: String(includeArchived) }); if (campusId) value.set("campusId", campusId); if (subjectId) value.set("subjectId", subjectId); if (classId) value.set("classId", classId); if (topicKey) value.set("topicKey", topicKey); if (before) value.set("before", before); return value; }, [archived, campusId, classId, purpose, subjectId, topicKey]);
  const acceptPage = (result: PrivateConversationPage, restoreMessage: boolean) => {
    setPage(result);
    if (restoreMessage) { setCatalog(result.recovery?.catalog); setMessage(result.recovery?.message ?? ""); requestKey.current = result.recovery ? { text: result.recovery.message, id: result.recovery.key, failed: true, language: result.recovery.language, catalog: result.recovery.catalog } : null; }
  };
  const load = async (id: string, restoreMessage = true, beforeVersion?: number) => {
    setLoading(true); setError("");
    try {
      const result = await workspaceRequest<PrivateConversationPage>(`/api/school-ai/conversations/${encodeURIComponent(id)}${beforeVersion ? `?beforeVersion=${beforeVersion}` : ""}`);
      if (!mounted.current) return;
      if (beforeVersion) setPage(previous => previous ? { ...result, exchanges: [...result.exchanges, ...previous.exchanges] } : result);
      else acceptPage(result, restoreMessage);
    } catch (error) { if (mounted.current) { setPage(null); setError(workspaceErrorText(error, general)); } }
    finally { if (mounted.current) setLoading(false); }
  };
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError("");
    void workspaceRequest<PrivateConversationList>(`/api/school-ai/conversations?${query()}`, { signal: abort.signal }).then(async result => {
      if (abort.signal.aborted) return; setConversations(result.conversations); setNextCursor(result.nextCursor);
      if (result.conversations[0]) { const selected = await workspaceRequest<PrivateConversationPage>(`/api/school-ai/conversations/${result.conversations[0].id}`, { signal: abort.signal }); if (!abort.signal.aborted) acceptPage(selected, true); }
      else setPage(null);
    }).catch(error => { if (!abort.signal.aborted) setError(workspaceErrorText(error, general)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
    // Copy changes do not reload or discard a typed message.
  }, [query]);
  // A turn still being answered elsewhere (its lease is live) is re-read until it settles.
  const pendingId = page?.recovery?.status === "PENDING" ? page.conversation.id : null;
  useEffect(() => {
    if (!pendingId) return;
    let polls = 0;
    const timer = window.setInterval(() => { polls++; if (polls > 24) { window.clearInterval(timer); return; } void load(pendingId, true); }, 5000);
    return () => window.clearInterval(timer);
  }, [pendingId]);
  const refreshList = async () => { const result = await workspaceRequest<PrivateConversationList>(`/api/school-ai/conversations?${query(nextCursor ?? undefined)}`); setConversations(previous => [...previous, ...result.conversations.filter(item => !previous.some(existing => existing.id === item.id))]); setNextCursor(result.nextCursor); };
  const switchConversation = (id: string) => guard(() => { setMessage(""); setCatalog(undefined); requestKey.current = null; createKey.current = null; if (id) void load(id); else { setPage(null); setError(""); } });
  const [confirmDelete, setConfirmDelete] = useState(false), [notice, setNotice] = useState("");
  const removeConversation = async () => {
    if (!page) return;
    setBusy(true); setError("");
    try {
      await workspaceRequest(`/api/school-ai/conversations/${page.conversation.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: page.conversation.version }) });
      clearDraft();
      setConversations(previous => previous.filter(item => item.id !== page.conversation.id)); setPage(null); setMessage(""); requestKey.current = null; setNotice(c.deleted);
    } catch (error) { setError(workspaceErrorText(error, general)); }
    finally { setBusy(false); setConfirmDelete(false); }
  };
  const setArchive = async () => {
    if (!page) return;
    setBusy(true); setError("");
    try { await workspaceRequest(`/api/school-ai/conversations/${page.conversation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: page.conversation.version, action: page.conversation.archivedAt ? "resume" : "archive" }) }); setPage(null); setMessage(""); requestKey.current = null; setArchived(value => !value); }
    catch (error) { setError(workspaceErrorText(error, general)); } finally { setBusy(false); }
  };
  const ask = async (spoken?: string): Promise<string | undefined> => {
    // SKO-460: a spoken turn is sent as itself; the typed draft stays where it is.
    const outgoing = spoken ?? message;
    if (!canCreate || disabled || busy || !outgoing.trim() || page?.conversation.archivedAt) return;
    if (!assistantAvailable) { setError(general.serviceUnavailable); return; }
    const text = requestKey.current?.text === outgoing.trim() ? outgoing.trim() : promptPrefix ? `${promptPrefix}\n\n${outgoing.trim()}` : outgoing.trim();
    if (requestKey.current?.text !== text || JSON.stringify(requestKey.current?.catalog) !== JSON.stringify(catalog)) requestKey.current = { text, id: crypto.randomUUID(), failed: false, language, catalog };
    const key = requestKey.current;
    setBusy(true); setError(""); controller.current = new AbortController();
    let conversation = page?.conversation;
    try {
      if (!conversation) {
        const payload = { title: outgoing.trim().slice(0, 180), campusId, subjectId, classId, purpose, topicKey }, fingerprint = JSON.stringify(payload);
        if (createKey.current?.fingerprint !== fingerprint) createKey.current = { fingerprint, key: crypto.randomUUID() };
        const created = await workspaceRequest<{ conversation: PrivateConversation }>("/api/school-ai/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.current.signal, body: JSON.stringify({ ...payload, idempotencyKey: createKey.current.key }) });
        conversation = created.conversation;
        setConversations(previous => [conversation!, ...previous.filter(item => item.id !== conversation!.id)]); setPage({ conversation, exchanges: [], nextVersion: null, recovery: null });
      }
      const result = await workspaceRequest<{ reply: string; record?: AiWorkspaceRecord }>("/api/school-ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.current.signal, body: JSON.stringify({ message: text, language: key.language, campusId, subjectId, classId, conversationId: conversation.id, expectedConversationVersion: conversation.version, idempotencyKey: key.id, retryFailed: key.failed, focus, catalog: key.catalog }) });
      if (!mounted.current) return;
      if (result.record) onRecord?.(result.record);
      if (!spoken) { setMessage(""); clearDraft(); }
      requestKey.current = null; createKey.current = null;
      await load(conversation.id, !spoken);
      return result.reply;
    } catch (error) {
      key.failed = true;
      if (mounted.current) {
        // Reservation advances the saved version even if generation fails. Keep
        // the typed text and exact retry key, while refreshing that reservation.
        if (conversation) await load(conversation.id, false);
        if (mounted.current) setError(error instanceof WorkspaceRequestError && error.code === "ASSISTANT_CATALOG_REVIEW" ? assistantCatalogCopy(language).stale : workspaceErrorText(error, general));
      }
    }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section className="space-y-4" dir={language === "en" ? "ltr" : "rtl"} aria-label={c.title} aria-busy={busy || loading}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold"><MessageCircle aria-hidden="true" className="size-5 text-primary" />{c.title}</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{c.hint}</p></div><Button variant="outline" disabled={busy || voiceBusy || liveVoiceBusy || loading || !canCreate} onClick={() => switchConversation("")}><Plus aria-hidden="true" />{c.fresh}</Button></div>
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><FormField name={`private-conversation-${purpose}`} label={c.choose}><Select disabled={busy || voiceBusy || liveVoiceBusy || loading} value={page?.conversation.id ?? ""} onChange={event => switchConversation(event.target.value)}><option value="">{c.fresh}</option>{conversations.map(conversation => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}</Select></FormField></div><Button variant="ghost" disabled={busy || voiceBusy || liveVoiceBusy || loading} onClick={() => guard(() => { setMessage(""); setPage(null); requestKey.current = null; setArchived(value => !value); })}><History aria-hidden="true" />{archived ? c.active : c.archived}</Button>{page && <Button variant="ghost" disabled={busy || voiceBusy || liveVoiceBusy || loading} onClick={() => guard(() => void load(page.conversation.id))}><RefreshCw aria-hidden="true" />{c.refresh}</Button>}{page && canCreate && <Button variant="ghost" disabled={busy || voiceBusy || liveVoiceBusy || loading} onClick={() => guard(() => void setArchive())}><Archive aria-hidden="true" />{page.conversation.archivedAt ? c.resume : c.archive}</Button>}{page && <a className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-muted" href={`/api/school-ai/conversations/${encodeURIComponent(page.conversation.id)}?export=1`} download data-export-conversation><Download aria-hidden="true" className="size-4" />{c.exportConversation}</a>}{page && canCreate && <Button variant="ghost" disabled={busy || voiceBusy || liveVoiceBusy || loading} onClick={() => setConfirmDelete(true)} data-delete-conversation><Trash2 aria-hidden="true" />{c.deleteConversation}</Button>}</div>
    <ConfirmAction open={confirmDelete} title={c.deleteConversation} description={c.deleteConfirm} confirmLabel={c.deleteConversation} tone="danger" busy={busy} onConfirm={() => removeConversation()} onCancel={() => setConfirmDelete(false)} />
    {notice && <p role="status" className="text-sm text-ink-muted">{notice}</p>}
    {nextCursor && <Button variant="ghost" disabled={busy || loading} onClick={() => void refreshList().catch(error => setError(workspaceErrorText(error, general)))}>{c.more}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!assistantAvailable && <p role="status" className="rounded-xl border border-border bg-surface-subtle p-3 text-sm text-ink-muted">{general.serviceUnavailable}</p>}
    {(error || !assistantAvailable) && <DemoWorkflowPanel language={language} compact initialMessage={message || undefined} />}
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />{c.loading}</p>}
    {page?.nextVersion && <Button variant="outline" disabled={busy || loading} onClick={() => void load(page.conversation.id, false, page.nextVersion!)}>{c.earlier}</Button>}
    {page?.exchanges.length ? <div role="log" aria-label={c.title} className={styles.conversation}>{page.exchanges.map(exchange => exchange.hidden ? <p key={exchange.id} className="rounded-xl border border-border p-3 text-sm text-ink-muted">{c.hidden}</p> : <div key={exchange.id} className="space-y-3">{exchange.turns?.map(turn => <article key={turn.role} className={`${styles.message} ${turn.role === "user" ? styles.userMessage : styles.assistantMessage}`}><p className="mb-1 text-xs font-semibold">{turn.role === "user" ? c.you : c.assistant}</p>{turn.role === "assistant" ? <AssistantResponse text={turn.text} /> : <p className="whitespace-pre-wrap break-words">{turn.text}</p>}</article>)}</div>)}</div> : !loading && <p className="text-sm text-ink-muted">{c.empty}</p>}
    {!loading && !page?.exchanges.length && !message && !focus && !page?.conversation.archivedAt && <div><p className="mb-2 text-xs font-semibold text-ink-muted">{prototype.starterTitle}</p><div className={styles.starterPrompts}>{([{ label: prototype.lesson, prompt: prototype.lessonPrompt }, { label: prototype.notice, prompt: prototype.noticePrompt }, { label: prototype.checklist, prompt: prototype.checklistPrompt }]).map(item => <Button key={item.label} type="button" variant="outline" size="sm" disabled={disabled || !canCreate || busy || voiceBusy || liveVoiceBusy} onClick={() => setMessage(item.prompt)}>{item.label}</Button>)}</div></div>}
    {page?.recovery && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm" data-turn-recovery={page.recovery.status}><span>{page.recovery.status === "PENDING" ? c.pending : c.recovery}</span>{page.recovery.status !== "PENDING" && canCreate && <Button size="sm" variant="outline" disabled={busy || loading || disabled} onClick={() => void ask()}><RefreshCw aria-hidden="true" />{c.retry}</Button>}</div>}
    {focus && catalogOperationsForFocus[focus.domain] && !page?.conversation.archivedAt && <AssistantEntityPicker language={language} campusId={campusId} focus={focus} value={catalog} onChange={setCatalog} disabled={disabled || !canCreate || busy || loading || voiceBusy || liveVoiceBusy} />}
    {voiceAvailable && assistantAvailable && !page?.conversation.archivedAt && <VoiceConversation key={language} language={language} disabled={disabled || !canCreate || loading || busy} onTurn={ask} onActivityChange={setLiveVoiceBusy} />}
    {page?.conversation.archivedAt ? <p className="text-sm text-ink-muted">{c.archivedHint}</p> : <MultimodalComposer language={language} value={message} onChange={setMessage} onSubmit={async () => { await ask(); }} submitDisabled={!assistantAvailable} onUpload={onUpload} voiceAvailable={voiceAvailable} disabled={disabled || !canCreate || loading || liveVoiceBusy} busy={busy} onActivityChange={setVoiceBusy} />}
  </section>;
}
