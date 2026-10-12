"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { schoolAICopy } from "@/lib/school-ai/copy";
import type { Language } from "@/lib/locale/package";
import { boundedAssistantHistory, type AssistantTurn } from "@/lib/school-ai/assistant-context";
import { MultimodalComposer } from "./multimodal-composer";
import { workspaceErrorText, workspaceRequest } from "./workspace-client";
import styles from "./school-ai.module.css";
import { useWorkspaceDraft } from "./draft-safety";

export function SetupHelp({ language, question, campusId, assistantAvailable, voiceAvailable, disabled, onUpload, onActivityChange, onDraftChange }: {
  language: Language; question: string; campusId?: string | null; assistantAvailable: boolean; voiceAvailable: boolean; disabled: boolean;
  onUpload: (file: File, origin: "upload" | "camera") => Promise<void>; onActivityChange: (active: boolean) => void;
  onDraftChange: (dirty: boolean) => void;
}) {
  const c = schoolAICopy(language);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<AssistantTurn[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const key = useRef<{ input: string; id: string; failed: boolean } | null>(null);
  const dirty = Boolean(message.trim()) || busy || voiceBusy;
  useWorkspaceDraft(dirty);
  useEffect(() => { onDraftChange(dirty); return () => onDraftChange(false); }, [dirty, onDraftChange]);
  useEffect(() => { onActivityChange(busy || voiceBusy); return () => onActivityChange(false); }, [busy, voiceBusy, onActivityChange]);
  useEffect(() => () => controller.current?.abort(), []);
  const ask = async () => {
    if (!assistantAvailable) { setError(c.serviceUnavailable); return; }
    if (!message.trim() || busy) return;
    const history = boundedAssistantHistory(conversation);
    const text = `${question}\n\n${message.trim()}`;
    const input = JSON.stringify({ question, text, language, campusId, history });
    if (key.current?.input !== input) key.current = { input, id: crypto.randomUUID(), failed: false };
    setBusy(true); setError(""); controller.current = new AbortController();
    try {
      const result = await workspaceRequest<{ reply: string }>("/api/school-ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.current.signal, body: JSON.stringify({ message: text, language, campusId, history, idempotencyKey: key.current.id, retryFailed: key.current.failed }) });
      if (controller.current.signal.aborted) return;
      setConversation(previous => boundedAssistantHistory([...previous, { role: "user", text }, { role: "assistant", text: result.reply }])); setMessage(""); key.current = null;
    } catch (error) { if (key.current?.input === input) key.current.failed = true; if (!controller.current.signal.aborted) setError(workspaceErrorText(error, c)); }
    finally { if (!controller.current.signal.aborted) setBusy(false); }
  };
  return <div className="mt-6 border-t border-border-subtle pt-5"><Button variant="ghost" disabled={disabled || busy || voiceBusy} aria-expanded={open} onClick={() => setOpen(!open)}><MessageCircle aria-hidden="true" />{c.setupHelp}</Button>{open && <div className="mt-3 space-y-4"><p className="text-sm leading-relaxed text-ink-muted">{c.setupHelpHint}</p>{conversation.length > 0 && <div className={styles.conversation} role="log" aria-label={c.setupHelp} aria-live="polite">{conversation.map((turn, index) => <p key={index} className={`${styles.message} ${turn.role === "user" ? styles.userMessage : styles.assistantMessage}`}>{turn.text}</p>)}</div>}<MultimodalComposer language={language} value={message} onChange={setMessage} onSubmit={ask} onUpload={onUpload} voiceAvailable={voiceAvailable} disabled={disabled} busy={busy} onActivityChange={setVoiceBusy} /><p className="text-xs leading-relaxed text-ink-muted">{c.sessionConversationHint}</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>}</div>;
}
