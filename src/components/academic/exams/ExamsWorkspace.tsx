"use client";

import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { ExamInvigilationPanel } from "@/components/school-ai/exam-session-plan-panel";
import { examSessionPlanCopy } from "@/components/school-ai/exam-session-plan-copy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArmchairIcon,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Lock,
  MoreHorizontal,
  PenLine,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { BrandButton } from "@/components/role-dashboard";
import { Modal, ModalActions } from "@/components/ui/modal";
import { StatusPill } from "@/components/shared-admin";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/academic/exam-permissions";
import type { ExamItem } from "@/components/academic/ExamCycleManager";
import { SessionWizard } from "@/components/academic/exams/SessionWizard";
import { MasterDatesheet } from "@/components/academic/exams/MasterDatesheet";
import { DatesheetPublication } from "./DatesheetPublication";
import { SeatingPlanner } from "@/components/academic/exams/SeatingPlanner";
import { ExamDetailDialog } from "@/components/academic/exams/ExamDetailDialog";
import { Meter, Panel, ProgressStat, StepEmpty } from "@/components/academic/exams/shared";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";

/**
 * Exams & Results, as five steps in the order they actually happen (§80).
 *
 * What was here before was a kanban board: six status lanes, drag and drop
 * between them, three view modes, and eight filters, all remembered in local
 * storage. It was a faithful picture of the *data model* — an exam has a
 * status, so here are the statuses — and no help at all with the *job*, which
 * is a fixed sequence every school runs once a term:
 *
 *   schedule it → date it → seat it → mark it → publish it
 *
 * Those steps have hard dependencies. You cannot seat a paper that has no
 * date, and you cannot publish marks nobody has entered. A board of draggable
 * cards hides that; a numbered rail states it, shows how far along each step
 * is, and refuses to pretend a later step is available early.
 */

interface SessionClass {
  examId: string;
  classId: string;
  className: string;
  section: string | null;
  status: string;
  subjectCount: number;
  studentCount: number;
  scheduled: number;
  seated: number;
  marksEntered: number;
  marksExpected: number;
  totalMarks: number;
}

interface Session {
  id: string;
  title: string;
  term: string;
  academicYear: number;
  examType: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  classCount: number;
  papersScheduled: number;
  papersExpected: number;
  papersSeated: number;
  studentCount: number;
  marksEntered: number;
  marksExpected: number;
  publishedCount: number;
  firstDate: string | null;
  lastDate: string | null;
  classes: SessionClass[];
}

type StepKey = "plan" | "datesheet" | "seating" | "marks" | "results";

const STEPS: {
  key: StepKey;
  index: number;
  label: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "plan", index: 1, label: "Schedule", blurb: "Pick the classes that sit it", icon: Sparkles },
  { key: "datesheet", index: 2, label: "Date sheet", blurb: "Give every paper a day and a time", icon: CalendarDays },
  { key: "seating", index: 3, label: "Seating", blurb: "Fill rooms at exam spacing", icon: ArmchairIcon },
  { key: "marks", index: 4, label: "Marks", blurb: "Enter and check every subject", icon: PenLine },
  { key: "results", index: 5, label: "Results", blurb: "Review, lock and publish", icon: BadgeCheck },
];

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function classLabel(c: { className: string; section: string | null }) {
  return `${c.className}${c.section ? ` ${c.section}` : ""}`;
}

export interface ExamsWorkspaceProps {
  campusId?: string;
  /**
   * §4.4: the hosting page's PageHeader owns "Schedule exam" (primary) and "Refresh" (secondary). With
   * `hideActions` the session card drops its own two buttons; each change of `scheduleRequest` opens the
   * scheduling wizard and each change of `refreshRequest` reloads quietly. Without it (older hosts) the
   * buttons stay on the card.
   */
  hideActions?: boolean;
  scheduleRequest?: number;
  refreshRequest?: number;
}

export function ExamsWorkspace({ campusId, hideActions = false, scheduleRequest, refreshRequest }: ExamsWorkspaceProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [legacy, setLegacy] = useState<ExamItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>("datesheet");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [openExam, setOpenExam] = useState<ExamItem | null>(null);
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  // R4: the first load failing is an inline ErrorState with retry; a silent refresh failing keeps the last figures.
  const [loadFailed, setLoadFailed] = useState(false);
  const ui = useUiText();

  const academicYear = new Date().getFullYear();

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else { setLoading(true); setLoadFailed(false); }
      try {
        const qs = campusId ? `?campusId=${campusId}` : "";
        const [sessRes, examRes] = await Promise.all([
          fetch(`/api/academic/exam-sessions${qs}`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`/api/exams${qs}`, { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!sessRes.success && !examRes.success) throw new Error("load failed");

        const list: Session[] = sessRes.success ? sessRes.data : [];
        setSessions(list);
        setActiveId((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));

        // Exams that predate sessions, or a teacher's class tests. They are
        // real work with real marks, so they stay reachable — just not on the
        // main rail, which is about the term exam the office is running.
        const all: ExamItem[] = examRes.success ? examRes.exams : [];
        setLegacy(all.filter((e) => !(e as ExamItem & { sessionId?: string }).sessionId));
      } catch {
        if (!silent) setLoadFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [campusId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Host-owned actions (PageHeader): the first render never fires; only a change of the counter does.
  const lastSchedule = useRef(scheduleRequest);
  useEffect(() => {
    if (scheduleRequest === undefined || scheduleRequest === lastSchedule.current) return;
    lastSchedule.current = scheduleRequest;
    setWizard(true);
  }, [scheduleRequest]);
  const lastRefresh = useRef(refreshRequest);
  useEffect(() => {
    if (refreshRequest === undefined || refreshRequest === lastRefresh.current) return;
    lastRefresh.current = refreshRequest;
    void load(true);
  }, [refreshRequest, load]);

  // Marks land from teachers' browsers while the office is watching, so the
  // counts refresh quietly rather than going stale until a manual reload.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") load(true);
    };
    const id = window.setInterval(tick, 45_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [load]);

  const active = sessions.find((s) => s.id === activeId) ?? null;

  /** How far each step has got, so the rail can show it rather than assert it. */
  const progress = useMemo(() => {
    if (!active) {
      return { plan: 0, datesheet: 0, seating: 0, marks: 0, results: 0 };
    }
    return {
      plan: active.classCount > 0 ? 100 : 0,
      datesheet: pct(active.papersScheduled, active.papersExpected),
      seating: pct(active.papersSeated, active.papersScheduled),
      marks: pct(active.marksEntered, active.marksExpected),
      results: pct(active.publishedCount, active.classCount),
    };
  }, [active]);

  /** The step that is genuinely next — the first one not finished. */
  const currentStep = useMemo<StepKey>(() => {
    if (!active) return "plan";
    if (progress.datesheet < 100) return "datesheet";
    if (progress.seating < 100) return "seating";
    if (progress.marks < 100) return "marks";
    return "results";
  }, [active, progress]);

  // Landing on the step that is actually next, but only when the session
  // changes. Re-running this as counts move would yank the admin off the step
  // they are working on the moment a teacher saves a mark.
  const activeSessionId = active?.id ?? null;
  const stepRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSessionId || stepRef.current === activeSessionId) return;
    stepRef.current = activeSessionId;
    setStep(currentStep);
  }, [activeSessionId, currentStep]);

  const deleteSession = async (session: Session) => {
    try {
      const sp = new URLSearchParams({ id: session.id });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/exam-sessions?${sp}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not remove the exam");
      toast.success(
        json.data.keptExams > 0
          ? json.data.keptExams === 1
            ? ui("Exam removed. 1 class was kept because it already has marks.")
            : ui("Exam removed. {0} classes were kept because they already have marks.", [json.data.keptExams])
          : ui("Exam removed"),
      );
      setDeleting(null);
      await load(true);
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not remove the exam")));
    }
  };

  if (loadFailed && !loading) {
    return <ErrorState title={ui("Exams could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} />;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-[24px] bg-border-subtle/40 skeleton-shimmer" />
        <div className="h-20 rounded-[24px] bg-border-subtle/40 skeleton-shimmer" />
        <div className="h-72 rounded-[24px] bg-border-subtle/40 skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="sk-rise space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-3xl border border-edge/25 sk-brand-surface px-4 py-5 text-white shadow-brand sm:px-6">
        <span
          aria-hidden
          className="pointer-events-none absolute -end-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 start-24 h-56 w-56 rounded-full bg-brand-300/25 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            {/* The page title ("Exams & results") lives in the host PageHeader; this card names the session. */}
            <p className="text-2xs font-semibold text-white/70">
              {ui(active ? "Exam session" : "Exams")}
            </p>
            <h2 className="mt-0.5 text-2xl font-bold tracking-tight">
              {active ? <bdi>{active.title}</bdi> : ui("No exam scheduled yet")}
            </h2>
            <p className="mt-1 text-xs font-semibold text-white/70">
              {active
                ? [
                    active.classCount === 1 ? ui("1 class") : ui("{0} classes", [active.classCount]),
                    ui("{0} candidates", [active.studentCount]),
                    `${active.term} ${active.academicYear}`,
                    active.firstDate ? ui("{0} to {1}", [active.firstDate, active.lastDate ?? active.firstDate]) : null,
                  ].filter(Boolean).join(" · ")
                : ui("Schedule mid-term or final exams for every class in one step.")}
            </p>
          </div>
          {hideActions ? (
            refreshing ? <RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-white/70 motion-reduce:animate-none" /> : null
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="default" size="icon"
                type="button"
                onClick={() => load(true)}
                aria-label={ui("Refresh")}
                className="flex items-center justify-center"
              >
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin motion-reduce:animate-none")} />
              </Button>
              <Button variant="outline"
                type="button"
                onClick={() => setWizard(true)}
                className="justify-start flex items-center gap-2 px-4"
              >
                <Plus className="h-4 w-4" />
                {ui("Schedule exam")}
              </Button>
            </div>
          )}
        </div>

        {/* Session switcher — only when there is a choice to make. */}
        {sessions.length > 1 ? (
          <div className="relative mt-4 flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {sessions.map((s) => {
              const on = s.id === activeId;
              return (
                <Button variant="choice"
                  key={s.id}
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  aria-pressed={on}
                  className={cn(
                    "shrink-0 px-3 py-1.5",
                    "",
                  )}
                >
                  {s.title}
                </Button>
              );
            })}
          </div>
        ) : null}
      </header>

      {!active ? (
        <StepEmpty
          icon={Sparkles}
          title="Schedule your first exam"
          body="Pick mid-term or final, choose which classes sit it, and one exam is created for each. From there you build one date sheet for the whole school, seat every room, and publish results."
          action={
            // §4.5.7: the empty state repeats the page's primary action with the same label.
            <Button type="button" onClick={() => setWizard(true)}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              {ui("Schedule exam")}
            </Button>
          }
        />
      ) : (
        <>
          {/* ── The rail ──────────────────────────────────────────────── */}
          <nav
            aria-label={ui("Exam steps")}
            className="sk-panel grid gap-2 p-2.5 sm:grid-cols-3 xl:grid-cols-5"
          >
            {STEPS.map((s) => {
              const value = progress[s.key];
              const on = step === s.key;
              const done = value >= 100;
              const isNext = currentStep === s.key && !done;
              return (
                <Button data-selected={on} variant="choice"
                  key={s.key}
                  type="button"
                  onClick={() => setStep(s.key)}
                  aria-current={on ? "step" : undefined}
                  className={"justify-start " + (cn(
                    "group relative flex items-center gap-2.5 overflow-hidden px-3 py-2.5 text-start",
                    on
                      ? ""
                      : "hover:-translate-y-0.5",
                  ))}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-colors",
                      done
                        ? "bg-status-success-text text-primary-foreground"
                        : on || isNext
                        ? "bg-gradient-to-br from-primary to-brand-400 text-primary-foreground"
                        : "bg-card text-ink-subtle ring-1 ring-edge/35",
                    )}
                    aria-hidden="true"
                  >
                    {done ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "truncate text-xs font-bold",
                          on ? "text-primary" : "text-ink-strong",
                        )}
                      >
                        <bdi dir="ltr">{s.index}.</bdi> {ui(s.label)}
                      </span>
                      {isNext ? (
                        <span className="shrink-0 rounded bg-brand-100 px-1 py-px text-2xs font-semibold text-primary">
                          {ui("Next")}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-2xs font-semibold text-ink-subtle">
                      {done ? ui("Done") : `${value}% · ${ui(s.blurb)}`}
                    </span>
                    <Meter
                      value={value}
                      total={100}
                      tone={done ? "emerald" : "violet"}
                      className="mt-1.5"
                    />
                  </span>
                </Button>
              );
            })}
          </nav>

          {/* ── Step body ─────────────────────────────────────────────── */}
          <div key={`${active.id}-${step}`} className="sk-rise">
            {step === "plan" ? (
              <PlanStep
                session={active}
                onOpenExam={(examId) => {
                  const cls = active.classes.find((c) => c.examId === examId);
                  if (cls) setOpenExam(asExamItem(active, cls));
                }}
                onDelete={() => setDeleting(active)}
                onNext={() => setStep("datesheet")}
              />
            ) : null}

            {step === "datesheet" ? (
              <MasterDatesheet
                sessionId={active.id}
                campusId={campusId}
                onChanged={() => load(true)}
              />
            ) : null}

            {step === "seating" ? (
              <div className="space-y-4">
                <ExamDutyControl sessionId={active.id} />
                <SeatingPlanner sessionId={active.id} campusId={campusId} onChanged={() => load(true)} />
                <DatesheetPublication sessionId={active.id} />
              </div>
            ) : null}

            {step === "marks" ? (
              <MarksStep
                session={active}
                onOpen={(cls) => setOpenExam(asExamItem(active, cls))}
              />
            ) : null}

            {step === "results" ? (
              <ResultsStep
                session={active}
                campusId={campusId}
                onOpen={(cls) => setOpenExam(asExamItem(active, cls))}
                onChanged={() => load(true)}
              />
            ) : null}
          </div>
        </>
      )}

      {/* ── Teachers' own assessments, out of the way ───────────────────── */}
      {legacy.length > 0 ? (
        <div className="sk-panel ">
          <Button variant="ghost"
            type="button"
            onClick={() => setShowLegacy((v) => !v)}
            className="justify-start flex w-full items-center gap-3 px-5 py-3.5 text-start"
          >
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <MoreHorizontal className="h-4 w-4 text-ink-muted" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink-strong">
                {ui("Other exams ({0})", [legacy.length])}
              </span>
              <span className="block text-xs font-medium text-ink-subtle">
                {ui("Teachers' quizzes and class tests, plus anything scheduled before exams were organised by term.")}
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "h-4 w-4 shrink-0 text-ink-subtle transition-transform",
                showLegacy ? "rotate-90" : "rtl:rotate-180",
              )}
            />
          </Button>
          {showLegacy ? (
            <ul className="divide-y divide-edge/12 border-t border-edge/12">
              {legacy.map((e) => (
                <li key={e.id}>
                  <Button variant="secondary"
                    type="button"
                    onClick={() => setOpenExam(e)}
                    className="sk-row-interactive justify-start flex w-full items-center gap-3 px-5 py-2.5 text-start"
                  >
                    <span className="min-w-0 flex-1">
                      <bdi className="block truncate text-xs font-bold text-ink-strong">
                        {e.title}
                      </bdi>
                      <span className="block truncate text-2xs font-semibold text-ink-subtle">
                        {[[e.class?.name, e.class?.section].filter(Boolean).join(" "), ui(EXAM_TYPE_LABELS[e.examType as ExamType] ?? e.examType), e.term].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <StatusPill status={e.status} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {wizard ? (
        <SessionWizard
          campusId={campusId}
          academicYear={academicYear}
          onClose={() => setWizard(false)}
          onCreated={async (id) => {
            setWizard(false);
            await load(true);
            setActiveId(id);
            setStep("datesheet");
          }}
        />
      ) : null}

      {openExam ? (
        <ExamDetailDialog
          exam={openExam}
          campusId={campusId}
          initialTab={step === "results" ? "reports" : "marks"}
          onClose={() => setOpenExam(null)}
          onChanged={() => load(true)}
        />
      ) : null}

      {deleting ? (
        <Modal
          title={ui("Remove {0}?", [deleting.title])}
          subtitle={ui("Classes that already have marks are kept and simply detached. Empty ones are removed with it.")}
          icon={Trash2}
          tone="rose"
          size="sm"
          role="alertdialog"
          onClose={() => setDeleting(null)}
          footer={
            <ModalActions
              actionLabel={ui("Remove exam")}
              cancelLabel={ui("Keep editing")}
              tone="rose"
              onCancel={() => setDeleting(null)}
              onAction={() => deleteSession(deleting)}
            />
          }
        >
          <p className="text-sm leading-relaxed text-ink-muted">
            {ui("The date sheet and seating plan for the empty classes go too. No marks are ever deleted.")}
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

/** Bridge a session's class row into the shape the detail dialog expects. */
function asExamItem(session: Session, cls: SessionClass): ExamItem {
  return {
    id: cls.examId,
    title: session.title,
    term: session.term,
    academicYear: session.academicYear,
    examType: session.examType,
    status: cls.status,
    classId: cls.classId,
    class: { id: cls.classId, name: cls.className, section: cls.section },
    totalMarks: cls.totalMarks,
  } as unknown as ExamItem;
}

/* ────────────────────────────── Step 1 ─────────────────────────────── */

function PlanStep({
  session,
  onOpenExam,
  onDelete,
  onNext,
}: {
  session: Session;
  onOpenExam: (examId: string) => void;
  onDelete: () => void;
  onNext: () => void;
}) {
  const ui = useUiText();
  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <ProgressStat icon={Users} label="Classes sitting" value={session.classCount} total={0} />
        <ProgressStat icon={Users} label="Candidates" value={session.studentCount} total={0} />
        <ProgressStat
          icon={FileText}
          label="Papers to place"
          value={session.papersScheduled}
          total={session.papersExpected}
          tone={session.papersScheduled >= session.papersExpected ? "emerald" : "amber"}
        />
        <ProgressStat
          icon={ArmchairIcon}
          label="Papers seated"
          value={session.papersSeated}
          total={session.papersScheduled}
          tone={
            session.papersSeated >= session.papersScheduled && session.papersScheduled > 0
              ? "emerald"
              : "amber"
          }
        />
      </div>

      <Panel
        title="Classes in this exam"
        subtitle="Each one has its own papers, its own rooms and its own marks."
        icon={Users}
        actions={
          <>
            <Button variant="secondary"
              type="button"
              onClick={onDelete}
              className="justify-start flex items-center gap-1.5 px-3"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              {ui("Remove exam")}
            </Button>
            <BrandButton
              onClick={onNext}
              icon={<ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />}
              className="min-h-9 px-3.5 text-xs"
            >
              {ui("Build the date sheet")}
            </BrandButton>
          </>
        }
        bodyClassName="p-3"
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {session.classes.map((cls) => (
            <Button variant="outline"
              key={cls.examId}
              type="button"
              onClick={() => onOpenExam(cls.examId)}
              className="sk-hover-lift block group p-3 text-start"
            >
              <div className="flex items-center gap-2">
                <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-ink-strong">
                  {classLabel(cls)}
                </bdi>
                <StatusPill status={cls.status} />
              </div>
              <p className="mt-1 text-2xs font-bold text-ink-subtle">
                {ui("{0} students · {1} subjects", [cls.studentCount, cls.subjectCount])}
              </p>
              <div className="mt-2 space-y-1.5">
                <MiniBar label="Dated" value={cls.scheduled} total={cls.subjectCount} />
                <MiniBar label="Seated" value={cls.seated} total={cls.scheduled} />
                <MiniBar label="Marked" value={cls.marksEntered} total={cls.marksExpected} />
              </div>
            </Button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MiniBar({ label, value, total }: { label: string; value: number; total: number }) {
  const ui = useUiText();
  const done = total > 0 && value >= total;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 truncate text-2xs font-semibold text-ink-subtle">
        {ui(label)}
      </span>
      <Meter value={value} total={total} tone={done ? "emerald" : "violet"} className="flex-1" />
      <bdi dir="ltr" className="w-11 shrink-0 text-end text-2xs font-bold tabular-nums text-ink-subtle">
        {value}/{total}
      </bdi>
    </div>
  );
}

/* ────────────────────────────── Step 4 ─────────────────────────────── */

function MarksStep({
  session,
  onOpen,
}: {
  session: Session;
  onOpen: (cls: SessionClass) => void;
}) {
  const ui = useUiText();
  const sorted = useMemo(
    () =>
      [...session.classes].sort((a, b) => {
        // Least finished first — that is the worklist.
        const ap = a.marksExpected > 0 ? a.marksEntered / a.marksExpected : 1;
        const bp = b.marksExpected > 0 ? b.marksEntered / b.marksExpected : 1;
        return ap - bp || classLabel(a).localeCompare(classLabel(b));
      }),
    [session.classes],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <ProgressStat
          icon={PenLine}
          label="Marks entered"
          value={session.marksEntered}
          total={session.marksExpected}
          tone={session.marksEntered >= session.marksExpected ? "emerald" : "violet"}
        />
        <ProgressStat
          icon={ClipboardCheck}
          label="Classes complete"
          value={
            session.classes.filter((c) => c.marksExpected > 0 && c.marksEntered >= c.marksExpected)
              .length
          }
          total={session.classCount}
          tone="violet"
        />
        <ProgressStat
          icon={Lock}
          label="Locked or published"
          value={
            session.classes.filter((c) =>
              ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(c.status),
            ).length
          }
          total={session.classCount}
          tone="emerald"
        />
      </div>

      <Panel
        title="Enter marks"
        subtitle="Open a class to type its marks, one subject at a time."
        icon={PenLine}
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-edge/12">
          {sorted.map((cls) => {
            const done = cls.marksExpected > 0 && cls.marksEntered >= cls.marksExpected;
            return (
              <li key={cls.examId}>
                <Button variant="secondary"
                  type="button"
                  onClick={() => onOpen(cls)}
                  className="sk-row-interactive group flex w-full items-center gap-3 px-5 py-3 text-start"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      done ? "bg-status-success-surface text-status-success-text" : "bg-brand-100 text-primary",
                    )}
                    aria-hidden="true"
                  >
                    {done ? <Check className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <bdi className="truncate text-sm font-bold text-ink-strong">
                        {classLabel(cls)}
                      </bdi>
                      <StatusPill status={cls.status} />
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <Meter
                        value={cls.marksEntered}
                        total={cls.marksExpected}
                        tone={done ? "emerald" : "violet"}
                        className="max-w-xs"
                      />
                      <bdi dir="ltr" className="shrink-0 text-2xs font-bold tabular-nums text-ink-subtle">
                        {cls.marksEntered}/{cls.marksExpected}
                      </bdi>
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:text-primary rtl:rotate-180" />
                </Button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

/* ────────────────────────────── Step 5 ─────────────────────────────── */

const RESULT_ACTIONS: Record<string, { next: string; label: string; icon: React.ComponentType<{ className?: string }> } | undefined> = {
  MARKS_ENTRY: { next: "LOCKED", label: "Lock marks", icon: Lock },
  ACTIVE: { next: "LOCKED", label: "Lock marks", icon: Lock },
  LOCKED: { next: "PRINCIPAL_REVIEWED", label: "Mark reviewed", icon: ClipboardCheck },
  PRINCIPAL_REVIEWED: { next: "PUBLISHED", label: "Publish results", icon: Send },
};

function ResultsStep({
  session,
  campusId,
  onOpen,
  onChanged,
}: {
  session: Session;
  campusId?: string;
  onOpen: (cls: SessionClass) => void;
  onChanged: () => void;
}) {
  const ui = useUiText();
  // G30/G31: locking office-exam marks, the review and publication are the academic lead's acts (the principal,
  // or the campus admin while no principal is appointed). Anyone else sees the status and who acts next.
  const lead = useNavigationAccess().has("academicLead");
  const [busy, setBusy] = useState<string | null>(null);
  // F16: publishing results releases report cards to families, so it is confirmed first (R3).
  const [confirmPublish, setConfirmPublish] = useState<SessionClass | null>(null);
  // The spotlight anchor goes on the first rendered Publish button only (anchors are unique per page, §9.4).
  const firstPublishable = lead ? session.classes.find((c) => RESULT_ACTIONS[c.status]?.next === "PUBLISHED")?.examId ?? null : null;

  const advance = async (cls: SessionClass, status: string) => {
    setConfirmPublish(null);
    setBusy(cls.examId);
    try {
      // Locking has its own endpoint (it freezes marks and generates this exam's result cards; G30 decides who
      // may lock). The status PATCH only accepts the review and publish transitions after that.
      const res = status === "LOCKED"
        ? await fetch(`/api/exams/${encodeURIComponent(cls.examId)}/lock`, { method: "POST" })
        : await fetch("/api/exams", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: cls.examId, status }),
        });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : ui("Could not update this exam"));
      toast.success(status === "PUBLISHED"
        ? ui("Results published for {0}", [classLabel(cls)])
        : status === "LOCKED"
          ? ui("Marks locked for {0}", [classLabel(cls)])
          : ui("{0} marked as reviewed", [classLabel(cls)]));
      onChanged();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not update this exam")));
    } finally {
      setBusy(null);
    }
  };

  const ready = session.classes.filter(
    (c) => c.marksExpected > 0 && c.marksEntered >= c.marksExpected,
  );
  const incomplete = session.classes.filter((c) => !ready.includes(c));

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <ProgressStat
          icon={BadgeCheck}
          label="Published"
          value={session.publishedCount}
          total={session.classCount}
          tone={session.publishedCount >= session.classCount ? "emerald" : "violet"}
        />
        <ProgressStat
          icon={ClipboardCheck}
          label="Ready to lock"
          value={ready.length}
          total={session.classCount}
          tone="violet"
        />
        <ProgressStat
          icon={AlertTriangle}
          label="Still being marked"
          value={incomplete.length}
          total={session.classCount}
          tone={incomplete.length > 0 ? "amber" : "emerald"}
        />
      </div>

      {incomplete.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-status-warning-border bg-status-warning-surface px-4 py-3">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-status-warning-text" />
          <p className="min-w-0 flex-1 text-xs font-bold text-status-warning-text">
            {ui(incomplete.length === 1
              ? "{0} class still has marks outstanding. Publishing before they are in produces report cards with blanks on them."
              : "{0} classes still have marks outstanding. Publishing before they are in produces report cards with blanks on them.", [incomplete.length])}
          </p>
        </div>
      ) : null}

      <Panel
        title="Review and publish"
        subtitle={lead ? "Lock the marks, have them reviewed, then release the report cards." : "Your principal locks the marks, reviews them and releases the report cards."}
        icon={BadgeCheck}
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-edge/12">
          {session.classes.map((cls) => {
            const action = RESULT_ACTIONS[cls.status];
            const complete = cls.marksExpected > 0 && cls.marksEntered >= cls.marksExpected;
            const published = cls.status === "PUBLISHED";
            return (
              <li key={cls.examId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    published ? "bg-status-success-surface text-status-success-text" : "bg-brand-100 text-primary",
                  )}
                  aria-hidden="true"
                >
                  {published ? <BadgeCheck className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <bdi className="truncate text-sm font-bold text-ink-strong">
                      {classLabel(cls)}
                    </bdi>
                    <StatusPill status={cls.status} />
                  </span>
                  <span className="mt-0.5 block text-2xs font-bold text-ink-subtle">
                    {ui(complete ? "{0}/{1} marks · complete" : "{0}/{1} marks · incomplete", [cls.marksEntered, cls.marksExpected])}
                  </span>
                </span>

                <Button variant="secondary"
                  type="button"
                  onClick={() => onOpen(cls)}
                  className="px-3"
                >
                  {ui("Report cards")}
                </Button>

                {action && !lead ? (
                  <span className="text-2xs font-semibold text-ink-muted">{ui("With your principal")}</span>
                ) : action ? (() => {
                  const lockBlocked = !complete && action.next === "LOCKED";
                  const btn = (
                    <Button variant="default"
                      type="button"
                      loading={busy === cls.examId}
                      disabled={busy === cls.examId || lockBlocked}
                      onClick={() => (action.next === "PUBLISHED" ? setConfirmPublish(cls) : advance(cls, action.next))}
                      data-tour={action.next === "PUBLISHED" && cls.examId === firstPublishable ? "principal.exams.publish" : undefined}
                      className="justify-start flex items-center gap-1.5 px-3 enabled:cursor-pointer"
                    >
                      {busy === cls.examId ? null : <action.icon className="h-3.5 w-3.5" aria-hidden="true" />}
                      {ui(action.label)}
                    </Button>
                  );
                  return lockBlocked ? (
                    <Tooltip content={ui("Every mark has to be in before the exam can be locked")}>
                      <span tabIndex={0} className="inline-flex">{btn}</span>
                    </Tooltip>
                  ) : btn;
                })() : (
                  <Badge variant="success" dot>
                    {ui("Published")}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
      <ConfirmAction
        open={confirmPublish !== null}
        title={ui("Publish results?")}
        description={confirmPublish
          ? ui("Report cards for {0} become visible to students and families, who are notified. A later correction needs a mark-correction request.", [classLabel(confirmPublish)])
          : ""}
        confirmLabel={ui("Publish results")}
        cancelLabel={ui("Keep editing")}
        tone="warning"
        busy={confirmPublish !== null && busy === confirmPublish.examId}
        onCancel={() => setConfirmPublish(null)}
        onConfirm={() => { if (confirmPublish) void advance(confirmPublish, "PUBLISHED"); }}
      />
    </div>
  );
}

/** The same duty editor is reachable beside the existing seating editor. */
function ExamDutyControl({ sessionId }: { sessionId: string }) {
  const { language } = useLocale(), t = examSessionPlanCopy(language);
  const [open, setOpen] = useState(false), [dirty, setDirty] = useState(false);
  return <><Button variant="outline" onClick={() => setOpen(true)}><Users aria-hidden="true" />{t.duties}</Button>{open && <Modal title={t.duties} onClose={() => setOpen(false)} dirty={dirty} wide><ExamInvigilationPanel language={language} sessionId={sessionId} canEdit onDraftChange={setDirty} /></Modal>}</>;
}
