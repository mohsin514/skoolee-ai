"use client";

import { Button } from "@/components/ui/button";
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
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { Progress } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { useUiText } from "@/components/locale/LocaleProvider";

/**
 * Where opening an exam should land.
 *
 * "grade" used to be here, when grading rules were edited per exam. They are a
 * property of the class and the year, not of one paper, so they moved to their
 * own screen and this list lost a tab (§80).
 */
export type DetailTab = "schedule" | "marks" | "reports";

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
  const ui = useUiText();
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
      aria-label={ui(selected ? "{0}, {1}, selected" : "{0}, {1}", [exam.title, classLabel(exam.class)])}
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
        "group relative rounded-2xl border bg-card shadow-sm outline-none transition-all",
        compact ? "p-3" : "p-4",
        dragging
          ? "scale-[0.98] rotate-[0.6deg] border-primary/40 opacity-50"
          : "hover:border-primary/25 hover:shadow-lg",
        selected ? "border-primary ring-2 ring-primary/20" : "border-edge/15",
      )}
    >
      {/* Stage colour rail — tells the eye which lane a card belongs to even
          while it is mid-drag over another column. */}
      <span
        aria-hidden
        className="absolute start-0 top-4 h-8 w-1 rounded-e-full"
        style={{ backgroundColor: accent }}
      />

      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span
            aria-hidden
            className="mt-0.5 cursor-grab text-edge opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <SystemCheckbox
            checked={selected}
            onChange={() => onToggleSelect()}
            onClick={(e) => e.stopPropagation()}
            aria-label={ui("Select {0}", [exam.title])}
            className={cn(
              "mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary transition-opacity",
              selectionActive || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          />
          <Button variant="ghost"
            type="button"
            onClick={() => onOpen()}
            className="min-w-0 text-start text-sm font-semibold leading-tight text-ink-strong"
          >
            <bdi>{exam.title}</bdi>
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {flagged ? (
            <Tooltip content={ui("Needs your attention")}>
              <span tabIndex={0} aria-label={ui("Needs your attention")} className="text-status-warning-text">
                <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
            </Tooltip>
          ) : null}
          <StatusPill status={exam.status} />
          <CardMenu exam={exam} role={role} hasSchedule={hasSchedule} meta={meta} onOpen={onOpen} onMove={onMove} />
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="default" size="sm">
          {ui(EXAM_TYPE_LABELS[exam.examType as ExamType] ||
            exam.examType?.replaceAll("_", " ") ||
            "Exam")}
        </Badge>
        <Badge variant="neutral" size="sm">
          <bdi>{classLabel(exam.class)}</bdi>
        </Badge>
        {dateRange ? (
          <Badge variant="info" size="sm" className="tabular-nums">
            <CalendarDays aria-hidden="true" className="h-3 w-3" />
            {dateRange}
          </Badge>
        ) : null}
      </div>

      {!compact ? (
        <p className="mb-3 text-xs text-ink-subtle">
          {[
            exam.subject ? exam.subject.name : ui("All subjects"),
            meta?.subjectsCount ? ui(meta.subjectsCount > 1 ? "{0} subjects" : "{0} subject", [meta.subjectsCount]) : null,
            meta?.studentsCount ? ui("{0} students", [meta.studentsCount]) : null,
          ].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {meta && meta.expectedMarks > 0 ? (
        <div className="mb-3">
          <div aria-hidden="true" className="mb-1 flex items-center justify-between text-2xs font-semibold">
            <span className="text-ink-muted">{ui("Marks entered")}</span>
            <bdi dir="ltr" className="tabular-nums text-ink">
              {meta.enteredMarks}/{meta.expectedMarks} · {pct}%
            </bdi>
          </div>
          <Progress value={pct} max={100} label={ui("Marks entered")} size="sm" tone={pct === 100 ? "success" : "brand"} />
        </div>
      ) : null}

      {exam.rejectionReason ? (
        <Alert
          tone="danger"
          compact
          live="off"
          className="mb-3"
          title={exam.rejectionCount && exam.rejectionCount > 1 ? ui("Sent back · {0} times", [exam.rejectionCount]) : ui("Sent back")}
        >
          {exam.rejectionReason}
        </Alert>
      ) : null}

      {action ? (
        <Button variant="default"
          type="button"
          onClick={() => onAdvance(action)}
          className="flex w-full items-center justify-center gap-1.5 py-2"
          style={{ backgroundColor: accent }}
        >
          {action.type === "lock" ? (
            <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          ) : action.type === "open" ? (
            <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {ui(action.label)}
        </Button>
      ) : (
        <div className="flex items-center justify-center gap-1.5 rounded-xl bg-status-success-surface py-2 text-xs font-semibold text-status-success-text">
          <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> {ui("Complete")}
        </div>
      )}

      {canReject ? (
        <Button variant="outline"
          type="button"
          onClick={onReject}
          className="mt-2 flex w-full items-center justify-center gap-1.5 py-2"
        >
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> {ui("Send back")}
        </Button>
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
  const ui = useUiText();
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
          { label: "Report cards", tab: "reports", icon: FileText },
        ];

  return (
    <div ref={ref} className="relative">
      <IconButton
        variant="ghost"
        size="sm"
        label={ui("Actions for {0}", [exam.title])}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical aria-hidden="true" className="h-3.5 w-3.5" />
      </IconButton>
      {open ? (
        <div className="sk-panel absolute end-0 top-9 z-30 w-56 max-w-[calc(100vw-2rem)] shadow-lg overflow-hidden p-1.5">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <Button variant="secondary"
                key={t.tab}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpen(t.tab);
                }}
                className="flex w-full items-center justify-start gap-2 px-3 py-2 text-start"
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
                {ui(t.label)}
              </Button>
            );
          })}

          <p className="mt-1 border-t border-edge/15 px-3 pb-1 pt-2 text-xs font-semibold text-ink-subtle">
            {ui("Move to")}
          </p>
          {columns.map((col) => {
            const verdict = evaluateMove(exam, col.key, { role, hasSchedule, meta });
            return (
              <Button variant="secondary"
                key={col.key}
                type="button"
                disabled={!verdict.ok}
                title={ui(verdict.ok ? verdict.label : verdict.reason)}
                onClick={() => {
                  setOpen(false);
                  onMove(col.key);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-start",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: verdict.ok ? col.accent : "var(--ink-faint)" }}
                  />
                  {ui(col.title)}
                </span>
                {verdict.ok ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-ink-subtle rtl:rotate-180" /> : null}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
