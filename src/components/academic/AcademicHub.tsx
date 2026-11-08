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
  ListChecks,
  Lock,
  PieChart,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";
import { Select as SystemSelect } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Progress } from "@/components/ui/progress";
import { DeskPill, DeskRowButton, DeskRowIcon, DeskStats, RelativeTime, StatTile, deskRow, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/academic/exam-permissions";
import { ScenarioPlanner } from "@/components/planning/scenario-planner";

type Tone = "rose" | "amber" | "teal" | "emerald";
type Ui = (source: string, values?: unknown[]) => string;

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

/** Status tokens (R10): the server's tone names map onto the shared status scale. */
const ATTENTION_TONE: Record<Tone, DeskTone> = { rose: "danger", amber: "warning", teal: "info", emerald: "success" };
/** Blocking items (rose) first, then warnings, then the informational ones. */
const ATTENTION_RANK: Record<Tone, number> = { rose: 0, amber: 1, teal: 2, emerald: 3 };

/** Where each action item should take the user when clicked. */
const ACTION_TARGET: Record<string, string> = {
  "no-timetable": "timetable",
  unplaced: "timetable",
  conflicts: "timetable",
  "marks-due": "exam-cycles",
};

/** The academic lead's views (§3 registry: visible to a campus admin only while no principal is appointed). */
const LEAD_VIEWS = new Set(["timetable", "exam-cycles"]);

/** Action-item copy is built here from the item's id and count, so it is translated (R11). */
const ACTION_COPY: Record<string, [one: string, many: string]> = {
  "no-timetable": ["{0} class has no timetable", "{0} classes have no timetable"],
  "marks-due": ["{0} exam waiting for marks", "{0} exams waiting for marks"],
  conflicts: ["{0} teacher conflict to resolve", "{0} teacher conflicts to resolve"],
  unplaced: ["{0} subject not scheduled", "{0} subjects not scheduled"],
};

const TIMETABLE_STATUS: Record<string, string> = { DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" };

const plural = (ui: Ui, count: number, one: string, many: string) => ui(count === 1 ? one : many, [count]);

interface Step {
  id: string;
  label: string;
  /** What this step is for, in one plain sentence. */
  blurb: string;
  /** The campus-console view that does this step; null when another seat owns it (no navigation). */
  view: string | null;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
  /** Why it is not finished yet — shown under the step and in the CTA. */
  reason: string;
  /** Short progress note, e.g. "3 of 9 published". */
  detail?: string;
  /** True when `detail` names the thing blocking the step, so it reads as a
   *  warning rather than as progress. */
  detailBlocking?: boolean;
  /** The button wording when this step is the current one (null when someone else does it). */
  cta: string | null;
  /** Who does this step when it is not the viewer (the academic lead's steps for a campus admin with a principal). */
  owner?: string;
}

/**
 * The four things a campus has to set up, in order. Every step reports why it is unfinished so nothing on
 * this screen is a mystery.
 *
 * Deliberately excluded: promoting students. That is a year-END action, not a setup step, so it lives in its
 * own card below and only unlocks once the year is genuinely complete.
 *
 * `lead` (the `academicLead` capability): the timetable and exams steps are the academic lead's (§2.3 #57,
 * #58). A campus admin with a principal sees their progress but no button to views the registry hides.
 */
function buildSteps(s: HubStatNumbers, cycleStatus: string, lead: boolean, ui: Ui, list: (items: string[]) => string): Step[] {
  // 1 — Set up the year
  const yearMissing: string[] = [];
  if (cycleStatus !== "ACTIVE") yearMissing.push(ui("the year is not active yet"));
  if (s.periodsCount === 0) yearMissing.push(ui("daily periods are not defined"));
  if (s.weekendsCount === 0) yearMissing.push(ui("weekend days are not set"));
  const yearDone = yearMissing.length === 0;

  // 2 — Classes and subjects
  const classesDone = s.totalClasses > 0 && s.subjectsWithoutTeacher === 0;
  const classesReason =
    s.totalClasses === 0
      ? ui("No classes have been created yet.")
      : s.subjectsWithoutTeacher > 0
        ? plural(ui, s.subjectsWithoutTeacher, "{0} subject has no teacher assigned.", "{0} subjects have no teacher assigned.")
        : ui("Every class has subjects and teachers.");

  // 3 — Timetable
  const timetableDone = s.totalClasses > 0 && s.classesWithoutTimetable === 0 && s.teacherConflicts === 0;
  const timetableReason =
    s.totalClasses === 0
      ? ui("Create classes first, then build their timetables.")
      : s.classesWithoutTimetable > 0
        ? plural(ui, s.classesWithoutTimetable, "{0} class has no timetable yet.", "{0} classes have no timetable yet.")
        : s.teacherConflicts > 0
          ? plural(ui, s.teacherConflicts, "{0} teacher clash needs resolving.", "{0} teacher clashes need resolving.")
          : ui("All classes have a clash-free timetable.");

  // 4 — Exams and results. Real exams only; no invented terms.
  const examsDone = s.examsTotal > 0 && s.examsInProgress === 0;
  const examsReason =
    s.examsTotal === 0
      ? ui("No exams have been created for this year.")
      : s.examsInProgress > 0
        ? plural(ui, s.examsInProgress, "{0} exam is still in progress.", "{0} exams are still in progress.")
        : ui("All exams are finished and results are out.");

  return [
    {
      id: "year-setup",
      label: ui("Set up the year"),
      blurb: ui("Term dates, holidays, daily periods and rooms."),
      view: "year-setup",
      icon: CalendarDays,
      done: yearDone,
      reason: yearDone ? ui("The year is active and the basics are in place.") : ui("Still to do: {0}.", [list(yearMissing)]),
      cta: ui("Set up the year"),
    },
    {
      id: "classes",
      label: ui("Classes & subjects"),
      blurb: ui("Create classes, add subjects, assign teachers."),
      view: "classes",
      icon: Users,
      done: classesDone,
      reason: classesReason,
      detail: s.totalClasses > 0 ? plural(ui, s.totalClasses, "{0} class", "{0} classes") : undefined,
      cta: s.totalClasses === 0 ? ui("Create classes") : ui("Assign teachers"),
    },
    {
      id: "timetable",
      label: ui("Class timetable"),
      blurb: ui("Place every subject on the weekly timetable."),
      view: lead ? "timetable" : null,
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
            ? plural(ui, s.teacherConflicts, "{0} clash to resolve", "{0} clashes to resolve")
            : ui("{0} of {1} published", [s.publishedTimetables, s.totalClasses]),
      detailBlocking: s.teacherConflicts > 0,
      cta: lead ? ui("Open timetable") : null,
      owner: lead ? undefined : ui("Your principal builds and publishes the timetable."),
    },
    {
      id: "exams",
      label: ui("Exams & results"),
      blurb: ui("Schedule exams, collect marks, release results."),
      view: lead ? "exam-cycles" : null,
      icon: ListChecks,
      done: examsDone,
      reason: examsReason,
      detail: s.examsTotal > 0 ? ui("{0} of {1} results released", [s.examsPublished, s.examsTotal]) : undefined,
      cta: lead ? (s.examsTotal === 0 ? ui("Schedule exam") : ui("Open exams")) : null,
      owner: lead ? undefined : ui("Your principal runs exams and releases results."),
    },
  ];
}

/**
 * The campus console's Academic overview, mounted under that view's PageHeader (which carries the title, so
 * this panel opens with the year rather than repeating it). `showPlanner` (default true) mounts the capacity
 * and staffing scenario planner beneath it — it moved here from the principal console (M56): planning a new
 * section, room or hire is a campus-operations conversation; nothing it models changes live records.
 */
export function AcademicHub({ campusId, onNavigate, showPlanner = true }: { campusId?: string; onNavigate?: (view: string) => void; showPlanner?: boolean }) {
  const ui = useUiText();
  const { language } = useLocale();
  // Inside a registry console the access map says whether this operator also holds the academic-lead seat.
  const navigationAccess = useNavigationAccess();
  const academicLead = navigationAccess.has("academicLead");
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

  const list = useCallback((items: string[]) => {
    try {
      return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(items);
    } catch {
      return items.join(", ");
    }
  }, [language]);

  const steps = useMemo(
    () => (stats ? buildSteps(stats.stats, stats.cycleStatus, academicLead, ui, list) : []),
    [stats, academicLead, ui, list],
  );

  // The step the user should work on now = the first unfinished one.
  const currentIndex = steps.findIndex((s) => !s.done);
  const allDone = steps.length > 0 && currentIndex === -1;
  const currentStep = currentIndex >= 0 ? steps[currentIndex] : null;
  const doneCount = steps.filter((s) => s.done).length;

  const go = (view: string) => onNavigate?.(view);
  /** A target the viewer can open: the academic lead's views stay closed to a campus admin with a principal. */
  const reachable = (view: string) => academicLead || !LEAD_VIEWS.has(view);

  if (loading && !stats) {
    return (
      <SkeletonRegion label={ui("Loading the academic overview")} className="space-y-6">
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
        title={ui("Could not load the academic overview")}
        description={ui("Your setup steps and year figures did not arrive. Nothing has changed; try loading them again.")}
        onRetry={() => void load()}
      />
    );
  }

  const activityMeta = (meta?: string) => {
    if (!meta) return undefined;
    const label = EXAM_TYPE_LABELS[meta as ExamType] ?? TIMETABLE_STATUS[meta];
    return label ? ui(label) : meta;
  };

  return (
    <div className="space-y-6">
      {/* ── Which year are we looking at (the view's PageHeader carries the title) ── */}
      <div className="sk-enter rounded-[28px] border border-edge/12 bg-gradient-to-br from-surface-subtle via-card to-brand-100 p-5 shadow-md sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-700 text-primary-foreground shadow-brand">
              <CalendarDays className="h-5 w-5" />
            </span>
            <h2 className="min-w-0 text-xl font-bold tracking-tight text-ink-strong sm:text-2xl">
              {ui("Academic year {0}", [stats.academicYear])}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {stats.availableYears.length > 1 ? (
              <SystemSelect
                aria-label={ui("Academic year shown")}
                value={stats.academicYear}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {stats.availableYears.map((y) => (
                  <option key={y} value={y}>
                    {ui("Year {0}", [y])}
                  </option>
                ))}
              </SystemSelect>
            ) : null}
            <Badge variant={allDone ? "success" : "secondary"} dot className="tabular-nums">
              {ui("{0} of {1} steps done", [doneCount, steps.length])}
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
          label={ui("Academic year setup progress")}
          valueText={ui("{0} of {1} steps done", [doneCount, steps.length])}
        />

        {/* School readiness is the hosting view's secondary action (§4.4b); access plans and secure exam delivery
            belong to the academic lead (R-I5), so a campus admin with a principal does not see them here. */}
        <nav aria-label={ui("Related academic tools")} className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-edge/15 pt-3">
          <Link href="/resources" className="sk-link inline-flex min-h-10 items-center text-sm font-semibold text-primary">{ui("Learning resources")}</Link>
          <Link href="/curriculum" className="sk-link inline-flex min-h-10 items-center text-sm font-semibold text-primary">{ui("Objective map")}</Link>
          {academicLead ? <Link href="/accommodations" className="sk-link inline-flex min-h-10 items-center text-sm font-semibold text-primary">{ui("Access plans")}</Link> : null}
          {academicLead ? <Link href="/exam-delivery" className="sk-link inline-flex min-h-10 items-center text-sm font-semibold text-primary">{ui("Secure exam delivery")}</Link> : null}
        </nav>

        {/* Say plainly when the numbers are not from the active cycle year. */}
        {stats.showingNonCycleYear ? (
          <Alert tone="warning" icon={Info} live="off" className="mt-4" title={ui("Showing {0}, not your active year", [stats.academicYear])}>
            {ui("Your active academic year is {0}, but nothing has been set up there yet. Showing {1}, where your classes are. Finish {0} in Set up the year when you are ready to move over.", [stats.cycleYear ?? "", stats.academicYear])}
          </Alert>
        ) : null}

        {/* A year switch that fails keeps the last figures, and says so. */}
        {loadFailed ? (
          <Alert
            tone="danger"
            compact
            className="mt-4"
            title={ui("Could not refresh the overview.")}
            actions={
              <Button type="button" variant="outline" size="sm" loading={loading} onClick={() => void load()}>
                {loading ? null : <RefreshCw aria-hidden="true" />}
                {ui("Try again")}
              </Button>
            }
          >
            {ui("The figures below are from the last successful load.")}
          </Alert>
        ) : null}
      </div>

      {/* ── The next thing to do. This is the main call to action. ── */}
      {allDone ? (
        <div className="sk-enter rounded-[28px] border border-status-success-border bg-gradient-to-br from-status-success-surface to-card p-5 shadow-sm sm:p-6" style={{ "--sk-delay": "60ms" } as React.CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-status-success-surface">
                <CheckCircle2 className="h-6 w-6 text-status-success-text" />
              </span>
              <div className="min-w-0">
                <p className="sk-eyebrow text-status-success-text">{ui("Year complete")}</p>
                <h3 className="text-lg font-bold text-ink-strong">{ui("Everything is set up")}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                  {ui("Results are out. You can now move students into next year.")}
                </p>
              </div>
            </div>
            <Button variant="default" onClick={() => go("promote-archive")} className="sk-nudge-trigger w-full px-5 sm:w-auto">
              <GraduationCap aria-hidden="true" className="h-4 w-4" />
              {ui("Promote students")}
              <ArrowRight aria-hidden="true" className="sk-nudge h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      ) : currentStep ? (
        <Card variant="featured" className="sk-enter p-5 sm:p-6" style={{ "--sk-delay": "60ms" } as React.CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-700 text-primary-foreground shadow-brand">
                <currentStep.icon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="sk-eyebrow text-primary">
                  {ui("Next step · {0} of {1}", [currentIndex + 1, steps.length])}
                </p>
                <h3 className="text-lg font-bold text-ink-strong">{currentStep.label}</h3>
                <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-ink-muted">{currentStep.reason}</p>
                {currentStep.owner ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                    <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
                    {currentStep.owner}
                  </p>
                ) : null}
              </div>
            </div>
            {currentStep.view && currentStep.cta ? (
              <Button variant="default" onClick={() => go(currentStep.view as string)} className="sk-nudge-trigger w-full px-5 sm:w-auto">
                {currentStep.cta}
                <ArrowRight aria-hidden="true" className="sk-nudge h-4 w-4 rtl:rotate-180" />
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* ── Step tracker ── */}
      <section aria-labelledby="academic-hub-steps" className="sk-panel sk-enter p-5 sm:p-6" style={{ "--sk-delay": "120ms" } as React.CSSProperties}>
        <div className="mb-4 flex items-center gap-1">
          <h3 id="academic-hub-steps" className="text-base font-bold text-ink-strong">{ui("Your year at a glance")}</h3>
          <InfoTip
            content={ui("A step is done when its checks pass for the year shown. The first unfinished step is the one to work on next.")}
            label={ui("How steps are marked done")}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => {
            const isCurrent = i === currentIndex;
            const Icon = s.icon;
            const body = (
              <>
                <span className="flex w-full items-center justify-between gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "sk-icon-tile flex h-9 w-9 items-center justify-center rounded-xl",
                      s.done
                        ? "bg-status-success-surface text-status-success-text"
                        : isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-ink-muted",
                    )}
                  >
                    {s.done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="sk-eyebrow">{ui("Step {0}", [i + 1])}</span>
                </span>
                <span className="block text-sm font-bold text-ink-strong">{s.label}</span>
                <span className="block text-xs font-normal leading-relaxed text-ink-muted">{s.owner ?? s.blurb}</span>
                {s.done ? <span className="sr-only">{ui("Done.")}</span> : null}
                {s.detail ? (
                  <Badge size="sm" dot variant={s.done ? "success" : s.detailBlocking ? "warning" : "secondary"} className="tabular-nums">
                    {s.detail}
                  </Badge>
                ) : null}
              </>
            );
            // A step the viewer cannot open (the academic lead's) is a status card, never a dead button.
            return s.view ? (
              <Button
                aria-pressed={isCurrent}
                variant="choice"
                key={s.id}
                onClick={() => go(s.view as string)}
                className="group h-full w-full flex-col items-start justify-start gap-2 p-4 text-start"
              >
                {body}
              </Button>
            ) : (
              <div key={s.id} className="flex h-full w-full flex-col items-start justify-start gap-2 rounded-2xl border border-edge/15 bg-surface-subtle p-4 text-start" aria-current={isCurrent ? "step" : undefined}>
                {body}
              </div>
            );
          })}
        </div>

        {/* Year-end sits outside the step list — it is not part of setup. */}
        <div
          className={cn(
            "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
            allDone ? "border-status-success-border bg-status-success-surface" : "border-dashed border-edge/30 bg-surface-subtle",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                allDone ? "bg-card text-status-success-text" : "bg-muted text-ink-subtle",
              )}
            >
              {allDone ? <GraduationCap className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-strong">{ui("At the end of the year")}</p>
              <p id="academic-hub-promote-reason" className="text-xs leading-relaxed text-ink-muted">
                {allDone ? ui("Ready — move students into their next class.") : ui("Promoting students unlocks once results are released.")}
              </p>
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            disabled={!allDone}
            aria-describedby="academic-hub-promote-reason"
            onClick={() => go("promote-archive")}
            className="px-4"
          >
            {ui("Promote students")}
          </Button>
        </div>
      </section>

      {/* ── Quick stats ── */}
      <DeskStats data-academic-hub-stats>
        <StatTile index={0} icon={Users} tone="info" value={stats.stats.totalClasses} label={<StatLabel label={ui("Classes")} info={ui("Active classes in the academic year shown.")} />} />
        <StatTile index={1} icon={GraduationCap} tone="brand" value={stats.stats.teachersAssigned} label={<StatLabel label={ui("Teachers assigned")} info={ui("Teachers at this campus who teach at least one subject.")} />} />
        <StatTile index={2} icon={BookOpen} tone="success" value={stats.stats.publishedTimetables} label={<StatLabel label={ui("Timetables published")} info={ui("Classes with a published timetable in the academic year shown.")} />} />
        <StatTile index={3} icon={PieChart} tone={stats.stats.examsInProgress ? "warning" : "neutral"} value={stats.stats.examsInProgress} label={<StatLabel label={ui("Exams in progress")} info={ui("Exams this year that are running, collecting marks or waiting for review.")} />} />
      </DeskStats>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Needs attention ── */}
        <section aria-labelledby="academic-hub-attention" className="sk-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 text-status-warning-text" />
            <h3 id="academic-hub-attention" className="text-base font-bold text-ink-strong">{ui("Needs your attention")}</h3>
          </div>
          {stats.actionItems.length > 0 ? (
            <div className="space-y-2">
              {urgencyFirst(stats.actionItems, (a) => ATTENTION_RANK[a.tone] ?? 1).map((a) => {
                const tone = ATTENTION_TONE[a.tone] ?? "warning";
                const copy = ACTION_COPY[a.id];
                const label = copy ? plural(ui, a.count, copy[0], copy[1]) : ui(a.label);
                const target = ACTION_TARGET[a.id] || "timetable";
                const title = <span className="block text-sm font-semibold text-ink-strong [overflow-wrap:anywhere]">{label}</span>;
                return reachable(target) ? (
                  <DeskRowButton
                    key={a.id}
                    tone={tone}
                    icon={AlertTriangle}
                    onClick={() => go(target)}
                    className="sk-nudge-trigger items-center"
                    trailing={<ArrowRight aria-hidden="true" className="sk-nudge h-4 w-4 text-ink-faint rtl:rotate-180" />}
                  >
                    {title}
                  </DeskRowButton>
                ) : (
                  <div key={a.id} data-tone={tone} className={cn(deskRow, "flex w-full flex-wrap items-center gap-3")}>
                    <DeskRowIcon icon={AlertTriangle} />
                    <span className="min-w-0 flex-1">{title}</span>
                    <span className="basis-full ps-12 sm:basis-auto sm:ps-0"><DeskPill tone="neutral">{ui("With your principal")}</DeskPill></span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState size="sm" icon={CheckCircle2} title={ui("All caught up")} description={ui("Nothing needs fixing right now.")} />
          )}
        </section>

        {/* ── Recent activity ── */}
        <section aria-labelledby="academic-hub-activity" className="sk-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock aria-hidden="true" className="h-4 w-4 text-primary" />
            <h3 id="academic-hub-activity" className="text-base font-bold text-ink-strong">{ui("Recent activity")}</h3>
          </div>
          {stats.activity.length > 0 ? (
            <div className="space-y-2">
              {stats.activity.map((a) => {
                const target = a.kind === "exam" ? "exam-cycles" : "timetable";
                const tone = a.kind === "exam" ? "warning" : "brand";
                const icon = a.kind === "exam" ? ListChecks : BookOpen;
                const lines = <>
                  <bdi className="block truncate text-sm font-semibold text-ink-strong">{a.title}</bdi>
                  <span className="block truncate text-xs font-normal text-ink-subtle">
                    {[a.term, activityMeta(a.meta)].filter(Boolean).join(" · ")}
                  </span>
                  {a.at ? <RelativeTime iso={a.at} className="block text-xs text-ink-subtle" /> : null}
                </>;
                return reachable(target) ? (
                  <DeskRowButton
                    key={a.id}
                    tone={tone}
                    icon={icon}
                    onClick={() => go(target)}
                    className="sk-nudge-trigger items-center"
                    trailing={<ArrowRight aria-hidden="true" className="sk-nudge h-4 w-4 text-ink-faint rtl:rotate-180" />}
                  >
                    {lines}
                  </DeskRowButton>
                ) : (
                  <div key={a.id} data-tone={tone} className={cn(deskRow, "flex w-full items-center gap-3")}>
                    <DeskRowIcon icon={icon} />
                    <span className="min-w-0 flex-1">{lines}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              size="sm"
              icon={CircleDashed}
              title={ui("No recent activity yet")}
              description={ui("The latest exams and class timetables for this year will be listed here.")}
              primaryAction={academicLead ? { id: "open-timetable", label: "Open timetable", onClick: () => go("timetable") } : undefined}
            />
          )}
        </section>
      </div>
      {showPlanner ? <ScenarioPlanner /> : null}
    </div>
  );
}

/** A stat tile's label with what the number counts behind an (i). */
function StatLabel({ label, info }: { label: string; info: string }) {
  const ui = useUiText();
  return <span className="inline-flex min-w-0 items-center gap-0.5">{label}<InfoTip content={info} label={ui("About {0}", [label])} className="-my-1" /></span>;
}
