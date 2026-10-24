"use client";
import { useId } from "react";
import Link from "next/link";
import { ArrowRight, Workflow } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FlagshipChip } from "@/components/ui/flagship";
import { cn } from "@/lib/utils";
import type { StepUiState } from "@/lib/ai-workflows/view";
import { StateNode } from "./workflow-marks";

export interface SetupMilestone { label: string; state: StepUiState }

/**
 * FlagshipCard's ai-workflows look for strings that are already in the reader's language
 * (FlagshipCard runs every string through translateUi). Adds an inline Answer → Review → Build strip.
 */
export function SetupPromptCard({ eyebrow, title, description, action, milestones, stripLabel, tourAnchor, className, ...props }: {
  eyebrow: string; title: string; description: string; action: { label: string; href: string };
  milestones: SetupMilestone[]; stripLabel: string; tourAnchor?: string; className?: string;
} & Record<`data-${string}`, unknown>) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} data-tour={tourAnchor} data-flagship="ai-workflows" {...props}
      className={cn("@container/flagship sk-enter relative isolate overflow-hidden rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100 sm:p-6", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute -end-20 -top-24 -z-10 size-64 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="flex flex-col gap-4 @xl/flagship:flex-row @xl/flagship:items-center @xl/flagship:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-brand-500 text-primary-foreground shadow-md shadow-primary/20">
            <Workflow className="size-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="flex flex-wrap items-center gap-2"><FlagshipChip /><span className="text-xs font-semibold text-brand-700">{eyebrow}</span></p>
            <h2 id={titleId} className="text-base font-bold leading-snug text-ink-strong sm:text-lg [overflow-wrap:anywhere]">{title}</h2>
            <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">{description}</p>
            <ol className="sk-ai-rail max-w-sm gap-2 pt-1" data-axis="inline" aria-label={stripLabel}>
              {milestones.flatMap((milestone, index) => [
                ...(index > 0 ? [<li key={`link-${index}`} data-part="link" data-done={milestone.state === "saved" || undefined} aria-hidden />] : []),
                <li key={milestone.label} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                  <StateNode state={milestone.state} size="sm" />
                  <span>{milestone.label}</span>
                </li>,
              ])}
            </ol>
          </div>
        </div>
        <Link href={action.href} data-flagship-action="" className={buttonVariants({ variant: "default", className: "sk-nudge-trigger w-full shrink-0 gap-2 @xl/flagship:w-auto" })}>
          <span className="[overflow-wrap:anywhere]">{action.label}</span>
          <ArrowRight aria-hidden="true" className="sk-nudge size-4 shrink-0 rtl:rotate-180" />
        </Link>
      </div>
    </section>
  );
}
