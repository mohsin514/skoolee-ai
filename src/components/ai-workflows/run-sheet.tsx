"use client";
import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RunView, StepView } from "@/lib/ai-workflows/view";
import { ERROR_WORDS, STATE_WORDS, UI, t } from "./run-copy";

type Lang = "en" | "ar" | "ur";
const DONE_STATES = new Set(["saved", "looked_up", "draft", "approved_elsewhere"]);
const TONE: Partial<Record<StepView["state"], "success" | "warning" | "danger" | "info" | "neutral">> = {
  saved: "success", approved_elsewhere: "success", looked_up: "info", draft: "info", awaiting_confirm: "warning", needs_input: "warning",
  handed_off: "info", failed: "danger", uncertain: "danger", stale: "warning", practice: "neutral", skipped: "neutral", cancelled: "neutral",
};

/** "Saved" is rendered only from a receipt (UX §3.1 hard rule). */
function assertReceipt(step: StepView) {
  if (DONE_STATES.has(step.state) && !step.receipt && process.env.NODE_ENV !== "production") throw new Error(`Step ${step.key} shows ${step.state} without a receipt`);
}

function StepRow({ step, language, busy, onConfirm }: { step: StepView; language: Lang; busy: boolean; onConfirm: (step: StepView) => void }) {
  assertReceipt(step);
  const count = step.preview ? Object.values(step.preview.counts).reduce((sum, value) => sum + value, 0) : 0;
  return (
    <li data-ai-step={step.capabilityKey} data-ai-state={step.state} className="space-y-2 rounded-xl border border-border p-3" aria-current={step.state === "running" ? "step" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{step.title}</span>
        <Badge variant={TONE[step.state] ?? "secondary"}>{STATE_WORDS[step.state][language]}</Badge>
      </div>
      {step.state === "awaiting_confirm" && step.preview && (
        <div className="space-y-2">
          {step.preview.lines.length > 0 && <ul className="space-y-1 text-sm">{step.preview.lines.slice(0, 10).map((line, index) => <li key={index}><span className="text-ink-muted">{line.label}</span> {line.value}</li>)}</ul>}
          <div className="flex flex-wrap items-center gap-2">
            <Button data-ai-confirm data-ai-preview={step.preview.code} disabled={busy} onClick={() => onConfirm(step)}>{`${t(UI, "saveStep", language)} · ${step.title}${count ? ` · ${count}` : ""}`}</Button>
            <Badge variant="outline"><code dir="ltr">{`${t(UI, "previewCode", language)} ${step.preview.code}`}</code></Badge>
          </div>
        </div>
      )}
      {step.state === "handed_off" && step.handoff && (
        <p className="text-sm">{t(UI, "withApprover", language, step.handoff.roles.join(", "))} · <Link className="underline" href={step.handoff.link}>{t(UI, "openScreen", language)}</Link></p>
      )}
      {step.receipt && (
        <p data-ai-receipt={step.receipt.kind} className="text-xs text-ink-muted">
          {step.receipt.text ?? Object.entries(step.receipt.counts).map(([key, value]) => `${key}: ${value}`).join(" · ")}
          {step.receipt.link && <> · <Link className="underline" href={step.receipt.link}>{t(UI, "openScreen", language)}</Link></>}
        </p>
      )}
      {step.errorCode && ERROR_WORDS[step.errorCode as keyof typeof ERROR_WORDS] && <p className="text-sm text-danger">{ERROR_WORDS[step.errorCode as keyof typeof ERROR_WORDS]![language]}</p>}
    </li>
  );
}

export function RunSheet({ run, language, busy, error, onCommand }: { run: RunView; language: Lang; busy: boolean; error: string | null; onCommand: (body: Record<string, unknown>, clickKey?: string) => void }) {
  const [answer, setAnswer] = useState("");
  const done = run.steps.filter(step => DONE_STATES.has(step.state)).length;
  const confirm = (step: StepView) => onCommand({ type: "confirm", steps: [{ stepId: step.id, previewVersion: step.preview!.version, previewHash: step.preview!.hash, inputHash: step.preview!.inputHash }] }, `confirm:${step.id}:${step.preview!.version}`);
  return (
    <section data-ai-run-sheet data-ai-status={run.status} className="space-y-4" dir={language === "en" ? "ltr" : "rtl"} aria-live="polite">
      {run.steps.length > 0 && <p className="text-sm text-ink-muted">{t(UI, "counts", language, done, run.steps.length)}</p>}
      <ol className="space-y-3">{run.steps.map(step => <StepRow key={step.id} step={step} language={language} busy={busy} onConfirm={confirm} />)}</ol>
      {run.outcome && <Alert tone={run.outcome === "EXECUTED" ? "success" : run.outcome === "NOT_SUPPORTED" || run.outcome === "NOTHING_DONE" ? "warning" : "info"} data-ai-outcome={run.outcome}>{t(UI, `outcome_${run.outcome}`, language)}</Alert>}
      {run.errorCode && !run.outcome && ERROR_WORDS[run.errorCode as keyof typeof ERROR_WORDS] && <Alert tone="danger">{ERROR_WORDS[run.errorCode as keyof typeof ERROR_WORDS]![language]}</Alert>}
      {error && ERROR_WORDS[error as keyof typeof ERROR_WORDS] && <Alert tone="danger" data-ai-error={error}>{ERROR_WORDS[error as keyof typeof ERROR_WORDS]![language]}</Alert>}
      {run.status === "NEEDS_INPUT" && run.questions.length > 0 && (
        <div className="space-y-2" data-ai-questions>
          <h3 className="font-semibold">{t(UI, "questionsTitle", language)}</h3>
          <ul className="list-disc space-y-1 ps-5 text-sm">{run.questions.map(question => <li key={question.id}>{question.text ?? t(UI, "missingField", language, `${question.capabilityTitle ?? ""} ${question.pointer ?? ""}`.trim())}</li>)}</ul>
          <Textarea data-ai-answer value={answer} onChange={event => setAnswer(event.target.value)} maxLength={4000} dir="auto" />
          <Button data-ai-answer-submit disabled={busy || !answer.trim()} onClick={() => { onCommand({ type: "answer", text: answer }, `answer:${run.version}`); setAnswer(""); }}>{t(UI, "answer", language)}</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {["RUNNING", "WAITING_CONFIRM", "WAITING_HANDOFF", "NEEDS_INPUT"].includes(run.status) && <Button data-ai-pause variant="outline" disabled={busy} onClick={() => onCommand({ type: "pause" })}>{t(UI, "pause", language)}</Button>}
        {["PAUSED", "FAILED"].includes(run.status) && <Button data-ai-resume variant="outline" disabled={busy} onClick={() => onCommand({ type: "resume" })}>{t(UI, "resume", language)}</Button>}
        {!["COMPLETED", "CANCELLED", "EXPIRED"].includes(run.status) && <Button data-ai-cancel variant="ghost" disabled={busy} onClick={() => onCommand({ type: "cancel" })}>{t(UI, "cancel", language)}</Button>}
      </div>
    </section>
  );
}
