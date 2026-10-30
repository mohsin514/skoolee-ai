"use client";
import { useId, useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/truncated-text";
import type { RunView, StepView } from "@/lib/ai-workflows/view";
import { cn } from "@/lib/utils";
import { STATE_WORDS, errorWords, type Lang } from "./run-copy";
import { RunAnswer } from "./run-answer";
import { RunHandoff, useHandoffLabel } from "./run-handoff";
import { RunRecordLink, runText } from "./run-links";
import { PreviewLines, RunPreview } from "./run-preview";
import { RunReceipt } from "./run-receipt";
import { useSeenTransition } from "./use-seen-transition";
import { Num, TimeAgo } from "./workflow-format";
import { ClassMark, DONE_STATES, STATE_MARK, StateNode, type StepClass } from "./workflow-marks";

/** "Saved" is rendered only from a receipt (UX §3.1 hard rule). */
export function assertReceipt(step: StepView) {
  if (DONE_STATES.has(step.state) && !step.receipt && process.env.NODE_ENV !== "production") throw new Error(`Step ${step.key} shows ${step.state} without a receipt`);
}

const ACTIVE = new Set<StepView["state"]>(["running", "awaiting_confirm", "needs_input"]);
const NEEDS_YOU = (state: StepView["state"]) => state === "awaiting_confirm" || state === "needs_input";
const isDoneState = (state: StepView["state"]) => DONE_STATES.has(state);
const stepClass = (cls: string): StepClass => (cls === "A" || cls === "B" || cls === "C" ? cls : "X");

interface StepProps {
  step: StepView; run: RunView; language: Lang; busy: boolean; pendingKey: string | null;
  ordinal: { index: number; of: number } | null;
  onConfirm: (step: StepView) => void; onAmend: (step: StepView, actionId: string, expect: number) => void;
}

function StepError({ step, language }: { step: StepView; language: Lang }) {
  if (!step.errorCode || step.state === "practice") return null;
  const link = step.receipt?.link ?? step.handoff?.link ?? null;
  const pointsAtScreen = step.errorCode === "DOMAIN_REFUSED" || step.errorCode === "UNCERTAIN";
  const words = pointsAtScreen && !link ? runText(step.errorCode === "DOMAIN_REFUSED" ? "refusedNoLink" : "uncertainNoLink", language) : errorWords(step.errorCode, language);
  return (
    <Alert compact tone="danger" data-ai-error={step.errorCode} actions={pointsAtScreen && link ? <RunRecordLink href={link} language={language} /> : undefined}>
      {words}
    </Alert>
  );
}

function RunStep({ step, run, language, busy, pendingKey, ordinal, onConfirm, onAmend }: StepProps) {
  assertReceipt(step);
  const handoffLabel = useHandoffLabel();
  const pop = useSeenTransition(step.state, isDoneState);
  const attention = useSeenTransition(step.state, NEEDS_YOU);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const confirmedId = useId();
  const active = ACTIVE.has(step.state);
  const mark = STATE_MARK[step.state];
  const cls = stepClass(step.cls);
  const stateLabel = step.state === "handed_off" ? handoffLabel(step, language) : STATE_WORDS[step.state][language];
  const subtitle = ordinal && step.preview?.lines[0] ? `${step.preview.lines[0].label}: ${step.preview.lines[0].value}` : null;
  const finishedWithPreview = step.preview && step.state !== "awaiting_confirm" && (DONE_STATES.has(step.state) || step.state === "handed_off");

  return (
    <li
      data-ai-step={step.capabilityKey} data-ai-state={step.state} tabIndex={-1}
      aria-current={active ? "step" : undefined} data-active={active || undefined}
      className={cn(
        "relative min-w-0 scroll-mt-24 outline-offset-4",
        active ? "sk-quiz-card space-y-3 p-4 sm:p-5" : "space-y-2 rounded-2xl border border-border-subtle bg-card p-3 shadow-xs",
        attention && "sk-ai-attention",
      )}
      data-tone={attention ? "warning" : undefined}
    >
      <StateNode state={step.state} pop={pop} className={cn("absolute -start-11", active ? "top-4 sm:top-5" : "top-3")} />
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1 basis-48">
          <p dir="auto" className="font-semibold text-ink-strong [overflow-wrap:anywhere]">
            {step.title}
            {ordinal ? <span className="ms-1.5 text-xs font-medium text-ink-muted">· <OrdinalText index={ordinal.index} of={ordinal.of} language={language} /></span> : null}
          </p>
          {subtitle ? <TruncatedText text={subtitle} className="text-xs text-ink-muted" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ClassMark cls={cls} roles={step.handoff?.roles} language={language} />
          <Badge size="sm" variant={mark.badge} dot={step.state === "running"}>{stateLabel}</Badge>
        </div>
      </div>

      {step.state === "running" ? (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
          <span>{runText("workingOnIt", language)}</span>
          <TimeAgo iso={run.updatedAt} />
        </p>
      ) : null}

      {step.state === "awaiting_confirm" && step.preview ? (
        <RunPreview step={{ ...step, preview: step.preview }} language={language} busy={busy} pendingKey={pendingKey} onConfirm={onConfirm} onAmend={onAmend} />
      ) : null}

      {step.state === "handed_off" && step.handoff ? <RunHandoff handoff={step.handoff} language={language} capability={step.capabilityKey} /> : null}

      {step.receipt ? (
        step.receipt.kind === "read" && step.receipt.text
          ? <RunAnswer receipt={{ ...step.receipt, text: step.receipt.text }} language={language} />
          : <RunReceipt receipt={step.receipt} state={step.state} language={language} />
      ) : null}

      {step.state === "practice" ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border-subtle bg-surface-subtle px-3 py-2 text-xs text-ink-muted">
          <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
          <span>{runText("practiceStep", language)}</span>
        </p>
      ) : null}

      <StepError step={step} language={language} />

      {finishedWithPreview && step.preview && step.preview.lines.length > 0 ? (
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" aria-expanded={showConfirmed} aria-controls={confirmedId} onClick={() => setShowConfirmed(open => !open)}>
            <ChevronDown aria-hidden="true" className={cn("transition-transform duration-(--duration-control) motion-reduce:transition-none", showConfirmed && "rotate-180")} />
            {runText("whatYouConfirmed", language)}
          </Button>
          <div id={confirmedId} hidden={!showConfirmed} className="rounded-xl bg-surface-subtle p-3">
            {showConfirmed ? <PreviewLines lines={step.preview.lines} language={language} /> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function OrdinalText({ index, of, language }: { index: number; of: number; language: Lang }) {
  const template = runText("ordinal", language);
  const parts = template.split(/(\{0\}|\{1\})/);
  return <>{parts.map((part, key) => part === "{0}" ? <Num key={key} value={index} /> : part === "{1}" ? <Num key={key} value={of} /> : part)}</>;
}

/** The plan as a timeline on `.sk-ai-rail`; the fill grows only with receipt-backed steps. */
export function RunSteps({ run, language, busy, pendingKey, onConfirm, onAmend }: Omit<StepProps, "step" | "ordinal">) {
  const done = run.steps.filter(step => DONE_STATES.has(step.state)).length;
  const fill = run.steps.length ? Math.round((done / run.steps.length) * 100) : 0;
  const totals = new Map<string, number>();
  for (const step of run.steps) totals.set(step.title, (totals.get(step.title) ?? 0) + 1);
  const seen = new Map<string, number>();
  return (
    <ol className="sk-ai-rail sk-stagger space-y-3" style={{ "--sk-rail-fill": `${fill}%` } as React.CSSProperties}>
      <li data-part="fill" role="presentation" aria-hidden="true" />
      {run.steps.map(step => {
        const of = totals.get(step.title) ?? 1;
        const index = (seen.get(step.title) ?? 0) + 1;
        seen.set(step.title, index);
        return <RunStep key={step.id} step={step} run={run} language={language} busy={busy} pendingKey={pendingKey} ordinal={of > 1 ? { index, of } : null} onConfirm={onConfirm} onAmend={onAmend} />;
      })}
    </ol>
  );
}
