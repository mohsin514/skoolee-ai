"use client";
import { UserRoundCheck } from "lucide-react";
import type { StepView } from "@/lib/ai-workflows/view";
import { STATE_WORDS, type Lang } from "./run-copy";
import { RunScreenLink, runText } from "./run-links";
import { useWorkflowFormat } from "./workflow-format";

/** The state words for a handed-off step: "With the Principal or School admin", never raw role enums. */
export function useHandoffLabel() {
  const format = useWorkflowFormat();
  return (step: StepView, language: Lang) => {
    const list = step.handoff ? format.roles(step.handoff.roles, "disjunction") : "";
    return list ? runText("withRoles", language, list) : STATE_WORDS.handed_off[language];
  };
}

/** A class C step that now waits for the person who decides, on their own screen. */
export function RunHandoff({ handoff, language }: { handoff: NonNullable<StepView["handoff"]>; language: Lang }) {
  const format = useWorkflowFormat();
  const list = format.roles(handoff.roles, "disjunction");
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-status-info-surface/60 p-3 ring-1 ring-status-info-border sm:flex-row sm:items-center">
      <span aria-hidden="true" className="inline-grid size-9 shrink-0 place-items-center rounded-xl bg-white text-status-info-text ring-1 ring-status-info-border">
        <UserRoundCheck className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-ink-strong [overflow-wrap:anywhere]">
        {list ? runText("waitingFor", language, list) : runText("readyOnScreen", language)}
      </p>
      <RunScreenLink href={handoff.link} language={language} />
    </div>
  );
}
