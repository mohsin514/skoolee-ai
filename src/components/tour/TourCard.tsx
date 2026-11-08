"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InkHeading } from "@/components/ui/ink-heading";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";


export interface TourCardProps {
  titleId: string;
  bodyId: string;
  title: string;
  body: string;
  index: number;
  total: number;
  /** "Try it" focuses or clicks the highlighted control and advances. */
  canTry?: boolean;
  dir: "ltr" | "rtl";
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onTry?: () => void;
}

/**
 * The tour explainer in the Front Desk look: an ink-cover head (step count, editorial heading, one sentence) over a
 * paper footer with Skip tour (start), Back and Next/Done (end). ←/→ follow reading direction; Enter on the card
 * moves on; Escape is handled by the spotlight (skip). Counters are isolated in <bdi dir="ltr">.
 */
export function TourCard({ titleId, bodyId, title, body, index, total, canTry = false, dir, onBack, onNext, onSkip, onTry }: TourCardProps) {
  const t = useUiText();
  const heading = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState(false);
  const last = index === total - 1;
  const step = index + 1;

  // Each step lands on its heading so a screen reader hears the new title first.
  useEffect(() => {
    setExpanded(false);
    heading.current?.focus({ preventScroll: true });
  }, [index, title]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (event.key === forward) { event.preventDefault(); onNext(); return; }
    if (event.key === backward && index > 0) { event.preventDefault(); onBack(); return; }
    // Enter on a button activates that button; Enter anywhere else on the card moves on.
    if (event.key === "Enter" && !(event.target as HTMLElement).closest("button,a")) { event.preventDefault(); onNext(); }
  };

  return <div className="sk-tour-card-body rounded-[var(--radius-panel)] bg-card shadow-2xl" onKeyDown={onKeyDown}>
    <div className="sk-ink-cover rounded-none px-5 pb-5 pt-4 shadow-none">
      <p className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-brand-200">
        <span className="sr-only" aria-live="polite">{t("Step {0} of {1}: {2}", [step, total, title])}</span>
        <span aria-hidden="true">{t("Step")} <bdi dir="ltr">{step} / {total}</bdi></span>
        {/* SKAI-1277: a step rail — done steps, the current one stretched, the rest dim. */}
        {total > 1 && total <= 16 ? <span aria-hidden="true" className="flex items-center gap-1">{Array.from({ length: total }, (_, i) => <span key={i} className={cn("h-1.5 rounded-full motion-safe:transition-all motion-safe:duration-300", i === index ? "w-5 bg-white" : i < index ? "w-1.5 bg-brand-200" : "w-1.5 bg-white/25")} />)}</span> : null}
      </p>
      <InkHeading
        as="h2"
        id={titleId}
        ref={heading}
        tabIndex={-1}
        data-spotlight-initial-focus
        swashKey={index}
        text={title}
        className="mt-2 text-[1.75rem] outline-none"
      />
      <p id={bodyId} className={cn("mt-3 text-sm leading-relaxed text-brand-100", !expanded && "[@media(max-height:420px)]:hidden")}>{body}</p>
      {/* Short landscape phones (≤ 420 px tall) fold the sentence behind "Read more" so the controls stay reachable.
          Full literal utilities (the class scanner reads source text), not a layered rule Button's inline-flex would beat. */}
      <Button type="button" variant="link" size="sm" className={cn("mt-1 hidden min-h-11 px-0 text-brand-100 focus-on-dark", !expanded && "[@media(max-height:420px)]:inline-flex")} onClick={() => { setExpanded(true); heading.current?.focus({ preventScroll: true }); }}>{t("Read more")}</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2 px-3 py-3">
      <Button type="button" variant="link" size="sm" className="me-auto px-2 text-ink-muted" onClick={onSkip}>{t("Skip tour")}</Button>
      {canTry && onTry ? <Button type="button" variant="outline" size="sm" onClick={onTry}><Hand aria-hidden="true" />{t("Try it")}</Button> : null}
      {index > 0 ? <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="rtl:rotate-180" aria-hidden="true" />{t("Back")}</Button> : null}
      <Button type="button" size="sm" onClick={onNext}>
        {last ? <><Check aria-hidden="true" />{t("Done")}</> : <>{t("Next")}<ArrowRight className="rtl:rotate-180" aria-hidden="true" /></>}
      </Button>
    </div>
  </div>;
}
