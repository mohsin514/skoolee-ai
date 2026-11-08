"use client";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import type { Lang } from "./run-copy";
import { runText } from "./run-links";

/**
 * Between Ask and the plan: the person's own words echoed back and a labelled skeleton.
 * No step names, counts, percentages or ETA, because none exist yet.
 */
export function RunPlanning({ requestText, language }: { requestText?: string; language: Lang }) {
  return (
    <div data-ai-planning className="sk-fade-in space-y-4">
      {requestText ? (
        <div className="ms-auto max-w-[85%] space-y-1 rounded-2xl rounded-se-md bg-brand-50 px-4 py-3 ring-1 ring-brand-100 sm:max-w-[75%]">
          <p className="sk-eyebrow text-2xs text-brand-700">{runText("youAsked", language)}</p>
          <p dir="auto" className="line-clamp-3 whitespace-pre-line text-sm text-ink-strong [overflow-wrap:anywhere]">{requestText}</p>
        </div>
      ) : null}
      <SkeletonRegion label={runText("planningSteps", language)} className="space-y-3">
        <p aria-hidden="true" className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <span className="sk-typing-dot size-1.5 rounded-full bg-brand-400" />
            <span className="sk-typing-dot size-1.5 rounded-full bg-brand-400" />
            <span className="sk-typing-dot size-1.5 rounded-full bg-brand-400" />
          </span>
          {runText("planningSteps", language)}
        </p>
        <ol className="sk-stagger space-y-2">
          {[0, 1, 2].map(row => (
            <li key={row} className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-card p-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-2/3 rounded-full" />
                <Skeleton className="h-2.5 w-1/3 rounded-full" />
              </div>
            </li>
          ))}
        </ol>
      </SkeletonRegion>
    </div>
  );
}
