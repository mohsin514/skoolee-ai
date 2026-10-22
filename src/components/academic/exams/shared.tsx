"use client";

import { Button } from "@/components/ui/button";
import React from "react";
import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { useUiText } from "@/components/locale/LocaleProvider";
import { CONFLICT_FIXES, CONFLICT_LABELS, type BulkConflict } from "@/lib/academic/exam-conflicts";

/**
 * Pieces the five exam steps share, so the workspace looks like one screen
 * rather than five that happen to sit behind the same tab strip.
 */

export const EXAM_ACCENT = "#8127cf";

/** A soft progress meter. Reads as "x of y", not as a bare percentage. */
export function Meter({
  value,
  total,
  tone = "violet",
  className,
}: {
  value: number;
  total: number;
  tone?: "violet" | "emerald" | "amber" | "rose";
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  // Status tones use the shared status scale (R10); the default keeps the brand gradient.
  const bar =
    tone === "emerald"
      ? "bg-status-success-text"
      : tone === "amber"
      ? "bg-status-warning-text"
      : tone === "rose"
      ? "bg-status-error-text"
      : "bg-gradient-to-r from-primary to-brand-300";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-border-subtle/60", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A labelled number with a meter underneath — the workspace's unit of status. `label`/`suffix` are EN UI keys. */
export function ProgressStat({
  icon: Icon,
  label,
  value,
  total,
  suffix,
  tone = "violet",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  total: number;
  suffix?: string;
  tone?: "violet" | "emerald" | "amber" | "rose";
}) {
  const ui = useUiText();
  const chip =
    tone === "emerald"
      ? "bg-status-success-surface text-status-success-text"
      : tone === "amber"
      ? "bg-status-warning-surface text-status-warning-text"
      : tone === "rose"
      ? "bg-status-error-surface text-status-error-text"
      : "bg-brand-100 text-primary";
  return (
    <div className="sk-panel p-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className={cn("flex h-8 w-8 items-center justify-center rounded-xl", chip)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-none tabular-nums text-ink-strong">
            <bdi dir="ltr">
              {value}
              {total > 0 ? <span className="text-xs font-bold text-ink-subtle"> / {total}</span> : null}
            </bdi>
            {suffix ? <span className="text-xs font-bold text-ink-subtle"> {ui(suffix)}</span> : null}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-ink-muted">
            {ui(label)}
          </p>
        </div>
      </div>
      {total > 0 ? <Meter value={value} total={total} tone={tone} className="mt-2.5" /> : null}
    </div>
  );
}

/**
 * The conflict list.
 *
 * Grouped by kind rather than listed flat, because ten "falls on a weekend"
 * rows are one decision, not ten. Every group carries the fix, so the panel is
 * a worklist instead of a complaint.
 */
export function ConflictPanel({
  conflicts,
  onDismiss,
  compact = false,
}: {
  conflicts: BulkConflict[];
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const ui = useUiText();
  const groups = React.useMemo(() => {
    const map = new Map<string, BulkConflict[]>();
    conflicts.forEach((c) => map.set(c.kind, [...(map.get(c.kind) ?? []), c]));
    return [...map.entries()].sort((a, b) => {
      const aBlocks = a[1].some((c) => c.blocking) ? 0 : 1;
      const bBlocks = b[1].some((c) => c.blocking) ? 0 : 1;
      return aBlocks - bBlocks;
    });
  }, [conflicts]);

  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-status-success-border bg-status-success-surface px-4 py-3">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-status-success-text" />
        <p className="text-xs font-bold text-status-success-text">
          {ui("No conflicts. Every paper sits on a working day with nothing clashing.")}
        </p>
      </div>
    );
  }

  const blocking = conflicts.filter((c) => c.blocking).length;

  return (
    <div className="sk-panel overflow-hidden">
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 py-2.5",
          blocking > 0 ? "bg-status-error-surface" : "bg-status-warning-surface",
        )}
      >
        <AlertTriangle
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0", blocking > 0 ? "text-status-error-text" : "text-status-warning-text")}
        />
        <p className={cn("text-xs font-bold", blocking > 0 ? "text-status-error-text" : "text-status-warning-text")}>
          {blocking > 0
            ? ui(blocking === 1 ? "{0} conflict must be fixed" : "{0} conflicts must be fixed", [blocking])
            : ui(conflicts.length === 1 ? "{0} thing worth checking" : "{0} things worth checking", [conflicts.length])}
        </p>
        {onDismiss ? (
          <Button variant="ghost"
            type="button"
            onClick={onDismiss}
            className="ms-auto"
          >
            {ui("Hide")}
          </Button>
        ) : null}
      </div>

      <div className="divide-y divide-edge/12">
        {groups.map(([kind, items]) => (
          <div key={kind} className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  items.some((i) => i.blocking) ? "bg-status-error-text" : "bg-status-warning-text",
                )}
              />
              <p className="text-2xs font-bold text-ink-strong">
                {ui(CONFLICT_LABELS[kind as keyof typeof CONFLICT_LABELS] ?? kind)}
              </p>
              <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-2xs font-bold tabular-nums text-primary">
                {items.length}
              </span>
            </div>
            {!compact ? (
              <ul className="mt-1.5 space-y-0.5 ps-3.5">
                {items.slice(0, 6).map((c, i) => (
                  <li key={i} className="text-2xs font-semibold leading-snug text-ink-muted">
                    {c.message}
                  </li>
                ))}
                {items.length > 6 ? (
                  <li className="text-2xs font-bold text-ink-subtle">
                    {ui("…and {0} more", [items.length - 6])}
                  </li>
                ) : null}
              </ul>
            ) : null}
            <p className="mt-1.5 flex items-start gap-1.5 ps-3.5 text-2xs font-semibold leading-snug text-primary">
              <Info aria-hidden="true" className="mt-px h-3 w-3 shrink-0" />
              {ui(CONFLICT_FIXES[kind as keyof typeof CONFLICT_FIXES] ?? "Review this paper.")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A dashed placeholder that says what to do next, not just that it is empty. */
export function StepEmpty({
  icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  /** EN UI keys (translated here); already-translated text passes through unchanged. */
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  // R5: one empty state everywhere — the shared EmptyState inside a dashed panel, not a local copy.
  const ui = useUiText();
  return (
    <div className="sk-panel border-dashed">
      <EmptyState icon={icon} title={ui(title)} description={ui(body)} action={action} />
    </div>
  );
}

/** Panel shell — one rounded card, used by every step so they line up. `title`/`subtitle` are EN UI keys
 *  (translated here); already-translated text passes through unchanged. */
export function Panel({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const ui = useUiText();
  return (
    <section
      className={cn(
        "sk-panel overflow-hidden",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-edge/15 bg-gradient-to-r from-surface-subtle to-card px-5 py-3.5">
        {Icon ? (
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100">
            <Icon className="h-4.5 w-4.5 text-primary" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold tracking-tight text-ink-strong">{ui(title)}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs font-normal leading-relaxed text-ink-muted">{ui(subtitle)}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Consistent labelled control. `label`/`hint` are EN UI keys (translated here). */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ui = useUiText();
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block ps-0.5 text-xs font-semibold text-ink-muted">
        {ui(label)}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block ps-0.5 text-2xs font-semibold leading-snug text-ink-subtle">
          {ui(hint)}
        </span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "w-full";

export const selectClass = cn(inputClass, "cursor-pointer");
