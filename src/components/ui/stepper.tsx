"use client";
import { useState, type KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { useLocale, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { FieldAction, InputGroup } from "./input-group";

const WORDS = {
  decrease: { en: "Decrease", ar: "إنقاص", ur: "کم کریں" },
  increase: { en: "Increase", ar: "زيادة", ur: "بڑھائیں" },
} as const;

/** Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits read as ASCII, so an Urdu keyboard types ۱۵۰. */
export function asciiDigits(text: string): string {
  return text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * A bounded number with 44px −/+ actions on the shared field surface. Typing keeps a local draft;
 * onChange fires only for a value inside [min, max], anything else marks the field invalid until it
 * is clamped and committed on blur or Enter. Off focus the value shows grouped in the school's digits.
 */
export function Stepper({ value, onChange, min, max, step = 1, unit, label, className, decreaseLabel, increaseLabel, invalid = false, describedBy }: {
  value: number | null; onChange: (value: number) => void; min: number; max: number; step?: number; unit?: string; label: string; className?: string;
  decreaseLabel?: string; increaseLabel?: string; invalid?: boolean; describedBy?: string;
}) {
  const { language } = useLocale();
  const format = useLocaleFormat();
  const [draft, setDraft] = useState<string | null>(null);
  const current = value ?? min;
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next / step) * step));
  const set = (next: number) => onChange(clamp(next));
  const parsed = draft === null ? null : draft.trim() === "" ? null : Number(draft);
  const draftInvalid = draft !== null && draft.trim() !== "" && (!Number.isFinite(parsed) || (parsed as number) < min || (parsed as number) > max);
  const commit = () => {
    if (draft === null) return;
    if (parsed !== null && Number.isFinite(parsed)) set(parsed);
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); commit(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setDraft(null); set(current + step); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setDraft(null); set(current - step); }
  };
  const shown = draft ?? (value === null ? "" : format.number(value, 0));
  const press = "motion-safe:transition-transform motion-safe:duration-(--duration-fast) motion-safe:active:scale-95";
  return (
    <InputGroup className={cn("inline-flex w-auto shrink-0 min-h-11 sm:min-h-12", className)} role="group" aria-label={label}>
      <FieldAction data-field-affix="start" className={press} label={decreaseLabel ?? WORDS.decrease[language]} disabled={current <= min} onClick={() => { setDraft(null); set(current - step); }}><Minus aria-hidden /></FieldAction>
      <input
        inputMode="numeric" dir="ltr" aria-label={label} aria-invalid={draftInvalid || invalid || undefined} aria-describedby={describedBy}
        aria-valuemin={min} aria-valuemax={max} role="spinbutton" aria-valuenow={value ?? undefined}
        className="min-w-12 text-center text-base font-semibold tabular-nums placeholder:text-ink-subtle"
        style={{ flex: "0 0 auto", inlineSize: `${String(max).length + 1.5}ch`, paddingInline: "0.25rem" }}
        placeholder="—" value={shown}
        onFocus={() => setDraft(value === null ? "" : String(value))}
        onChange={event => {
          const text = asciiDigits(event.target.value).replace(/[^\d]/g, "");
          setDraft(text);
          const next = Number(text);
          if (text !== "" && Number.isFinite(next) && next >= min && next <= max) onChange(next);
        }}
        onBlur={commit} onKeyDown={onKeyDown}
      />
      {unit && <span data-field-affix="end" className="text-sm font-medium text-ink-muted" dir="auto">{unit}</span>}
      <FieldAction className={press} label={increaseLabel ?? WORDS.increase[language]} disabled={current >= max} onClick={() => { setDraft(null); set(current + step); }}><Plus aria-hidden /></FieldAction>
    </InputGroup>
  );
}
