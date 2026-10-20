"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { BrainCircuit, ClipboardCheck, FileText, Lightbulb, PenLine, ShieldCheck, Sparkles, Wand2, type LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { useLocale } from "@/components/locale/LocaleProvider";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import { AiActionPanel, AIReviewQueue, type AIFeatureOption } from "@/components/role-dashboard/AiActionPanel";
import { AI_STAGE_OF, fillAi, getAiWorkflowsCopy, type AiStageKey } from "./ai-workflows-copy";

/**
 * The AI workflows home, laid out like readiness "launch control": a hero with what is waiting, a spotlight
 * on the one most useful next step (decide the waiting drafts, else start the first workflow), the role's
 * workflows grouped as a journey (Understand → Plan → Write → Review) with why each matters and a Start that
 * selects it in the composer, then the composer, the review queue and the recent drafts.
 */
type Insight = { id: string; feature: string; title?: string | null; summary?: string | null };
type ReviewItem = { id: string; title: string; feature: string; status: string };

const STAGES: { key: AiStageKey; icon: LucideIcon }[] = [
  { key: "understand", icon: BrainCircuit },
  { key: "plan", icon: Lightbulb },
  { key: "write", icon: PenLine },
  { key: "review", icon: ClipboardCheck },
];
const COMPOSER_INPUT = "sk-ai-flow-context";

export function AiWorkflowsHome({
  title, features, insights, reviewItems, onComplete, campusId, canReview = true, drafts,
}: {
  title: string;
  features: AIFeatureOption[];
  insights?: Insight[] | null;
  /** Omit (undefined) for a role that does not approve drafts. */
  reviewItems?: ReviewItem[] | null;
  onComplete: () => void | Promise<void>;
  campusId?: string | null;
  canReview?: boolean;
  /** Replaces the built-in recent drafts list (the teacher page has its own searchable one). */
  drafts?: ReactNode;
}) {
  const { language } = useLocale();
  const c = getAiWorkflowsCopy(language);
  const rtl = language === "ar" || language === "ur";
  const access = useNavigationAccess();
  const [feature, setFeature] = useState(features[0]?.feature ?? "");
  const [showAll, setShowAll] = useState(false);

  const review = canReview && reviewItems ? reviewItems : null;
  const savedDrafts = insights ?? [];
  const label = (option: AIFeatureOption) => c.features[option.feature]?.label ?? option.label;
  const why = (option: AIFeatureOption) => c.features[option.feature]?.why ?? option.placeholder ?? "";
  const first = features[0];
  const shownDrafts = showAll ? savedDrafts : savedDrafts.slice(0, 5);

  const start = (next: string) => {
    setFeature(next);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("ai-composer")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => document.getElementById(COMPOSER_INPUT)?.focus({ preventScroll: true }), reduce ? 0 : 350);
  };

  return (
    <div lang={language} dir={rtl ? "rtl" : "ltr"} className="sk-ai-flows">
      {/* ── Hero ── */}
      <header className="sk-launch-hero">
        <div className="min-w-0 space-y-3">
          <p className="sk-eyebrow text-primary">{c.eyebrow} · {c.titles[title] ?? title}</p>
          <h2 className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{c.headline}</h2>
          <p className="max-w-[60ch] text-sm leading-relaxed text-ink-muted">{c.intro}</p>
          <p className="flex items-start gap-1.5 text-xs font-semibold text-status-success-text"><ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{c.privacy}</p>
          {access.allows("schoolAi") ? <Link href="/ai" className={buttonVariants({ variant: "link", className: "h-auto gap-1 p-0" })}><Sparkles aria-hidden="true" className="size-4" />{c.workspace}</Link> : null}
        </div>
        <dl className="sk-ai-flow-stats">
          <div><dt>{c.stats.workflows}</dt><dd><bdi dir="ltr">{features.length}</bdi></dd></div>
          {review ? <div data-tone={review.length ? "warning" : undefined}><dt>{c.stats.waiting}</dt><dd><bdi dir="ltr">{review.length}</bdi></dd></div> : null}
          <div><dt>{c.stats.drafts}</dt><dd><bdi dir="ltr">{savedDrafts.length}</bdi></dd></div>
        </dl>
      </header>

      <nav aria-label={c.sectionsLabel} className="sk-launch-nav">
        <a href="#ai-workflows"><Wand2 aria-hidden="true" className="size-4" />{c.nav.workflows}</a>
        <a href="#ai-composer"><Sparkles aria-hidden="true" className="size-4" />{c.nav.composer}</a>
        {review ? <a href="#ai-review"><ClipboardCheck aria-hidden="true" className="size-4" />{c.nav.review}</a> : null}
        <a href="#ai-drafts"><FileText aria-hidden="true" className="size-4" />{c.nav.drafts}</a>
      </nav>

      {/* ── Spotlight ── */}
      {review?.length ? (
        <section aria-labelledby="ai-next" className="sk-launch-spotlight">
          <div className="min-w-0 space-y-1">
            <p id="ai-next" className="sk-eyebrow">{c.nextEyebrow}</p>
            <p className="text-xl font-bold text-ink-strong">{fillAi(c.reviewTitle, review.length)}</p>
            <p className="text-sm text-ink-muted">{c.reviewWhy}</p>
          </div>
          <a href="#ai-review" className={buttonVariants({ variant: "default", className: "shrink-0 gap-2" })}>{c.reviewOpen} <ForwardArrow /></a>
        </section>
      ) : first ? (
        <section aria-labelledby="ai-next" className="sk-launch-spotlight">
          <div className="min-w-0 space-y-1">
            <p id="ai-next" className="sk-eyebrow">{c.nextEyebrow}</p>
            <p className="text-xl font-bold text-ink-strong">{fillAi(c.startTitle, label(first))}</p>
            <p className="text-sm text-ink-muted">{why(first)}</p>
          </div>
          <Button type="button" className="shrink-0 gap-2" onClick={() => start(first.feature)}>{c.start} <ForwardArrow /></Button>
        </section>
      ) : null}

      {/* ── The journey ── */}
      <section id="ai-workflows" aria-label={c.nav.workflows} className="sk-ai-flow-journey">
        {STAGES.map(stage => {
          const items = features.filter(option => (AI_STAGE_OF[option.feature] ?? "understand") === stage.key);
          if (!items.length) return null;
          const StageIcon = stage.icon;
          return (
            <div key={stage.key} className="sk-launch-phase">
              <div className="space-y-0.5">
                <h3 className="sk-launch-phase-title"><span className="sk-launch-phase-icon" aria-hidden="true"><StageIcon className="size-4" /></span>{c.stages[stage.key].title}</h3>
                <p className="text-xs text-ink-muted">{c.stages[stage.key].hint}</p>
              </div>
              <ul className="sk-ai-flow-grid">
                {items.map(option => {
                  const active = option.feature === feature;
                  return (
                    <li key={option.feature} className="sk-ai-flow-card" data-active={active || undefined}>
                      <div className="min-w-0 space-y-1">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-strong">
                          {label(option)}
                          {active ? <span className="sk-choice-tag" data-tone="brand">{c.selected}</span> : null}
                        </p>
                        <p className="text-xs leading-relaxed text-ink-muted">{why(option)}</p>
                      </div>
                      <Button type="button" size="sm" variant={active ? "default" : "outline"} className="gap-1.5 justify-self-start" onClick={() => start(option.feature)}
                        aria-label={`${c.start}: ${label(option)}`}>{c.start} <ForwardArrow /></Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      {/* ── Composer ── */}
      <section id="ai-composer" aria-labelledby="ai-composer-heading" className="sk-ai-flow-composer">
        <div className="space-y-1">
          <h3 id="ai-composer-heading" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><Sparkles aria-hidden="true" className="size-5 text-primary" />{c.composerTitle}</h3>
          <p className="text-sm text-ink-muted">{c.composerHint}</p>
        </div>
        <AiActionPanel title={title} options={features} campusId={campusId} onComplete={onComplete} feature={feature} onFeatureChange={setFeature} inputId={COMPOSER_INPUT} hideTitle />
      </section>

      {/* ── Review + drafts ── */}
      <div className={review ? "sk-ai-flow-columns" : "grid gap-4"}>
        {review ? (
          <section id="ai-review" aria-labelledby="ai-review-heading" className="sk-panel space-y-3 p-4 sm:p-6">
            <div className="space-y-1">
              <h3 id="ai-review-heading" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><ClipboardCheck aria-hidden="true" className="size-5 text-primary" />{c.reviewHeading} <span className="sk-choice-tag" data-tone={review.length ? "info" : undefined}><bdi dir="ltr">{review.length}</bdi></span></h3>
              <p className="text-sm text-ink-muted">{c.reviewHelp}</p>
            </div>
            <AIReviewQueue items={review} onComplete={onComplete} />
          </section>
        ) : null}
        {drafts ?? (
          <section id="ai-drafts" aria-labelledby="ai-drafts-heading" className="sk-panel space-y-3 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <h3 id="ai-drafts-heading" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><FileText aria-hidden="true" className="size-5 text-primary" />{c.draftsHeading}</h3>
                <p className="text-sm text-ink-muted">{c.draftsHelp}</p>
              </div>
              {savedDrafts.length > 5 ? <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>{showAll ? c.showLess : fillAi(c.showAll, savedDrafts.length)}</Button> : null}
            </div>
            {shownDrafts.length ? (
              <ul className="grid gap-2">
                {shownDrafts.map(insight => (
                  <li key={insight.id} className="sk-ai-flow-draft">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-primary">{c.features[insight.feature]?.label ?? insight.feature.replaceAll("_", " ")}</p>
                    {insight.title ? <p className="text-sm font-bold text-ink-strong">{insight.title}</p> : null}
                    {insight.summary ? <p className="whitespace-pre-line text-xs leading-relaxed text-ink-muted">{insight.summary}</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="sk-ai-flow-empty">{c.draftsEmpty}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
