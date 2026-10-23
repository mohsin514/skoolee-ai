"use client";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** A bounded number with large tap targets; typing is allowed and clamped on blur. */
export function Stepper({ value, onChange, min, max, step = 1, unit, label, className }: { value: number | null; onChange: (value: number) => void; min: number; max: number; step?: number; unit?: string; label: string; className?: string }) {
  const current = value ?? min;
  const set = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next / step) * step)));
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1", className)} role="group" aria-label={label}>
      <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-surface-hover disabled:opacity-40" aria-label={`${label} −`} disabled={current <= min} onClick={() => set(current - step)}><Minus className="size-4" aria-hidden /></button>
      <input
        inputMode="numeric" dir="ltr" aria-label={label} className="w-14 bg-transparent text-center text-base font-semibold tabular-nums outline-none"
        value={value ?? ""} onChange={event => { const next = Number(event.target.value.replace(/[^\d]/g, "")); if (Number.isFinite(next)) onChange(next); }}
        onBlur={() => set(current)}
      />
      {unit && <span className="pe-1 text-sm text-ink-muted">{unit}</span>}
      <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-surface-hover disabled:opacity-40" aria-label={`${label} +`} disabled={current >= max} onClick={() => set(current + step)}><Plus className="size-4" aria-hidden /></button>
    </div>
  );
}
