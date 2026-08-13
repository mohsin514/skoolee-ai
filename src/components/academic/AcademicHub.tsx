"use client";

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
  Users,
} from "lucide-react";

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

const TONE = {
  rose: { text: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200", dot: "bg-rose-500" },
  amber: { text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  teal: { text: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200", dot: "bg-teal-500" },
  emerald: { text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
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
      detail:
        s.totalClasses > 0
          ? `${s.publishedTimetables} of ${s.totalClasses} published`
          : undefined,
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

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-lg bg-[#e8e0ec]/50 ${className}`} />;
}

export function AcademicHub({ campusId, onNavigate }: { campusId?: string; onNavigate?: (view: string) => void }) {
  const [stats, setStats] = useState<HubStats | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      if (year) params.set("year", String(year));
      const res = await fetch(`/api/academic/hub-stats?${params.toString()}`);
      const json = await res.json();
      if (json.success) setStats(json.data);
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
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-[28px]" />
        <Skeleton className="h-28 w-full rounded-[28px]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-[24px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header: which year are we looking at ── */}
      <div className="rounded-[28px] border border-[#cfc2d6]/12 bg-gradient-to-br from-[#faf7fc] via-white to-[#f3eeff] p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.18)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-lg shadow-[#8127cf]/20">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">
                Academic Year {stats?.academicYear}
              </p>
              <h2 className="text-xl font-black tracking-tight text-[#1f1a23]">Academic Overview</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {stats && stats.availableYears.length > 1 ? (
              <select
                value={stats.academicYear}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-2xl border border-[#cfc2d6]/25 bg-white px-4 py-2 text-xs font-bold text-[#1f1a23] shadow-sm focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
              >
                {stats.availableYears.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-[#8127cf] shadow-sm">
              {doneCount} of {steps.length} steps done
            </span>
          </div>
        </div>

        {/* Progress bar across the whole year */}
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/70">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#10b981] transition-all duration-700"
            style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }}
          />
        </div>

        {/* Say plainly when the numbers are not from the active cycle year. */}
        {stats?.showingNonCycleYear ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs font-semibold text-amber-800">
              Your active academic year is <b>{stats.cycleYear}</b>, but nothing has been set up there
              yet. Showing <b>{stats.academicYear}</b>, which is where your classes are. Finish{" "}
              {stats.cycleYear} in <b>Set Up the Year</b> when you are ready to move over.
            </p>
          </div>
        ) : null}
      </div>

      {/* ── The next thing to do. This is the main call to action. ── */}
      {allDone ? (
        <div className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-emerald-600">
                  Year Complete
                </p>
                <h3 className="text-lg font-black text-[#1f1a23]">Everything is set up</h3>
                <p className="mt-0.5 text-xs font-semibold text-[#4d4354]/60">
                  Results are out. You can now move students into next year.
                </p>
              </div>
            </div>
            <button
              onClick={() => go("promote-archive")}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700"
            >
              <GraduationCap className="h-4 w-4" />
              Promote Students
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : currentStep ? (
        <div className="rounded-[28px] border border-[#8127cf]/20 bg-gradient-to-br from-white to-[#faf7fc] p-6 shadow-[0_4px_16px_-4px_rgba(129,39,207,0.15)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-lg shadow-[#8127cf]/25">
                <currentStep.icon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">
                  Next Step · {currentIndex + 1} of {steps.length}
                </p>
                <h3 className="text-lg font-black text-[#1f1a23]">{currentStep.label}</h3>
                <p className="mt-0.5 max-w-xl text-xs font-semibold text-[#4d4354]/70">
                  {currentStep.reason}
                </p>
              </div>
            </div>
            <button
              onClick={() => go(currentStep.view)}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/30"
            >
              {currentStep.cta}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Step tracker ── */}
      <div className="rounded-[28px] border border-[#cfc2d6]/12 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-[#4d4354]/70">
          Your Year at a Glance
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => {
            const isCurrent = i === currentIndex;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => go(s.view)}
                className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all ${
                  isCurrent
                    ? "border-[#8127cf] bg-[#faf7fc] shadow-md shadow-[#8127cf]/10"
                    : s.done
                      ? "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50"
                      : "border-[#cfc2d6]/25 bg-white hover:border-[#8127cf]/40"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      s.done
                        ? "bg-emerald-100 text-emerald-600"
                        : isCurrent
                          ? "bg-[#8127cf] text-white"
                          : "bg-[#f3f4f9] text-[#4d4354]/50"
                    }`}
                  >
                    {s.done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/35">
                    Step {i + 1}
                  </span>
                </div>
                <p className="text-sm font-black text-[#1f1a23]">{s.label}</p>
                <p className="text-[11px] font-semibold leading-snug text-[#4d4354]/55">{s.blurb}</p>
                {s.detail ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      s.done ? "bg-emerald-100 text-emerald-700" : "bg-[#f3eeff] text-[#8127cf]"
                    }`}
                  >
                    {s.detail}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Year-end sits outside the step list — it is not part of setup. */}
        <div
          className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
            allDone ? "border-emerald-200 bg-emerald-50/50" : "border-dashed border-[#cfc2d6]/30 bg-[#faf7fc]"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                allDone ? "bg-emerald-100 text-emerald-600" : "bg-[#f3f4f9] text-[#4d4354]/40"
              }`}
            >
              {allDone ? <GraduationCap className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-xs font-black text-[#1f1a23]">At the end of the year</p>
              <p className="text-[11px] font-semibold text-[#4d4354]/55">
                {allDone
                  ? "Ready — move students into their next class."
                  : "Promoting students unlocks once results are released."}
              </p>
            </div>
          </div>
          <button
            disabled={!allDone}
            onClick={() => go("promote-archive")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              allDone
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "cursor-not-allowed bg-[#e8e0ec]/60 text-[#4d4354]/35"
            }`}
          >
            Promote Students
          </button>
        </div>
      </div>

      {/* ── Quick stats ── */}
      {stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} label="Classes" value={stats.stats.totalClasses} tone="teal" />
          <StatCard icon={GraduationCap} label="Teachers Assigned" value={stats.stats.teachersAssigned} tone="teal" />
          <StatCard icon={BookOpen} label="Timetables Published" value={stats.stats.publishedTimetables} tone="emerald" />
          <StatCard icon={PieChart} label="Exams In Progress" value={stats.stats.examsInProgress} tone="amber" />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Needs attention ── */}
        <div className="rounded-[28px] border border-[#cfc2d6]/12 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-black uppercase tracking-wider text-[#4d4354]/70">
              Needs Your Attention
            </h3>
          </div>
          {stats && stats.actionItems.length > 0 ? (
            <div className="space-y-3">
              {stats.actionItems.map((a) => {
                const t = TONE[a.tone];
                return (
                  <button
                    key={a.id}
                    onClick={() => go(ACTION_TARGET[a.id] || "timetable")}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.bg} px-4 py-3 text-left transition-all hover:brightness-95`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
                      <span className={`text-sm font-bold ${t.text}`}>{a.label}</span>
                    </span>
                    <ArrowRight className={`h-4 w-4 ${t.text}`} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/60 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="mt-2 text-sm font-bold text-emerald-700">All caught up</p>
              <p className="text-xs text-[#4d4354]/50">Nothing needs fixing right now</p>
            </div>
          )}
        </div>

        {/* ── Recent activity ── */}
        <div className="rounded-[28px] border border-[#cfc2d6]/12 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#8127cf]" />
            <h3 className="text-sm font-black uppercase tracking-wider text-[#4d4354]/70">
              Recent Activity
            </h3>
          </div>
          {stats && stats.activity.length > 0 ? (
            <div className="space-y-2">
              {stats.activity.map((a) => (
                <button
                  key={a.id}
                  onClick={() => go(a.kind === "exam" ? "exam-cycles" : "timetable")}
                  className="flex w-full items-center justify-between rounded-xl border border-[#cfc2d6]/15 bg-white px-4 py-3 text-left transition-all hover:border-[#8127cf]/30 hover:bg-[#fbf0fe]/40"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        a.kind === "exam" ? "bg-amber-50 text-amber-600" : "bg-[#f3eeff] text-[#8127cf]"
                      }`}
                    >
                      {a.kind === "exam" ? <ListChecks className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#1f1a23]">{a.title}</p>
                      <p className="text-[11px] font-semibold text-[#4d4354]/50">
                        {[a.term, a.meta].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[#cfc2d6]" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[#cfc2d6]/15 bg-[#faf7fc] py-8 text-center">
              <CircleDashed className="h-8 w-8 text-[#cfc2d6]" />
              <p className="mt-2 text-sm font-semibold text-[#4d4354]/50">No recent activity yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: keyof typeof TONE;
}) {
  const t = TONE[tone];
  return (
    <div className="rounded-[24px] border border-[#cfc2d6]/12 bg-white p-5 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${t.bg}`}>
        <Icon className={`h-5 w-5 ${t.text}`} />
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight text-[#1f1a23]">{value}</p>
      <p className="mt-1 text-xs font-semibold text-[#4d4354]/55">{label}</p>
    </div>
  );
}
