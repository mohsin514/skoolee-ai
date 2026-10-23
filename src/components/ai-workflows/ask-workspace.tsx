"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/components/locale/LocaleProvider";
import { useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import type { RunView } from "@/lib/ai-workflows/view";
import { ERROR_WORDS, UI, t } from "./run-copy";
import { RunSheet } from "./run-sheet";
import { WorkflowRequestError, startWorkflow, useWorkflowRun } from "./use-workflow-run";

/**
 * The AI Workflows home: one Ask bar, the live Run Sheet, and honest outcomes. Enter sends,
 * Shift+Enter is a new line, and nothing sends while an Urdu/Arabic IME is composing.
 */
export function AskWorkspace({ campusId, practiceMode, enabled = true }: { campusId: string | null; practiceMode: boolean; enabled?: boolean }) {
  const { language } = useLocale();
  const [message, setMessage] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [initial, setInitial] = useState<RunView | null>(null);
  const { run, busy, error, send } = useWorkflowRun(initial);
  const key = useRef<{ text: string; id: string } | null>(null);
  useUnsavedGuard(Boolean(message.trim()));

  const submit = async () => {
    const text = message.trim();
    if (!text || starting) return;
    if (key.current?.text !== text) key.current = { text, id: crypto.randomUUID() };
    setStarting(true); setStartError(null);
    try { const { run: next } = await startWorkflow(text, language, key.current.id, campusId); setInitial(next); setMessage(""); key.current = null; }
    catch (thrown) { setStartError(thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL"); }
    finally { setStarting(false); }
  };

  if (!enabled) return (
    <section data-ai-workspace data-ai-disabled className="sk-panel space-y-2 p-5" dir={language === "en" ? "ltr" : "rtl"}>
      <h2 className="text-xl font-bold">{t(UI, "askTitle", language)}</h2>
      <p className="text-sm text-ink-muted">{t({ off: { en: "AI Workflows are not switched on for your school yet.", ar: "لم تُفعَّل مسارات الذكاء الاصطناعي لمدرستك بعد.", ur: "آپ کے اسکول کے لیے اے آئی ورک فلو ابھی فعال نہیں۔" } }, "off", language)}</p>
    </section>
  );
  return (
    <section data-ai-workspace className="sk-panel space-y-4 p-5" dir={language === "en" ? "ltr" : "rtl"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{t(UI, "askTitle", language)}</h2>
        <div className="flex gap-2">
          {practiceMode && <Badge variant="neutral" data-ai-practice>{t({ p: { en: "Practice mode · nothing is saved to your school", ar: "وضع التدريب · لا يُحفظ شيء", ur: "مشق موڈ · اسکول میں کچھ محفوظ نہیں" } }, "p", language)}</Badge>}
          <Link className="text-sm underline" href="/ai/can-do">{t(UI, "canDoTitle", language)}</Link>
        </div>
      </div>
      <p className="text-sm text-ink-muted">{t(UI, "askHint", language)}</p>
      <Textarea
        data-ai-request value={message} rows={3} maxLength={8000} dir="auto" disabled={starting}
        placeholder={t(UI, "askPlaceholder", language)} aria-label={t(UI, "askTitle", language)}
        onChange={event => setMessage(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }}
      />
      <Button data-ai-start disabled={starting || !message.trim()} onClick={() => void submit()}>{starting ? t(UI, "sending", language) : t(UI, "send", language)}</Button>
      {startError && ERROR_WORDS[startError as keyof typeof ERROR_WORDS] && <Alert tone="danger" data-ai-error={startError}>{ERROR_WORDS[startError as keyof typeof ERROR_WORDS]![language]}</Alert>}
      {run && <RunSheet run={run} language={language} busy={busy} error={error} onCommand={(body, clickKey) => void send(body, clickKey)} />}
    </section>
  );
}
