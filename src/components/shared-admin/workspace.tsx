"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The pieces every admin list screen was rebuilding by hand.
 *
 * Five panels each had their own copy of the same search box, their own idea of
 * what a header looks like, and — more importantly — their own answer to "can I
 * act on more than one row at a time?", which was usually "no". Putting the
 * shell in one place makes the answer the same everywhere: search, filter,
 * switch between cards and a dense table, select several, act on them.
 */

/* ────────────────────────── Preferences ────────────────────────── */

export type WorkspaceView = "cards" | "table" | "board";
export type SortDir = "asc" | "desc";

export interface WorkspacePrefs {
  view: WorkspaceView;
  density: "compact" | "comfortable";
  sortKey: string;
  sortDir: SortDir;
  perPage: number;
}

function storageKey(scope: string) {
  return `skoolee.workspace.${scope}`;
}

/**
 * Remembers how someone likes to look at a screen.
 *
 * The load and the save cannot both be plain effects: they run in the same
 * commit, so the saver fires while state still holds the defaults and writes
 * them straight over what was stored. Tracking which scope the current values
 * came from is what makes the save wait its turn.
 */
export function useWorkspacePrefs(
  scope: string,
  defaults: Partial<WorkspacePrefs> = {},
): [WorkspacePrefs, (next: Partial<WorkspacePrefs>) => void] {
  const base = useMemo<WorkspacePrefs>(
    () => ({
      view: "cards",
      density: "comfortable",
      sortKey: "",
      sortDir: "asc",
      perPage: 12,
      ...defaults,
    }),
    // Callers pass an object literal; re-reading it on every render would reset
    // the fallback each time and defeat the load below.
    [scope],
  );

  const [prefs, setPrefs] = useState<WorkspacePrefs>(base);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    let stored: Partial<WorkspacePrefs> = {};
    try {
      const raw = window.localStorage.getItem(storageKey(scope));
      if (raw) stored = JSON.parse(raw) as Partial<WorkspacePrefs>;
    } catch {
      /* a blocked or full storage must never break the screen */
    }
    setPrefs({ ...base, ...stored });
    setLoadedFor(scope);
  }, [scope, base]);

  useEffect(() => {
    if (loadedFor !== scope) return;
    try {
      window.localStorage.setItem(storageKey(scope), JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs, loadedFor, scope]);

  const patch = useCallback((next: Partial<WorkspacePrefs>) => {
    setPrefs((p) => ({ ...p, ...next }));
  }, []);

  return [prefs, patch];
}

/* ────────────────────────── Header ────────────────────────── */

export function WorkspaceHeader({
  icon: Icon,
  eyebrow,
  title,
  summary,
  actions,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  /** One live sentence about what is on screen right now. */
  summary?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="sk-rise relative overflow-hidden rounded-[22px] border border-[#cfc2d6]/20 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_8px_24px_-12px_rgba(129,39,207,0.22)] sm:px-5">
      {/* A gradient rail reads as considered where a full gradient panel reads
          as decoration — and it costs no vertical space. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#8127cf] via-[#9c48ea] to-[#8127cf]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-bl from-[#8127cf]/8 to-transparent blur-2xl"
      />

      <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-[0_4px_12px_-2px_rgba(129,39,207,0.45)]">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            {/* Eyebrow rides beside the title rather than above it: it is
                context, not a heading, and a whole line for one word was the
                single biggest waste of height on every screen. */}
            <div className="flex items-baseline gap-2">
              <h2 className="truncate text-lg font-black leading-tight tracking-tight text-[#1f1a23]">
                {title}
              </h2>
              <span className="hidden shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-[#8127cf]/70 sm:inline">
                {eyebrow}
              </span>
            </div>
            {summary ? (
              <p className="truncate text-[11px] font-semibold leading-tight text-ink-muted">
                {summary}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/* ────────────────────────── Stat tiles ────────────────────────── */

export interface StatTileSpec {
  key: string;
  icon?: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "violet" | "teal" | "amber" | "emerald" | "rose" | "slate";
  onClick?: () => void;
  active?: boolean;
}

const TILE_TONES = {
  violet: { chip: "bg-[#f3eeff] text-[#8127cf]", ring: "rgba(129,39,207,0.9)", bar: "bg-[#8127cf]" },
  teal: { chip: "bg-teal-50 text-teal-600", ring: "rgba(13,148,136,0.9)", bar: "bg-teal-500" },
  amber: { chip: "bg-amber-50 text-amber-600", ring: "rgba(245,158,11,0.9)", bar: "bg-amber-500" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", ring: "rgba(16,185,129,0.9)", bar: "bg-emerald-500" },
  rose: { chip: "bg-rose-50 text-rose-600", ring: "rgba(225,29,72,0.9)", bar: "bg-rose-500" },
  slate: { chip: "bg-[#f3f4f9] text-ink-muted", ring: "rgba(107,114,128,0.9)", bar: "bg-[#9aa1ae]" },
} as const;

/**
 * Metric tiles, laid out horizontally.
 *
 * Stacked vertically — icon, then number, then label, then hint — each tile ran
 * about 110px tall, which is a lot of screen to spend on four numbers before
 * any actual data appears. Side by side they read the same and cost half that.
 */
export function StatTiles({ tiles, columns = 4 }: { tiles: StatTileSpec[]; columns?: 4 | 5 | 6 }) {
  return (
    <div
      className={cn(
        "grid gap-2.5",
        columns === 6
          ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
          : columns === 5
            ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5"
            : "grid-cols-2 lg:grid-cols-4",
      )}
    >
      {tiles.map((t) => {
        const tone = TILE_TONES[t.tone ?? "violet"];
        const interactive = Boolean(t.onClick);
        // A card with nothing to do is not a button.
        const Tag = interactive ? "button" : "div";
        return (
          <Tag
            key={t.key}
            {...(interactive
              ? { type: "button" as const, onClick: t.onClick, "aria-pressed": Boolean(t.active) }
              : {})}
            className={cn(
              "group relative flex items-center gap-3 overflow-hidden rounded-[18px] border bg-white px-3.5 py-2.5 text-left transition-all duration-200",
              t.active
                ? "border-transparent"
                : "border-[#cfc2d6]/20 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_6px_16px_-10px_rgba(31,26,35,0.25)]",
              interactive &&
                "cursor-pointer hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:shadow-[0_2px_4px_rgba(31,26,35,0.05),0_14px_28px_-14px_rgba(129,39,207,0.4)]",
            )}
            style={t.active ? { boxShadow: `0 0 0 1.5px ${tone.ring}, 0 10px 24px -14px ${tone.ring}` } : undefined}
          >
            {/* A tinted edge keeps the tone readable without a coloured card. */}
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", tone.bar, t.active ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-60")} />
            {t.icon ? (
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105", tone.chip)}>
                <t.icon className="h-4 w-4" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-black leading-none tracking-tight tabular-nums text-[#1f1a23] sm:text-[22px]">
                {t.value}
              </span>
              <span className="mt-1 block truncate text-[10px] font-bold uppercase leading-tight tracking-wider text-ink-muted">
                {t.label}
              </span>
              {t.hint ? (
                <span className="mt-0.5 block truncate text-[10px] font-semibold leading-tight text-ink-subtle">
                  {t.hint}
                </span>
              ) : null}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

/* ────────────────────────── Toolbar ────────────────────────── */

export function WorkspaceToolbar({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-[18px] border border-[#cfc2d6]/20 bg-white/85 p-2 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_8px_24px_-16px_rgba(31,26,35,0.35)] backdrop-blur-xl">
      {children}
      {trailing ? <div className="ml-auto flex flex-wrap items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

/** The search box five panels each had their own copy of. `/` focuses it. */
export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  autoFocusKey = "/",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  /** Set to null to opt out of the global shortcut. */
  autoFocusKey?: string | null;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusKey) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === autoFocusKey) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autoFocusKey]);

  return (
    <div className={cn("relative min-w-[190px] flex-1", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#cfc2d6]" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={autoFocusKey ? `${placeholder}   ( ${autoFocusKey} )` : placeholder}
        aria-label={label}
        className="h-10 w-full rounded-xl border border-[#cfc2d6]/20 bg-[#faf7fc] pl-9 pr-9 text-xs font-semibold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-ink-subtle transition-all hover:bg-[#f3f4f9] hover:text-[#8127cf]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** A compact labelled dropdown sized to sit in the toolbar row. */
export function ToolbarSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: [string, string][];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-10 cursor-pointer appearance-none rounded-xl border border-[#cfc2d6]/20 bg-white pl-3 pr-8 text-[11px] font-bold text-[#1f1a23] outline-none transition-all hover:border-[#8127cf]/30 focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-[#8127cf]" />
    </div>
  );
}

export function ToolbarToggle({
  active,
  icon: Icon,
  label,
  count,
  tone = "amber",
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  count?: number;
  tone?: "amber" | "rose" | "violet";
  onClick: () => void;
}) {
  const tones = {
    amber: { on: "border-amber-300 bg-amber-50 text-amber-700", badge: "bg-amber-500" },
    rose: { on: "border-rose-300 bg-rose-50 text-rose-700", badge: "bg-rose-500" },
    violet: { on: "border-[#8127cf]/40 bg-[#fbf0fe] text-[#8127cf]", badge: "bg-[#8127cf]" },
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-[11px] font-black uppercase tracking-wider transition-all",
        active
          ? tones[tone].on
          : "border-[#cfc2d6]/20 bg-white text-ink-muted hover:border-[#8127cf]/30 hover:text-[#8127cf]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count ? (
        <span className={cn("rounded-full px-1.5 text-[9px] text-white", tones[tone].badge)}>{count}</span>
      ) : null}
    </button>
  );
}

export function ViewSwitch({
  value,
  onChange,
  options,
}: {
  value: WorkspaceView;
  onChange: (v: WorkspaceView) => void;
  options: { value: WorkspaceView; label: string; icon: LucideIcon }[];
}) {
  return (
    <div className="flex h-10 items-center gap-0.5 rounded-xl border border-[#cfc2d6]/20 bg-[#faf7fc] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.label}
          className={cn(
            "flex h-full cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black uppercase tracking-wider transition-all",
            value === o.value
              ? "bg-white text-[#8127cf] shadow-[0_1px_3px_rgba(31,26,35,0.12)]"
              : "text-ink-muted hover:text-[#8127cf]",
          )}
        >
          <o.icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function SortDirButton({ dir, onToggle }: { dir: SortDir; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dir === "asc" ? "Sort descending" : "Sort ascending"}
      title={dir === "asc" ? "Ascending" : "Descending"}
      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-[#cfc2d6]/20 bg-white text-ink-muted transition-all hover:border-[#8127cf]/30 hover:text-[#8127cf]"
    >
      {dir === "asc" ? (
        <ArrowUpWideNarrow className="h-4 w-4" />
      ) : (
        <ArrowDownWideNarrow className="h-4 w-4" />
      )}
    </button>
  );
}

/* ────────────────────────── Bulk actions ────────────────────────── */

export interface BulkAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Hex background. Omit for the neutral outline treatment. */
  accent?: string;
  count?: number;
  disabled?: boolean;
  onRun: () => void;
}

export function SelectionBar({
  total,
  actions,
  onClear,
  busy,
  note,
}: {
  total: number;
  actions: BulkAction[];
  onClear: () => void;
  busy?: boolean;
  note?: string;
}) {
  if (total === 0) return null;
  return (
    <div className="sticky top-[60px] z-[19] flex flex-wrap items-center gap-2 rounded-[18px] border border-[#8127cf]/25 bg-white/92 p-2 shadow-[0_2px_6px_rgba(129,39,207,0.10),0_16px_36px_-16px_rgba(129,39,207,0.45)] backdrop-blur-xl">
      <span className="rounded-full bg-[#8127cf] px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white">
        {total} selected
      </span>
      {actions.length === 0 ? (
        <span className="text-[11px] font-semibold text-ink-muted">
          {note || "Nothing can be done to this selection right now."}
        </span>
      ) : (
        actions.map((a) => (
          <button
            key={a.key}
            type="button"
            disabled={busy || a.disabled}
            onClick={a.onRun}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-2xl px-3.5 py-2 text-[11px] font-black uppercase tracking-wider transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50",
              a.accent
                ? "text-white"
                : "border border-[#cfc2d6]/30 bg-white text-ink-muted hover:text-[#8127cf]",
            )}
            style={a.accent ? { backgroundColor: a.accent } : undefined}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : a.icon ? <a.icon className="h-3.5 w-3.5" /> : null}
            {a.label}
            {a.count !== undefined ? (
              <span className={cn("rounded-full px-1.5", a.accent ? "bg-white/25" : "bg-[#f3f4f9]")}>
                {a.count}
              </span>
            ) : null}
          </button>
        ))
      )}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto cursor-pointer rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-wider text-ink-muted transition-colors hover:text-[#8127cf]"
      >
        Clear
      </button>
    </div>
  );
}

/* ────────────────────────── Data table ────────────────────────── */

export interface DataColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  /** Tailwind width class, e.g. "w-32". */
  width?: string;
  /** Hide below the lg breakpoint — keeps narrow screens readable. */
  secondary?: boolean;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  selected,
  onToggleSelect,
  onToggleAll,
  sort,
  onSort,
  onRowClick,
  rowClassName,
  density = "comfortable",
  empty,
  minWidth = 900,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
  sort?: { key: string; dir: SortDir };
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  density?: "compact" | "comfortable";
  empty?: ReactNode;
  minWidth?: number;
}) {
  const selectable = Boolean(onToggleSelect);
  const allSelected =
    selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));
  const pad = density === "compact" ? "px-3 py-2" : "px-4 py-3";

  return (
    <div className="overflow-x-auto rounded-[28px] border border-[#cfc2d6]/25 bg-white shadow-sm custom-scrollbar">
      <table className="w-full text-left" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-[#cfc2d6]/10 bg-[#fbf0fe]/30">
            {selectable ? (
              <th className={cn("w-10", pad)}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Select everything in this list"
                  className="h-4 w-4 cursor-pointer accent-[#8127cf]"
                />
              </th>
            ) : null}
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  pad,
                  "text-[9px] font-black uppercase tracking-wider text-ink-muted",
                  c.width,
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  c.secondary && "hidden lg:table-cell",
                )}
              >
                {c.sortable && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-[#8127cf]"
                  >
                    {c.label}
                    {sort?.key === c.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUpWideNarrow className="h-3 w-3 text-[#8127cf]" />
                      ) : (
                        <ArrowDownWideNarrow className="h-3 w-3 text-[#8127cf]" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-[#cfc2d6]" />
                    )}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = rowKey(row);
            const isSelected = selected?.has(id);
            return (
              <tr
                key={id}
                className={cn(
                  "border-b border-[#cfc2d6]/5 transition-colors hover:bg-[#fbf0fe]/25",
                  isSelected && "bg-[#fbf0fe]/40",
                  rowClassName?.(row),
                )}
              >
                {selectable ? (
                  <td className={pad}>
                    <input
                      type="checkbox"
                      checked={Boolean(isSelected)}
                      onChange={() => onToggleSelect?.(id)}
                      aria-label="Select row"
                      className="h-4 w-4 cursor-pointer accent-[#8127cf]"
                    />
                  </td>
                ) : null}
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    onClick={i === 0 && onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      pad,
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.secondary && "hidden lg:table-cell",
                      i === 0 && onRowClick && "cursor-pointer",
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="px-4 py-12 text-center text-sm font-semibold text-ink-muted"
              >
                {empty ?? "Nothing to show."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────── Pagination ────────────────────────── */

export function Pagination({
  page,
  totalPages,
  perPage,
  total,
  firstShown,
  lastShown,
  onPage,
  onPerPage,
  perPageOptions = [12, 24, 48, 96],
}: {
  page: number;
  totalPages: number;
  perPage: number;
  total: number;
  firstShown: number;
  lastShown: number;
  onPage: (p: number) => void;
  onPerPage: (n: number) => void;
  perPageOptions?: number[];
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f3f4f9] pt-5">
      <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted">
        Showing {firstShown}–{lastShown} of {total}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
          Per page
          <select
            value={perPage}
            onChange={(e) => onPerPage(Number(e.target.value))}
            className="h-9 cursor-pointer rounded-xl border border-[#cfc2d6]/25 bg-white px-2.5 text-[11px] font-bold text-[#1f1a23] outline-none transition-all focus:border-[#8127cf]/40"
          >
            {perPageOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {totalPages > 1 ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-[#f3f4f9] text-ink-muted transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[64px] text-center text-[10px] font-black uppercase tracking-wider text-ink-muted">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-[#f3f4f9] text-ink-muted transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Shared paging maths, so no screen has to get the off-by-one right again. */
export function usePaged<T>(rows: T[], perPage: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [rows.length, perPage]);

  return {
    page: safePage,
    setPage,
    totalPages,
    firstShown: rows.length === 0 ? 0 : (safePage - 1) * perPage + 1,
    lastShown: Math.min(safePage * perPage, rows.length),
    rows: rows.slice((safePage - 1) * perPage, safePage * perPage),
  };
}


/* ────────────────────────── Modal pager ────────────────────────── */

/**
 * Step through a list without closing the dialog. Reviewing thirty students
 * should not mean opening and shutting thirty drawers, and the arrow keys make
 * it a scan rather than a click-fest.
 */
export function ModalPager({
  sequence,
  currentId,
  onNavigate,
  noun = "record",
  tone = "light",
}: {
  sequence: { id: string; label: string }[];
  currentId: string;
  onNavigate: (id: string) => void;
  noun?: string;
  /** "light" sits on a white header, "dark" on a coloured one. */
  tone?: "light" | "dark";
}) {
  const index = sequence.findIndex((s) => s.id === currentId);
  const prev = index > 0 ? sequence[index - 1] : undefined;
  const next = index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowDown" && next) {
        e.preventDefault();
        onNavigate(next.id);
      } else if (e.key === "ArrowUp" && prev) {
        e.preventDefault();
        onNavigate(prev.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [next, prev, onNavigate]);

  if (sequence.length < 2 || index < 0) return null;

  const base =
    tone === "dark"
      ? "text-white/80 hover:bg-white/20"
      : "text-ink-muted hover:bg-[#fbf0fe] hover:text-[#8127cf]";

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-2xl px-1.5 py-1",
        tone === "dark" ? "bg-white/12" : "bg-[#f3f4f9]",
      )}
    >
      <button
        type="button"
        disabled={!prev}
        onClick={() => prev && onNavigate(prev.id)}
        title={prev ? `Previous ${noun}: ${prev.label}` : `First ${noun}`}
        aria-label={`Previous ${noun}`}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-xl transition-colors enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-35",
          base,
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span
        className={cn(
          "px-1 text-[10px] font-black tabular-nums",
          tone === "dark" ? "text-white/80" : "text-ink-muted",
        )}
      >
        {index + 1}/{sequence.length}
      </span>
      <button
        type="button"
        disabled={!next}
        onClick={() => next && onNavigate(next.id)}
        title={next ? `Next ${noun}: ${next.label}` : `Last ${noun}`}
        aria-label={`Next ${noun}`}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-xl transition-colors enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-35",
          base,
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
