"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogBehaviour } from "@/components/ui/modal";
import {
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PenLine,
  SlidersHorizontal,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/shared-admin";
import type { ExamItem, ExamCycleRole } from "@/components/academic/ExamCycleManager";
import { DatesheetBuilder } from "@/components/academic/DatesheetBuilder";
import { GradeConfigInline } from "@/components/academic/GradeConfigInline";
import { ReportCardPipeline } from "@/components/academic/ReportCardPipeline";

type TabKey = "schedule" | "marks" | "grade" | "reports";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "schedule", label: "Dates & Rooms", icon: CalendarDays },
  { key: "marks", label: "Enter Marks", icon: PenLine },
  { key: "grade", label: "Grading Rules", icon: SlidersHorizontal },
  { key: "reports", label: "Report Cards", icon: FileText },
];

export function ExamDetailPanel({
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
  role?: ExamCycleRole;
  /** Which tab to land on — set when the board opens the panel at a job. */
  initialTab?: TabKey;
  /** The exams currently on screen, so the panel can step through them. */
  sequence?: { id: string; title: string }[];
  onNavigate?: (examId: string) => void;
  onClose: () => void;
  onChanged?: () => void;
}) {
  // Teachers only enter marks — dates, grading rules and report cards are the
  // office's responsibility.
  const tabs = useMemo(
    () => (role === "TEACHER" ? TABS.filter((t) => t.key === "marks") : TABS),
    [role],
  );
  const [tab, setTab] = useState<TabKey>(
    role === "TEACHER" ? "marks" : initialTab ?? "schedule",
  );
  const [show, setShow] = useState(false);
  const closingRef = useRef(false);

  // The board can open this panel straight at a job — "set dates", "enter
  // marks" — so a later request for a different tab has to win over whatever
  // the user last clicked.
  useEffect(() => {
    if (initialTab && role !== "TEACHER") setTab(initialTab);
  }, [initialTab, role]);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setShow(false);
    setTimeout(() => onClose(), 300);
  }, [onClose]);

  // Stepping between exams without closing the panel is the difference between
  // reviewing ten classes and closing ten drawers.
  const index = useMemo(
    () => (sequence ? sequence.findIndex((s) => s.id === exam.id) : -1),
    [sequence, exam.id],
  );
  const prev = index > 0 ? sequence?.[index - 1] : undefined;
  const next =
    sequence && index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (!typing && e.key === "ArrowDown" && next && onNavigate) {
        e.preventDefault();
        onNavigate(next.id);
      } else if (!typing && e.key === "ArrowUp" && prev && onNavigate) {
        e.preventDefault();
        onNavigate(prev.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [next, prev, onNavigate]);

  /**
   * This is a side drawer, not a centred dialog, so it keeps its own slide-in
   * presentation rather than moving to `Modal`. What it takes from the shared
   * shell are the parts that were missing: a stack-assigned layer instead of a
   * hand-picked `z-[150]`, a focus trap, a scroll lock on the page behind, and
   * an Escape that defers to whatever is stacked above it.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  const { z } = useDialogBehaviour(panelRef, { onClose: handleClose });

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: z }}>
      <div
        className={cn(
          "absolute inset-0 bg-[#1f1a23]/45 backdrop-blur-md transition-opacity duration-300",
          show ? "opacity-100" : "opacity-0"
        )}
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={exam.title}
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full max-w-3xl flex-col bg-[#faf7fc] shadow-[0_34px_90px_rgba(31,26,35,0.22)] transition-transform duration-300 ease-out focus:outline-none",
          show ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-[#cfc2d6]/15 bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                  {exam.examType?.replaceAll("_", " ") || "Exam"}
                </span>
                <StatusPill status={exam.status} />
              </div>
              <h2 className="text-2xl font-black tracking-tight">{exam.title}</h2>
              <p className="mt-1 text-xs font-semibold text-white/70">
                {exam.class ? [exam.class.name, exam.class.section].filter(Boolean).join(" ") : "—"} ·{" "}
                {exam.term} · {exam.academicYear} · {exam.totalMarks} marks
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {sequence && sequence.length > 1 && onNavigate ? (
                <div className="mr-1 flex items-center gap-1 rounded-2xl bg-white/12 px-1.5 py-1">
                  <button
                    type="button"
                    disabled={!prev}
                    onClick={() => prev && onNavigate(prev.id)}
                    title={prev ? `Previous: ${prev.title}` : "First exam"}
                    aria-label="Previous exam"
                    className="flex h-7 w-7 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35 enabled:cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-1 text-[10px] font-black tabular-nums text-white/80">
                    {index + 1}/{sequence.length}
                  </span>
                  <button
                    type="button"
                    disabled={!next}
                    onClick={() => next && onNavigate(next.id)}
                    title={next ? `Next: ${next.title}` : "Last exam"}
                    aria-label="Next exam"
                    className="flex h-7 w-7 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35 enabled:cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl text-white/80 transition-colors hover:bg-white/15"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 items-center gap-1 border-b border-[#cfc2d6]/10 bg-white px-4 py-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer",
                  tab === t.key
                    ? "bg-[#8127cf]/10 text-[#8127cf]"
                    : "text-ink-muted hover:text-[#8127cf]"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {tab === "schedule" ? (
            <DatesheetBuilder exam={exam} campusId={campusId} onChanged={onChanged} />
          ) : null}
          {tab === "marks" ? <MarksGrid exam={exam} /> : null}
          {tab === "grade" ? (
            <GradeConfigInline exam={exam} campusId={campusId} />
          ) : null}
          {tab === "reports" ? (
            <ReportCardPipeline exam={exam} campusId={campusId} onChanged={onChanged} />
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

function MarksGrid({ exam }: { exam: ExamItem }) {
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marks?examId=${exam.id}`).then((r) => r.json());
      if (!res.success) throw new Error(res.error || "Failed to load marks");
      setStudents(res.students || []);
      setSubjects(res.subjects || []);
      const map: Record<string, number> = {};
      (res.marks || []).forEach((m: any) => {
        map[`${m.studentId}:${m.subjectId}`] = m.marksObtained;
      });
      setMarks(map);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load marks");
    } finally {
      setLoading(false);
    }
  }, [exam.id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveCell = useCallback(
    async (studentId: string, subjectId: string, value: number) => {
      const key = `${studentId}:${subjectId}`;
      setSavingKey(key);
      try {
        const res = await fetch("/api/marks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examId: exam.id,
            entries: [{ studentId, subjectId, marksObtained: value }],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
      } catch (e: any) {
        toast.error(e?.message || "Save failed");
      } finally {
        setSavingKey(null);
      }
    },
    [exam.id]
  );

  if (loading) {
    return (
      <div className="space-y-3 animate-skeleton-in">
        <div className="h-8 w-full rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 w-full rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#cfc2d6]/30 bg-white p-16 text-center">
        <PenLine className="mb-3 h-10 w-10 text-ink-subtle" />
        <p className="text-sm font-bold text-ink-muted">No students in this exam&apos;s class</p>
      </div>
    );
  }

  const markedCount = new Set(Object.keys(marks).map((k) => k.split(":")[1])).size;

  return (
    <div className="space-y-4">
      {subjects.length > 0 && (
        <div className="rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-3 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold">
            <span className="text-ink-muted">Subjects completed</span>
            <span className="text-[#8127cf]">
              {markedCount}/{subjects.length}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#e8e0ec]/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round((markedCount / subjects.length) * 100))}%` }}
            />
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-3xl border border-[#cfc2d6]/15 bg-white shadow-sm">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#cfc2d6]/10 bg-[#fbf0fe]/30">
            <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-ink-muted">
              #
            </th>
            <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-ink-muted">
              Student
            </th>
            {subjects.map((s) => (
              <th
                key={s.id}
                className="px-4 py-3 text-center text-[9px] font-black uppercase tracking-wider text-ink-muted"
              >
                {s.name}
                <br />
                <span className="text-[8px] font-semibold">/ {s.totalMarks}</span>
              </th>
            ))}
            <th className="px-4 py-3 text-center text-[9px] font-black uppercase tracking-wider text-ink-muted">
              Total
            </th>
            <th className="px-4 py-3 text-center text-[9px] font-black uppercase tracking-wider text-ink-muted">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, idx) => {
            const total = subjects.reduce(
              (sum, sub) => sum + (marks[`${student.id}:${sub.id}`] ?? 0),
              0
            );
            const maxTotal = subjects.reduce((sum, sub) => sum + (sub.totalMarks || 0), 0);
            const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
            return (
              <tr
                key={student.id}
                className="border-b border-[#cfc2d6]/5 hover:bg-[#fbf0fe]/20 transition-colors"
              >
                <td className="px-4 py-2.5 text-xs font-bold text-ink-subtle">{idx + 1}</td>
                <td className="px-4 py-2.5">
                  <p className="text-sm font-bold text-[#1f1a23]">{student.fullName}</p>
                  <p className="text-[10px] font-semibold text-ink-subtle">{student.rollNo}</p>
                </td>
                {subjects.map((sub) => {
                  const key = `${student.id}:${sub.id}`;
                  const val = marks[key];
                  const passMark = (sub.totalMarks || 0) * 0.5;
                  const isPass = val !== undefined && val >= passMark;
                  const isFail = val !== undefined && val < passMark;
                  const isSaving = savingKey === key;
                  return (
                    <td key={sub.id} className="px-2 py-2 text-center">
                      <input
                        type="number"
                        min={0}
                        max={sub.totalMarks || undefined}
                        defaultValue={val ?? ""}
                        onBlur={(e) => {
                          const raw = e.target.value;
                          if (raw === "" ) {
                            if (val !== undefined) {
                              setMarks((m) => {
                                const n = { ...m };
                                delete n[key];
                                return n;
                              });
                            }
                            return;
                          }
                          const num = Math.max(0, Math.min(Number(raw), sub.totalMarks || Infinity));
                          e.target.value = String(num);
                          if (num !== val) {
                            setMarks((m) => ({ ...m, [key]: num }));
                            saveCell(student.id, sub.id, num);
                          }
                        }}
                        className={cn(
                          "w-16 rounded-xl border px-2 py-1.5 text-center text-sm font-bold outline-none transition-colors focus:ring-4 focus:ring-[#8127cf]/20",
                          isSaving && "opacity-50",
                          isPass
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : isFail
                            ? "border-rose-200 bg-rose-50 text-rose-600"
                            : "border-[#cfc2d6]/20 bg-white text-[#1f1a23]"
                        )}
                      />
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-center text-sm font-black text-[#8127cf]">
                  {total}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={cn(
                      "text-sm font-black",
                      pct >= 80
                        ? "text-emerald-600"
                        : pct >= 50
                        ? "text-amber-600"
                        : "text-rose-500"
                    )}
                  >
                    {pct}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t border-[#cfc2d6]/10 bg-[#fbf0fe]/20 px-4 py-2.5 text-[10px] font-semibold text-ink-muted">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Green = pass (≥50%),{" "}
        <span className="text-rose-500">Rose = fail</span>. Marks auto-save on blur.
      </div>
      </div>
    </div>
  );
}
