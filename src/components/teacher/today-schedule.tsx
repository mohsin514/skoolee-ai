"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Clock, MapPin, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
 * The teacher's "Today's Schedule" strip — a live, interactive timeline.
 *
 * Instead of a static row of chips this shows a ticking clock, a day-progress
 * bar, a countdown to the next class and per-period status cards
 * (Live / Up next / Done / Clash), so a glance at the dashboard tells the
 * teacher exactly where they are in the day.
 */
export function TodaySchedule({
  slots,
  loading = false,
  clashIds,
  onOpenTimetable,
}: {
  slots: TimetableSlot[];
  loading?: boolean;
  clashIds?: Set<string>;
  onOpenTimetable?: () => void;
}) {
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

  const clock = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const minutesToNext = nextEntry ? Math.max(nextEntry.start - minuteNow, 0) : 0;

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="rounded-[32px] overflow-hidden border border-[#cfc2d6]/20 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] p-6 animate-skeleton-in">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="skeleton-shimmer h-9 w-9 rounded-2xl bg-[#e8e0ec]/60" />
            <div className="skeleton-shimmer h-4 w-40 rounded-full bg-[#e8e0ec]/50" />
          </div>
          <div className="skeleton-shimmer h-6 w-24 rounded-full bg-[#e8e0ec]/40" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-shimmer h-[120px] w-[200px] shrink-0 rounded-3xl bg-[#e8e0ec]/45" />
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) return null;

  return (
    <div className="sk-rise relative overflow-hidden rounded-[32px] border border-[#cfc2d6]/20 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.22)]">
      {/* ambient background */}
      <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#8127cf]/[0.07] blur-3xl sk-blob" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-[#b10e6b]/[0.05] blur-3xl sk-blob sk-blob-2" />

      <div className="relative p-6">
        {/* ── Header row ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-[0_8px_20px_-4px_rgba(129,39,207,0.45)]">
              {liveEntry ? (
                <span className="absolute -right-1 -top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                </span>
              ) : nextEntry ? (
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-white" />
              ) : null}
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-[#1d1b20] flex items-center gap-2">
                Today&apos;s Schedule
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#fbf0fe] border border-[#8127cf]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8127cf]">
                  <Timer className="h-3 w-3" />
                  {clock}
                </span>
              </h3>
              <p className="mt-0.5 text-[10px] font-semibold text-ink-subtle">
                {doneCount} of {entries.length} periods done
                {nextEntry && !liveEntry ? ` · next in ${minutesToNext}m` : liveEntry ? " · class in session" : " · all wrapped up"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:block w-28">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle">Day progress</span>
                <span className="text-[9px] font-black text-[#8127cf]">{Math.round(dayProgress)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#f3f4f9] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-[width] duration-1000 ease-linear"
                  style={{ width: `${dayProgress}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenTimetable}
              className="group flex items-center gap-1.5 rounded-2xl bg-[#fbf0fe] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white hover:shadow-lg hover:shadow-[#8127cf]/25 active:scale-[0.96] cursor-pointer"
            >
              Full timetable
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </div>
        </div>

        {/* ── Day progress (mobile) ── */}
        <div className="md:hidden mb-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle">Day progress</span>
            <span className="text-[9px] font-black text-[#8127cf]">{Math.round(dayProgress)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#f3f4f9] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-[width] duration-1000 ease-linear"
              style={{ width: `${dayProgress}%` }}
            />
          </div>
        </div>

        {/* ── Period cards ── */}
        <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-2 -mx-2 px-2 snap-x snap-mandatory">
          {entries.map(({ slot, start, end, active, past, clashing }) => {
            const elapsed =
              active && end > start ? clamp(((minuteNow - start) / (end - start)) * 100, 0, 100) : 0;

            return (
              <button
                key={slot.id}
                type="button"
                onClick={onOpenTimetable}
                title="Open the full timetable"
                className={cn(
                  "sk-sweep-trigger group relative isolate shrink-0 snap-start overflow-hidden rounded-3xl border p-4 text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25 cursor-pointer min-w-[196px] w-[212px]",
                  active
                    ? "border-transparent bg-gradient-to-br from-[#8127cf] via-[#9c48ea] to-[#b10e6b] shadow-[0_18px_44px_-12px_rgba(129,39,207,0.55)]"
                    : clashing
                    ? "border-rose-200 bg-rose-50/70"
                    : past
                    ? "border-[#cfc2d6]/15 bg-white/55"
                    : "border-[#cfc2d6]/20 bg-white hover:border-[#8127cf]/30"
                )}
              >
                <span className="sk-sweep bg-gradient-to-r from-transparent via-white/50 to-transparent" />

                <div className="relative z-10 flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex h-7 min-w-[34px] items-center justify-center rounded-xl px-2 text-[10px] font-black tracking-wider",
                      active
                        ? "bg-white/20 text-white"
                        : clashing
                        ? "bg-rose-100 text-rose-700"
                        : past
                        ? "bg-[#f3f4f9] text-ink-subtle"
                        : "bg-[#fbf0fe] text-[#8127cf]"
                    )}
                  >
                    P{slot.periodNumber}
                  </span>

                  {active ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute h-full w-full animate-ping rounded-full bg-white opacity-80" />
                        <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
                      </span>
                      Live
                    </span>
                  ) : clashing ? (
                    <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-rose-700">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Clash
                    </span>
                  ) : past ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Done
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-600">
                      Up next
                    </span>
                  )}
                </div>

                <p
                  className={cn(
                    "relative z-10 mt-3 text-[10px] font-black tabular-nums tracking-wide",
                    active ? "text-white/75" : clashing ? "text-rose-600" : past ? "text-ink-subtle" : "text-[#8127cf]"
                  )}
                >
                  {slot.startTime} — {slot.endTime}
                </p>

                <p
                  className={cn(
                    "relative z-10 mt-1 truncate text-[15px] font-bold tracking-tight transition-colors",
                    active ? "text-white" : past ? "text-ink-subtle" : "text-[#1d1b20] group-hover:text-[#8127cf]"
                  )}
                >
                  {slot.subject?.name || "Free period"}
                </p>

                <p className={cn("relative z-10 mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold", active ? "text-white/60" : "text-ink-subtle")}>
                  {slot.className}
                  {slot.classSection ? ` - ${slot.classSection}` : ""}
                </p>
                {slot.roomNumber ? (
                  <p className={cn("relative z-10 mt-0.5 flex items-center gap-1 text-[9px] font-semibold", active ? "text-white/45" : "text-ink-subtle")}>
                    <MapPin className="h-2.5 w-2.5" />
                    {slot.roomNumber}
                  </p>
                ) : null}

                {/* live elapsed progress inside the active card */}
                {active ? (
                  <div className="relative z-10 mt-3 h-1 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-1000 ease-linear"
                      style={{ width: `${elapsed}%` }}
                    />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}