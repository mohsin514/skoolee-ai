"use client";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, FieldAction } from "@/components/ui/input-group";
import { useMemo, useState, type CSSProperties } from "react";
import {
  BarChart3, BookOpen, Bot, BrainCircuit, ChevronDown, ClipboardCheck, Copy,
  GraduationCap, Lightbulb, Search, Sparkles, Users, X,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { StatTiles } from "@/components/shared-admin/workspace";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { AiActionPanel } from "@/components/role-dashboard";
import { AISkeleton, TeacherErrorState, useTeacherData } from "@/components/teacher/teacher-components";
import { CornerSparkles } from "@/components/CornerSparkles";
import { cn } from "@/lib/utils";
import { Input as SystemInput } from "@/components/ui/input";

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
function relativeTime(value?: string | Date | null) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function AIPage() {
  const { data, loading, error, loadData } = useTeacherData();
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
    { feature: "weak_topics", label: "Weak Topics", placeholder: "Subject or exam context" },
    { feature: "homework_suggestions", label: "Homework", placeholder: "Student group or weak area" },
    { feature: "lesson_plan", label: "Lesson Plan", field: "topic" as const, placeholder: "Topic, class, duration" },
    { feature: "rewrite_remark", label: "Rewrite Remark", placeholder: "Paste remark draft" },
    { feature: "translate_remark", label: "Translate", placeholder: "Paste remark text" },
  ];

  if (loading && !data) return <AISkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={loadData} />;

  return (
    <TeacherPage
      tone="ai"
      icon={BrainCircuit}
      eyebrow="Teaching Assistant"
      title="AI Insights & Tools"
      summary={
        insights.length
          ? `${insights.length} draft${insights.length === 1 ? "" : "s"} saved · weak topics, homework, lesson plans and remarks`
          : "Weak topics, homework suggestions, lesson plans and remark generation"
      }
    >
      <div className="space-y-3">
        {/* The tiles double as navigation, the same as on every other teacher
            screen — the old dark "Academic Capacity" card restated three of
            these four numbers immediately beside them. */}
        <StatTiles
          tiles={[
            { key: "subjects", icon: BookOpen, label: "Subjects", value: teacherSubjects.length, hint: "Assigned", tone: "violet" },
            { key: "classes", icon: GraduationCap, label: "Classes", value: classHubs.length, hint: classHubs.length === 1 ? "1 class hub" : `${classHubs.length} class hubs`, tone: "emerald" },
            { key: "exams", icon: BarChart3, label: "Active exams", value: (data.activeExams || []).length, hint: "In progress", tone: "teal" },
            { key: "students", icon: Users, label: "Students", value: data.totalStudents || 0, hint: "Enrolled", tone: "rose" },
          ]}
        />

        {/* ── The tool itself ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
          <section className="sk-panel sk-enter group relative min-w-0 overflow-hidden border-primary/10 transition-all duration-300">
            {/* One wash, not six. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/[0.07] blur-3xl"
            />
            <CornerSparkles />
            <div className="relative p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <span aria-hidden="true" className="sk-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-300 text-white shadow-brand">
                  <Bot className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-bold tracking-tight text-ink-strong">AI Assistant</h2>
                  <p className="text-xs leading-relaxed text-ink-subtle">
                    Drafts are saved below — nothing is sent to a guardian automatically.
                  </p>
                </div>
              </div>
              <AiActionPanel
                title="Teacher AI"
                options={teacherAIFeatures}
                campusId={aiCampusId}
                onComplete={loadData}
              />
            </div>
          </section>

          {/* ── What the assistant is good for ──
              The dark panel used to be four repeated stat numbers. A teacher
              opening this screen for the first time has no idea what any of
              the five actions actually produce; that is the gap worth
              filling. */}
          <aside className="sk-enter relative overflow-hidden rounded-[28px] bg-gradient-to-br from-ink-strong via-[#2d2433] to-ink-strong p-5 text-white shadow-xl" style={{ "--sk-delay": "80ms" } as CSSProperties}>
            <span
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/25 blur-3xl"
            />
            <CornerSparkles color="#c084fc" />
            <div className="relative">
              <div className="mb-4 flex items-center gap-2">
                <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
                  <Sparkles className="h-3.5 w-3.5 text-brand-300" />
                </span>
                <h2 className="text-2xs font-semibold uppercase tracking-wider text-white/70">What it can do</h2>
              </div>
              <ul className="space-y-2.5">
                {[
                  ["Weak topics", "Where a class is losing marks, from your entered results"],
                  ["Homework", "Practice suggestions aimed at a weak area"],
                  ["Lesson plan", "A structured plan for one topic and period length"],
                  ["Rewrite remark", "Turns a blunt note into report-card language"],
                  ["Translate", "An English remark rendered into Urdu"],
                ].map(([label, what]) => (
                  <li key={label} className="rounded-xl bg-white/[0.06] px-3 py-2.5">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/70">{what}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-xs leading-relaxed text-white/75">
                Student names are never sent to the model — drafts are written from
                pseudonymised data and always need your review.
              </p>
            </div>
          </aside>
        </div>

        {/* ── Saved drafts ── */}
        <section className="sk-panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-edge/12 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                <Lightbulb className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold tracking-tight text-ink-strong">Saved AI drafts</h2>
                <p aria-live="polite" className="text-xs tabular-nums text-ink-subtle">
                  {insights.length} total{featureFilter || query ? ` · ${visibleInsights.length} shown` : ""}
                </p>
              </div>
            </div>

            {insights.length > 0 ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:ms-auto sm:w-auto">
                <InputGroup surfaceClassName="bg-white" className="w-full sm:w-auto sm:min-w-[220px]">
                  <Search data-field-affix="start" aria-hidden="true" className="pointer-events-none size-4 text-ink-subtle" />
                  <SystemInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search drafts…"
                    aria-label="Search saved AI drafts"
                    className={"w-full"}
                  />
                  {query ? (
                    <FieldAction data-field-affix="end" type="button" onClick={() => setQuery("")} label="Clear draft search">
                      <X aria-hidden="true" />
                    </FieldAction>
                  ) : null}
                </InputGroup>
                {features.length > 1 ? (
                  <div role="group" aria-label="Filter drafts by kind" className="flex flex-wrap gap-1.5">
                    {["", ...features].map((f) => (
                      <Button variant="choice" size="sm"
                        key={f || "all"}
                        type="button"
                        onClick={() => setFeatureFilter(f)}
                        aria-pressed={featureFilter === f}
                      >
                        {f ? featureLabel(f) : "All"}
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
              title="No draft matches that"
              description="Try a different word, or clear the filters to see every saved draft."
              action={
                <Button variant="secondary" type="button" onClick={() => { setQuery(""); setFeatureFilter(""); }}>
                  <X aria-hidden="true" /> Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="No drafts yet"
              description="Pick an action above and run it. Every draft is saved here so you can come back to it, copy it, and edit it before it goes anywhere."
            />
          )}
        </section>
      </div>
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
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = insight.summary || "";
  const when = relativeTime(insight.createdAt);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${insight.title ? `${insight.title}\n\n` : ""}${body}`);
      setCopied(true);
      toast.success("Draft copied. Paste it wherever you need it.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Your browser blocked clipboard access — select the text and copy it manually.");
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
              {featureLabel(insight.feature)}
            </Badge>
            {insight.approvalStatus === "APPROVED" ? (
              <Badge variant="success" size="sm" dot>
                Approved
              </Badge>
            ) : insight.approvalStatus === "REJECTED" ? (
              <Badge variant="danger" size="sm" dot>
                Rejected
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
            label={`Copy the ${featureLabel(insight.feature)} draft`}
            tooltip={copied ? "Copied" : "Copy this draft"}
          >
            {copied ? <ClipboardCheck aria-hidden="true" className="text-emerald-600" /> : <Copy aria-hidden="true" />}
          </IconButton>
          <IconButton variant="secondary"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            label={open ? "Collapse this draft" : "Read the full draft"}
            tooltip={open ? "Collapse" : "Read the full draft"}
          >
            <ChevronDown aria-hidden="true" className={cn("transition-transform duration-200", open && "rotate-180")} />
          </IconButton>
        </div>
      </div>
    </li>
  );
}
