"use client";

import * as React from "react";
import { Search, X, type LucideIcon } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Kbd } from "./kbd";
import { LiveAnnouncer } from "./live-announcer";

/**
 * The operational desks' shared surfaces (Front desk, Library, Transport, Service desk, Care, Activities,
 * Payroll, Purchasing, Dormitory). Every desk used to draw its own counters, record rows and timelines from
 * `sk-panel p-3` and a bare border; these give them one look: tone-led stat tiles, record rows with a status
 * rail, and one timeline. Text props are already translated by the caller (they are data, not UI keys), so a
 * desk keeps its own copy and catalogue entries. Tones map to the status tokens in globals.css (`.sk-desk-*`).
 *
 * UX contract every desk follows:
 * - Urgency first: rows that need someone now (overdue, unassigned, safety) sort to the top and carry a tone.
 * - Counters are filters: a `StatTile` with `onSelect` is a toggle button (`aria-pressed`) that narrows the list
 *   below it; pressing it again shows everything. `DeskFilterStatus` says what is shown and announces changes.
 * - Time reads relative ("in 3 hours", "2 days ago") through `RelativeTime`, with the full date for assistive tech.
 * - Long lists get `DeskQuickFilter`: type to narrow, `/` jumps to it from anywhere on the desk, Escape clears.
 */
export type DeskTone = "brand" | "info" | "success" | "warning" | "danger" | "neutral";

type DataAttributes = { [key: `data-${string}`]: string | number | boolean | undefined };

/** A row of stat tiles. Wraps from one column on a phone to as many as fit. */
export function DeskStats({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sk-desk-stats", className)} {...props}>{children}</div>;
}

export interface StatTileProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  value: React.ReactNode;
  label: React.ReactNode;
  icon?: LucideIcon;
  tone?: DeskTone;
  /** A second line under the label (a target, a trend). */
  hint?: React.ReactNode;
  /** Attributes for the number itself, e.g. `{ "data-count": "boarded" }` for tests that read the count. */
  valueProps?: DataAttributes;
  /** Stagger index for the entrance animation. */
  index?: number;
  /** Makes the tile a filter toggle for the list below it. */
  onSelect?: () => void;
  selected?: boolean;
}

export function StatTile({ value, label, icon: Icon, tone = "brand", hint, valueProps, index = 0, onSelect, selected = false, className, style, ...props }: StatTileProps) {
  const body = <>
    {Icon ? <span aria-hidden="true" className="sk-stat-tile-icon"><Icon /></span> : null}
    <span className="sk-stat-tile-value" {...valueProps}>{value}</span>
    <span className="sk-stat-tile-label">{label}</span>
    {hint ? <span className="sk-stat-tile-hint">{hint}</span> : null}
  </>;
  const shared = { "data-tone": tone, style: { ["--sk-i" as string]: index, ...style } };
  // A counter that filters the list is a toggle: the whole tile is the button and says whether it is on.
  if (onSelect) return <button type="button" aria-pressed={selected} data-selected={selected || undefined} onClick={onSelect} className={cn("sk-stat-tile", className)} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)} {...shared}>{body}</button>;
  return <div className={cn("sk-stat-tile", className)} {...shared} {...props}>{body}</div>;
}

/** "in 3 hours" / "2 days ago" in the reader's language; the exact date stays in `dateTime` and for screen readers. */
export function RelativeTime({ iso, full, className }: { iso: string; full?: string; className?: string }) {
  const { language } = useLocale();
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return null;
  // Server render and first paint show the exact date, so hydration never disagrees with the clock.
  if (now === null) return <time dateTime={iso} className={className}>{full ?? iso}</time>;
  const seconds = Math.round((at - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60]];
  const [unit, size] = steps.find(([, span]) => Math.abs(seconds) >= span) ?? ["minute", 60];
  const text = new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(Math.round(seconds / size), unit);
  return <time dateTime={iso} className={className}><span aria-hidden="true">{text}</span><span className="sr-only">{full ?? text}</span></time>;
}

/** Type-to-narrow box for a desk's list. `/` focuses it from anywhere outside a field; Escape clears it. */
export function DeskQuickFilter({ value, onChange, label, className }: { value: string; onChange: (next: string) => void; label: string; className?: string }) {
  const ui = useUiText();
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className={cn("sk-desk-filter", className)} data-desk-filter>
      <Search aria-hidden="true" className="sk-desk-filter-icon" />
      <Input ref={ref} type="search" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && value) { event.preventDefault(); onChange(""); } }} aria-label={label} placeholder={label} dir="auto" className="ps-11 pe-12" />
      {value ? <button type="button" className="sk-desk-filter-clear" aria-label={ui("Clear filter")} onClick={() => { onChange(""); ref.current?.focus(); }}><X aria-hidden="true" /></button> : <Kbd className="sk-desk-filter-key sk-ai-fine-only">/</Kbd>}
    </div>
  );
}

/** What the list shows after a tile or the quick filter narrowed it, with a way back; announced politely. */
export function DeskFilterStatus({ shown, total, onClear }: { shown: number; total: number; onClear: () => void }) {
  const ui = useUiText();
  const message = shown === total ? null : ui("{0} of {1} shown", [String(shown), String(total)]);
  return <>
    <LiveAnnouncer message={message} />
    {message ? <p className="sk-desk-filter-status" data-desk-filter-status><span>{message}</span><button type="button" onClick={onClear}>{ui("Show all")}</button></p> : null}
  </>;
}

/** Sorts a copy of `rows` so the most urgent come first; `rank` returns a lower number for more urgent rows. */
export function urgencyFirst<T>(rows: readonly T[], rank: (row: T) => number): T[] {
  return rows.map((row, index) => ({ row, index, rank: rank(row) })).sort((a, b) => a.rank - b.rank || a.index - b.index).map(({ row }) => row);
}

/** Class for a record row (a request, a visitor, a trip, a run). Put it on the existing `<li>` or row button. */
export const deskRow = "sk-desk-row";

export interface DeskRowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: DeskTone | "muted";
  icon?: LucideIcon;
  /** Trailing content (a status pill, a count) pinned to the inline-end. */
  trailing?: React.ReactNode;
}

/** A whole record row that opens the record: icon tile, the caller's lines, and an optional trailing pill. */
export const DeskRowButton = React.forwardRef<HTMLButtonElement, DeskRowButtonProps>(function DeskRowButton({ tone, icon, trailing, className, children, type = "button", ...props }, ref) {
  return (
    <button ref={ref} type={type} data-tone={tone} className={cn(deskRow, "flex w-full flex-wrap items-start gap-x-3 gap-y-2 sm:flex-nowrap", className)} {...props}>
      {icon ? <DeskRowIcon icon={icon} /> : null}
      <span className="block min-w-0 flex-1 space-y-1">{children}</span>
      {/* On a phone the status drops under the text (aligned with it) so the title keeps the full width. */}
      {trailing ? <span className={cn("order-last basis-full sm:order-none sm:max-w-[45%] sm:shrink-0 sm:basis-auto", icon && "ps-12 sm:ps-0")}>{trailing}</span> : null}
    </button>
  );
});

/** The leading icon tile of a record row; its colour follows the row's `data-tone`. */
export function DeskRowIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return <span aria-hidden="true" className={cn("sk-desk-row-icon", className)}><Icon /></span>;
}

/** A small status chip with a dot, coloured by tone. `children` is translated copy. */
export function DeskPill({ tone = "neutral", className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: DeskTone }) {
  return <span data-tone={tone} className={cn("sk-desk-pill", className)} {...props}><span aria-hidden="true" className="sk-desk-pill-dot" />{children}</span>;
}

/** Class for a timeline `<ol>`; each `<li>` gets a dot on the rail (`data-tone` on the item colours it). */
export const deskTimeline = "sk-desk-timeline";

/** A titled block inside a desk (vehicle check, agent actions, emergency closure). */
export function DeskSection({ title, icon: Icon, tone = "brand", action, className, children, ...props }: Omit<React.HTMLAttributes<HTMLElement>, "title"> & { title: React.ReactNode; icon?: LucideIcon; tone?: DeskTone; action?: React.ReactNode }) {
  return (
    <section data-tone={tone} className={cn("sk-desk-section", className)} {...props}>
      <div className="sk-desk-section-head">
        {Icon ? <span aria-hidden="true" className="sk-desk-section-icon"><Icon /></span> : null}
        <h3 className="min-w-0 flex-1">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
