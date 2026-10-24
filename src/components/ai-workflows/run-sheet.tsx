"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LiveAnnouncer } from "@/components/ui/live-announcer";
import type { RunView, StepView } from "@/lib/ai-workflows/view";
import { STATE_WORDS, UI, errorWords, runStatusWords, t, type Lang } from "./run-copy";
import { RunHeader, type RunControl } from "./run-header";
import { runText } from "./run-links";
import { RunOutcome } from "./run-outcome";
import { RunPlanning } from "./run-planning";
import { RunQuestions } from "./run-questions";
import { RunSteps } from "./run-step";
import { useWorkflowFormat } from "./workflow-format";

export { assertReceipt } from "./run-step";

/** One sentence per real transition, diffed against the previous render; nothing for an unchanged poll. */
function useRunAnnouncement(run: RunView, language: Lang) {
  const format = useWorkflowFormat();
  const previous = useRef<RunView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = run;
    if (!before) return;
    let next: string | null = null;
    const states = new Map(before.steps.map(step => [step.id, step]));
    if (before.steps.length === 0 && run.steps.length > 0) next = runText("planReady", language, format.count(run.steps.length));
    else if (run.steps.some(step => step.preview && states.get(step.id)?.preview && states.get(step.id)!.preview!.version !== step.preview.version)) next = runText("previewUpdated", language);
    else if (run.status === "NEEDS_INPUT" && before.status !== "NEEDS_INPUT" && run.questions.length > 0) next = t(UI, "questionsTitle", language);
    else {
      const changed = run.steps.filter(step => states.get(step.id) && states.get(step.id)!.state !== step.state).at(-1);
      if (changed) next = `${changed.title}: ${STATE_WORDS[changed.state][language]}`;
      else if (before.status !== run.status) next = runStatusWords(run.status, language) || null;
    }
    if (next) setMessage(next);
  }, [run, language, format]);
  return message;
}

/**
 * The live Run Sheet: header, the plan as a timeline, open questions, and the server's outcome.
 * Every "saved" comes from a receipt; Save is applied only by the person's own click.
 * Render it as <RunSheet key={run.id} …> so answer text, pending state and expansions never leak between runs.
 */
export function RunSheet({
  run, language, busy, error, onCommand,
  chrome = "full", headingLevel = 3, requestText, onRephrase, examples, celebrate = true, connection = "live", onCheckNow,
}: {
  run: RunView; language: Lang; busy: boolean; error: string | null; onCommand: (body: Record<string, unknown>, clickKey?: string) => void;
  chrome?: "full" | "compact"; headingLevel?: 2 | 3 | 4; requestText?: string; onRephrase?: (text: string) => void; examples?: string[]; celebrate?: boolean;
  connection?: "live" | "retrying"; onCheckNow?: () => void;
}) {
  const headingId = useId();
  const sheet = useRef<HTMLElement>(null);
  // Presentation only: which control was pressed, so only that one spins. Command bodies are unchanged.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const announcement = useRunAnnouncement(run, language);
  const command = (key: string, body: Record<string, unknown>, clickKey?: string) => { setPendingKey(key); onCommand(body, clickKey); };

  const amend = (step: StepView, actionId: string, expect: number) => command(`amend:${actionId}`, { type: "amend", stepId: step.id, previewVersion: step.preview!.version, actionId, expect });
  const confirm = (step: StepView) => {
    const clickKey = `confirm:${step.id}:${step.preview!.version}`;
    command(clickKey, { type: "confirm", steps: [{ stepId: step.id, previewVersion: step.preview!.version, previewHash: step.preview!.hash, inputHash: step.preview!.inputHash }] }, clickKey);
  };
  const answer = (text: string, key: string) => command(key, { type: "answer", text }, `answer:${run.version}`);
  const control = (kind: RunControl) => command(kind, { type: kind });

  const planningEmpty = (run.status === "PLANNING" || run.status === "PLAN_REVIEW") && run.steps.length === 0;
  const runError = run.errorCode && !run.outcome ? run.errorCode : null;
  const resumeInAlert = Boolean(runError && ["PAUSED", "FAILED"].includes(run.status));
  const level = (Math.min(headingLevel + 1, 5)) as 3 | 4 | 5;

  return (
    <section ref={sheet} data-ai-run-sheet data-ai-status={run.status} data-ai-run-phase={run.status} aria-labelledby={headingId}
      className="space-y-4" dir={language === "en" ? "ltr" : "rtl"}>
      <RunHeader run={run} language={language} busy={busy} pendingKey={pendingKey} chrome={chrome} headingLevel={headingLevel} headingId={headingId}
        requestText={requestText} connection={connection} resumeElsewhere={resumeInAlert} onControl={control} onCheckNow={onCheckNow} />
      {planningEmpty ? <RunPlanning language={language} /> : null}
      {run.steps.length > 0 ? <RunSteps run={run} language={language} busy={busy} pendingKey={pendingKey} onConfirm={confirm} onAmend={amend} /> : null}
      {run.status === "NEEDS_INPUT" && run.questions.length > 0 ? (
        <RunQuestions run={run} language={language} busy={busy} pendingKey={pendingKey} level={level} onAnswer={answer} />
      ) : null}
      <RunOutcome run={run} language={language} celebrate={celebrate} requestText={requestText} onRephrase={onRephrase} examples={examples} sheetRef={sheet} />
      {runError ? (
        <Alert tone="danger" data-ai-error={runError}
          actions={resumeInAlert ? (
            <Button type="button" data-ai-resume variant="outline" size="sm" className="w-full sm:w-auto" disabled={busy} loading={busy && pendingKey === "resume"} onClick={() => control("resume")}>
              {busy && pendingKey === "resume" ? null : run.status === "FAILED" ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" className="rtl:-scale-x-100" />}
              {run.status === "FAILED" ? runText("tryAgain", language) : t(UI, "resume", language)}
            </Button>
          ) : undefined}>
          {errorWords(runError, language)}
        </Alert>
      ) : null}
      {error ? <Alert tone="danger" data-ai-error={error}>{errorWords(error, language)}</Alert> : null}
      <LiveAnnouncer message={announcement} />
    </section>
  );
}
