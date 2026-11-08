"use client";

import type { ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * The one sheet of paper on the setup desk: folio ("STEP 2 OF 6"), the
 * step's h1 (the page's only h1; it takes focus on every step change and
 * draws a one-shot ink cue for keyboard users), the intro, the notices slot
 * (error summary), the body and the sticky action dock.
 *
 * It is the only `[data-step-card]`, the View Transition group that morphs
 * between steps.
 */
export type StepCardProps = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  folio: string;
  title: string;
  intro: ReactNode;
  notices?: ReactNode;
  dock: ReactNode;
  children: ReactNode;
  className?: string;
};

export function StepCard({ headingRef, folio, title, intro, notices, dock, children, className }: StepCardProps) {
  return (
    <section data-step-card="" aria-labelledby="step-heading" className={cn("sk-panel sk-gradient-border sk-step-card sk-rise", className)}>
      <header className="sk-step-head">
        <p className="sk-folio text-primary">{folio}</p>
        <h1 id="step-heading" ref={headingRef} tabIndex={-1} className="sk-step-title mt-2 text-2xl font-bold leading-tight tracking-tight text-ink-strong text-balance sm:text-3xl">
          {title}
        </h1>
        <p className="mt-3 max-w-[62ch] text-md leading-relaxed text-ink-muted">{intro}</p>
      </header>
      {notices ? <div className="mt-5 space-y-3">{notices}</div> : null}
      <div className="mt-6">{children}</div>
      {dock}
    </section>
  );
}
