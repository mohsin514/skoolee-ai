"use client";
import type { KeyboardEvent, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChoiceOption { value: string; label: string; detail?: string }

/** Arrow keys move the choice within a radio group, as native radios do (mirrored in RTL). */
export function arrowSelect(event: KeyboardEvent<HTMLElement>, options: ChoiceOption[], value: unknown, onChange: (value: string) => void) {
  const forward = ["ArrowDown", "ArrowRight"], backward = ["ArrowUp", "ArrowLeft"];
  if (![...forward, ...backward].includes(event.key) || options.length === 0) return;
  event.preventDefault();
  const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
  const horizontal = event.key === "ArrowRight" || event.key === "ArrowLeft";
  const step = (forward.includes(event.key) ? 1 : -1) * (rtl && horizontal ? -1 : 1);
  const at = Math.max(0, options.findIndex(option => option.value === value));
  const next = options[(at + step + options.length) % options.length];
  onChange(next.value);
  event.currentTarget.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
}

/**
 * A selectable card: a radio or checkbox mark, the label and an optional detail line. Use inside a
 * `role="radiogroup"` (shape "radio", one tabbable card) or a `role="group"` (shape "check").
 */
export function ChoiceCard({ option, selected, shape, onSelect, tabbable = true, hotkey, className }: {
  option: ChoiceOption; selected: boolean; shape: "radio" | "check"; onSelect: () => void; tabbable?: boolean;
  /** A keycap shown at the end on pointer screens, for a keyboard shortcut the caller handles. */
  hotkey?: string; className?: string;
}) {
  return (
    <button type="button" className={cn("sk-choice-card-option", className)} data-value={option.value} tabIndex={tabbable ? 0 : -1}
      role={shape === "radio" ? "radio" : undefined} aria-checked={shape === "radio" ? selected : undefined} aria-pressed={shape === "check" ? selected : undefined} onClick={onSelect}>
      <span className="sk-choice-mark" data-shape={shape} aria-hidden>{shape === "check" && selected ? <Check className="size-3.5" strokeWidth={3.5} /> : null}</span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-sm font-semibold text-ink-strong" dir="auto">{option.label}</span>
        {option.detail && <span className="block text-xs leading-relaxed text-ink-muted" dir="auto">{option.detail}</span>}
      </span>
      {hotkey && <kbd className="sk-choice-key sk-fade-in" aria-hidden>{hotkey}</kbd>}
    </button>
  );
}

/** A compact segmented control for a short single choice (two to four options). */
export function SegmentedChoice({ label, options, value, onChange, className }: { label: string; options: ChoiceOption[]; value: string; onChange: (value: string) => void; className?: string }) {
  const known = options.some(option => option.value === value);
  return (
    <div className={cn("sk-segmented", className)} role="radiogroup" aria-label={label} onKeyDown={event => arrowSelect(event, options, value, onChange)}>
      {options.map((option, index) => (
        <button key={option.value} type="button" role="radio" data-value={option.value} aria-checked={value === option.value} tabIndex={value === option.value || (!known && index === 0) ? 0 : -1} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  );
}

/** One step in a step rail on an ink cover: number (or a check when done), label and a short count. */
export function StepPill({ index, label, meta, current, done, onSelect }: { index: number; label: ReactNode; meta?: ReactNode; current: boolean; done: boolean; onSelect: () => void }) {
  return (
    <button type="button" className="sk-step-pill" data-done={done || undefined} aria-current={current ? "step" : undefined} onClick={onSelect}>
      <span className="sk-step-pill-dot" aria-hidden>{done ? <Check className="size-4" strokeWidth={3} /> : index + 1}</span>
      <span>{label}</span>
      {meta != null && <span data-numeric className="text-xs font-medium opacity-70">{meta}</span>}
    </button>
  );
}

/** A row of jump dots, one per item (questions on a step): filled when done, stretched when current. */
export function ProgressDots({ label, items, onSelect, className }: { label: string; items: Array<{ id: string; label: string; done: boolean; current: boolean }>; onSelect: (id: string) => void; className?: string }) {
  return (
    <div className={cn("sk-progress-dots", className)} role="group" aria-label={label}>
      {items.map(item => <button key={item.id} type="button" data-done={item.done || undefined} aria-current={item.current ? "step" : undefined} aria-label={item.label} onClick={() => onSelect(item.id)} />)}
    </div>
  );
}
