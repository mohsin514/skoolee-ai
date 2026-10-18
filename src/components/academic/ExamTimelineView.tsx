"use client";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import React, { useMemo } from "react";
import { CalendarDays, Clock, DoorOpen, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  classLabel,
  daysFromToday,
  formatDayHeading,
  type ExamItem,
} from "@/lib/academic/exam-pipeline";
import type { DetailTab } from "@/components/academic/ExamBoardCard";

export interface ScheduleRow {
  id: string;
  examId: string;
  date: string;
  subject?: { id: string; name: string } | null;
  periodDefinition?: { periodNumber: number; startTime: string; endTime: string } | null;
  room?: { roomNumber: string } | null;
  rooms?: { isPrimary: boolean; room: { roomNumber: string } }[];
  exam?: {
    id: string;
    title: string;
    term: string;
    class?: { name: string; section?: string | null } | null;
  } | null;
}

function relativeLabel(date: string): { text: string; tone: "past" | "today" | "soon" | "future" } {
  const days = daysFromToday(date);
  if (days === 0) return { text: "Today", tone: "today" };
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  if (days < 0) return { text: `${Math.abs(days)} day${days === -1 ? "" : "s"} ago`, tone: "past" };
  if (days <= 7) return { text: `In ${days} days`, tone: "soon" };
  return { text: `In ${days} days`, tone: "future" };
}

/**
 * Every scheduled paper on the campus, day by day. The board answers "where is
 * this exam up to"; this answers "what is happening on Thursday" — the question
 * an office actually gets asked during exam week.
 */
export function ExamTimelineView({
  rows,
  unscheduled,
  onOpen,
}: {
  rows: ScheduleRow[];
  unscheduled: ExamItem[];
  onOpen: (examId: string, tab?: DetailTab) => void;
}) {
  const days = useMemo(() => {
    const grouped = new Map<string, ScheduleRow[]>();
    rows.forEach((r) => {
      const key = String(r.date).slice(0, 10);
      const list = grouped.get(key);
      if (list) list.push(r);
      else grouped.set(key, [r]);
    });
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, papers]) => ({
        date,
        papers: papers.sort(
          (a, b) =>
            (a.periodDefinition?.periodNumber ?? 99) - (b.periodDefinition?.periodNumber ?? 99),
        ),
      }));
  }, [rows]);

  if (days.length === 0 && unscheduled.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nothing is on the datesheet yet"
        description="Open an exam and set its dates to see it here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {days.map(({ date, papers }) => {
        const rel = relativeLabel(date);
        return (
          <section
            key={date}
            className={cn(
              "overflow-hidden rounded-3xl border bg-white shadow-sm transition-opacity",
              rel.tone === "today"
                ? "border-primary/40 ring-2 ring-primary/10"
                : "border-edge/15",
              rel.tone === "past" && "opacity-70",
            )}
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge/10 bg-surface-subtle px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-2xl",
                    rel.tone === "today"
                      ? "bg-primary text-white"
                      : rel.tone === "past"
                        ? "bg-muted text-ink-subtle"
                        : "bg-brand-50 text-primary",
                  )}
                >
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-strong">{formatDayHeading(date)}</p>
                  <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                    {papers.length} paper{papers.length > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <Badge
                variant={
                  rel.tone === "today"
                    ? "default"
                    : rel.tone === "soon"
                      ? "warning"
                      : rel.tone === "past"
                        ? "neutral"
                        : "info"
                }
                className="shrink-0"
              >
                {rel.text}
              </Badge>
            </header>

            <ul className="divide-y divide-edge/8">
              {papers.map((p) => {
                const roomNames =
                  p.rooms && p.rooms.length > 0
                    ? p.rooms.map((r) => r.room.roomNumber)
                    : p.room
                      ? [p.room.roomNumber]
                      : [];
                return (
                  <li key={p.id}>
                    <Button variant="secondary"
                      type="button"
                      onClick={() => onOpen(p.examId, "schedule")}
                      className="sk-row-interactive justify-start flex w-full flex-wrap items-center gap-3 px-5 py-3 text-start"
                    >
                      <span className="flex w-24 shrink-0 items-center gap-1.5 text-xs font-bold text-primary">
                        <Clock className="h-3.5 w-3.5" />
                        {p.periodDefinition
                          ? `${p.periodDefinition.startTime}`
                          : "No time"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-ink-strong">
                          {p.subject?.name || "Paper"}
                        </span>
                        <span className="block text-xs text-ink-subtle">
                          {classLabel(p.exam?.class)} · {p.exam?.title}
                        </span>
                      </span>
                      {p.periodDefinition ? (
                        <Badge variant="neutral" size="sm" className="tabular-nums">
                          Period {p.periodDefinition.periodNumber} ·{" "}
                          {p.periodDefinition.startTime}–{p.periodDefinition.endTime}
                        </Badge>
                      ) : null}
                      {roomNames.length > 0 ? (
                        <Badge variant="success" size="sm">
                          <DoorOpen className="h-3 w-3" aria-hidden="true" />
                          {roomNames.join(" + ")}
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">
                          <MapPin className="h-3 w-3" aria-hidden="true" /> No room
                        </Badge>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {unscheduled.length > 0 ? (
        <section className="overflow-hidden rounded-3xl border border-dashed border-status-warning-border bg-status-warning-surface">
          <header className="border-b border-status-warning-border px-5 py-3">
            <p className="text-sm font-bold text-status-warning-text">
              {unscheduled.length} exam{unscheduled.length > 1 ? "s" : ""} with no dates yet
            </p>
            <p className="text-xs leading-relaxed text-status-warning-text">
              These will not appear on the datesheet families see.
            </p>
          </header>
          <ul className="divide-y divide-status-warning-border">
            {unscheduled.map((e) => (
              <li key={e.id}>
                <Button variant="secondary"
                  type="button"
                  onClick={() => onOpen(e.id, "schedule")}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-start"
                >
                  <span>
                    <span className="block text-sm font-bold text-ink-strong">{e.title}</span>
                    <span className="block text-xs text-ink-subtle">
                      {classLabel(e.class)} · {e.term} {e.academicYear}
                    </span>
                  </span>
                  <Badge variant="warning" className="shrink-0">
                    Set dates
                  </Badge>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
