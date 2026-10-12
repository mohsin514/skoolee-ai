"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, History, Loader2, MessageCircle, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { MultimodalComposer } from "./multimodal-composer";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { workspaceErrorText, workspaceRequest } from "./workspace-client";
import { conversationCopy } from "@/lib/school-ai/conversation-copy";
import { schoolAICopy } from "@/lib/school-ai/copy";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import type { PrivateConversation, PrivateConversationList, PrivateConversationPage } from "@/lib/school-ai/conversations";
import styles from "./school-ai.module.css";

export interface PrivateAssistantProps {
  language: Language; campusId?: string | null; subjectId?: string; classId?: string;
  canCreate: boolean; assistantAvailable: boolean; voiceAvailable: boolean; disabled?: boolean;
  onUpload: (file: File, origin: "upload" | "camera") => Promise<void>;
  onRecord?: (record: AiWorkspaceRecord) => void; onActivityChange?: (active: boolean) => void; onDraftChange?: (dirty: boolean) => void;
  purpose?: "WORKSPACE" | "SETUP"; topicKey?: string; promptPrefix?: string;
}
export function PrivateAssistant(props: PrivateAssistantProps) {
  const scope = JSON.stringify([props.campusId ?? null, props.subjectId ?? null, props.classId ?? null, props.purpose ?? "WORKSPACE", props.topicKey ?? null]);
  return <ConversationPanel key={scope} {...props} />;
}
function ConversationPanel({ language, campusId, subjectId, classId, canCreate, assistantAvailable, voiceAvailable, disabled, onUpload, onRecord, onActivityChange, onDraftChange, purpose = "WORKSPACE", topicKey, promptPrefix }: PrivateAssistantProps) {
  const c = conversationCopy(language), general = schoolAICopy(language), guard = useWorkspaceDraftNavigation();
  const [conversations, setConversations] = useState<PrivateConversation[]>([]), [page, setPage] = useState<PrivateConversationPage | null>(null);
  const [archived, setArchived] = useState(false), [nextCursor, setNextCursor] = useState<string | null>(null);
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [voiceBusy, setVoiceBusy] = useState(false);
  const createKey = useRef<string | null>(null), requestKey = useRef<{ text: string; id: string; failed: boolean; language: Language } | null>(null);
  const mounted = useRef(true), controller = useRef<AbortController | null>(null);
  const dirty = Boolean(message.trim()) || busy || voiceBusy;
  useWorkspaceDraft(dirty);
  useEffect(() => { onDraftChange?.(dirty); return () => onDraftChange?.(false); }, [dirty, onDraftChange]);
  useEffect(() => { onActivityChange?.(busy || voiceBusy); return () => onActivityChange?.(false); }, [busy, voiceBusy, onActivityChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const query = useCallback((before?: string, includeArchived = archived) => { const value = new URLSearchParams({ purpose, archived: String(includeArchived) }); if (campusId) value.set("campusId", campusId); if (subjectId) value.set("subjectId", subjectId); if (classId) value.set("classId", classId); if (topicKey) value.set("topicKey", topicKey); if (before) value.set("before", before); return value; }, [archived, campusId, classId, purpose, subjectId, topicKey]);
  const acceptPage = (result: PrivateConversationPage, restoreMessage: boolean) => {
    setPage(result);
    if (restoreMessage) { setMessage(result.recovery?.message ?? ""); requestKey.current = result.recovery ? { text: result.recovery.message, id: result.recovery.key, failed: true, language: result.recovery.language } : null; }
  };
  const load = async (id: string, restoreMessage = true, beforeVersion?: number) => {
    setLoading(true); setError("");
    try {
      const result = await workspaceRequest<PrivateConversationPage>(`/api/school-ai/conversations/${encodeURIComponent(id)}${beforeVersion ? `?beforeVersion=${beforeVersion}` : ""}`);
      if (!mounted.current) return;
      if (beforeVersion) setPage(previous => previous ? { ...result, exchanges: [...result.exchanges, ...previous.exchanges] } : result);
      else acceptPage(result, restoreMessage);
    } catch (error) { if (mounted.current) setError(workspaceErrorText(error, general)); }
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
  const refreshList = async () => { const result = await workspaceRequest<PrivateConversationList>(`/api/school-ai/conversations?${query(nextCursor ?? undefined)}`); setConversations(previous => [...previous, ...result.conversations.filter(item => !previous.some(existing => existing.id === item.id))]); setNextCursor(result.nextCursor); };
  const switchConversation = (id: string) => guard(() => { setMessage(""); requestKey.current = null; createKey.current = null; if (id) void load(id); else { setPage(null); setError(""); } });
  const setArchive = async () => {
    if (!page) return;
    setBusy(true); setError("");
    try { await workspaceRequest(`/api/school-ai/conversations/${page.conversation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: page.conversation.version, action: page.conversation.archivedAt ? "resume" : "archive" }) }); setPage(null); setMessage(""); requestKey.current = null; setArchived(value => !value); }
    catch (error) { setError(workspaceErrorText(error, general)); } finally { setBusy(false); }
  };
  const ask = async () => {
    if (!canCreate || disabled || busy || !message.trim() || page?.conversation.archivedAt) return;
    if (!assistantAvailable) { setError(general.serviceUnavailable); return; }
    const text = requestKey.current?.text === message.trim() ? message.trim() : promptPrefix ? `${promptPrefix}\n\n${message.trim()}` : message.trim();
    if (requestKey.current?.text !== text) requestKey.current = { text, id: crypto.randomUUID(), failed: false, language };
    const key = requestKey.current;
    setBusy(true); setError(""); controller.current = new AbortController();
    try {
      let conversation = page?.conversation;
      if (!conversation) {
        createKey.current ??= crypto.randomUUID();
        const created = await workspaceRequest<{ conversation: PrivateConversation }>("/api/school-ai/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.current.signal, body: JSON.stringify({ title: message.trim().slice(0, 180), campusId, subjectId, classId, purpose, topicKey, idempotencyKey: createKey.current }) });
        conversation = created.conversation;
        setConversations(previous => [conversation!, ...previous.filter(item => item.id !== conversation!.id)]); setPage({ conversation, exchanges: [], nextVersion: null, recovery: null });
      }
      const result = await workspaceRequest<{ reply: string; record?: AiWorkspaceRecord }>("/api/school-ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.current.signal, body: JSON.stringify({ message: text, language: key.language, campusId, subjectId, classId, conversationId: conversation.id, expectedConversationVersion: conversation.version, idempotencyKey: key.id, retryFailed: key.failed }) });
      if (!mounted.current) return;
      if (result.record) onRecord?.(result.record);
      setMessage(""); requestKey.current = null; createKey.current = null;
      await load(conversation.id, true);
    } catch (error) { key.failed = true; if (mounted.current) setError(workspaceErrorText(error, general)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section className="space-y-4" dir={language === "en" ? "ltr" : "rtl"} aria-label={c.title} aria-busy={busy || loading}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold"><MessageCircle aria-hidden="true" className="size-5 text-primary" />{c.title}</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{c.hint}</p></div><Button variant="outline" disabled={busy || voiceBusy || loading || !canCreate} onClick={() => switchConversation("")}><Plus aria-hidden="true" />{c.fresh}</Button></div>
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><FormField name={`private-conversation-${purpose}`} label={c.choose}><Select disabled={busy || voiceBusy || loading} value={page?.conversation.id ?? ""} onChange={event => switchConversation(event.target.value)}><option value="">{c.fresh}</option>{conversations.map(conversation => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}</Select></FormField></div><Button variant="ghost" disabled={busy || voiceBusy || loading} onClick={() => guard(() => { setMessage(""); setPage(null); requestKey.current = null; setArchived(value => !value); })}><History aria-hidden="true" />{archived ? c.active : c.archived}</Button>{page && <Button variant="ghost" disabled={busy || voiceBusy || loading} onClick={() => guard(() => void load(page.conversation.id))}><RefreshCw aria-hidden="true" />{c.refresh}</Button>}{page && canCreate && <Button variant="ghost" disabled={busy || voiceBusy || loading} onClick={() => guard(() => void setArchive())}><Archive aria-hidden="true" />{page.conversation.archivedAt ? c.resume : c.archive}</Button>}</div>
    {nextCursor && <Button variant="ghost" disabled={busy || loading} onClick={() => void refreshList().catch(error => setError(workspaceErrorText(error, general)))}>{c.more}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />{c.loading}</p>}
    {page?.nextVersion && <Button variant="outline" disabled={busy || loading} onClick={() => void load(page.conversation.id, false, page.nextVersion!)}>{c.earlier}</Button>}
    {page?.exchanges.length ? <div role="log" aria-label={c.title} className={styles.conversation}>{page.exchanges.map(exchange => exchange.hidden ? <p key={exchange.id} className="rounded-xl border border-border p-3 text-sm text-ink-muted">{c.hidden}</p> : <div key={exchange.id} className="space-y-3">{exchange.turns?.map(turn => <article key={turn.role} className={`${styles.message} ${turn.role === "user" ? styles.userMessage : styles.assistantMessage}`}><p className="mb-1 text-xs font-semibold">{turn.role === "user" ? c.you : c.assistant}</p><p className="whitespace-pre-wrap break-words">{turn.text}</p></article>)}</div>)}</div> : !loading && <p className="text-sm text-ink-muted">{c.empty}</p>}
    {page?.recovery && <p role="status" className="rounded-xl border border-border p-3 text-sm">{page.recovery.status === "PENDING" ? c.pending : c.recovery}</p>}
    {page?.conversation.archivedAt ? <p className="text-sm text-ink-muted">{c.archivedHint}</p> : <MultimodalComposer language={language} value={message} onChange={setMessage} onSubmit={ask} onUpload={onUpload} voiceAvailable={voiceAvailable} disabled={disabled || !canCreate || loading} busy={busy} onActivityChange={setVoiceBusy} />}
  </section>;
}
