"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_LABELS, detectSlotClashes, type ClashSlot } from "@/lib/timetable/clashes";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUiText } from "@/components/locale/LocaleProvider";

/**
 * Teacher-facing counterpart to the office's `TeacherConflictsBanner`.
 *
 * The office board flags double-bookings campus-wide, but the teacher living
 * the broken day saw nothing at all. Wording differs from the admin banner on
 * purpose: a teacher cannot edit the timetable, so this points at the office
 * rather than offering a fix. One shared `Alert` (status tokens, translated
 * copy); the clash list opens on demand so the banner stays one line tall.
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
  const ui = useUiText();
  const [open, setOpen] = useState(false);

  const clashes = useMemo(() => detectSlotClashes(slots), [slots]);

  if (clashes.length === 0) return null;

  const title = scope === "today" ? ui("You're double-booked today") : ui("You're double-booked this week");
  const detail = clashes.length === 1
    ? ui("1 period puts you in more than one class at the same time.")
    : ui("{0} periods put you in more than one class at the same time.", [clashes.length]);

  return (
    <Alert
      tone="danger"
      icon={AlertTriangle}
      live="off"
      title={title}
    >
      <p>{detail}</p>
      <Button variant="outline" size="sm" type="button" className="mt-2" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? ui("Hide the clashes") : ui("Show the clashes")}
        <ChevronDown aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open ? (
        <div className="mt-3 space-y-2">
          <ul className="space-y-2">
            {clashes.map((clash) => (
              <li key={clash.key} className="rounded-xl border border-border-subtle bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="danger" size="sm" dot>
                    {DAY_LABELS[clash.dayOfWeek] ? ui(DAY_LABELS[clash.dayOfWeek]) : ui("Day {0}", [clash.dayOfWeek])} · {ui("P{0}", [clash.periodNumber])}
                  </Badge>
                  <bdi dir="ltr" className="text-xs font-medium tabular-nums text-ink-subtle">{clash.startTime}</bdi>
                </div>
                <p className="mt-1.5 text-sm font-semibold leading-relaxed text-ink-strong">
                  {clash.classes.map((name, index) => (
                    <span key={`${name}-${index}`}>
                      {index > 0 ? <span aria-hidden="true" className="text-ink-faint"> · </span> : null}
                      <bdi>{name}</bdi>
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-ink-muted">
            {ui("You can't edit the timetable yourself — ask your academic lead to move one of these periods.")}
          </p>
        </div>
      ) : null}
    </Alert>
  );
}
