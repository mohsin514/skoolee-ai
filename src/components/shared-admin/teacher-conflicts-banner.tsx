"use client";

import { Button as SystemButton } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useTeacherAvailability } from "@/components/shared-admin/teacher-picker";
import { useUiText } from "@/components/locale/LocaleProvider";

/**
 * Campus-wide roll-up of teacher scheduling problems.
 *
 * Individual pickers warn at the moment of assignment, but nothing surfaced
 * problems that already existed — this makes them impossible to miss. Two
 * distinct issues are reported:
 *   • double-bookings  — the same teacher in two classes at one period
 *   • over-commitment  — one teacher taking every period of >1 whole section
 */
export function TeacherConflictsBanner() {
  const { availability, loading } = useTeacherAvailability();
  const [open, setOpen] = useState(false);
  const ui = useUiText();

  const { doubleBooked, overCommitted, totalClashes } = useMemo(() => {
    const doubleBooked = availability.filter((t) => t.conflicts.length > 0);
    const overCommitted = availability.filter((t) => t.wholeSectionClasses.length > 1);
    const totalClashes = doubleBooked.reduce((sum, t) => sum + t.conflicts.length, 0);
    return { doubleBooked, overCommitted, totalClashes };
  }, [availability]);

  if (loading || (doubleBooked.length === 0 && overCommitted.length === 0)) return null;

  return (
    <div className="sk-rise mb-5 overflow-hidden rounded-[24px] border border-status-error-border bg-gradient-to-br from-status-error-surface to-card shadow-md">
      <SystemButton variant="ghost"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-auto w-full items-center justify-between gap-3 whitespace-normal p-4 text-start"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-status-error-surface text-status-error-text">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink-strong">{ui("Teacher scheduling conflicts")}</p>
            <p className="mt-0.5 text-xs font-normal leading-relaxed text-ink-muted">
              {doubleBooked.length > 0
                ? ui(
                    doubleBooked.length === 1
                      ? totalClashes === 1 ? "1 teacher double-booked in 1 period" : "1 teacher double-booked across {1} periods"
                      : totalClashes === 1 ? "{0} teachers double-booked in 1 period" : "{0} teachers double-booked across {1} periods",
                    [doubleBooked.length, totalClashes],
                  )
                : null}
              {doubleBooked.length > 0 && overCommitted.length > 0 ? " · " : null}
              {overCommitted.length > 0
                ? ui("{0} taking every period of more than one section", [overCommitted.length])
                : null}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-status-error-text transition-transform", open && "rotate-180")} />
      </SystemButton>

      {open ? (
        <div className="space-y-3 border-t border-status-error-border p-4">
          {overCommitted.map((t) => (
            <div key={`over-${t.id}`} className="sk-panel p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-status-warning-text" />
                <p className="min-w-0 truncate text-sm font-semibold text-ink-strong">{t.fullName}</p>
                <Badge variant="warning" size="sm" dot>
                  {ui("Over-committed")}
                </Badge>
              </div>
              <p className="mt-1 ps-5 text-xs leading-relaxed text-ink-muted">
                {ui("Takes every period of {0} — only one is possible.", [t.wholeSectionClasses.map((c) => c.label).join(", ")])}
              </p>
            </div>
          ))}

          {doubleBooked.map((t) => (
            <div key={`clash-${t.id}`} className="sk-panel p-3">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-status-error-text" />
                <p className="min-w-0 truncate text-sm font-semibold text-ink-strong">{t.fullName}</p>
                <Badge variant="danger" size="sm" dot>
                  {ui("{0} clash(es)", [t.conflicts.length])}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 ps-5">
                {t.conflicts.slice(0, 8).map((c) => (
                  <span
                    key={`${t.id}-${c.day}-${c.period}`}
                    className="rounded-lg border border-status-error-border bg-status-error-surface px-2 py-1 text-2xs font-medium tabular-nums text-status-error-text"
                  >
                    {c.label} · {c.classes.join(" / ")}
                  </span>
                ))}
                {t.conflicts.length > 8 ? (
                  <span className="rounded-lg bg-muted px-2 py-1 text-2xs font-medium text-ink-muted">
                    {ui("+{0} more", [t.conflicts.length - 8])}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 ps-5 text-xs leading-relaxed text-ink-muted">
                {ui("Fix in Timetable — move one of the clashing periods to a free slot or a different teacher.")}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
