"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  CircleDashed,
  GraduationCap,
  Info,
  LayoutDashboard,
  ListChecks,
  Lock,
  PieChart,
  RefreshCw,
  Users,
} from "lucide-react";
import { Select as SystemSelect } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Tone = "rose" | "amber" | "teal" | "emerald";

interface HubStatNumbers {
  totalClasses: number;
  teachersAssigned: number;
  timetablesPublished: number;
  examsInProgress: number;
  publishedTimetables: number;
  periodsCount: number;
  weekendsCount: number;
  subjectsTotal: number;
  subjectsWithoutTeacher: number;
  unplacedSubjects: number;
  classesWithoutTimetable: number;
  teacherConflicts: number;
  examsTotal: number;
  examsPublished: number;
  marksEntryExams: number;
}

interface HubStats {
  academicYear: number;
  cycleStatus: string;
  cycleYear: number | null;
  availableYears: number[];
  showingNonCycleYear: boolean;
  stats: HubStatNumbers;
  actionItems: { id: string; label: string; tone: Tone; count: number }[];
  activity: { id: string; kind: string; title: string; meta?: string; term?: string; status: string; at: string }[];
}

// 700 shades keep the coloured label text at AA contrast on its 50 tint.
const TONE = {
  rose: { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", dot: "bg-rose-500" },
  amber: { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  teal: { text: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200", dot: "bg-teal-500" },
  emerald: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
};

/** Where each action item should take the user when clicked. */
const ACTION_TARGET: Record<string, string> = {
  "no-timetable": "timetable",
  unplaced: "timetable",
  conflicts: "timetable",
  "marks-due": "exam-cycles",
};

interface Step {
  id: string;
  label: string;
  /** What this step is for, in one plain sentence. */
  blurb: string;
  view: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
  /** Why it is not finished yet — shown under the step and in the CTA. */
  reason: string;
  /** Short progress note, e.g. "3 of 9 published". */
  detail?: string;
  /** True when `detail` names the thing blocking the step, so it reads as a
   *  warning rather than as progress. */
  detailBlocking?: boolean;
  /** The button wording when this step is the current one. */
  cta: string;
}

/**
 * The five things an admin actually has to do, in order. Every step reports why
 * it is unfinished so nothing on this screen is a mystery.
 *
 * Deliberately excluded: promoting students. That is a year-END action, not a
 * setup step, so it lives in its own card below and only unlocks once the year
 * is genuinely complete.
 */
function buildSteps(s: HubStatNumbers, cycleStatus: string): Step[] {
  // 1 — Set up the year
  const yearMissing: string[] = [];
  if (cycleStatus !== "ACTIVE") yearMissing.push("the year is not active yet");
  if (s.periodsCount === 0) yearMissing.push("daily periods are not defined");
  if (s.weekendsCount === 0) yearMissing.push("weekend days are not set");
  const yearDone = yearMissing.length === 0;

  // 2 — Classes and subjects
  const classesDone = s.totalClasses > 0 && s.subjectsWithoutTeacher === 0;
  const classesReason =
    s.totalClasses === 0
      ? "No classes have been created yet."
      : s.subjectsWithoutTeacher > 0
      ? `${s.subjectsWithoutTeacher} subject${s.subjectsWithoutTeacher > 1 ? "s have" : " has"} no teacher assigned.`
      : "Every class has subjects and teachers.";

  // 3 — Timetable
  const timetableDone =
    s.totalClasses > 0 && s.classesWithoutTimetable === 0 && s.teacherConflicts === 0;
  const timetableReason =
    s.totalClasses === 0
      ? "Create classes first, then build their timetables."
      : s.classesWithoutTimetable > 0
      ? `${s.classesWithoutTimetable} class${s.classesWithoutTimetable > 1 ? "es have" : " has"} no timetable yet.`
      : s.teacherConflicts > 0
      ? `${s.teacherConflicts} teacher clash${s.teacherConflicts > 1 ? "es" : ""} need resolving.`
      : "All classes have a clash-free timetable.";

  // 4 — Exams and results. Real exams only; no invented terms.
  const examsDone = s.examsTotal > 0 && s.examsInProgress === 0;
  const examsReason =
    s.examsTotal === 0
      ? "No exams have been created for this year."
      : s.examsInProgress > 0
      ? `${s.examsInProgress} exam${s.examsInProgress > 1 ? "s are" : " is"} still in progress.`
      : "All exams are finished and results are out.";

  return [
    {
      id: "year-setup",
      label: "Set Up the Year",
      blurb: "Term dates, holidays, daily periods and rooms.",
      view: "year-setup",
      icon: CalendarDays,
      done: yearDone,
      reason: yearDone
        ? "The year is active and the basics are in place."
        : `Still to do: ${yearMissing.join(", ")}.`,
      cta: "Set Up the Year",
    },
    {
      id: "classes",
      label: "Classes & Subjects",
      blurb: "Create classes, add subjects, assign teachers.",
      view: "classes",
      icon: Users,
      done: classesDone,
      reason: classesReason,
      detail: s.totalClasses > 0 ? `${s.totalClasses} class${s.totalClasses > 1 ? "es" : ""}` : undefined,
      cta: s.totalClasses === 0 ? "Create Classes" : "Assign Teachers",
    },
    {
      id: "timetable",
      label: "Class Timetable",
      blurb: "Place every subject on the weekly timetable.",
      view: "timetable",
      icon: BookOpen,
      done: timetableDone,
      reason: timetableReason,
      // Report what is actually holding the step up. Every timetable can be
      // published while clashes still block the step, and a bare
      // "7 of 7 published" then reads as finished on a card marked unfinished.
      detail:
        s.totalClasses === 0
          ? undefined
          : s.teacherConflicts > 0
          ? `${s.teacherConflicts} clash${s.teacherConflicts > 1 ? "es" : ""} to resolve`
          : `${s.publishedTimetables} of ${s.totalClasses} published`,
      detailBlocking: s.teacherConflicts > 0,
      cta: "Open Timetable",
    },
    {
      id: "exams",
      label: "Exams & Results",
      blurb: "Schedule exams, collect marks, release results.",
      view: "exam-cycles",
      icon: ListChecks,
      done: examsDone,
      reason: examsReason,
      detail: s.examsTotal > 0 ? `${s.examsPublished} of ${s.examsTotal} results released` : undefined,
      cta: s.examsTotal === 0 ? "Create an Exam" : "Open Exams",
    },
  ];
}

export function AcademicHub({ campusId, onNavigate }: { campusId?: string; onNavigate?: (view: string) => void }) {
  const [stats, setStats] = useState<HubStats | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // The overview used to fall silent when the request failed: the page drew
  // "0 of 0 steps done" and an "All caught up" panel, which reads as success.
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      if (year) params.set("year", String(year));
      const res = await fetch(`/api/academic/hub-stats?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setStats(json.data);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [campusId, year]);

  useEffect(() => {
    load();
  }, [load]);

  const steps = useMemo(
    () => (stats ? buildSteps(stats.stats, stats.cycleStatus) : []),
    [stats],
  );

  // The step the user should work on now = the first unfinished one.
  const currentIndex = steps.findIndex((s) => !s.done);
  const allDone = steps.length > 0 && currentIndex === -1;
  const currentStep = currentIndex >= 0 ? steps[currentIndex] : null;
  const doneCount = steps.filter((s) => s.done).length;

  const go = (view: string) => onNavigate?.(view);

  if (loading && !stats) {
    return (
      <SkeletonRegion label="Loading the academic overview" className="space-y-6">
        <Skeleton className="h-32 w-full rounded-[28px]" />
        <Skeleton className="h-28 w-full rounded-[28px]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} delay={i * 60} className="h-32 w-full rounded-[24px]" />
          ))}
        </div>
      </SkeletonRegion>
    );
  }

  if (!stats) {
    return (
      <ErrorState
        variant="panel"
        className="sk-panel"
        title="Could not load the academic overview"
        description="Your setup steps and year figures did not arrive. Nothing has changed; try loading them again."
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header: which year are we looking at ── */}
      <div className="sk-enter rounded-[28px] border border-edge/12 bg-gradient-to-br from-surface-subtle via-white to-brand-100 p-5 shadow-md sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-700 text-white shadow-brand">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="sk-eyebrow text-primary">
                Academic Year <span data-numeric>{stats.academicYear}</span>
              </p>
              <h2 className="text-xl font-bold tracking-tight text-ink-strong sm:text-2xl">Academic Overview</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {stats.availableYears.length > 1 ? (
              <SystemSelect
                aria-label="Academic year shown"
                value={stats.academicYear}
                onChange={(e) => setYear(Number(e.target.value))}
                className=""
              >
                {stats.availableYears.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </SystemSelect>
            ) : null}
            <Badge variant={allDone ? "success" : "secondary"} dot className="tabular-nums">
              {doneCount} of {steps.length} steps done
            </Badge>
          </div>
        </div>

        {/* Progress bar across the whole year */}
        <Progress
          className="mt-4"
          size="sm"
          tone={allDone ? "success" : "brand"}
          value={doneCount}
          max={steps.length || 1}
          label="Academic year setup progress"
          valueText={`${doneCount} of ${steps.length} steps done`}
        />

        <nav aria-label="Related academic tools" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-edge/15 pt-3">
          <Link href="/setup/readiness" className="sk-link inline-flex min-h-10 items-center text-sm font-semibold text-primary">School readiness</Link>
          <Link href="/resources" className="sk-link inline-flex min-h-10 items-center text-sm font-semibold text-primary">Learning resources</Link>
          <Link href="/curriculum" className="sk-link inline-flex min-h-10 items-center text-sm font-semibold text-primary">Objective map</Link>
          <Link href="/accommodations" className="sk-link inline-flex min-h-10 items-center text-sm font-semibold text-primary">Access plans</Link>
          <Link href="/exam-delivery" className="sk-link inline-flex min-h-10 items-center text-sm font-semibold text-primary">Exam delivery</Link>
        </nav>

        {/* Say plainly when the numbers are not from the active cycle year. */}
        {stats.showingNonCycleYear ? (
          <Alert tone="warning" icon={Info} live="off" className="mt-4" title={`Showing ${stats.academicYear}, not your active year`}>
            Your active academic year is <b>{stats.cycleYear}</b>, but nothing has been set up there
            yet. Showing <b>{stats.academicYear}</b>, which is where your classes are. Finish{" "}
            {stats.cycleYear} in <b>Set Up the Year</b> when you are ready to move over.
          </Alert>
        ) : null}

        {/* A year switch that fails keeps the last figures, and says so. */}
        {loadFailed ? (
          <Alert
            tone="danger"
            compact
            className="mt-4"
            title="Could not refresh the overview."
            actions={
              <Button type="button" variant="outline" size="sm" loading={loading} onClick={() => void load()}>
                {loading ? null : <RefreshCw aria-hidden="true" />}
                Try again
              </Button>
            }
          >
            The figures below are from the last successful load.
          </Alert>
        ) : null}
      </div>

      {/* ── The next thing to do. This is the main call to action. ── */}
      {allDone ? (
        <div className="sk-enter rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm sm:p-6" style={{ "--sk-delay": "60ms" } as React.CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </span>
              <div className="min-w-0">
                <p className="sk-eyebrow text-emerald-700">
                  Year Complete
                </p>
                <h3 className="text-lg font-bold text-ink-strong">Everything is set up</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                  Results are out. You can now move students into next year.
                </p>
              </div>
            </div>
            <Button variant="default"
              onClick={() => go("promote-archive")}
              className="sk-nudge-trigger w-full px-5 sm:w-auto"
            >
              <GraduationCap aria-hidden="true" className="h-4 w-4" />
              Promote Students
              <ArrowRight aria-hidden="true" className="sk-nudge h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      ) : currentStep ? (
        <Card variant="featured" className="sk-enter p-5 sm:p-6" style={{ "--sk-delay": "60ms" } as React.CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-700 text-white shadow-brand">
                <currentStep.icon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="sk-eyebrow text-primary">
                  Next Step · <span data-numeric>{currentIndex + 1} of {steps.length}</span>
                </p>
                <h3 className="text-lg font-bold text-ink-strong">{currentStep.label}</h3>
                <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-ink-muted">
                  {currentStep.reason}
                </p>
              </div>
            </div>
            <Button variant="default"
              onClick={() => go(currentStep.view)}
              className="sk-nudge-trigger w-full px-5 sm:w-auto"
            >
              {currentStep.cta}
              <ArrowRight aria-hidden="true" className="sk-nudge h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ── Step tracker ── */}
      <section aria-labelledby="academic-hub-steps" className="sk-panel sk-enter p-5 sm:p-6" style={{ "--sk-delay": "120ms" } as React.CSSProperties}>
        <div className="mb-4 flex items-center gap-1">
          <h3 id="academic-hub-steps" className="text-base font-bold text-ink-strong">
            Your Year at a Glance
          </h3>
          <InfoTip content="A step is done when its checks pass for the year shown. The first unfinished step is the one to work on next." label="How steps are marked done" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => {
            const isCurrent = i === currentIndex;
            const Icon = s.icon;
            return (
              <Button aria-pressed={isCurrent} variant="choice"
                key={s.id}
                onClick={() => go(s.view)}
                className="group h-full w-full flex-col items-start justify-start gap-2 p-4 text-start"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "sk-icon-tile flex h-9 w-9 items-center justify-center rounded-xl",
                      s.done
                        ? "bg-emerald-100 text-emerald-600"
                        : isCurrent
                          ? "bg-primary text-white"
                          : "bg-muted text-ink-muted",
                    )}
                  >
                    {s.done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="sk-eyebrow">
                    Step <span data-numeric>{i + 1}</span>
                  </span>
                </span>
                <span className="block text-sm font-bold text-ink-strong">{s.label}</span>
                <span className="block text-xs font-normal leading-relaxed text-ink-muted">{s.blurb}</span>
                {s.done ? <span className="sr-only">Done.</span> : null}
                {s.detail ? (
                  <Badge
                    size="sm"
                    dot
                    variant={s.done ? "success" : s.detailBlocking ? "warning" : "secondary"}
                    className="tabular-nums"
                  >
                    {s.detail}
                  </Badge>
                ) : null}
              </Button>
            );
          })}
        </div>

        {/* Year-end sits outside the step list — it is not part of setup. */}
        <div
          className={cn(
            "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
            allDone ? "border-emerald-200 bg-emerald-50/50" : "border-dashed border-edge/30 bg-surface-subtle",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                allDone ? "bg-emerald-100 text-emerald-600" : "bg-muted text-ink-subtle",
              )}
            >
              {allDone ? <GraduationCap className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-strong">At the end of the year</p>
              <p id="academic-hub-promote-reason" className="text-xs leading-relaxed text-ink-muted">
                {allDone
                  ? "Ready — move students into their next class."
                  : "Promoting students unlocks once results are released."}
              </p>
            </div>
          </div>
          <Button variant="default"
            size="sm"
            disabled={!allDone}
            aria-describedby="academic-hub-promote-reason"
            onClick={() => go("promote-archive")}
            className="px-4"
          >
            Promote Students
          </Button>
        </div>
      </section>

      {/* ── Quick stats ── */}
      <div className="sk-stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Classes" value={stats.stats.totalClasses} tone="teal" info="Active classes in the academic year shown." />
        <StatCard icon={GraduationCap} label="Teachers Assigned" value={stats.stats.teachersAssigned} tone="teal" info="Teachers at this campus who teach at least one subject." />
        <StatCard icon={BookOpen} label="Timetables Published" value={stats.stats.publishedTimetables} tone="emerald" info="Classes with a published timetable in the academic year shown." />
        <StatCard icon={PieChart} label="Exams In Progress" value={stats.stats.examsInProgress} tone="amber" info="Exams this year that are running, collecting marks or waiting for review." />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Needs attention ── */}
        <section aria-labelledby="academic-hub-attention" className="sk-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-500" />
            <h3 id="academic-hub-attention" className="text-base font-bold text-ink-strong">
              Needs Your Attention
            </h3>
          </div>
          {stats.actionItems.length > 0 ? (
            <div className="space-y-3">
              {stats.actionItems.map((a) => {
                const t = TONE[a.tone];
                return (
                  <Button variant="outline"
                    key={a.id}
                    onClick={() => go(ACTION_TARGET[a.id] || "timetable")}
                    className={cn("sk-nudge-trigger w-full justify-between gap-3 px-4 py-3 text-start", t.border, t.bg)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", t.dot)} />
                      <span className={cn("min-w-0 text-sm font-semibold", t.text)}>{a.label}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className={cn("sk-nudge h-4 w-4 rtl:rotate-180", t.text)} />
                  </Button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              size="sm"
              icon={CheckCircle2}
              title="All caught up"
              description="Nothing needs fixing right now."
            />
          )}
        </section>

        {/* ── Recent activity ── */}
        <section aria-labelledby="academic-hub-activity" className="sk-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock aria-hidden="true" className="h-4 w-4 text-primary" />
            <h3 id="academic-hub-activity" className="text-base font-bold text-ink-strong">
              Recent Activity
            </h3>
          </div>
          {stats.activity.length > 0 ? (
            <div className="space-y-2">
              {stats.activity.map((a) => (
                <Button variant="outline"
                  key={a.id}
                  onClick={() => go(a.kind === "exam" ? "exam-cycles" : "timetable")}
                  className="sk-nudge-trigger w-full justify-between gap-3 px-4 py-3 text-start"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        a.kind === "exam" ? "bg-amber-50 text-amber-600" : "bg-brand-100 text-primary",
                      )}
                    >
                      {a.kind === "exam" ? <ListChecks className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-strong">{a.title}</span>
                      <span className="block truncate text-xs font-normal text-ink-subtle">
                        {[a.term, a.meta].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="sk-nudge h-4 w-4 text-ink-faint rtl:rotate-180" />
                </Button>
              ))}
            </div>
          ) : (
            <EmptyState
              size="sm"
              icon={CircleDashed}
              title="No recent activity yet"
              description="The latest exams and class timetables for this year will be listed here."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => go("timetable")}>
                  Open Timetable
                </Button>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  info,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: keyof typeof TONE;
  /** What the number counts, shown behind an (i) beside the label. */
  info?: string;
}) {
  const t = TONE[tone];
  return (
    <div className="sk-panel min-w-0 p-4 sm:p-5">
      <div aria-hidden="true" className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", t.bg)}>
        <Icon className={cn("h-5 w-5", t.text)} />
      </div>
      <p data-numeric className="mt-3 text-2xl font-bold tracking-tight text-ink-strong tabular-nums sm:text-3xl">{value}</p>
      <div className="mt-1 flex min-w-0 items-center gap-0.5">
        <p className="min-w-0 text-xs font-semibold text-ink-muted">{label}</p>
        {info ? <InfoTip content={info} label={`About ${label}`} className="-my-1" /> : null}
      </div>
    </div>
  );
}
