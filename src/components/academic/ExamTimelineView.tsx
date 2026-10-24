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
  type ExamItem,
} from "@/lib/academic/exam-pipeline";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
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

type Ui = (source: string, values?: unknown[]) => string;

function relativeLabel(date: string, ui: Ui): { text: string; tone: "past" | "today" | "soon" | "future" } {
  const days = daysFromToday(date);
  if (days === 0) return { text: ui("Today"), tone: "today" };
  if (days === 1) return { text: ui("Tomorrow"), tone: "soon" };
  if (days < 0) return { text: ui(days === -1 ? "{0} day ago" : "{0} days ago", [Math.abs(days)]), tone: "past" };
  if (days <= 7) return { text: ui("In {0} days", [days]), tone: "soon" };
  return { text: ui("In {0} days", [days]), tone: "future" };
}

/** The day heading in the viewer's language (R7: dates through Intl). */
function dayHeading(date: string, language: string) {
  try {
    return new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
  } catch {
    return date;
  }
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
  const ui = useUiText();
  const { language } = useLocale();
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
        title={ui("Nothing is on the datesheet yet")}
        description={ui("Open an exam and set its dates to see it here.")}
      />
    );
  }

  return (
    <div className="space-y-4">
      {days.map(({ date, papers }) => {
        const rel = relativeLabel(date, ui);
        return (
          <section
            key={date}
            className={cn(
              "overflow-hidden rounded-3xl border bg-card shadow-sm transition-opacity",
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
                      ? "bg-primary text-primary-foreground"
                      : rel.tone === "past"
                        ? "bg-muted text-ink-subtle"
                        : "bg-brand-50 text-primary",
                  )}
                  aria-hidden="true"
                >
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-strong">{dayHeading(date, language)}</p>
                  <p className="text-xs font-semibold text-ink-subtle">
                    {ui(papers.length > 1 ? "{0} papers" : "{0} paper", [papers.length])}
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
                        <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                        {p.periodDefinition
                          ? <bdi dir="ltr">{p.periodDefinition.startTime}</bdi>
                          : ui("No time")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <bdi className="block text-sm font-bold text-ink-strong">
                          {p.subject?.name || ui("Paper")}
                        </bdi>
                        <bdi className="block text-xs text-ink-subtle">
                          {classLabel(p.exam?.class)} · {p.exam?.title}
                        </bdi>
                      </span>
                      {p.periodDefinition ? (
                        <Badge variant="neutral" size="sm" className="tabular-nums">
                          {ui("Period {0} · {1}–{2}", [p.periodDefinition.periodNumber, p.periodDefinition.startTime, p.periodDefinition.endTime])}
                        </Badge>
                      ) : null}
                      {roomNames.length > 0 ? (
                        <Badge variant="success" size="sm">
                          <DoorOpen className="h-3 w-3" aria-hidden="true" />
                          {roomNames.join(" + ")}
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">
                          <MapPin className="h-3 w-3" aria-hidden="true" /> {ui("No room")}
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
              {ui(unscheduled.length > 1 ? "{0} exams with no dates yet" : "{0} exam with no dates yet", [unscheduled.length])}
            </p>
            <p className="text-xs leading-relaxed text-status-warning-text">
              {ui("These will not appear on the datesheet families see.")}
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
                    <bdi className="block text-sm font-bold text-ink-strong">{e.title}</bdi>
                    <span className="block text-xs text-ink-subtle">
                      {classLabel(e.class)} · {e.term} {e.academicYear}
                    </span>
                  </span>
                  <Badge variant="warning" className="shrink-0">
                    {ui("Set dates")}
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
