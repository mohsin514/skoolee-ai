"use client";

import { forwardRef, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Input } from "./input-base";
import { Button } from "./button";
import { ModalSurface } from "./modal";
import { cn } from "@/lib/utils";

function iso(date: Date) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parse(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (year < 100) date.setFullYear(year);
  return iso(date) === value ? date : null;
}
function shiftMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const last = new Date(next);
  last.setMonth(last.getMonth() + 1, 0);
  next.setDate(Math.min(date.getDate(), last.getDate()));
  return next;
}
const defaultMessages = {
  openCalendar: (field: string) => `Choose ${field.toLowerCase()}`,
  dialogTitle: 'Choose date', title: 'Choose a date', close: 'Close calendar',
  selected: 'Selected date', unselected: 'No date selected', chooseDay: 'Choose a day below',
  previousMonth: 'Previous month', nextMonth: 'Next month', days: 'Days of the month',
  today: 'Today', cancel: 'Cancel',
  keyboardHelp: 'Use arrow keys to move by day, Home and End to move within the week, and Page Up or Page Down to change the month. Hold Shift to change the year.',
};
export type DatePickerMessages = typeof defaultMessages;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'type'> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Names the calendar trigger and its selected-date summary. */
  label?: string;
  /** Display locale only; the submitted value remains an ISO Gregorian date. */
  locale?: string;
  /** School-configured first day: Sunday = 0, Saturday = 6. */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  messages?: Partial<DatePickerMessages>;
};

/** Editable native date field with a branded, keyboard-accessible calendar. */
export const DatePicker = forwardRef<HTMLInputElement, Props>(function DatePicker({ value: suppliedValue, defaultValue, onValueChange, onChange, min, max, label = 'Effective date', locale = 'en-US', weekStartsOn = 0, messages, dir, className, disabled, readOnly, ...props }, ref) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localValue, setLocalValue] = useState(defaultValue ?? '');
  const value = suppliedValue ?? localValue;
  const outOfRange = (date: Date) => (typeof min === 'string' && iso(date) < min) || (typeof max === 'string' && iso(date) > max);
  const copy = { ...defaultMessages, ...messages };
  const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, calendar: 'gregory' }).format(date);
  const formatNumber = (value: number) => new Intl.NumberFormat(locale, { useGrouping: false }).format(value);
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(2026, 0, 4 + (weekStartsOn + index) % 7));
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parse(value) ?? new Date());
  const grid = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const selectedDate = parse(value);
  const today = iso(new Date());
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() - weekStartsOn + 7) % 7;
  const choose = (date: Date) => {
    if (outOfRange(date)) return;
    const input = inputRef.current;
    if (input) {
      // Use the native setter so React receives a genuine input event, including
      // its name, validity, target and form association (react-hook-form too).
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, iso(date));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setOpen(false);
  };
  const boundedDate = (date: Date) => {
    const lower = typeof min === 'string' ? parse(min) : null;
    const upper = typeof max === 'string' ? parse(max) : null;
    return lower && date < lower ? lower : upper && date > upper ? upper : date;
  };
  const focusDate = (requested: Date) => {
    const date = boundedDate(requested);
    pendingFocus.current = iso(date);
    setCursor(date);
  };
  // Focus after the new month is committed, including dates across year boundaries.
  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${key}"]`)?.focus({ preventScroll: true });
  }, [cursor]);
  const moveDays = (days: number) => {
    const next = new Date(cursor);
    next.setDate(next.getDate() + days);
    focusDate(next);
  };
  return <div data-date-field="" dir={dir} lang={locale} className="relative min-w-0">
    <Input {...props} min={min} max={max} ref={(node) => {
      inputRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }} dir={dir} lang={locale} type="date" value={suppliedValue} defaultValue={suppliedValue === undefined ? defaultValue : undefined} disabled={disabled} readOnly={readOnly} onChange={(event) => {
      if (suppliedValue === undefined) setLocalValue(event.target.value);
      onValueChange?.(event.target.value);
      onChange?.(event);
    }} className={cn('sk-date pe-14', className)} />
    <button type="button" disabled={disabled || readOnly} aria-label={copy.openCalendar(label)} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setLocalValue(inputRef.current?.value ?? ""); setCursor(boundedDate(parse(inputRef.current?.value ?? value) ?? new Date())); setOpen(true); }} className="absolute end-0.5 top-0.5 grid h-11 w-11 place-items-center rounded-[14px] text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"><CalendarDays aria-hidden="true" className="h-5 w-5" /></button>
    {open && <ModalSurface onClose={() => setOpen(false)} ariaLabel={copy.dialogTitle} className="!max-w-sm">
      <div dir={dir} lang={locale} className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#542080] via-[#7020b9] to-[#8127cf] px-5 pb-5 pt-5 text-white sm:px-6">
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-xs font-semibold tracking-wide text-white/85">{label}</p><h2 className="mt-1 text-lg font-bold">{copy.title}</h2></div>
            <Button variant="ghost" size="icon" aria-label={copy.close} onClick={() => setOpen(false)} className="-me-2 -mt-2 shrink-0 text-white hover:bg-white/15 hover:text-white focus-on-dark"><X /></Button>
          </div>
          <div className="relative mt-4 flex items-center gap-3">
            <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-3xl font-semibold tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">{selectedDate ? formatNumber(selectedDate.getDate()) : <CalendarDays className="h-6 w-6" />}</span>
            <div className="min-w-0"><p className="text-xs text-white/85">{selectedDate ? copy.selected : copy.unselected}</p><p className="mt-1 text-sm font-semibold">{selectedDate ? formatDate(selectedDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : copy.chooseDay}</p></div>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2"><Button variant="ghost" size="icon" aria-label={copy.previousMonth} onClick={() => setCursor(shiftMonths(cursor, -1))} className="shrink-0 rounded-full border border-border/60"><ChevronLeft className="rtl:rotate-180" /></Button><p aria-live="polite" className="min-w-0 break-words text-center text-sm font-bold">{formatDate(cursor, { month: 'long', year: 'numeric' })}</p><Button variant="ghost" size="icon" aria-label={copy.nextMonth} onClick={() => setCursor(shiftMonths(cursor, 1))} className="shrink-0 rounded-full border border-border/60"><ChevronRight className="rtl:rotate-180" /></Button></div>
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-ink-muted" aria-hidden="true">{weekdays.map((day) => <span key={day.getDay()} title={formatDate(day, { weekday: 'long' })} className="py-2">{formatDate(day, { weekday: 'narrow' })}</span>)}</div>
          <div ref={grid} role="group" aria-label={copy.days} className="grid grid-cols-7 gap-0.5" onKeyDown={(event) => {
            const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
            const delta = ({ ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
            if (delta) { event.preventDefault(); moveDays(delta); }
            else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              const dayInWeek = (cursor.getDay() - weekStartsOn + 7) % 7;
              moveDays(event.key === 'Home' ? -dayInWeek : 6 - dayInWeek);
            } else if (event.key === 'PageUp' || event.key === 'PageDown') {
              event.preventDefault();
              focusDate(shiftMonths(cursor, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1)));
            }
          }}>
            {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
            {Array.from({ length: count }, (_, i) => {
              const date = new Date(year, month, i + 1), key = iso(date), selected = key === value, isToday = key === today;
              return <button type="button" key={key} data-date={key} aria-label={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} disabled={outOfRange(date)} aria-pressed={selected} aria-current={isToday ? 'date' : undefined} tabIndex={cursor.getDate() === i + 1 ? 0 : -1} onFocus={() => { if (iso(cursor) !== key) setCursor(date); }} onClick={() => choose(date)} className={cn('disabled:cursor-not-allowed disabled:opacity-35 relative min-h-11 rounded-xl text-sm font-medium tabular-nums transition-[background-color,color,box-shadow] hover:bg-primary/10', selected && 'bg-primary font-bold text-white shadow-[0_5px_12px_-4px_rgba(129,39,207,0.5)] hover:bg-primary', !selected && isToday && 'bg-primary/5 font-bold text-primary ring-1 ring-inset ring-primary/25')}>{formatNumber(i + 1)}{isToday && <span aria-hidden="true" className={cn('absolute bottom-1 start-1/2 h-1 w-1 -translate-x-1/2 rounded-full rtl:translate-x-1/2', selected ? 'bg-white' : 'bg-primary')} />}</button>;
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3"><Button variant="ghost" disabled={outOfRange(new Date())} onClick={() => choose(new Date())} className="text-primary hover:text-primary">{copy.today}</Button><Button variant="outline" onClick={() => setOpen(false)}>{copy.cancel}</Button></div>
          <p className="sr-only">{copy.keyboardHelp}</p>
        </div>
      </div>
    </ModalSurface>}
  </div>;
});
