"use client";
import { Check } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Pick time slots across a week. Busy slots are shown hatched and cannot be picked; screen readers
 * hear why. On a phone it reads as one day after another; from tablet width the days sit side by side.
 */
export interface AvailabilityDay { day: number; label: string; slots: Array<{ id: string; label: string; free: boolean }> }

const WORDS = {
  busy: { en: "Busy", ar: "مشغول", ur: "مصروف" },
  picked: { en: "Picked", ar: "مختار", ur: "منتخب" },
  free: { en: "Free", ar: "متاح", ur: "خالی" },
  allFree: { en: "All free", ar: "كل المتاح", ur: "تمام خالی" },
  legend: { en: "Key", ar: "دليل الألوان", ur: "علامات" },
} as const;

const HATCH = "bg-[repeating-linear-gradient(135deg,var(--border-subtle)_0_2px,transparent_2px_7px)]";

export function AvailabilityGrid({ days, value, onChange, label, busyLabel, legendLabels }: {
  days: AvailabilityDay[]; value: string[]; onChange: (value: string[]) => void; label: string; busyLabel: string;
  legendLabels?: { busy?: string; picked?: string; free?: string; allFree?: string };
}) {
  const { language } = useLocale();
  const words = { busy: legendLabels?.busy ?? WORDS.busy[language], picked: legendLabels?.picked ?? WORDS.picked[language], free: legendLabels?.free ?? WORDS.free[language], allFree: legendLabels?.allFree ?? WORDS.allFree[language] };
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  const pickDay = (day: AvailabilityDay) => onChange([...new Set([...value, ...day.slots.filter(slot => slot.free).map(slot => slot.id)])]);
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted" aria-label={WORDS.legend[language]}>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className={cn("size-4 rounded-md border border-border-subtle", HATCH)} />{words.busy}</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="size-4 rounded-md bg-primary" />{words.picked}</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="size-4 rounded-md border border-border bg-card" />{words.free}</li>
      </ul>
      <div data-field-shell className="grid gap-3 rounded-2xl border p-3 md:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]" role="group" aria-label={label}>
        {days.map(day => {
          const open = day.slots.filter(slot => slot.free);
          const allPicked = open.length > 0 && open.every(slot => value.includes(slot.id));
          return (
            <fieldset key={day.day} className="min-w-0 space-y-1.5">
              <legend className="mb-1 flex w-full items-center justify-between gap-2 text-sm font-semibold text-ink-strong">
                <span dir="auto">{day.label}</span>
                {open.length > 1 && !allPicked && <Button type="button" variant="link" size="sm" className="min-h-8 px-1 py-0" onClick={() => pickDay(day)}>{words.allFree}</Button>}
              </legend>
              <div className="flex flex-wrap gap-1.5 md:flex-col">
                {day.slots.map(slot => {
                  if (!slot.free) {
                    return (
                      <span key={slot.id} dir="ltr" className={cn("inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle px-3 text-sm tabular-nums text-ink-faint", HATCH)}>
                        <bdi>{slot.label}</bdi><span className="sr-only">, {busyLabel}</span>
                      </span>
                    );
                  }
                  const picked = value.includes(slot.id);
                  return (
                    <button
                      key={slot.id} type="button" dir="ltr" aria-pressed={picked}
                      className={cn("inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm tabular-nums transition-colors duration-(--duration-control)",
                        picked ? "border-primary bg-primary text-white" : "border-border bg-card hover:border-primary hover:bg-surface-hover")}
                      onClick={() => toggle(slot.id)}
                    >{picked && <Check className="sk-check-pop size-3.5" strokeWidth={3} aria-hidden />}<bdi>{slot.label}</bdi></button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
