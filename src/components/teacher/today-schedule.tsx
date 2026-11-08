"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, CalendarX2, CheckCircle2, Clock, MapPin, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";


export interface TimetableSlot {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  slotType: string;
  subject: { id: string; name: string } | null;
  className: string;
  classSection: string | null;
  classId: string;
  roomNumber: string | null;
}

function parseMM(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

/**
 * The teacher's lessons today — a live timeline on the Today screen.
 *
 * A ticking clock, a day-progress bar, a countdown to the next class and per-period cards
 * (Live / Up next / Done / Clash), so a glance tells the teacher where they are in the day. The
 * root carries the `teacher.today.schedule` tour anchor; an empty day still renders a short line,
 * so the tour (and the teacher) are never pointed at nothing.
 */
type TodayScheduleProps = {
  slots: TimetableSlot[];
  loading?: boolean;
  availability?: "published" | "unpublished" | "failed";
  clashIds?: Set<string>;
  onOpenTimetable?: () => void;
};

export function TodaySchedule(props: TodayScheduleProps) {
  // One anchor for every state (loading, empty, lessons), so the tour always finds it.
  return <div data-tour="teacher.today.schedule"><TodayScheduleBody {...props} /></div>;
}

function TodayScheduleBody({
  slots,
  loading = false,
  availability = "published",
  clashIds,
  onOpenTimetable,
}: TodayScheduleProps) {
  const ui = useUiText();
  const locale = useLocale();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const minuteNow = now.getHours() * 60 + now.getMinutes();

  const entries = useMemo(
    () =>
      slots
        .map((slot) => {
          const start = parseMM(slot.startTime);
          const end = parseMM(slot.endTime);
          return {
            slot,
            start,
            end,
            active: minuteNow >= start && minuteNow < end,
            past: minuteNow >= end,
            clashing: clashIds?.has(slot.id) ?? false,
          };
        })
        .sort((a, b) => a.start - b.start),
    [slots, clashIds, minuteNow]
  );

  const liveEntry = entries.find((e) => e.active);
  const nextEntry = entries.find((e) => !e.past && !e.active);
  const doneCount = entries.filter((e) => e.past).length;

  const firstStart = entries[0]?.start ?? minuteNow;
  const lastEnd = entries[entries.length - 1]?.end ?? minuteNow + 1;
  const dayProgress =
    lastEnd > firstStart ? clamp(((minuteNow - firstStart) / (lastEnd - firstStart)) * 100, 0, 100) : 0;

  // Viewer-clock value in the reader's numbering system.
  const clock = now.toLocaleTimeString(localeTag(locale), { hour: "2-digit", minute: "2-digit", hour12: false });
  const minutesToNext = nextEntry ? Math.max(nextEntry.start - minuteNow, 0) : 0;
  const progressText = `${Math.round(dayProgress)}%`;

  // One "open the timetable" control for both states: the empty day's next action and the lessons header link.
  const timetableLink = onOpenTimetable ? (
    <Button variant="outline" size="sm" type="button" onClick={onOpenTimetable} className="gap-1.5">
      {entries.length ? ui("Full timetable") : ui("Open timetable")}
      <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
    </Button>
  ) : null;

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="sk-panel overflow-hidden p-4 sm:p-6 animate-skeleton-in" aria-busy="true" role="status" aria-label={ui("Loading today's lessons")}>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="skeleton-shimmer size-9 rounded-2xl bg-border-subtle/60" />
            <div className="skeleton-shimmer h-4 w-40 rounded-full bg-border-subtle/50" />
          </div>
          <div className="skeleton-shimmer h-6 w-24 rounded-full bg-border-subtle/40" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-shimmer h-[120px] w-[200px] max-w-[80vw] shrink-0 rounded-3xl bg-border-subtle/45" />
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="sk-panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-primary">
            <CalendarX2 className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink-strong">{ui("Your lessons today")}</h2>
            <p className="text-sm text-ink-muted">{ui(availability === "failed" ? "Couldn't load your timetable" : availability === "unpublished" ? "No published timetable yet" : "No lessons on your timetable today.")}</p>
          </div>
        </div>
        {timetableLink}
      </div>
    );
  }

  return (
    <section aria-labelledby="teacher-today-lessons" className="sk-panel sk-rise relative overflow-hidden">
      <div className="relative p-4 sm:p-6">
        {/* ── Header row ── */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-brand">
              {liveEntry ? (
                <span className="absolute -end-1 -top-1 flex size-3">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-success-text opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-3 rounded-full bg-status-success-text ring-2 ring-card" />
                </span>
              ) : nextEntry ? (
                <span className="absolute -end-1 -top-1 size-3 rounded-full bg-status-warning-text ring-2 ring-card" />
              ) : null}
              <Clock aria-hidden="true" className="size-5" />
            </div>
            <div>
              <h2 id="teacher-today-lessons" className="flex items-center gap-2 text-base font-bold tracking-tight text-ink-strong">
                {ui("Your lessons today")}
                <span className="hidden items-center gap-1.5 rounded-full border border-primary/10 bg-brand-50 px-2.5 py-1 text-2xs font-semibold text-primary sm:inline-flex">
                  <Timer aria-hidden="true" className="size-3" />
                  <bdi dir="ltr" className="tabular-nums">{clock}</bdi>
                </span>
              </h2>
              <p className="mt-0.5 text-xs font-medium tabular-nums text-ink-subtle">
                {ui("{0} of {1} periods done", [doneCount, entries.length])}
                {" · "}
                {nextEntry && !liveEntry
                  ? ui("next in {0} min", [minutesToNext])
                  : liveEntry
                    ? ui("class in session")
                    : ui("all wrapped up")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden w-28 md:block">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-2xs font-semibold text-ink-subtle">{ui("Day progress")}</span>
                <bdi className="text-2xs font-bold tabular-nums text-primary">{progressText}</bdi>
              </div>
              <Progress value={dayProgress} max={100} label={ui("Day progress")} size="sm" valueText={progressText} />
            </div>
            {timetableLink}
          </div>
        </div>

        {/* ── Day progress (mobile) ── */}
        <div className="mb-5 md:hidden">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-2xs font-semibold text-ink-subtle">{ui("Day progress")}</span>
            <bdi className="text-2xs font-bold tabular-nums text-primary">{progressText}</bdi>
          </div>
          <Progress value={dayProgress} max={100} label={ui("Day progress")} size="sm" valueText={progressText} />
        </div>

        {/* ── Period cards ── */}
        <ol className="custom-scrollbar -mx-2 flex snap-x snap-mandatory gap-4 overflow-x-auto px-2 pb-2">
          {entries.map(({ slot, start, end, active, past, clashing }) => {
            const elapsed =
              active && end > start ? clamp(((minuteNow - start) / (end - start)) * 100, 0, 100) : 0;
            const subject = slot.subject?.name || ui("Free period");
            const className = `${slot.className}${slot.classSection ? ` - ${slot.classSection}` : ""}`;

            return (
              <li key={slot.id} className="shrink-0 snap-start">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={onOpenTimetable}
                  aria-label={ui("Period {0}: {1}, {2}, {3} to {4}", [slot.periodNumber, subject, className, slot.startTime, slot.endTime])}
                  className={cn(
                    "group relative isolate block w-[212px] min-w-[196px] overflow-hidden rounded-3xl border p-4 text-start motion-safe:hover:-translate-y-1",
                    active
                      ? "border-transparent bg-primary text-primary-foreground shadow-glow"
                      : clashing
                      ? "border-status-error-border bg-status-error-surface"
                      : past
                      ? "border-border-subtle bg-surface-subtle"
                      : "border-border-subtle bg-card hover:border-primary/30"
                  )}
                >
                  <div className="relative z-10 flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex h-7 min-w-[34px] items-center justify-center rounded-xl px-2 text-2xs font-bold",
                        active
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : clashing
                          ? "bg-status-error-surface text-status-error-text"
                          : past
                          ? "bg-muted text-ink-subtle"
                          : "bg-brand-50 text-primary"
                      )}
                    >
                      <bdi>{ui("P{0}", [slot.periodNumber])}</bdi>
                    </span>

                    {active ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-primary-foreground/20 px-2.5 py-1 text-2xs font-semibold text-primary-foreground">
                        <span className="relative flex size-1.5">
                          <span className="absolute size-full animate-ping rounded-full bg-primary-foreground opacity-80 motion-reduce:hidden" />
                          <span className="relative size-1.5 rounded-full bg-primary-foreground" />
                        </span>
                        {ui("Live")}
                      </span>
                    ) : clashing ? (
                      <Badge variant="danger" size="sm">
                        <AlertTriangle className="size-2.5" aria-hidden="true" />
                        {ui("Clash")}
                      </Badge>
                    ) : past ? (
                      <Badge variant="success" size="sm">
                        <CheckCircle2 className="size-2.5" aria-hidden="true" />
                        {ui("Done")}
                      </Badge>
                    ) : (
                      <Badge variant="warning" size="sm" dot>
                        {ui("Up next")}
                      </Badge>
                    )}
                  </div>

                  <p
                    className={cn(
                      "relative z-10 mt-3 text-2xs font-bold tabular-nums",
                      active ? "text-primary-foreground/80" : clashing ? "text-status-error-text" : past ? "text-ink-subtle" : "text-primary"
                    )}
                  >
                    <bdi dir="ltr">{slot.startTime} — {slot.endTime}</bdi>
                  </p>

                  <p
                    className={cn(
                      "relative z-10 mt-1 truncate text-md font-bold tracking-tight transition-colors",
                      active ? "text-primary-foreground" : past ? "text-ink-subtle" : "text-ink-strong group-hover:text-primary"
                    )}
                  >
                    <bdi>{subject}</bdi>
                  </p>

                  <p className={cn("relative z-10 mt-0.5 flex items-center gap-1 truncate text-2xs font-semibold", active ? "text-primary-foreground/70" : "text-ink-subtle")}>
                    <bdi>{className}</bdi>
                  </p>
                  {slot.roomNumber ? (
                    <p className={cn("relative z-10 mt-0.5 flex items-center gap-1 text-2xs font-semibold", active ? "text-primary-foreground/60" : "text-ink-subtle")}>
                      <MapPin aria-hidden="true" className="size-2.5" />
                      <bdi>{slot.roomNumber}</bdi>
                    </p>
                  ) : null}

                  {/* live elapsed progress inside the active card */}
                  {active ? (
                    <div className="relative z-10 mt-3 h-1 overflow-hidden rounded-full bg-primary-foreground/20">
                      <div
                        className="h-full rounded-full bg-primary-foreground transition-[width] duration-1000 ease-linear"
                        style={{ width: `${elapsed}%` }}
                      />
                    </div>
                  ) : null}
                </Button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
