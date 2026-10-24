"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, ListChecks, MessageSquareText, PenLine, Sparkles } from "lucide-react";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { RunView } from "@/lib/ai-workflows/view";
import { cn } from "@/lib/utils";
import { RUN_UI, UI, t, type Lang } from "./run-copy";
import { runText } from "./run-links";
import { useSeenTransition } from "./use-seen-transition";
import { TimeAgo, useWorkflowFormat } from "./workflow-format";

const TONES: Record<string, AlertTone> = {
  EXECUTED: "success", PARTIAL: "warning", AWAITING_APPROVAL: "info", PLAN_SAVED: "info", NOT_SUPPORTED: "info", NOTHING_DONE: "info",
};

const isDone = (run: RunView) => run.status === "COMPLETED" && run.outcome === "EXECUTED";

/** Focuses the Ask composer on this page (never sends). */
function focusComposer() {
  const field = document.querySelector<HTMLTextAreaElement>("[data-ai-request]");
  if (!field) return;
  field.focus();
  field.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

/**
 * How the run ended, from the server's outcome only. A finished run celebrates once, and only when this
 * mount saw it finish (a reopened or reloaded run stays still).
 */
export function RunOutcome({ run, language, celebrate = true, requestText, onRephrase, examples, sheetRef }: {
  run: RunView; language: Lang; celebrate?: boolean; requestText?: string; onRephrase?: (text: string) => void; examples?: string[];
  sheetRef: React.RefObject<HTMLElement | null>;
}) {
  const format = useWorkflowFormat();
  const seenDone = useSeenTransition(run, isDone);
  const outcome = run.outcome;
  if (!outcome) return null;
  if (outcome === "ANSWERED") {
    const answered = run.steps.some(step => step.receipt?.kind === "read" && step.receipt.text);
    return answered ? <span data-ai-outcome={outcome} hidden /> : <Badge size="sm" variant="neutral" data-ai-outcome={outcome}>{t(UI, "nothingChanged", language)}</Badge>;
  }
  const tone = TONES[outcome];
  if (!tone) return null;
  const party = seenDone && celebrate !== false;

  let actions: React.ReactNode = null;
  if (outcome === "EXECUTED") {
    const links = run.steps.filter(step => step.receipt?.link).slice(0, 3);
    actions = (
      <>
        {links.map(step => (
          <Link key={step.id} href={step.receipt!.link!} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "sk-nudge-trigger w-full sm:w-auto")}>
            <span dir="auto" className="min-w-0 truncate">{step.title}</span>
            <ArrowUpRight aria-hidden="true" className="sk-nudge rtl:-scale-x-100" />
          </Link>
        ))}
        {onRephrase ? <Button type="button" variant="ghost" size="sm" className="w-full sm:w-auto" onClick={focusComposer}><Sparkles aria-hidden="true" />{runText("askSomethingElse", language)}</Button> : null}
      </>
    );
  } else if (outcome === "PARTIAL") {
    const review = () => {
      const target = sheetRef.current?.querySelector<HTMLElement>('[data-ai-state="failed"], [data-ai-state="uncertain"], [data-ai-state="stale"]');
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      target.focus({ preventScroll: true });
    };
    actions = <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={review}><ListChecks aria-hidden="true" />{runText("reviewSteps", language)}</Button>;
  } else if (outcome === "NOT_SUPPORTED" || outcome === "NOTHING_DONE") {
    actions = (
      <>
        {onRephrase && requestText ? <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => onRephrase(requestText)}><PenLine aria-hidden="true" />{runText("rephrase", language)}</Button> : null}
        <Link href="/ai/can-do" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "sk-nudge-trigger w-full sm:w-auto")}>
          <span>{t(UI, "seeWhatAiCanDo", language)}</span>
          <ArrowRight aria-hidden="true" className="sk-nudge rtl:rotate-180" />
        </Link>
        {onRephrase ? (examples ?? []).slice(0, 3).map(example => (
          <Button key={example} type="button" variant="choice" size="sm" data-ai-example className="w-full sm:w-auto" onClick={() => onRephrase(example)}>
            <MessageSquareText aria-hidden="true" /><span dir="auto" className="min-w-0 text-start">{example}</span>
          </Button>
        )) : null}
      </>
    );
  }

  const roles = outcome === "AWAITING_APPROVAL" ? format.roles(run.steps.flatMap(step => step.state === "handed_off" ? step.handoff?.roles ?? [] : [])) : "";
  const body = roles ? runText("waitingFor", language, roles) : t(UI, `outcome_${outcome}`, language);

  return (
    <Alert tone={tone} live="off" data-ai-outcome={outcome} data-ai-celebrate={party || undefined}
      title={t(RUN_UI, `outcomeTitle_${outcome}`, language)}
      actions={actions ? <div className="flex w-full flex-wrap gap-2">{actions}</div> : undefined}>
      {party ? (
        <Badge size="sm" variant="success" className="sk-seal-press mb-2">
          <Check aria-hidden="true" className="sk-check-pop" />
          <span>{runText("savedAt", language)}</span>
          <TimeAgo iso={run.updatedAt} className="font-normal" />
        </Badge>
      ) : null}
      <p dir="auto">{body}</p>
    </Alert>
  );
}
