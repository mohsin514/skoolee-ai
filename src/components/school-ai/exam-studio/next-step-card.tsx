"use client";

import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioHomeCopy, type StudioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import type { NextStep } from "@/lib/school-ai/next-studio-step";
import { Isolated } from "./space-state";

/**
 * SKO-500: the one next step, first in Exam Studio. The words come from the step's kind; the record
 * title it names (a paper, a syllabus) is authored text and stays isolated for bidirectional layout.
 */
export type NextStepView = { step: NextStep; href: string };

export function nextStepWords(t: StudioHomeCopy, step: NextStep, date: (value: string) => string): { title: string; detail: string | null; action: string } {
  const title = step.title ?? "";
  switch (step.kind) {
    case "SAVE_FAILED": return { title: t.nextSAVE_FAILED, detail: null, action: t.nextSAVE_FAILEDAction };
    case "REHEARSAL_BLOCKING": return { title: fillStudioCopy(t.nextREHEARSAL_BLOCKING, [title]), detail: null, action: t.nextREHEARSAL_BLOCKINGAction };
    case "SLOT_OVERDUE": return { title: fillStudioCopy(t.nextSLOT_OVERDUE, [title]), detail: step.dueOn ? fillStudioCopy(t.nextSLOT_OVERDUEDetail, [date(step.dueOn)]) : null, action: t.nextSlotAction };
    case "SLOT_DUE": return { title: fillStudioCopy(t.nextSLOT_DUE, [title]), detail: step.dueOn ? fillStudioCopy(t.nextSLOT_DUEDetail, [date(step.dueOn)]) : null, action: t.nextSlotAction };
    case "MODERATE": return { title: fillStudioCopy(t.nextMODERATE, [title]), detail: null, action: t.nextMODERATEAction };
    case "APPROVE": return { title: (step.count ?? 1) > 1 ? fillStudioCopy(t.nextAPPROVEMany, [String(step.count), title]) : fillStudioCopy(t.nextAPPROVE, [title]), detail: null, action: t.nextAPPROVEAction };
    case "REVIEW_ITEMS": return { title: fillStudioCopy(t.nextREVIEW_ITEMS, [String(step.count ?? 0), title]), detail: null, action: t.nextREVIEW_ITEMSAction };
    case "OPEN_SITTING": return { title: fillStudioCopy(t.nextOPEN_SITTING, [title]), detail: null, action: t.nextOPEN_SITTINGAction };
    case "NEXT_LESSON": return { title: fillStudioCopy(t.nextNEXT_LESSON, [title]), detail: null, action: t.nextNEXT_LESSONAction };
    case "ADD_SYLLABUS": return { title: t.nextADD_SYLLABUS, detail: t.nextADD_SYLLABUSDetail, action: t.nextADD_SYLLABUSAction };
    default: return { title: t.nextCREATE_QUIZ, detail: null, action: t.nextCREATE_QUIZAction };
  }
}

export function NextStepCard({ language, view }: { language: Language; view: NextStepView }) {
  const t = studioHomeCopy(language);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const words = nextStepWords(t, view.step, date);
  const urgent = view.step.kind === "SLOT_OVERDUE" || view.step.kind === "SAVE_FAILED" || view.step.kind === "REHEARSAL_BLOCKING";
  return <section className={cn("sk-panel flex flex-wrap items-center gap-3 border p-4", urgent ? "border-status-error-border" : "border-brand-200")} aria-labelledby="studio-next-step" data-next-step={view.step.kind}>
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl", urgent ? "bg-status-error-surface text-status-error-text" : "bg-brand-100 text-primary")} aria-hidden="true"><Compass className="size-5" /></span>
    <div className="min-w-0 flex-1 space-y-0.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t.nextLabel}</p>
      <h2 id="studio-next-step" className="text-base font-bold"><Isolated>{words.title}</Isolated></h2>
      {words.detail ? <p className="text-sm text-ink-muted">{words.detail}</p> : null}
    </div>
    {/* A same-page hash must fire `hashchange`, which the Studio rail listens to; a plain anchor does. */}
    {view.href.startsWith("/ai/studio#")
      ? <a href={view.href.slice("/ai/studio".length)} className={cn(buttonVariants({ variant: "default" }), "w-full gap-2 sm:w-auto")} data-next-step-action>{words.action}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" /></a>
      : <Link href={view.href} className={cn(buttonVariants({ variant: "default" }), "w-full gap-2 sm:w-auto")} data-next-step-action>{words.action}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" /></Link>}
  </section>;
}
