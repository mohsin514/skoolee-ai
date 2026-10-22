"use client";

/**
 * SkooleeAI's two flagship surfaces (addendum 2026-10-22): AI Workflows (`/ai`, the school setup questionnaire and
 * reviewed AI runs) and Exam Studio (`/ai/studio`, AI-built assessments with secure delivery and marking).
 *
 * - `FlagshipChip` — the small branded "AI" mark beside a flagship's name: the registry nav leaf (RoleSidebar), the
 *   welcome guide and these cards. Visible text "AI" is a product mark (not translated); its accessible name is.
 * - `FlagshipCard` — the flagship call to action on a Today / Overview screen. One brand-tinted band with the
 *   flagship's mark, a title, one sentence and ONE primary action (plus an optional quiet secondary link). Strings
 *   are EN UI keys translated here. It draws no page card of its own (it sits inside the shell's one page card) and
 *   emits `data-tour={tourAnchor}` for the spotlight tour (`<console>.today.flagship-ai` / `.flagship-exams`).
 *
 * The copy promise is the product's: AI drafts, people review and approve, nothing applies on its own. The shape is
 * mirrored by `FlagshipCardSkeleton` in RoleShellSkeleton.tsx (radius, padding, 44 px mark, end-aligned action).
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, FileCheck2, Sparkles, Workflow, type LucideIcon } from "lucide-react";
import { buttonVariants } from "./button";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

export type FlagshipKind = "ai-workflows" | "exam-studio";

const KIND: Record<FlagshipKind, { name: string; icon: LucideIcon }> = {
  "ai-workflows": { name: "AI Workflows", icon: Workflow },
  "exam-studio": { name: "Exam Studio", icon: FileCheck2 },
};

/** The small branded "AI" chip. Decorative inside an element that already names the flagship; announced otherwise. */
export function FlagshipChip({ className }: { className?: string }): React.JSX.Element {
  const t = useUiText();
  return (
    <span
      role="img"
      aria-label={t("Flagship AI feature")}
      data-flagship-chip=""
      className={cn(
        "inline-flex h-5 shrink-0 select-none items-center gap-0.5 rounded-full bg-gradient-to-r from-primary to-brand-500 px-1.5 text-2xs font-bold leading-none text-primary-foreground shadow-sm shadow-primary/20",
        className,
      )}
    >
      <Sparkles aria-hidden="true" className="size-3" strokeWidth={2.5} />
      <span aria-hidden="true" dir="ltr">AI</span>
    </span>
  );
}

export interface FlagshipAction { label: string; href: string }
export interface FlagshipCardProps {
  kind: FlagshipKind;
  /** EN UI key. */
  title: string;
  /** EN UI key: one sentence, truthful — AI drafts, a person reviews and approves before anything applies. */
  description: string;
  /** The card's one primary action (EN UI key + in-app href). */
  action: FlagshipAction;
  /** Optional quiet link (EN UI key + href), e.g. "See past runs". */
  secondary?: FlagshipAction;
  /** Spotlight anchor, e.g. "admin.today.flagship-ai". */
  tourAnchor?: string;
  className?: string;
}

export function FlagshipCard({ kind, title, description, action, secondary, tourAnchor, className }: FlagshipCardProps): React.JSX.Element {
  const t = useUiText();
  const titleId = React.useId();
  const { name, icon: Icon } = KIND[kind];
  // The eyebrow names the flagship unless the title already does ("AI Workflows" card on a set-up school).
  const eyebrow = title === name ? null : t(name);
  return (
    <section
      aria-labelledby={titleId}
      data-tour={tourAnchor}
      data-flagship={kind}
      className={cn(
        "relative isolate overflow-hidden rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100 sm:p-6",
        className,
      )}
    >
      {/* A soft brand glow at the end edge; mirrored in RTL, never behind text that needs contrast. */}
      <div aria-hidden="true" className="pointer-events-none absolute -end-20 -top-24 -z-10 size-64 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-brand-500 text-primary-foreground shadow-md shadow-primary/20">
            <Icon className="size-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <FlagshipChip />
              {eyebrow ? <span className="text-xs font-semibold text-brand-700">{eyebrow}</span> : null}
            </p>
            <h2 id={titleId} className="text-base font-bold leading-snug text-ink-strong sm:text-lg [overflow-wrap:anywhere]">{t(title)}</h2>
            <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">{t(description)}</p>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
          {secondary ? (
            <Link href={secondary.href} data-flagship-secondary="" className={buttonVariants({ variant: "ghost", className: "w-full sm:w-auto" })}>
              {t(secondary.label)}
            </Link>
          ) : null}
          <Link href={action.href} data-flagship-action="" className={buttonVariants({ variant: "default", className: "w-full gap-2 sm:w-auto" })}>
            <span className="[overflow-wrap:anywhere]">{t(action.label)}</span>
            <ArrowRight aria-hidden="true" className="size-4 shrink-0 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </section>
  );
}
