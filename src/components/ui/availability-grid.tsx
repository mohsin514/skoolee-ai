"use client";
import { cn } from "@/lib/utils";

/**
 * Pick time slots across a week. Busy slots are shown but cannot be picked. On a phone it reads as
 * one day after another; from tablet width the days sit side by side.
 */
export interface AvailabilityDay { day: number; label: string; slots: Array<{ id: string; label: string; free: boolean }> }

export function AvailabilityGrid({ days, value, onChange, label, busyLabel }: { days: AvailabilityDay[]; value: string[]; onChange: (value: string[]) => void; label: string; busyLabel: string }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  return (
    <div className="grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]" role="group" aria-label={label}>
      {days.map(day => (
        <fieldset key={day.day} className="space-y-1.5">
          <legend className="mb-1 text-sm font-semibold">{day.label}</legend>
          <div className="flex flex-wrap gap-1.5 md:flex-col">
            {day.slots.map(slot => {
              const picked = value.includes(slot.id);
              return (
                <button
                  key={slot.id} type="button" dir="ltr" disabled={!slot.free} aria-pressed={picked}
                  title={slot.free ? undefined : busyLabel}
                  className={cn("min-h-11 rounded-lg border px-3 text-sm tabular-nums transition-colors",
                    !slot.free ? "cursor-not-allowed border-border-subtle bg-surface-subtle text-ink-faint line-through" : picked ? "border-primary bg-primary text-white" : "border-border bg-card hover:bg-surface-hover")}
                  onClick={() => toggle(slot.id)}
                >{slot.label}</button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
