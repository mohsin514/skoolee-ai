"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { schoolAICopy } from "@/lib/school-ai/copy";
import type { Language } from "@/lib/locale/package";
import { PrivateAssistant } from "./private-assistant";
import { useWorkspaceDraftNavigation } from "./draft-safety";

export function SetupHelp({ language, question, topicKey, campusId, assistantAvailable, voiceAvailable, disabled, onUpload, onActivityChange, onDraftChange }: {
  language: Language; question: string; topicKey: string; campusId?: string | null; assistantAvailable: boolean; voiceAvailable: boolean; disabled: boolean;
  onUpload: (file: File, origin: "upload" | "camera") => Promise<void>; onActivityChange: (active: boolean) => void; onDraftChange: (dirty: boolean) => void;
}) {
  const c = schoolAICopy(language), guard = useWorkspaceDraftNavigation();
  const [open, setOpen] = useState(false);
  return <div className="mt-6 border-t border-border-subtle pt-5"><Button variant="ghost" disabled={disabled} aria-expanded={open} onClick={() => open ? guard(() => setOpen(false)) : setOpen(true)}><MessageCircle aria-hidden="true" />{c.setupHelp}</Button>{open && <div className="mt-3 space-y-4"><p className="text-sm leading-relaxed text-ink-muted">{c.setupHelpHint}</p><PrivateAssistant language={language} campusId={campusId} purpose="SETUP" topicKey={topicKey} promptPrefix={question} canCreate assistantAvailable={assistantAvailable} voiceAvailable={voiceAvailable} disabled={disabled} onUpload={onUpload} onActivityChange={onActivityChange} onDraftChange={onDraftChange} /></div>}</div>;
}
