"use client";

import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/locale/package";
import { ISO_WEEK_DAYS, weekdayName } from "./weekday";

/**
 * The working week as a seven-day ribbon (ISO order, Monday first).
 *
 * - paper: the academic step's control — a labelled group of seven pressed
 *   toggle buttons (pressed = working day); a closed day is hatched.
 * - cover: the plate's decorative ribbon of narrow initials with a filled
 *   (working) or hollow (closed) dot; aria-hidden.
 *
 * Names come from Intl (UTC), so the strip is rendered after load.
 */
export type WeekStripProps = {
  variant: "cover" | "paper";
  language: Language;
  closed: number[];
  onToggle?(day: number): void;
  labelFor?(day: number, closed: boolean): string;
  group?: { id: string; labelledBy: string; describedBy: string };
};

export function WeekStrip({ variant, language, closed, onToggle, labelFor, group }: WeekStripProps) {
  if (variant === "cover") {
    return (
      <div className="sk-week" data-variant="cover" aria-hidden="true">
        {ISO_WEEK_DAYS.map((day) => (
          <span key={day} data-day={day} data-closed={closed.includes(day) ? "" : undefined}>
            {weekdayName(day, language, "narrow")}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div
      id={group?.id}
      role="group"
      tabIndex={-1}
      aria-labelledby={group?.labelledBy}
      aria-describedby={group?.describedBy}
      className="sk-week"
      data-variant="paper"
    >
      {ISO_WEEK_DAYS.map((day) => {
        const off = closed.includes(day);
        return (
          <Button
            key={day}
            variant="choice"
            type="button"
            aria-pressed={!off}
            aria-label={labelFor ? labelFor(day, off) : undefined}
            onClick={() => onToggle?.(day)}
            className="sk-weekday min-h-14 min-w-0 flex-col gap-1.5 px-0.5 py-2"
          >
            <span className="max-w-full truncate text-xs font-semibold">{weekdayName(day, language, "short")}</span>
            <span aria-hidden="true" className="sk-weekday-dot" />
          </Button>
        );
      })}
    </div>
  );
}
