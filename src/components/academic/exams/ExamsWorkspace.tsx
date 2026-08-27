"use client";

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
  Loader2,
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandButton } from "@/components/role-dashboard";
import { Modal, ModalActions } from "@/components/ui/modal";
import { StatusPill } from "@/components/shared-admin";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/academic/exam-permissions";
import type { ExamItem } from "@/components/academic/ExamCycleManager";
import { SessionWizard } from "@/components/academic/exams/SessionWizard";
import { MasterDatesheet } from "@/components/academic/exams/MasterDatesheet";
import { SeatingPlanner } from "@/components/academic/exams/SeatingPlanner";
import { ExamDetailDialog } from "@/components/academic/exams/ExamDetailDialog";
import { Meter, Panel, ProgressStat, StepEmpty } from "@/components/academic/exams/shared";

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

export function ExamsWorkspace({ campusId }: { campusId?: string }) {
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

  const academicYear = new Date().getFullYear();

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const qs = campusId ? `?campusId=${campusId}` : "";
        const [sessRes, examRes] = await Promise.all([
          fetch(`/api/academic/exam-sessions${qs}`).then((r) => r.json()),
          fetch(`/api/exams${qs}`).then((r) => r.json()),
        ]);

        const list: Session[] = sessRes.success ? sessRes.data : [];
        setSessions(list);
        setActiveId((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));

        // Exams that predate sessions, or a teacher's class tests. They are
        // real work with real marks, so they stay reachable — just not on the
        // main rail, which is about the term exam the office is running.
        const all: ExamItem[] = examRes.success ? examRes.exams : [];
        setLegacy(all.filter((e) => !(e as ExamItem & { sessionId?: string }).sessionId));
      } catch {
        if (!silent) toast.error("Could not load exams");
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
          ? `Removed. ${json.data.keptExams} class${json.data.keptExams === 1 ? "" : "es"} kept because they already have marks.`
          : "Exam removed",
      );
      setDeleting(null);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the exam");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-[24px] bg-[#e8e0ec]/40 skeleton-shimmer" />
        <div className="h-20 rounded-[24px] bg-[#e8e0ec]/40 skeleton-shimmer" />
        <div className="h-72 rounded-[24px] bg-[#e8e0ec]/40 skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="sk-rise space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-[28px] border border-[#cfc2d6]/25 bg-gradient-to-br from-[#8127cf] via-[#7322bb] to-[#5c1a96] px-6 py-5 text-white shadow-[0_18px_48px_-24px_rgba(129,39,207,0.7)]">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-24 h-56 w-56 rounded-full bg-[#b06bea]/25 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
              Exams &amp; Results
            </p>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight">
              {active ? active.title : "No exam scheduled yet"}
            </h2>
            <p className="mt-1 text-xs font-semibold text-white/70">
              {active
                ? `${active.classCount} class${active.classCount === 1 ? "" : "es"} · ${active.studentCount} candidates · ${active.term} ${active.academicYear}` +
                  (active.firstDate ? ` · ${active.firstDate} to ${active.lastDate}` : "")
                : "Schedule mid-term or final exams for every class in one step."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => load(true)}
              aria-label="Refresh"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-white/12 text-white/80 transition-colors hover:bg-white/20"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={() => setWizard(true)}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-[#8127cf] shadow-lg transition-all hover:scale-[1.03] active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Schedule exam
            </button>
          </div>
        </div>

        {/* Session switcher — only when there is a choice to make. */}
        {sessions.length > 1 ? (
          <div className="relative mt-4 flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {sessions.map((s) => {
              const on = s.id === activeId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  aria-pressed={on}
                  className={cn(
                    "shrink-0 cursor-pointer rounded-xl px-3 py-1.5 text-[11px] font-black transition-all",
                    on
                      ? "bg-white text-[#8127cf] shadow-md"
                      : "bg-white/12 text-white/75 hover:bg-white/20",
                  )}
                >
                  {s.title}
                </button>
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
            <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setWizard(true)}>
              Schedule an exam
            </BrandButton>
          }
        />
      ) : (
        <>
          {/* ── The rail ──────────────────────────────────────────────── */}
          <nav
            aria-label="Exam steps"
            className="grid gap-2 rounded-[24px] border border-[#cfc2d6]/25 bg-white p-2.5 shadow-[0_2px_6px_rgba(31,26,35,0.05),0_14px_34px_-22px_rgba(129,39,207,0.3)] sm:grid-cols-3 xl:grid-cols-5"
          >
            {STEPS.map((s) => {
              const value = progress[s.key];
              const on = step === s.key;
              const done = value >= 100;
              const isNext = currentStep === s.key && !done;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(s.key)}
                  aria-current={on ? "step" : undefined}
                  className={cn(
                    "group relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-[18px] border px-3 py-2.5 text-left transition-all duration-200",
                    on
                      ? "border-[#8127cf] bg-gradient-to-br from-[#faf5ff] to-white shadow-[0_0_0_1px_rgba(129,39,207,0.28)]"
                      : "border-transparent bg-[#faf7fc] hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:bg-white",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black transition-colors",
                      done
                        ? "bg-emerald-500 text-white"
                        : on || isNext
                        ? "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white"
                        : "bg-white text-ink-subtle ring-1 ring-[#cfc2d6]/35",
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "truncate text-xs font-black",
                          on ? "text-[#8127cf]" : "text-[#1f1a23]",
                        )}
                      >
                        {s.index}. {s.label}
                      </span>
                      {isNext ? (
                        <span className="shrink-0 rounded bg-[#f3eeff] px-1 py-px text-[8px] font-black uppercase tracking-wider text-[#8127cf]">
                          Next
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-semibold text-ink-subtle">
                      {done ? "Done" : `${value}% · ${s.blurb}`}
                    </span>
                    <Meter
                      value={value}
                      total={100}
                      tone={done ? "emerald" : "violet"}
                      className="mt-1.5"
                    />
                  </span>
                </button>
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
              <SeatingPlanner
                sessionId={active.id}
                campusId={campusId}
                onChanged={() => load(true)}
              />
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
        <div className="rounded-[24px] border border-[#cfc2d6]/25 bg-white">
          <button
            type="button"
            onClick={() => setShowLegacy((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f9]">
              <MoreHorizontal className="h-4 w-4 text-ink-muted" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-[#1f1a23]">
                Other exams ({legacy.length})
              </span>
              <span className="block text-[11px] font-semibold text-ink-muted">
                Teachers&apos; quizzes and class tests, plus anything scheduled before exams were
                organised by term.
              </span>
            </span>
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-ink-subtle transition-transform",
                showLegacy && "rotate-90",
              )}
            />
          </button>
          {showLegacy ? (
            <ul className="divide-y divide-[#cfc2d6]/12 border-t border-[#cfc2d6]/12">
              {legacy.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setOpenExam(e)}
                    className="flex w-full cursor-pointer items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#faf7fc]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black text-[#1f1a23]">
                        {e.title}
                      </span>
                      <span className="block truncate text-[10px] font-semibold text-ink-subtle">
                        {[e.class?.name, e.class?.section].filter(Boolean).join(" ")} ·{" "}
                        {EXAM_TYPE_LABELS[e.examType as ExamType] ?? e.examType} · {e.term}
                      </span>
                    </span>
                    <StatusPill status={e.status} />
                  </button>
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
          title={`Remove "${deleting.title}"?`}
          subtitle="Classes that already have marks are kept and simply detached. Empty ones are removed with it."
          icon={Trash2}
          tone="rose"
          size="sm"
          role="alertdialog"
          onClose={() => setDeleting(null)}
          footer={
            <ModalActions
              actionLabel="Remove exam"
              cancelLabel="Keep it"
              tone="rose"
              onCancel={() => setDeleting(null)}
              onAction={() => deleteSession(deleting)}
            />
          }
        >
          <p className="text-sm font-semibold text-ink-muted">
            The date sheet and seating plan for the empty classes go too. No marks are ever
            deleted.
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
            <button
              type="button"
              onClick={onDelete}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-[11px] font-black uppercase tracking-wider text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove exam
            </button>
            <BrandButton
              onClick={onNext}
              icon={<ChevronRight className="h-4 w-4" />}
              className="min-h-9 px-3.5 text-xs"
            >
              Build the date sheet
            </BrandButton>
          </>
        }
        bodyClassName="p-3"
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {session.classes.map((cls) => (
            <button
              key={cls.examId}
              type="button"
              onClick={() => onOpenExam(cls.examId)}
              className="group cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/35 hover:shadow-[0_12px_28px_-18px_rgba(129,39,207,0.5)]"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-black text-[#1f1a23]">
                  {classLabel(cls)}
                </span>
                <StatusPill status={cls.status} />
              </div>
              <p className="mt-1 text-[10px] font-bold text-ink-subtle">
                {cls.studentCount} students · {cls.subjectCount} subjects
              </p>
              <div className="mt-2 space-y-1.5">
                <MiniBar label="Dated" value={cls.scheduled} total={cls.subjectCount} />
                <MiniBar label="Seated" value={cls.seated} total={cls.scheduled} />
                <MiniBar label="Marked" value={cls.marksEntered} total={cls.marksExpected} />
              </div>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MiniBar({ label, value, total }: { label: string; value: number; total: number }) {
  const done = total > 0 && value >= total;
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
        {label}
      </span>
      <Meter value={value} total={total} tone={done ? "emerald" : "violet"} className="flex-1" />
      <span className="w-11 shrink-0 text-right text-[9px] font-bold tabular-nums text-ink-subtle">
        {value}/{total}
      </span>
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
        <ul className="divide-y divide-[#cfc2d6]/12">
          {sorted.map((cls) => {
            const done = cls.marksExpected > 0 && cls.marksEntered >= cls.marksExpected;
            return (
              <li key={cls.examId}>
                <button
                  type="button"
                  onClick={() => onOpen(cls)}
                  className="group flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#faf7fc]"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      done ? "bg-emerald-50 text-emerald-600" : "bg-[#f3eeff] text-[#8127cf]",
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-black text-[#1f1a23]">
                        {classLabel(cls)}
                      </span>
                      <StatusPill status={cls.status} />
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <Meter
                        value={cls.marksEntered}
                        total={cls.marksExpected}
                        tone={done ? "emerald" : "violet"}
                        className="max-w-xs"
                      />
                      <span className="shrink-0 text-[10px] font-bold tabular-nums text-ink-subtle">
                        {cls.marksEntered}/{cls.marksExpected}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-[#8127cf]" />
                </button>
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
  const [busy, setBusy] = useState<string | null>(null);

  const advance = async (cls: SessionClass, status: string) => {
    setBusy(cls.examId);
    try {
      const res = await fetch("/api/exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cls.examId, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update this exam");
      toast.success(`${classLabel(cls)} → ${status.replaceAll("_", " ").toLowerCase()}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update this exam");
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
        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-amber-200/70 bg-amber-50/50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-xs font-bold text-amber-700">
            {incomplete.length} class{incomplete.length === 1 ? "" : "es"} still have marks
            outstanding. Publishing before they are in produces report cards with blanks on them.
          </p>
        </div>
      ) : null}

      <Panel
        title="Review and publish"
        subtitle="Lock the marks, have them reviewed, then release the report cards."
        icon={BadgeCheck}
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-[#cfc2d6]/12">
          {session.classes.map((cls) => {
            const action = RESULT_ACTIONS[cls.status];
            const complete = cls.marksExpected > 0 && cls.marksEntered >= cls.marksExpected;
            const published = cls.status === "PUBLISHED";
            return (
              <li key={cls.examId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    published ? "bg-emerald-50 text-emerald-600" : "bg-[#f3eeff] text-[#8127cf]",
                  )}
                >
                  {published ? <BadgeCheck className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-black text-[#1f1a23]">
                      {classLabel(cls)}
                    </span>
                    <StatusPill status={cls.status} />
                  </span>
                  <span className="mt-0.5 block text-[10px] font-bold text-ink-subtle">
                    {cls.marksEntered}/{cls.marksExpected} marks ·{" "}
                    {complete ? "complete" : "incomplete"}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => onOpen(cls)}
                  className="h-9 cursor-pointer rounded-xl bg-[#f6f2fa] px-3 text-[11px] font-black uppercase tracking-wider text-ink-muted transition-colors hover:bg-[#f3eeff] hover:text-[#8127cf]"
                >
                  Report cards
                </button>

                {action ? (
                  <button
                    type="button"
                    disabled={busy === cls.examId || (!complete && action.next === "LOCKED")}
                    onClick={() => advance(cls, action.next)}
                    title={
                      !complete && action.next === "LOCKED"
                        ? "Every mark has to be in before the exam can be locked"
                        : undefined
                    }
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] px-3 text-[11px] font-black uppercase tracking-wider text-white shadow-[0_8px_20px_-10px_rgba(129,39,207,0.6)] transition-all enabled:cursor-pointer enabled:hover:scale-[1.03] disabled:opacity-40"
                  >
                    {busy === cls.examId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <action.icon className="h-3.5 w-3.5" />
                    )}
                    {action.label}
                  </button>
                ) : (
                  <span className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-[11px] font-black uppercase tracking-wider text-emerald-600">
                    <Check className="h-3.5 w-3.5" />
                    Published
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
