"use client";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";

export type SortKey = "manual" | "title" | "class" | "progress" | "date" | "stage";

const HEADERS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: null, label: "", className: "w-10" },
  { key: "title", label: "Exam" },
  { key: "class", label: "Class" },
  { key: "stage", label: "Stage" },
  { key: "date", label: "Dates" },
  { key: "progress", label: "Marks" },
  { key: null, label: "Next step", className: "text-end" },
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

      <Table containerClassName="custom-scrollbar" className="w-full min-w-[900px] text-start">
        <TableHeader>
          <TableRow className="border-b border-[#cfc2d6]/10 bg-[#fbf0fe]/30">
            <TableHead className="w-10 px-4 py-3">
              <SystemCheckbox

                checked={allSelected}
                onChange={onToggleAll}
                aria-label="Select every exam in this list"
                className=""
              />
            </TableHead>
            {HEADERS.slice(1).map((h) => (
              <TableHead
                key={h.label}
                aria-sort={h.key ? (sort.key === h.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                className={cn(
                  "px-4 py-3 text-[9px] font-black uppercase tracking-wider text-ink-muted",
                  h.className,
                )}
              >
                {h.key ? (
                  <Button variant="ghost"
                    type="button"
                    onClick={() => onSort(h.key as SortKey)}
                    className="justify-start inline-flex items-center gap-1"
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
                  </Button>
                ) : (
                  h.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
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
              <TableRow
                key={exam.id}
                className={cn(
                  "border-b border-[#cfc2d6]/5 transition-colors hover:bg-[#fbf0fe]/25",
                  selected.has(exam.id) && "bg-[#fbf0fe]/40",
                )}
              >
                <TableCell className="px-4 py-3">
                  <SystemCheckbox

                    checked={selected.has(exam.id)}
                    onChange={() => onToggleSelect(exam.id)}
                    aria-label={`Select ${exam.title}`}
                    className=""
                  />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Button variant="ghost"
                    type="button"
                    onClick={() => onOpen(exam.id)}
                    className="justify-start flex items-center gap-1.5 text-start"
                  >
                    {flagged.has(exam.id) ? (
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    ) : null}
                    {exam.title}
                  </Button>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                    {EXAM_TYPE_LABELS[exam.examType as ExamType] ||
                      exam.examType?.replaceAll("_", " ") ||
                      "Exam"}
                    {" · "}
                    {exam.term} {exam.academicYear}
                  </p>
                </TableCell>
                <TableCell className="px-4 py-3 text-xs font-bold text-ink">{classLabel(exam.class)}</TableCell>
                <TableCell className="px-4 py-3">
                  <StatusPill status={exam.status} />
                </TableCell>
                <TableCell className="px-4 py-3">
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
                </TableCell>
                <TableCell className="px-4 py-3">
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
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {canReject ? (
                      <Button variant="outline"
                        type="button"
                        onClick={() => onReject(exam)}
                        className="justify-start flex items-center gap-1 px-2.5 py-1.5"
                      >
                        <RotateCcw className="h-3 w-3" /> Send back
                      </Button>
                    ) : null}
                    {action ? (
                      <Button variant="default"
                        type="button"
                        onClick={() => onAdvance(exam, action)}
                        className="justify-start flex items-center gap-1 px-3 py-1.5"
                      >
                        {action.type === "lock" ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {action.label}
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

  );
}
