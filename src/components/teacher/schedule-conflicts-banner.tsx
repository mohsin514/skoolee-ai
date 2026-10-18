"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_LABELS, detectSlotClashes, type ClashSlot } from "@/lib/timetable/clashes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";


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
    <div className="sk-rise overflow-hidden rounded-[24px] border border-rose-200/70 bg-gradient-to-br from-rose-50 to-white shadow-[0_4px_16px_-4px_rgba(120,70,180,0.10),0_12px_32px_-12px_rgba(190,18,60,0.20)]">
      <Button variant="secondary"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-start"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-status-error-surface text-status-error-text">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink-strong">
              You&apos;re double-booked {scopeLabel}
            </p>
            <p className="mt-0.5 text-xs font-normal leading-relaxed text-ink-muted">
              {clashes.length} period{clashes.length !== 1 ? "s" : ""} put you in more than one
              class at the same time
            </p>
          </div>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0 text-status-error-text transition-transform", open && "rotate-180")}
        />
      </Button>

      {open ? (
        <div className="space-y-2 border-t border-rose-200/50 p-4">
          {clashes.map((clash) => (
            <div key={clash.key} className="sk-panel p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="danger" size="sm" dot>
                  {DAY_LABELS[clash.dayOfWeek] || `Day ${clash.dayOfWeek}`} · P{clash.periodNumber}
                </Badge>
                <span className="text-xs font-medium tabular-nums text-ink-subtle">{clash.startTime}</span>
              </div>
              <p className="mt-1.5 text-sm font-semibold leading-relaxed text-ink-strong">
                {clash.classes.join("  &  ")}
              </p>
            </div>
          ))}
          <p className="pt-1 text-xs leading-relaxed text-ink-muted">
            You can&apos;t edit the timetable yourself — ask the office to move one of these periods.
          </p>
        </div>
      ) : null}
    </div>
  );
}
