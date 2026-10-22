"use client";
import { Button as SystemButton } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup } from "@/components/ui/input-group";


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
  Inbox,
  Loader2,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuleTone } from "@/lib/ui/module-tones";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { PageHeader, type PageAction } from "@/components/ui/page-header";

/**
 * Every label in this kit is an EN UI key and is translated here, so a caller may pass either the key or text it
 * already translated (an Arabic or Urdu string is not a key and comes back unchanged).
 */

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

/**
 * The list-screen header, now a thin wrapper over the one `PageHeader` (§4.3, R1): one heading, one
 * sentence of summary, at most one primary action at the top-end and up to two visible secondaries.
 *
 * `headingLevel` is 2 by default (a section inside a view that already has its page title); a panel that
 * is the whole view passes 1. `primaryAction` / `secondaryActions` are the preferred API; the legacy
 * `actions` node still renders, in a row under the header, for callers not yet migrated.
 *
 * `description` (an EN UI key: the view's one sentence, §4.3) is the header's description whenever it is given;
 * a `summary` then moves to the status row as a live line, so a counted summary never displaces the sentence.
 */
export function WorkspaceHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  summary,
  actions,
  children,
  primaryAction,
  secondaryActions,
  status,
  tabs,
  headingLevel = 2,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  /** The view's one-sentence description (EN UI key); wins over `summary` for the description slot. */
  description?: string;
  /** One live sentence about what is on screen right now. */
  summary?: ReactNode;
  /** @deprecated Pass `primaryAction` / `secondaryActions`. */
  actions?: ReactNode;
  children?: ReactNode;
  /** @deprecated Module tones are no longer painted on headers; kept for callers. */
  tone?: ModuleTone;
  primaryAction?: PageAction;
  secondaryActions?: PageAction[];
  status?: ReactNode;
  tabs?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const ui = useUiText();
  // The description slot takes `description` when given, else a text summary; any other summary is a status line
  // (a text summary there is still a UI key, translated like the description would have been).
  const summaryInDescription = !description && typeof summary === "string";
  const summaryLine = !summaryInDescription && summary ? (typeof summary === "string" ? ui(summary) : summary) : null;
  const statusRow = (
    <>
      {summaryLine ? <p className="w-full break-words text-sm font-medium leading-relaxed text-ink-muted">{summaryLine}</p> : null}
      {status}
    </>
  );
  return (
    <div className="space-y-3">
      <PageHeader
        title={title}
        eyebrow={eyebrow}
        icon={Icon}
        description={description ?? (summaryInDescription ? (summary as string) : undefined)}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        status={summaryLine || status ? statusRow : undefined}
        tabs={tabs}
        headingLevel={headingLevel}
      />
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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

/** Tone names are kept for callers; each maps onto the status tokens (R10), never a raw palette. */
const TILE_TONES = {
  violet: { chip: "bg-status-brand-surface text-status-brand-text", ring: "ring-primary", bar: "bg-primary" },
  teal: { chip: "bg-status-info-surface text-status-info-text", ring: "ring-status-info-border", bar: "bg-status-info-text" },
  amber: { chip: "bg-status-warning-surface text-status-warning-text", ring: "ring-status-warning-border", bar: "bg-status-warning-text" },
  emerald: { chip: "bg-status-success-surface text-status-success-text", ring: "ring-status-success-border", bar: "bg-status-success-text" },
  rose: { chip: "bg-status-error-surface text-status-error-text", ring: "ring-status-error-border", bar: "bg-status-error-text" },
  slate: { chip: "bg-muted text-ink-muted", ring: "ring-border", bar: "bg-ink-faint" },
} as const;

/**
 * Metric tiles, laid out horizontally.
 *
 * Stacked vertically — icon, then number, then label, then hint — each tile ran
 * about 110px tall, which is a lot of screen to spend on four numbers before
 * any actual data appears. Side by side they read the same and cost half that.
 * A tile with an `onClick` is a shared `Button` (a filter toggle, `aria-pressed`); the rest are plain blocks.
 */
export function StatTiles({ tiles, columns = 4 }: { tiles: StatTileSpec[]; columns?: 4 | 5 | 6 }) {
  const ui = useUiText();
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
        const body = (
          <>
            {/* A tinted edge keeps the tone readable without a coloured card. */}
            <span aria-hidden className={cn("absolute inset-y-0 start-0 w-[3px]", tone.bar, t.active ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-60")} />
            {t.icon ? (
              <span aria-hidden="true" className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105", tone.chip)}>
                <t.icon className="h-4 w-4" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <bdi className="block text-xl font-bold leading-none tracking-tight tabular-nums text-ink-strong sm:text-2xl">
                {t.value}
              </bdi>
              <span className="mt-1 line-clamp-2 break-words text-xs font-semibold leading-tight text-ink-muted">
                {ui(t.label)}
              </span>
              {t.hint ? (
                <span className="mt-0.5 line-clamp-2 break-words text-2xs font-semibold leading-tight text-ink-subtle">
                  {ui(t.hint)}
                </span>
              ) : null}
            </span>
          </>
        );
        // A card with nothing to do is not a button.
        return t.onClick ? (
          <Button
            key={t.key}
            type="button"
            variant="choice"
            onClick={t.onClick}
            aria-pressed={Boolean(t.active)}
            className={cn(
              "group relative h-auto justify-start gap-3 overflow-hidden px-3.5 py-2.5 text-start font-normal",
              t.active && cn("ring-2", tone.ring),
            )}
          >
            {body}
          </Button>
        ) : (
          <div key={t.key} className="group sk-panel relative flex items-center gap-3 overflow-hidden px-3.5 py-2.5 text-start">
            {body}
          </div>
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
    <div className="sk-toolbar sticky top-0 z-20 flex flex-wrap items-center backdrop-blur-xl">
      {children}
      {trailing ? <div className="ms-auto flex flex-wrap items-center gap-2">{trailing}</div> : null}
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
  const ui = useUiText();
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
    <InputGroup surfaceClassName="bg-surface-subtle" className={cn("relative min-w-[190px] flex-1", className)}>
      <Search data-field-affix="start" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-edge" />
      <SystemInput
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={autoFocusKey ? `${ui(placeholder)}   ( ${autoFocusKey} )` : ui(placeholder)}
        aria-label={ui(label)}
        className="w-full ps-9 pe-9 transition-all"
      />
      {value ? (
        <SystemButton variant="ghost" data-field-affix="end"
          type="button"
          onClick={() => onChange("")}
          aria-label={ui("Clear search")}
          className="absolute end-2.5 top-1/2 flex -translate-y-1/2 items-center justify-center"
        >
          <X className="h-3.5 w-3.5" />
        </SystemButton>
      ) : null}
    </InputGroup>
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
  const ui = useUiText();
  return (
    <div className="relative">
      <SystemSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ui(label)}
        className="cursor-pointer appearance-none ps-3 pe-8 transition-all"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {ui(l)}
          </option>
        ))}
      </SystemSelect>

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
  const ui = useUiText();
  const tones = {
    amber: { on: "border-status-warning-border bg-status-warning-surface text-status-warning-text", badge: "bg-status-warning-surface text-status-warning-text" },
    rose: { on: "border-status-error-border bg-status-error-surface text-status-error-text", badge: "bg-status-error-surface text-status-error-text" },
    violet: { on: "border-primary/40 bg-brand-50 text-primary", badge: "bg-brand-100 text-primary" },
  } as const;
  return (
    <Button variant="outline"
      size="sm"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("gap-1.5 px-3", active ? tones[tone].on : "text-ink-muted")}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {ui(label)}
      {count ? (
        <bdi className={cn("rounded-full px-1.5 text-2xs font-bold tabular-nums", tones[tone].badge)}>{count}</bdi>
      ) : null}
    </Button>
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
  const ui = useUiText();
  return (
    <div role="group" aria-label={ui("Layout")} className="flex items-center gap-1 rounded-2xl border border-border-subtle bg-surface-subtle p-1">
      {options.map((o) => (
        <Tooltip key={o.value} content={ui(o.label)}>
        <Button variant="choice"
          size="sm"
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          aria-label={ui(o.label)}
          className={cn("gap-1.5 px-2.5", value === o.value ? "text-primary" : "border-transparent bg-transparent text-ink-muted")}
        >
          <o.icon aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{ui(o.label)}</span>
        </Button>
        </Tooltip>
      ))}
    </div>
  );
}

export function SortDirButton({ dir, onToggle }: { dir: SortDir; onToggle: () => void }) {
  const ui = useUiText();
  return (
    <Tooltip content={ui(dir === "asc" ? "Ascending" : "Descending")}>
    <Button variant="outline"
      type="button"
      onClick={onToggle}
      aria-label={ui(dir === "asc" ? "Sort descending" : "Sort ascending")}
      className="w-10"
    >
      {dir === "asc" ? (
        <ArrowUpWideNarrow className="h-4 w-4" />
      ) : (
        <ArrowDownWideNarrow className="h-4 w-4" />
      )}
    </Button>
    </Tooltip>
  );
}

/* ────────────────────────── Bulk actions ────────────────────────── */

export interface BulkAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** @deprecated Hex fills are no longer painted (R10); use `tone`. */
  accent?: string;
  /** "danger" for a destructive bulk action (it still runs behind its own ConfirmAction, §4.5.4). */
  tone?: "default" | "danger";
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
  const ui = useUiText();
  if (total === 0) return null;
  return (
    <div role="region" aria-label={ui("Selection actions")} className="sticky top-[60px] z-[19] flex flex-wrap items-center gap-2 rounded-2xl border border-primary/25 bg-card/95 p-2 shadow-lg backdrop-blur-xl">
      <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold tabular-nums text-primary-foreground" aria-live="polite">
        {ui("{0} selected", [total])}
      </span>
      {actions.length === 0 ? (
        <span className="text-xs font-medium text-ink-muted">
          {ui(note || "Nothing can be done to this selection right now.")}
        </span>
      ) : (
        actions.map((a) => (
          <Button variant={a.tone === "danger" ? "destructive" : "outline"}
            size="sm"
            key={a.key}
            type="button"
            disabled={busy || a.disabled}
            onClick={a.onRun}
            className="gap-1.5 px-3.5"
          >
            {busy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : a.icon ? <a.icon aria-hidden="true" className="h-3.5 w-3.5" /> : null}
            {ui(a.label)}
            {a.count !== undefined ? (
              <bdi className={cn("rounded-full px-1.5 tabular-nums", a.tone === "danger" ? "bg-card/25" : "bg-muted")}>
                {a.count}
              </bdi>
            ) : null}
          </Button>
        ))
      )}
      <Button variant="ghost"
        size="sm"
        type="button"
        onClick={onClear}
      >
        {ui("Clear selection")}
      </Button>
    </div>
  );
}

/* ────────────────────────── Data table ────────────────────────── */

export interface DataColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  /** Prefer logical start/end; left/right retain their physical alignment. */
  align?: "start" | "end" | "left" | "right" | "center";
  /** Tailwind width class, e.g. "w-32". */
  width?: string;
  /** Hide below the lg breakpoint — keeps narrow screens readable. */
  secondary?: boolean;
  /** First-cell render owns its action, including opaque custom components. */
  rowAction?: "provided";
  render: (row: T) => ReactNode;
}

const tableCopy = {
  en: { select: "Select", deselect: "Deselect", all: "Select all displayed rows", open: "Open" },
  ar: { select: "تحديد", deselect: "إلغاء تحديد", all: "تحديد جميع الصفوف المعروضة", open: "فتح" },
  ur: { select: "منتخب کریں", deselect: "انتخاب ختم کریں", all: "تمام دکھائی گئی قطاریں منتخب کریں", open: "کھولیں" },
};

function cellText(node: ReactNode): string {
  return React.Children.toArray(node).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    return React.isValidElement<{ children?: ReactNode }>(child) ? cellText(child.props.children) : "";
  }).filter(Boolean).join(" ");
}

/** Inspect supplied markup without calling a component or changing its children. */
function hasCellControl(node: ReactNode): boolean {
  return React.Children.toArray(node).some(child => {
    if (!React.isValidElement<{ children?: ReactNode; href?: unknown; role?: string; contentEditable?: boolean | "true" | "false" }>(child)) return false;
    if (child.props.role === "button" || child.props.role === "link") return true;
    if (child.type === Button || (typeof child.type !== "string" && child.props.href !== undefined)) return true;
    if (typeof child.type === "string" && (
      ["button", "input", "select", "textarea", "summary"].includes(child.type) ||
      (child.type === "a" && child.props.href !== undefined) ||
      child.props.contentEditable === true || child.props.contentEditable === "true"
    )) return true;
    return hasCellControl(child.props.children);
  });
}

const cellControlSelector = 'button, a[href], input, select, textarea, summary, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"])';

function columnAlignment(align: DataColumn<unknown>["align"]) {
  return { start: "text-start", end: "text-end", left: "text-left", right: "text-right", center: "text-center" }[align ?? "start"];
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
  caption,
  getRowLabel,
  selectAllLabel,
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
  caption?: ReactNode;
  /** A record name for selection/action labels; never passed through translation. */
  getRowLabel?: (row: T) => string;
  /** Describe the existing callback scope if it differs from the displayed rows. */
  selectAllLabel?: string;
}) {
  const copy = tableCopy[useLocale().language];
  const ui = useUiText();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectable = Boolean(onToggleSelect);
  const allSelected =
    selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));
  const partiallySelected = selectable && !allSelected && rows.some(r => selected?.has(rowKey(r)));
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected;
  }, [partiallySelected, selectable]);
  const pad = density === "compact" ? "px-3 py-2" : "px-4 py-3";

  return (
    <div className="sk-panel overflow-x-auto custom-scrollbar">
      <table className="sk-data-table" style={{ minWidth }}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-edge/10 bg-brand-50/30">
            {selectable ? (
              <th scope="col" className={cn("w-10", pad)}>
                <SystemCheckbox
                  ref={selectAllRef}
                  checked={allSelected}
                  aria-checked={partiallySelected ? "mixed" : allSelected}
                  disabled={!onToggleAll || rows.length === 0}
                  onChange={onToggleAll}
                  aria-label={selectAllLabel ?? copy.all}
                  className="h-4 w-4 cursor-pointer accent-primary"
                />
              </th>
            ) : null}
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                className={cn(
                  pad,
                  "text-xs font-semibold text-ink-muted",
                  c.width,
                  columnAlignment(c.align),
                  c.secondary && "hidden lg:table-cell",
                )}
              >
                {c.sortable && onSort ? (
                  <SystemButton variant="ghost"
                    type="button"
                    onClick={() => onSort(c.key)}
                    className="inline-flex items-center gap-1 justify-start"
                  >
                    {ui(c.label)}
                    {sort?.key === c.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUpWideNarrow className="h-3 w-3 text-primary" />
                      ) : (
                        <ArrowDownWideNarrow className="h-3 w-3 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-edge" />
                    )}
                  </SystemButton>
                ) : (
                  ui(c.label)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = rowKey(row);
            const isSelected = selected?.has(id);
            const cells = columns.map(column => column.render(row));
            const rowLabel = getRowLabel?.(row).trim() || cellText(cells[0]).trim() || id;
            return (
              <tr
                key={id}
                data-state={isSelected ? "selected" : undefined}
                className={cn(
                  "",

                  rowClassName?.(row),
                )}
              >
                {selectable ? (
                  <td className={pad}>
                    <SystemCheckbox

                      checked={Boolean(isSelected)}
                      onChange={() => onToggleSelect?.(id)}
                      aria-label={`${isSelected ? copy.deselect : copy.select} ${rowLabel}`}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </td>
                ) : null}
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    onClick={i === 0 && onRowClick ? event => {
                      // Preserve the legacy cell click without also firing for its controls.
                      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest(cellControlSelector))) return;
                      onRowClick(row);
                    } : undefined}
                    className={cn(
                      pad,
                      columnAlignment(c.align),
                      c.secondary && "hidden lg:table-cell",
                      i === 0 && onRowClick && "cursor-pointer",
                    )}
                  >
                    {i === 0 && onRowClick && c.rowAction !== "provided" && !hasCellControl(cells[i]) ? (
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="min-w-0 flex-1">{cells[i]}</div>
                        <SystemButton variant="ghost"
                          type="button"
                          aria-label={`${copy.open} ${rowLabel}`}
                          onClick={() => onRowClick(row)}
                          className="inline-flex min-h-11 shrink-0 items-center px-2 underline underline-offset-4 justify-start"
                        >
                          {copy.open}
                        </SystemButton>
                      </div>
                    ) : cells[i]}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="px-4 py-8"
              >
                {empty == null || typeof empty === "string" ? (
                  <EmptyState size="sm" icon={Inbox} title={ui(empty ?? "Nothing to show.")} />
                ) : (
                  empty
                )}
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
  const ui = useUiText();
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-muted pt-5">
      <p className="text-xs font-semibold text-ink-muted" aria-live="polite">
        {ui("Showing {0}–{1} of {2}", [firstShown, lastShown, total])}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-subtle">
          {ui("Per page")}
          <SystemSelect
            value={perPage}
            onChange={(e) => onPerPage(Number(e.target.value))}
            className="cursor-pointer px-2.5 transition-all"
          >
            {perPageOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SystemSelect>
        </label>
        {totalPages > 1 ? (
          <div className="flex items-center gap-1.5">
            <Button variant="outline"
              type="button"
              onClick={() => onPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              aria-label={ui("Previous page")}
              className="w-10"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
            <bdi dir="ltr" className="min-w-[64px] text-center text-xs font-semibold tabular-nums text-ink-muted">
              {page} / {totalPages}
            </bdi>
            <Button variant="outline"
              type="button"
              onClick={() => onPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              aria-label={ui("Next page")}
              className="w-10"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
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
  const ui = useUiText();
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

  // 44 px icon buttons (R9), the shared IconButton with its own tooltip; quiet on the dark modal header too.
  const toneClass = tone === "dark" ? "text-white/80 actionable-hover:bg-white/20 actionable-hover:text-white" : "text-ink-muted";

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-2xl px-1 py-0.5",
        tone === "dark" ? "bg-white/12" : "bg-muted",
      )}
    >
      <IconButton
        label={ui(`Previous ${noun}`)}
        tooltip={prev ? `${ui(`Previous ${noun}`)}: ${prev.label}` : ui(`First ${noun}`)}
        disabled={!prev}
        onClick={() => prev && onNavigate(prev.id)}
        className={toneClass}
      >
        <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
      </IconButton>
      <bdi
        dir="ltr"
        className={cn(
          "px-1 text-2xs font-bold tabular-nums",
          tone === "dark" ? "text-white/80" : "text-ink-muted",
        )}
      >
        {index + 1}/{sequence.length}
      </bdi>
      <IconButton
        label={ui(`Next ${noun}`)}
        tooltip={next ? `${ui(`Next ${noun}`)}: ${next.label}` : ui(`Last ${noun}`)}
        disabled={!next}
        onClick={() => next && onNavigate(next.id)}
        className={toneClass}
      >
        <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
      </IconButton>
    </div>
  );
}
