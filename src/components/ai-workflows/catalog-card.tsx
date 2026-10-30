"use client";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Lang, T } from "./run-copy";
import { ClassGlyph, ClassMark, type StepClass } from "./workflow-marks";
import { useWorkflowFormat } from "./workflow-format";

/** One capability as the server hands it to the catalogue: plain, serialisable data only. */
export interface CatalogItem {
  key: string;
  title: string;
  whenToUse: string;
  example: string | null;
  cls: StepClass;
  /** Roles that handle an unavailable item; empty when nobody can do it for this person right now. */
  handledBy: string[];
}

export const CARD_WORDS = {
  tryIt: { en: "Try it", ar: "جرّبه", ur: "آزمائیں" },
  tryLabel: { en: "Try “{0}” in Ask", ar: "جرّب «{0}» في اطلب", ur: "«{0}» کو پوچھیں میں آزمائیں" },
  handledBy: { en: "Handled by: {0}", ar: "يتولّاه: {0}", ur: "ذمہ دار: {0}" },
  notOpen: { en: "Not open to you right now", ar: "غير متاح لك الآن", ur: "ابھی آپ کے لیے دستیاب نہیں" },
  example: { en: "For example", ar: "مثال", ur: "مثال کے طور پر" },
} satisfies Record<string, T>;

const QUOTES: Record<Lang, [string, string]> = { en: ["“", "”"], ar: ["«", "»"], ur: ["“", "”"] };

/**
 * A capability card. The card itself is not interactive; only "Try it" is, and it appears only for
 * connected capabilities on a school where AI Workflows are switched on. The link carries the
 * registry key only, never user text; Ask pre-fills the example and never sends it on its own.
 */
export function CatalogCard({ item, language, canTry }: { item: CatalogItem; language: Lang; canTry: boolean }) {
  const format = useWorkflowFormat();
  const tryable = canTry && item.cls !== "X";
  const [open, close] = QUOTES[language];
  return (
    <li
      data-ai-capability={item.key}
      data-ai-capability-class={item.cls}
      className={cn(
        "flex min-h-44 flex-col gap-3 rounded-2xl border border-border-subtle bg-card p-4 shadow-xs",
        tryable && "sk-hover-lift sk-nudge-trigger",
        item.cls === "X" && "bg-surface-subtle",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <ClassGlyph cls={item.cls} className="mt-0.5 size-7 rounded-xl [&>svg]:size-3.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-semibold leading-snug text-ink-strong [overflow-wrap:anywhere]" dir="auto">{item.title}</h3>
          {item.whenToUse ? <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted" dir="auto">{item.whenToUse}</p> : null}
        </div>
      </div>
      {item.example && item.cls !== "X" ? (
        <p className="rounded-xl bg-surface-subtle px-3 py-2 text-xs leading-relaxed text-ink">
          <span className="sr-only">{CARD_WORDS.example[language]}: </span>
          <bdi dir="auto" className={cn("[overflow-wrap:anywhere]", language === "en" && "italic")}>{open}{item.example}{close}</bdi>
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        {item.cls === "C" ? <ClassMark cls="C" size="long" language={language} /> : null}
        {item.cls === "X" ? (
          item.handledBy.length > 0 ? (
            <p className="text-xs text-ink-muted"><bdi>{CARD_WORDS.handledBy[language].replace("{0}", format.roles(item.handledBy, "conjunction"))}</bdi></p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs text-ink-muted"><Lock aria-hidden="true" className="size-3.5" />{CARD_WORDS.notOpen[language]}</p>
          )
        ) : null}
        {tryable ? (
          <Link
            href={`/ai?try=${encodeURIComponent(item.key)}`}
            data-ai-try={item.key}
            aria-label={CARD_WORDS.tryLabel[language].replace("{0}", item.title)}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ms-auto min-h-11")}
          >
            <span>{CARD_WORDS.tryIt[language]}</span>
            <ArrowRight aria-hidden="true" className="sk-nudge rtl:rotate-180" />
          </Link>
        ) : null}
      </div>
    </li>
  );
}
