"use client";

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
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#cfc2d6]/30 bg-white p-16 text-center">
        <CalendarDays className="mb-3 h-10 w-10 text-ink-subtle" />
        <p className="text-sm font-bold text-ink-muted">Nothing is on the datesheet yet</p>
        <p className="mt-1 text-xs font-semibold text-ink-subtle">
          Open an exam and set its dates to see it here.
        </p>
      </div>
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
                ? "border-[#8127cf]/40 ring-2 ring-[#8127cf]/10"
                : "border-[#cfc2d6]/15",
              rel.tone === "past" && "opacity-70",
            )}
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#cfc2d6]/10 bg-[#faf7fc] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-2xl",
                    rel.tone === "today"
                      ? "bg-[#8127cf] text-white"
                      : rel.tone === "past"
                        ? "bg-[#f3f4f9] text-ink-subtle"
                        : "bg-[#fbf0fe] text-[#8127cf]",
                  )}
                >
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-black text-[#1d1b20]">{formatDayHeading(date)}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                    {papers.length} paper{papers.length > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider",
                  rel.tone === "today"
                    ? "bg-[#8127cf] text-white"
                    : rel.tone === "soon"
                      ? "bg-amber-50 text-amber-700"
                      : rel.tone === "past"
                        ? "bg-[#f3f4f9] text-ink-subtle"
                        : "bg-teal-50 text-teal-700",
                )}
              >
                {rel.text}
              </span>
            </header>

            <ul className="divide-y divide-[#cfc2d6]/8">
              {papers.map((p) => {
                const roomNames =
                  p.rooms && p.rooms.length > 0
                    ? p.rooms.map((r) => r.room.roomNumber)
                    : p.room
                      ? [p.room.roomNumber]
                      : [];
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(p.examId, "schedule")}
                      className="flex w-full cursor-pointer flex-wrap items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#fbf0fe]/30"
                    >
                      <span className="flex w-24 shrink-0 items-center gap-1.5 text-xs font-black text-[#8127cf]">
                        <Clock className="h-3.5 w-3.5" />
                        {p.periodDefinition
                          ? `${p.periodDefinition.startTime}`
                          : "No time"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black text-[#1d1b20]">
                          {p.subject?.name || "Paper"}
                        </span>
                        <span className="block text-[11px] font-semibold text-ink-muted">
                          {classLabel(p.exam?.class)} · {p.exam?.title}
                        </span>
                      </span>
                      {p.periodDefinition ? (
                        <span className="rounded-full bg-[#f3f4f9] px-2.5 py-1 text-[10px] font-bold text-ink-muted">
                          Period {p.periodDefinition.periodNumber} ·{" "}
                          {p.periodDefinition.startTime}–{p.periodDefinition.endTime}
                        </span>
                      ) : null}
                      {roomNames.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700">
                          <DoorOpen className="h-3 w-3" />
                          {roomNames.join(" + ")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                          <MapPin className="h-3 w-3" /> No room
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {unscheduled.length > 0 ? (
        <section className="overflow-hidden rounded-3xl border border-dashed border-amber-200 bg-amber-50/40">
          <header className="border-b border-amber-200/60 px-5 py-3">
            <p className="text-sm font-black text-amber-800">
              {unscheduled.length} exam{unscheduled.length > 1 ? "s" : ""} with no dates yet
            </p>
            <p className="text-[11px] font-semibold text-amber-700">
              These will not appear on the datesheet families see.
            </p>
          </header>
          <ul className="divide-y divide-amber-200/40">
            {unscheduled.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpen(e.id, "schedule")}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-amber-100/40"
                >
                  <span>
                    <span className="block text-sm font-black text-[#1d1b20]">{e.title}</span>
                    <span className="block text-[11px] font-semibold text-ink-muted">
                      {classLabel(e.class)} · {e.term} {e.academicYear}
                    </span>
                  </span>
                  <span className="rounded-xl bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white">
                    Set dates
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
