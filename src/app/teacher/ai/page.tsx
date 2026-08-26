"use client";

import { useMemo, useState } from "react";
import {
  BarChart3, BookOpen, Bot, BrainCircuit, ChevronDown, ClipboardCheck, Copy,
  GraduationCap, Lightbulb, Search, Sparkles, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { StatTiles } from "@/components/shared-admin/workspace";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { AiActionPanel } from "@/components/role-dashboard";
import { AISkeleton, TeacherErrorState, useTeacherData } from "@/components/teacher/teacher-components";
import { CornerSparkles } from "@/components/CornerSparkles";
import { cn } from "@/lib/utils";

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
          <section className="group relative overflow-hidden rounded-[28px] border border-[#8127cf]/10 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]">
            {/* One wash, not six. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#8127cf]/[0.07] blur-3xl"
            />
            <CornerSparkles />
            <div className="relative p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#b876f0] text-white shadow-[0_8px_20px_-6px_rgba(129,39,207,0.6)]">
                  <Bot className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-black tracking-tight text-[#1d1b20]">AI Assistant</h2>
                  <p className="text-[11px] font-semibold text-ink-subtle">
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
          <aside className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1f1a23] via-[#2d2433] to-[#1f1a23] p-5 text-white shadow-[0_12px_32px_-12px_rgba(31,26,35,0.6)]">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#8127cf]/25 blur-3xl"
            />
            <CornerSparkles color="#c084fc" />
            <div className="relative">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
                  <Sparkles className="h-3.5 w-3.5 text-[#c084fc]" />
                </span>
                <p className="text-[11px] font-black uppercase tracking-wider text-white/60">What it can do</p>
              </div>
              <ul className="space-y-2.5">
                {[
                  ["Weak topics", "Where a class is losing marks, from your entered results"],
                  ["Homework", "Practice suggestions aimed at a weak area"],
                  ["Lesson plan", "A structured plan for one topic and period length"],
                  ["Rewrite remark", "Turns a blunt note into report-card language"],
                  ["Translate", "An English remark rendered into Urdu"],
                ].map(([label, what]) => (
                  <li key={label} className="rounded-xl bg-white/[0.06] px-3 py-2.5 transition-colors hover:bg-white/[0.11]">
                    <p className="text-[12px] font-black text-white">{label}</p>
                    <p className="mt-0.5 text-[11px] font-semibold leading-snug text-white/50">{what}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-xl bg-white/[0.06] px-3 py-2.5 text-[11px] font-semibold leading-snug text-white/55">
                Student names are never sent to the model — drafts are written from
                pseudonymised data and always need your review.
              </p>
            </div>
          </aside>
        </div>

        {/* ── Saved drafts ── */}
        <section className="overflow-hidden rounded-[24px] border border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#cfc2d6]/12 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf]">
                <Lightbulb className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black tracking-tight text-[#1d1b20]">Saved AI drafts</h2>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                  {insights.length} total{featureFilter || query ? ` · ${visibleInsights.length} shown` : ""}
                </p>
              </div>
            </div>

            {insights.length > 0 ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search drafts…"
                    aria-label="Search saved AI drafts"
                    className="h-9 w-full rounded-xl border border-[#cfc2d6]/25 bg-white pl-9 pr-8 text-xs font-semibold text-[#1d1b20] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/35 focus:ring-4 focus:ring-[#8127cf]/12"
                  />
                  {query ? (
                    <button type="button" onClick={() => setQuery("")} aria-label="Clear draft search"
                      className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]">
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
                {features.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {["", ...features].map((f) => (
                      <button
                        key={f || "all"}
                        type="button"
                        onClick={() => setFeatureFilter(f)}
                        aria-pressed={featureFilter === f}
                        className={cn(
                          "h-8 cursor-pointer rounded-full border px-3 text-[10px] font-black uppercase tracking-wider transition-all active:scale-[0.96]",
                          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25",
                          featureFilter === f
                            ? "border-[#8127cf] bg-[#8127cf] text-white"
                            : "border-[#cfc2d6]/30 bg-white text-ink-muted hover:border-[#8127cf]/25 hover:text-[#8127cf]",
                        )}
                      >
                        {f ? featureLabel(f) : "All"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {visibleInsights.length ? (
            <ul className="divide-y divide-[#f3f4f9]">
              {visibleInsights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </ul>
          ) : insights.length ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm font-bold text-[#1d1b20]">No draft matches that</p>
              <button type="button" onClick={() => { setQuery(""); setFeatureFilter(""); }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#fbf0fe] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#f3eeff] active:scale-[0.97]">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
                <Lightbulb className="h-7 w-7" />
              </span>
              <h3 className="mt-2 text-base font-black text-[#1d1b20]">No drafts yet</h3>
              <p className="max-w-md text-sm font-semibold leading-relaxed text-ink-muted">
                Pick an action above and run it. Every draft is saved here so you can come
                back to it, copy it, and edit it before it goes anywhere.
              </p>
            </div>
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
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Your browser blocked clipboard access — select the text and copy it manually.");
    }
  };

  return (
    <li className="group transition-colors hover:bg-[#fbf0fe]/20">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf]">
          <Sparkles className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#fbf0fe] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
              {featureLabel(insight.feature)}
            </span>
            {insight.approvalStatus === "APPROVED" ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                Approved
              </span>
            ) : insight.approvalStatus === "REJECTED" ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-700">
                Rejected
              </span>
            ) : null}
            {when ? (
              <span className="text-[10px] font-semibold text-ink-subtle">{when}</span>
            ) : null}
          </div>

          {/* `title` was selected by the server and then never rendered — the
              row led with the summary and dropped the headline entirely. */}
          {insight.title ? (
            <p className="text-sm font-black leading-snug text-[#1d1b20]">{insight.title}</p>
          ) : null}
          <p className={cn(
            "mt-0.5 whitespace-pre-line text-[12px] font-semibold leading-relaxed text-ink-muted",
            !open && "line-clamp-2",
          )}>
            {body}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={copy}
            title="Copy this draft"
            aria-label={`Copy the ${featureLabel(insight.feature)} draft`}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
          >
            {copied ? <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title={open ? "Collapse" : "Read the full draft"}
            aria-label={open ? "Collapse this draft" : "Read the full draft"}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
          </button>
        </div>
      </div>
    </li>
  );
}
