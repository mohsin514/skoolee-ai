"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  PenLine,
  Save,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Modal, ModalActions } from "@/components/ui/modal";
import { BrandButton } from "@/components/role-dashboard";
import { StatusPill } from "@/components/shared-admin";
import { ReportCardsPanel } from "@/components/academic/exams/ReportCardsPanel";
import { DatesheetBuilder } from "@/components/academic/DatesheetBuilder";
import type { ExamItem } from "@/components/academic/ExamCycleManager";
import { Meter } from "@/components/academic/exams/shared";

/**
 * One exam, in a centred dialog (§80).
 *
 * This replaced a right-hand slide-out drawer. A drawer is the right shape for
 * a preview you glance at and dismiss, and the wrong shape for the work that
 * actually happens here: entering marks for forty pupils across nine subjects.
 * That is a wide table, and a drawer gave it a third of the screen with the
 * page it came from still visible and still scrollable behind. Marks entry is
 * a task you sit down to, so it gets a dialog that owns the screen.
 *
 * Marks entry itself is rebuilt around one subject at a time. The old grid put
 * every subject across the top, so a class of forty and nine subjects was a
 * 360-cell table scrolling in both directions — and it saved on every blur, one
 * request per cell, with no way to tell what had actually been written.
 */

type TabKey = "marks" | "papers" | "reports";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "marks", label: "Enter marks", icon: PenLine },
  { key: "papers", label: "Dates & rooms", icon: CalendarDays },
  { key: "reports", label: "Report cards", icon: FileText },
];

export function ExamDetailDialog({
  exam,
  campusId,
  role = "OFFICE",
  initialTab,
  sequence,
  onNavigate,
  onClose,
  onChanged,
}: {
  exam: ExamItem;
  campusId?: string;
  role?: "OFFICE" | "TEACHER";
  initialTab?: TabKey;
  sequence?: { id: string; title: string }[];
  onNavigate?: (examId: string) => void;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const tabs = useMemo(
    () => (role === "TEACHER" ? TABS.filter((t) => t.key === "marks") : TABS),
    [role],
  );
  const [tab, setTab] = useState<TabKey>(role === "TEACHER" ? "marks" : initialTab ?? "marks");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (initialTab && role !== "TEACHER") setTab(initialTab);
  }, [initialTab, role]);

  const index = sequence ? sequence.findIndex((s) => s.id === exam.id) : -1;
  const prev = index > 0 ? sequence?.[index - 1] : undefined;
  const next =
    sequence && index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : undefined;

  const classLabel = exam.class
    ? [exam.class.name, exam.class.section].filter(Boolean).join(" ")
    : "—";

  return (
    <Modal
      title={exam.title}
      eyebrow={exam.examType?.replaceAll("_", " ") ?? "Exam"}
      subtitle={`${classLabel} · ${exam.term} · ${exam.academicYear} · ${exam.totalMarks} marks`}
      icon={PenLine}
      tone="violet"
      size="full"
      onClose={onClose}
      dirty={dirty}
      dirtyMessage="Some marks have not been saved yet. Discard them?"
      chips={<StatusPill status={exam.status} />}
      bodyClassName="p-0"
      headerActions={
        sequence && sequence.length > 1 && onNavigate ? (
          <div className="flex items-center gap-1 rounded-2xl bg-[#f6f2fa] px-1.5 py-1">
            <button
              type="button"
              disabled={!prev || dirty}
              onClick={() => prev && onNavigate(prev.id)}
              title={dirty ? "Save your marks first" : prev ? `Previous: ${prev.title}` : "First exam"}
              aria-label="Previous exam"
              className="flex h-7 w-7 items-center justify-center rounded-xl text-ink-muted transition-colors enabled:cursor-pointer hover:bg-white hover:text-[#8127cf] disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 text-[10px] font-black tabular-nums text-ink-muted">
              {index + 1}/{sequence.length}
            </span>
            <button
              type="button"
              disabled={!next || dirty}
              onClick={() => next && onNavigate(next.id)}
              title={dirty ? "Save your marks first" : next ? `Next: ${next.title}` : "Last exam"}
              aria-label="Next exam"
              className="flex h-7 w-7 items-center justify-center rounded-xl text-ink-muted transition-colors enabled:cursor-pointer hover:bg-white hover:text-[#8127cf] disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null
      }
    >
      {/* Tabs */}
      {tabs.length > 1 ? (
        <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-[#cfc2d6]/15 bg-white/95 px-5 py-2 backdrop-blur-xl">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-black uppercase tracking-wider transition-all",
                  active ? "text-[#8127cf]" : "text-ink-muted hover:text-[#8127cf]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-2 -bottom-2 h-0.5 rounded-full bg-gradient-to-r from-[#8127cf] to-[#b06bea]"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="p-5">
        {tab === "marks" ? (
          <MarksEntry exam={exam} onDirtyChange={setDirty} onSaved={onChanged} />
        ) : null}
        {tab === "papers" ? <DatesheetBuilder exam={exam} campusId={campusId} onChanged={onChanged} /> : null}
        {tab === "reports" ? (
          <ReportCardsPanel exam={exam} campusId={campusId} onChanged={onChanged} />
        ) : null}
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Marks entry
 * ────────────────────────────────────────────────────────────────────────── */

interface Student {
  id: string;
  fullName: string;
  rollNo: string;
}
interface Subject {
  id: string;
  name: string;
  totalMarks: number;
}

/**
 * The in-grid sentinel for "did not sit this paper".
 *
 * It never reaches the database: the save maps it to `isAbsent: true` with a
 * mark of 0, and the load maps that row back to this value. Keeping absence
 * out of the number is the point — a 0 that means "absent" and a 0 that means
 * "scored nothing" cannot be told apart once written.
 */
const ABSENT = -1;

function MarksEntry({
  exam,
  onDirtyChange,
  onSaved,
}: {
  exam: ExamItem;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: () => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [subjectId, setSubjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  /** The class's pass mark as a percentage, from Grading Rules (§82). It was
   *  hard-coded to 50 here, so a school with a 40% pass mark saw its own
   *  pupils marked FAIL on this screen and PASS on the report card. */
  const [passPct, setPassPct] = useState(50);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, cfg] = await Promise.all([
        fetch(`/api/marks?examId=${exam.id}`).then((r) => r.json()),
        fetch(
          `/api/grade-config?classId=${encodeURIComponent(exam.classId)}&academicYear=${exam.academicYear}`,
        )
          .then((r) => r.json())
          .catch(() => null),
      ]);
      if (!res.success) throw new Error(res.error || "Could not load marks");
      if (cfg?.config?.passingPercentage != null) setPassPct(cfg.config.passingPercentage);
      setStudents(res.students ?? []);
      setSubjects(res.subjects ?? []);
      setLocked(Boolean(res.exam?.isLocked));
      const map: Record<string, number> = {};
      (res.marks ?? []).forEach((m: { studentId: string; subjectId: string; marksObtained: number; isAbsent?: boolean }) => {
        // Absence comes back as its own fact, not as the 0 stored beside it.
        map[`${m.studentId}:${m.subjectId}`] = m.isAbsent ? ABSENT : m.marksObtained;
      });
      setSaved(map);
      setDraft({});
      setSubjectId((cur) => cur || res.subjects?.[0]?.id || "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load marks");
    } finally {
      setLoading(false);
    }
  }, [exam.id, exam.classId, exam.academicYear]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount = Object.keys(draft).length;
  useEffect(() => {
    onDirtyChange(pendingCount > 0);
  }, [pendingCount, onDirtyChange]);

  const subject = subjects.find((s) => s.id === subjectId);

  const valueFor = useCallback(
    (studentId: string) => {
      const key = `${studentId}:${subjectId}`;
      return key in draft ? draft[key] : saved[key];
    },
    [draft, saved, subjectId],
  );

  const setValue = useCallback(
    (studentId: string, value: number | undefined) => {
      const key = `${studentId}:${subjectId}`;
      setDraft((prev) => {
        const next = { ...prev };
        if (value === undefined || value === saved[key]) delete next[key];
        else next[key] = value;
        return next;
      });
    },
    [subjectId, saved],
  );

  /**
   * Enter and the arrow keys walk down the column.
   *
   * Typing marks is a two-hand job — numbers with one, Enter with the other —
   * and reaching for the mouse between every pupil is what makes a class of
   * forty take twenty minutes instead of three.
   */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      inputs.current[index + 1]?.focus();
      inputs.current[index + 1]?.select();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      inputs.current[index - 1]?.focus();
      inputs.current[index - 1]?.select();
    }
  };

  const saveAll = async () => {
    if (!subject || pendingCount === 0) return;
    setSaving(true);
    try {
      const entries = Object.entries(draft)
        .filter(([key]) => key.endsWith(`:${subjectId}`))
        .map(([key, marksObtained]) => ({
          studentId: key.split(":")[0],
          subjectId,
          marksObtained: marksObtained === ABSENT ? 0 : marksObtained,
          isAbsent: marksObtained === ABSENT,
        }));
      if (entries.length === 0) return;

      const res = await fetch("/api/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: exam.id, entries }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || json.error || "Could not save");

      setSaved((prev) => {
        const next = { ...prev };
        entries.forEach(
          (e) => (next[`${e.studentId}:${e.subjectId}`] = e.isAbsent ? ABSENT : e.marksObtained),
        );
        return next;
      });
      setDraft((prev) => {
        const next = { ...prev };
        Object.keys(next)
          .filter((k) => k.endsWith(`:${subjectId}`))
          .forEach((k) => delete next[k]);
        return next;
      });
      toast.success(`${entries.length} mark${entries.length === 1 ? "" : "s"} saved`);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    if (!subject) return { entered: 0, total: 0, average: 0, passing: 0, top: 0 };
    const values = students
      .map((s) => valueFor(s.id))
      .filter((v): v is number => v !== undefined && v >= 0);
    const pass = (subject.totalMarks * passPct) / 100;
    return {
      entered: students.filter((s) => valueFor(s.id) !== undefined).length,
      total: students.length,
      average: values.length
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
        : 0,
      passing: values.filter((v) => v >= pass).length,
      top: values.length ? Math.max(...values) : 0,
    };
  }, [students, subject, valueFor, passPct]);

  const subjectProgress = useMemo(() => {
    return subjects.map((s) => {
      const done = students.filter(
        (st) => `${st.id}:${s.id}` in saved || `${st.id}:${s.id}` in draft,
      ).length;
      return { ...s, done, total: students.length };
    });
  }, [subjects, students, saved, draft]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-12 rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-11 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[#cfc2d6]/35 p-14 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-[#8127cf]/25" />
        <p className="text-sm font-black text-[#1f1a23]">No students in this class</p>
        <p className="mt-1 text-xs font-semibold text-ink-muted">
          Add students to the class and their rows appear here.
        </p>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[#cfc2d6]/35 p-14 text-center">
        <PenLine className="mx-auto mb-3 h-10 w-10 text-[#8127cf]/25" />
        <p className="text-sm font-black text-[#1f1a23]">No subjects to mark</p>
        <p className="mt-1 text-xs font-semibold text-ink-muted">
          This class has no subjects, or none are assigned to you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {locked ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200/70 bg-amber-50/60 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs font-bold text-amber-700">
            This exam is locked. Marks are read-only until it is unlocked.
          </p>
        </div>
      ) : null}

      {/* ── Subject picker ──────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
        {subjectProgress.map((s) => {
          const active = s.id === subjectId;
          const complete = s.done === s.total && s.total > 0;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSubjectId(s.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "group flex shrink-0 cursor-pointer flex-col gap-1.5 rounded-2xl border px-3.5 py-2 transition-all duration-200",
                active
                  ? "border-[#8127cf] bg-gradient-to-br from-[#faf5ff] to-white shadow-[0_0_0_1px_rgba(129,39,207,0.3),0_10px_24px_-14px_rgba(129,39,207,0.5)]"
                  : "border-[#cfc2d6]/25 bg-white hover:-translate-y-0.5 hover:border-[#8127cf]/35",
              )}
            >
              <span className="flex items-center gap-1.5">
                {complete ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : null}
                <span
                  className={cn(
                    "whitespace-nowrap text-xs font-black",
                    active ? "text-[#8127cf]" : "text-[#1f1a23]",
                  )}
                >
                  {s.name}
                </span>
                <span className="text-[10px] font-bold tabular-nums text-ink-subtle">
                  {s.done}/{s.total}
                </span>
              </span>
              <Meter
                value={s.done}
                total={s.total}
                tone={complete ? "emerald" : "violet"}
                className="w-full"
              />
            </button>
          );
        })}
      </div>

      {/* ── Live stats for the chosen subject ───────────────────────────── */}
      {subject ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[#cfc2d6]/20 bg-gradient-to-r from-[#faf7fc] to-white px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-black text-[#8127cf]">
            <BarChart3 className="h-3.5 w-3.5" />
            {subject.name} · out of {subject.totalMarks}
          </span>
          <span className="text-[11px] font-bold text-ink-muted">
            Entered <span className="tabular-nums text-[#1f1a23]">{stats.entered}/{stats.total}</span>
          </span>
          <span className="text-[11px] font-bold text-ink-muted">
            Average <span className="tabular-nums text-[#1f1a23]">{stats.average}</span>
          </span>
          <span className="text-[11px] font-bold text-ink-muted">
            Passing <span className="tabular-nums text-emerald-600">{stats.passing}</span>
          </span>
          <span className="text-[11px] font-bold text-ink-muted">
            Top <span className="tabular-nums text-[#1f1a23]">{stats.top}</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {pendingCount > 0 ? (
              <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                {pendingCount} unsaved
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                <Check className="h-3 w-3" />
                All saved
              </span>
            )}
            <BrandButton
              onClick={saveAll}
              disabled={saving || pendingCount === 0 || locked}
              icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              className="min-h-9 px-3.5 text-xs"
            >
              {saving ? "Saving…" : "Save marks"}
            </BrandButton>
          </div>
        </div>
      ) : null}

      {/* ── The column ──────────────────────────────────────────────────── */}
      {subject ? (
        <div className="overflow-hidden rounded-[20px] border border-[#cfc2d6]/20 bg-white">
          <div className="grid grid-cols-[3rem_1fr_7rem_5rem_5rem] items-center gap-2 border-b border-[#cfc2d6]/15 bg-[#faf7fc] px-4 py-2 text-[9px] font-black uppercase tracking-wider text-ink-muted">
            <span>Roll</span>
            <span>Student</span>
            <span className="text-center">Marks / {subject.totalMarks}</span>
            <span className="text-center">%</span>
            <span className="text-center">Result</span>
          </div>
          <ul className="max-h-[24rem] divide-y divide-[#cfc2d6]/10 overflow-y-auto custom-scrollbar">
            {students.map((student, i) => {
              const value = valueFor(student.id);
              const key = `${student.id}:${subjectId}`;
              const unsaved = key in draft;
              const absent = value === ABSENT;
              const pct =
                value !== undefined && value >= 0 && subject.totalMarks > 0
                  ? Math.round((value / subject.totalMarks) * 100)
                  : null;
              const pass = pct !== null && pct >= passPct;
              return (
                <li
                  key={student.id}
                  className={cn(
                    "grid grid-cols-[3rem_1fr_7rem_5rem_5rem] items-center gap-2 px-4 py-1.5 transition-colors",
                    unsaved ? "bg-amber-50/40" : "hover:bg-[#faf7fc]",
                  )}
                >
                  <span className="text-[11px] font-bold tabular-nums text-ink-subtle">
                    {student.rollNo}
                  </span>
                  <span className="truncate text-[13px] font-bold text-[#1f1a23]">
                    {student.fullName}
                  </span>
                  <div className="flex items-center justify-center gap-1">
                    <input
                      ref={(el) => {
                        inputs.current[i] = el;
                      }}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={subject.totalMarks}
                      disabled={locked || absent}
                      value={value === undefined || absent ? "" : value}
                      onKeyDown={(e) => onKey(e, i)}
                      // Clicking into a cell that already has a mark should
                      // let you retype it, not append a digit to it — 8 typed
                      // into a 45 is a 458, clamped to the paper's total.
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") return setValue(student.id, undefined);
                        const n = Math.max(0, Math.min(Number(raw), subject.totalMarks));
                        setValue(student.id, n);
                      }}
                      placeholder="—"
                      className={cn(
                        "w-16 rounded-lg border px-2 py-1.5 text-center text-sm font-black tabular-nums outline-none transition-all focus:ring-4 focus:ring-[#8127cf]/15",
                        absent
                          ? "border-[#cfc2d6]/25 bg-[#f3f4f9] text-ink-subtle"
                          : pct === null
                          ? "border-[#cfc2d6]/25 bg-white text-[#1f1a23] focus:border-[#8127cf]/50"
                          : pass
                          ? "border-emerald-200 bg-emerald-50/60 text-emerald-700 focus:border-emerald-400"
                          : "border-rose-200 bg-rose-50/60 text-rose-600 focus:border-rose-400",
                      )}
                    />
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setValue(student.id, absent ? undefined : ABSENT)}
                      title={absent ? "Mark present" : "Mark absent"}
                      className={cn(
                        "h-6 shrink-0 rounded-md px-1.5 text-[9px] font-black uppercase transition-colors enabled:cursor-pointer disabled:opacity-40",
                        absent
                          ? "bg-[#1f1a23] text-white"
                          : "bg-[#f3f4f9] text-ink-subtle hover:bg-[#e8e0ec]",
                      )}
                    >
                      Abs
                    </button>
                  </div>
                  <span
                    className={cn(
                      "text-center text-xs font-black tabular-nums",
                      pct === null
                        ? "text-ink-subtle"
                        : pass
                        ? "text-emerald-600"
                        : "text-rose-500",
                    )}
                  >
                    {absent ? "—" : pct === null ? "—" : `${pct}%`}
                  </span>
                  <span className="text-center">
                    {absent ? (
                      <span className="rounded-md bg-[#f3f4f9] px-1.5 py-0.5 text-[9px] font-black uppercase text-ink-subtle">
                        Absent
                      </span>
                    ) : pct === null ? (
                      <span className="text-[10px] font-bold text-ink-subtle">—</span>
                    ) : (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase",
                          pass ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600",
                        )}
                      >
                        {pass ? "Pass" : "Fail"}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-[#cfc2d6]/10 bg-[#faf7fc] px-4 py-2 text-[10px] font-semibold text-ink-subtle">
            Press <kbd className="rounded bg-white px-1 font-black">Enter</kbd> to move to the next
            pupil. Nothing is written until you press Save, so a mistyped mark can just be
            corrected.
          </p>
        </div>
      ) : null}
    </div>
  );
}
