"use client";

import React from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  CalendarDays,
  CheckCircle2,
  Lock,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/shared-admin";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/academic/exam-permissions";
import {
  classLabel,
  formatDateRange,
  marksProgress,
  nextAction,
  type ExamCycleRole,
  type ExamItem,
  type ExamMeta,
  type NextAction,
  type ScheduleSummary,
} from "@/lib/academic/exam-pipeline";
import type { DetailTab } from "@/components/academic/ExamBoardCard";

export type SortKey = "manual" | "title" | "class" | "progress" | "date" | "stage";

const HEADERS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: null, label: "", className: "w-10" },
  { key: "title", label: "Exam" },
  { key: "class", label: "Class" },
  { key: "stage", label: "Stage" },
  { key: "date", label: "Dates" },
  { key: "progress", label: "Marks" },
  { key: null, label: "Next step", className: "text-right" },
];

/**
 * The same pipeline as the board, in a shape that suits comparing many exams at
 * once — which class is behind, which papers have no dates, what each one needs
 * next. Everything here acts on the same handlers the board uses.
 */
export function ExamTableView({
  exams,
  meta,
  schedules,
  role,
  selected,
  sort,
  onSort,
  onToggleSelect,
  onToggleAll,
  onOpen,
  onAdvance,
  onReject,
  flagged,
}: {
  exams: ExamItem[];
  meta: Record<string, ExamMeta>;
  schedules: Record<string, ScheduleSummary>;
  role: ExamCycleRole;
  selected: Set<string>;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string, tab?: DetailTab) => void;
  onAdvance: (exam: ExamItem, action: NextAction) => void;
  onReject: (exam: ExamItem) => void;
  flagged: Set<string>;
}) {
  const allSelected = exams.length > 0 && exams.every((e) => selected.has(e.id));

  return (
    <div className="overflow-x-auto rounded-3xl border border-[#cfc2d6]/15 bg-white shadow-sm custom-scrollbar">
      <table className="w-full min-w-[900px] text-left">
        <thead>
          <tr className="border-b border-[#cfc2d6]/10 bg-[#fbf0fe]/30">
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label="Select every exam in this list"
                className="h-4 w-4 cursor-pointer accent-[#8127cf]"
              />
            </th>
            {HEADERS.slice(1).map((h) => (
              <th
                key={h.label}
                className={cn(
                  "px-4 py-3 text-[9px] font-black uppercase tracking-wider text-ink-muted",
                  h.className,
                )}
              >
                {h.key ? (
                  <button
                    type="button"
                    onClick={() => onSort(h.key as SortKey)}
                    className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-[#8127cf]"
                  >
                    {h.label}
                    {sort.key === h.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUpWideNarrow className="h-3 w-3 text-[#8127cf]" />
                      ) : (
                        <ArrowDownWideNarrow className="h-3 w-3 text-[#8127cf]" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-[#cfc2d6]" />
                    )}
                  </button>
                ) : (
                  h.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {exams.map((exam) => {
            const m = meta[exam.id];
            const sched = schedules[exam.id];
            const hasSchedule = (sched?.papers ?? 0) > 0;
            const action = nextAction(exam, hasSchedule, role);
            const pct = marksProgress(m);
            const range = formatDateRange(sched?.firstDate ?? null, sched?.lastDate ?? null);
            const canReject =
              role !== "TEACHER" &&
              (exam.status === "LOCKED" || exam.status === "PRINCIPAL_REVIEWED");
            return (
              <tr
                key={exam.id}
                className={cn(
                  "border-b border-[#cfc2d6]/5 transition-colors hover:bg-[#fbf0fe]/25",
                  selected.has(exam.id) && "bg-[#fbf0fe]/40",
                )}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(exam.id)}
                    onChange={() => onToggleSelect(exam.id)}
                    aria-label={`Select ${exam.title}`}
                    className="h-4 w-4 cursor-pointer accent-[#8127cf]"
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpen(exam.id)}
                    className="flex cursor-pointer items-center gap-1.5 text-left text-sm font-black text-[#1d1b20] transition-colors hover:text-[#8127cf]"
                  >
                    {flagged.has(exam.id) ? (
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    ) : null}
                    {exam.title}
                  </button>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                    {EXAM_TYPE_LABELS[exam.examType as ExamType] ||
                      exam.examType?.replaceAll("_", " ") ||
                      "Exam"}
                    {" · "}
                    {exam.term} {exam.academicYear}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs font-bold text-ink">{classLabel(exam.class)}</td>
                <td className="px-4 py-3">
                  <StatusPill status={exam.status} />
                </td>
                <td className="px-4 py-3">
                  {range ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-700">
                      <CalendarDays className="h-3 w-3" />
                      {range}
                      <span className="text-ink-subtle">
                        · {sched?.papers} paper{(sched?.papers ?? 0) > 1 ? "s" : ""}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-ink-subtle">Not scheduled</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m && m.expectedMarks > 0 ? (
                    <div className="w-28">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-bold">
                        <span className="text-ink-muted">
                          {m.enteredMarks}/{m.expectedMarks}
                        </span>
                        <span className={pct === 100 ? "text-emerald-600" : "text-amber-600"}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f3f4f9]">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            pct === 100 ? "bg-emerald-500" : "bg-amber-500",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] font-semibold text-ink-subtle">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {canReject ? (
                      <button
                        type="button"
                        onClick={() => onReject(exam)}
                        className="flex cursor-pointer items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-600 transition-colors hover:bg-rose-50"
                      >
                        <RotateCcw className="h-3 w-3" /> Send back
                      </button>
                    ) : null}
                    {action ? (
                      <button
                        type="button"
                        onClick={() => onAdvance(exam, action)}
                        className="flex cursor-pointer items-center gap-1 rounded-xl bg-[#8127cf] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition-all hover:bg-[#6a1fb0]"
                      >
                        {action.type === "lock" ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {action.label}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
