"use client";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale/LocaleProvider";
import type { RunView } from "@/lib/ai-workflows/view";
import { errorWords } from "./run-copy";
import { RunSheet } from "./run-sheet";
import { WorkflowRequestError, useWorkflowRun } from "./use-workflow-run";

const COPY = {
  title: { en: "Set up from your answers", ar: "الإعداد من إجاباتك", ur: "آپ کے جوابات سے سیٹ اپ" },
  hint: { en: "AI prepares each change from your confirmed answers. Nothing applies until you press its save button; work for other people goes to them.", ar: "يجهز الذكاء الاصطناعي كل تغيير من إجاباتك. لا يُطبق شيء قبل ضغط زر الحفظ؛ والعمل الخاص بالآخرين يذهب إليهم.", ur: "اے آئی آپ کے تصدیق شدہ جوابات سے ہر تبدیلی تیار کرتا ہے۔ محفوظ کا بٹن دبانے تک کچھ لاگو نہیں ہوتا؛ دوسروں کا کام انہی کو جاتا ہے۔" },
  start: { en: "Prepare my setup", ar: "جهّز الإعداد", ur: "میرا سیٹ اپ تیار کریں" },
};

/**
 * The campus questionnaire's hand-off into AI Workflows. Starting is idempotent per questionnaire
 * version; a second tab reopens the same job instead of starting another.
 */
export function QuestionnaireRun({ recordId, version, autoStart, disabled, headingLevel = "h3" }: { recordId: string; version: number; autoStart: boolean; disabled: boolean; headingLevel?: "h2" | "h3" | "h4" }) {
  const { language } = useLocale();
  const [initial, setInitial] = useState<RunView | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const started = useRef(false);
  const { run, busy, error, send } = useWorkflowRun(initial);

  const start = async () => {
    setStarting(true); setStartError(null);
    try {
      const response = await fetch("/api/ai-workflows/questionnaire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId, version, language }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new WorkflowRequestError(body?.code ?? "INTERNAL");
      setInitial(body.run);
    } catch (thrown) { setStartError(thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL"); }
    finally { setStarting(false); }
  };
  useEffect(() => { if (autoStart && !disabled && !started.current) { started.current = true; void start(); } });

  const Heading = headingLevel;
  return (
    <section data-ai-questionnaire-run className="sk-panel space-y-3 p-5" data-static dir={language === "en" ? "ltr" : "rtl"}>
      <Heading className="text-lg font-semibold text-ink-strong">{COPY.title[language]}</Heading>
      <p className="text-sm text-ink-muted">{COPY.hint[language]}</p>
      {!run && <Button data-ai-questionnaire-start className="w-full sm:w-auto" disabled={disabled} loading={starting} onClick={() => void start()}>{COPY.start[language]}</Button>}
      {startError && <Alert tone="danger" data-ai-error={startError}>{errorWords(startError, language)}</Alert>}
      {run && <RunSheet key={run.id} chrome="compact" run={run} language={language} busy={busy} error={error} onCommand={(body, clickKey) => void send(body, clickKey)} />}
    </section>
  );
}
