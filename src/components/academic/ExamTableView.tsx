"use client";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
import { useUiText } from "@/components/locale/LocaleProvider";

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
  const ui = useUiText();
  const allSelected = exams.length > 0 && exams.every((e) => selected.has(e.id));

  return (

      <Table containerClassName="custom-scrollbar" className="w-full min-w-[900px] text-start">
        <TableHeader>
          <TableRow className="border-b border-edge/10 bg-brand-50/30">
            <TableHead className="w-10 px-4 py-3">
              <SystemCheckbox

                checked={allSelected}
                onChange={onToggleAll}
                aria-label={ui("Select every exam in this list")}
                className=""
              />
            </TableHead>
            {HEADERS.slice(1).map((h) => (
              <TableHead
                key={h.label}
                aria-sort={h.key ? (sort.key === h.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                className={cn(
                  "px-4 py-3 text-xs font-semibold text-ink-muted",
                  h.className,
                )}
              >
                {h.key ? (
                  <Button variant="ghost"
                    type="button"
                    onClick={() => onSort(h.key as SortKey)}
                    className="justify-start inline-flex items-center gap-1"
                  >
                    {ui(h.label)}
                    {sort.key === h.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUpWideNarrow className="h-3 w-3 text-primary" />
                      ) : (
                        <ArrowDownWideNarrow className="h-3 w-3 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-edge" />
                    )}
                  </Button>
                ) : h.label ? (
                  ui(h.label)
                ) : null}
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
                  "border-b border-edge/5 transition-colors hover:bg-brand-50/25",
                  selected.has(exam.id) && "bg-brand-50/40",
                )}
              >
                <TableCell className="px-4 py-3">
                  <SystemCheckbox

                    checked={selected.has(exam.id)}
                    onChange={() => onToggleSelect(exam.id)}
                    aria-label={ui("Select {0}", [exam.title])}
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
                      <TriangleAlert aria-label={ui("Needs your attention")} className="h-3.5 w-3.5 shrink-0 text-status-warning-text" />
                    ) : null}
                    <bdi>{exam.title}</bdi>
                  </Button>
                  <p className="mt-0.5 text-2xs font-semibold text-ink-subtle">
                    {ui(EXAM_TYPE_LABELS[exam.examType as ExamType] ||
                      exam.examType?.replaceAll("_", " ") ||
                      "Exam")}
                    {" · "}
                    {exam.term} {exam.academicYear}
                  </p>
                </TableCell>
                <TableCell className="px-4 py-3 text-xs font-bold text-ink"><bdi>{classLabel(exam.class)}</bdi></TableCell>
                <TableCell className="px-4 py-3">
                  <StatusPill status={exam.status} />
                </TableCell>
                <TableCell className="px-4 py-3">
                  {range ? (
                    <span className="inline-flex flex-wrap items-center gap-1 text-xs font-semibold text-ink tabular-nums">
                      <CalendarDays className="h-3 w-3 text-primary" aria-hidden="true" />
                      {range}
                      <span className="text-ink-subtle">
                        · {ui((sched?.papers ?? 0) > 1 ? "{0} papers" : "{0} paper", [sched?.papers ?? 0])}
                      </span>
                    </span>
                  ) : (
                    <span className="text-2xs font-semibold text-ink-subtle">{ui("Not scheduled")}</span>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3">
                  {m && m.expectedMarks > 0 ? (
                    <div className="w-28">
                      <div className="mb-1 flex items-center justify-between text-2xs font-semibold tabular-nums">
                        <span className="text-ink-muted">
                          {m.enteredMarks}/{m.expectedMarks}
                        </span>
                        <span className={pct === 100 ? "text-status-success-text" : "text-status-warning-text"}>
                          {pct}%
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        size="sm"
                        tone={pct === 100 ? "success" : "warning"}
                        label={ui("Marks entered")}
                        valueText={ui("{0} of {1} marks entered", [m.enteredMarks, m.expectedMarks])}
                      />
                    </div>
                  ) : (
                    <span className="text-2xs font-semibold text-ink-subtle">—</span>
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
                        <RotateCcw aria-hidden="true" className="h-3 w-3" /> {ui("Send back")}
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
                        {ui(action.label)}
                      </Button>
                    ) : (
                      <Badge variant="success">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> {ui("Done")}
                      </Badge>
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
