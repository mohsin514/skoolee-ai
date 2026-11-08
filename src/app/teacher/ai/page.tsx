"use client";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, FieldAction } from "@/components/ui/input-group";
import { useMemo, useState } from "react";
import {
  BrainCircuit, ChevronDown, ClipboardCheck, Copy,
  Lightbulb, Network, Search, Sparkles, Wand2, X,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { AiWorkflowsHome, AI_COMPOSER_INPUT_ID } from "@/components/ai-workflows/AiWorkflowsHome";
import { AISkeleton, TeacherErrorState, useTeacherData } from "@/components/teacher/teacher-components";
import { cn } from "@/lib/utils";
import { Input as SystemInput } from "@/components/ui/input";
import { useUiText } from "@/components/locale/LocaleProvider";
import { QuestionNetwork } from "@/components/question-network/question-network";

/**
 * The teacher's AI workspace.
 *
 * The previous version stacked eight to ten absolutely-positioned blur layers
 * on every card — two ambient orbs, a hover wash, a radial overlay, a hairline
 * gradient and a blurred halo behind each icon, repeated per card and again per
 * insight row. It read as expensive rather than considered, and it pushed the
 * actual content into a 360px column where every insight was clipped at three
 * lines with no way to read the rest.
 *
 * The direction here: keep the AI identity — the purple gradient, the one dark
 * surface, the sparkles — but carry depth with a single ambient wash per card,
 * and spend the reclaimed room on the insights themselves, which are the only
 * thing on this screen a teacher actually came for.
 */

const FEATURE_LABELS: Record<string, string> = {
  weak_topics: "Weak topics",
  homework_suggestions: "Homework",
  lesson_plan: "Lesson plan",
  rewrite_remark: "Rewritten remark",
  translate_remark: "Translation",
  generate_remarks: "Remarks",
};

function featureLabel(feature?: string) {
  if (!feature) return "Insight";
  return FEATURE_LABELS[feature] || feature.replaceAll("_", " ");
}

/** "3 days ago" beats a raw timestamp for judging whether a draft is stale. */
function relativeTime(ui: ReturnType<typeof useUiText>, value?: string | Date | null) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return ui("just now");
  if (mins < 60) return ui("{0} min ago", [mins]);
  const hours = Math.round(mins / 60);
  if (hours < 24) return ui("{0} hours ago", [hours]);
  const days = Math.round(hours / 24);
  if (days < 30) return ui("{0} days ago", [days]);
  return new Date(value).toLocaleDateString(document.documentElement.lang || undefined, { day: "numeric", month: "short" });
}

export default function AIPage() {
  const ui = useUiText();
  const canExamStudio = useConsoleAccess().leafVisible("teacher", "exam-studio");
  const { data, loading, error, loadData } = useTeacherData();
  const [showNetwork, setShowNetwork] = useState(false);
  const [query, setQuery] = useState("");
  const [featureFilter, setFeatureFilter] = useState("");

  const classHubs = data?.classHubs || [];
  const teacherSubjects = data?.subjects || [];
  const aiCampusId = teacherSubjects[0]?.campusId || classHubs[0]?.campusId;
  const insights: any[] = useMemo(() => data?.aiInsights || [], [data]);

  const features = useMemo(
    () => [...new Set(insights.map((i) => i.feature).filter(Boolean))],
    [insights],
  );

  const visibleInsights = useMemo(() => {
    const q = query.trim().toLowerCase();
    return insights.filter((insight) => {
      if (featureFilter && insight.feature !== featureFilter) return false;
      if (!q) return true;
      return `${insight.title || ""} ${insight.summary || ""}`.toLowerCase().includes(q);
    });
  }, [insights, query, featureFilter]);

  const teacherAIFeatures = [
    { feature: "weak_topics", label: ui("Weak topics"), placeholder: ui("Subject or exam context") },
    { feature: "homework_suggestions", label: ui("Homework"), placeholder: ui("Pupil group or weak area") },
    { feature: "lesson_plan", label: ui("Lesson plan"), field: "topic" as const, placeholder: ui("Topic, class, duration") },
    { feature: "rewrite_remark", label: ui("Rewrite remark"), placeholder: ui("Paste remark draft") },
    { feature: "translate_remark", label: ui("Translate"), placeholder: ui("Paste remark text") },
  ];

  if (loading && !data) return <AISkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={loadData} />;

  const draftsSection = (
        <section id="ai-drafts" className="sk-panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-edge/12 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                <Lightbulb className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">{ui("Saved AI drafts")}</h2>
                <p aria-live="polite" className="text-xs tabular-nums text-ink-subtle">
                  {ui("{0} total", [insights.length])}{featureFilter || query ? ` · ${ui("{0} shown", [visibleInsights.length])}` : ""}
                </p>
              </div>
            </div>

            {insights.length > 0 ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:ms-auto sm:w-auto">
                <InputGroup surfaceClassName="bg-card" className="w-full sm:w-auto sm:min-w-[220px]">
                  <Search data-field-affix="start" aria-hidden="true" className="pointer-events-none size-4 text-ink-subtle" />
                  <SystemInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={ui("Search drafts…")}
                    aria-label={ui("Search saved AI drafts")}
                    className={"w-full"}
                  />
                  {query ? (
                    <FieldAction data-field-affix="end" type="button" onClick={() => setQuery("")} label={ui("Clear draft search")}>
                      <X aria-hidden="true" />
                    </FieldAction>
                  ) : null}
                </InputGroup>
                {features.length > 1 ? (
                  <div role="group" aria-label={ui("Filter drafts by kind")} className="flex flex-wrap gap-1.5">
                    {["", ...features].map((f) => (
                      <Button variant="choice" size="sm"
                        key={f || "all"}
                        type="button"
                        onClick={() => setFeatureFilter(f)}
                        aria-pressed={featureFilter === f}
                      >
                        {f ? ui(featureLabel(f)) : ui("All")}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {visibleInsights.length ? (
            <ul className="sk-fade-in divide-y divide-muted">
              {visibleInsights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </ul>
          ) : insights.length ? (
            <EmptyState
              size="sm"
              icon={Search}
              title={ui("No draft matches that")}
              description={ui("Try a different word, or clear the filters to see every saved draft.")}
              action={
                <Button variant="secondary" type="button" onClick={() => { setQuery(""); setFeatureFilter(""); }}>
                  <X aria-hidden="true" /> {ui("Clear filters")}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Lightbulb}
              title={ui("No drafts yet")}
              description={ui("Pick an action above and run it. Every draft is saved here so you can come back to it, copy it, and edit it before it goes anywhere.")}
            />
          )}
        </section>
  );

  // §4.4b (as admin/principal · AI assistant): the one primary is "New request", which focuses the composer; the
  // assistant's hero drops its own title (the PageHeader carries it) and demotes its spotlight to an outline control.
  // Exam Studio — the teacher's flagship (addendum 2026-10-22) — is one tap away as the header's secondary; its
  // promotional card lives on Today, so this screen keeps exactly one primary action.
  const focusComposer = () => {
    const field = document.getElementById(AI_COMPOSER_INPUT_ID);
    field?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    field?.focus({ preventScroll: true });
  };

  return (
    <TeacherPage
      icon={BrainCircuit}
      title="AI assistant"
      description="Draft weak-topic notes, homework, lesson plans and remarks. Nothing reaches families until you use it."
      primaryAction={{ id: "new-ai-request", label: "New request", icon: Sparkles, onClick: focusComposer }}
      secondaryActions={canExamStudio ? [{ id: "open-exam-studio", label: "Open Exam Studio", icon: Wand2, href: "/ai/studio" }] : undefined}
    >
      <AiWorkflowsHome
        title="AI assistant"
        hideHeading
        features={teacherAIFeatures}
        insights={insights}
        campusId={aiCampusId}
        canReview={false}
        onComplete={loadData}
        drafts={draftsSection}
      />
      {/* M68: the cross-school question network, opened from here rather than on the daily test board. */}
      <section aria-labelledby="question-network-card" className="sk-panel mt-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-primary"><Network className="size-5" /></span>
            <div className="min-w-0">
              <h2 id="question-network-card" className="text-base font-bold text-ink-strong">{ui("Shared question network")}</h2>
              <p className="text-sm text-ink-muted">{ui("Borrow reviewed questions from other schools or offer yours; your academic lead approves what is shared.")}</p>
            </div>
          </div>
          <Button variant="outline" type="button" aria-expanded={showNetwork} onClick={() => setShowNetwork((v) => !v)}>
            {showNetwork ? ui("Hide the question network") : ui("Open the question network")}
          </Button>
        </div>
        {showNetwork ? <div className="mt-4"><QuestionNetwork /></div> : null}
      </section>
    </TeacherPage>
  );
}

/**
 * One saved draft.
 *
 * The old list clipped every summary at three lines with no way to open it, so
 * a lesson plan the assistant had written was effectively write-only.
 */
function InsightRow({ insight }: { insight: any }) {
  const ui = useUiText();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = insight.summary || "";
  const when = relativeTime(ui, insight.createdAt);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${insight.title ? `${insight.title}\n\n` : ""}${body}`);
      setCopied(true);
      toast.success(ui("Draft copied. Paste it wherever you need it."));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(ui("Your browser blocked clipboard access — select the text and copy it manually."));
    }
  };

  return (
    <li className="group transition-colors hover:bg-surface-hover">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span aria-hidden="true" className="sk-icon-tile mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary min-[400px]:flex">
          <Sparkles className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" size="sm">
              {ui(featureLabel(insight.feature))}
            </Badge>
            {insight.approvalStatus === "APPROVED" ? (
              <Badge variant="success" size="sm" dot>
                {ui("Approved")}
              </Badge>
            ) : insight.approvalStatus === "REJECTED" ? (
              <Badge variant="danger" size="sm" dot>
                {ui("Rejected")}
              </Badge>
            ) : null}
            {when ? (
              <span className="text-xs text-ink-subtle">{when}</span>
            ) : null}
          </div>

          {/* `title` was selected by the server and then never rendered — the
              row led with the summary and dropped the headline entirely. */}
          {insight.title ? (
            <p className="break-words text-sm font-semibold leading-snug text-ink-strong">{insight.title}</p>
          ) : null}
          <p className={cn(
            "mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed text-ink-muted",
            !open && "line-clamp-2",
          )}>
            {body}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton variant="secondary"
            onClick={copy}
            label={ui("Copy the {0} draft", [ui(featureLabel(insight.feature))])}
            tooltip={copied ? ui("Copied") : ui("Copy this draft")}
          >
            {copied ? <ClipboardCheck aria-hidden="true" className="text-status-success-text" /> : <Copy aria-hidden="true" />}
          </IconButton>
          <IconButton variant="secondary"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            label={open ? ui("Collapse this draft") : ui("Read the full draft")}
            tooltip={open ? ui("Collapse") : ui("Read the full draft")}
          >
            <ChevronDown aria-hidden="true" className={cn("transition-transform duration-200", open && "rotate-180")} />
          </IconButton>
        </div>
      </div>
    </li>
  );
}
