"use client";
import { FlagshipChip } from "@/components/ui/flagship";
import { InkHeading } from "@/components/ui/ink-heading";
import { useLocale } from "@/components/locale/LocaleProvider";
import { UI, t, type Lang } from "./run-copy";
import { runText } from "./run-links";

/**
 * The personal /ai cover (parents, students, the app owner): ink cover, eyebrow, the one h1 and a
 * sub-line. The Ask card overlaps its lower edge. `badge` holds the demo-school badge when it applies.
 */
export function AskHero({ headingId, badge }: { headingId: string; badge?: React.ReactNode }) {
  const { language } = useLocale();
  const lang: Lang = language === "ar" || language === "ur" ? language : "en";
  return (
    <header data-ai-ask-hero className="sk-ink-cover sk-enter space-y-3 px-5 pb-14 pt-6 sm:px-8 sm:pb-16 sm:pt-8" dir={lang === "en" ? "ltr" : "rtl"}>
      <span className="sk-quiz-orb" data-tone="brand" aria-hidden="true" />
      <span className="sk-quiz-orb" data-tone="berry" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-white/15">
          <FlagshipChip />
          <span>{runText("aiWorkflows", lang)}</span>
        </span>
        {badge}
      </div>
      <InkHeading id={headingId} as="h1" text={t(UI, "askTitle", lang)} className="text-3xl text-white sm:text-4xl" />
      <p className="max-w-2xl text-sm text-brand-100 sm:text-base">{t(UI, "askHint", lang)}</p>
    </header>
  );
}
