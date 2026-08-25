"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  GripVertical,
  Lock,
  MoreVertical,
  PenLine,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/shared-admin";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/academic/exam-permissions";
import {
  classLabel,
  columnsForRole,
  evaluateMove,
  formatDateRange,
  marksProgress,
  nextAction,
  type ColumnKey,
  type ExamCycleRole,
  type ExamItem,
  type ExamMeta,
  type NextAction,
  type ScheduleSummary,
} from "@/lib/academic/exam-pipeline";

export type DetailTab = "schedule" | "marks" | "grade" | "reports";

const ACCENT_BY_STATUS: Record<string, string> = {
  PUBLISHED: "#10b981",
  PRINCIPAL_REVIEWED: "#d97706",
  LOCKED: "#d97706",
  MARKS_ENTRY: "#f59e0b",
};

function accentFor(exam: ExamItem, hasSchedule: boolean) {
  return ACCENT_BY_STATUS[exam.status] ?? (hasSchedule ? "#0d9488" : "#8127cf");
}

export interface ExamBoardCardProps {
  exam: ExamItem;
  meta?: ExamMeta;
  schedule?: ScheduleSummary;
  role: ExamCycleRole;
  density: "compact" | "comfortable";
  selected: boolean;
  /** True while any card is selected, so checkboxes stay visible on all cards. */
  selectionActive: boolean;
  dragging: boolean;
  flagged: boolean;
  onOpen: (tab?: DetailTab) => void;
  onToggleSelect: () => void;
  onAdvance: (action: NextAction) => void;
  onReject: () => void;
  onMove: (to: ColumnKey) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export function ExamBoardCard({
  exam,
  meta,
  schedule,
  role,
  density,
  selected,
  selectionActive,
  dragging,
  flagged,
  onOpen,
  onToggleSelect,
  onAdvance,
  onReject,
  onMove,
  onDragStart,
  onDragEnd,
}: ExamBoardCardProps) {
  const hasSchedule = (schedule?.papers ?? 0) > 0;
  const action = nextAction(exam, hasSchedule, role);
  const accent = accentFor(exam, hasSchedule);
  const pct = marksProgress(meta);
  const compact = density === "compact";

  // Only the office can send marks back, and only while the results are still
  // being reviewed — once published, the exam must be unpublished first.
  const canReject =
    role !== "TEACHER" && (exam.status === "LOCKED" || exam.status === "PRINCIPAL_REVIEWED");

  const dateRange = formatDateRange(schedule?.firstDate ?? null, schedule?.lastDate ?? null);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      tabIndex={0}
      role="listitem"
      aria-label={`${exam.title}, ${classLabel(exam.class)}${selected ? ", selected" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        } else if (e.key === " ") {
          e.preventDefault();
          onToggleSelect();
        }
      }}
      className={cn(
        "group relative rounded-2xl border bg-white shadow-sm outline-none transition-all",
        "focus-visible:ring-4 focus-visible:ring-[#8127cf]/25",
        compact ? "p-3" : "p-4",
        dragging
          ? "scale-[0.98] rotate-[0.6deg] border-[#8127cf]/40 opacity-50"
          : "hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(129,39,207,0.18)]",
        selected ? "border-[#8127cf] ring-2 ring-[#8127cf]/20" : "border-[#cfc2d6]/15",
      )}
    >
      {/* Stage colour rail — tells the eye which lane a card belongs to even
          while it is mid-drag over another column. */}
      <span
        aria-hidden
        className="absolute left-0 top-4 h-8 w-1 rounded-r-full"
        style={{ backgroundColor: accent }}
      />

      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span
            aria-hidden
            className="mt-0.5 cursor-grab text-[#cfc2d6] opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${exam.title}`}
            className={cn(
              "mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#8127cf] transition-opacity",
              selectionActive || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          />
          <button
            type="button"
            onClick={() => onOpen()}
            className="min-w-0 cursor-pointer text-left font-black leading-tight text-[#1d1b20] transition-colors hover:text-[#8127cf]"
          >
            {exam.title}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {flagged ? (
            <span title="Needs your attention" className="text-amber-500">
              <TriangleAlert className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <StatusPill status={exam.status} />
          <CardMenu exam={exam} role={role} hasSchedule={hasSchedule} meta={meta} onOpen={onOpen} onMove={onMove} />
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-[#fbf0fe] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
          {EXAM_TYPE_LABELS[exam.examType as ExamType] ||
            exam.examType?.replaceAll("_", " ") ||
            "Exam"}
        </span>
        <span className="rounded-full bg-[#f3f4f9] px-2 py-0.5 text-[9px] font-bold text-ink-muted">
          {classLabel(exam.class)}
        </span>
        {dateRange ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-bold text-teal-700">
            <CalendarDays className="h-2.5 w-2.5" />
            {dateRange}
          </span>
        ) : null}
      </div>

      {!compact ? (
        <p className="mb-3 text-[11px] font-semibold text-ink-muted">
          {exam.subject ? exam.subject.name : "All subjects"}
          {meta?.subjectsCount
            ? ` · ${meta.subjectsCount} subject${meta.subjectsCount > 1 ? "s" : ""}`
            : ""}
          {meta?.studentsCount ? ` · ${meta.studentsCount} students` : ""}
        </p>
      ) : null}

      {meta && meta.expectedMarks > 0 ? (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold">
            <span className="text-ink-muted">Marks entered</span>
            <span className="text-ink">
              {meta.enteredMarks}/{meta.expectedMarks} · {pct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f3f4f9]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: accent }}
            />
          </div>
        </div>
      ) : null}

      {exam.rejectionReason ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-rose-600">
            Sent back
            {exam.rejectionCount && exam.rejectionCount > 1 ? ` · ${exam.rejectionCount} times` : ""}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-rose-700">
            {exam.rejectionReason}
          </p>
        </div>
      ) : null}

      {action ? (
        <button
          type="button"
          onClick={() => onAdvance(action)}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:scale-[1.01]"
          style={{ backgroundColor: accent }}
        >
          {action.type === "lock" ? (
            <Lock className="h-3.5 w-3.5" />
          ) : action.type === "open" ? (
            <CalendarDays className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          {action.label}
        </button>
      ) : (
        <div className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2 text-[11px] font-black uppercase tracking-wider text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
        </div>
      )}

      {canReject ? (
        <button
          type="button"
          onClick={onReject}
          className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white py-2 text-[11px] font-black uppercase tracking-wider text-rose-600 transition-all hover:bg-rose-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Send Back
        </button>
      ) : null}
    </article>
  );
}

/**
 * The per-card menu. Its "Move to" list is the keyboard-and-mouse equivalent of
 * dragging: every lane is listed, and one that cannot accept this exam stays
 * visible with the reason attached rather than quietly disappearing.
 */
function CardMenu({
  exam,
  role,
  hasSchedule,
  meta,
  onOpen,
  onMove,
}: {
  exam: ExamItem;
  role: ExamCycleRole;
  hasSchedule: boolean;
  meta?: ExamMeta;
  onOpen: (tab?: DetailTab) => void;
  onMove: (to: ColumnKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const columns = columnsForRole(role);

  const tabs: { label: string; tab: DetailTab; icon: React.ComponentType<{ className?: string }> }[] =
    role === "TEACHER"
      ? [{ label: "Enter marks", tab: "marks", icon: PenLine }]
      : [
          { label: "Dates & rooms", tab: "schedule", icon: CalendarDays },
          { label: "Enter marks", tab: "marks", icon: PenLine },
          { label: "Grading rules", tab: "grade", icon: SlidersHorizontal },
          { label: "Report cards", tab: "reports", icon: FileText },
        ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Actions for ${exam.title}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[#f3f4f9] hover:text-[#8127cf]"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-7 z-30 w-56 overflow-hidden rounded-2xl border border-[#cfc2d6]/20 bg-white p-1.5 shadow-[0_20px_50px_-12px_rgba(31,26,35,0.28)]">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.tab}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpen(t.tab);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-ink transition-colors hover:bg-[#fbf0fe]"
              >
                <Icon className="h-3.5 w-3.5 text-[#8127cf]" />
                {t.label}
              </button>
            );
          })}

          <p className="mt-1 border-t border-[#cfc2d6]/15 px-3 pb-1 pt-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
            Move to
          </p>
          {columns.map((col) => {
            const verdict = evaluateMove(exam, col.key, { role, hasSchedule, meta });
            return (
              <button
                key={col.key}
                type="button"
                disabled={!verdict.ok}
                title={verdict.ok ? verdict.label : verdict.reason}
                onClick={() => {
                  setOpen(false);
                  onMove(col.key);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors",
                  verdict.ok
                    ? "cursor-pointer text-ink hover:bg-[#fbf0fe]"
                    : "cursor-not-allowed text-ink-subtle/70",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: verdict.ok ? col.accent : "#cfc2d6" }}
                  />
                  {col.title}
                </span>
                {verdict.ok ? <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
