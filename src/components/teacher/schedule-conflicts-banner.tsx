"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_LABELS, detectSlotClashes, type ClashSlot } from "@/lib/timetable/clashes";

/**
 * Teacher-facing counterpart to the office's `TeacherConflictsBanner`.
 *
 * The office board flags double-bookings campus-wide, but the teacher living
 * the broken day saw nothing at all. Wording differs from the admin banner on
 * purpose: a teacher cannot edit the timetable, so this points at the office
 * rather than offering a fix.
 */
export function ScheduleConflictsBanner({
  slots,
  /**
   * What `slots` covers, for the headline wording. The dashboard passes only
   * today's slots, the timetable page passes the whole week.
   */
  scope = "week",
}: {
  slots: ClashSlot[];
  scope?: "today" | "week";
}) {
  const [open, setOpen] = useState(false);

  const clashes = useMemo(() => detectSlotClashes(slots), [slots]);

  if (clashes.length === 0) return null;

  const scopeLabel = scope === "today" ? "today" : "this week";

  return (
    <div className="sk-rise overflow-hidden rounded-[24px] border border-rose-200/70 bg-gradient-to-br from-rose-50 to-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(190,18,60,0.20)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-rose-50/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/20"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-[#1f1a23]">
              You&apos;re double-booked {scopeLabel}
            </p>
            <p className="mt-0.5 text-[10px] font-bold text-[#4d4354]/60">
              {clashes.length} period{clashes.length !== 1 ? "s" : ""} put you in more than one
              class at the same time
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-rose-500 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="space-y-2 border-t border-rose-200/50 p-4">
          {clashes.map((clash) => (
            <div key={clash.key} className="rounded-2xl bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-rose-700">
                  {DAY_LABELS[clash.dayOfWeek] || `Day ${clash.dayOfWeek}`} · P{clash.periodNumber}
                </span>
                <span className="text-[10px] font-black text-[#4d4354]/50">{clash.startTime}</span>
              </div>
              <p className="mt-1.5 text-xs font-bold leading-relaxed text-[#1f1a23]">
                {clash.classes.join("  &  ")}
              </p>
            </div>
          ))}
          <p className="pt-1 text-[10px] font-bold text-[#4d4354]/55">
            You can&apos;t edit the timetable yourself — ask the office to move one of these periods.
          </p>
        </div>
      ) : null}
    </div>
  );
}
